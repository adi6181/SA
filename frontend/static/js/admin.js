const API_BASE_URL = '/api';
const ADMIN_API_KEY_STORAGE = 'adminImageUploadKey';

const loginPanel = document.getElementById('loginPanel');
const dashboardPanel = document.getElementById('dashboardPanel');
const loginMessage = document.getElementById('loginMessage');
const formMessage = document.getElementById('formMessage');
const productsList = document.getElementById('productsList');

const adminKeyInput = document.getElementById('adminKeyInput');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const refreshBtn = document.getElementById('refreshBtn');

const productForm = document.getElementById('productForm');
const formTitle = document.getElementById('formTitle');
const productIdField = document.getElementById('productId');

const fields = {
    name: document.getElementById('name'),
    description: document.getElementById('description'),
    price: document.getElementById('price'),
    stock: document.getElementById('stock'),
    category: document.getElementById('category'),
    merchant: document.getElementById('merchant'),
    affiliate_url: document.getElementById('affiliate_url'),
    image_url: document.getElementById('image_url'),
    image_urls: document.getElementById('image_urls'),
    rating: document.getElementById('rating'),
    review_count: document.getElementById('review_count'),
    deal_price: document.getElementById('deal_price'),
    original_price: document.getElementById('original_price'),
    is_deal: document.getElementById('is_deal')
};

function getAdminKey() {
    return localStorage.getItem(ADMIN_API_KEY_STORAGE) || '';
}

function setAdminKey(key) {
    localStorage.setItem(ADMIN_API_KEY_STORAGE, key);
}

function setMessage(target, message, type = 'info') {
    target.textContent = message;
    target.style.color = type === 'error' ? '#b23b2c' : '#4a4a4a';
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

function unlockDashboard() {
    loginPanel.classList.add('hidden');
    dashboardPanel.classList.remove('hidden');
    loadProducts();
}

adminLoginBtn?.addEventListener('click', async () => {
    const key = adminKeyInput.value.trim();
    if (!key) {
        setMessage(loginMessage, 'Enter the admin key.', 'error');
        return;
    }

    try {
        await verifyLogin(key);
        setAdminKey(key);
        setMessage(loginMessage, 'Access granted.', 'info');
        unlockDashboard();
    } catch (error) {
        setMessage(loginMessage, error.message, 'error');
    }
});

refreshBtn?.addEventListener('click', loadProducts);

productForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = collectFormPayload();
    const productId = productIdField.value;

    try {
        if (productId) {
            await updateProduct(productId, payload);
            setMessage(formMessage, 'Product updated.', 'info');
        } else {
            await createProduct(payload);
            setMessage(formMessage, 'Product created.', 'info');
        }
        productForm.reset();
        productIdField.value = '';
        formTitle.textContent = 'Create Product';
        loadProducts();
    } catch (error) {
        setMessage(formMessage, error.message, 'error');
    }
});

document.getElementById('resetBtn')?.addEventListener('click', () => {
    productForm.reset();
    productIdField.value = '';
    formTitle.textContent = 'Create Product';
    setMessage(formMessage, 'Form cleared.', 'info');
});

function collectFormPayload() {
    const payload = {
        name: fields.name.value.trim(),
        description: fields.description.value.trim(),
        price: fields.price.value,
        stock: fields.stock.value,
        category: fields.category.value.trim() || null,
        merchant: fields.merchant.value.trim() || null,
        affiliate_url: fields.affiliate_url.value.trim() || null,
        image_url: fields.image_url.value.trim() || null,
        rating: fields.rating.value,
        review_count: fields.review_count.value,
        is_deal: fields.is_deal.checked,
        deal_price: fields.deal_price.value,
        original_price: fields.original_price.value
    };

    const urls = fields.image_urls.value
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    if (urls.length > 0) {
        payload.image_urls = urls;
    }

    return payload;
}

async function loadProducts() {
    productsList.innerHTML = '<p class="admin-message">Loading products...</p>';
    try {
        const response = await fetch(`${API_BASE_URL}/products/`);
        const products = await response.json();
        renderProducts(products || []);
    } catch (error) {
        productsList.innerHTML = '<p class="admin-message">Failed to load products.</p>';
    }
}

function renderProducts(products) {
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
        card.querySelector('[data-action="edit"]').addEventListener('click', () => populateForm(product));
        card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteProduct(product));
        productsList.appendChild(card);
    });
}

function populateForm(product) {
    productIdField.value = product.id;
    formTitle.textContent = `Edit Product #${product.id}`;
    fields.name.value = product.name || '';
    fields.description.value = product.description || '';
    fields.price.value = product.price || '';
    fields.stock.value = product.stock ?? 0;
    fields.category.value = product.category || '';
    fields.merchant.value = product.merchant || '';
    fields.affiliate_url.value = product.affiliate_url || '';
    fields.image_url.value = product.image_url || '';
    fields.image_urls.value = Array.isArray(product.image_urls) ? product.image_urls.join(', ') : '';
    fields.rating.value = product.rating || '';
    fields.review_count.value = product.review_count || '';
    fields.deal_price.value = product.deal_price || '';
    fields.original_price.value = product.original_price || '';
    fields.is_deal.checked = Boolean(product.is_deal);
}

async function createProduct(payload) {
    const response = await fetch(`${API_BASE_URL}/products/`, {
        method: 'POST',
        headers: buildAdminHeaders(),
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to create product');
    }
}

async function updateProduct(productId, payload) {
    const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
        method: 'PUT',
        headers: buildAdminHeaders(),
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to update product');
    }
}

async function deleteProduct(product) {
    const confirmDelete = window.confirm(`Delete ${product.name}? This cannot be undone.`);
    if (!confirmDelete) return;

    const response = await fetch(`${API_BASE_URL}/products/${product.id}`, {
        method: 'DELETE',
        headers: buildAdminHeaders()
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        setMessage(formMessage, error.error || 'Delete failed', 'error');
        return;
    }

    setMessage(formMessage, 'Product deleted.', 'info');
    loadProducts();
}

function buildAdminHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const key = getAdminKey();
    if (key) headers['X-Admin-Key'] = key;
    return headers;
}

init();
