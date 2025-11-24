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
async fn users_requires_auth() {
    let _guard = spawn_server().await;
    let client = reqwest::Client::new();

    // Sem login: deve 401
    let r1 = client
        .get(format!("{}/api/users", BASE_URL))
        .send()
        .await
        .expect("Falha ao chamar /api/users sem login");
    assert_eq!(r1.status().as_u16(), 401, "Sem login /api/users deve 401, veio {}", r1.status());

    // Login admin
    let login = client
        .post(format!("{}/api/login", BASE_URL))
        .json(&serde_json::json!({
            "email": "admin@teste.com",
            "senha": "123456"
        }))
        .send()
        .await
        .expect("Falha ao enviar login");
    assert!(login.status().is_success(), "Login deve 200, veio {}", login.status());
    let set_cookie = login.headers().get("set-cookie").and_then(|v| v.to_str().ok()).expect("Set-Cookie ausente");
    let sid = extract_cookie(set_cookie, "session_id").expect("session_id não encontrado");

    // Com cookie: deve 200
    let r2 = client
        .get(format!("{}/api/users", BASE_URL))
        .header("cookie", format!("session_id={}", sid))
        .send()
        .await
        .expect("Falha ao chamar /api/users com login");
    assert!(r2.status().is_success(), "Com login /api/users deve 200, veio {}", r2.status());
}