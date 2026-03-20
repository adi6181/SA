const API_BASE_URL = '/api';
const ADMIN_API_KEY_STORAGE = 'adminImageUploadKey';

// ── DOM refs ──
const loginPanel        = document.getElementById('loginPanel');
const dashboardPanel    = document.getElementById('dashboardPanel');
const loginMessage      = document.getElementById('loginMessage');
const formMessage       = document.getElementById('formMessage');
const productsList      = document.getElementById('productsList');
const pendingReviewsList= document.getElementById('pendingReviewsList');
const supportTicketsList= document.getElementById('supportTicketsList');

const adminKeyInput  = document.getElementById('adminKeyInput');
const adminLoginBtn  = document.getElementById('adminLoginBtn');
const refreshBtn     = document.getElementById('refreshBtn');
const refreshReviewsBtn = document.getElementById('refreshReviewsBtn');
const refreshTicketsBtn = document.getElementById('refreshTicketsBtn');

const importUrlInput  = document.getElementById('importUrlInput');
const importUrlBtn    = document.getElementById('importUrlBtn');
const importMessage   = document.getElementById('importMessage');

const importUrlInputHome = document.getElementById('importUrlInputHome');
const importUrlBtnHome   = document.getElementById('importUrlBtnHome');
const importMessageHome  = document.getElementById('importMessageHome');

const productForm  = document.getElementById('productForm');
const formTitle    = document.getElementById('formTitle');
const productIdField = document.getElementById('productId');

const fields = {
    name:           document.getElementById('name'),
    description:    document.getElementById('description'),
    price:          document.getElementById('price'),
    stock:          document.getElementById('stock'),
    category:       document.getElementById('category'),
    merchant:       document.getElementById('merchant'),
    affiliate_url:  document.getElementById('affiliate_url'),
    image_url:      document.getElementById('image_url'),
    image_file:     document.getElementById('image_file'),
    image_urls:     document.getElementById('image_urls'),
    rating:         document.getElementById('rating'),
    review_count:   document.getElementById('review_count'),
    deal_price:     document.getElementById('deal_price'),
    original_price: document.getElementById('original_price'),
    is_deal:        document.getElementById('is_deal')
};

// ── Auth helpers ──
function getAdminKey() { return localStorage.getItem(ADMIN_API_KEY_STORAGE) || ''; }
function setAdminKey(key) { localStorage.setItem(ADMIN_API_KEY_STORAGE, key); }

function setMessage(target, message, type = 'info') {
    if (!target) return;
    target.textContent = message;
    target.style.color = type === 'error' ? '#dc2626' : '#059669';
}

function buildAdminHeaders(includeJson = true) {
    const headers = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    const key = getAdminKey();
    if (key) headers['X-Admin-Key'] = key;
    return headers;
}

async function verifyLogin(key) {
    const response = await fetch(`${API_BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Login failed');
    }
}

// ── Sidebar navigation ──
function showSection(name) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.asb-item').forEach(b => b.classList.remove('active'));

    const section = document.getElementById(name + 'Section');
    if (section) section.classList.add('active');

    const navBtn = document.querySelector(`.asb-item[data-section="${name}"]`);
    if (navBtn) navBtn.classList.add('active');
}

document.getElementById('asbNav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.asb-item[data-section]');
    if (!btn) return;
    showSection(btn.dataset.section);
});

document.querySelectorAll('.qa-btn-nav[data-section]').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
});

document.getElementById('goToAddProductBtn')?.addEventListener('click', () => {
    showSection('products');
    productForm?.reset();
    if (productIdField) productIdField.value = '';
    if (formTitle) formTitle.textContent = 'Create Product';
});

// ── Stats ──
async function loadStats() {
    try {
        const [productsRes, reviewsRes, ticketsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/products/`),
            fetch(`${API_BASE_URL}/admin/reviews/pending`,   { headers: buildAdminHeaders() }),
            fetch(`${API_BASE_URL}/admin/support/tickets`,   { headers: buildAdminHeaders() })
        ]);

        const products = productsRes.ok ? await productsRes.json() : [];
        const reviews  = reviewsRes.ok  ? await reviewsRes.json()  : [];
        const tickets  = ticketsRes.ok  ? await ticketsRes.json()  : [];

        const pCount = Array.isArray(products) ? products.length : 0;
        const rCount = Array.isArray(reviews)  ? reviews.length  : 0;
        const tCount = Array.isArray(tickets)  ? tickets.length  : 0;

        const el = (id) => document.getElementById(id);
        if (el('statProducts')) el('statProducts').textContent = pCount;
        if (el('statReviews'))  el('statReviews').textContent  = rCount;
        if (el('statTickets'))  el('statTickets').textContent  = tCount;

        // Sidebar badges
        const rBadge = el('sidebarReviewBadge');
        const tBadge = el('sidebarTicketBadge');
        if (rBadge) { rBadge.textContent = rCount; rBadge.style.display = rCount > 0 ? '' : 'none'; }
        if (tBadge) { tBadge.textContent = tCount; tBadge.style.display = tCount > 0 ? '' : 'none'; }
    } catch (_) { /* stats are non-critical */ }
}

// ── Unlock dashboard ──
function unlockDashboard() {
    if (loginPanel)     loginPanel.classList.add('hidden');
    if (dashboardPanel) dashboardPanel.classList.remove('hidden');
    showSection('home');
    loadStats();
    loadProducts();
    loadPendingReviews();
    loadSupportTickets();
}

async function init() {
    const storedKey = getAdminKey();
    if (!storedKey) return;
    try {
        await verifyLogin(storedKey);
        unlockDashboard();
    } catch (error) {
        setMessage(loginMessage, error.message, 'error');
    }
}

adminLoginBtn?.addEventListener('click', async () => {
    const key = adminKeyInput.value.trim();
    if (!key) { setMessage(loginMessage, 'Enter the admin key.', 'error'); return; }
    try {
        await verifyLogin(key);
        setAdminKey(key);
        setMessage(loginMessage, 'Access granted.', 'info');
        unlockDashboard();
    } catch (error) {
        setMessage(loginMessage, error.message, 'error');
    }
});

// ── Refresh buttons ──
refreshBtn?.addEventListener('click', loadProducts);
refreshReviewsBtn?.addEventListener('click', loadPendingReviews);
refreshTicketsBtn?.addEventListener('click', loadSupportTickets);

// ── Import URL (Products section) ──
importUrlBtn?.addEventListener('click', () => importProductByUrl(importUrlInput, importMessage));

// ── Import URL (Home quick action) ──
importUrlBtnHome?.addEventListener('click', () => importProductByUrl(importUrlInputHome, importMessageHome));

async function importProductByUrl(inputEl, messageEl) {
    const url = inputEl?.value.trim();
    if (!url) { setMessage(messageEl, 'Enter a product URL first.', 'error'); return; }

    setMessage(messageEl, 'Importing product details...', 'info');
    try {
        const response = await fetch(`${API_BASE_URL}/admin/import-url`, {
            method: 'POST',
            headers: buildAdminHeaders(),
            body: JSON.stringify({ url })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Import failed');

        const noteParts = [payload.message || 'Product imported.'];
        const notes = (payload.ai_cleaner_report || []).slice(0, 4).join(' | ');
        const specs = (payload.ai_extracted_specs || []).slice(0, 3).join(', ');
        if (notes) noteParts.push(`AI: ${notes}`);
        if (specs) noteParts.push(`Specs: ${specs}`);
        setMessage(messageEl, noteParts.join(' '), 'info');

        if (payload.product) {
            populateForm(payload.product);
            if (formTitle) formTitle.textContent = `Edit Product #${payload.product.id}`;
            showSection('products');
        }
        if (inputEl) inputEl.value = '';
        loadProducts();
        loadStats();
    } catch (error) {
        setMessage(messageEl, error.message || 'Import failed.', 'error');
    }
}

// ── Product form ──
productForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload   = collectFormPayload();
    const productId = productIdField.value;

    try {
        if (productId) {
            await updateProduct(productId, payload);
            setMessage(formMessage, 'Product updated.', 'info');
        } else {
            await createProduct(payload);
            setMessage(formMessage, 'Product created.', 'info');
            productForm.reset();
            productIdField.value = '';
            if (formTitle) formTitle.textContent = 'Create Product';
            loadProducts();
            loadStats();
            // Return to home
            showSection('home');
            return;
        }
        productForm.reset();
        productIdField.value = '';
        if (formTitle) formTitle.textContent = 'Create Product';
        loadProducts();
        loadStats();
    } catch (error) {
        setMessage(formMessage, error.message, 'error');
    }
});

document.getElementById('resetBtn')?.addEventListener('click', () => {
    productForm.reset();
    if (productIdField) productIdField.value = '';
    if (formTitle) formTitle.textContent = 'Create Product';
    setMessage(formMessage, 'Form cleared.', 'info');
});

// ── Form helpers ──
function collectFormPayload() {
    const payload = {
        name:           fields.name.value.trim(),
        description:    fields.description.value.trim(),
        price:          fields.price.value,
        stock:          fields.stock.value,
        category:       fields.category.value.trim() || null,
        merchant:       fields.merchant.value.trim() || null,
        affiliate_url:  fields.affiliate_url.value.trim() || null,
        image_url:      fields.image_url.value.trim() || null,
        rating:         fields.rating.value,
        review_count:   fields.review_count.value,
        is_deal:        fields.is_deal.checked,
        deal_price:     fields.deal_price.value,
        original_price: fields.original_price.value
    };
    const urls = fields.image_urls.value.split(',').map(v => v.trim()).filter(Boolean);
    if (urls.length > 0) payload.image_urls = urls;
    return payload;
}

function buildProductRequestBody(payload) {
    const imageFile = fields.image_file?.files?.[0];
    if (!imageFile) {
        return { headers: buildAdminHeaders(true), body: JSON.stringify(payload) };
    }
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        if (Array.isArray(value)) { formData.append(key, value.join(', ')); return; }
        formData.append(key, String(value));
    });
    formData.append('image_file', imageFile);
    return { headers: buildAdminHeaders(false), body: formData };
}

function populateForm(product) {
    if (productIdField) productIdField.value = product.id;
    if (formTitle) formTitle.textContent = `Edit Product #${product.id}`;
    fields.name.value           = product.name || '';
    fields.description.value    = product.description || '';
    fields.price.value          = product.price || '';
    fields.stock.value          = product.stock ?? 0;
    fields.category.value       = product.category || '';
    fields.merchant.value       = product.merchant || '';
    fields.affiliate_url.value  = product.affiliate_url || '';
    fields.image_url.value      = product.image_url || '';
    fields.image_urls.value     = Array.isArray(product.image_urls) ? product.image_urls.join(', ') : '';
    fields.rating.value         = product.rating || '';
    fields.review_count.value   = product.review_count || '';
    fields.deal_price.value     = product.deal_price || '';
    fields.original_price.value = product.original_price || '';
    fields.is_deal.checked      = Boolean(product.is_deal);
}

// ── CRUD ──
async function createProduct(payload) {
    const rb = buildProductRequestBody(payload);
    const response = await fetch(`${API_BASE_URL}/products/`, {
        method: 'POST', headers: rb.headers, body: rb.body
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to create product');
    }
}

async function updateProduct(productId, payload) {
    const rb = buildProductRequestBody(payload);
    const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
        method: 'PUT', headers: rb.headers, body: rb.body
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to update product');
    }
}

async function deleteProduct(product) {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    const response = await fetch(`${API_BASE_URL}/products/${product.id}`, {
        method: 'DELETE', headers: buildAdminHeaders()
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        setMessage(formMessage, error.error || 'Delete failed', 'error');
        return;
    }
    setMessage(formMessage, 'Product deleted.', 'info');
    loadProducts();
    loadStats();
}

// ── Loaders ──
async function loadProducts() {
    if (!productsList) return;
    productsList.innerHTML = '<p class="admin-message">Loading products...</p>';
    try {
        const response = await fetch(`${API_BASE_URL}/products/`);
        const products = await response.json();
        renderProducts(products || []);
    } catch (_) {
        productsList.innerHTML = '<p class="admin-message">Failed to load products.</p>';
    }
}

async function loadPendingReviews() {
    if (!pendingReviewsList) return;
    pendingReviewsList.innerHTML = '<p class="admin-message">Loading reviews...</p>';
    try {
        const response = await fetch(`${API_BASE_URL}/admin/reviews/pending`, { headers: buildAdminHeaders() });
        const reviews = await response.json();
        if (!response.ok) throw new Error(reviews.error || 'Failed to load reviews');
        renderPendingReviews(reviews || []);
    } catch (error) {
        pendingReviewsList.innerHTML = `<p class="admin-message">${error.message}</p>`;
    }
}

async function loadSupportTickets() {
    if (!supportTicketsList) return;
    supportTicketsList.innerHTML = '<p class="admin-message">Loading tickets...</p>';
    try {
        const response = await fetch(`${API_BASE_URL}/admin/support/tickets`, { headers: buildAdminHeaders() });
        const tickets = await response.json();
        if (!response.ok) throw new Error(tickets.error || 'Failed to load tickets');
        renderSupportTickets(tickets || []);
    } catch (error) {
        supportTicketsList.innerHTML = `<p class="admin-message">${error.message}</p>`;
    }
}

// ── Renderers ──
function renderProducts(products) {
    if (!productsList) return;
    if (!products.length) {
        productsList.innerHTML = '<p class="admin-message">No products found.</p>';
        return;
    }
    productsList.innerHTML = '';
    products.forEach((product) => {
        const card = document.createElement('div');
        card.className = 'admin-item';
        card.innerHTML = `
            <h3>${product.name}</h3>
            <p>${product.category || 'Uncategorized'} · $${Number(product.price || 0).toFixed(2)}</p>
            <p>${product.description ? product.description.slice(0, 100) : ''}</p>
            <div class="admin-item-actions">
                <button data-action="edit">Edit</button>
                <button class="secondary" data-action="delete">Delete</button>
            </div>
        `;
        card.querySelector('[data-action="edit"]').addEventListener('click', () => {
            populateForm(product);
            showSection('products');
        });
        card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteProduct(product));
        productsList.appendChild(card);
    });
}

function renderPendingReviews(reviews) {
    if (!pendingReviewsList) return;
    if (!reviews.length) {
        pendingReviewsList.innerHTML = '<p class="admin-message">No pending reviews.</p>';
        return;
    }
    pendingReviewsList.innerHTML = '';
    reviews.forEach((review) => {
        const card = document.createElement('div');
        card.className = 'admin-item';
        card.innerHTML = `
            <h3>${review.product_name}</h3>
            <p>${review.reviewer_name} · ${review.rating}/5 ${review.verified_purchase ? '· Verified' : ''}</p>
            <p>${review.title || ''}</p>
            <p>${review.body ? review.body.slice(0, 200) : ''}</p>
            ${review.photo_url ? `<img src="${review.photo_url}" alt="Review photo" style="max-width:100px;border-radius:8px;margin-top:6px;">` : ''}
            <div class="admin-item-actions">
                <button data-action="approve">Approve</button>
                <button class="secondary" data-action="reject">Reject</button>
            </div>
        `;
        card.querySelector('[data-action="approve"]').addEventListener('click', () => moderateReview(review.id, 'approved'));
        card.querySelector('[data-action="reject"]').addEventListener('click',  () => moderateReview(review.id, 'rejected'));
        pendingReviewsList.appendChild(card);
    });
}

function renderSupportTickets(tickets) {
    if (!supportTicketsList) return;
    if (!tickets.length) {
        supportTicketsList.innerHTML = '<p class="admin-message">No support tickets.</p>';
        return;
    }
    supportTicketsList.innerHTML = '';
    tickets.forEach((ticket) => {
        const card = document.createElement('div');
        card.className = 'admin-item';
        card.innerHTML = `
            <h3>${ticket.ticket_number} · ${ticket.subject}</h3>
            <p>${ticket.customer_name} (${ticket.customer_email}) · ${ticket.channel}</p>
            <p>Status: ${ticket.status}</p>
            <p>${ticket.message ? ticket.message.slice(0, 200) : ''}</p>
            <div class="admin-item-actions">
                <button data-status="open">Open</button>
                <button data-status="in_progress">In Progress</button>
                <button data-status="resolved">Resolve</button>
            </div>
        `;
        card.querySelectorAll('[data-status]').forEach(btn => {
            btn.addEventListener('click', () => updateTicketStatus(ticket.id, btn.dataset.status));
        });
        supportTicketsList.appendChild(card);
    });
}

async function moderateReview(reviewId, status) {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/reviews/${reviewId}/moderate`, {
            method: 'POST', headers: buildAdminHeaders(), body: JSON.stringify({ status })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Moderation failed');
        loadPendingReviews();
        loadProducts();
        loadStats();
    } catch (error) {
        alert(error.message || 'Moderation failed.');
    }
}

async function updateTicketStatus(ticketId, status) {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/support/tickets/${ticketId}/status`, {
            method: 'POST', headers: buildAdminHeaders(), body: JSON.stringify({ status })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Unable to update status');
        loadSupportTickets();
        loadStats();
    } catch (error) {
        alert(error.message || 'Unable to update ticket.');
    }
}

init();
