const API_BASE_URL = '/api';
const ADMIN_MODE_KEY = 'adminImageUploadMode';
const ADMIN_API_KEY_STORAGE = 'adminImageUploadKey';
const CART_STORAGE_KEY = 'dealdrop_cart';

async function handleNewsletterSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('newsletterEmail')?.value.trim();
    const msg = document.getElementById('newsletterMsg');
    const btn = event.target.querySelector('button[type="submit"]');
    if (!email || !msg) return;
    msg.textContent = '';
    msg.style.color = '';
    if (btn) { btn.disabled = true; btn.textContent = 'Subscribing…'; }
    try {
        const res = await fetch('/api/newsletter/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (res.ok) {
            msg.textContent = "🎉 You're in! Check your inbox for a welcome email.";
            msg.style.color = '#16a34a';
            event.target.reset();
        } else {
            msg.textContent = data.error || 'Something went wrong. Try again.';
            msg.style.color = '#dc2626';
        }
    } catch {
        msg.textContent = 'Network error. Please try again.';
        msg.style.color = '#dc2626';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Subscribe'; }
    }
}

let productsCache = [];
let filterDebounceTimer = null;
const compareSelection = new Map();
const filterState = {
    dealsOnly: false,
    minRating: null
};

document.addEventListener('DOMContentLoaded', () => {
    bootstrapAdminMode();
    setupEventListeners();
    setupProductPopupNavigation();
    setupHeroParallax();
    setupShopLookHotspots();
    updateQuickChipStates();
    renderCompareSelected();
    loadProducts();
    applyProductImageFallbacks();
    setupScrollAnimations();
    updateCartBadge();
});

/* ============================================================
   CART SYSTEM
   ============================================================ */

function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || []; }
    catch { return []; }
}

function saveCart(cart) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    updateCartBadge();
}

function updateCartBadge() {
    const cart = getCart();
    const qty = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    badge.textContent = qty;
    badge.style.display = qty > 0 ? 'flex' : 'none';
}

function addToCart(product) {
    const cart = getCart();
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: Number(product.deal_price || product.price || 0),
            image: getProductImage(product),
            merchant: product.merchant || 'Shop',
            affiliate_url: product.affiliate_url || '#',
            quantity: 1
        });
    }
    saveCart(cart);
    renderCartDrawer();
    showNotification(`${product.name} added to cart!`, 'success');
}

function removeFromCart(productId) {
    const cart = getCart().filter(item => item.id !== Number(productId));
    saveCart(cart);
    renderCartDrawer();
}

function openCart() {
    document.getElementById('cartDrawer')?.classList.add('open');
    document.getElementById('cartOverlay')?.classList.add('open');
    renderCartDrawer();
}

function closeCart() {
    document.getElementById('cartDrawer')?.classList.remove('open');
    document.getElementById('cartOverlay')?.classList.remove('open');
}

function getMerchantBtnClass(merchant) {
    if (!merchant) return 'merchant-btn-default';
    const m = merchant.toLowerCase().replace(/\s+/g, '-');
    const known = ['amazon', 'walmart', 'target', 'best-buy', 'shareasale'];
    return known.some(k => m.includes(k.replace('-', '')))
        ? `merchant-btn-${m}`
        : 'merchant-btn-default';
}

function renderCartDrawer() {
    const cartItemsEl = document.getElementById('cartItems');
    const checkoutArea = document.getElementById('cartCheckoutArea');
    if (!cartItemsEl) return;

    const cart = getCart();

    if (cart.length === 0) {
        cartItemsEl.innerHTML = `
            <div class="cart-empty">
                <div class="cart-empty-icon">🛒</div>
                <p>Your cart is empty</p>
                <p class="cart-empty-sub">Add products to see vendor options</p>
            </div>`;
        if (checkoutArea) checkoutArea.innerHTML = '';
        return;
    }

    // Group by merchant
    const byMerchant = {};
    cart.forEach(item => {
        const m = item.merchant || 'Shop';
        if (!byMerchant[m]) byMerchant[m] = { items: [], url: item.affiliate_url };
        byMerchant[m].items.push(item);
    });

    let html = '';
    Object.entries(byMerchant).forEach(([merchant, group]) => {
        const subtotal = group.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const btnClass = getMerchantBtnClass(merchant);
        html += `
            <div class="cart-merchant-group">
                <div class="cart-merchant-header">
                    <span class="vendor-badge vendor-${merchant.toLowerCase().replace(/\s+/g, '-')}">${merchant}</span>
                    <span class="cart-merchant-subtotal">$${subtotal.toFixed(2)}</span>
                </div>
                ${group.items.map(item => `
                    <div class="cart-item">
                        <img class="cart-item-img" src="${item.image}" alt="${item.name}" onerror="this.src='/static/images/led_desk_lamp.svg'">
                        <div class="cart-item-details">
                            <p class="cart-item-name">${item.name}</p>
                            <p class="cart-item-price">$${item.price.toFixed(2)} × ${item.quantity} = $${(item.price * item.quantity).toFixed(2)}</p>
                        </div>
                        <button class="cart-item-remove" onclick="removeFromCart(${item.id})" title="Remove">×</button>
                    </div>`).join('')}
                <a href="${group.url}" target="_blank" rel="noopener" class="btn-shop-vendor ${btnClass}">
                    Shop on ${merchant} →
                </a>
            </div>`;
    });

    cartItemsEl.innerHTML = html;

    const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
    if (checkoutArea) {
        checkoutArea.innerHTML = `
            <div class="cart-total">
                <span>Total</span>
                <span>$${total.toFixed(2)}</span>
            </div>
            <p class="cart-checkout-note">Click a vendor button above to complete your purchase</p>`;
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            loadSearchSuggestions(searchInput.value.trim());
            clearTimeout(filterDebounceTimer);
            filterDebounceTimer = setTimeout(loadProducts, 250);
        });
    }

    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
            syncCollectionChip();
            loadProducts();
        });
    }

    const sortFilter = document.getElementById('sortFilter');
    if (sortFilter) {
        sortFilter.addEventListener('change', loadProducts);
    }

    const minPriceFilter = document.getElementById('minPriceFilter');
    if (minPriceFilter) {
        minPriceFilter.addEventListener('input', () => {
            clearTimeout(filterDebounceTimer);
            filterDebounceTimer = setTimeout(loadProducts, 300);
        });
    }

    const maxPriceFilter = document.getElementById('maxPriceFilter');
    if (maxPriceFilter) {
        maxPriceFilter.addEventListener('input', () => {
            clearTimeout(filterDebounceTimer);
            filterDebounceTimer = setTimeout(loadProducts, 300);
        });
    }

    document.querySelectorAll('.collection-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            if (categoryFilter) {
                categoryFilter.value = chip.dataset.category || '';
            }
            syncCollectionChip(chip.dataset.category || '');
            loadProducts();
        });
    });

    document.querySelectorAll('[data-nav-category]').forEach((link) => {
        link.addEventListener('click', () => {
            const targetCategory = link.dataset.navCategory || '';
            if (categoryFilter) {
                categoryFilter.value = targetCategory;
            }
            syncCollectionChip(targetCategory);
            loadProducts();
        });
    });

    const grid = document.getElementById('productsGrid');
    if (grid) {
        grid.addEventListener('click', handleProductGridClick);
        grid.addEventListener('change', handleProductImageSelection);
    }

    document.querySelectorAll('[data-shop-story]').forEach((link) => {
        link.addEventListener('click', (event) => {
            const mode = event.currentTarget.dataset.shopStory;
            playShopStory(mode);
        });
    });

    document.querySelectorAll('.quick-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            const chipType = chip.dataset.filterChip;
            if (chipType === 'deals') {
                filterState.dealsOnly = !filterState.dealsOnly;
            } else if (chipType === 'rating') {
                filterState.minRating = filterState.minRating ? null : 4;
            }
            updateQuickChipStates();
            loadProducts();
        });
    });

    const activeFilters = document.getElementById('activeFilters');
    if (activeFilters) {
        activeFilters.addEventListener('click', (event) => {
            const removeKey = event.target.closest('[data-remove-filter]')?.dataset.removeFilter;
            if (!removeKey) return;
            clearFilter(removeKey);
            loadProducts();
        });
    }

    const runComparisonBtn = document.getElementById('runComparisonBtn');
    runComparisonBtn?.addEventListener('click', runComparison);

    const clearComparisonBtn = document.getElementById('clearComparisonBtn');
    clearComparisonBtn?.addEventListener('click', clearComparisonSelection);

    const aiExplainQueryBtn = document.getElementById('aiExplainQueryBtn');
    aiExplainQueryBtn?.addEventListener('click', () => {
        applyNaturalLanguageSearch();
    });

    const aiAutoCompareBtn = document.getElementById('aiAutoCompareBtn');
    aiAutoCompareBtn?.addEventListener('click', aiAutoCompareTopMatches);

    document.querySelectorAll('[data-ai-query]').forEach((button) => {
        button.addEventListener('click', () => {
            const query = button.dataset.aiQuery || '';
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = query;
            }
            applyNaturalLanguageSearch();
        });
    });
}

function setupProductPopupNavigation() {
    document.addEventListener('click', (event) => {
        const card = event.target.closest('.product-card[data-product-id]');
        if (!card) return;

        const ignoredTarget = event.target.closest(
            '.affiliate-btn, .btn-add-cart, .btn-buy-vendor, .upload-images-btn, .upload-images-input, .gallery-nav, .gallery-dot, .compare-toggle, .compare-checkbox'
        );
        if (ignoredTarget) return;

        const productId = card.dataset.productId;
        if (!productId) return;

        event.preventDefault();
        openProductDetailsPage(productId);
    });
}

function setupHeroParallax() {
    const collage = document.getElementById('heroCollage');
    if (!collage) return;

    const layers = Array.from(collage.querySelectorAll('[data-parallax-layer]'));
    if (!layers.length) return;

    const applyTransforms = (offsetX, offsetY) => {
        layers.forEach((layer) => {
            const speed = Number(layer.getAttribute('data-parallax-layer') || 0.15);
            const moveX = offsetX * speed;
            const moveY = offsetY * speed;
            layer.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`;
        });
    };

    collage.addEventListener('mousemove', (event) => {
        const rect = collage.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const offsetX = (x - centerX) / 18;
        const offsetY = (y - centerY) / 18;
        applyTransforms(offsetX, offsetY);
    });

    collage.addEventListener('mouseleave', () => {
        applyTransforms(0, 0);
    });
}

function setupShopLookHotspots() {
    document.querySelectorAll('[data-hotspot-category]').forEach((button) => {
        button.addEventListener('click', () => {
            const targetCategory = button.dataset.hotspotCategory || '';
            const label = button.dataset.hotspotLabel || targetCategory;

            const categoryFilter = document.getElementById('categoryFilter');
            if (categoryFilter) {
                categoryFilter.value = targetCategory;
            }
            syncCollectionChip(targetCategory);
            loadProducts();

            const productsSection = document.getElementById('products');
            productsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            showNotification(`Showing ${label}`, 'success');
        });
    });
}

function openProductDetailsPage(productId) {
    window.location.href = `/product/${encodeURIComponent(productId)}`;
}

function bootstrapAdminMode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === '1') {
        localStorage.setItem(ADMIN_MODE_KEY, 'true');
    }
    if (params.get('key')) {
        localStorage.setItem(ADMIN_API_KEY_STORAGE, params.get('key'));
    }
}

function isAdminMode() {
    return localStorage.getItem(ADMIN_MODE_KEY) === 'true';
}


async function loadProducts() {
    try {
        const filters = getCurrentFilters();

        const params = new URLSearchParams();
        if (filters.search) params.set('q', filters.search);
        if (filters.category) params.set('category', filters.category);
        if (filters.sort) params.set('sort', filters.sort);
        if (filters.minPrice) params.set('min_price', filters.minPrice);
        if (filters.maxPrice) params.set('max_price', filters.maxPrice);
        if (filters.dealsOnly) params.set('deals', 'true');
        if (filters.minRating) params.set('min_rating', String(filters.minRating));

        const query = params.toString() ? `?${params.toString()}` : '';
        const response = await fetch(`${API_BASE_URL}/products/${query}`);
        const products = await response.json();

        productsCache = products;
        storeCachedProducts(products);
        displayProducts(products);
        renderActiveFilters(filters);
    } catch (error) {
        console.error('Error loading products:', error);
        const fallbackProducts = getCachedProducts();
        productsCache = fallbackProducts;
        displayProducts(fallbackProducts);
        renderActiveFilters(getCurrentFilters());
    }
}

function getCurrentFilters() {
    return {
        search: document.getElementById('searchInput')?.value.trim() || '',
        category: document.getElementById('categoryFilter')?.value || '',
        sort: document.getElementById('sortFilter')?.value || 'newest',
        minPrice: document.getElementById('minPriceFilter')?.value || '',
        maxPrice: document.getElementById('maxPriceFilter')?.value || '',
        dealsOnly: filterState.dealsOnly,
        minRating: filterState.minRating
    };
}

function updateQuickChipStates() {
    document.querySelectorAll('.quick-chip').forEach((chip) => {
        const chipType = chip.dataset.filterChip;
        if (chipType === 'deals') {
            chip.classList.toggle('active', filterState.dealsOnly);
        } else if (chipType === 'rating') {
            chip.classList.toggle('active', Boolean(filterState.minRating));
        }
    });
}

function renderActiveFilters(filters) {
    const activeFilters = document.getElementById('activeFilters');
    if (!activeFilters) return;

    const chips = [];
    if (filters.search) chips.push({ key: 'search', label: `Search: ${filters.search}` });
    if (filters.category) chips.push({ key: 'category', label: `Category: ${filters.category}` });
    if (filters.minPrice) chips.push({ key: 'minPrice', label: `Min $${filters.minPrice}` });
    if (filters.maxPrice) chips.push({ key: 'maxPrice', label: `Max $${filters.maxPrice}` });
    if (filters.dealsOnly) chips.push({ key: 'deals', label: 'Deals only' });
    if (filters.minRating) chips.push({ key: 'rating', label: `${filters.minRating}+ rated` });
    if (filters.sort && filters.sort !== 'newest') {
        const sortLabelMap = {
            price_asc: 'Sort: Price low-high',
            price_desc: 'Sort: Price high-low',
            name_asc: 'Sort: Name A-Z',
            rating_desc: 'Sort: Top rated',
            popular_desc: 'Sort: Most reviewed',
            deals_desc: 'Sort: Best deals'
        };
        chips.push({ key: 'sort', label: sortLabelMap[filters.sort] || 'Sort applied' });
    }

    if (!chips.length) {
        activeFilters.innerHTML = '';
        return;
    }

    const html = chips.map((chip) => (
        `<button type="button" class="active-chip" data-remove-filter="${chip.key}">${chip.label} ×</button>`
    )).join('');
    activeFilters.innerHTML = `${html}<button type="button" class="active-chip clear-all" data-remove-filter="all">Clear all</button>`;
}

function clearFilter(filterKey) {
    if (filterKey === 'all') {
        const searchInput = document.getElementById('searchInput');
        const categoryFilter = document.getElementById('categoryFilter');
        const sortFilter = document.getElementById('sortFilter');
        const minPriceFilter = document.getElementById('minPriceFilter');
        const maxPriceFilter = document.getElementById('maxPriceFilter');
        if (searchInput) searchInput.value = '';
        if (categoryFilter) categoryFilter.value = '';
        if (sortFilter) sortFilter.value = 'newest';
        if (minPriceFilter) minPriceFilter.value = '';
        if (maxPriceFilter) maxPriceFilter.value = '';
        filterState.dealsOnly = false;
        filterState.minRating = null;
        syncCollectionChip('');
        updateQuickChipStates();
        return;
    }

    if (filterKey === 'search') {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
    } else if (filterKey === 'category') {
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) categoryFilter.value = '';
        syncCollectionChip('');
    } else if (filterKey === 'minPrice') {
        const minPriceFilter = document.getElementById('minPriceFilter');
        if (minPriceFilter) minPriceFilter.value = '';
    } else if (filterKey === 'maxPrice') {
        const maxPriceFilter = document.getElementById('maxPriceFilter');
        if (maxPriceFilter) maxPriceFilter.value = '';
    } else if (filterKey === 'deals') {
        filterState.dealsOnly = false;
        updateQuickChipStates();
    } else if (filterKey === 'rating') {
        filterState.minRating = null;
        updateQuickChipStates();
    } else if (filterKey === 'sort') {
        const sortFilter = document.getElementById('sortFilter');
        if (sortFilter) sortFilter.value = 'newest';
    }
}

async function loadSearchSuggestions(query) {
    const datalist = document.getElementById('searchSuggestions');
    if (!datalist) return;

    if (!query || query.length < 2) {
        datalist.innerHTML = '';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/products/suggestions?q=${encodeURIComponent(query)}&limit=8`);
        if (!response.ok) return;
        const suggestions = await response.json();
        datalist.innerHTML = '';
        (suggestions || []).forEach((item) => {
            const option = document.createElement('option');
            option.value = item;
            datalist.appendChild(option);
        });
    } catch (_error) {
        // Ignore autocomplete failures silently.
    }
}

function interpretNaturalLanguageQuery(queryText) {
    const text = (queryText || '').trim().toLowerCase();
    if (!text) {
        return { cleanedSearch: '' };
    }

    const result = {
        cleanedSearch: text,
        minPrice: null,
        maxPrice: null,
        minRating: null,
        dealsOnly: null,
        sort: null,
        category: null
    };

    const underMatch = text.match(/\b(?:under|below|less than)\s*\$?\s*(\d+(?:\.\d+)?)/);
    if (underMatch) result.maxPrice = underMatch[1];

    const overMatch = text.match(/\b(?:over|above|more than)\s*\$?\s*(\d+(?:\.\d+)?)/);
    if (overMatch) result.minPrice = overMatch[1];

    const ratingMatch = text.match(/\b(\d(?:\.\d)?)\s*\+?\s*(?:star|stars|rated|rating)/);
    if (ratingMatch) result.minRating = Number(ratingMatch[1]);

    if (/\btop rated|best rated|highest rated\b/.test(text)) {
        result.minRating = Math.max(result.minRating || 0, 4);
        result.sort = 'rating_desc';
    }

    if (/\bdeal|deals|discount|discounted\b/.test(text)) {
        result.dealsOnly = true;
        if (!result.sort) result.sort = 'deals_desc';
    }

    if (/\belectronics\b/.test(text)) result.category = 'Electronics';
    else if (/\bfashion\b/.test(text)) result.category = 'Fashion';
    else if (/\bhome\b/.test(text)) result.category = 'Home';
    else if (/\bbooks?\b/.test(text)) result.category = 'Books';

    result.cleanedSearch = text
        .replace(/\b(?:under|below|less than|over|above|more than)\s*\$?\s*\d+(?:\.\d+)?/g, ' ')
        .replace(/\b\d(?:\.\d)?\s*\+?\s*(?:star|stars|rated|rating)/g, ' ')
        .replace(/\btop rated|best rated|highest rated|deal|deals|discount|discounted\b/g, ' ')
        .replace(/\belectronics|fashion|home|books?\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return result;
}

function applyNaturalLanguageSearch() {
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const sortFilter = document.getElementById('sortFilter');
    const minPriceFilter = document.getElementById('minPriceFilter');
    const maxPriceFilter = document.getElementById('maxPriceFilter');
    const currentSearch = searchInput?.value || '';
    const interpreted = interpretNaturalLanguageQuery(currentSearch);

    if (searchInput) searchInput.value = interpreted.cleanedSearch || currentSearch;
    if (categoryFilter && interpreted.category) {
        categoryFilter.value = interpreted.category;
        syncCollectionChip(interpreted.category);
    }
    if (sortFilter && interpreted.sort) sortFilter.value = interpreted.sort;
    if (minPriceFilter && interpreted.minPrice) minPriceFilter.value = interpreted.minPrice;
    if (maxPriceFilter && interpreted.maxPrice) maxPriceFilter.value = interpreted.maxPrice;
    if (interpreted.minRating != null) filterState.minRating = interpreted.minRating;
    if (interpreted.dealsOnly != null) filterState.dealsOnly = interpreted.dealsOnly;

    updateQuickChipStates();
    loadProducts();
    showNotification('AI interpreted your search and applied smart filters.', 'success');
}

function aiRankScore(product) {
    const price = Number(product.deal_price ?? product.price ?? 0);
    const rating = Number(product.rating ?? 0);
    const reviews = Number(product.review_count ?? 0);
    const dealBoost = product.deal_price ? 8 : 0;
    return (rating * 14) + (Math.min(reviews, 1000) * 0.025) - (price * 0.015) + dealBoost;
}

function aiAutoCompareTopMatches() {
    if (!productsCache || productsCache.length < 2) {
        showNotification('Need at least 2 visible products for AI auto-compare.', 'error');
        return;
    }

    const top = [...productsCache]
        .sort((a, b) => aiRankScore(b) - aiRankScore(a))
        .slice(0, Math.min(3, productsCache.length));

    compareSelection.clear();
    top.forEach((product) => {
        compareSelection.set(String(product.id), { id: product.id, name: product.name });
    });

    renderCompareSelected();
    syncCompareCheckboxes();
    runComparison();
}

function displayProducts(products) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!products || products.length === 0) {
        grid.innerHTML = '<p class="empty-products">No products found.</p>';
        return;
    }

    products.forEach((product, index) => {
        const card = createProductCard(product, index);
        grid.appendChild(card);
    });
    syncCompareCheckboxes();
}

function createProductCard(product, index) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.setProperty('--reveal-delay', `${index * 0.05}s`);
    card.dataset.productId = String(product.id);
    card.dataset.productName = product.name || '';
    card.dataset.productCategory = product.category || '';

    const images = getProductImages(product);
    const mainImage = images[0];
    const description = product.description
        ? product.description.substring(0, 100)
        : 'Product details coming soon.';

    const media = document.createElement('div');
    media.className = 'product-media';

    if (product.is_deal || product.deal_price) {
        const dealBadge = document.createElement('span');
        dealBadge.className = 'deal-badge';
        dealBadge.textContent = 'DEAL';
        media.appendChild(dealBadge);
    }

    const tag = document.createElement('span');
    tag.className = 'product-tag';
    tag.textContent = product.category || 'General';
    media.appendChild(tag);

    const compareLabel = document.createElement('label');
    compareLabel.className = 'compare-toggle';
    compareLabel.innerHTML = `
        <input type="checkbox" class="compare-checkbox" data-product-id="${product.id}">
        Compare
    `;
    media.appendChild(compareLabel);

    if (isAdminMode()) {
        const uploadButton = document.createElement('button');
        uploadButton.className = 'upload-images-btn';
        uploadButton.dataset.action = 'open-upload';
        uploadButton.dataset.productId = String(product.id);
        uploadButton.title = 'Upload product images';
        uploadButton.textContent = '📷';
        media.appendChild(uploadButton);

        const uploadInput = document.createElement('input');
        uploadInput.type = 'file';
        uploadInput.multiple = true;
        uploadInput.hidden = true;
        uploadInput.className = 'upload-images-input';
        uploadInput.dataset.productId = String(product.id);
        media.appendChild(uploadInput);
    }

    if (images.length > 1) {
        const prevButton = document.createElement('button');
        prevButton.className = 'gallery-nav gallery-prev';
        prevButton.dataset.action = 'prev-image';
        prevButton.dataset.productId = String(product.id);
        prevButton.textContent = '‹';
        media.appendChild(prevButton);

        const nextButton = document.createElement('button');
        nextButton.className = 'gallery-nav gallery-next';
        nextButton.dataset.action = 'next-image';
        nextButton.dataset.productId = String(product.id);
        nextButton.textContent = '›';
        media.appendChild(nextButton);
    }

    const imageEl = document.createElement('img');
    imageEl.src = mainImage;
    imageEl.alt = product.name || 'Product image';
    imageEl.className = 'product-image';
    imageEl.dataset.imageIndex = '0';
    media.appendChild(imageEl);

    if (images.length > 1) {
        const dotsWrap = document.createElement('div');
        dotsWrap.className = 'gallery-dots';
        images.forEach((_, imgIndex) => {
            const dot = document.createElement('button');
            dot.className = `gallery-dot ${imgIndex === 0 ? 'active' : ''}`;
            dot.dataset.action = 'set-image';
            dot.dataset.productId = String(product.id);
            dot.dataset.imageIndex = String(imgIndex);
            dotsWrap.appendChild(dot);
        });
        media.appendChild(dotsWrap);
    }

    // Store data on card for fallback add-to-cart
    card.dataset.productPrice    = String(product.deal_price || product.price || 0);
    card.dataset.productMerchant = product.merchant || '';
    card.dataset.productAffiliate = product.affiliate_url || '#';

    const info = document.createElement('div');
    info.className = 'product-info';

    const priceLabel   = product.deal_price || product.price;
    const merchant     = product.merchant || '';
    const merchantSlug = merchant.toLowerCase().replace(/\s+/g, '-');
    const reasons      = product.why_this_product?.reasons || [];
    const confidence   = product.why_this_product?.confidence || 'medium';
    const rating       = Number(product.rating || 0);
    const reviewCount  = Number(product.review_count || 0);

    const reasonsHtml = reasons.length
        ? `<div class="why-card"><p class="why-title">Why this product (${confidence})</p><ul>${reasons.map(r => `<li>${r}</li>`).join('')}</ul></div>`
        : '';

    const ratingHtml = rating
        ? `<span class="product-rating">
               <svg width="12" height="12" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
               ${rating.toFixed(1)}
               <span class="rating-count">(${reviewCount.toLocaleString()})</span>
           </span>`
        : '';

    const originalPriceHtml = product.original_price && product.original_price > priceLabel
        ? `<span class="product-price-original">$${Number(product.original_price).toFixed(2)}</span>`
        : '';

    info.innerHTML = `
        <div class="product-merchant-row">
            <span class="vendor-badge vendor-${merchantSlug}">${merchant || 'Shop'}</span>
            ${ratingHtml}
        </div>
        <h3 class="product-name">${product.name}</h3>
        <p class="product-description">${description}${product.description && product.description.length > 100 ? '...' : ''}</p>
        ${reasonsHtml}
        <div class="product-footer">
            <div class="product-price-block">
                <span class="product-price">$${Number(priceLabel || 0).toFixed(2)}</span>
                ${originalPriceHtml}
            </div>
            <div class="product-actions">
                <button class="btn-add-cart" data-action="add-to-cart" data-product-id="${product.id}">+ Cart</button>
                <a class="btn-buy-vendor vendor-btn-${merchantSlug}" href="${product.affiliate_url || '#'}" target="_blank" rel="noopener">${merchant || 'Shop'} →</a>
            </div>
        </div>
    `;

    card.appendChild(media);
    card.appendChild(info);
    return card;
}

function syncCompareCheckboxes() {
    document.querySelectorAll('.compare-checkbox').forEach((checkbox) => {
        const productId = String(checkbox.dataset.productId || '');
        checkbox.checked = compareSelection.has(productId);
    });
}

function getCachedProductById(productId) {
    return productsCache.find((item) => String(item.id) === String(productId));
}

function handleProductGridClick(event) {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;

    const action = actionElement.dataset.action;
    const productId = actionElement.dataset.productId;
    const card = actionElement.closest('.product-card');
    if (!productId || !card) return;

    if (action === 'add-to-cart') {
        event.stopPropagation();
        const product = getCachedProductById(productId);
        if (product) {
            addToCart(product);
        } else {
            // Fallback: build from card data attributes
            addToCart({
                id: Number(productId),
                name: card.dataset.productName || 'Product',
                price: Number(card.dataset.productPrice || 0),
                deal_price: null,
                merchant: card.dataset.productMerchant || 'Shop',
                affiliate_url: card.dataset.productAffiliate || '#',
                image_url: card.querySelector('.product-image')?.src || ''
            });
        }
        return;
    }

    if (action === 'open-upload' && isAdminMode()) {
        const input = card.querySelector('.upload-images-input');
        if (input) input.click();
        return;
    }

    const product = getCachedProductById(productId);
    if (!product) return;

    const images = getProductImages(product);
    if (images.length <= 1) return;

    const imageEl = card.querySelector('.product-image');
    const currentIndex = Number(imageEl?.dataset.imageIndex || 0);
    let nextIndex = currentIndex;

    if (action === 'prev-image') {
        nextIndex = (currentIndex - 1 + images.length) % images.length;
    } else if (action === 'next-image') {
        nextIndex = (currentIndex + 1) % images.length;
    } else if (action === 'set-image') {
        nextIndex = Number(actionElement.dataset.imageIndex || 0);
    }

    setProductImage(card, images, nextIndex);
}

document.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.compare-checkbox');
    if (!checkbox) return;

    const productId = String(checkbox.dataset.productId || '');
    if (!productId) return;
    const product = getCachedProductById(productId);
    if (!product) return;

    if (checkbox.checked) {
        if (compareSelection.size >= 4) {
            checkbox.checked = false;
            showNotification('You can compare up to 4 products.', 'error');
            return;
        }
        compareSelection.set(productId, { id: product.id, name: product.name });
    } else {
        compareSelection.delete(productId);
    }

    renderCompareSelected();
});

document.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('[data-compare-remove]');
    if (!removeBtn) return;
    const id = String(removeBtn.dataset.compareRemove || '');
    compareSelection.delete(id);
    document.querySelectorAll(`.compare-checkbox[data-product-id="${id}"]`).forEach((checkbox) => {
        checkbox.checked = false;
    });
    renderCompareSelected();
});

function renderCompareSelected() {
    const selectedWrap = document.getElementById('compareSelected');
    const runBtn = document.getElementById('runComparisonBtn');
    const clearBtn = document.getElementById('clearComparisonBtn');
    if (!selectedWrap || !runBtn || !clearBtn) return;

    const items = Array.from(compareSelection.values());
    if (!items.length) {
        selectedWrap.textContent = 'No products selected.';
    } else {
        selectedWrap.innerHTML = items.map((item) => (
            `<button type="button" class="active-chip" data-compare-remove="${item.id}">${item.name} ×</button>`
        )).join('');
    }

    runBtn.disabled = items.length < 2;
    clearBtn.disabled = items.length === 0;
}

function clearComparisonSelection() {
    compareSelection.clear();
    document.querySelectorAll('.compare-checkbox').forEach((checkbox) => {
        checkbox.checked = false;
    });
    const result = document.getElementById('comparisonResults');
    if (result) result.innerHTML = '';
    renderCompareSelected();
}

async function runComparison() {
    const productIds = Array.from(compareSelection.keys()).map((id) => Number(id));
    if (productIds.length < 2) {
        showNotification('Select at least 2 products to compare.', 'error');
        return;
    }

    const resultWrap = document.getElementById('comparisonResults');
    if (resultWrap) {
        resultWrap.innerHTML = '<p class="compare-loading">Generating comparison...</p>';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/products/compare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_ids: productIds })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'Comparison failed');
        }
        renderComparisonResults(payload);
    } catch (error) {
        if (resultWrap) {
            resultWrap.innerHTML = `<p class="empty-products">${error.message || 'Comparison failed.'}</p>`;
        }
    }
}

function renderComparisonResults(payload) {
    const resultWrap = document.getElementById('comparisonResults');
    if (!resultWrap) return;

    const products = payload.products || [];
    const summary = payload.summary || {};
    if (!products.length) {
        resultWrap.innerHTML = '<p class="empty-products">No comparison results.</p>';
        return;
    }

    const cards = products.map((product) => {
        const isRecommended = Number(summary.recommended_product_id) === Number(product.id);
        return `
            <article class="compare-card ${isRecommended ? 'recommended' : ''}">
                <h4>${product.name}${isRecommended ? ' ⭐' : ''}</h4>
                <p><strong>Brand:</strong> ${product.merchant || 'N/A'}</p>
                <p><strong>Category:</strong> ${product.category || 'N/A'}</p>
                <p><strong>Price:</strong> $${Number(product.current_price || 0).toFixed(2)}</p>
                <p><strong>List Price:</strong> $${Number(product.list_price || 0).toFixed(2)}</p>
                <p><strong>Discount:</strong> ${product.discount_pct != null ? product.discount_pct + '%' : 'N/A'}</p>
                <p><strong>Rating:</strong> ${product.rating != null ? product.rating + ' / 5' : 'N/A'}</p>
                <p><strong>Reviews:</strong> ${product.review_count != null ? product.review_count : 'N/A'}</p>
                <p><strong>AI Score:</strong> ${product.score}</p>
            </article>
        `;
    }).join('');

    const bullets = (summary.key_points || []).map((point) => `<li>${point}</li>`).join('');
    resultWrap.innerHTML = `
        <div class="compare-summary">
            <h4>AI Recommendation (${summary.confidence || 'medium'} confidence)</h4>
            <p>${summary.recommended_reason || 'No recommendation available.'}</p>
            ${bullets ? `<ul>${bullets}</ul>` : ''}
        </div>
        <div class="compare-grid">${cards}</div>
    `;
}

function setProductImage(card, images, index) {
    const imageEl = card.querySelector('.product-image');
    if (!imageEl || !images[index]) return;

    imageEl.src = images[index];
    imageEl.dataset.imageIndex = String(index);

    card.querySelectorAll('.gallery-dot').forEach((dot, dotIndex) => {
        dot.classList.toggle('active', dotIndex === index);
    });
}

async function handleProductImageSelection(event) {
    const input = event.target;
    if (!input.classList.contains('upload-images-input')) return;
    if (!isAdminMode()) return;

    const productId = input.dataset.productId;
    if (!productId || !input.files || input.files.length === 0) return;

    await uploadProductImages(productId, Array.from(input.files));
    input.value = '';
}

async function uploadProductImages(productId, files) {
    try {
        const formData = new FormData();
        files.forEach((file) => formData.append('images', file));

        const headers = {};
        const adminKey = localStorage.getItem(ADMIN_API_KEY_STORAGE);
        if (adminKey) headers['X-Admin-Key'] = adminKey;

        const response = await fetch(`${API_BASE_URL}/products/${productId}/images`, {
            method: 'POST',
            headers,
            body: formData
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || 'Image upload failed');
        }

        showNotification('Images uploaded', 'success');
        await loadProducts();
    } catch (error) {
        console.error('Error uploading product images:', error);
        showNotification(error.message || 'Upload failed', 'error');
    }
}

function getProductImage(product = {}) {
    if (Array.isArray(product.image_urls) && product.image_urls.length > 0) {
        return product.image_urls[0];
    }

    if (product.image_url && String(product.image_url).trim() !== '') {
        return product.image_url;
    }

    const name = (product.name || '').toLowerCase();
    const category = (product.category || '').toLowerCase();

    const matches = [
        { test: /headphone|earbud|audio|sound/, file: 'wireless_headphones.svg' },
        { test: /speaker|bluetooth/, file: 'wireless_speaker.svg' },
        { test: /smartwatch|watch|fitness/, file: 'smartwatch.svg' },
        { test: /usb|cable|charger/, file: 'usb_c_cable.svg' },
        { test: /lamp|led|light/, file: 'led_desk_lamp.svg' },
        { test: /shoe|sneaker|runner/, file: 'running_shoes.svg' },
        { test: /jacket|coat|winter/, file: 'winter_jacket.svg' },
        { test: /tshirt|tee|shirt/, file: 'tshirt.svg' },
        { test: /jeans|denim/, file: 'denim_jeans.svg' },
        { test: /garden|tool|outdoor/, file: 'garden_tool_set.svg' },
        { test: /python|code|programming/, file: 'python_programming_guide.svg' },
        { test: /web|html|css|javascript/, file: 'web_development_handbook.svg' }
    ];

    const found = matches.find((entry) => entry.test.test(name) || entry.test.test(category));
    const fallback = found ? found.file : 'led_desk_lamp.svg';
    return `/static/images/${fallback}`;
}

function getProductImages(product = {}) {
    if (Array.isArray(product.image_urls) && product.image_urls.length > 0) {
        return product.image_urls;
    }
    return [getProductImage(product)];
}

function applyProductImageFallbacks() {
    const cards = document.querySelectorAll('.product-card');
    cards.forEach((card, index) => {
        card.style.setProperty('--reveal-delay', `${index * 0.05}s`);
        const image = card.querySelector('.product-image');
        if (!image) return;

        const src = image.getAttribute('src') || '';
        if (src.trim() === '' || src.includes('via.placeholder.com')) {
            image.src = getProductImage({
                name: card.dataset.productName || image.alt || '',
                category: card.dataset.productCategory || ''
            });
        }
    });
}

function setupScrollAnimations() {
    const revealTargets = document.querySelectorAll('.hero-copy, .hero-visual, .collections-strip, .products-section, .contact-section');
    if (!('IntersectionObserver' in window)) {
        revealTargets.forEach((el) => el.classList.add('in-view'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.18 });

    revealTargets.forEach((el) => observer.observe(el));
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `toast toast-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('toast-hide');
        setTimeout(() => notification.remove(), 300);
    }, 2500);
}

function playShopStory(mode) {
    const stage = document.getElementById('shopStoryStage');
    const message = document.getElementById('shopStoryMessage');
    if (!stage || !message) return;

    stage.classList.remove('story-men', 'story-women');
    void stage.offsetWidth;

    if (mode === 'men') {
        stage.classList.add('story-men');
        message.textContent = "It's time for me to shop!";
        showNotification("Men mode: It's time for me to shop!", 'success');
        return;
    }

    if (mode === 'women') {
        stage.classList.add('story-women');
        message.textContent = 'Bye Bye, time to shop!';
        showNotification('Bye Bye, time to shop!', 'success');
    }
}

function syncCollectionChip(forcedCategory) {
    const category = forcedCategory !== undefined
        ? forcedCategory
        : document.getElementById('categoryFilter')?.value;

    document.querySelectorAll('.collection-chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.category === category);
        if (!category && chip.dataset.category === '') {
            chip.classList.add('active');
        }
    });
}

function storeCachedProducts(products) {
    localStorage.setItem('cachedProducts', JSON.stringify(products));
}

function getCachedProducts() {
    const cached = localStorage.getItem('cachedProducts');
    return cached ? JSON.parse(cached) : [];
}

/* ============================================================
   NAVBAR — HAMBURGER, SEARCH, ACTIVE LINK
   ============================================================ */
(function initNavbar() {
    /* ── Active link ── */
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('.nav-link, .nav-mobile-link').forEach(link => {
        const href = link.getAttribute('href') || '';
        const linkPath = href.replace(/\/$/, '') || '/';
        if (linkPath === path) link.classList.add('active');
    });

    /* ── Hamburger ── */
    const hamburger = document.getElementById('navHamburger');
    const mobileMenu = document.getElementById('navMobileMenu');
    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', () => {
            const open = hamburger.classList.toggle('open');
            mobileMenu.classList.toggle('open', open);
            hamburger.setAttribute('aria-expanded', open);
        });
        // Close on outside click
        document.addEventListener('click', e => {
            if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
                hamburger.classList.remove('open');
                mobileMenu.classList.remove('open');
            }
        });
    }

    /* ── Global Search ── */
    const toggle   = document.getElementById('navSearchToggle');
    const searchBox = document.getElementById('navSearchBox');
    const input    = document.getElementById('navSearchInput');
    const results  = document.getElementById('navSearchResults');
    if (!toggle || !searchBox || !input || !results) return;

    toggle.addEventListener('click', e => {
        e.stopPropagation();
        const open = searchBox.classList.toggle('open');
        if (open) { input.focus(); } else { input.value = ''; results.innerHTML = ''; }
    });

    document.addEventListener('click', e => {
        if (!searchBox.contains(e.target) && e.target !== toggle) {
            searchBox.classList.remove('open');
            input.value = '';
            results.innerHTML = '';
        }
    });

    let searchTimer;
    input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        const q = input.value.trim();
        if (!q) { results.innerHTML = ''; return; }
        searchTimer = setTimeout(() => runNavSearch(q), 280);
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { searchBox.classList.remove('open'); input.value = ''; results.innerHTML = ''; }
    });

    async function runNavSearch(q) {
        try {
            const res = await fetch(`/api/products/?q=${encodeURIComponent(q)}&limit=6`);
            if (!res.ok) return;
            const items = await res.json();
            renderNavResults(items, q);
        } catch {
            // Fallback: search productsCache
            const cached = getCachedProducts();
            const lower = q.toLowerCase();
            const hits = cached.filter(p => (p.name || '').toLowerCase().includes(lower)).slice(0, 6);
            renderNavResults(hits, q);
        }
    }

    function renderNavResults(items, q) {
        if (!items.length) {
            results.innerHTML = `<div class="nsr-empty">No results for "<strong>${escapeHtml(q)}</strong>"</div>`;
            return;
        }
        results.innerHTML = items.map(p => {
            const price = p.deal_price || p.price;
            const priceStr = price ? `$${Number(price).toFixed(2)}` : '';
            const img = getProductImageUrl(p);
            return `<a href="/product/${p.id}" class="nsr-item">
                <img class="nsr-img" src="${escapeHtml(img)}" alt="" onerror="this.style.display='none'">
                <div class="nsr-info">
                    <div class="nsr-name">${escapeHtml(p.name || '')}</div>
                    ${priceStr ? `<div class="nsr-price">${priceStr}</div>` : ''}
                </div>
            </a>`;
        }).join('');
    }

    function getProductImageUrl(p) {
        if (p.images && p.images.length) return p.images[0];
        if (p.image_url) return p.image_url;
        return '';
    }

    function escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
})();

/* ============================================================
   BACK TO TOP
   ============================================================ */
(function initBackToTop() {
    const btn = document.getElementById('backToTop');
    if (!btn) return;
    const onScroll = () => btn.classList.toggle('visible', window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
})();

/* ============================================================
   DEAL URGENCY INDICATORS
   Inject urgency badge on product cards that have is_deal flag
   ============================================================ */
function injectUrgencyBadges() {
    document.querySelectorAll('[data-is-deal="true"]').forEach(card => {
        if (card.querySelector('.deal-urgency')) return; // already added
        const badge = document.createElement('div');
        badge.className = 'deal-urgency';
        badge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>Limited Deal`;
        // Insert at the top of the card image area
        const imgWrap = card.querySelector('.product-card-img, .pc-img, figure');
        if (imgWrap) {
            imgWrap.style.position = 'relative';
            imgWrap.style.overflow = 'hidden';
            Object.assign(badge.style, { position: 'absolute', top: '10px', left: '10px', zIndex: '5' });
            imgWrap.prepend(badge);
        } else {
            card.prepend(badge);
        }
    });
}

/* ============================================================
   SHARE DEAL BUTTON
   ============================================================ */
function initShareButton() {
    document.querySelectorAll('.share-deal-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const url = btn.dataset.url || window.location.href;
            const title = btn.dataset.title || document.title;
            if (navigator.share) {
                try { await navigator.share({ title, url }); return; } catch {}
            }
            try {
                await navigator.clipboard.writeText(url);
                btn.classList.add('copied');
                const orig = btn.innerHTML;
                btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
                setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = orig; }, 2000);
            } catch {}
        });
    });
}

/* ============================================================
   LOADING SKELETONS
   ============================================================ */
function showProductSkeletons(containerId, count = 8) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = Array.from({ length: count }, () => `
        <div class="product-card-skeleton">
            <div class="skeleton sk-img"></div>
            <div class="sk-body">
                <div class="skeleton sk-title"></div>
                <div class="skeleton sk-title-2"></div>
                <div class="skeleton sk-price"></div>
                <div class="skeleton sk-btn"></div>
            </div>
        </div>
    `).join('');
}

/* ── Wire up on DOMContentLoaded additions ── */
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(injectUrgencyBadges, 800); // after products render
    initShareButton();
});
