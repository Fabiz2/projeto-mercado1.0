const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Dados dos produtos
const products = [
    { id: 1, name: "Arroz", price_cents: 850, image_url: "images/arroz.png", stock: 50 },
    { id: 2, name: "Feijão", price_cents: 650, image_url: "images/feijao.png", stock: 30 },
    { id: 3, name: "Açúcar", price_cents: 450, image_url: "images/açucar.png", stock: 25 },
    { id: 4, name: "Café", price_cents: 1200, image_url: "images/cafe.png", stock: 40 },
    { id: 5, name: "Leite", price_cents: 380, image_url: "images/leite.png", stock: 60 },
    { id: 6, name: "Óleo", price_cents: 750, image_url: "images/oleo.png", stock: 35 },
    { id: 7, name: "Sal", price_cents: 250, image_url: "images/sal.png", stock: 80 },
    { id: 8, name: "Macarrão", price_cents: 320, image_url: "images/macarrao.png", stock: 45 },
    { id: 9, name: "Farinha de Trigo", price_cents: 480, image_url: "images/farinha de trigo.png", stock: 20 },
    { id: 10, name: "Biscoito", price_cents: 550, image_url: "images/biscoito.png", stock: 55 },
    { id: 11, name: "Chocolate", price_cents: 890, image_url: "images/chocolate.png", stock: 15 },
    { id: 12, name: "Cereal", price_cents: 1150, image_url: "images/cereal.png", stock: 25 },
    { id: 13, name: "Molho de Tomate", price_cents: 280, image_url: "images/molho de tomate.png", stock: 40 },
    { id: 14, name: "Manteiga", price_cents: 680, image_url: "images/manteiga.png", stock: 30 },
    { id: 15, name: "Queijo Mussarela", price_cents: 1250, image_url: "images/queijo mussarela.png", stock: 20 },
    { id: 16, name: "Presunto", price_cents: 1580, image_url: "images/presunto.png", stock: 18 },
    { id: 17, name: "Água", price_cents: 180, image_url: "images/agua.png", stock: 100 },
    { id: 18, name: "Refrigerante", price_cents: 450, image_url: "images/refrigerante.png", stock: 35 },
    { id: 19, name: "Suco", price_cents: 380, image_url: "images/suco.png", stock: 40 },
    { id: 20, name: "Arroz Integral", price_cents: 950, image_url: "images/arroz integral.png", stock: 22 }
];

// Estado do carrinho (simples para demonstração)
let cart = {};

// === IMPLEMENTAÇÃO OOP - SISTEMA DE PAGAMENTO ===

// Classe base para métodos de pagamento (simulando trait Pagamento do Rust)
class Pagamento {
    processar(total_cents) {
        throw new Error("Método processar deve ser implementado pela subclasse");
    }
}

// Implementação do pagamento via Pix
class Pix extends Pagamento {
    processar(total_cents) {
        const total_reais = (total_cents / 100).toFixed(2);
        return `Pagamento via PIX processado com sucesso! Total: R$ ${total_reais}. Chave PIX: mercado@exemplo.com`;
    }
}

// Implementação do pagamento via Cartão de Crédito
class Cartao extends Pagamento {
    processar(total_cents) {
        const total_reais = (total_cents / 100).toFixed(2);
        return `Pagamento via Cartão de Crédito processado com sucesso! Total: R$ ${total_reais}. Transação aprovada em 3 parcelas.`;
    }
}

// Função para escolher o método de pagamento baseado no valor
function escolherPagamento(total_cents) {
    // Pix para valores até R$ 50,00 (5000 centavos)
    // Cartão para valores acima de R$ 50,00
    if (total_cents <= 5000) {
        return new Pix();
    } else {
        return new Cartao();
    }
}

// Função para servir arquivos estáticos
function serveStaticFile(filePath, res) {
    const extname = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Arquivo não encontrado');
            } else {
                res.writeHead(500);
                res.end('Erro interno do servidor: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}

const server = http.createServer((req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;

    if (path === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', message: 'Servidor funcionando' }));
    }
    else if (path === '/api/products' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify(products));
    }
    else if (path === '/api/cart' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        const cartItems = Object.values(cart);
        const subtotal = cartItems.reduce((sum, item) => sum + item.line_total_cents, 0);
        const shipping = subtotal > 5000 ? 0 : 1000; // Frete grátis acima de R$ 50
        const total = subtotal + shipping;
        
        res.writeHead(200);
        res.end(JSON.stringify({
            items: cartItems,
            subtotal_cents: subtotal,
            shipping_cents: shipping,
            total_cents: total
        }));
    }
    else if (path === '/api/cart' && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json');
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { product_id, qty } = JSON.parse(body);
                const product = products.find(p => p.id === product_id);
                
                if (!product) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Produto não encontrado' }));
                    return;
                }
                
                if (cart[product_id]) {
                    cart[product_id].qty += qty;
                } else {
                    cart[product_id] = {
                        product_id,
                        name: product.name,
                        unit_price_cents: product.price_cents,
                        qty
                    };
                }
                
                cart[product_id].line_total_cents = cart[product_id].qty * cart[product_id].unit_price_cents;
                
                res.writeHead(200);
                res.end(JSON.stringify({ message: 'Produto adicionado ao carrinho' }));
            } catch (error) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Dados inválidos' }));
            }
        });
    }
    else if (path.startsWith('/api/cart/') && req.method === 'PATCH') {
        res.setHeader('Content-Type', 'application/json');
        const productId = parseInt(path.split('/')[3]);
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { qty } = JSON.parse(body);
                
                if (cart[productId]) {
                    if (qty <= 0) {
                        delete cart[productId];
                    } else {
                        cart[productId].qty = qty;
                        cart[productId].line_total_cents = cart[productId].qty * cart[productId].unit_price_cents;
                    }
                }
                
                res.writeHead(200);
                res.end(JSON.stringify({ message: 'Carrinho atualizado' }));
            } catch (error) {
                console.log('Erro no checkout:', error.message);
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Dados inválidos' }));
            }
        });
    }
    else if (path === '/api/cart/clear' && req.method === 'DELETE') {
        res.setHeader('Content-Type', 'application/json');
        cart = {};
        res.writeHead(200);
        res.end(JSON.stringify({ message: 'Carrinho limpo' }));
    }
    else if (path === '/api/checkout' && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json');
        const cartItems = Object.values(cart);
        
        // Verificar se o carrinho está vazio
        if (cartItems.length === 0) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Carrinho está vazio' }));
            return;
        }
        
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const requestData = JSON.parse(body);
                
                // Calcular total usando encapsulamento (line_total_cents de cada item)
                const total = cartItems.reduce((sum, item) => sum + item.line_total_cents, 0);
                
                // Usar método de pagamento escolhido pelo usuário
                let metodoPagamento;
                if (requestData.payment_method === 'pix') {
                    metodoPagamento = new Pix();
                } else if (requestData.payment_method === 'cartao') {
                    metodoPagamento = new Cartao();
                } else {
                    // Fallback para escolha automática se não especificado
                    metodoPagamento = escolherPagamento(total);
                }
                
                // Processar pagamento usando polimorfismo
                const mensagemPagamento = metodoPagamento.processar(total);
                
                // Simular checkout
                const orderId = 'ORDER-' + Date.now();
                cart = {}; // Limpar carrinho após checkout
                
                res.writeHead(200);
                res.end(JSON.stringify({
                    order_id: orderId,
                    status: 'confirmed',
                    total_cents: total,
                    message: 'Pedido realizado com sucesso!',
                    mensagem_pagamento: mensagemPagamento, // Nova mensagem de pagamento OOP
                    items: cartItems
                }));
            } catch (error) {
                console.log('Erro no checkout:', error.message);
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Dados inválidos' }));
            }
        });

    }
    else {
        // Servir arquivos estáticos
        let filePath = '.' + path;
        
        // Se for a raiz, servir index.html
        if (path === '/') {
            filePath = './index.html';
        }
        
        // Verificar se o arquivo existe
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                // Se não for um arquivo estático, retornar erro de API
                res.setHeader('Content-Type', 'application/json');
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Endpoint não encontrado' }));
            } else {
                // Servir o arquivo estático
                serveStaticFile(filePath, res);
            }
        });
    }
});

const PORT = 8080;
server.listen(PORT, '127.0.0.1', () => {
    console.log(`Servidor rodando em http://127.0.0.1:${PORT}`);
});