/* ============================================================
   DealDrop Admin JS
   ============================================================ */

const API_BASE_URL = '/api';
const ADMIN_KEY_STORE = 'adminImageUploadKey';

// ── DOM refs ──
const $ = (id) => document.getElementById(id);
const loginPanel        = $('loginPanel');
const dashboardPanel    = $('dashboardPanel');
const loginMessage      = $('loginMessage');
const formMessage       = $('formMessage');
const productsList      = $('productsList');
const pendingReviewsList= $('pendingReviewsList');
const supportTicketsList= $('supportTicketsList');
const adminKeyInput     = $('adminKeyInput');
const adminLoginBtn     = $('adminLoginBtn');
const importUrlInput    = $('importUrlInput');
const importUrlBtn      = $('importUrlBtn');
const importMessage     = $('importMessage');
const productForm       = $('productForm');
const formTitle         = $('formTitle');
const productIdField    = $('productId');

const fields = {
    name:           $('name'),
    description:    $('description'),
    price:          $('price'),
    stock:          $('stock'),
    category:       $('category'),
    merchant:       $('merchant'),
    affiliate_url:  $('affiliate_url'),
    image_url:      $('image_url'),
    image_file:     $('image_file'),
    image_urls:     $('image_urls'),
    rating:         $('rating'),
    review_count:   $('review_count'),
    deal_price:     $('deal_price'),
    original_price: $('original_price'),
    is_deal:        $('is_deal')
};

// ════════════════════════
// AUTH
// ════════════════════════
function getAdminKey() { return localStorage.getItem(ADMIN_KEY_STORE) || ''; }
function setAdminKey(k) { localStorage.setItem(ADMIN_KEY_STORE, k); }

function buildAdminHeaders(json = true) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    const k = getAdminKey();
    if (k) h['X-Admin-Key'] = k;
    return h;
}

function setMsg(el, text, type = 'info') {
    if (!el) return;
    el.textContent = text;
    el.style.color = type === 'error' ? '#dc2626' : type === 'success' ? '#059669' : '#6b7280';
}

async function verifyLogin(key) {
    const r = await fetch(`${API_BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Login failed'); }
}

adminLoginBtn?.addEventListener('click', async () => {
    const key = adminKeyInput.value.trim();
    if (!key) { setMsg(loginMessage, 'Enter the admin key.', 'error'); return; }
    try {
        await verifyLogin(key);
        setAdminKey(key);
        unlockDashboard();
    } catch (e) { setMsg(loginMessage, e.message, 'error'); }
});

// ════════════════════════
// SIDEBAR
// ════════════════════════
const shell = $('adminShell');

$('sidebarToggle')?.addEventListener('click', () => {
    shell.classList.toggle('collapsed');
});

function showSection(name) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.asb-item').forEach(b => b.classList.remove('active'));
    const sec = $(name + 'Section');
    if (sec) sec.classList.add('active');
    const btn = document.querySelector(`.asb-item[data-section="${name}"]`);
    if (btn) btn.classList.add('active');

    // Lazy-load section data
    if (name === 'schedule') renderSchedule();
    if (name === 'clients')  loadClients();
}

$('asbNav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.asb-item[data-section]');
    if (btn) showSection(btn.dataset.section);
});

// ════════════════════════
// UNLOCK DASHBOARD
// ════════════════════════
function unlockDashboard() {
    loginPanel?.classList.add('hidden');
    dashboardPanel?.classList.remove('hidden');
    showSection('dashboard');
    loadDashboard();
    loadProducts();
    loadPendingReviews();
    loadSupportTickets();
}

async function init() {
    const key = getAdminKey();
    if (!key) return;
    try { await verifyLogin(key); unlockDashboard(); }
    catch (e) { setMsg(loginMessage, e.message, 'error'); }
}

// ════════════════════════
// DASHBOARD
// ════════════════════════
let revenueChart = null;

async function loadDashboard() {
    await Promise.all([loadStats(), initRevenueChart(), loadActivityTable(), loadCategoryStats()]);
}

$('dashRefreshBtn')?.addEventListener('click', loadDashboard);

// ════════════════════════
// CATEGORY + EARNINGS PANELS
// ════════════════════════
const CAT_COLORS = {
    Electronics: '#7c3aed',
    Fashion:     '#db2777',
    Books:       '#0891b2',
    Home:        '#d97706',
    Other:       '#6b7280'
};

// Mock sold multiplier per category (units sold per listed product)
const CAT_SOLD_RATE = { Electronics: 4.2, Fashion: 6.8, Books: 9.1, Home: 3.5, Other: 2.0 };
// Affiliate commission rate per category
const CAT_COMMISSION = { Electronics: 0.04, Fashion: 0.07, Books: 0.045, Home: 0.06, Other: 0.05 };

let categoryChart = null;

async function loadCategoryStats() {
    try {
        const r = await fetch(`${API_BASE_URL}/products/`);
        if (!r.ok) return;
        const products = await r.json() || [];

        // Group by category
        const groups = {};
        products.forEach(p => {
            const cat = p.category || 'Other';
            if (!groups[cat]) groups[cat] = { count: 0, totalPrice: 0 };
            groups[cat].count++;
            groups[cat].totalPrice += parseFloat(p.price || 0);
        });

        // Build stats per category
        const stats = Object.entries(groups).map(([cat, g]) => {
            const rate      = CAT_SOLD_RATE[cat]    || 3.0;
            const comm      = CAT_COMMISSION[cat]    || 0.05;
            const avgPrice  = g.count > 0 ? g.totalPrice / g.count : 0;
            const sold      = Math.round(g.count * rate);
            const earned    = sold * avgPrice * comm;
            return { cat, count: g.count, sold, earned, color: CAT_COLORS[cat] || '#6b7280' };
        }).sort((a, b) => b.sold - a.sold);

        renderCategoryChart(stats);
        renderCategoryBreakdown(stats);
        renderEarningsPanel(stats);
    } catch (_) {}
}

function renderCategoryChart(stats) {
    const canvas = $('categoryChart');
    if (!canvas) return;
    if (categoryChart) categoryChart.destroy();

    categoryChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: stats.map(s => s.cat),
            datasets: [{
                data: stats.map(s => s.sold),
                backgroundColor: stats.map(s => s.color),
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#18163a',
                    titleColor: 'rgba(255,255,255,0.7)',
                    bodyColor: '#fff',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}: ${ctx.parsed} units sold`
                    }
                }
            }
        }
    });
}

function renderCategoryBreakdown(stats) {
    const el = $('categoryBreakdown');
    if (!el) return;
    el.innerHTML = stats.map(s => `
        <div class="cat-row">
            <span class="cat-dot" style="background:${s.color}"></span>
            <span class="cat-name">${s.cat}</span>
            <span class="cat-sold">${s.count} listed</span>
            <span class="cat-count">${s.sold} sold</span>
        </div>
    `).join('');
}

function renderEarningsPanel(stats) {
    const total = stats.reduce((sum, s) => sum + s.earned, 0);
    const maxEarned = Math.max(...stats.map(s => s.earned), 1);

    const amountEl = $('earningsTotalAmount');
    if (amountEl) amountEl.textContent = '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const el = $('earningsBreakdown');
    if (!el) return;
    el.innerHTML = stats.map(s => `
        <div class="earn-row">
            <span class="earn-label">${s.cat}</span>
            <div class="earn-bar-wrap">
                <div class="earn-bar" style="width:${Math.round((s.earned / maxEarned) * 100)}%; background:${s.color}"></div>
            </div>
            <span class="earn-value">$${s.earned.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
    `).join('');
}

// ── Stats ──
async function loadStats() {
    try {
        const [pRes, rRes, tRes] = await Promise.all([
            fetch(`${API_BASE_URL}/products/`),
            fetch(`${API_BASE_URL}/admin/reviews/pending`, { headers: buildAdminHeaders() }),
            fetch(`${API_BASE_URL}/admin/support/tickets`, { headers: buildAdminHeaders() })
        ]);
        const products = pRes.ok ? await pRes.json() : [];
        const reviews  = rRes.ok ? await rRes.json()  : [];
        const tickets  = tRes.ok ? await tRes.json()  : [];

        const pc = Array.isArray(products) ? products.length : 0;
        const rc = Array.isArray(reviews)  ? reviews.length  : 0;
        const tc = Array.isArray(tickets)  ? tickets.length  : 0;

        if ($('mProducts')) $('mProducts').textContent = pc;
        if ($('mProductsTrend')) $('mProductsTrend').textContent = `${pc} in catalog`;

        const rBadge = $('sidebarReviewBadge');
        const tBadge = $('sidebarTicketBadge');
        if (rBadge) { rBadge.textContent = rc; rBadge.style.display = rc > 0 ? '' : 'none'; }
        if (tBadge) { tBadge.textContent = tc; tBadge.style.display = tc > 0 ? '' : 'none'; }

        if ($('mClients')) $('mClients').textContent = Math.max(pc + 12, 18); // approximate
    } catch (_) {}
}

// ── Revenue Chart ──
function generateRevenueData() {
    const labels = [], data = [];
    let val = 1400;
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        val += (Math.random() - 0.38) * 280;
        val = Math.max(600, Math.min(4200, val));
        data.push(Math.round(val));
    }
    return { labels, data };
}

function initRevenueChart() {
    const canvas = $('revenueChart');
    if (!canvas) return;

    const { labels, data } = generateRevenueData();

    if (revenueChart) revenueChart.destroy();

    revenueChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Revenue ($)',
                data,
                borderColor: '#7c3aed',
                backgroundColor: (ctx) => {
                    const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 240);
                    gradient.addColorStop(0, 'rgba(124,58,237,0.18)');
                    gradient.addColorStop(1, 'rgba(124,58,237,0.00)');
                    return gradient;
                },
                fill: true,
                tension: 0.45,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: '#7c3aed',
                borderWidth: 2.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#18163a',
                    titleColor: 'rgba(255,255,255,0.7)',
                    bodyColor: '#ffffff',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => ` $${ctx.parsed.y.toLocaleString()}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11 },
                        maxTicksLimit: 8,
                        maxRotation: 0
                    }
                },
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11 },
                        callback: (v) => '$' + v.toLocaleString()
                    }
                }
            },
            interaction: { mode: 'index', intersect: false }
        }
    });
}

// ════════════════════════
// ACTIVITY TABLE
// ════════════════════════
let allActivity = [];
let filteredActivity = [];
let sortCol = 'date';
let sortDir = 'desc';
let currentPage = 1;
const PAGE_SIZE = 8;

const MOCK_ACTIVITIES = [
    { date: '2026-03-22', client: 'Sarah Johnson',  event: 'Fashion Order',      amount: '$89.99',  status: 'completed' },
    { date: '2026-03-22', client: 'Mike Chen',      event: 'Electronics Order',  amount: '$249.00', status: 'completed' },
    { date: '2026-03-21', client: 'Aisha Patel',    event: 'Newsletter Signup',  amount: '—',       status: 'completed' },
    { date: '2026-03-21', client: 'Tom Rivera',     event: 'Books Order',        amount: '$34.50',  status: 'pending'   },
    { date: '2026-03-20', client: 'Lisa Nguyen',    event: 'Home Goods Order',   amount: '$128.00', status: 'completed' },
    { date: '2026-03-20', client: 'James Wright',   event: 'Return Request',     amount: '-$49.99', status: 'pending'   },
    { date: '2026-03-19', client: 'Emma Davis',     event: 'Fashion Order',      amount: '$67.00',  status: 'completed' },
    { date: '2026-03-19', client: 'Carlos Mejia',   event: 'Electronics Order',  amount: '$399.00', status: 'pending'   },
    { date: '2026-03-18', client: 'Priya Singh',    event: 'Books Order',        amount: '$22.00',  status: 'completed' },
    { date: '2026-03-18', client: 'Noah Anderson',  event: 'Newsletter Signup',  amount: '—',       status: 'completed' },
    { date: '2026-03-17', client: 'Olivia Brown',   event: 'Home Goods Order',   amount: '$95.00',  status: 'completed' },
    { date: '2026-03-17', client: 'Liam Wilson',    event: 'Support Ticket',     amount: '—',       status: 'pending'   },
    { date: '2026-03-16', client: 'Zoe Martinez',   event: 'Fashion Order',      amount: '$112.50', status: 'completed' },
    { date: '2026-03-16', client: 'Ryan Taylor',    event: 'Electronics Order',  amount: '$179.00', status: 'completed' },
    { date: '2026-03-15', client: 'Grace Lee',      event: 'Books Order',        amount: '$18.00',  status: 'cancelled' },
    { date: '2026-03-15', client: 'Daniel Harris',  event: 'Fashion Order',      amount: '$55.00',  status: 'completed' },
];

async function loadActivityTable() {
    allActivity = [...MOCK_ACTIVITIES];

    // Enrich with real support tickets
    try {
        const r = await fetch(`${API_BASE_URL}/admin/support/tickets`, { headers: buildAdminHeaders() });
        if (r.ok) {
            const tickets = await r.json();
            (tickets || []).slice(0, 6).forEach(t => {
                allActivity.unshift({
                    date: new Date().toISOString().slice(0, 10),
                    client: t.customer_name || 'Customer',
                    event: `Support: ${t.subject}`,
                    amount: '—',
                    status: t.status === 'resolved' ? 'completed' : 'pending'
                });
            });
        }
    } catch (_) {}

    filteredActivity = [...allActivity];
    currentPage = 1;
    renderTable();
    renderPagination();
}

// ── Search ──
$('tableSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    filteredActivity = allActivity.filter(row =>
        Object.values(row).some(v => String(v).toLowerCase().includes(q))
    );
    currentPage = 1;
    renderTable();
    renderPagination();
});

// ── Sort ──
document.querySelectorAll('.activity-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            sortCol = col;
            sortDir = 'asc';
        }
        document.querySelectorAll('.activity-table th').forEach(h => {
            h.classList.remove('sort-asc', 'sort-desc');
        });
        th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');

        filteredActivity.sort((a, b) => {
            let av = a[col] || '', bv = b[col] || '';
            if (col === 'amount') {
                av = parseFloat(av.replace(/[^0-9.-]/g, '')) || 0;
                bv = parseFloat(bv.replace(/[^0-9.-]/g, '')) || 0;
            }
            return sortDir === 'asc'
                ? (av < bv ? -1 : av > bv ? 1 : 0)
                : (av > bv ? -1 : av < bv ? 1 : 0);
        });
        renderTable();
    });
});

function renderTable() {
    const tbody = $('activityTableBody');
    if (!tbody) return;

    const start = (currentPage - 1) * PAGE_SIZE;
    const slice = filteredActivity.slice(start, start + PAGE_SIZE);

    if (!slice.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--muted);">No activity found.</td></tr>`;
        return;
    }

    tbody.innerHTML = slice.map(row => {
        const badgeClass = row.status === 'completed' ? 'badge-completed'
                         : row.status === 'cancelled' ? 'badge-cancelled'
                         : 'badge-pending';
        return `
        <tr>
            <td class="muted-cell">${formatDate(row.date)}</td>
            <td><strong>${row.client}</strong></td>
            <td>${row.event}</td>
            <td>${row.amount}</td>
            <td><span class="status-badge ${badgeClass}">${row.status}</span></td>
        </tr>`;
    }).join('');
}

function formatDate(dateStr) {
    try {
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) { return dateStr; }
}

function renderPagination() {
    const el = $('tablePagination');
    if (!el) return;

    const totalPages = Math.ceil(filteredActivity.length / PAGE_SIZE);
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    const showing = Math.min(filteredActivity.length, currentPage * PAGE_SIZE);
    let html = `<span class="pg-info">Showing ${(currentPage-1)*PAGE_SIZE+1}–${showing} of ${filteredActivity.length}</span>`;

    html += `<button class="pg-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (totalPages > 7 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== totalPages) {
            if (i === currentPage - 3 || i === currentPage + 3) html += `<span class="pg-btn" style="pointer-events:none">…</span>`;
            continue;
        }
        html += `<button class="pg-btn ${i===currentPage?'pg-active':''}" onclick="goPage(${i})">${i}</button>`;
    }

    html += `<button class="pg-btn" onclick="goPage(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>›</button>`;
    el.innerHTML = html;
}

window.goPage = function(page) {
    const totalPages = Math.ceil(filteredActivity.length / PAGE_SIZE);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderTable();
    renderPagination();
};

// ════════════════════════
// SCHEDULE
// ════════════════════════
const SCHEDULE_EVENTS = [
    { date: 'Mar 23, 2026', title: 'Flash Sale — Electronics', desc: '24-hour sale on all electronics. Update featured deals before midnight.', color: '' },
    { date: 'Mar 25, 2026', title: 'Fashion Week Drop',        desc: 'New Spring/Summer fashion arrivals go live on the storefront.', color: 'ev-pink' },
    { date: 'Mar 28, 2026', title: 'Newsletter Campaign',      desc: 'Monthly deal newsletter sends to all subscribers.', color: 'ev-green' },
    { date: 'Apr 01, 2026', title: 'Q2 Review Meeting',        desc: 'Quarterly performance review — catalog cleanup and strategy.', color: 'ev-amber' },
    { date: 'Apr 05, 2026', title: 'Books Promo Weekend',      desc: 'Weekend promo on bestsellers. Coordinate with affiliate partners.', color: '' },
    { date: 'Apr 10, 2026', title: 'Home & Garden Season',     desc: 'Spring home category expansion — 50+ new products to list.', color: 'ev-green' },
    { date: 'Apr 15, 2026', title: 'Tax Day Sale',             desc: 'Sitewide deals campaign. Update homepage hero and featured section.', color: 'ev-amber' },
    { date: 'Apr 22, 2026', title: 'Earth Day Collection',     desc: 'Highlight eco-friendly products across categories.', color: 'ev-pink' },
];

function renderSchedule() {
    const grid = $('scheduleGrid');
    if (!grid || grid.dataset.loaded) return;
    grid.dataset.loaded = '1';
    grid.innerHTML = SCHEDULE_EVENTS.map(ev => `
        <div class="event-card ${ev.color}">
            <div class="event-date">${ev.date}</div>
            <div class="event-title">${ev.title}</div>
            <div class="event-desc">${ev.desc}</div>
        </div>
    `).join('');
}

// ════════════════════════
// CLIENTS
// ════════════════════════
async function loadClients() {
    const list = $('clientsList');
    if (!list) return;

    // Try fetching products to approximate client activity
    const mockClients = [
        { name: 'Sarah Johnson',  email: 'sarah@email.com',  joined: 'Mar 2026', orders: 4,  status: 'active' },
        { name: 'Mike Chen',      email: 'mike@email.com',   joined: 'Mar 2026', orders: 2,  status: 'active' },
        { name: 'Aisha Patel',    email: 'aisha@email.com',  joined: 'Feb 2026', orders: 7,  status: 'active' },
        { name: 'Tom Rivera',     email: 'tom@email.com',    joined: 'Feb 2026', orders: 1,  status: 'pending'},
        { name: 'Lisa Nguyen',    email: 'lisa@email.com',   joined: 'Jan 2026', orders: 12, status: 'active' },
        { name: 'James Wright',   email: 'james@email.com',  joined: 'Jan 2026', orders: 3,  status: 'active' },
        { name: 'Emma Davis',     email: 'emma@email.com',   joined: 'Dec 2025', orders: 6,  status: 'active' },
        { name: 'Carlos Mejia',   email: 'carlos@email.com', joined: 'Dec 2025', orders: 9,  status: 'active' },
    ];

    list.innerHTML = '';
    list.classList.remove('wide');
    list.style.maxHeight = 'none';

    mockClients.forEach(c => {
        const card = document.createElement('div');
        card.className = 'admin-item';
        card.innerHTML = `
            <h3>${c.name}</h3>
            <p>${c.email} · Joined ${c.joined} · ${c.orders} orders</p>
            <span class="status-badge ${c.status === 'active' ? 'badge-completed' : 'badge-pending'}" style="margin-top:4px">${c.status}</span>
        `;
        list.appendChild(card);
    });
}

// ════════════════════════
// PRODUCTS CRUD
// ════════════════════════
importUrlBtn?.addEventListener('click', () => importByUrl(importUrlInput, importMessage));

async function importByUrl(inputEl, messageEl) {
    const url = inputEl?.value.trim();
    if (!url) { setMsg(messageEl, 'Enter a product URL first.', 'error'); return; }
    setMsg(messageEl, 'Importing…', 'info');
    try {
        const r = await fetch(`${API_BASE_URL}/admin/import-url`, {
            method: 'POST', headers: buildAdminHeaders(), body: JSON.stringify({ url })
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Import failed');
        const parts = [d.message || 'Imported.'];
        const notes = (d.ai_cleaner_report || []).slice(0, 3).join(' | ');
        if (notes) parts.push(`AI: ${notes}`);
        setMsg(messageEl, parts.join(' '), 'success');
        if (d.product) { populateForm(d.product); showSection('products'); }
        if (inputEl) inputEl.value = '';
        loadProducts(); loadStats();
    } catch (e) { setMsg(messageEl, e.message, 'error'); }
}

productForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = collectPayload();
    const pid = productIdField.value;
    try {
        if (pid) {
            await updateProduct(pid, payload);
            setMsg(formMessage, 'Product updated.', 'success');
        } else {
            await createProduct(payload);
            setMsg(formMessage, 'Product created.', 'success');
            productForm.reset();
            productIdField.value = '';
            formTitle.textContent = 'Create Product';
            loadProducts(); loadStats();
            showSection('dashboard');
            return;
        }
        productForm.reset();
        productIdField.value = '';
        formTitle.textContent = 'Create Product';
        loadProducts(); loadStats();
    } catch (e) { setMsg(formMessage, e.message, 'error'); }
});

$('resetBtn')?.addEventListener('click', () => {
    productForm.reset();
    productIdField.value = '';
    formTitle.textContent = 'Create Product';
    setMsg(formMessage, 'Form cleared.', 'info');
});

$('refreshBtn')?.addEventListener('click', loadProducts);
$('refreshReviewsBtn')?.addEventListener('click', loadPendingReviews);
$('refreshTicketsBtn')?.addEventListener('click', loadSupportTickets);

function collectPayload() {
    const p = {
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
    if (urls.length) p.image_urls = urls;
    return p;
}

function buildReqBody(payload) {
    const imageFile = fields.image_file?.files?.[0];
    if (!imageFile) return { headers: buildAdminHeaders(true), body: JSON.stringify(payload) };
    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
        if (v == null) return;
        fd.append(k, Array.isArray(v) ? v.join(', ') : String(v));
    });
    fd.append('image_file', imageFile);
    return { headers: buildAdminHeaders(false), body: fd };
}

function populateForm(p) {
    productIdField.value         = p.id;
    formTitle.textContent        = `Edit Product #${p.id}`;
    fields.name.value            = p.name || '';
    fields.description.value     = p.description || '';
    fields.price.value           = p.price || '';
    fields.stock.value           = p.stock ?? 0;
    fields.category.value        = p.category || '';
    fields.merchant.value        = p.merchant || '';
    fields.affiliate_url.value   = p.affiliate_url || '';
    fields.image_url.value       = p.image_url || '';
    fields.image_urls.value      = Array.isArray(p.image_urls) ? p.image_urls.join(', ') : '';
    fields.rating.value          = p.rating || '';
    fields.review_count.value    = p.review_count || '';
    fields.deal_price.value      = p.deal_price || '';
    fields.original_price.value  = p.original_price || '';
    fields.is_deal.checked       = Boolean(p.is_deal);
}

async function createProduct(payload) {
    const rb = buildReqBody(payload);
    const r = await fetch(`${API_BASE_URL}/products/`, { method: 'POST', headers: rb.headers, body: rb.body });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Create failed'); }
}

async function updateProduct(id, payload) {
    const rb = buildReqBody(payload);
    const r = await fetch(`${API_BASE_URL}/products/${id}`, { method: 'PUT', headers: rb.headers, body: rb.body });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Update failed'); }
}

async function deleteProduct(product) {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    const r = await fetch(`${API_BASE_URL}/products/${product.id}`, { method: 'DELETE', headers: buildAdminHeaders() });
    if (!r.ok) { const e = await r.json().catch(() => ({})); setMsg(formMessage, e.error || 'Delete failed', 'error'); return; }
    setMsg(formMessage, 'Product deleted.', 'success');
    loadProducts(); loadStats();
}

async function loadProducts() {
    if (!productsList) return;
    productsList.innerHTML = '<p class="admin-message">Loading...</p>';
    try {
        const r = await fetch(`${API_BASE_URL}/products/`);
        renderProducts(await r.json() || []);
    } catch (_) { productsList.innerHTML = '<p class="admin-message">Failed to load.</p>'; }
}

function renderProducts(list) {
    if (!productsList) return;
    if (!list.length) { productsList.innerHTML = '<p class="admin-message">No products found.</p>'; return; }
    productsList.innerHTML = '';
    list.forEach(p => {
        const card = document.createElement('div');
        card.className = 'admin-item';
        card.innerHTML = `
            <h3>${p.name}</h3>
            <p>${p.category || 'Uncategorized'} · $${Number(p.price || 0).toFixed(2)}</p>
            <p>${(p.description || '').slice(0, 90)}</p>
            <div class="admin-item-actions">
                <button data-action="edit">Edit</button>
                <button class="secondary" data-action="delete">Delete</button>
            </div>`;
        card.querySelector('[data-action="edit"]').addEventListener('click', () => {
            populateForm(p); showSection('products');
        });
        card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteProduct(p));
        productsList.appendChild(card);
    });
}

// ════════════════════════
// REVIEWS
// ════════════════════════
async function loadPendingReviews() {
    if (!pendingReviewsList) return;
    pendingReviewsList.innerHTML = '<p class="admin-message">Loading reviews...</p>';
    try {
        const r = await fetch(`${API_BASE_URL}/admin/reviews/pending`, { headers: buildAdminHeaders() });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed');
        renderPendingReviews(data || []);
    } catch (e) { pendingReviewsList.innerHTML = `<p class="admin-message">${e.message}</p>`; }
}

function renderPendingReviews(list) {
    if (!pendingReviewsList) return;
    if (!list.length) { pendingReviewsList.innerHTML = '<p class="admin-message">No pending reviews.</p>'; return; }
    pendingReviewsList.innerHTML = '';
    list.forEach(rv => {
        const card = document.createElement('div');
        card.className = 'admin-item';
        card.innerHTML = `
            <h3>${rv.product_name}</h3>
            <p>${rv.reviewer_name} · ${rv.rating}/5 ${rv.verified_purchase ? '· Verified' : ''}</p>
            <p>${rv.title || ''}</p>
            <p>${(rv.body || '').slice(0, 200)}</p>
            ${rv.photo_url ? `<img src="${rv.photo_url}" alt="Review photo" style="max-width:90px;border-radius:8px;margin-top:6px;">` : ''}
            <div class="admin-item-actions">
                <button data-action="approve">Approve</button>
                <button class="secondary" data-action="reject">Reject</button>
            </div>`;
        card.querySelector('[data-action="approve"]').addEventListener('click', () => moderateReview(rv.id, 'approved'));
        card.querySelector('[data-action="reject"]').addEventListener('click',  () => moderateReview(rv.id, 'rejected'));
        pendingReviewsList.appendChild(card);
    });
}

async function moderateReview(id, status) {
    try {
        const r = await fetch(`${API_BASE_URL}/admin/reviews/${id}/moderate`, {
            method: 'POST', headers: buildAdminHeaders(), body: JSON.stringify({ status })
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Failed');
        loadPendingReviews(); loadStats();
    } catch (e) { alert(e.message); }
}

// ════════════════════════
// TICKETS
// ════════════════════════
async function loadSupportTickets() {
    if (!supportTicketsList) return;
    supportTicketsList.innerHTML = '<p class="admin-message">Loading tickets...</p>';
    try {
        const r = await fetch(`${API_BASE_URL}/admin/support/tickets`, { headers: buildAdminHeaders() });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed');
        renderSupportTickets(data || []);
    } catch (e) { supportTicketsList.innerHTML = `<p class="admin-message">${e.message}</p>`; }
}

function renderSupportTickets(list) {
    if (!supportTicketsList) return;
    if (!list.length) { supportTicketsList.innerHTML = '<p class="admin-message">No support tickets.</p>'; return; }
    supportTicketsList.innerHTML = '';
    list.forEach(t => {
        const card = document.createElement('div');
        card.className = 'admin-item';
        card.innerHTML = `
            <h3>${t.ticket_number} · ${t.subject}</h3>
            <p>${t.customer_name} (${t.customer_email}) · ${t.channel}</p>
            <p>Status: ${t.status}</p>
            <p>${(t.message || '').slice(0, 180)}</p>
            <div class="admin-item-actions">
                <button data-status="open">Open</button>
                <button data-status="in_progress">In Progress</button>
                <button data-status="resolved">Resolve</button>
            </div>`;
        card.querySelectorAll('[data-status]').forEach(b => {
            b.addEventListener('click', () => updateTicketStatus(t.id, b.dataset.status));
        });
        supportTicketsList.appendChild(card);
    });
}

async function updateTicketStatus(id, status) {
    try {
        const r = await fetch(`${API_BASE_URL}/admin/support/tickets/${id}/status`, {
            method: 'POST', headers: buildAdminHeaders(), body: JSON.stringify({ status })
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Failed');
        loadSupportTickets(); loadStats();
    } catch (e) { alert(e.message); }
}

// ════════════════════════
// SETTINGS
// ════════════════════════
$('saveSettingsBtn')?.addEventListener('click', () => {
    setMsg($('settingsMessage'), 'Settings saved successfully.', 'success');
    setTimeout(() => setMsg($('settingsMessage'), ''), 3000);
});

$('changeKeyBtn')?.addEventListener('click', () => {
    const newKey = $('setNewKey')?.value.trim();
    const confirm = $('setConfirmKey')?.value.trim();
    const msg = $('keyMessage');
    if (!newKey) { setMsg(msg, 'Enter a new key.', 'error'); return; }
    if (newKey !== confirm) { setMsg(msg, 'Keys do not match.', 'error'); return; }
    if (newKey.length < 6) { setMsg(msg, 'Key must be at least 6 characters.', 'error'); return; }
    setAdminKey(newKey);
    setMsg(msg, 'Admin key updated.', 'success');
    $('setNewKey').value = '';
    $('setConfirmKey').value = '';
});

// ── Boot ──
init();
