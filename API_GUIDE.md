# 🧭 API GUIDE — Mercado Online (Rust + Axum)

**Base URL**

```
http://127.0.0.1:8080
```

Todos os endpoints retornam JSON. Autenticação via sessão com cookies `HttpOnly` e `SameSite=Strict`. Exemplos incluem `curl` e `fetch` com `credentials: 'include'`.

---

## 🩺 1. Health Check

- Rota: `GET /health`
- Verifica se o servidor está ativo.

Resposta (200):

```json
{ "ok": true }
```

Exemplo `curl`:

```bash
curl -s http://127.0.0.1:8080/health
```

---

## 👤 2. Autenticação e Usuários

### POST `/api/register`

- Cadastra um novo usuário.
- Cabeçalhos: `Content-Type: application/json`

Corpo (JSON):

```json
{
  "nome": "Rodrigo Silva",
  "email": "rodrigo@teste.com",
  "senha": "123456"
}
```

Respostas:

- 200 →

```json
{ "status": "ok", "mensagem": "Usuário cadastrado com sucesso" }
```

- 400 →

```json
{ "erro": "E-mail já cadastrado" }
```

Exemplo `curl`:

```bash
curl -s -X POST http://127.0.0.1:8080/api/register \
  -H "Content-Type: application/json" \
  -d '{"nome":"Rodrigo Silva","email":"rodrigo@teste.com","senha":"123456"}'
```

---

### POST `/api/login`

- Realiza login e cria uma sessão.

Corpo (JSON):

```json
{
  "email": "admin@teste.com",
  "senha": "123456"
}
```

Resposta (200):

```json
{
  "autenticado": true,
  "usuario": { "id": 1, "nome": "Admin", "email": "admin@teste.com" }
}
```

Cookie criado (exemplo de cabeçalho):

```
Set-Cookie: session_id=<uuid>; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400
```

Exemplo `curl` (persistindo cookies):

```bash
# salva cookies em cookie.txt
curl -s -c cookie.txt -X POST http://127.0.0.1:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@teste.com","senha":"123456"}'
```

Exemplo `fetch` (frontend):

```js
await fetch('/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ email: 'admin@teste.com', senha: '123456' }),
});
```

---

### GET `/api/auth/me`

- Retorna dados do usuário autenticado.

Resposta (200):

```json
{ "id": 1, "nome": "Admin", "email": "admin@teste.com" }
```

Erro (401):

```json
{ "erro": "não autenticado" }
```

Exemplo `curl` (usando cookies salvos):

```bash
curl -s -b cookie.txt http://127.0.0.1:8080/api/auth/me
```

---

### POST `/api/logout`

- Finaliza a sessão do usuário.

Resposta:

```json
{ "status": "ok", "mensagem": "Sessão encerrada com sucesso" }
```

Exemplo `curl`:

```bash
curl -s -b cookie.txt -X POST http://127.0.0.1:8080/api/logout
```

---

## 🛍️ 3. Produtos

### GET `/api/products`

- Lista todos os produtos do catálogo.

Resposta:

```json
[
  { "id": 1, "name": "Arroz 1kg", "price_cents": 850, "stock": 50, "image_url": "images/arroz.png" },
  { "id": 2, "name": "Feijão 1kg", "price_cents": 650, "stock": 30, "image_url": "images/feijao.png" }
]
```

Exemplo `curl`:

```bash
curl -s -b cookie.txt http://127.0.0.1:8080/api/products
```

---

## 🛒 4. Carrinho

### POST `/api/cart`

- Adiciona um produto ao carrinho.

Corpo:

```json
{ "product_id": 1, "qty": 2 }
```

Resposta:

```json
{ "status": "ok", "mensagem": "Produto adicionado ao carrinho" }
```

Exemplo `curl`:

```bash
curl -s -b cookie.txt -X POST http://127.0.0.1:8080/api/cart \
  -H "Content-Type: application/json" \
  -d '{"product_id":1,"qty":2}'
```

---

### GET `/api/cart`

- Retorna os itens do carrinho.

Resposta:

```json
{
  "items": [
    { "product_id": 1, "name": "Arroz", "qty": 2, "unit_price_cents": 850, "line_total_cents": 1700 }
  ],
  "subtotal_cents": 1700,
  "shipping_cents": 0,
  "total_cents": 1700
}
```

Exemplo `curl`:

```bash
curl -s -b cookie.txt http://127.0.0.1:8080/api/cart
```

---

### PATCH `/api/cart/:product_id`

- Atualiza a quantidade de um item.

Corpo:

```json
{ "qty": 3 }
```

Resposta:

```json
{ "status": "ok", "mensagem": "Quantidade atualizada", "item": { "product_id": 1, "qty": 3 } }
```

Exemplo `curl`:

```bash
curl -s -b cookie.txt -X PATCH http://127.0.0.1:8080/api/cart/1 \
  -H "Content-Type: application/json" \
  -d '{"qty":3}'
```

---

### DELETE `/api/cart/clear`

- Limpa completamente o carrinho.

Resposta:

```json
{ "status": "ok", "mensagem": "Carrinho limpo" }
```

Exemplo `curl`:

```bash
curl -s -b cookie.txt -X DELETE http://127.0.0.1:8080/api/cart/clear
```

---

## 💳 5. Checkout

### POST `/api/checkout`

- Finaliza a compra e processa o pagamento.

Corpo:

```json
{
  "payment_method": "pix",
  "shipping": {
    "nome": "Rodrigo Silva",
    "email": "rg601725@gmail.com",
    "endereco": "Rua das Flores, 123",
    "cidade": "São Paulo",
    "cep": "06765-098"
  },
  "accept_terms": true
}
```

Resposta:

```json
{
  "order_id": "b4f2-8c9d",
  "status": "sucesso",
  "mensagem_pagamento": "Pagamento via PIX processado com sucesso! Total: R$ 43,00."
}
```

Possíveis erros:

- 400 → `{ "erro": "terms_required" }` quando `accept_terms=false`
- 401 → `{ "erro": "não autenticado" }` se sessão inválida

Exemplo `curl`:

```bash
curl -s -b cookie.txt -X POST http://127.0.0.1:8080/api/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method":"pix",
    "shipping":{
      "nome":"Rodrigo Silva",
      "email":"rg601725@gmail.com",
      "endereco":"Rua das Flores, 123",
      "cidade":"São Paulo",
      "cep":"06765-098"
    },
    "accept_terms":true
  }'
```

---

## 📦 6. Pedidos e Relatórios

### GET `/api/pedidos`

- Lista todos os pedidos feitos pelo usuário autenticado.

Resposta:

```json
[
  { "id": "b4f2-8c9d", "total_cents": 4300, "payment_method": "pix", "created_at": "2025-10-09T22:33:00Z" }
]
```

Exemplo `curl`:

```bash
curl -s -b cookie.txt http://127.0.0.1:8080/api/pedidos
```

---

### GET `/api/pedidos/:id/itens`

- Lista os itens de um pedido específico.

Resposta:

```json
[
  { "product_id": 1, "name": "Arroz", "qty": 2, "unit_price_cents": 850, "line_total_cents": 1700 }
]
```

Exemplo `curl`:

```bash
curl -s -b cookie.txt http://127.0.0.1:8080/api/pedidos/b4f2-8c9d/itens
```

---

### GET `/api/reports/daily`

- Retorna total de vendas agrupadas por dia e método de pagamento.

Resposta:

```json
[
  { "dia": "2025-10-09", "metodo": "pix", "total_cents": 15300 },
  { "dia": "2025-10-09", "metodo": "cartao", "total_cents": 8900 }
]
```

Exemplo `curl`:

```bash
curl -s -b cookie.txt http://127.0.0.1:8080/api/reports/daily
```

---

## 🔐 7. Regras de Autenticação

- Rotas Públicas:
  - `/health`
  - `/api/login`
  - `/api/register`
  - `/login`

- Rotas Protegidas (necessitam cookie de sessão válido):
  - `/api/products`
  - `/api/cart*`
  - `/api/checkout`
  - `/api/pedidos*`
  - `/api/reports/*`

Frontend deve usar `fetch` com `credentials: 'include'` para enviar os cookies de sessão.

---

## 🧪 8. Testes Automatizados

Executar testes:

```bash
cargo test -- --test-threads=1
```

Os testes validam:

- Saúde da API
- Fluxo do carrinho
- Checkout completo
- Autenticação (login/logout/sessão)

Arquivos em `tests/` incluem: `health_check.rs`, `cart_flow.rs`, `checkout.rs`, `auth_login.rs`, `auth_protection.rs`, `auth_register.rs`, `auth_session.rs` e utilitários em `common.rs`.

---

## 🧾 9. Códigos de Resposta

| Código | Significado              | Contexto                          |
|-------:|--------------------------|-----------------------------------|
| 200    | OK                       | Operação bem-sucedida             |
| 400    | Bad Request              | Entrada inválida                  |
| 401    | Unauthorized             | Sessão inválida ou expirada       |
| 404    | Not Found                | Recurso inexistente               |
| 500    | Internal Server Error    | Erro inesperado no servidor       |

---

## 🧩 10. Observações

- Sessões expiram após 24h automaticamente.
- Nenhum dado sensível aparece na URL.
- Cookies de autenticação são `HttpOnly` e `SameSite=Strict`.
- Frontend consome rotas via `fetch` com `credentials: 'include'`.
- API compatível com Postman, Insomnia e `curl`.

---

> "API desenvolvida em Rust + Axum + SQLite — 2025.\nProjeto acadêmico FECAF : aplicação completa de autenticação, e-commerce e relatórios."