use serde_json::Value;

mod common;

#[tokio::test]
async fn checkout() {
    // Sobe servidor se necessário
    let _server = common::spawn_server().await;
    let client = reqwest::Client::new();

    // Preparar: pegar 1º produto
    let products_resp = client
        .get(format!("{}/api/products", common::BASE_URL))
        .send()
        .await
        .expect("Falha ao obter /api/products");
    assert!(products_resp.status().is_success());
    let products: Vec<Value> = products_resp.json().await.expect("Falha ao parsear produtos");
    assert!(!products.is_empty(), "Catálogo deve conter ao menos 1 produto");
    let product_id = products[0]["id"].as_u64().expect("Produto deve ter id");

    // Adicionar 1 unidade ao carrinho
    let add_resp = client
        .post(format!("{}/api/cart", common::BASE_URL))
        .json(&serde_json::json!({ "product_id": product_id, "qty": 1 }))
        .send()
        .await
        .expect("Falha ao adicionar ao carrinho");
    assert!(add_resp.status().is_success());

    // Checkout (PIX, com termos aceitos)
    let payload = serde_json::json!({
        "payment": { "method": "pix" },
        "customer_email": "teste@exemplo.com"
    });

    let checkout_resp = client
        .post(format!("{}/api/checkout", common::BASE_URL))
        .json(&payload)
        .send()
        .await
        .expect("Falha ao realizar checkout");
    assert!(checkout_resp.status().is_success(), "Checkout deve retornar 200, obtido {}", checkout_resp.status());

    let body: Value = checkout_resp.json().await.expect("Falha ao parsear resposta do checkout");
    assert!(body["order_id"].as_str().is_some(), "order_id deve existir");
    assert!(body["status"].as_str().is_some(), "status deve existir");
    assert!(body["total_cents"].as_u64().unwrap_or(0) > 0, "total_cents deve ser > 0");

    // Carrinho deve ficar vazio após checkout
    let cart_resp = client
        .get(format!("{}/api/cart", common::BASE_URL))
        .send()
        .await
        .expect("Falha ao obter carrinho pos-checkout");
    assert!(cart_resp.status().is_success());
    let cart: Value = cart_resp.json().await.expect("Falha ao parsear carrinho pos-checkout");
    let items = cart["items"].as_array().unwrap_or(&vec![]).len();
    assert_eq!(items, 0, "Carrinho deve estar vazio após checkout");
}