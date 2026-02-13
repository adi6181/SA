import os
from uuid import uuid4
from flask import Blueprint, current_app, jsonify, request, url_for
from werkzeug.utils import secure_filename
from sqlalchemy import or_
from app import db
from app.models import Product, ProductImage

# Blueprint for products
products_bp = Blueprint('products', __name__)
admin_bp = Blueprint('admin', __name__)

def get_admin_key():
    return current_app.config.get('ADMIN_DASHBOARD_KEY') or current_app.config.get('ADMIN_UPLOAD_KEY')

def require_admin_key():
    """Admin key gate for privileged operations."""
    configured_key = get_admin_key()
    if not configured_key:
        return jsonify({'error': 'Admin key not configured'}), 403
    if request.headers.get('X-Admin-Key') != configured_key:
        return jsonify({'error': 'Unauthorized'}), 403
    return None


def save_upload(file_storage):
    original_name = secure_filename(file_storage.filename) or f'image-{uuid4().hex}'
    name_root, extension = os.path.splitext(original_name)
    stored_name = f"{name_root or 'image'}-{uuid4().hex}{extension}"
    upload_path = os.path.join(current_app.config['UPLOAD_FOLDER'], stored_name)
    file_storage.save(upload_path)
    return url_for('static', filename=f'uploads/{stored_name}')

def parse_float(value):
    try:
        return float(value) if value is not None and value != '' else None
    except (TypeError, ValueError):
        return None

def parse_int(value):
    try:
        return int(value) if value is not None and value != '' else None
    except (TypeError, ValueError):
        return None

def parse_bool(value):
    if value is None:
        return False
    return str(value).strip().lower() in {'1', 'true', 'yes', 'y', 'on'}

@admin_bp.route('/login', methods=['POST'])
def admin_login():
    data = request.get_json(silent=True) if request.is_json else request.form.to_dict()
    data = data or {}
    provided_key = data.get('key')
    configured_key = get_admin_key()

    if not configured_key:
        return jsonify({'error': 'Admin key not configured'}), 403
    if not provided_key or provided_key != configured_key:
        return jsonify({'error': 'Invalid admin key'}), 401
    return jsonify({'ok': True}), 200

@products_bp.route('/', methods=['GET'])
def get_products():
    """Get products with optional filtering/search/sorting"""
    category = request.args.get('category')
    search = request.args.get('q')
    sort = request.args.get('sort', 'newest')
    limit = request.args.get('limit', type=int)
    merchant = request.args.get('merchant')
    deals = request.args.get('deals')
    query = Product.query
    
    if category:
        query = query.filter_by(category=category)

    if merchant:
        query = query.filter_by(merchant=merchant)

    if deals in {'1', 'true', 'yes'}:
        query = query.filter_by(is_deal=True)

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
    auth_error = require_admin_key()
    if auth_error:
        return auth_error

    data = request.get_json(silent=True) if request.is_json else request.form.to_dict()
    data = data or {}

    image_url = data.get('image_url')
    image_files = [file for file in request.files.getlist('images') if file and file.filename]
    single_image = request.files.get('image') or request.files.get('image_file')
    if single_image and single_image.filename:
        image_files.insert(0, single_image)

    uploaded_urls = []
    for image_file in image_files:
        uploaded_urls.append(save_upload(image_file))

    if uploaded_urls:
        image_url = uploaded_urls[0]
    
    price = parse_float(data.get('price'))
    if price is None:
        return jsonify({'error': 'Invalid price value'}), 400

    stock = parse_int(data.get('stock', 0)) or 0

    name = data.get('name')
    description = data.get('description')
    if not name or not description:
        return jsonify({'error': 'Name and description are required'}), 400

    product = Product(
        name=name,
        description=description,
        price=price,
        image_url=image_url,
        stock=stock,
        category=data.get('category'),
        affiliate_url=data.get('affiliate_url'),
        merchant=data.get('merchant'),
        rating=parse_float(data.get('rating')),
        review_count=parse_int(data.get('review_count')),
        is_deal=parse_bool(data.get('is_deal')),
        deal_price=parse_float(data.get('deal_price')),
        original_price=parse_float(data.get('original_price'))
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

@products_bp.route('/<int:product_id>', methods=['PUT', 'PATCH'])
def update_product(product_id):
    """Update an existing product (admin)."""
    auth_error = require_admin_key()
    if auth_error:
        return auth_error

    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': 'Product not found'}), 404

    data = request.get_json(silent=True) if request.is_json else request.form.to_dict()
    data = data or {}

    if 'name' in data:
        product.name = data.get('name') or product.name
    if 'description' in data:
        product.description = data.get('description') or product.description
    if 'price' in data:
        price = parse_float(data.get('price'))
        if price is None:
            return jsonify({'error': 'Invalid price value'}), 400
        product.price = price
    if 'stock' in data:
        stock = parse_int(data.get('stock'))
        if stock is None:
            return jsonify({'error': 'Invalid stock value'}), 400
        product.stock = stock
    if 'category' in data:
        product.category = data.get('category')
    if 'affiliate_url' in data:
        product.affiliate_url = data.get('affiliate_url')
    if 'merchant' in data:
        product.merchant = data.get('merchant')
    if 'rating' in data:
        product.rating = parse_float(data.get('rating'))
    if 'review_count' in data:
        product.review_count = parse_int(data.get('review_count'))
    if 'is_deal' in data:
        product.is_deal = parse_bool(data.get('is_deal'))
    if 'deal_price' in data:
        product.deal_price = parse_float(data.get('deal_price'))
    if 'original_price' in data:
        product.original_price = parse_float(data.get('original_price'))
    if 'image_url' in data:
        product.image_url = data.get('image_url')
    if 'image_urls' in data and isinstance(data.get('image_urls'), list):
        product.images.clear()
        for index, url in enumerate([u for u in data.get('image_urls') if u]):
            db.session.add(ProductImage(product_id=product.id, image_url=url, sort_order=index))
        if data.get('image_urls'):
            product.image_url = data.get('image_urls')[0]

    db.session.commit()
    return jsonify(product.to_dict()), 200

@products_bp.route('/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    """Delete a product (admin)."""
    auth_error = require_admin_key()
    if auth_error:
        return auth_error

    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': 'Product not found'}), 404

    db.session.delete(product)
    db.session.commit()
    return jsonify({'ok': True}), 200
