import os
from uuid import uuid4
from flask import Blueprint, current_app, jsonify, request, url_for
from werkzeug.utils import secure_filename
from sqlalchemy import or_
from app import db
from app.models import Product, ProductImage, Cart, CartItem, Order, OrderItem
from app.services import send_order_alert_to_admin, send_order_confirmation_to_customer, generate_order_number

# Blueprint for products
products_bp = Blueprint('products', __name__)


def require_admin_key():
    """Optional admin key gate for privileged product image uploads."""
    configured_key = current_app.config.get('ADMIN_UPLOAD_KEY')
    if configured_key and request.headers.get('X-Admin-Key') != configured_key:
        return jsonify({'error': 'Unauthorized'}), 403
    return None


def save_upload(file_storage):
    original_name = secure_filename(file_storage.filename) or f'image-{uuid4().hex}'
    name_root, extension = os.path.splitext(original_name)
    stored_name = f"{name_root or 'image'}-{uuid4().hex}{extension}"
    upload_path = os.path.join(current_app.config['UPLOAD_FOLDER'], stored_name)
    file_storage.save(upload_path)
    return url_for('static', filename=f'uploads/{stored_name}')

@products_bp.route('/', methods=['GET'])
def get_products():
    """Get products with optional filtering/search/sorting"""
    category = request.args.get('category')
    search = request.args.get('q')
    sort = request.args.get('sort', 'newest')
    limit = request.args.get('limit', type=int)
    query = Product.query
    
    if category:
        query = query.filter_by(category=category)

    if search:
        search_like = f"%{search}%"
        query = query.filter(
            or_(
                Product.name.ilike(search_like),
                Product.description.ilike(search_like),
                Product.category.ilike(search_like)
            )
        )

    if sort == 'price_asc':
        query = query.order_by(Product.price.asc())
    elif sort == 'price_desc':
        query = query.order_by(Product.price.desc())
    elif sort == 'name_asc':
        query = query.order_by(Product.name.asc())
    else:
        query = query.order_by(Product.created_at.desc())

    if limit:
        query = query.limit(limit)
    
    products = query.all()
    return jsonify([product.to_dict() for product in products]), 200

@products_bp.route('/<int:product_id>', methods=['GET'])
def get_product(product_id):
    """Get single product"""
    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': 'Product not found'}), 404
    return jsonify(product.to_dict()), 200

@products_bp.route('/', methods=['POST'])
def create_product():
    """Create a new product (admin)"""
    data = request.get_json(silent=True) if request.is_json else request.form.to_dict()
    data = data or {}

    image_url = data.get('image_url')
    image_files = [file for file in request.files.getlist('images') if file and file.filename]
    single_image = request.files.get('image') or request.files.get('image_file')
    if single_image and single_image.filename:
        image_files.insert(0, single_image)
    single_image = request.files.get('image') or request.files.get('image_file')
    if single_image and single_image.filename:
        image_files.insert(0, single_image)

    uploaded_urls = []
    for image_file in image_files:
        uploaded_urls.append(save_upload(image_file))

    if uploaded_urls:
        image_url = uploaded_urls[0]
    
    try:
        price = float(data.get('price', 0))
        stock = int(data.get('stock', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid price or stock value'}), 400

    product = Product(
        name=data.get('name'),
        description=data.get('description'),
        price=price,
        image_url=image_url,
        stock=stock,
        category=data.get('category')
    )
    
    db.session.add(product)
    db.session.commit()

    if uploaded_urls:
        product_images = [
            ProductImage(product_id=product.id, image_url=url, sort_order=index)
            for index, url in enumerate(uploaded_urls)
        ]
        db.session.add_all(product_images)
        db.session.commit()
    
    return jsonify(product.to_dict()), 201


@products_bp.route('/<int:product_id>/images', methods=['POST'])
def upload_product_images(product_id):
    """Upload multiple images for an existing product."""
    auth_error = require_admin_key()
    if auth_error:
        return auth_error

    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': 'Product not found'}), 404

    image_files = [file for file in request.files.getlist('images') if file and file.filename]
    if not image_files:
        return jsonify({'error': 'No images provided'}), 400

    current_count = len(product.images)
    uploaded_urls = []
    for index, image_file in enumerate(image_files):
        image_url = save_upload(image_file)
        uploaded_urls.append(image_url)
        db.session.add(
            ProductImage(
                product_id=product.id,
                image_url=image_url,
                sort_order=current_count + index
            )
        )

    if not product.image_url and uploaded_urls:
        product.image_url = uploaded_urls[0]

    db.session.commit()
    return jsonify(product.to_dict()), 200

# Blueprint for cart
cart_bp = Blueprint('cart', __name__)

@cart_bp.route('/<session_id>', methods=['GET'])
def get_cart(session_id):
    """Get cart for session"""
    cart = Cart.query.filter_by(session_id=session_id).first()
    
    if not cart:
        cart = Cart(session_id=session_id)
        db.session.add(cart)
        db.session.commit()
    
    return jsonify(cart.to_dict()), 200

@cart_bp.route('/<session_id>/add', methods=['POST'])
def add_to_cart(session_id):
    """Add product to cart"""
    data = request.get_json()
    product_id = data.get('product_id')
    quantity = data.get('quantity', 1)
    
    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': 'Product not found'}), 404
    
    cart = Cart.query.filter_by(session_id=session_id).first()
    if not cart:
        cart = Cart(session_id=session_id)
        db.session.add(cart)
        db.session.flush()
    
    cart_item = CartItem.query.filter_by(cart_id=cart.id, product_id=product_id).first()
    
    if cart_item:
        cart_item.quantity += quantity
    else:
        cart_item = CartItem(cart_id=cart.id, product_id=product_id, quantity=quantity)
        db.session.add(cart_item)
    
    db.session.commit()
    return jsonify(cart.to_dict()), 200

@cart_bp.route('/<session_id>/remove/<int:item_id>', methods=['DELETE'])
def remove_from_cart(session_id, item_id):
    """Remove item from cart"""
    cart = Cart.query.filter_by(session_id=session_id).first()
    if not cart:
        return jsonify({'error': 'Cart not found'}), 404
    
    cart_item = CartItem.query.filter_by(id=item_id, cart_id=cart.id).first()
    if not cart_item:
        return jsonify({'error': 'Item not found'}), 404
    
    db.session.delete(cart_item)
    db.session.commit()
    return jsonify(cart.to_dict()), 200

@cart_bp.route('/<session_id>/clear', methods=['DELETE'])
def clear_cart(session_id):
    """Clear entire cart"""
    cart = Cart.query.filter_by(session_id=session_id).first()
    if cart:
        CartItem.query.filter_by(cart_id=cart.id).delete()
        db.session.commit()
    return jsonify({'message': 'Cart cleared'}), 200

# Blueprint for orders
orders_bp = Blueprint('orders', __name__)

@orders_bp.route('/', methods=['POST'])
def create_order():
    """Create order from cart"""
    data = request.get_json()
    session_id = data.get('session_id')
    
    cart = Cart.query.filter_by(session_id=session_id).first()
    if not cart or not cart.items:
        return jsonify({'error': 'Cart is empty'}), 400
    
    total_amount = sum(item.product.price * item.quantity for item in cart.items)
    
    order = Order(
        order_number=generate_order_number(),
        customer_name=data.get('customer_name'),
        customer_email=data.get('customer_email'),
        customer_phone=data.get('customer_phone'),
        total_amount=total_amount,
        status='pending',
        payment_status='awaiting'
    )
    
    for cart_item in cart.items:
        order_item = OrderItem(
            product_name=cart_item.product.name,
            product_id=cart_item.product.id,
            quantity=cart_item.quantity,
            price=cart_item.product.price
        )
        order.items.append(order_item)
    
    db.session.add(order)
    db.session.commit()
    
    # Send emails
    send_order_alert_to_admin(order)
    send_order_confirmation_to_customer(order)
    
    # Clear cart
    CartItem.query.filter_by(cart_id=cart.id).delete()
    db.session.commit()
    
    return jsonify(order.to_dict()), 201

@orders_bp.route('/<order_number>', methods=['GET'])
def get_order(order_number):
    """Get order details"""
    order = Order.query.filter_by(order_number=order_number).first()
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    return jsonify(order.to_dict()), 200

@orders_bp.route('/<int:order_id>/status', methods=['PATCH'])
def update_order_status(order_id):
    """Update order status (admin)"""
    data = request.get_json()
    order = Order.query.get(order_id)
    
    if not order:
        return jsonify({'error': 'Order not found'}), 404
    
    if 'status' in data:
        order.status = data['status']
    if 'payment_status' in data:
        order.payment_status = data['payment_status']
    
    db.session.commit()
    return jsonify(order.to_dict()), 200
