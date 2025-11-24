// Configuração da API
const baseUrl = 'http://127.0.0.1:8080';

// Estado da aplicação
let currentView = 'catalog';
let cartItems = [];
let products = [];
// Persistência de formulário de checkout
let checkoutFormState = {};
// Sessão do usuário
let currentUser = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    // Guarda de sessão: se não estiver autenticado, redireciona para /login
    const ok = await ensureSession();
    if (!ok) return; // o ensureSession cuida do redirect
    // Configurar navegação
    setupNavigation();
    // Configurar modal do diagrama
    setupDiagramModal();
    
    // Sempre iniciar na tela inicial (catálogo) e limpar estados persistidos
    try {
      localStorage.removeItem('checkoutFormState');
      localStorage.removeItem('activeView');
    } catch {}
    setView('catalog');

    // Exibir toast de sucesso vindo do login, se existir
    try {
      const t = sessionStorage.getItem('toast');
      if (t) { toast(t, 'success'); sessionStorage.removeItem('toast'); }
    } catch {}
    
    // Esquecer carrinho ao recarregar (limpa estado no backend)
    clearCart(true).catch(() => {});
    
    // Carregar dados iniciais
    loadInitialData();
}

async function ensureSession(){
    try {
        const r = await fetch(`${baseUrl}/api/auth/me`, { credentials: 'include' });
        if (!r.ok) {
            if (r.status === 401) {
                window.location.href = '/login';
                return false;
            }
            return false;
        }
        const user = await r.json();
        currentUser = user;
        injectUserHeader(user);
        return true;
    } catch (e) {
        // Falha de rede: fallback
        window.location.href = '/login';
        return false;
    }
}

function injectUserHeader(user){
    const container = document.querySelector('.header .container');
    if (!container) return;
    let el = document.querySelector('#userArea');
    if (!el) {
        el = document.createElement('div');
        el.id = 'userArea';
        el.className = 'd-flex align-items-center gap-2 ms-3';
        el.innerHTML = `
            <button id="logoutBtn" class="btn btn-outline-danger btn-sm">Sair</button>
        `;
        container.appendChild(el);
        const btn = el.querySelector('#logoutBtn');
        btn.addEventListener('click', doLogout);
    }
    // Garantir o toggle ao lado do botão de sair
    if (!el.querySelector('.theme-toggle')) {
        const tgl = document.createElement('button');
        tgl.className = 'theme-toggle ms-1';
        tgl.id = 'themeToggleHeader';
        tgl.setAttribute('aria-label', 'Alternar tema');
        tgl.textContent = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? '🌙' : '☀️';
        el.appendChild(tgl);
        initThemeToggle();
    }
}

async function doLogout(){
    try {
        const r = await fetch(`${baseUrl}/api/logout`, { method: 'POST', credentials: 'include' });
        if (r.ok) {
            try { sessionStorage.setItem('toast', 'Sessão encerrada'); } catch {}
            window.location.href = '/login';
        } else {
            toast('Falha ao encerrar sessão', 'error');
        }
    } catch (e) {
        toast('Erro de rede ao sair', 'error');
    }
}

// === NAVEGAÇÃO SPA ===
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            setView(view);
        });
    });
    // Clique no título "Mercado Online" volta para a página inicial
    const logoLink = document.querySelector('.navbar-brand.logo');
    if (logoLink) {
        logoLink.addEventListener('click', (e) => {
            e.preventDefault();
            setView('catalog');
        });
    }
}

// === Tema: Dark/Light ===
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.setAttribute('data-bs-theme', t);
  // Atualiza todos ícones de toggle
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.textContent = t === 'dark' ? '🌙' : '☀️';
  });
}

function initThemeToggle() {
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('theme', next);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const currentTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(currentTheme);
  initThemeToggle();
});

// Configuração do modal para visualizar o diagrama (.drawio)
function setupDiagramModal() {
    const modalEl = document.getElementById('diagramModal');
    const iframe = document.getElementById('diagramFrame');
    if (!modalEl || !iframe) return;

    modalEl.addEventListener('shown.bs.modal', () => {
        fetch(`diagram.drawio?${Date.now()}`)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.text();
            })
            .then(xml => {
                // Envia o XML para o viewer via postMessage (proto=json)
                try {
                    iframe.contentWindow.postMessage(JSON.stringify({ action: 'load', xml }), '*');
                } catch (e) {
                    console.error('Erro ao enviar diagrama para o viewer:', e);
                    toast('Falha ao exibir diagrama', 'error');
                }
            })
            .catch(err => {
                console.error('Erro ao carregar diagrama:', err);
                toast('Erro ao carregar o diagrama', 'error');
            });
    });
}

function setView(view) {
    // Atualizar estado
    currentView = view;
    // Não persistir view entre recargas
    
    // Atualizar navegação
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Ocultar todas as views
    document.querySelectorAll('.view').forEach(viewEl => {
        if (!viewEl.classList.contains('hidden')) {
            viewEl.classList.add('leave');
            setTimeout(() => {
                viewEl.classList.add('hidden');
                viewEl.classList.remove('leave');
            }, 300);
        }
    });
    
    // Mostrar view ativa
    setTimeout(() => {
        const activeView = document.getElementById(`view-${view}`);
        if (activeView) {
            activeView.classList.remove('hidden');
            activeView.classList.add('enter');
            setTimeout(() => {
                activeView.classList.remove('enter');
            }, 300);
        }
        
        // Carregar dados específicos da view
        loadViewData(view);
    }, 300);
}

function loadViewData(view) {
    switch (view) {
        case 'catalog':
            if (products.length === 0) {
                fetchProducts();
            } else {
                renderProducts();
            }
            break;
        case 'cart':
            getCart();
            break;
        case 'checkout':
            renderCheckout();
            break;
    }
}

function loadInitialData() {
    // Carregar produtos se estivermos na view de catálogo
    if (currentView === 'catalog') {
        fetchProducts();
    }
    
    // Atualizar badge do carrinho
    updateCartBadge();
}

// === API FUNCTIONS ===
async function fetchProducts() {
    try {
        showSkeletonProducts();
        
        const response = await fetch(`${baseUrl}/api/products`, { credentials: 'include' });
        if (response.status === 401) { window.location.href = '/login'; return; }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        products = await response.json();
        renderProducts();
        hideSkeletonProducts();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        toast('Falha ao carregar catálogo', 'error');
        hideSkeletonProducts();
    }
}

async function addToCart(productId, quantity) {
    try {
        const response = await fetch(`${baseUrl}/api/cart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                product_id: productId,
                qty: quantity
            })
        });
        if (response.status === 401) { window.location.href = '/login'; return; }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        toast('Item adicionado ao carrinho', 'success');
        updateCartBadge();
        
        return result;
    } catch (error) {
        console.error('Erro ao adicionar ao carrinho:', error);
        toast('Erro ao adicionar produto', 'error');
        throw error;
    }
}

async function getCart() {
    try {
        showSkeletonCart();
        
        const response = await fetch(`${baseUrl}/api/cart`, { credentials: 'include' });
        if (response.status === 401) { window.location.href = '/login'; return; }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const cart = await response.json();
        cartItems = cart.items || [];
        renderCart(cart);
        renderTotals(cart);
        updateCartBadge();
        
        return cart;
    } catch (error) {
        console.error('Erro ao carregar carrinho:', error);
        toast('Erro ao carregar carrinho', 'error');
        hideSkeletonCart();
    }
}

async function updateCartItem(productId, quantity) {
    try {
        const response = await fetch(`${baseUrl}/api/cart/${productId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ qty: quantity })
        });
        if (response.status === 401) { window.location.href = '/login'; return; }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        // Recarregar carrinho
        await getCart();
        
        return result;
    } catch (error) {
        console.error('Erro ao atualizar item:', error);
        toast('Erro ao atualizar item', 'error');
        throw error;
    }
}

async function clearCart(silent = false) {
    try {
        const response = await fetch(`${baseUrl}/api/cart/clear`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        cartItems = [];
        if (!silent) { toast('Carrinho limpo!', 'success'); }
        getCart();
        updateCartBadge();
    } catch (error) {
        console.error('Erro ao limpar carrinho:', error);
        toast('Erro ao limpar carrinho', 'error');
    }
}

async function checkout(orderData) {
    try {
        const response = await fetch(`${baseUrl}/api/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(orderData)
        });
        if (response.status === 401) { window.location.href = '/login'; return; }
        
        const text = await response.text();
        let payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch {}
        if (!response.ok) {
            const err = new Error((payload && (payload.error || payload.message)) || `HTTP ${response.status}`);
            err.status = response.status;
            err.field = payload.field || null;
            err.error = (payload && payload.error) || null;
            throw err;
        }
        return payload;
    } catch (error) {
        console.error('Erro no checkout:', error);
        if (error.status === 422 || error.field === 'email') {
            const emailInput = document.querySelector('#checkout-form [type="email"]');
            if (emailInput) {
                emailInput.classList.add('is-invalid');
                const feedback = document.getElementById('email-error');
                if (feedback) feedback.classList.remove('hidden');
                try { emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
                emailInput.focus();
            }
            // Usar mensagem inline abaixo do campo, sem toast
        } else if (String(error.message || '').toLowerCase().includes('carrinho está vazio')) {
            toast('⚠️ O carrinho está vazio. Adicione produtos antes de finalizar.', 'info');
        } else {
            toast('Erro ao finalizar pedido', 'error');
        }
        throw error;
    }
}

// === RENDER FUNCTIONS ===
function renderProducts() {
    const container = document.getElementById('catalog-content');
    
    if (products.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <h3>Nenhum produto encontrado</h3>
                <p class="text-secondary">Não há produtos disponíveis no momento.</p>
                <button class="btn" onclick="fetchProducts()">
                    Tentar Novamente
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="grid grid-auto">
            ${products.map(product => `
                <div class="card product-card">
                    <div class="product-image-container">
                        <img src="${product.image_url || ''}" 
                             alt="${product.name}" 
                             class="product-image"
                             onerror="handleImageError(this)">
                    </div>
                    <h3 class="product-name">${product.name}</h3>
                    <p class="product-price">${fmtMoney(product.price_cents)}</p>
                    <div class="product-actions">
                        <input type="number" 
                               class="qty-input" 
                               value="1" 
                               min="1" 
                               max="${product.stock || 99}" 
                               id="qty-${product.id}"
                               aria-label="Quantidade de ${product.name}">
                        <button class="btn" 
                                onclick="handleAddToCart(${product.id})"
                                aria-label="Adicionar ${product.name} ao carrinho">
                            Adicionar
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderCart(cart) {
    const container = document.getElementById('cart-content');
    
    if (!cart.items || cart.items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🛒</div>
                <h3>Seu carrinho está vazio</h3>
                <p class="text-secondary">Adicione produtos ao seu carrinho para continuar.</p>
                <button class="btn" onclick="setView('catalog')">
                    Continuar Comprando
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <!-- Tabela (Desktop) -->
        <div class="d-none d-md-block">
            <div class="table-responsive">
                <table class="table table-hover table-striped align-middle d-none d-md-table mb-3">
                    <thead>
                        <tr>
                            <th style="width:40%;">Produto</th>
                            <th class="text-center" style="width:120px;">Quantidade</th>
                            <th class="text-end" style="width:100px;">Preço Unitário</th>
                            <th class="text-end" style="width:100px;">Total</th>
                            <th class="text-center" style="width:80px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cart.items.map(item => `
                            <tr class="cart-item" data-product-id="${item.product_id}">
                                <td style="width:40%;">
                                    <div class="fw-semibold">${item.name}</div>
                                </td>
                                <td class="text-center" style="width:120px;">
                                    <div class="input-group input-group-sm justify-content-center">
                                        <button class="btn btn-outline-secondary" type="button" onclick="adjustCartQuantity('${item.product_id}', -1)">-</button>
                                        <input type="number" value="${item.qty}" min="0" class="form-control qty-input text-center" onchange="handleUpdateQuantity('${item.product_id}', this.value)">
                                        <button class="btn btn-outline-secondary" type="button" onclick="adjustCartQuantity('${item.product_id}', 1)">+</button>
                                    </div>
                                </td>
                                <td class="text-end" style="width:100px;"><span class="item-price">${fmtMoney(item.unit_price_cents)}</span></td>
                                <td class="text-end fw-bold" style="width:100px;"><span class="item-total">${fmtMoney(item.line_total_cents)}</span></td>
                                <td class="text-center" style="width:80px;">
                                    <button class="btn btn-danger btn-sm" onclick="handleUpdateQuantity('${item.product_id}', 0)" aria-label="Remover item">
                                        <i class="bi bi-trash" aria-hidden="true"></i>
                                        <span class="visually-hidden">Remover</span>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Cards (Mobile) -->
        <div class="d-md-none">
            <div class="cart-items">
                ${cart.items.map(item => `
                    <div class="cart-item card shadow-sm rounded mb-2" data-product-id="${item.product_id}">
                        <div class="card-body p-3">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <h4 class="h6 mb-0">${item.name}</h4>
                                <button class="btn btn-danger btn-sm" onclick="handleUpdateQuantity('${item.product_id}', 0)" aria-label="Remover item">🗑️</button>
                            </div>
                            <div class="row g-2 align-items-center">
                                <div class="col-6">
                                    <small class="text-secondary">Preço unitário</small>
                                    <div class="item-price fw-semibold">${fmtMoney(item.unit_price_cents)}</div>
                                </div>
                                <div class="col-6 text-end">
                                    <small class="text-secondary">Subtotal</small>
                                    <div class="item-total fw-bold">${fmtMoney(item.line_total_cents)}</div>
                                </div>
                                <div class="col-12">
                                    <div class="input-group input-group-sm">
                                        <button class="btn btn-outline-secondary" type="button" onclick="adjustCartQuantity('${item.product_id}', -1)">-</button>
                                        <input type="number" value="${item.qty}" min="0" class="form-control qty-input text-center" onchange="handleUpdateQuantity('${item.product_id}', this.value)">
                                        <button class="btn btn-outline-secondary" type="button" onclick="adjustCartQuantity('${item.product_id}', 1)">+</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Ações principais ficam no Resumo do Pedido (lado direito) -->
    `;
}

function renderTotals(cart) {
    const container = document.getElementById('cart-totals');
    
    if (!cart.items || cart.items.length === 0) {
        container.innerHTML = '';
        return;
    }
    const totalUnits = (cart.items || []).reduce((sum, item) => {
        const q = (item.qty != null) ? item.qty : (item.quantity != null ? item.quantity : 0);
        return sum + (parseInt(q, 10) || 0);
    }, 0);
    
    container.innerHTML = `
        <div class="totals-box card p-3 shadow-sm rounded-3 cart-summary">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <h3 class="h5 mb-0">Resumo do Pedido</h3>
                <span class="badge bg-secondary">${totalUnits} itens no carrinho</span>
            </div>
            <div class="d-flex justify-content-between py-1 border-bottom border-secondary-subtle">
                <span class="text-secondary">Subtotal</span>
                <span>${fmtMoney(cart.subtotal_cents || 0)}</span>
            </div>
            <div class="d-flex justify-content-between py-1 border-bottom border-secondary-subtle">
                <span class="text-secondary">Frete</span>
                <span>${fmtMoney(cart.shipping_cents || 0)}</span>
            </div>
            <div class="d-flex justify-content-between py-2">
                <span class="fw-bold">Total</span>
                <span class="fw-bold fs-5">${fmtMoney(cart.total_cents || 0)}</span>
            </div>
            <button class="btn btn-primary btn-lg w-100 mt-2" onclick="setView('checkout')">Finalizar Compra</button>
            <button class="btn btn-outline-danger w-100 mt-2" onclick="clearCart()"><i class="bi bi-trash me-1"></i>Limpar Carrinho</button>
        </div>
    `;
}

function renderCheckout() {
    const container = document.getElementById('checkout-content');
    
    container.innerHTML = `
      <div class="container my-4">
        <div class="card checkout-card p-4 shadow-sm">
          <form id="checkout-form" novalidate>
            <!-- Dados Pessoais -->
            <div class="card mb-3 bg-dark-subtle">
              <div class="card-header"><strong>Dados Pessoais</strong></div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-12">
                    <div class="form-floating">
                      <input type="text" class="form-control" id="customer-name" name="name" placeholder="Nome completo" required>
                      <label for="customer-name">Nome Completo *</label>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="form-floating">
                      <input type="email" class="form-control" id="customer-email" name="email" placeholder="email@exemplo.com" required>
                      <label for="customer-email">E-mail *</label>
                    </div>
                    <small id="email-error" class="invalid-feedback hidden">Digite um e-mail válido</small>
                  </div>
                </div>
              </div>
            </div>

            <!-- Endereço de Entrega -->
            <div class="card mb-3 bg-dark-subtle">
              <div class="card-header"><strong>Endereço de Entrega</strong></div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-12 col-md-4">
                    <div class="form-floating position-relative">
                      <input type="text" class="form-control" id="customer-zip" name="zip" placeholder="00000-000" required>
                      <label for="customer-zip">CEP *</label>
                      <button type="button" class="btn btn-outline-primary btn-sm position-absolute end-0 top-50 translate-middle-y me-2" id="btn-buscar-cep">Buscar CEP</button>
                    </div>
                    <div id="cep-status" class="form-text mt-1" aria-live="polite"></div>
                  </div>
                  <div class="col-12 col-md-8">
                    <div class="form-floating">
                      <input type="text" class="form-control" id="customer-address" name="address" placeholder="Endereço" required>
                      <label for="customer-address">Endereço *</label>
                    </div>
                  </div>
                  <div class="col-6 col-md-3">
                    <div class="form-floating">
                      <input type="text" class="form-control" id="customer-number" placeholder="Número">
                      <label for="customer-number">Número</label>
                    </div>
                  </div>
                  <div class="col-6 col-md-3">
                    <div class="form-floating">
                      <input type="text" class="form-control" id="customer-complement" placeholder="Complemento">
                      <label for="customer-complement">Complemento</label>
                    </div>
                  </div>
                  <div class="col-12 col-md-6">
                    <div class="form-floating">
                      <input type="text" class="form-control" id="customer-neighborhood" placeholder="Bairro">
                      <label for="customer-neighborhood">Bairro</label>
                    </div>
                  </div>
                  <div class="col-8 col-md-6">
                    <div class="form-floating">
                      <input type="text" class="form-control" id="customer-city" name="city" placeholder="Cidade" required>
                      <label for="customer-city">Cidade *</label>
                    </div>
                  </div>
                  <div class="col-4 col-md-2">
                    <div class="form-floating">
                      <input type="text" class="form-control" id="customer-uf" placeholder="UF" maxlength="2">
                      <label for="customer-uf">UF</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Método de Pagamento -->
            <div class="card mb-3 bg-dark-subtle">
              <div class="card-header"><strong>Método de Pagamento</strong></div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-12 col-md-6">
                    <label class="pay-tile active" data-method="pix" title="Sem taxas" data-bs-toggle="tooltip">
                      <input type="radio" class="visually-hidden" name="payment_method" value="pix" checked>
                      <span class="pay-logo" aria-hidden="true">
                        <!-- PIX SVG simples -->
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="#28a745" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l5 5-5 5-5-5 5-5zm0 8l5 5-5 5-5-5 5-5z"/></svg>
                      </span>
                      <div>
                        <div class="fw-semibold">PIX</div>
                        <small class="text-secondary">Processado em minutos</small>
                      </div>
                    </label>
                  </div>
                  <div class="col-12 col-md-6">
                    <label class="pay-tile" data-method="credit" title="Parcelamento disponível" data-bs-toggle="tooltip">
                      <input type="radio" class="visually-hidden" name="payment_method" value="credit">
                      <i class="bi bi-credit-card pay-logo" aria-hidden="true"></i>
                      <div>
                        <div class="fw-semibold">Cartão de Crédito</div>
                        <small class="text-secondary">Até 12x</small>
                      </div>
                    </label>
                  </div>
                </div>
                <div id="installments-block" class="row g-2 mt-2 d-none" aria-live="polite">
                  <div class="col-12 col-md-4">
                    <label for="installments" class="form-label">Parcelas</label>
                    <select id="installments" class="form-select" aria-label="Selecionar número de parcelas">
                      ${Array.from({length:12}, (_,i)=>`<option value="${i+1}">${i+1}x</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-12 col-md-8 align-self-end">
                    <div id="installments-preview" class="text-secondary small" aria-live="polite"></div>
                    <div id="installments-interest-note" class="text-secondary small mt-1" aria-live="polite"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Termos & Finalização -->
            <div class="card mb-3 bg-dark-subtle">
              <div class="card-header"><strong>Termos & Finalização</strong></div>
              <div class="card-body">
                <div class="form-check mb-2">
                  <input class="form-check-input" type="checkbox" id="acceptTerms" required>
                  <label class="form-check-label" for="acceptTerms">Aceito os termos e condições</label>
                  <a href="#" class="ms-2" data-bs-toggle="modal" data-bs-target="#termosModal">Termos</a>
                </div>
                <div id="termsMsg" class="terms-hint d-none" aria-live="polite"></div>
                <div class="row g-2 align-items-stretch checkout-actions mt-2">
                  <div class="col-12 col-md-4">
                    <button id="btnBackCart" type="button" class="btn btn-outline-secondary w-100" onclick="setView('cart')">Voltar ao Carrinho</button>
                  </div>
                  <div class="col-12 col-md-8">
                    <button id="btnSubmitOrder" type="submit" class="btn btn-primary w-100" disabled>Finalizar Pedido</button>
                  </div>
                </div>
              </div>
            </div>
          </form>

          <!-- Modal de Termos estático no index.html -->

          <div id="order-success" class="order-success hidden">
            <div class="success-content">
              <div class="success-icon">✅</div>
              <h3>Pedido Realizado com Sucesso!</h3>
              <div class="order-details">
                <p><strong>Número do Pedido:</strong> <span id="order-id"></span></p>
                <p><strong>Data:</strong> <span id="order-date"></span></p>
                <p><strong>Total:</strong> <span id="order-total"></span></p>
              </div>
              <div id="payment-message" class="payment-message-container hidden"></div>
              <div class="order-items">
                <h4>Produtos Comprados:</h4>
                <div id="order-products"></div>
              </div>
              <button class="btn btn-primary" onclick="handleNewOrder()">Fazer Novo Pedido</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Configurar evento do formulário
    const form = document.getElementById('checkout-form');
    form.addEventListener('submit', handleCheckoutSubmit);

    // Persistir alterações do formulário
    const persistHandler = () => saveCheckoutState();
    form.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', persistHandler);
      el.addEventListener('change', persistHandler);
    });
    
    // Termos: habilitar/desabilitar botão de envio conforme checkbox
    const termsCheckbox = document.getElementById('acceptTerms') || document.getElementById('terms-checkbox');
    const submitBtn = document.getElementById('btnSubmitOrder') || document.getElementById('checkout-btn');
    if (termsCheckbox && submitBtn) {
      const syncBtn = () => {
        submitBtn.disabled = !termsCheckbox.checked;
      };
      termsCheckbox.addEventListener('change', syncBtn);
      syncBtn();
    }

    // Botão "Li e entendi" no modal de termos marca automaticamente a opção Aceito os termos
    const termosEntendiBtn = document.getElementById('btnTermosEntendi');
    if (termosEntendiBtn) {
      termosEntendiBtn.addEventListener('click', () => {
        const chk = document.getElementById('acceptTerms') || document.getElementById('terms-checkbox');
        if (chk) {
          chk.checked = true;
          chk.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const termsMsg = document.getElementById('termsMsg');
        if (termsMsg) {
          termsMsg.classList.add('d-none');
          termsMsg.textContent = '';
        }
      });
    }
    
    // CEP: máscara e busca
    const zipInput = document.getElementById('customer-zip');
    const cepBtn = document.getElementById('btn-buscar-cep');
    const cepStatus = document.getElementById('cep-status');
    zipInput.addEventListener('input', (e) => maskCep(e.target));
    zipInput.addEventListener('blur', () => fetchCep(zipInput.value, cepStatus));
    if (cepBtn) cepBtn.addEventListener('click', () => fetchCep(zipInput.value, cepStatus));

    // Enter no campo CEP: mesma ação do botão Buscar CEP
    zipInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        fetchCep(zipInput.value, cepStatus);
      }
    });

    // Tiles de pagamento: alternar visual e manter value
    const tiles = Array.from(document.querySelectorAll('.pay-tile'));
    const installmentsBlock = document.getElementById('installments-block');
    const installmentsSelect = document.getElementById('installments');
    const installmentsPreview = document.getElementById('installments-preview');
    const installmentsNote = document.getElementById('installments-interest-note');

    const cartTotalCents = (cartItems || []).reduce((sum, item) => {
      const line = (item.line_total_cents != null) ? item.line_total_cents : ((item.unit_price_cents || 0) * (item.qty || item.quantity || 0));
      return sum + (line || 0);
    }, 0);

    const calcInstallmentsPreview = (totalCents, n) => {
      let totalFinal = totalCents;
      if (n >= 3) {
        const meses = n - 2;
        totalFinal = Math.round(totalCents * (1 + 0.02 * meses)); // preview; autoridade: backend
      }
      const parcela = Math.ceil(totalFinal / n);
      return { totalFinal, parcela };
    };

    const updatePreview = () => {
      const n = parseInt(installmentsSelect.value || '1', 10);
      const { totalFinal, parcela } = calcInstallmentsPreview(cartTotalCents, n);
      if (installmentsPreview) {
        installmentsPreview.textContent = `Ex.: ${n}x de ${fmtMoney(parcela)} (total ${fmtMoney(totalFinal)})`;
      }
      if (installmentsNote) {
        installmentsNote.textContent = n >= 3
          ? 'A partir de 3 parcelas, aplica-se juros de 2% ao mês.'
          : 'Sem juros até 2 parcelas.';
      }
    };

    tiles.forEach(tile => {
      tile.addEventListener('click', () => {
        tiles.forEach(t => t.classList.remove('active'));
        tile.classList.add('active');
        const input = tile.querySelector('input[type="radio"]');
        if (input) input.checked = true;

        const method = tile.getAttribute('data-method');
        if (method === 'credit') {
          installmentsBlock.classList.remove('d-none');
          updatePreview();
        } else {
          installmentsBlock.classList.add('d-none');
        }
        saveCheckoutState();
      });
    });

    if (installmentsSelect) {
      installmentsSelect.addEventListener('change', updatePreview);
      installmentsSelect.addEventListener('change', saveCheckoutState);
    }

    // Inicializar tooltips do Bootstrap, se disponíveis
    if (window.bootstrap && bootstrap.Tooltip) {
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));
    }

    // Reidratar formulário com estado persistido
    hydrateCheckoutForm();
}

function saveCheckoutState() {
  const form = document.getElementById('checkout-form');
  if (!form) return;
  const getVal = (sel) => {
    const el = form.querySelector(sel);
    return el ? el.value : '';
  };
  const getChecked = (sel) => {
    const el = form.querySelector(sel);
    return el ? !!el.checked : false;
  };
  const methodEl = form.querySelector('input[name="payment_method"]:checked');
  const installmentsEl = form.querySelector('#installments');
  checkoutFormState = {
    name: getVal('#customer-name'),
    email: getVal('#customer-email'),
    zip: getVal('#customer-zip'),
    address: getVal('#customer-address'),
    number: getVal('#customer-number'),
    complement: getVal('#customer-complement'),
    neighborhood: getVal('#customer-neighborhood'),
    city: getVal('#customer-city'),
    uf: getVal('#customer-uf'),
    acceptTerms: getChecked('#acceptTerms'),
    payment_method: methodEl ? methodEl.value : 'pix',
    installments: installmentsEl ? parseInt(installmentsEl.value || '1', 10) : 1,
  };
  try { localStorage.setItem('checkoutFormState', JSON.stringify(checkoutFormState)); } catch {}
}

function hydrateCheckoutForm() {
  const form = document.getElementById('checkout-form');
  if (!form) return;
  const s = checkoutFormState || {};
  const setVal = (sel, val) => { const el = form.querySelector(sel); if (el && val != null) el.value = val; };
  const setChecked = (sel, val) => { const el = form.querySelector(sel); if (el) el.checked = !!val; };
  setVal('#customer-name', s.name || '');
  setVal('#customer-email', s.email || '');
  setVal('#customer-zip', s.zip || '');
  setVal('#customer-address', s.address || '');
  setVal('#customer-number', s.number || '');
  setVal('#customer-complement', s.complement || '');
  setVal('#customer-neighborhood', s.neighborhood || '');
  setVal('#customer-city', s.city || '');
  setVal('#customer-uf', s.uf || '');
  setChecked('#acceptTerms', !!s.acceptTerms);
  const submitBtn = document.getElementById('btnSubmitOrder');
  if (submitBtn) submitBtn.disabled = !document.getElementById('acceptTerms').checked;
  // Método de pagamento
  const method = s.payment_method || 'pix';
  const tiles = Array.from(document.querySelectorAll('.pay-tile'));
  tiles.forEach(t => {
    const radio = t.querySelector('input[type="radio"]');
    const m = t.getAttribute('data-method');
    const active = m === method;
    t.classList.toggle('active', active);
    if (radio) radio.checked = active;
  });
  const installmentsBlock = document.getElementById('installments-block');
  const installmentsSelect = document.getElementById('installments');
  if (method === 'credit') {
    installmentsBlock.classList.remove('d-none');
    if (installmentsSelect && s.installments) {
      installmentsSelect.value = String(s.installments);
    }
    // Atualiza preview após reidratar
    const cartTotalCents = (cartItems || []).reduce((sum, item) => {
      const line = (item.line_total_cents != null) ? item.line_total_cents : ((item.unit_price_cents || 0) * (item.qty || item.quantity || 0));
      return sum + (line || 0);
    }, 0);
    const n = parseInt(installmentsSelect.value || '1', 10);
    const meses = n >= 3 ? (n - 2) : 0;
    const totalFinal = Math.round(cartTotalCents * (1 + 0.02 * meses));
    const parcela = Math.ceil(totalFinal / n);
    const installmentsPreview = document.getElementById('installments-preview');
    if (installmentsPreview) installmentsPreview.textContent = `Ex.: ${n}x de ${fmtMoney(parcela)} (total ${fmtMoney(totalFinal)})`;
    const installmentsNote = document.getElementById('installments-interest-note');
    if (installmentsNote) {
      installmentsNote.textContent = n >= 3
        ? 'A partir de 3 parcelas, aplica-se juros de 2% ao mês.'
        : 'Sem juros até 2 parcelas.';
    }
  } else {
    installmentsBlock.classList.add('d-none');
  }
}

// === SKELETON LOADING ===
function showSkeletonProducts() {
    const container = document.getElementById('catalog-content');
    container.innerHTML = `
        <div class="grid grid-auto">
            ${Array(6).fill().map(() => `
                <div class="card">
                    <div class="skeleton" style="height: 200px; margin-bottom: 1rem;"></div>
                    <div class="skeleton" style="height: 1.5rem; margin-bottom: 0.5rem;"></div>
                    <div class="skeleton" style="height: 1rem; width: 60%;"></div>
                </div>
            `).join('')}
        </div>
    `;
}

function hideSkeletonProducts() {
    const container = document.getElementById('catalog-content');
    if (!container) return;
    // Só remove o skeleton se ainda estiver presente, sem sobrescrever o conteúdo já renderizado
    if (container.querySelector('.skeleton')) {
        container.innerHTML = '';
    }
}

function showSkeletonCart() {
    const container = document.getElementById('cart-content');
    container.innerHTML = `
        <div class="cart-items">
            ${Array(3).fill().map(() => `
                <div class="card">
                    <div class="skeleton" style="height: 1.5rem; margin-bottom: 0.5rem;"></div>
                    <div class="skeleton" style="height: 1rem; width: 40%; margin-bottom: 1rem;"></div>
                    <div class="skeleton" style="height: 2rem; width: 100px;"></div>
                </div>
            `).join('')}
        </div>
    `;
}

function hideSkeletonCart() {
    const container = document.getElementById('cart-content');
    container.innerHTML = '<p class="text-center text-secondary">Erro ao carregar carrinho.</p>';
}

// === EVENT HANDLERS ===

let updateTimeout;
function handleUpdateQuantity(productId, quantity) {
    clearTimeout(updateTimeout);
    // Feedback visual
    const row = document.querySelector(`.cart-item[data-product-id="${productId}"]`);
    if (row) {
        const q = parseInt(quantity);
        if (q === 0) {
            row.classList.add('fade-out');
        } else {
            row.classList.add('highlight');
            const totalEl = row.querySelector('.item-total');
            if (totalEl) {
                totalEl.classList.add('highlight');
                setTimeout(() => totalEl.classList.remove('highlight'), 500);
            }
            setTimeout(() => row.classList.remove('highlight'), 500);
        }
    }
    updateTimeout = setTimeout(() => {
        updateCartItem(productId, parseInt(quantity));
    }, 200); // Debounce reduzido para 200ms para responder melhor a cliques rápidos
}

function adjustCartQuantity(productId, delta) {
    const row = document.querySelector(`.cart-item[data-product-id="${productId}"]`);
    const input = row ? row.querySelector('.qty-input') : null;
    let current = input ? parseInt(input.value) : 0;
    if (isNaN(current)) current = 0;
    const newQty = Math.max(current + delta, 0);
    if (input) input.value = newQty;
    handleUpdateQuantity(productId, newQty);
}

async function handleCheckoutSubmit(event) {
    event.preventDefault();

    // Verificar carrinho vazio no frontend e avisar com toast informativo
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
        toast('⚠️ O carrinho está vazio. Adicione produtos antes de finalizar.', 'info');
        return;
    }

    const form = event.target;
    const formData = new FormData(form);
    const submitBtn = document.getElementById('btnSubmitOrder') || document.getElementById('checkout-btn');
    const backBtn = document.getElementById('btnBackCart');
    const termsCheckbox = document.getElementById('acceptTerms') || form.querySelector('#acceptTerms') || form.querySelector('#terms-checkbox');
    const termsMsg = document.getElementById('termsMsg');
    
    // Validar termos antes de qualquer envio
    if (termsCheckbox && !termsCheckbox.checked) {
        if (termsMsg) {
            termsMsg.textContent = 'Marque os termos para continuar.';
            termsMsg.classList.remove('d-none');
            termsMsg.classList.add('terms-error');
        }
        termsCheckbox.classList.add('is-invalid');
        try { termsCheckbox.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        try { termsCheckbox.focus({ preventScroll: true }); } catch {}
        setTimeout(() => termsCheckbox.classList.remove('is-invalid'), 2000);
        return;
    } else if (termsMsg) {
        termsMsg.classList.add('d-none');
        termsMsg.textContent = '';
    }

    // Validar formulário
    if (!validateCheckoutForm(form)) {
        return;
    }
    
    // Preparar dados do pedido
    const orderData = {
        customer_name: formData.get('name'),
        customer_email: formData.get('email'),
        shipping_address: formData.get('address'),
        city: formData.get('city'),
        zip_code: formData.get('zip'),
        payment_method: formData.get('payment_method') // PIX ou cartao escolhido pelo usuário
    };

    // Incluir seleção de parcelas quando for cartão
    const selectedMethod = orderData.payment_method;
    const installmentsSelect = document.getElementById('installments');
    if (selectedMethod === 'credit' && installmentsSelect) {
        const n = parseInt(installmentsSelect.value || '1', 10);
        orderData.payment = { method: 'credit', installments: n };
    } else {
        orderData.payment = { method: selectedMethod };
    }
    
    try {
        // Mostrar estado de loading
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `
          <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
          Processando…
            `;
        }
        if (backBtn) backBtn.disabled = true;
        
        // Enviar pedido
        const result = await checkout(orderData);
        
        // Mostrar tela de sucesso
        showOrderSuccess(result);
        
        // Limpar carrinho
        cartItems = [];
        updateCartBadge();
        
    } catch (error) {
        console.error('Erro no checkout:', error);
        // Feedback específico já mostrado dentro de checkout(orderData) (info para carrinho vazio, inline para e-mail inválido).
    } finally {
        // Restaurar botão
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Finalizar Pedido';
        }
        if (backBtn) backBtn.disabled = false;
    }
}

function validateCheckoutForm(form) {
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    let firstInvalid = null;
    
    requiredFields.forEach(field => {
        const val = (typeof field.value === 'string') ? field.value.trim() : field.value;
        const empty = val === '' || val == null;
        if (empty) {
            field.style.borderColor = 'var(--error)';
            try { field.classList.add('is-invalid'); } catch {}
            if (!firstInvalid) firstInvalid = field;
            isValid = false;
        } else {
            field.style.borderColor = 'var(--border)';
            try { field.classList.remove('is-invalid'); } catch {}
        }
    });
    
    // Validar e-mail
    const email = form.querySelector('[type="email"]');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && email.value && !emailRegex.test(email.value)) {
        email.classList.add('is-invalid');
        const feedback = document.getElementById('email-error');
        if (feedback) feedback.classList.remove('hidden');
        if (!firstInvalid) firstInvalid = email;
        isValid = false;
    } else {
        if (email) {
            email.classList.remove('is-invalid');
            const feedback = document.getElementById('email-error');
            if (feedback) feedback.classList.add('hidden');
        }
    }
    
    // Validar CEP
    const zip = form.querySelector('[name="zip"]');
    const zipRegex = /^\d{5}-\d{3}$/;
    if (zip && zip.value && !zipRegex.test(zip.value)) {
        zip.style.borderColor = 'var(--error)';
        toast('CEP inválido', 'error');
        if (!firstInvalid) firstInvalid = zip;
        isValid = false;
    }
    
    if (!isValid && firstInvalid) {
        try { firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        try { firstInvalid.focus({ preventScroll: true }); } catch {}
    }
    
    return isValid;
}

function showOrderSuccess(orderResult) {
    const form = document.getElementById('checkout-form');
    const success = document.getElementById('order-success');
    
    // Preencher dados do pedido
    document.getElementById('order-id').textContent = orderResult.order_id;
    // Usar data atual em vez de orderResult.created_at
    document.getElementById('order-date').textContent = new Date().toLocaleString('pt-BR');
    document.getElementById('order-total').textContent = fmtMoney(orderResult.total_cents);
    
    // Renderizar produtos comprados
    const productsContainer = document.getElementById('order-products');
    if (orderResult.items && orderResult.items.length > 0) {
        productsContainer.innerHTML = orderResult.items.map(item => `
            <div class="order-item">
                <span class="item-name">${item.name}</span>
                <span class="item-qty">Qtd: ${item.qty}</span>
                <span class="item-total">${fmtMoney(item.line_total_cents)}</span>
            </div>
        `).join('');
    } else {
        productsContainer.innerHTML = '<p>Nenhum produto encontrado.</p>';
    }
    
    // Adicionar mensagem de pagamento OOP + breakdown de parcelas/juros
    const paymentMessageContainer = document.getElementById('payment-message');
    let breakdownHtml = '';
    const method = orderResult.payment_method || null;
    const installments = orderResult.installments || null;
    const interestCents = orderResult.interest_cents || 0;
    const totalWithInterest = orderResult.total_with_interest_cents || orderResult.total_cents;
    const parcela = orderResult.installment_value_cents || null;

    if (orderResult.mensagem_pagamento || method) {
        breakdownHtml += `<div class="payment-info">`;
        breakdownHtml += `<h4>💳 Informações de Pagamento</h4>`;
        if (method === 'credit') {
            const n = installments || 1;
            breakdownHtml += `<p class="payment-message">Pagamento: Cartão de Crédito — ${n}x de ${fmtMoney(parcela || 0)} — Total c/ juros ${fmtMoney(totalWithInterest)}</p>`;
            if (interestCents && n >= 3) {
                breakdownHtml += `<p class="text-secondary">Juros aplicados: ${fmtMoney(interestCents)}</p>`;
            }
        } else if (method === 'pix') {
            breakdownHtml += `<p class="payment-message">Pagamento: PIX — à vista — ${fmtMoney(orderResult.total_cents)}</p>`;
        }
        if (orderResult.mensagem_pagamento) {
            breakdownHtml += `<p class="text-secondary">${orderResult.mensagem_pagamento}</p>`;
        }
        breakdownHtml += `</div>`;
        paymentMessageContainer.innerHTML = breakdownHtml;
        paymentMessageContainer.classList.remove('hidden');
    } else {
        paymentMessageContainer.classList.add('hidden');
    }
    
    // Mostrar tela de sucesso
    form.classList.add('hidden');
    success.classList.remove('hidden');
    // Acessibilidade: foco no card de sucesso
    success.setAttribute('tabindex', '-1');
    success.focus();
    
    toast('Pedido realizado com sucesso!', 'success');
}

function handleNewOrder() {
    // Voltar ao catálogo
    setView('catalog');
    
    // Resetar formulário de checkout
    const form = document.getElementById('checkout-form');
    const success = document.getElementById('order-success');
    
    if (form) form.classList.remove('hidden');
    if (success) success.classList.add('hidden');
    if (form) form.reset();
}

function formatZip(event) {
    let value = event.target.value.replace(/\D/g, '');
    
    if (value.length >= 5) {
        value = value.substring(0, 5) + '-' + value.substring(5, 8);
    }
    
    event.target.value = value;
}

// Máscara de CEP (99999-999)
function maskCep(input) {
  let v = (input.value || '').replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5);
  input.value = v;
}

// Buscar CEP via ViaCEP e preencher campos
async function fetchCep(cepRaw, statusEl) {
  const cep = (cepRaw || '').replace(/\D/g, '');
  const addressEl = document.getElementById('customer-address');
  const neighborhoodEl = document.getElementById('customer-neighborhood');
  const cityEl = document.getElementById('customer-city');
  const ufEl = document.getElementById('customer-uf');
  if (!statusEl) statusEl = document.getElementById('cep-status');

  if (cep.length !== 8) {
    if (statusEl) statusEl.textContent = 'CEP inválido ou não encontrado';
    return;
  }
  if (statusEl) statusEl.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Buscando CEP...';
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/.`);
    const data = await resp.json();
    if (data.erro) {
      if (statusEl) statusEl.textContent = 'CEP inválido ou não encontrado';
      return;
    }
    if (addressEl && data.logradouro) addressEl.value = data.logradouro;
    if (neighborhoodEl && data.bairro) neighborhoodEl.value = data.bairro;
    if (cityEl && data.localidade) cityEl.value = data.localidade;
    if (ufEl && data.uf) ufEl.value = data.uf;
    if (statusEl) statusEl.textContent = 'Endereço preenchido ✅';
  } catch (e) {
    if (statusEl) statusEl.textContent = 'CEP inválido ou não encontrado';
  }
}

// === UTILITY FUNCTIONS ===
function fmtMoney(cents) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(cents / 100);
}

function toast(message, type = 'success') {
    const toastContainer = document.getElementById('toasts');
    const toast = document.createElement('div');
    
    toast.className = `app-toast ${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-icon">${type === 'success' ? '✅' : (type === 'info' ? '⚠️' : '❌')}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="closeToast(this)" aria-label="Fechar notificação">×</button>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto-hide após ~3 segundos
    const autoHideTimeout = setTimeout(() => {
        removeToast(toast);
    }, 3000);
    
    // Salvar timeout para poder cancelar se usuário fechar manualmente
    toast.autoHideTimeout = autoHideTimeout;
}

function closeToast(button) {
    const toast = button.closest('.app-toast');
    if (toast.autoHideTimeout) {
        clearTimeout(toast.autoHideTimeout);
    }
    removeToast(toast);
}

function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    
    toast.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

function handleImageError(img) {
    const container = img.parentElement;
    container.innerHTML = `
        <div class="image-placeholder">
            <span class="placeholder-icon">🖼️</span>
            <span class="placeholder-text">Imagem não disponível</span>
        </div>
    `;
}

function handleAddToCart(productId) {
    const qtyInput = document.getElementById(`qty-${productId}`);
    const button = qtyInput.nextElementSibling;
    const quantity = parseInt(qtyInput.value) || 1;
    
    // Estado de loading
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Adicionando...';
    
    addToCart(productId, quantity)
        .finally(() => {
            // Restaurar botão
            button.disabled = false;
            button.textContent = originalText;
        });
}

function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    const totalItems = (cartItems || []).reduce((sum, item) => {
        const q = (item.qty != null) ? item.qty : (item.quantity != null ? item.quantity : 0);
        return sum + (parseInt(q, 10) || 0);
    }, 0);
    badge.textContent = totalItems;
    badge.style.display = totalItems > 0 ? 'inline' : 'none';
}

// Adicionar animação de slideOutRight ao CSS se não existir
if (!document.querySelector('style[data-toast-animations]')) {
    const style = document.createElement('style');
    style.setAttribute('data-toast-animations', 'true');
    style.textContent = `
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}