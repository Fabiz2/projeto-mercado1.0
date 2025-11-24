use serde_json::Value;

mod common;

#[tokio::test]
async fn health_check() {
    // Garante que o backend está de pé
    let _server = common::spawn_server().await;

    // Faz GET /health
    let resp = reqwest::Client::new()
        .get(format!("{}/health", common::BASE_URL))
        .send()
        .await
        .expect("Falha ao chamar /health");

    assert!(resp.status().is_success(), "Status esperado 200, obtido {}", resp.status());

    let body: Value = resp.json().await.expect("Falha ao parsear JSON de /health");
    assert_eq!(body["ok"], Value::Bool(true), "Resposta esperada {{ ok: true }}, obtido: {}", body);
}