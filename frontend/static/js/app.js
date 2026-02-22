const API_BASE_URL = '/api';
const ADMIN_MODE_KEY = 'adminImageUploadMode';
const ADMIN_API_KEY_STORAGE = 'adminImageUploadKey';

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
});

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
            '.affiliate-btn, .upload-images-btn, .upload-images-input, .gallery-nav, .gallery-dot, .compare-toggle, .compare-checkbox'
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

    const info = document.createElement('div');
    info.className = 'product-info';

    const priceLabel = product.deal_price || product.price;
    const merchantLabel = product.merchant ? `Buy on ${product.merchant}` : 'Shop Now';
    const reasons = product.why_this_product?.reasons || [];
    const confidence = product.why_this_product?.confidence || 'medium';
    const reasonsHtml = reasons.length
        ? `<div class="why-card"><p class="why-title">Why this product (${confidence} confidence)</p><ul>${reasons.map((reason) => `<li>${reason}</li>`).join('')}</ul></div>`
        : '';

    info.innerHTML = `
        <h3 class="product-name">${product.name}</h3>
        <p class="product-description">${description}${product.description && product.description.length > 100 ? '...' : ''}</p>
        ${reasonsHtml}
        <div class="product-footer">
            <span class="product-price">$${Number(priceLabel || 0).toFixed(2)}</span>
            <a class="affiliate-btn" href="${product.affiliate_url || '#'}" target="_blank" rel="noopener">${merchantLabel}</a>
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
