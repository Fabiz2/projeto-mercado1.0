use axum::{
    extract::State,
    response::{IntoResponse, Json, Response, Redirect},
    http::{StatusCode, HeaderMap},
};
use axum::http::header::SET_COOKIE;
use axum::middleware::Next;
use axum::body::Body;
use axum::http::Request;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{Row};
use uuid::Uuid;

use crate::AppState;

#[derive(Serialize, Deserialize, Debug)]
pub struct Usuario {
    pub id: i64,
    pub nome: String,
    pub email: String,
}

#[derive(Deserialize)]
pub struct RegisterInput {
    pub nome: String,
    pub email: String,
    pub senha: String,
}

#[derive(Deserialize)]
pub struct LoginInput {
    pub email: String,
    pub senha: String,
}

pub async fn register_user(State(app_state): State<AppState>, Json(input): Json<RegisterInput>) -> impl IntoResponse {
    let nome = input.nome.trim();
    let email = input.email.trim();
    let senha = input.senha.trim();

    if nome.is_empty() || email.is_empty() || senha.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"erro": "Dados inválidos"}))).into_response();
    }

    match sqlx::query("SELECT 1 FROM usuarios WHERE email = ? LIMIT 1")
        .bind(email)
        .fetch_optional(&app_state.db)
        .await
    {
        Ok(Some(_)) => {
            return (StatusCode::BAD_REQUEST, Json(json!({"erro": "E-mail já cadastrado"}))).into_response();
        }
        Ok(None) => {}
        Err(e) => {
            eprintln!("[auth] Erro ao verificar email: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"erro": "Erro interno"}))).into_response();
        }
    }

    let hash = match bcrypt::hash(senha, 12) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("[auth] Erro ao gerar hash: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"erro": "Erro interno"}))).into_response();
        }
    };

    match sqlx::query("INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)")
        .bind(nome)
        .bind(email)
        .bind(hash)
        .execute(&app_state.db)
        .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({"status": "ok", "mensagem": "Usuário cadastrado com sucesso"}))).into_response(),
        Err(e) => {
            eprintln!("[auth] Erro ao salvar usuário: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"erro": "Erro interno"}))).into_response()
        }
    }
}

pub async fn login_user(State(app_state): State<AppState>, Json(input): Json<LoginInput>) -> impl IntoResponse {
    let email = input.email.trim();
    let senha = input.senha.trim();

    // Buscar usuário
    let row = match sqlx::query("SELECT id, nome, email, senha_hash FROM usuarios WHERE email = ? LIMIT 1")
        .bind(email)
        .fetch_optional(&app_state.db)
        .await
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[auth] Erro ao buscar usuário: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"erro": "Erro interno"}))).into_response();
        }
    };

    if row.is_none() {
        return (StatusCode::NOT_FOUND, Json(json!({"erro": "Usuário não encontrado"}))).into_response();
    }
    let row = row.unwrap();
    let id: i64 = row.try_get("id").unwrap_or(0);
    let nome: String = row.try_get("nome").unwrap_or_default();
    let email_db: String = row.try_get("email").unwrap_or_default();
    let senha_hash: String = row.try_get("senha_hash").unwrap_or_default();

    match bcrypt::verify(senha, &senha_hash) {
        Ok(true) => {
            // Limpar sessões expiradas
            let _ = cleanup_sessions(&app_state).await;

            // Criar sessão de 24h
            let sid = Uuid::new_v4().to_string();
            let ins = sqlx::query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now','+1 day'))")
                .bind(&sid)
                .bind(id)
                .execute(&app_state.db)
                .await;
            if let Err(e) = ins {
                eprintln!("[auth] Erro ao criar sessão: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"erro": "Erro interno"}))).into_response();
            }
            println!("Sessão criada para usuário {}: {}", id, sid);

            let cookie = format!("session_id={}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400", sid);
            let usuario = Usuario { id, nome, email: email_db };
            (StatusCode::OK, [(SET_COOKIE, cookie)], Json(json!({"autenticado": true, "usuario": usuario}))).into_response()
        }
        Ok(false) => (StatusCode::UNAUTHORIZED, Json(json!({"autenticado": false, "erro": "Senha incorreta"}))).into_response(),
        Err(e) => {
            eprintln!("[auth] Erro ao verificar hash: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"erro": "Erro interno"}))).into_response()
        }
    }
}

pub async fn list_users(State(app_state): State<AppState>) -> impl IntoResponse {
    let rows = match sqlx::query("SELECT id, nome, email FROM usuarios ORDER BY id")
        .fetch_all(&app_state.db)
        .await
    {
        Ok(rs) => rs,
        Err(e) => {
            eprintln!("[auth] Erro ao listar usuários: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"erro": "Erro interno"}))).into_response();
        }
    };

    let mut users: Vec<Usuario> = Vec::new();
    for row in rows {
        let id: i64 = row.try_get("id").unwrap_or(0);
        let nome: String = row.try_get("nome").unwrap_or_default();
        let email: String = row.try_get("email").unwrap_or_default();
        users.push(Usuario { id, nome, email });
    }
    Json(users).into_response()
}

// Middleware global de autenticação
pub async fn auth_middleware(State(app_state): State<AppState>, mut req: Request<Body>, next: Next) -> Response {
    let path = req.uri().path();
    // Rotas públicas
    let is_public = path == "/health"
        || path == "/api/login"
        || path == "/api/register"
        || path == "/login";

    if is_public {
        return next.run(req).await;
    }

    // Ler cookie
    let cookie = req
        .headers()
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let session_id = extract_cookie(cookie, "session_id");

    // Verificação de sessão
    if let Some(sid) = session_id {
        let row = sqlx::query("SELECT user_id FROM sessions WHERE id = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) LIMIT 1")
            .bind(&sid)
            .fetch_optional(&app_state.db)
            .await;

        match row {
            Ok(Some(r)) => {
                let user_id: i64 = r.try_get("user_id").unwrap_or(0);
                req.extensions_mut().insert(user_id);
                return next.run(req).await;
            }
            Ok(None) => {}
            Err(e) => {
                eprintln!("[auth] Erro ao verificar sessão: {}", e);
            }
        }
    }

    // Não autenticado
    if path.starts_with("/api/") {
        return (StatusCode::UNAUTHORIZED, Json(json!({"erro":"não autenticado"}))).into_response();
    }
    Redirect::to("/login").into_response()
}

fn extract_cookie(cookie: &str, name: &str) -> Option<String> {
    for part in cookie.split(';') {
        let kv = part.trim();
        if let Some((k, v)) = kv.split_once('=') {
            if k == name {
                return Some(v.to_string());
            }
        }
    }
    None
}

// Limpa sessões expiradas
async fn cleanup_sessions(app_state: &AppState) -> Result<(), sqlx::Error> {
    let _ = sqlx::query("DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP")
        .execute(&app_state.db)
        .await?;
    Ok(())
}

// Retorna usuário autenticado
pub async fn auth_me(State(app_state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let cookie = headers.get("cookie").and_then(|v| v.to_str().ok()).unwrap_or("");
    let sid = match extract_cookie(cookie, "session_id") { Some(s) => s, None => {
        return (StatusCode::UNAUTHORIZED, Json(json!({"erro":"não autenticado"}))).into_response();
    }};

    let row = match sqlx::query("SELECT u.id, u.nome, u.email FROM sessions s JOIN usuarios u ON u.id = s.user_id WHERE s.id = ? AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP) LIMIT 1")
        .bind(&sid)
        .fetch_optional(&app_state.db)
        .await {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[auth] Erro ao consultar sessão: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"erro":"Erro interno"}))).into_response();
            }
        };
    if let Some(r) = row {
        let id: i64 = r.try_get("id").unwrap_or(0);
        let nome: String = r.try_get("nome").unwrap_or_default();
        let email: String = r.try_get("email").unwrap_or_default();
        return (StatusCode::OK, Json(json!({"usuario": Usuario{ id, nome, email }}))).into_response();
    }
    (StatusCode::UNAUTHORIZED, Json(json!({"erro":"não autenticado"}))).into_response()
}

// Logout: remove sessão e limpa cookie
pub async fn logout(State(app_state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let cookie = headers.get("cookie").and_then(|v| v.to_str().ok()).unwrap_or("");
    if let Some(sid) = extract_cookie(cookie, "session_id") {
        let _ = sqlx::query("DELETE FROM sessions WHERE id = ?")
            .bind(&sid)
            .execute(&app_state.db)
            .await;
        println!("Sessão {} encerrada", sid);
    }
    let clear = "session_id=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0".to_string();
    (StatusCode::OK, [(SET_COOKIE, clear)], Json(json!({"status":"ok","mensagem":"Sessão encerrada com sucesso"}))).into_response()
}