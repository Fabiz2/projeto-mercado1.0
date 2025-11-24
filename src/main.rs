/*
DEMONSTRAÇÃO DE PROGRAMAÇÃO ORIENTADA A OBJETOS EM RUST

Este projeto demonstra os principais conceitos de OOP adaptados para Rust:

1. ENCAPSULAMENTO:
   - Método `line_total()` em `CartItem` encapsula a lógica de cálculo
   - Dados e comportamentos ficam juntos na mesma estrutura

2. POLIMORFISMO:
   - Trait `Pagamento` define um contrato comum
   - Structs `Pix` e `Cartao` implementam o trait de formas diferentes
   - Permite tratar diferentes tipos de pagamento de forma uniforme

3. HERANÇA (Simulada via Traits):
   - Rust não tem herança clássica, mas traits oferecem funcionalidade similar
   - Múltiplos tipos podem implementar o mesmo trait
   - Permite reutilização de código e polimorfismo

4. COESÃO:
   - Cada struct tem uma responsabilidade única e bem definida
   - `Pix` e `Cartao` focam apenas em processamento de pagamento
*/

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{Json, IntoResponse, Response},
    routing::{get, post, patch, delete},
    Router,
    middleware,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::Arc,
};
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use uuid::Uuid;
use sqlx::{SqlitePool, Row};
use sqlx::sqlite::{SqlitePoolOptions, SqliteConnectOptions};
use std::str::FromStr;
use std::{fs, env};
use regex::Regex;

// Taxa de juros simples mensal para parcelamento a partir da 3ª parcela
const JUROS_A_M: f64 = 0.02; // 2% a.m.

// Estado global do carrinho
type CartState = Arc<RwLock<HashMap<u32, CartItem>>>;

// Estado da aplicação incluindo carrinho e pool do banco
#[derive(Clone)]
pub(crate) struct AppState {
    cart: CartState,
    db: SqlitePool,
}

// Inicializa o banco SQLite e cria tabelas se não existirem
async fn init_db() -> Result<SqlitePool, sqlx::Error> {
    // Garantir diretório data/ baseado no diretório atual
    let base = env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let data_dir = base.join("data");
    let _ = fs::create_dir_all(&data_dir);

    // Caminho absoluto para o arquivo do banco com barras para compatibilidade
    let db_path = data_dir.join("mercado.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy().replace('\\', "/"));

    // Conectar (cria data/mercado.db se não existir)
    let connect_opts = SqliteConnectOptions::from_str(&db_url)
        .map_err(|e| sqlx::Error::Configuration(Box::new(e)))?
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_opts)
        .await?;

    // Criar tabelas mínimas
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS pedidos (
            id TEXT PRIMARY KEY,
            total_cents INTEGER NOT NULL,
            payment_method TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS itens_pedido (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pedido_id TEXT NOT NULL,
            product_id INTEGER NOT NULL,
            qty INTEGER NOT NULL,
            unit_price_cents INTEGER NOT NULL
        );
        "#,
    )
    .execute(&pool)
    .await?;

    // Migração leve: adicionar colunas se não existirem (idempotente)
    ensure_column(&pool, "pedidos", "payment_installments", "ALTER TABLE pedidos ADD COLUMN payment_installments INTEGER NULL").await?;
    ensure_column(&pool, "pedidos", "interest_cents", "ALTER TABLE pedidos ADD COLUMN interest_cents INTEGER NOT NULL DEFAULT 0").await?;
    ensure_column(&pool, "pedidos", "total_with_interest_cents", "ALTER TABLE pedidos ADD COLUMN total_with_interest_cents INTEGER NOT NULL DEFAULT 0").await?;

    // Tabela de usuários (autenticação)
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            senha_hash TEXT NOT NULL
        );
        "#,
    )
    .execute(&pool)
    .await?;

    // Tabela de sessões (persistência server-side)
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP
        );
        "#,
    )
    .execute(&pool)
    .await?;

    // Criar usuário admin fixo se não existir
    let exists_admin = sqlx::query("SELECT 1 FROM usuarios WHERE email = ? LIMIT 1")
        .bind("admin@teste.com")
        .fetch_optional(&pool)
        .await?;
    if exists_admin.is_none() {
        let hash = match bcrypt::hash("123456", 12) {
            Ok(h) => h,
            Err(_) => {
                // Fallback simples: sem hash (não recomendado), mas evitar travar init
                // Porém, como requisito pede bcrypt, se falhar, apenas loga e segue.
                eprintln!("[auth] Falha ao gerar hash bcrypt para admin");
                "123456".to_string()
            }
        };
        let _ = sqlx::query("INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)")
            .bind("Admin")
            .bind("admin@teste.com")
            .bind(&hash)
            .execute(&pool)
            .await;
        println!("Usuário admin@teste.com criado automaticamente");
    }

    Ok(pool)
}

// Verifica se a coluna existe e adiciona se estiver ausente
async fn ensure_column(pool: &SqlitePool, table: &str, column: &str, alter_sql: &str) -> Result<(), sqlx::Error> {
    let rows = sqlx::query(&format!("PRAGMA table_info({});", table))
        .fetch_all(pool)
        .await?;
    let mut exists = false;
    for row in rows {
        let name: String = row.try_get("name").unwrap_or_default();
        if name == column { exists = true; break; }
    }
    if !exists {
        let _ = sqlx::query(alter_sql).execute(pool).await?;
    }
    Ok(())
}

#[tokio::main]
async fn main() {
    // Estado compartilhado do carrinho
    let cart_state: CartState = Arc::new(RwLock::new(HashMap::new()));

    // Inicializar banco SQLite
    let db_pool = init_db()
        .await
        .expect("Falha ao inicializar banco SQLite");

    let app_state = AppState { cart: cart_state.clone(), db: db_pool.clone() };

    // Configuração CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Rotas públicas (sem autenticação)
    let public = Router::new()
        .route("/health", get(health_check))
        .route("/api/register", post(auth::register_user))
        .route("/api/login", post(auth::login_user))
        .route("/api/products", get(get_products))
        .route("/api/cart", post(add_to_cart).get(get_cart))
        .route("/api/cart/:product_id", patch(update_cart_item))
        .route("/api/cart/clear", delete(clear_cart))
        .route("/api/checkout", post(checkout))
        .route("/login", get(login_page));

    // Rotas protegidas (middleware de autenticação)
    let protected = Router::new()
        .route("/api/users", get(auth::list_users))
        .route("/api/pedidos", get(list_pedidos))
        .route("/api/pedidos/:id/itens", get(list_itens_do_pedido))
        .route("/api/reports/daily", get(reports_daily))
        .route("/api/auth/me", get(auth::auth_me))
        .route("/api/logout", post(auth::logout))
        // Todas páginas estáticas protegidas
        .nest_service("/", ServeDir::new("."))
        .layer(middleware::from_fn_with_state(app_state.clone(), auth::auth_middleware));

    let app = public
        .merge(protected)
        .with_state(app_state)
        .layer(cors);

    // Servidor
    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));
    println!("Servidor rodando em http://127.0.0.1:8080");
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

mod auth;

// Modelos
#[derive(Serialize, Deserialize, Clone)]
struct Product {
    id: u32,
    name: String,
    price_cents: u32,
    image_url: Option<String>,
    stock: u32,
}

#[derive(Serialize, Deserialize, Clone)]
struct CartItem {
    product_id: u32,
    name: String,
    unit_price_cents: u32,
    qty: u32,
    line_total_cents: u32,
}

// ENCAPSULAMENTO: Método encapsulado para calcular total da linha
impl CartItem {
    /// Calcula o total da linha (preço unitário × quantidade)
    /// Demonstra encapsulamento: lógica de cálculo fica dentro da struct
    fn line_total(&self) -> u32 {
        self.unit_price_cents * self.qty
    }
}

#[derive(Serialize, Deserialize)]
struct CartSummary {
    items: Vec<CartItem>,
    subtotal_cents: u32,
    shipping_cents: u32,
    total_cents: u32,
}

#[derive(Deserialize)]
struct AddToCartRequest {
    product_id: u32,
    qty: u32,
}

#[derive(Deserialize)]
struct UpdateCartRequest {
    qty: u32,
}

#[derive(Serialize)]
struct CheckoutResponse {
    order_id: String,
    status: String,
    total_cents: u32,
    message: String,
    items: Vec<CartItem>,
    mensagem_pagamento: Option<String>, // Novo campo para mensagem de pagamento
    // Campos estendidos para parcelamento/juros (compatíveis com front)
    payment_method: Option<String>,
    installments: Option<u8>,
    interest_cents: Option<u64>,
    total_with_interest_cents: Option<u64>,
    installment_value_cents: Option<u64>,
}

#[derive(Serialize)]
struct ApiError {
    error: String,
    message: String,
    code: u16,
    field: Option<String>,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = StatusCode::from_u16(self.code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        // Para casos específicos, retornar payload minimalista conforme requisito
        if self.code == 400 {
            return (status, Json(json!({"error": self.message}))).into_response();
        }
        if self.code == 422 {
            return (status, Json(json!({"error": self.message}))).into_response();
        }
        (status, Json(self)).into_response()
    }
}

impl ApiError {
    fn new(code: u16, error: &str, message: &str) -> Self {
        Self {
            error: error.to_string(),
            message: message.to_string(),
            code,
            field: None,
        }
    }
    
    fn bad_request(message: &str) -> Self {
        Self::new(400, "Bad Request", message)
    }
    
    fn not_found(message: &str) -> Self {
        Self::new(404, "Not Found", message)
    }
    
    fn internal_server_error(message: &str) -> Self {
        Self::new(500, "Internal Server Error", message)
    }

    fn validation_error(field: &str, message: &str) -> Self {
        Self { error: "Unprocessable Entity".to_string(), message: message.to_string(), code: 422, field: Some(field.to_string()) }
    }
}

// Resultado do processamento de pagamento com breakdown
#[derive(Clone, Debug)]
struct PaymentResult {
    installments: Option<u8>,
    interest_cents: u64,
    total_with_interest_cents: u64,
    installment_value_cents: Option<u64>,
    message: String,
}

// POLIMORFISMO: Trait que define contrato comum para diferentes métodos de pagamento
// Em Rust, traits substituem herança clássica, permitindo polimorfismo
trait Pagamento: Send {
    fn processar(&self, valor_cents: u64, installments: Option<u8>) -> PaymentResult;
}

// Utilitário simples para formatar valores em BRL a partir de centavos
fn format_brl(cents: u32) -> String {
    let reais = cents as f64 / 100.0;
    let s = format!("R$ {:.2}", reais);
    s.replace('.', ",")
}

// COESÃO: Struct com responsabilidade única - pagamento via PIX
struct Pix;

// POLIMORFISMO: Implementação específica para PIX
impl Pagamento for Pix {
    fn processar(&self, valor_cents: u64, _installments: Option<u8>) -> PaymentResult {
        PaymentResult {
            installments: None,
            interest_cents: 0,
            total_with_interest_cents: valor_cents,
            installment_value_cents: None,
            message: format!("Pago {} via PIX", format_brl(valor_cents as u32)),
        }
    }
}

// COESÃO: Struct com responsabilidade única - pagamento via Cartão
struct Cartao;

// POLIMORFISMO: Implementação específica para Cartão
impl Pagamento for Cartao {
    fn processar(&self, valor_cents: u64, installments: Option<u8>) -> PaymentResult {
        let n = installments.unwrap_or(1);
        let mut total_final = valor_cents as f64;
        // Juros simples somente a partir da 3ª parcela
        if n >= 3 {
            let meses_com_juros = (n - 2) as f64;
            total_final = (valor_cents as f64) * (1.0 + JUROS_A_M * meses_com_juros);
        }
        // Arredondar para centavos corretamente
        let total_with_interest_cents = total_final.round() as u64;
        let interest_cents = if total_with_interest_cents > valor_cents { total_with_interest_cents - valor_cents } else { 0 };
        // ceil(total/n) em centavos
        let installment_value_cents = Some((total_with_interest_cents + n as u64 - 1) / n as u64);

        PaymentResult {
            installments: Some(n),
            interest_cents,
            total_with_interest_cents,
            installment_value_cents,
            message: format!("Pago {} via Cartão", format_brl(valor_cents as u32)),
        }
    }
}

// Função auxiliar para escolher método de pagamento
fn escolher_pagamento(metodo: &str) -> Box<dyn Pagamento + Send> {
    match metodo {
        "pix" => Box::new(Pix),
        "credit" => Box::new(Cartao),
        _ => Box::new(Pix), // Default para PIX
    }
}

// Endpoint de health check
async fn health_check() -> Json<Value> {
    Json(json!({"ok": true}))
}

// Página pública de login simples
async fn login_page() -> Response {
    match fs::read_to_string("login.html") {
        Ok(contents) => (StatusCode::OK, [("content-type", "text/html; charset=utf-8")], contents).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "login.html não encontrado").into_response(),
    }
}

// Endpoint para listar produtos
async fn get_products() -> Json<Vec<Product>> {
    let products = vec![
        Product { id: 1, name: "Arroz 1kg".to_string(), price_cents: 799, image_url: Some("images/arroz.png".to_string()), stock: 50 },
        Product { id: 2, name: "Feijão 1kg".to_string(), price_cents: 899, image_url: Some("images/feijao.png".to_string()), stock: 50 },
        Product { id: 3, name: "Macarrão 500g".to_string(), price_cents: 599, image_url: Some("images/macarrao.png".to_string()), stock: 60 },
        Product { id: 4, name: "Leite 1L".to_string(), price_cents: 549, image_url: Some("images/leite.png".to_string()), stock: 70 },
        Product { id: 5, name: "Café 500g".to_string(), price_cents: 1899, image_url: Some("images/cafe.png".to_string()), stock: 40 },
        Product { id: 6, name: "Açúcar 1kg".to_string(), price_cents: 489, image_url: Some("images/açucar.png".to_string()), stock: 80 },
        Product { id: 7, name: "Óleo 900ml".to_string(), price_cents: 999, image_url: Some("images/oleo.png".to_string()), stock: 50 },
        Product { id: 8, name: "Biscoito 200g".to_string(), price_cents: 399, image_url: Some("images/biscoito.png".to_string()), stock: 90 },
        Product { id: 9, name: "Molho de Tomate 340g".to_string(), price_cents: 499, image_url: Some("images/molho de tomate.png".to_string()), stock: 70 },
        Product { id: 10, name: "Farinha de Trigo 1kg".to_string(), price_cents: 699, image_url: Some("images/farinha de trigo.png".to_string()), stock: 60 },
        Product { id: 11, name: "Sal 1kg".to_string(), price_cents: 299, image_url: Some("images/sal.png".to_string()), stock: 100 },
        Product { id: 12, name: "Manteiga 200g".to_string(), price_cents: 1299, image_url: Some("images/manteiga.png".to_string()), stock: 40 },
        Product { id: 13, name: "Queijo Mussarela 200g".to_string(), price_cents: 1599, image_url: Some("images/queijo mussarela.png".to_string()), stock: 35 },
        Product { id: 14, name: "Presunto 200g".to_string(), price_cents: 1399, image_url: Some("images/presunto.png".to_string()), stock: 35 },
        Product { id: 15, name: "Refrigerante 2L".to_string(), price_cents: 999, image_url: Some("images/refrigerante.png".to_string()), stock: 80 },
        Product { id: 16, name: "Água Mineral 1.5L".to_string(), price_cents: 399, image_url: Some("images/agua.png".to_string()), stock: 120 },
        Product { id: 17, name: "Suco 1L".to_string(), price_cents: 699, image_url: Some("images/suco.png".to_string()), stock: 70 },
        Product { id: 18, name: "Cereal 300g".to_string(), price_cents: 1499, image_url: Some("images/cereal.png".to_string()), stock: 40 },
        Product { id: 19, name: "Chocolate 100g".to_string(), price_cents: 799, image_url: Some("images/chocolate.png".to_string()), stock: 50 },
        Product { id: 20, name: "Arroz Integral 1kg".to_string(), price_cents: 999, image_url: Some("images/arroz integral.png".to_string()), stock: 45 },
    ];
    
    Json(products)
}

// Função auxiliar para obter produtos
fn get_product_by_id(id: u32) -> Option<Product> {
    let products = vec![
        Product { id: 1, name: "Arroz 1kg".to_string(), price_cents: 799, image_url: Some("images/arroz.png".to_string()), stock: 50 },
        Product { id: 2, name: "Feijão 1kg".to_string(), price_cents: 899, image_url: Some("images/feijao.png".to_string()), stock: 50 },
        Product { id: 3, name: "Macarrão 500g".to_string(), price_cents: 599, image_url: Some("images/macarrao.png".to_string()), stock: 60 },
        Product { id: 4, name: "Leite 1L".to_string(), price_cents: 549, image_url: Some("images/leite.png".to_string()), stock: 70 },
        Product { id: 5, name: "Café 500g".to_string(), price_cents: 1899, image_url: Some("images/cafe.png".to_string()), stock: 40 },
        Product { id: 6, name: "Açúcar 1kg".to_string(), price_cents: 489, image_url: Some("images/açucar.png".to_string()), stock: 80 },
        Product { id: 7, name: "Óleo 900ml".to_string(), price_cents: 999, image_url: Some("images/oleo.png".to_string()), stock: 50 },
        Product { id: 8, name: "Biscoito 200g".to_string(), price_cents: 399, image_url: Some("images/biscoito.png".to_string()), stock: 90 },
        Product { id: 9, name: "Molho de Tomate 340g".to_string(), price_cents: 499, image_url: Some("images/molho de tomate.png".to_string()), stock: 70 },
        Product { id: 10, name: "Farinha de Trigo 1kg".to_string(), price_cents: 699, image_url: Some("images/farinha de trigo.png".to_string()), stock: 60 },
        Product { id: 11, name: "Sal 1kg".to_string(), price_cents: 299, image_url: Some("images/sal.png".to_string()), stock: 100 },
        Product { id: 12, name: "Manteiga 200g".to_string(), price_cents: 1299, image_url: Some("images/manteiga.png".to_string()), stock: 40 },
        Product { id: 13, name: "Queijo Mussarela 200g".to_string(), price_cents: 1599, image_url: Some("images/queijo mussarela.png".to_string()), stock: 35 },
        Product { id: 14, name: "Presunto 200g".to_string(), price_cents: 1399, image_url: Some("images/presunto.png".to_string()), stock: 35 },
        Product { id: 15, name: "Refrigerante 2L".to_string(), price_cents: 999, image_url: Some("images/refrigerante.png".to_string()), stock: 80 },
        Product { id: 16, name: "Água Mineral 1.5L".to_string(), price_cents: 399, image_url: Some("images/agua.png".to_string()), stock: 120 },
        Product { id: 17, name: "Suco 1L".to_string(), price_cents: 699, image_url: Some("images/suco.png".to_string()), stock: 70 },
        Product { id: 18, name: "Cereal 300g".to_string(), price_cents: 1499, image_url: Some("images/cereal.png".to_string()), stock: 40 },
        Product { id: 19, name: "Chocolate 100g".to_string(), price_cents: 799, image_url: Some("images/chocolate.png".to_string()), stock: 50 },
        Product { id: 20, name: "Arroz Integral 1kg".to_string(), price_cents: 999, image_url: Some("images/arroz integral.png".to_string()), stock: 45 },
    ];
    
    products.into_iter().find(|p| p.id == id)
}

// Endpoint para adicionar item ao carrinho
async fn add_to_cart(
    State(app_state): State<AppState>,
    Json(request): Json<AddToCartRequest>,
) -> Result<Json<Value>, ApiError> {
    let cart_state = app_state.cart.clone();
    if request.qty == 0 {
        return Err(ApiError::bad_request("Quantidade deve ser maior que zero"));
    }

    let product = get_product_by_id(request.product_id)
        .ok_or_else(|| ApiError::not_found("Produto não encontrado"))?;

    // Verificar se há estoque suficiente
    if product.stock < request.qty {
        return Err(ApiError::bad_request("Estoque insuficiente"));
    }

    let mut cart = cart_state.write().await;
    
    let line_total = product.price_cents * request.qty;
    
    if let Some(existing_item) = cart.get_mut(&request.product_id) {
        existing_item.qty += request.qty;
        existing_item.line_total_cents = existing_item.unit_price_cents * existing_item.qty;
    } else {
        let cart_item = CartItem {
            product_id: product.id,
            name: product.name,
            unit_price_cents: product.price_cents,
            qty: request.qty,
            line_total_cents: line_total,
        };
        cart.insert(request.product_id, cart_item);
    }

    Ok(Json(json!({"message": "Item adicionado ao carrinho"})))
}

// Endpoint para obter resumo do carrinho
async fn get_cart(State(app_state): State<AppState>) -> Json<CartSummary> {
    let cart_state = app_state.cart.clone();
    let cart = cart_state.read().await;
    let items: Vec<CartItem> = cart.values().cloned().collect();
    
    let subtotal_cents: u32 = items.iter().map(|item| item.line_total_cents).sum();
    let shipping_cents = 0;
    let total_cents = subtotal_cents + shipping_cents;
    
    let summary = CartSummary {
        items,
        subtotal_cents,
        shipping_cents,
        total_cents,
    };
    
    Json(summary)
}

// Endpoint para atualizar quantidade de item no carrinho
async fn update_cart_item(
    State(app_state): State<AppState>,
    Path(product_id): Path<u32>,
    Json(request): Json<UpdateCartRequest>,
) -> Result<Json<Value>, ApiError> {
    let cart_state = app_state.cart.clone();
    let mut cart = cart_state.write().await;
    
    if request.qty == 0 {
        // Remove o item se quantidade for 0
        cart.remove(&product_id);
        return Ok(Json(json!({"message": "Item removido do carrinho"})));
    }
    
    // Verificar se o produto existe e tem estoque suficiente
    let product = get_product_by_id(product_id)
        .ok_or_else(|| ApiError::not_found("Produto não encontrado"))?;
    
    if product.stock < request.qty {
        return Err(ApiError::bad_request("Estoque insuficiente"));
    }
    
    if let Some(item) = cart.get_mut(&product_id) {
        item.qty = request.qty;
        item.line_total_cents = item.unit_price_cents * item.qty;
        Ok(Json(json!({"message": "Quantidade atualizada"})))
    } else {
        Err(ApiError::not_found("Produto não encontrado no carrinho"))
    }
}

// Endpoint para limpar carrinho
async fn clear_cart(State(app_state): State<AppState>) -> Json<Value> {
    let cart_state = app_state.cart.clone();
    let mut cart = cart_state.write().await;
    cart.clear();
    Json(json!({"message": "Carrinho limpo com sucesso"}))
}

#[derive(Deserialize, Debug)]
struct CheckoutPaymentInput {
    method: String,
    installments: Option<u8>,
}

#[derive(Deserialize, Debug)]
struct CheckoutInput {
    payment_method: Option<String>,
    payment: Option<CheckoutPaymentInput>,
    customer_email: Option<String>,
}

// Endpoint de checkout (estendido)
async fn checkout(State(app_state): State<AppState>, Json(input): Json<CheckoutInput>) -> Result<Json<CheckoutResponse>, ApiError> {
    let cart_state = app_state.cart.clone();
    let db = app_state.db.clone();
    let mut cart = cart_state.write().await;
    
    // Validar se o carrinho não está vazio
    if cart.is_empty() {
        return Err(ApiError::bad_request("Carrinho está vazio"));
    }

    // Validar formato de e-mail (backend) com regex simples
    if let Some(email) = input.customer_email.as_ref() {
        let trimmed = email.trim();
        let email_regex = Regex::new(r"^[^\s@]+@[^\s@]+\.[^\s@]+$").unwrap();
        if !email_regex.is_match(trimmed) {
            return Err(ApiError::validation_error("email", "Formato de e-mail inválido"));
        }
    } else {
        // Ausência de e-mail: tratar como inválido conforme requisito
        return Err(ApiError::validation_error("email", "Formato de e-mail inválido"));
    }
    
    // Capturar itens do carrinho antes de limpar
    let items: Vec<CartItem> = cart.values().cloned().collect();
    
    // ENCAPSULAMENTO: Usar método line_total() em vez de acessar campo diretamente
    let total_cents: u32 = cart.values().map(|item| item.line_total()).sum();
    
    // Determinar método e parcelas a partir do request (compatibilidade com contrato antigo)
    let metodo_pagamento = input.payment.as_ref().map(|p| p.method.clone())
        .or_else(|| input.payment_method.clone())
        .unwrap_or_else(|| if total_cents > 5000 { "credit".to_string() } else { "pix".to_string() });

    let mut installments: Option<u8> = input.payment.as_ref().and_then(|p| p.installments);

    // Validação de parcelas
    if metodo_pagamento == "credit" {
        let n = installments.unwrap_or(1);
        if n == 0 || n > 12 {
            return Err(ApiError::new(422, "Unprocessable Entity", "Parcelas inválidas para cartão (1..=12)"));
        }
        installments = Some(n);
    } else {
        // PIX ignora parcelas
        installments = None;
    }

    let processador_pagamento = escolher_pagamento(&metodo_pagamento);
    let pr = processador_pagamento.processar(total_cents as u64, installments);
    let mensagem_pagamento = pr.message.clone();
    
    // Gerar UUID para o pedido
    let order_id = Uuid::new_v4().to_string();

    // Persistir pedido e itens no SQLite (auditoria)
    // Inserir na tabela pedidos
    if let Err(e) = sqlx::query(
        "INSERT INTO pedidos (id, total_cents, payment_method, payment_installments, interest_cents, total_with_interest_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
    )
    .bind(&order_id)
    .bind(total_cents as i64)
    .bind(&metodo_pagamento)
    .bind(pr.installments.map(|x| x as i64))
    .bind(pr.interest_cents as i64)
    .bind(pr.total_with_interest_cents as i64)
    .execute(&db)
    .await
    {
        eprintln!("Erro ao salvar pedido: {}", e);
    } else {
        // Inserir itens do pedido
        for item in &items {
            if let Err(e) = sqlx::query(
                "INSERT INTO itens_pedido (pedido_id, product_id, qty, unit_price_cents) VALUES (?, ?, ?, ?)",
            )
            .bind(&order_id)
            .bind(item.product_id as i64)
            .bind(item.qty as i64)
            .bind(item.unit_price_cents as i64)
            .execute(&db)
            .await
            {
                eprintln!("Erro ao salvar item do pedido: {}", e);
            }
        }
        println!("Pedido {} salvo em pedidos + itens_pedido", order_id);
    }
    
    // Limpar o carrinho após o checkout
    cart.clear();
    
    Ok(Json(CheckoutResponse {
        order_id,
        status: "paid".to_string(),
        total_cents,
        message: "Pedido processado com sucesso".to_string(),
        items,
        mensagem_pagamento: Some(mensagem_pagamento),
        payment_method: Some(metodo_pagamento),
        installments: pr.installments,
        interest_cents: Some(pr.interest_cents),
        total_with_interest_cents: Some(pr.total_with_interest_cents),
        installment_value_cents: pr.installment_value_cents,
    }))
}

// Relatório simples diário: totais por dia e método de pagamento
#[derive(Serialize)]
struct DailyReportRow {
    dia: String,
    metodo: String,
    total_cents: i64,
}

async fn reports_daily(State(app_state): State<AppState>) -> Result<Json<Vec<DailyReportRow>>, ApiError> {
    let db = app_state.db.clone();
    let rows = sqlx::query(
        r#"SELECT DATE(created_at) AS dia, payment_method AS metodo, SUM(total_cents) AS total_cents
           FROM pedidos
           GROUP BY 1,2
           ORDER BY 1 DESC"#,
    )
    .fetch_all(&db)
    .await
    .map_err(|e| ApiError::internal_server_error(&format!("Erro no relatório: {}", e)))?;

    let mut result = Vec::new();
    for row in rows {
        let dia: String = row.try_get("dia").unwrap_or_default();
        let metodo: String = row.try_get("metodo").unwrap_or_default();
        let total_cents: i64 = row.try_get("total_cents").unwrap_or(0);
        result.push(DailyReportRow { dia, metodo, total_cents });
    }

    Ok(Json(result))
}

// Listar pedidos salvos (auditoria)
#[derive(Serialize)]
struct PedidoRow {
    id: String,
    total_cents: i64,
    payment_method: String,
    created_at: String,
}

async fn list_pedidos(State(app_state): State<AppState>) -> Result<Json<Vec<PedidoRow>>, ApiError> {
    let db = app_state.db.clone();
    let rows = sqlx::query(
        r#"SELECT id, total_cents, payment_method, created_at FROM pedidos ORDER BY created_at DESC"#,
    )
    .fetch_all(&db)
    .await
    .map_err(|e| ApiError::internal_server_error(&format!("Erro ao listar pedidos: {}", e)))?;

    let mut result = Vec::new();
    for row in rows {
        let id: String = row.try_get("id").unwrap_or_default();
        let total_cents: i64 = row.try_get("total_cents").unwrap_or(0);
        let payment_method: String = row.try_get("payment_method").unwrap_or_default();
        let created_at: String = row.try_get("created_at").unwrap_or_default();
        result.push(PedidoRow { id, total_cents, payment_method, created_at });
    }

    Ok(Json(result))
}

// Listar itens de um pedido específico
#[derive(Serialize)]
struct ItemPedidoRow {
    id: i64,
    pedido_id: String,
    product_id: i64,
    qty: i64,
    unit_price_cents: i64,
}

async fn list_itens_do_pedido(
    Path(order_id): Path<String>,
    State(app_state): State<AppState>,
) -> Result<Json<Vec<ItemPedidoRow>>, ApiError> {
    let db = app_state.db.clone();
    let rows = sqlx::query(
        r#"SELECT id, pedido_id, product_id, qty, unit_price_cents FROM itens_pedido WHERE pedido_id = ? ORDER BY id"#,
    )
    .bind(&order_id)
    .fetch_all(&db)
    .await
    .map_err(|e| ApiError::internal_server_error(&format!("Erro ao listar itens do pedido: {}", e)))?;

    let mut result = Vec::new();
    for row in rows {
        let id: i64 = row.try_get("id").unwrap_or(0);
        let pedido_id: String = row.try_get("pedido_id").unwrap_or_default();
        let product_id: i64 = row.try_get("product_id").unwrap_or(0);
        let qty: i64 = row.try_get("qty").unwrap_or(0);
        let unit_price_cents: i64 = row.try_get("unit_price_cents").unwrap_or(0);
        result.push(ItemPedidoRow { id, pedido_id, product_id, qty, unit_price_cents });
    }

    Ok(Json(result))
}