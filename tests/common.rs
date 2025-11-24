use std::process::{Child, Command, Stdio};
use std::time::Duration;

/// Guarda o processo do servidor. Só mata se foi iniciado por este teste.
pub struct ServerGuard {
    child: Option<Child>,
}

impl Drop for ServerGuard {
    fn drop(&mut self) {
        if let Some(child) = &mut self.child {
            let _ = child.kill();
        }
    }
}

pub const BASE_URL: &str = "http://127.0.0.1:8080";

/// Tenta chamar GET /health e retorna true se a API respondeu 200 { ok: true }.
async fn is_server_up() -> bool {
    match reqwest::Client::new()
        .get(format!("{}/health", BASE_URL))
        .send()
        .await
    {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

/// Aguarda o servidor ficar pronto consultando /health por alguns segundos.
async fn wait_until_ready(max_attempts: usize) -> bool {
    for _ in 0..max_attempts {
        if is_server_up().await {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    false
}

/// Inicia o servidor do backend (se ainda não estiver no ar) e retorna um guard.
/// - Se já estiver rodando, não inicia novo processo e o guard não mata nada.
/// - Se não estiver rodando, executa `cargo run` em background e aguarda `/health`.
pub async fn spawn_server() -> ServerGuard {
    if wait_until_ready(10).await {
        return ServerGuard { child: None };
    }

    // Iniciar o servidor via binário já compilado para evitar lock do target (Windows)
    // Assumimos build em modo debug durante `cargo test`.
    // Se `CARGO_TARGET_DIR` estiver definido, usa-o para localizar o binário.
    let bin_path = {
        let target_dir = std::env::var("CARGO_TARGET_DIR").ok();
        match target_dir {
            Some(dir) => {
                #[cfg(windows)]
                { format!("{}\\debug\\mercado-backend.exe", dir) }
                #[cfg(unix)]
                { format!("{}/debug/mercado-backend", dir) }
            }
            None => {
                #[cfg(windows)]
                { String::from("target\\debug\\mercado-backend.exe") }
                #[cfg(unix)]
                { String::from("target/debug/mercado-backend") }
            }
        }
    };

    // Copiar binário para pasta temporária para evitar locking do target durante compilação
    #[cfg(windows)]
    let test_bin_path = "target\\tmp\\mercado-backend-test.exe";
    #[cfg(unix)]
    let test_bin_path = "target/tmp/mercado-backend-test";
    let _ = std::fs::create_dir_all("target/tmp");
    let _ = std::fs::copy(bin_path, test_bin_path);

    let mut child = Command::new(test_bin_path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("Falha ao iniciar o binário do servidor");

    // Aguardar ficar pronto
    let ready = wait_until_ready(30).await;
    if !ready {
        // Tentar encerrar se não subiu
        let _ = child.kill();
        panic!("Servidor não ficou pronto em tempo hábil");
    }

    ServerGuard { child: Some(child) }
}