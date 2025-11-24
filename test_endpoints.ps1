# Script para testar os endpoints do carrinho
# Execute este script após o servidor estar rodando

Write-Host "Testando endpoints do carrinho..." -ForegroundColor Green

# 1. Testar health check
Write-Host "\n1. Testando /health" -ForegroundColor Yellow
curl -X GET http://localhost:8080/health

# 2. Testar listagem de produtos
Write-Host "\n\n2. Testando GET /api/products" -ForegroundColor Yellow
curl -X GET http://localhost:8080/api/products

# 3. Testar carrinho vazio
Write-Host "\n\n3. Testando GET /api/cart (vazio)" -ForegroundColor Yellow
curl -X GET http://localhost:8080/api/cart

# 4. Adicionar produto ao carrinho
Write-Host "\n\n4. Testando POST /api/cart (adicionar produto 1)" -ForegroundColor Yellow
curl -X POST http://localhost:8080/api/cart `
  -H "Content-Type: application/json" `
  -d '{"product_id": 1, "qty": 2}'

# 5. Verificar carrinho com item
Write-Host "\n\n5. Testando GET /api/cart (com item)" -ForegroundColor Yellow
curl -X GET http://localhost:8080/api/cart

# 6. Adicionar outro produto
Write-Host "\n\n6. Testando POST /api/cart (adicionar produto 3)" -ForegroundColor Yellow
curl -X POST http://localhost:8080/api/cart `
  -H "Content-Type: application/json" `
  -d '{"product_id": 3, "qty": 1}'

# 7. Atualizar quantidade de um produto
Write-Host "\n\n7. Testando PATCH /api/cart/1 (atualizar quantidade)" -ForegroundColor Yellow
curl -X PATCH http://localhost:8080/api/cart/1 `
  -H "Content-Type: application/json" `
  -d '{"qty": 5}'

# 8. Verificar carrinho atualizado
Write-Host "\n\n8. Testando GET /api/cart (após atualização)" -ForegroundColor Yellow
curl -X GET http://localhost:8080/api/cart

# 9. Testar checkout com carrinho vazio (deve falhar)
Write-Host "\n\n9. Testando POST /api/checkout (carrinho vazio - deve falhar)" -ForegroundColor Yellow
curl -X POST http://localhost:8080/api/checkout

# 10. Adicionar produtos novamente para testar checkout
Write-Host "\n\n10. Adicionando produtos para testar checkout" -ForegroundColor Yellow
curl -X POST http://localhost:8080/api/cart `
  -H "Content-Type: application/json" `
  -d '{"product_id": 2, "qty": 1}'
curl -X POST http://localhost:8080/api/cart `
  -H "Content-Type: application/json" `
  -d '{"product_id": 4, "qty": 2}'

# 11. Verificar carrinho antes do checkout
Write-Host "\n\n11. Verificando carrinho antes do checkout" -ForegroundColor Yellow
curl -X GET http://localhost:8080/api/cart

# 12. Fazer checkout
Write-Host "\n\n12. Testando POST /api/checkout (com itens)" -ForegroundColor Yellow
curl -X POST http://localhost:8080/api/checkout

# 13. Verificar se carrinho foi limpo após checkout
Write-Host "\n\n13. Verificando se carrinho foi limpo após checkout" -ForegroundColor Yellow
curl -X GET http://localhost:8080/api/cart

# 14. Limpar carrinho (teste adicional)
Write-Host "\n\n14. Testando DELETE /api/cart/clear" -ForegroundColor Yellow
curl -X DELETE http://localhost:8080/api/cart/clear

Write-Host "\n\nTestes concluídos!" -ForegroundColor Green