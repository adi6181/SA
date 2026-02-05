const API_BASE_URL = '/api';
const ADMIN_MODE_KEY = 'adminImageUploadMode';
const ADMIN_API_KEY_STORAGE = 'adminImageUploadKey';

let sessionId = localStorage.getItem('sessionId') || generateSessionId();
localStorage.setItem('sessionId', sessionId);

let productsCache = [];
let filterDebounceTimer = null;
let menPanelTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    bootstrapAdminMode();
    setupEventListeners();
    updateCartDisplay();
    loadProducts();
    applyProductImageFallbacks();
    setupScrollAnimations();
});

function setupEventListeners() {
    document.getElementById('cartToggle').addEventListener('click', toggleCart);
    document.getElementById('closeCart').addEventListener('click', closeCart);
    document.getElementById('overlay').addEventListener('click', closeAllModals);
    document.getElementById('closeCheckout').addEventListener('click', closeCheckoutModal);
    document.getElementById('checkoutForm').addEventListener('submit', handleCheckout);

    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(filterDebounceTimer);
        filterDebounceTimer = setTimeout(loadProducts, 250);
    });

    document.getElementById('categoryFilter').addEventListener('change', () => {
        syncCollectionChip();
        loadProducts();
    });

    document.getElementById('sortFilter').addEventListener('change', loadProducts);

    document.querySelectorAll('.collection-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            document.getElementById('categoryFilter').value = chip.dataset.category || '';
            syncCollectionChip(chip.dataset.category || '');
            loadProducts();
        });
    });

    const grid = document.getElementById('productsGrid');
    grid.addEventListener('click', handleProductGridClick);
    grid.addEventListener('change', handleProductImageSelection);

    document.querySelectorAll('[data-shop-story]').forEach((link) => {
        link.addEventListener('click', (event) => {
            const mode = event.currentTarget.dataset.shopStory;
            playShopStory(mode);
        });
    });

    document.querySelectorAll('[data-nav-category]').forEach((link) => {
        link.addEventListener('click', () => {
            const targetCategory = link.dataset.navCategory || '';
            document.getElementById('categoryFilter').value = targetCategory;
            syncCollectionChip(targetCategory);
            loadProducts();
        });
    });

    document.querySelectorAll('.men-subtab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.men-subtab').forEach((item) => item.classList.remove('active'));
            tab.classList.add('active');
        });
    });

    document.querySelectorAll('.women-subtab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.women-subtab').forEach((item) => item.classList.remove('active'));
            tab.classList.add('active');
        });
    });

    document.querySelectorAll('[data-men-filter]').forEach((link) => {
        link.addEventListener('click', () => {
            const targetCategory = link.dataset.menFilter || '';
            document.getElementById('categoryFilter').value = targetCategory;
            syncCollectionChip(targetCategory);
            loadProducts();
        });
    });

    document.querySelectorAll('[data-women-filter]').forEach((link) => {
        link.addEventListener('click', () => {
            const targetCategory = link.dataset.womenFilter || '';
            document.getElementById('categoryFilter').value = targetCategory;
            syncCollectionChip(targetCategory);
            loadProducts();
        });
    });

    setupHoverPanel('menNavTab', 'menCategoryPanel');
    setupHoverPanel('womenNavTab', 'womenCategoryPanel');
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

function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
}

async function loadProducts() {
    try {
        const search = document.getElementById('searchInput').value.trim();
        const category = document.getElementById('categoryFilter').value;
        const sort = document.getElementById('sortFilter').value;

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
    const safeName = String(product.name || '').replace(/'/g, "\\'");
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
    info.innerHTML = `
        <h3 class="product-name">${product.name}</h3>
        <p class="product-description">${description}${product.description && product.description.length > 100 ? '...' : ''}</p>
        <div class="product-footer">
            <span class="product-price">$${Number(product.price).toFixed(2)}</span>
            <button class="add-to-cart-btn"
                onclick="addToCart(${product.id}, '${safeName}', ${Number(product.price)})"
                ${Number(product.stock) === 0 ? 'disabled' : ''}>
                ${Number(product.stock) > 0 ? 'Add to Cart' : 'Out of Stock'}
            </button>
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

async function addToCart(productId, productName) {
    try {
        const response = await fetch(`${API_BASE_URL}/cart/${sessionId}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId, quantity: 1 })
        });

        if (response.ok) {
            await updateCartDisplay();
            showNotification(`${productName} added to cart`, 'success');
        }
    } catch (error) {
        console.error('Error adding to cart:', error);
        showNotification('Error adding item to cart', 'error');
    }
}

async function updateCartDisplay() {
    try {
        const response = await fetch(`${API_BASE_URL}/cart/${sessionId}`);
        const cart = await response.json();

        document.getElementById('cartCount').textContent = cart.item_count || 0;

        const cartItemsContainer = document.getElementById('cartItems');
        const totalPriceEl = document.getElementById('totalPrice');

        if (!cart.items || cart.items.length === 0) {
            cartItemsContainer.innerHTML = '<div class="empty-cart"><p>Your cart is empty</p></div>';
            totalPriceEl.textContent = '$0.00';
            return;
        }

        cartItemsContainer.innerHTML = cart.items.map((item) => `
            <div class="cart-item">
                <img src="${getProductImage(item.product)}" alt="${item.product.name}" class="cart-item-image">
                <div class="cart-item-details">
                    <div class="cart-item-name">${item.product.name}</div>
                    <div class="cart-item-price">$${Number(item.product.price).toFixed(2)}</div>
                    <div class="cart-item-quantity">
                        <button class="quantity-btn" onclick="updateQuantity(${item.id}, ${item.quantity - 1})">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn" onclick="updateQuantity(${item.id}, ${item.quantity + 1})">+</button>
                        <button class="remove-btn" onclick="removeFromCart(${item.id})">Remove</button>
                    </div>
                </div>
            </div>
        `).join('');

        totalPriceEl.textContent = '$' + Number(cart.total).toFixed(2);
    } catch (error) {
        console.error('Error updating cart:', error);
    }
}

async function removeFromCart(itemId) {
    try {
        const response = await fetch(`${API_BASE_URL}/cart/${sessionId}/remove/${itemId}`, { method: 'DELETE' });
        if (response.ok) {
            await updateCartDisplay();
            showNotification('Item removed from cart', 'success');
        }
    } catch (error) {
        console.error('Error removing item:', error);
    }
}

async function updateQuantity(itemId, newQuantity) {
    if (newQuantity <= 0) {
        await removeFromCart(itemId);
    } else {
        await updateCartDisplay();
    }
}

function toggleCart(event) {
    if (event) event.preventDefault();
    document.getElementById('cartSidebar').classList.toggle('active');
    document.getElementById('overlay').classList.toggle('active');
}

function closeCart() {
    document.getElementById('cartSidebar').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
}

async function goToCheckout() {
    try {
        const response = await fetch(`${API_BASE_URL}/cart/${sessionId}`);
        const cart = await response.json();

        if (!cart.items || cart.items.length === 0) {
            showNotification('Your cart is empty', 'error');
            return;
        }

        document.getElementById('orderItems').innerHTML = cart.items.map((item) => `
            <div class="order-item">
                <span>${item.product.name} x ${item.quantity}</span>
                <span>$${(Number(item.product.price) * item.quantity).toFixed(2)}</span>
            </div>
        `).join('');

        document.getElementById('orderTotal').textContent = '$' + Number(cart.total).toFixed(2);
        document.getElementById('checkoutModal').classList.add('active');
        document.getElementById('overlay').classList.add('active');
        closeCart();
    } catch (error) {
        console.error('Error preparing checkout:', error);
        showNotification('Error preparing checkout', 'error');
    }
}

async function handleCheckout(event) {
    event.preventDefault();

    const payload = {
        session_id: sessionId,
        customer_name: document.getElementById('customerName').value,
        customer_email: document.getElementById('customerEmail').value,
        customer_phone: document.getElementById('customerPhone').value
    };

    try {
        const response = await fetch(`${API_BASE_URL}/orders/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            showNotification('Error placing order', 'error');
            return;
        }

        const order = await response.json();
        showOrderSuccess(order);

        document.getElementById('checkoutForm').reset();
        document.getElementById('checkoutModal').classList.remove('active');

        sessionId = generateSessionId();
        localStorage.setItem('sessionId', sessionId);
        await updateCartDisplay();
    } catch (error) {
        console.error('Error placing order:', error);
        showNotification('Error placing order', 'error');
    }
}

function showOrderSuccess(order) {
    document.getElementById('orderMessage').textContent =
        `Thank you, ${order.customer_name}! We will contact you at ${order.customer_phone} for payment details.`;
    document.getElementById('orderNumber').textContent = order.order_number;

    document.getElementById('successModal').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
}

function closeCheckoutModal() {
    document.getElementById('checkoutModal').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
}

function closeAllModals() {
    closeCheckoutModal();
    closeSuccessModal();
    closeCart();
}

function scrollToProducts() {
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

function syncCollectionChip(forcedCategory) {
    const category = forcedCategory !== undefined
        ? forcedCategory
        : document.getElementById('categoryFilter').value;

    document.querySelectorAll('.collection-chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.category === category);
        if (!category && chip.dataset.category === '') {
            chip.classList.add('active');
        }
    });
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
    const revealTargets = document.querySelectorAll('.hero-copy, .hero-visual, .collections-strip, .products-section, .story-section, .contact-section');
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

function setupHoverPanel(tabId, panelId) {
    const navTab = document.getElementById(tabId);
    const panel = document.getElementById(panelId);
    if (!navTab || !panel) return;

    const showPanel = () => {
        clearTimeout(menPanelTimer);
        document.getElementById('menCategoryPanel')?.classList.remove('visible');
        document.getElementById('womenCategoryPanel')?.classList.remove('visible');
        panel.classList.add('visible');
    };

    const hidePanel = () => {
        clearTimeout(menPanelTimer);
        menPanelTimer = setTimeout(() => {
            panel.classList.remove('visible');
        }, 140);
    };

    navTab.addEventListener('mouseenter', showPanel);
    navTab.addEventListener('focus', showPanel);
    navTab.addEventListener('mouseleave', hidePanel);

    panel.addEventListener('mouseenter', showPanel);
    panel.addEventListener('mouseleave', hidePanel);
}

function storeCachedProducts(products) {
    localStorage.setItem('cachedProducts', JSON.stringify(products));
}

function getCachedProducts() {
    const cached = localStorage.getItem('cachedProducts');
    return cached ? JSON.parse(cached) : [];
}
