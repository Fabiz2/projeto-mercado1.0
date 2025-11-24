use serde_json::Value;

mod common;

#[tokio::test]
async fn auth_login() {
    let _server = common::spawn_server().await;
    let client = reqwest::Client::new();

    // 1) Login válido admin
    let ok_resp = client
        .post(format!("{}/api/login", common::BASE_URL))
        .json(&serde_json::json!({
            "email": "admin@teste.com",
            "senha": "123456"
        }))
        .send()
        .await
        .expect("Falha ao chamar /api/login (admin)");
    assert!(ok_resp.status().is_success(), "Esperado 200 para admin, obtido {}", ok_resp.status());
    let ok_body: Value = ok_resp.json().await.expect("Falha ao parsear JSON (admin)");
    assert_eq!(ok_body["autenticado"], Value::Bool(true));
    assert!(ok_body["usuario"]["email"].as_str().is_some());

    // 2) Usuário inexistente
    let nf_resp = client
        .post(format!("{}/api/login", common::BASE_URL))
        .json(&serde_json::json!({
            "email": "naoexiste@teste.com",
            "senha": "abc"
        }))
        .send()
        .await
        .expect("Falha ao chamar /api/login (inexistente)");
    assert_eq!(nf_resp.status(), reqwest::StatusCode::NOT_FOUND);
    let nf_body: Value = nf_resp.json().await.expect("Falha ao parsear JSON (inexistente)");
    assert!(nf_body["erro"].as_str().is_some());

    // 3) Senha incorreta
    let bad_resp = client
        .post(format!("{}/api/login", common::BASE_URL))
        .json(&serde_json::json!({
            "email": "admin@teste.com",
            "senha": "errada"
        }))
        .send()
        .await
        .expect("Falha ao chamar /api/login (senha incorreta)");
    assert_eq!(bad_resp.status(), reqwest::StatusCode::UNAUTHORIZED);
    let bad_body: Value = bad_resp.json().await.expect("Falha ao parsear JSON (senha incorreta)");
    assert_eq!(bad_body["autenticado"], Value::Bool(false));
    assert!(bad_body["erro"].as_str().is_some());
}