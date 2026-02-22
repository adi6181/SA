const API_BASE_URL = '/api';
const ADMIN_API_KEY_STORAGE = 'adminImageUploadKey';

const loginPanel = document.getElementById('loginPanel');
const dashboardPanel = document.getElementById('dashboardPanel');
const loginMessage = document.getElementById('loginMessage');
const formMessage = document.getElementById('formMessage');
const productsList = document.getElementById('productsList');
const pendingReviewsList = document.getElementById('pendingReviewsList');
const supportTicketsList = document.getElementById('supportTicketsList');

const adminKeyInput = document.getElementById('adminKeyInput');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const refreshBtn = document.getElementById('refreshBtn');
const refreshReviewsBtn = document.getElementById('refreshReviewsBtn');
const refreshTicketsBtn = document.getElementById('refreshTicketsBtn');
const importUrlInput = document.getElementById('importUrlInput');
const importUrlBtn = document.getElementById('importUrlBtn');
const importMessage = document.getElementById('importMessage');

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
    image_file: document.getElementById('image_file'),
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
    loadPendingReviews();
    loadSupportTickets();
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
refreshReviewsBtn?.addEventListener('click', loadPendingReviews);
refreshTicketsBtn?.addEventListener('click', loadSupportTickets);
importUrlBtn?.addEventListener('click', importProductByUrl);

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

function buildProductRequestBody(payload) {
    const imageFile = fields.image_file?.files?.[0];
    if (!imageFile) {
        return {
            headers: buildAdminHeaders(true),
            body: JSON.stringify(payload)
        };
    }

    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        if (Array.isArray(value)) {
            formData.append(key, value.join(', '));
            return;
        }
        formData.append(key, String(value));
    });
    formData.append('image_file', imageFile);

    return {
        headers: buildAdminHeaders(false),
        body: formData
    };
}

async function importProductByUrl() {
    const url = importUrlInput?.value.trim();
    if (!url) {
        setMessage(importMessage, 'Enter a product URL first.', 'error');
        return;
    }

    setMessage(importMessage, 'Importing product details...', 'info');
    try {
        const response = await fetch(`${API_BASE_URL}/admin/import-url`, {
            method: 'POST',
            headers: buildAdminHeaders(),
            body: JSON.stringify({ url })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'Import failed');
        }

        const cleanerNotes = (payload.ai_cleaner_report || []).slice(0, 4).join(' | ');
        const cleanerSpecs = (payload.ai_extracted_specs || []).slice(0, 3).join(', ');
        const noteParts = [payload.message || 'Product imported.'];
        if (cleanerNotes) noteParts.push(`AI cleaner: ${cleanerNotes}`);
        if (cleanerSpecs) noteParts.push(`Specs: ${cleanerSpecs}`);
        setMessage(importMessage, noteParts.join(' '), 'info');
        if (payload.product) {
            populateForm(payload.product);
            formTitle.textContent = `Edit Product #${payload.product.id}`;
        }
        if (importUrlInput) {
            importUrlInput.value = '';
        }
        loadProducts();
    } catch (error) {
        setMessage(importMessage, error.message || 'Import failed.', 'error');
    }
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

async function loadPendingReviews() {
    if (!pendingReviewsList) return;
    pendingReviewsList.innerHTML = '<p class="admin-message">Loading pending reviews...</p>';
    try {
        const response = await fetch(`${API_BASE_URL}/admin/reviews/pending`, {
            headers: buildAdminHeaders()
        });
        const reviews = await response.json();
        if (!response.ok) {
            throw new Error(reviews.error || 'Failed to load pending reviews');
        }
        renderPendingReviews(reviews || []);
    } catch (error) {
        pendingReviewsList.innerHTML = `<p class="admin-message">${error.message || 'Failed to load pending reviews.'}</p>`;
    }
}

async function loadSupportTickets() {
    if (!supportTicketsList) return;
    supportTicketsList.innerHTML = '<p class="admin-message">Loading support tickets...</p>';
    try {
        const response = await fetch(`${API_BASE_URL}/admin/support/tickets`, {
            headers: buildAdminHeaders()
        });
        const tickets = await response.json();
        if (!response.ok) {
            throw new Error(tickets.error || 'Failed to load tickets');
        }
        renderSupportTickets(tickets || []);
    } catch (error) {
        supportTicketsList.innerHTML = `<p class="admin-message">${error.message || 'Failed to load support tickets.'}</p>`;
    }
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
            <p>${ticket.message ? ticket.message.slice(0, 180) : ''}</p>
            <div class="admin-item-actions">
                <button data-status="open">Open</button>
                <button data-status="in_progress">In Progress</button>
                <button data-status="resolved">Resolve</button>
            </div>
        `;
        card.querySelectorAll('[data-status]').forEach((button) => {
            button.addEventListener('click', () => updateTicketStatus(ticket.id, button.dataset.status));
        });
        supportTicketsList.appendChild(card);
    });
}

async function updateTicketStatus(ticketId, status) {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/support/tickets/${ticketId}/status`, {
            method: 'POST',
            headers: buildAdminHeaders(),
            body: JSON.stringify({ status })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'Unable to update status');
        }
        loadSupportTickets();
    } catch (error) {
        setMessage(formMessage, error.message || 'Unable to update ticket.', 'error');
    }
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
            <p>${review.reviewer_name} · ${review.rating}/5 ${review.verified_purchase ? '· Verified Purchase' : ''}</p>
            <p>${review.title || 'Review'}</p>
            <p>${review.body ? review.body.slice(0, 180) : ''}</p>
            ${review.photo_url ? `<img src="${review.photo_url}" alt="Review photo" style="max-width:120px;border-radius:8px;border:1px solid #e2d9d3;">` : ''}
            <div class="admin-item-actions">
                <button data-action="approve">Approve</button>
                <button class="secondary" data-action="reject">Reject</button>
            </div>
        `;
        card.querySelector('[data-action="approve"]').addEventListener('click', () => moderateReview(review.id, 'approved'));
        card.querySelector('[data-action="reject"]').addEventListener('click', () => moderateReview(review.id, 'rejected'));
        pendingReviewsList.appendChild(card);
    });
}

async function moderateReview(reviewId, status) {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/reviews/${reviewId}/moderate`, {
            method: 'POST',
            headers: buildAdminHeaders(),
            body: JSON.stringify({ status })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'Moderation failed');
        }
        loadPendingReviews();
        loadProducts();
    } catch (error) {
        setMessage(formMessage, error.message || 'Moderation failed.', 'error');
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
    const requestBody = buildProductRequestBody(payload);
    const response = await fetch(`${API_BASE_URL}/products/`, {
        method: 'POST',
        headers: requestBody.headers,
        body: requestBody.body
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to create product');
    }
}

async function updateProduct(productId, payload) {
    const requestBody = buildProductRequestBody(payload);
    const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
        method: 'PUT',
        headers: requestBody.headers,
        body: requestBody.body
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

function buildAdminHeaders(includeJsonContentType = true) {
    const headers = {};
    if (includeJsonContentType) {
        headers['Content-Type'] = 'application/json';
    }
    const key = getAdminKey();
    if (key) headers['X-Admin-Key'] = key;
    return headers;
}

init();
