# 🛒 Mercado Online — Sistema Web em Rust

**FECAF**  
Curso: Engenharia da Computação  
Turma: Noturno  
Professor Orientador: Ricardo Figueiredo Gomes  
Alunos: Rodrigo Gonçalves da Silva, Fabrício Conceição Silva, Nathan Mateus da Silva Nascimento, Carlos Henrique Barreto Silva

---

## 📘 1. Introdução

- Contexto: desenvolvimento de uma aplicação completa que simula um e-commerce funcional com backend em Rust e frontend moderno.
- Motivação: demonstrar domínio de Rust, banco de dados, estrutura modular, autenticação segura e UX moderna com suporte a temas.
- Objetivo geral: desenvolver uma aplicação web segura, responsiva e funcional.
- Objetivos específicos:
  - Criar backend em Rust com Axum.
  - Conectar ao banco SQLite.
  - Implementar autenticação (login/cadastro).
  - Aplicar princípios de OOP e estruturas de dados.
  - Criar interface moderna com dark/light mode e UX intuitiva.

---

## ⚙️ 2. Tecnologias Utilizadas

- Backend: Rust (`axum`, `tokio`, `serde`, `serde_json`, `tower-http`)
- Banco de Dados: SQLite (`sqlx` com driver `sqlite` e TLS `runtime-tokio-rustls`)
- Segurança: `bcrypt` para hash de senhas, `uuid` para identificadores
- Frontend: HTML5, CSS3, JavaScript ES6
- Estilo: Bootstrap (via `data-bs-theme`) + CSS Custom Properties (variáveis de tema)
- Autenticação: Cookies de sessão (`HttpOnly` + `SameSite=Strict`)
- Testes: `cargo test` (com `reqwest`, `tokio`, `serde_json`)
- Gerenciamento de dependências: Cargo
- Estruturas: `Vec`, `HashMap` e persistência mínima em SQLite

---

## 🧩 3. Estrutura do Projeto

```
projeto-mercado1.0/
├── Cargo.toml                 # Dependências e configuração do crate
├── app.js                     # Lógica de UI, integração com API, tema
├── index.html                 # Catálogo e área autenticada
├── login.html                 # Tela de login/cadastro com parallax e tema
├── style.css                  # Estilos globais, variáveis de tema, efeitos
├── server.js                  # Servidor auxiliar (opcional) para estáticos
├── data/
│   ├── mercado.db             # SQLite database (gerado em runtime)
│   └── schema.sql             # Esquema mínimo de pedidos/itens
├── src/
│   ├── main.rs                # Bootstrap do Axum, rotas e servidores
│   └── auth.rs                # Autenticação, sessões, proteção de rotas
├── tests/                     # Testes de API End-to-End (Tokio + Reqwest)
│   ├── auth_login.rs
│   ├── auth_protection.rs
│   ├── auth_register.rs
│   ├── auth_session.rs
│   ├── cart_flow.rs
│   ├── checkout.rs
│   ├── common.rs
│   └── health_check.rs
└── images/                    # Catálogo de imagens de produtos
```

- O backend em `src/` expõe APIs RESTful e serve os arquivos estáticos.
- O frontend em `index.html`/`login.html` consome as APIs e aplica UX responsiva.
- Testes em `tests/` validam autenticação, fluxos do carrinho e checkout.
- `data/schema.sql` mantém o esquema mínimo; tabelas adicionais podem ser inicializadas pelo backend.

---

## 🧠 4. Modelagem e Arquitetura

### 🧱 Arquitetura

- Estrutura modular, separando responsabilidades (ex.: `auth`, rotas, modelos e serviços).
- Backend serve arquivos estáticos e APIs RESTful com Axum.
- Frontend em SPA leve com navegação suave e interações via `fetch`.
- Persistência mínima via SQLite; lógica principal do carrinho em memória, com snapshots de pedidos.
- Middleware de autenticação protege rotas sensíveis e expõe estado de sessão.
- OOP aplicada no sistema de pagamento (herança via traits, polimorfismo e encapsulamento) para suportar Pix e Cartão.

### 🔄 Fluxo da Aplicação

1. Usuário acessa `/login` e autentica-se.
2. Após login, redireciona para `/` (catálogo).
3. Pode adicionar produtos ao carrinho, ajustar quantidades e finalizar compra.
4. O backend processa o pagamento (Pix ou Cartão, com lógica OOP).
5. Pedido é salvo no banco SQLite.
6. Relatórios diários podem ser consultados via `/api/reports/daily`.

---

## 🧮 5. Integração Matemática

- Cálculo de totais implementado com produto escalar vetorial: `Total = Σ (qi × pi)`.
- Cada item do carrinho representa um vetor de quantidades (`q`) e preços (`p`).
- O total da compra é calculado pela soma dos produtos escalares — aplicação direta de álgebra linear.

---

## 🧠 6. Estruturas de Dados

| Estrutura | Linguagem | Finalidade              | Complexidade |
|----------:|:----------|:------------------------|:-------------|
| `Vec`     | Rust      | Catálogo de produtos    | O(n)         |
| `HashMap` | Rust      | Carrinho de compras     | O(1)         |
| `struct`  | Rust      | `CartItem`, `CartSummary`, `Payment` | Encapsulamento |
| `Array`   | JS        | Renderização de catálogo| O(n)         |

---

## 🔐 7. Autenticação e Sessões

- Tabela `usuarios` criada no SQLite (nome, email, senha com `bcrypt`).
- Cadastro via `POST /api/register` com hash bcrypt.
- Login via `POST /api/login` gera cookie `session_id` (`HttpOnly`, `SameSite=Strict`).
- Middleware verifica sessão e expiração (24h) e protege rotas sensíveis.
- Logout limpa sessão e redireciona ao login.
- Acesso às rotas `/api/*` e páginas estáticas sensíveis é protegido por verificação de sessão.

---

## 🎨 8. UX / UI e Design Responsivo

- Interface moderna com modo escuro e claro adaptativo (`data-theme` + `data-bs-theme`).
- Transições suaves entre temas sem inversão abrupta de cores.
- Placeholders e tipografia legíveis em ambos os modos.
- Toasts de feedback sutis (ex.: “Item adicionado”, “Sessão encerrada”).
- Modal de login/cadastro com validações e microanimações.
- Layout responsivo para desktop e mobile (Bootstrap utilitários + CSS Custom Properties).
- Efeito parallax leve na tela de login que se adapta ao tema.

---

## 🧪 9. Validação e Testes

- `tests/health_check.rs` → verifica status da API.
- `tests/cart_flow.rs` → adiciona, lista e limpa carrinho.
- `tests/checkout.rs` → simula compra e limpa carrinho.
- `tests/auth_login.rs` → autenticação válida e inválida.
- Execução: `cargo test -- --test-threads=1`.
- Todos os testes retornam `ok`.

---

## 💾 10. Banco de Dados

- SQLite criado automaticamente (`data/mercado.db`).
- Tabelas principais:
  - `usuarios` (id, nome, email, senha_hash)
  - `sessions` (id, user_id, created_at, expires_at)
  - `pedidos` (id, total_cents, payment_method, created_at)
  - `itens_pedido` (id, pedido_id, product_id, qty, unit_price_cents)

> Observação: o arquivo `data/schema.sql` contém o esquema mínimo para `pedidos` e `itens_pedido`. As tabelas de autenticação (`usuarios`, `sessions`) podem ser inicializadas pelo backend na primeira execução, garantindo compatibilidade com os testes de autenticação.

---

## 📈 11. Resultados e Conclusões

- Projeto atende todos os requisitos funcionais:
  - ✅ Conexão com banco
  - ✅ Login e autenticação
  - ✅ Estrutura modular
  - ✅ Testes e validações
  - ✅ UX moderna
  - ✅ Princípios de OOP e estruturas de dados

### 🧩 Aprendizados

- Experiência com Axum, SQLx e Rust assíncrono.
- Melhores práticas de autenticação e persistência.
- Aplicação de UX real em modo dark/light.
- Integração de testes automatizados de API.

### 🚀 Futuras Melhorias

- Implementar perfil do usuário.
- Adicionar painel de administração.
- Otimizar cache e requisições.

---

## 🔗 12. Referências

- Documentação Rust: https://doc.rust-lang.org
- SQLx: https://docs.rs/sqlx/latest/sqlx/
- Axum Framework: https://docs.rs/axum/latest/axum/
- Bootstrap: https://getbootstrap.com
- (2025)