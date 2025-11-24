use serde_json::Value;

mod common;

#[tokio::test]
async fn cart_flow() {
    // Sobe o servidor se necessário
    let _server = common::spawn_server().await;
    let client = reqwest::Client::new();

    // 1) GET /api/products
    let products_resp = client
        .get(format!("{}/api/products", common::BASE_URL))
        .send()
        .await
        .expect("Falha ao obter /api/products");
    assert!(products_resp.status().is_success());
    let products: Vec<Value> = products_resp.json().await.expect("Falha ao parsear produtos");
    assert!(!products.is_empty(), "Catálogo deve conter ao menos 1 produto");
    let first = &products[0];
    let product_id = first["id"].as_u64().expect("Produto deve ter id");

    // 2) POST /api/cart com { product_id, qty: 2 }
    let add_resp = client
        .post(format!("{}/api/cart", common::BASE_URL))
        .json(&serde_json::json!({ "product_id": product_id, "qty": 2 }))
        .send()
        .await
        .expect("Falha ao adicionar ao carrinho");
    assert!(add_resp.status().is_success(), "POST /api/cart deve retornar 200");

    // 3) GET /api/cart e verificar subtotal_cents > 0
    let cart_resp = client
        .get(format!("{}/api/cart", common::BASE_URL))
        .send()
        .await
        .expect("Falha ao obter carrinho");
    assert!(cart_resp.status().is_success());
    let cart: Value = cart_resp.json().await.expect("Falha ao parsear carrinho");
    let subtotal = cart["subtotal_cents"].as_u64().unwrap_or(0);
    assert!(subtotal > 0, "Subtotal deve ser > 0, obtido {}", subtotal);

    // 4) DELETE /api/cart/clear e verificar carrinho vazio
    let clear_resp = client
        .delete(format!("{}/api/cart/clear", common::BASE_URL))
        .send()
        .await
        .expect("Falha ao limpar carrinho");
    assert!(clear_resp.status().is_success());

    let cart_after_resp = client
        .get(format!("{}/api/cart", common::BASE_URL))
        .send()
        .await
        .expect("Falha ao obter carrinho após limpar");
    assert!(cart_after_resp.status().is_success());
    let cart_after: Value = cart_after_resp.json().await.expect("Falha ao parsear carrinho após limpar");
    let items = cart_after["items"].as_array().unwrap_or(&vec![]).len();
    assert_eq!(items, 0, "Carrinho deve ficar vazio após clear (items = 0)");
}