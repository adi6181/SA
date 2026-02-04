// Configuration
// Use relative API path so the frontend works when served by Flask (dynamic)
const API_BASE_URL = '/api';
let sessionId = localStorage.getItem('sessionId') || generateSessionId();
localStorage.setItem('sessionId', sessionId);

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    updateCartDisplay();
    setupEventListeners();
    applyProductImageFallbacks();
});

// Setup Event Listeners
function setupEventListeners() {
    document.getElementById('cartToggle').addEventListener('click', toggleCart);
    document.getElementById('closeCart').addEventListener('click', closeCart);
    document.getElementById('overlay').addEventListener('click', closeAllModals);
    document.getElementById('closeCheckout').addEventListener('click', closeCheckoutModal);
    document.getElementById('checkoutForm').addEventListener('submit', handleCheckout);
    document.getElementById('searchInput').addEventListener('input', filterProducts);
    document.getElementById('categoryFilter').addEventListener('change', filterProducts);
}

// Generate unique session ID
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Load all products
async function loadProducts() {
    try {
        const response = await fetch(`${API_BASE_URL}/products/`);
        const products = await response.json();
        displayProducts(products);
        storeCachedProducts(products);
    } catch (error) {
        console.error('Error loading products:', error);
        loadCachedProducts();
    }
}

// Display products in grid
function displayProducts(products) {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '';

    if (products.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">No products found.</p>';
        return;
    }

    products.forEach((product, index) => {
        const card = createProductCard(product, index);
        grid.appendChild(card);
    });
}

// Create product card element
function createProductCard(product, index = 0) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.setProperty('--reveal-delay', `${index * 0.06}s`);
    card.dataset.productName = product.name || '';
    card.dataset.productCategory = product.category || '';

    const imageSrc = getProductImage(product);
    
    const safeName = String(product.name || '').replace(/'/g, \"\\\\'\");
    const description = product.description
        ? product.description.substring(0, 100)
        : 'Product details coming soon.';

    card.innerHTML = `
        <div class="product-media">
            <span class="product-tag">${product.category || 'General'}</span>
            <img src="${imageSrc}" 
                 alt="${product.name}" class="product-image" data-fallback="true">
        </div>
        <div class="product-info">
            <h3 class="product-name">${product.name}</h3>
            <p class="product-description">${description}${product.description && product.description.length > 100 ? '...' : ''}</p>
            <div class="product-footer">
                <span class="product-price">$${product.price.toFixed(2)}</span>
                <button class="add-to-cart-btn" 
                        onclick="addToCart(${product.id}, '${safeName}', ${product.price})"
                        ${product.stock === 0 ? 'disabled' : ''}>
                    ${product.stock > 0 ? 'Add to Cart' : 'Out of Stock'}
                </button>
            </div>
        </div>
    `;
    
    return card;
}

// Add product to cart
async function addToCart(productId, productName, productPrice) {
    try {
        const response = await fetch(`${API_BASE_URL}/cart/${sessionId}/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_id: productId,
                quantity: 1
            })
        });

        if (response.ok) {
            updateCartDisplay();
            showNotification(`${productName} added to cart!`, 'success');
        }
    } catch (error) {
        console.error('Error adding to cart:', error);
        showNotification('Error adding item to cart', 'error');
    }
}

// Update cart display
async function updateCartDisplay() {
    try {
        const response = await fetch(`${API_BASE_URL}/cart/${sessionId}`);
        const cart = await response.json();

        // Update cart count
        const totalItems = cart.item_count || 0;
        document.getElementById('cartCount').textContent = totalItems;

        // Update cart items
        const cartItemsContainer = document.getElementById('cartItems');
        const totalPriceEl = document.getElementById('totalPrice');

        if (cart.items.length === 0) {
            cartItemsContainer.innerHTML = '<div class="empty-cart"><p>Your cart is empty</p></div>';
            totalPriceEl.textContent = '$0.00';
        } else {
            cartItemsContainer.innerHTML = cart.items.map(item => `
                <div class="cart-item">
                    <img src="${getProductImage(item.product)}" 
                         alt="${item.product.name}" class="cart-item-image">
                    <div class="cart-item-details">
                        <div class="cart-item-name">${item.product.name}</div>
                        <div class="cart-item-price">$${item.product.price.toFixed(2)}</div>
                        <div class="cart-item-quantity">
                            <button class="quantity-btn" onclick="updateQuantity(${item.id}, ${item.quantity - 1})">-</button>
                            <span>${item.quantity}</span>
                            <button class="quantity-btn" onclick="updateQuantity(${item.id}, ${item.quantity + 1})">+</button>
                            <button class="remove-btn" onclick="removeFromCart(${item.id})">Remove</button>
                        </div>
                    </div>
                </div>
            `).join('');

            totalPriceEl.textContent = '$' + cart.total.toFixed(2);
        }
    } catch (error) {
        console.error('Error updating cart:', error);
    }
}

// Remove item from cart
async function removeFromCart(itemId) {
    try {
        const response = await fetch(`${API_BASE_URL}/cart/${sessionId}/remove/${itemId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            updateCartDisplay();
            showNotification('Item removed from cart', 'success');
        }
    } catch (error) {
        console.error('Error removing item:', error);
    }
}

// Update item quantity
async function updateQuantity(itemId, newQuantity) {
    if (newQuantity === 0) {
        removeFromCart(itemId);
    } else {
        updateCartDisplay();
    }
}

// Toggle cart sidebar
function toggleCart() {
    const sidebar = document.getElementById('cartSidebar');
    const overlay = document.getElementById('overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

// Close cart
function closeCart() {
    document.getElementById('cartSidebar').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
}

// Open checkout modal
async function goToCheckout() {
    try {
        const response = await fetch(`${API_BASE_URL}/cart/${sessionId}`);
        const cart = await response.json();

        if (cart.items.length === 0) {
            showNotification('Your cart is empty', 'error');
            return;
        }

        // Populate order items
        const orderItemsHTML = cart.items.map(item => `
            <div class="order-item">
                <span>${item.product.name} x ${item.quantity}</span>
                <span>$${(item.product.price * item.quantity).toFixed(2)}</span>
            </div>
        `).join('');

        document.getElementById('orderItems').innerHTML = orderItemsHTML;
        document.getElementById('orderTotal').textContent = '$' + cart.total.toFixed(2);

        // Show modal
        document.getElementById('checkoutModal').classList.add('active');
        document.getElementById('overlay').classList.add('active');
        closeCart();
    } catch (error) {
        console.error('Error preparing checkout:', error);
        showNotification('Error preparing checkout', 'error');
    }
}

// Handle checkout form submission
async function handleCheckout(e) {
    e.preventDefault();

    const customerName = document.getElementById('customerName').value;
    const customerEmail = document.getElementById('customerEmail').value;
    const customerPhone = document.getElementById('customerPhone').value;

    try {
        const response = await fetch(`${API_BASE_URL}/orders/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone
            })
        });

        if (response.ok) {
            const order = await response.json();
            showOrderSuccess(order);
            
            // Reset form
            document.getElementById('checkoutForm').reset();
            document.getElementById('checkoutModal').classList.remove('active');
            
            // Update cart
            sessionId = generateSessionId();
            localStorage.setItem('sessionId', sessionId);
            updateCartDisplay();
        } else {
            showNotification('Error placing order', 'error');
        }
    } catch (error) {
        console.error('Error placing order:', error);
        showNotification('Error placing order: ' + error.message, 'error');
    }
}

// Show order success
function showOrderSuccess(order) {
    document.getElementById('orderMessage').textContent = 
        `Thank you, ${order.customer_name}! We will contact you at ${order.customer_phone} to complete the payment.`;
    document.getElementById('orderNumber').textContent = order.order_number;
    
    document.getElementById('successModal').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

// Close success modal
function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
}

// Filter products
function filterProducts() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const category = document.getElementById('categoryFilter').value;
    const products = getCachedProducts();

    const filtered = products.filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(searchTerm) || 
                             product.description.toLowerCase().includes(searchTerm);
        const matchesCategory = !category || product.category === category;
        return matchesSearch && matchesCategory;
    });

    displayProducts(filtered);
}

// Close all modals
function closeAllModals() {
    document.getElementById('checkoutModal').classList.remove('active');
    document.getElementById('successModal').classList.remove('active');
    document.getElementById('cartSidebar').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
}

// Scroll to products section
function scrollToProducts() {
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

// Image fallback mapping for local SVGs
function getProductImage(product = {}) {
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

    const found = matches.find(entry => entry.test.test(name) || entry.test.test(category));
    const fallback = found ? found.file : 'led_desk_lamp.svg';
    return `/static/images/${fallback}`;
}

// Apply fallbacks for server-rendered cards
function applyProductImageFallbacks() {
    const cards = document.querySelectorAll('.product-card');
    cards.forEach((card, index) => {
        card.style.setProperty('--reveal-delay', `${index * 0.06}s`);
        const image = card.querySelector('.product-image');
        if (!image) return;

        const name = (card.dataset.productName || image.alt || '').toLowerCase();
        const category = (card.dataset.productCategory || '').toLowerCase();
        const currentSrc = image.getAttribute('src') || '';
        const needsFallback = currentSrc.includes('via.placeholder.com') || currentSrc.trim() === '';

        if (needsFallback) {
            image.src = getProductImage({ name, category });
        }
    });
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `toast toast-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('toast-hide');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Cache products
function storeCachedProducts(products) {
    localStorage.setItem('cachedProducts', JSON.stringify(products));
}

function getCachedProducts() {
    const cached = localStorage.getItem('cachedProducts');
    return cached ? JSON.parse(cached) : [];
}

function loadCachedProducts() {
    const products = getCachedProducts();
    if (products.length > 0) {
        displayProducts(products);
    }
}
