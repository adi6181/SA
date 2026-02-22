import os
import json
import re
import mimetypes
from uuid import uuid4
from flask import Blueprint, current_app, jsonify, request, url_for
from werkzeug.utils import secure_filename
from sqlalchemy import or_
from urllib.parse import urlparse, urlsplit
import requests
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


def normalize_image_urls(raw_value):
    if isinstance(raw_value, list):
        return [str(url).strip() for url in raw_value if str(url).strip()]

    if isinstance(raw_value, str):
        stripped = raw_value.strip()
        if not stripped:
            return []
        if stripped.startswith('['):
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    return [str(url).strip() for url in parsed if str(url).strip()]
            except (TypeError, ValueError):
                pass
        return [url.strip() for url in stripped.split(',') if url.strip()]

    return []


def extract_meta_value(html, keys):
    for key in keys:
        patterns = [
            rf'<meta[^>]+property=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']+)["\']',
            rf'<meta[^>]+name=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']+)["\']'
        ]
        for pattern in patterns:
            match = re.search(pattern, html, flags=re.IGNORECASE)
            if match:
                return match.group(1).strip()
    return None


def infer_merchant_name(url):
    netloc = urlparse(url).netloc.lower().replace('www.', '')
    if 'amazon.' in netloc or netloc == 'a.co':
        return 'Amazon'
    host = netloc.split(':')[0]
    return host.split('.')[-2].capitalize() if '.' in host else host.capitalize()


def parse_json_ld_candidates(html):
    matches = re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        flags=re.IGNORECASE | re.DOTALL
    )
    parsed = []
    for raw in matches:
        content = raw.strip()
        if not content:
            continue
        try:
            parsed.append(json.loads(content))
        except json.JSONDecodeError:
            continue
    return parsed


def find_in_json_ld(nodes, key):
    if isinstance(nodes, dict):
        if key in nodes:
            return nodes[key]
        for value in nodes.values():
            result = find_in_json_ld(value, key)
            if result is not None:
                return result
    elif isinstance(nodes, list):
        for item in nodes:
            result = find_in_json_ld(item, key)
            if result is not None:
                return result
    return None


def extract_price_value(text):
    if not text:
        return None
    numeric = text.replace(',', '')
    match = re.search(r'(\d+(?:\.\d{1,2})?)', numeric)
    return parse_float(match.group(1)) if match else None


def pick_first_image_url(value):
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, list):
        for item in value:
            candidate = pick_first_image_url(item)
            if candidate:
                return candidate
    if isinstance(value, dict):
        for key in ('url', 'contentUrl', 'thumbnailUrl'):
            if value.get(key):
                return str(value.get(key)).strip()
    return None


def infer_extension_from_url_or_type(image_url, content_type):
    extension = ''
    if image_url:
        parsed = urlsplit(image_url)
        _, extension = os.path.splitext(parsed.path)
    if extension.lower() in {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'}:
        return extension.lower()

    if content_type:
        guessed = mimetypes.guess_extension(content_type.split(';')[0].strip())
        if guessed:
            return guessed
    return '.jpg'


def persist_remote_image(image_url, referer_url=None):
    if not image_url:
        return None

    try:
        response = requests.get(
            image_url,
            timeout=20,
            stream=True,
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'Referer': referer_url or ''
            }
        )
        response.raise_for_status()

        extension = infer_extension_from_url_or_type(image_url, response.headers.get('Content-Type', ''))
        stored_name = f"imported-{uuid4().hex}{extension}"
        upload_path = os.path.join(current_app.config['UPLOAD_FOLDER'], stored_name)

        with open(upload_path, 'wb') as file_handle:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    file_handle.write(chunk)

        return url_for('static', filename=f'uploads/{stored_name}')
    except Exception:
        current_app.logger.warning('Could not persist remote image from URL import', exc_info=True)
        return image_url


def scrape_product_details(url):
    session = requests.Session()
    response = session.get(
        url,
        timeout=20,
        allow_redirects=True,
        headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
        }
    )
    response.raise_for_status()

    html = response.text
    final_url = response.url
    json_ld_nodes = parse_json_ld_candidates(html)

    title = (
        extract_meta_value(html, ['og:title', 'twitter:title'])
        or find_in_json_ld(json_ld_nodes, 'name')
    )
    if not title:
        title_match = re.search(r'<title[^>]*>(.*?)</title>', html, flags=re.IGNORECASE | re.DOTALL)
        title = title_match.group(1).strip() if title_match else None

    description = (
        extract_meta_value(html, ['og:description', 'description', 'twitter:description'])
        or find_in_json_ld(json_ld_nodes, 'description')
    )
    image_url = (
        extract_meta_value(html, ['og:image', 'twitter:image'])
        or find_in_json_ld(json_ld_nodes, 'image')
    )
    image_url = pick_first_image_url(image_url)

    price_text = (
        extract_meta_value(html, ['product:price:amount', 'og:price:amount', 'price'])
        or find_in_json_ld(json_ld_nodes, 'price')
    )
    rating_value = find_in_json_ld(json_ld_nodes, 'ratingValue')
    review_count = find_in_json_ld(json_ld_nodes, 'reviewCount')

    price = extract_price_value(str(price_text)) if price_text else None
    rating = parse_float(rating_value)
    reviews = parse_int(review_count)

    return {
        'final_url': final_url,
        'name': title,
        'description': description,
        'image_url': image_url,
        'price': price,
        'rating': rating,
        'review_count': reviews,
        'merchant': infer_merchant_name(final_url)
    }

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


@admin_bp.route('/import-url', methods=['POST'])
def import_product_from_url():
    auth_error = require_admin_key()
    if auth_error:
        return auth_error

    data = request.get_json(silent=True) or {}
    source_url = (data.get('url') or '').strip()
    if not source_url:
        return jsonify({'error': 'Product URL is required'}), 400
    if not re.match(r'^https?://', source_url, flags=re.IGNORECASE):
        return jsonify({'error': 'URL must start with http:// or https://'}), 400

    try:
        scraped = scrape_product_details(source_url)
    except requests.RequestException as error:
        return jsonify({'error': f'Unable to fetch URL: {error}'}), 400
    except Exception as error:
        current_app.logger.exception('Product URL import failed')
        return jsonify({'error': f'Import failed: {error}'}), 500

    final_url = scraped.get('final_url') or source_url
    persisted_image_url = persist_remote_image(scraped.get('image_url'), referer_url=final_url)
    product = Product.query.filter_by(affiliate_url=final_url).first()
    created = product is None

    if created:
        product = Product(
            name=scraped.get('name') or 'Imported Product',
            description=scraped.get('description') or f'Imported from {final_url}',
            price=scraped.get('price') if scraped.get('price') is not None else 0.0,
            image_url=persisted_image_url,
            stock=10,
            category='General',
            affiliate_url=final_url,
            merchant=scraped.get('merchant'),
            rating=scraped.get('rating'),
            review_count=scraped.get('review_count'),
            original_price=scraped.get('price') if scraped.get('price') is not None else 0.0
        )
        db.session.add(product)
    else:
        product.name = scraped.get('name') or product.name
        product.description = scraped.get('description') or product.description
        if scraped.get('price') is not None:
            product.price = scraped.get('price')
            if not product.original_price:
                product.original_price = scraped.get('price')
        product.image_url = persisted_image_url or product.image_url
        product.affiliate_url = final_url
        product.merchant = scraped.get('merchant') or product.merchant
        product.rating = scraped.get('rating') if scraped.get('rating') is not None else product.rating
        product.review_count = scraped.get('review_count') if scraped.get('review_count') is not None else product.review_count

    db.session.commit()
    return jsonify({
        'ok': True,
        'created': created,
        'message': 'Product imported successfully',
        'product': product.to_dict()
    }), 200

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
    provided_image_urls = normalize_image_urls(data.get('image_urls'))
    image_files = [file for file in request.files.getlist('images') if file and file.filename]
    single_image = request.files.get('image') or request.files.get('image_file')
    if single_image and single_image.filename:
        image_files.insert(0, single_image)

    uploaded_urls = []
    for image_file in image_files:
        uploaded_urls.append(save_upload(image_file))

    if uploaded_urls:
        image_url = uploaded_urls[0]
    elif not image_url and provided_image_urls:
        image_url = provided_image_urls[0]
    
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

    all_image_urls = []
    seen_urls = set()
    for url in uploaded_urls + provided_image_urls:
        if url and url not in seen_urls:
            seen_urls.add(url)
            all_image_urls.append(url)

    if all_image_urls:
        product_images = [
            ProductImage(product_id=product.id, image_url=url, sort_order=index)
            for index, url in enumerate(all_image_urls)
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
    image_files = [file for file in request.files.getlist('images') if file and file.filename]
    single_image = request.files.get('image') or request.files.get('image_file')
    if single_image and single_image.filename:
        image_files.insert(0, single_image)

    uploaded_urls = []
    for image_file in image_files:
        uploaded_urls.append(save_upload(image_file))

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
    if uploaded_urls:
        if not product.images:
            start_index = 0
        else:
            start_index = max((img.sort_order or 0 for img in product.images), default=-1) + 1

        for offset, url in enumerate(uploaded_urls):
            db.session.add(ProductImage(product_id=product.id, image_url=url, sort_order=start_index + offset))
        product.image_url = uploaded_urls[0]

    normalized_urls = normalize_image_urls(data.get('image_urls')) if 'image_urls' in data else None
    if normalized_urls is not None:
        product.images.clear()
        for index, url in enumerate(normalized_urls):
            db.session.add(ProductImage(product_id=product.id, image_url=url, sort_order=index))
        if normalized_urls:
            product.image_url = normalized_urls[0]

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
