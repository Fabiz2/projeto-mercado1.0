mod common;
use common::spawn_server;
use common::BASE_URL;

fn extract_cookie(header: &str, name: &str) -> Option<String> {
    for part in header.split(';') {
        let kv = part.trim();
        if let Some((k, v)) = kv.split_once('=') {
            if k == name { return Some(v.to_string()); }
        }
    }
    None
}

#[tokio::test]
async fn auth_session_flow() {
    let _guard = spawn_server().await;

    // Login admin
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/login", BASE_URL))
        .json(&serde_json::json!({
            "email": "admin@teste.com",
            "senha": "123456"
        }))
        .send()
        .await
        .expect("Falha ao enviar login");
    assert!(resp.status().is_success(), "Login deve retornar 200, veio {}", resp.status());
    let set_cookie = resp.headers().get("set-cookie").and_then(|v| v.to_str().ok()).expect("Header Set-Cookie ausente");
    let sid = extract_cookie(set_cookie, "session_id").expect("session_id não encontrado no cookie");

    // /api/auth/me com cookie
    let me_resp = client
        .get(format!("{}/api/auth/me", BASE_URL))
        .header("cookie", format!("session_id={}", sid))
        .send()
        .await
        .expect("Falha ao chamar /api/auth/me");
    assert!(me_resp.status().is_success(), "auth/me deve retornar 200, veio {}", me_resp.status());

    // Logout
    let lo_resp = client
        .post(format!("{}/api/logout", BASE_URL))
        .header("cookie", format!("session_id={}", sid))
        .send()
        .await
        .expect("Falha ao chamar /api/logout");
    assert!(lo_resp.status().is_success(), "logout deve retornar 200, veio {}", lo_resp.status());

    // auth/me novamente deve 401
    let me_resp2 = client
        .get(format!("{}/api/auth/me", BASE_URL))
        .header("cookie", format!("session_id={}", sid))
        .send()
        .await
        .expect("Falha ao chamar /api/auth/me depois do logout");
    assert_eq!(me_resp2.status().as_u16(), 401, "auth/me pós-logout deve retornar 401, veio {}", me_resp2.status());
}