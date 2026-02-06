const API_BASE_URL = '/api';
const ADMIN_MODE_KEY = 'adminImageUploadMode';
const ADMIN_API_KEY_STORAGE = 'adminImageUploadKey';

let productsCache = [];
let filterDebounceTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    bootstrapAdminMode();
    setupEventListeners();
    loadProducts();
    applyProductImageFallbacks();
    setupScrollAnimations();
});

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
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
        const search = document.getElementById('searchInput')?.value.trim();
        const category = document.getElementById('categoryFilter')?.value;
        const sort = document.getElementById('sortFilter')?.value;

        const params = new URLSearchParams();
        if (search) params.set('q', search);
        if (category) params.set('category', category);
        if (sort) params.set('sort', sort);

        const query = params.toString() ? `?${params.toString()}` : '';
        const response = await fetch(`${API_BASE_URL}/products/${query}`);
        const products = await response.json();

        productsCache = products;
        storeCachedProducts(products);
        displayProducts(products);
    } catch (error) {
        console.error('Error loading products:', error);
        const fallbackProducts = getCachedProducts();
        productsCache = fallbackProducts;
        displayProducts(fallbackProducts);
    }
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

    info.innerHTML = `
        <h3 class="product-name">${product.name}</h3>
        <p class="product-description">${description}${product.description && product.description.length > 100 ? '...' : ''}</p>
        <div class="product-footer">
            <span class="product-price">$${Number(priceLabel || 0).toFixed(2)}</span>
            <a class="affiliate-btn" href="${product.affiliate_url || '#'}" target="_blank" rel="noopener">${merchantLabel}</a>
        </div>
    `;

    card.appendChild(media);
    card.appendChild(info);
    return card;
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
