use serde_json::Value;

mod common;

#[tokio::test]
async fn auth_register() {
    let _server = common::spawn_server().await;
    let client = reqwest::Client::new();

    // Gerar email único por execução
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let email = format!("user{}@teste.com", ts);

    let resp = client
        .post(format!("{}/api/register", common::BASE_URL))
        .json(&serde_json::json!({
            "nome": "Usuário Teste",
            "email": email,
            "senha": "123456"
        }))
        .send()
        .await
        .expect("Falha ao chamar /api/register");

    assert!(resp.status().is_success(), "Status esperado 200, obtido {}", resp.status());
    let body: Value = resp.json().await.expect("Falha ao parsear JSON");
    assert_eq!(body["status"], Value::String("ok".to_string()));
}