import os
import json
import re
import mimetypes
from difflib import SequenceMatcher
from uuid import uuid4
from flask import Blueprint, current_app, jsonify, request, url_for
from werkzeug.utils import secure_filename
from sqlalchemy import or_, func
from urllib.parse import urlparse, urlsplit
import requests
from app import db
from app.models import Product, ProductImage, Review, ReviewHelpfulVote, Order, OrderItem, SupportTicket

# Blueprint for products
products_bp = Blueprint('products', __name__)
admin_bp = Blueprint('admin', __name__)
support_bp = Blueprint('support', __name__)

FAQ_KB = [
    {
        'id': 'shipping_time',
        'question': 'How long does shipping take?',
        'answer': 'Shipping time depends on the merchant. Most orders arrive in 3-7 business days after confirmation.',
        'keywords': ['shipping', 'delivery', 'arrive', 'when', 'time']
    },
    {
        'id': 'order_tracking',
        'question': 'How can I track my order?',
        'answer': 'Use your order number in your merchant order tracking page. You can also contact support with your ticket number.',
        'keywords': ['track', 'tracking', 'order status', 'where is my order']
    },
    {
        'id': 'returns_refunds',
        'question': 'How do returns/refunds work?',
        'answer': 'Returns and refunds are handled by the merchant where you purchased the item. Review merchant return policies before purchase.',
        'keywords': ['return', 'refund', 'exchange', 'cancel']
    },
    {
        'id': 'account_help',
        'question': 'I forgot my password. What should I do?',
        'answer': 'Use the Forgot Password option on the Login page. We will send you a password reset link.',
        'keywords': ['forgot password', 'reset password', 'login help']
    },
    {
        'id': 'review_moderation',
        'question': 'Why is my review not visible?',
        'answer': 'New reviews go through moderation before being published. Approved reviews appear on the product page.',
        'keywords': ['review', 'moderation', 'not visible', 'pending']
    }
]

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


def is_admin_authorized():
    configured_key = get_admin_key()
    if not configured_key:
        return False
    return request.headers.get('X-Admin-Key') == configured_key


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


def fuzzy_score(query_text, product):
    query = (query_text or '').strip().lower()
    if not query:
        return 0.0

    name = (product.name or '').lower()
    category = (product.category or '').lower()
    description = (product.description or '').lower()
    haystack = f"{name} {category} {description}"

    if query in haystack:
        return 1.0

    tokens = re.findall(r'[a-z0-9]+', haystack)
    best_ratio = 0.0
    for token in tokens:
        ratio = SequenceMatcher(None, query, token).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
    name_ratio = SequenceMatcher(None, query, name).ratio() if name else 0.0
    return max(best_ratio, name_ratio)


def sort_products_in_memory(products, sort_key):
    if sort_key == 'price_asc':
        return sorted(products, key=lambda item: (item.price if item.price is not None else float('inf')))
    if sort_key == 'price_desc':
        return sorted(products, key=lambda item: (item.price if item.price is not None else 0), reverse=True)
    if sort_key == 'name_asc':
        return sorted(products, key=lambda item: (item.name or '').lower())
    if sort_key == 'rating_desc':
        return sorted(products, key=lambda item: (item.rating if item.rating is not None else -1), reverse=True)
    if sort_key == 'popular_desc':
        return sorted(products, key=lambda item: (item.review_count if item.review_count is not None else -1), reverse=True)
    if sort_key == 'deals_desc':
        return sorted(
            products,
            key=lambda item: (
                ((item.original_price or item.price or 0) - (item.deal_price or item.price or 0)),
                item.review_count or 0
            ),
            reverse=True
        )
    return sorted(products, key=lambda item: item.created_at, reverse=True)


def recompute_product_review_stats(product_id):
    avg_rating, approved_count = db.session.query(
        func.avg(Review.rating),
        func.count(Review.id)
    ).filter(
        Review.product_id == product_id,
        Review.moderation_status == 'approved'
    ).first()

    product = Product.query.get(product_id)
    if not product:
        return

    product.rating = round(float(avg_rating), 1) if avg_rating is not None else None
    product.review_count = int(approved_count or 0)
    db.session.commit()


def has_verified_purchase(reviewer_email, product_id, order_number=None):
    email = (reviewer_email or '').strip().lower()
    if not email:
        return False

    query = db.session.query(Order.id).join(
        OrderItem, OrderItem.order_id == Order.id
    ).filter(
        Order.customer_email == email,
        OrderItem.product_id == product_id
    )

    if order_number:
        query = query.filter(Order.order_number == order_number)

    return db.session.query(query.exists()).scalar()


def review_voter_token():
    explicit = (request.headers.get('X-Voter-Token') or '').strip()
    if explicit:
        return explicit[:255]
    ip = (request.remote_addr or '0.0.0.0').strip()
    user_agent = (request.headers.get('User-Agent') or 'unknown').strip()
    return f'{ip}:{user_agent}'[:255]


def normalize_text(value):
    return (value or '').strip().lower()


def comparison_score(product):
    price = product.deal_price if product.deal_price is not None else product.price
    price = price if price is not None else 0
    rating = product.rating if product.rating is not None else 0
    review_count = product.review_count if product.review_count is not None else 0
    discount = 0
    if product.original_price and product.deal_price and product.original_price > 0:
        discount = (product.original_price - product.deal_price) / product.original_price

    # Weighted score to approximate an AI recommendation signal.
    score = (rating * 16) + (min(review_count, 1000) * 0.03) + (discount * 12) - (price * 0.02)
    return score


def build_comparison_summary(products):
    if not products:
        return {}

    score_map = {product.id: comparison_score(product) for product in products}
    best = max(products, key=lambda item: score_map.get(item.id, 0))
    cheapest = min(products, key=lambda item: ((item.deal_price if item.deal_price is not None else item.price) or 0))
    top_rated = max(products, key=lambda item: (item.rating if item.rating is not None else 0))
    most_reviewed = max(products, key=lambda item: (item.review_count if item.review_count is not None else 0))

    key_points = []
    if cheapest.id != best.id:
        key_points.append(f"{cheapest.name} is the best budget option.")
    if top_rated.id != best.id:
        key_points.append(f"{top_rated.name} has the strongest rating profile.")
    if most_reviewed.id != best.id:
        key_points.append(f"{most_reviewed.name} has the highest review confidence.")

    confidence = "high" if len(products) >= 3 else "medium"
    return {
        'recommended_product_id': best.id,
        'recommended_reason': (
            f"{best.name} provides the strongest overall value based on rating, review confidence, "
            "deal strength, and effective price."
        ),
        'key_points': key_points,
        'confidence': confidence
    }


def assistant_reply(user_message):
    message = normalize_text(user_message)
    if not message:
        return None, []

    ranked = []
    for item in FAQ_KB:
        score = 0
        for keyword in item['keywords']:
            if keyword in message:
                score += 2
        score += SequenceMatcher(None, message, item['question'].lower()).ratio()
        ranked.append((score, item))

    ranked.sort(key=lambda pair: pair[0], reverse=True)
    top = [item for score, item in ranked if score >= 1.2][:3]
    if not top:
        return (
            'I can help with shipping, tracking, returns, account access, and reviews. '
            'Please share your issue and we can open a support ticket.',
            []
        )

    return top[0]['answer'], [{'id': item['id'], 'question': item['question']} for item in top[1:3]]


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


def clean_product_title(raw_title, merchant=None):
    title = (raw_title or '').strip()
    if not title:
        return ''

    cleanup_patterns = [
        r'\s*[\|\-–]\s*amazon\.com.*$',
        r'^\s*amazon\.com\s*[:\-]\s*',
        r'\s*[\|\-–]\s*buy now.*$',
        r'\s*[\|\-–]\s*official site.*$'
    ]
    for pattern in cleanup_patterns:
        title = re.sub(pattern, '', title, flags=re.IGNORECASE)

    title = re.sub(r'\s+', ' ', title).strip(' -|')
    if merchant and title.lower().startswith(merchant.lower()):
        title = title.strip()
    return title


def infer_category_from_text(name, description):
    text = f"{name or ''} {description or ''}".lower()
    category_map = {
        'Electronics': ['headphone', 'earbud', 'speaker', 'smartwatch', 'laptop', 'usb', 'charger', 'camera', 'phone', 'tablet', 'electronics'],
        'Fashion': ['shirt', 'tshirt', 'jeans', 'jacket', 'dress', 'shoe', 'sneaker', 'fashion', 'coat'],
        'Home': ['lamp', 'kitchen', 'home', 'sofa', 'bed', 'garden', 'tool', 'vacuum', 'furniture', 'decor'],
        'Books': ['book', 'novel', 'guide', 'handbook', 'paperback', 'hardcover', 'author']
    }

    best_category = None
    best_score = 0
    for category, keywords in category_map.items():
        score = sum(1 for keyword in keywords if keyword in text)
        if score > best_score:
            best_score = score
            best_category = category
    return best_category or 'General'


def extract_specs_from_text(text):
    source = (text or '')
    specs = []

    measurement_matches = re.findall(
        r'\b\d+(?:\.\d+)?\s?(?:inch|inches|cm|mm|gb|tb|mah|hz|w|oz|lb|lbs)\b',
        source,
        flags=re.IGNORECASE
    )
    specs.extend(measurement_matches[:6])

    feature_keywords = [
        'wireless', 'bluetooth', 'noise cancelling', 'waterproof', 'usb-c',
        'fast charging', 'smart', 'portable', 'lightweight', 'eco-friendly'
    ]
    lowered = source.lower()
    for keyword in feature_keywords:
        if keyword in lowered:
            specs.append(keyword.title())

    color_match = re.search(r'\b(black|white|blue|red|green|pink|silver|gold|gray|grey)\b', lowered, flags=re.IGNORECASE)
    if color_match:
        specs.append(f"Color: {color_match.group(1).title()}")

    # Preserve order and uniqueness.
    deduped = []
    seen = set()
    for item in specs:
        normalized = item.strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(item.strip())
    return deduped[:8]


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
    brand_value = find_in_json_ld(json_ld_nodes, 'brand')
    if isinstance(brand_value, dict):
        brand_value = brand_value.get('name') or brand_value.get('@id')
    specs_candidates = []
    for key in ['model', 'sku', 'mpn', 'material', 'color']:
        value = find_in_json_ld(json_ld_nodes, key)
        if isinstance(value, (str, int, float)):
            specs_candidates.append(f"{key.upper()}: {value}")
    specs_candidates.extend(extract_specs_from_text(f"{title or ''} {description or ''}"))

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
        'merchant': infer_merchant_name(final_url),
        'brand': (brand_value or '').strip() if isinstance(brand_value, str) else None,
        'specs': specs_candidates
    }


def run_ai_import_cleaner(scraped):
    report = []
    cleaned = dict(scraped or {})

    cleaned_name = clean_product_title(cleaned.get('name'), cleaned.get('merchant'))
    if cleaned_name and cleaned_name != cleaned.get('name'):
        report.append('Title normalized')
    cleaned['name'] = cleaned_name or cleaned.get('name') or 'Imported Product'

    if not cleaned.get('merchant') and cleaned.get('brand'):
        cleaned['merchant'] = cleaned.get('brand')
        report.append('Merchant filled from brand metadata')

    inferred_category = infer_category_from_text(cleaned.get('name'), cleaned.get('description'))
    cleaned['category'] = inferred_category
    report.append(f'Category inferred as {inferred_category}')

    specs = cleaned.get('specs') or []
    if not isinstance(specs, list):
        specs = []
    cleaned['specs'] = [str(spec).strip() for spec in specs if str(spec).strip()][:8]

    description = (cleaned.get('description') or '').strip()
    if not description:
        description = f"{cleaned['name']} in {cleaned['category']} category."
        report.append('Description generated because source description was missing')

    if cleaned['specs']:
        specs_line = f"Key specs: {', '.join(cleaned['specs'][:5])}."
        if 'key specs:' not in description.lower():
            description = f"{description}\n\n{specs_line}"
            report.append('Specs summary added to description')

    cleaned['description'] = description

    if cleaned.get('rating') is not None:
        cleaned['rating'] = max(0, min(5, cleaned['rating']))
    if cleaned.get('review_count') is not None:
        cleaned['review_count'] = max(0, cleaned['review_count'])

    if cleaned.get('price') is None:
        cleaned['price'] = 0.0
        report.append('Price missing; set to 0.0 for manual follow-up')

    if not cleaned.get('image_url'):
        fallback_images = {
            'Electronics': '/static/images/wireless_headphones.svg',
            'Fashion': '/static/images/tshirt.svg',
            'Home': '/static/images/led_desk_lamp.svg',
            'Books': '/static/images/python_programming_guide.svg',
            'General': '/static/images/wireless_speaker.svg'
        }
        cleaned['image_url'] = fallback_images.get(cleaned['category'], fallback_images['General'])
        report.append('Image missing; fallback image assigned')

    return cleaned, report

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


@support_bp.route('/faqs', methods=['GET'])
def support_faqs():
    return jsonify([{'id': item['id'], 'question': item['question'], 'answer': item['answer']} for item in FAQ_KB]), 200


@support_bp.route('/assistant', methods=['POST'])
def support_assistant():
    data = request.get_json(silent=True) or {}
    message = (data.get('message') or '').strip()
    if not message:
        return jsonify({'error': 'Message is required'}), 400

    answer, suggestions = assistant_reply(message)
    return jsonify({
        'ok': True,
        'answer': answer,
        'suggestions': suggestions
    }), 200


@support_bp.route('/contact', methods=['POST'])
def create_support_ticket():
    data = request.get_json(silent=True) if request.is_json else request.form.to_dict()
    data = data or {}

    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    subject = (data.get('subject') or '').strip()
    message = (data.get('message') or '').strip()
    channel = (data.get('channel') or 'contact_form').strip().lower()

    if not name:
        return jsonify({'error': 'Name is required'}), 400
    if not email or '@' not in email:
        return jsonify({'error': 'Valid email is required'}), 400
    if not subject:
        return jsonify({'error': 'Subject is required'}), 400
    if not message:
        return jsonify({'error': 'Message is required'}), 400

    assistant_answer, _ = assistant_reply(message)
    ticket = SupportTicket(
        customer_name=name,
        customer_email=email,
        subject=subject,
        message=message,
        channel=channel,
        assistant_suggestion=assistant_answer
    )
    db.session.add(ticket)
    db.session.commit()

    return jsonify({
        'ok': True,
        'message': 'Support ticket created successfully.',
        'ticket': ticket.to_dict()
    }), 201


@support_bp.route('/tickets/<string:ticket_number>', methods=['GET'])
def get_support_ticket(ticket_number):
    ticket = SupportTicket.query.filter_by(ticket_number=ticket_number).first()
    if not ticket:
        return jsonify({'error': 'Ticket not found'}), 404

    if not is_admin_authorized():
        email = (request.args.get('email') or '').strip().lower()
        if not email or email != (ticket.customer_email or '').lower():
            return jsonify({'error': 'Email mismatch for ticket lookup'}), 403

    return jsonify(ticket.to_dict()), 200


@admin_bp.route('/support/tickets', methods=['GET'])
def admin_support_tickets():
    auth_error = require_admin_key()
    if auth_error:
        return auth_error

    status = (request.args.get('status') or '').strip().lower()
    query = SupportTicket.query
    if status in {'open', 'in_progress', 'resolved', 'closed'}:
        query = query.filter_by(status=status)
    tickets = query.order_by(SupportTicket.created_at.desc()).limit(200).all()
    return jsonify([ticket.to_dict() for ticket in tickets]), 200


@admin_bp.route('/support/tickets/<int:ticket_id>/status', methods=['POST'])
def admin_update_ticket_status(ticket_id):
    auth_error = require_admin_key()
    if auth_error:
        return auth_error

    ticket = SupportTicket.query.get(ticket_id)
    if not ticket:
        return jsonify({'error': 'Ticket not found'}), 404

    data = request.get_json(silent=True) or {}
    next_status = (data.get('status') or '').strip().lower()
    if next_status not in {'open', 'in_progress', 'resolved', 'closed'}:
        return jsonify({'error': 'Invalid status'}), 400

    ticket.status = next_status
    db.session.commit()
    return jsonify({'ok': True, 'ticket': ticket.to_dict()}), 200


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
        cleaned, cleaner_report = run_ai_import_cleaner(scraped)
    except requests.RequestException as error:
        return jsonify({'error': f'Unable to fetch URL: {error}'}), 400
    except Exception as error:
        current_app.logger.exception('Product URL import failed')
        return jsonify({'error': f'Import failed: {error}'}), 500

    final_url = cleaned.get('final_url') or source_url
    persisted_image_url = persist_remote_image(cleaned.get('image_url'), referer_url=final_url)
    product = Product.query.filter_by(affiliate_url=final_url).first()
    created = product is None

    if created:
        product = Product(
            name=cleaned.get('name') or 'Imported Product',
            description=cleaned.get('description') or f'Imported from {final_url}',
            price=cleaned.get('price') if cleaned.get('price') is not None else 0.0,
            image_url=persisted_image_url,
            stock=10,
            category=cleaned.get('category') or 'General',
            affiliate_url=final_url,
            merchant=cleaned.get('merchant'),
            rating=cleaned.get('rating'),
            review_count=cleaned.get('review_count'),
            original_price=cleaned.get('price') if cleaned.get('price') is not None else 0.0
        )
        db.session.add(product)
    else:
        product.name = cleaned.get('name') or product.name
        product.description = cleaned.get('description') or product.description
        product.category = cleaned.get('category') or product.category
        if cleaned.get('price') is not None:
            product.price = cleaned.get('price')
            if not product.original_price:
                product.original_price = cleaned.get('price')
        product.image_url = persisted_image_url or product.image_url
        product.affiliate_url = final_url
        product.merchant = cleaned.get('merchant') or product.merchant
        product.rating = cleaned.get('rating') if cleaned.get('rating') is not None else product.rating
        product.review_count = cleaned.get('review_count') if cleaned.get('review_count') is not None else product.review_count

    db.session.commit()
    return jsonify({
        'ok': True,
        'created': created,
        'message': 'Product imported successfully',
        'product': product.to_dict(),
        'ai_cleaner_report': cleaner_report,
        'ai_extracted_specs': cleaned.get('specs') or []
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
    min_price = request.args.get('min_price', type=float)
    max_price = request.args.get('max_price', type=float)
    min_rating = request.args.get('min_rating', type=float)
    query = Product.query
    
    if category:
        query = query.filter_by(category=category)

    if merchant:
        query = query.filter_by(merchant=merchant)

    if deals in {'1', 'true', 'yes'}:
        query = query.filter_by(is_deal=True)

    if min_price is not None:
        query = query.filter(Product.price >= min_price)

    if max_price is not None:
        query = query.filter(Product.price <= max_price)

    if min_rating is not None:
        query = query.filter(Product.rating >= min_rating)

    search_fallback = False
    if search:
        search_like = f"%{search}%"
        query = query.filter(
            or_(
                Product.name.ilike(search_like),
                Product.description.ilike(search_like),
                Product.category.ilike(search_like)
            )
        )
        matched_count = query.count()
        search_fallback = matched_count == 0

    if search_fallback:
        base_query = Product.query
        if category:
            base_query = base_query.filter_by(category=category)
        if merchant:
            base_query = base_query.filter_by(merchant=merchant)
        if deals in {'1', 'true', 'yes'}:
            base_query = base_query.filter_by(is_deal=True)
        if min_price is not None:
            base_query = base_query.filter(Product.price >= min_price)
        if max_price is not None:
            base_query = base_query.filter(Product.price <= max_price)
        if min_rating is not None:
            base_query = base_query.filter(Product.rating >= min_rating)

        candidates = base_query.all()
        scored = [(fuzzy_score(search, product), product) for product in candidates]
        scored = [item for item in scored if item[0] >= 0.45]
        scored.sort(key=lambda item: item[0], reverse=True)
        products = [product for _, product in scored]
        products = sort_products_in_memory(products, sort)
    else:
        if sort == 'price_asc':
            query = query.order_by(Product.price.asc())
        elif sort == 'price_desc':
            query = query.order_by(Product.price.desc())
        elif sort == 'name_asc':
            query = query.order_by(Product.name.asc())
        elif sort == 'rating_desc':
            query = query.order_by(Product.rating.desc())
        elif sort == 'popular_desc':
            query = query.order_by(Product.review_count.desc())
        elif sort == 'deals_desc':
            query = query.order_by((Product.original_price - Product.deal_price).desc())
        else:
            query = query.order_by(Product.created_at.desc())

        products = query.all()

    if limit:
        products = products[:limit]

    return jsonify([product.to_dict() for product in products]), 200


@products_bp.route('/suggestions', methods=['GET'])
def product_suggestions():
    search = (request.args.get('q') or '').strip()
    limit = request.args.get('limit', type=int) or 8
    limit = max(1, min(limit, 20))
    if not search:
        return jsonify([]), 200

    search_like = f"%{search}%"
    products = Product.query.filter(
        or_(
            Product.name.ilike(search_like),
            Product.category.ilike(search_like),
            Product.merchant.ilike(search_like)
        )
    ).order_by(Product.review_count.desc(), Product.created_at.desc()).limit(limit).all()

    if not products:
        candidates = Product.query.limit(300).all()
        scored = [(fuzzy_score(search, product), product) for product in candidates]
        scored = [item for item in scored if item[0] >= 0.5]
        scored.sort(key=lambda item: item[0], reverse=True)
        products = [product for _, product in scored[:limit]]

    suggestions = []
    seen = set()
    for product in products:
        for text in [product.name, product.category]:
            value = (text or '').strip()
            key = value.lower()
            if not value or key in seen:
                continue
            seen.add(key)
            suggestions.append(value)
            if len(suggestions) >= limit:
                break
        if len(suggestions) >= limit:
            break

    return jsonify(suggestions), 200


@products_bp.route('/compare', methods=['POST'])
def compare_products():
    data = request.get_json(silent=True) or {}
    product_ids = data.get('product_ids') or []
    if not isinstance(product_ids, list):
        return jsonify({'error': 'product_ids must be an array'}), 400

    normalized_ids = []
    for raw_id in product_ids:
        parsed_id = parse_int(raw_id)
        if parsed_id is None:
            continue
        if parsed_id not in normalized_ids:
            normalized_ids.append(parsed_id)

    if len(normalized_ids) < 2:
        return jsonify({'error': 'Select at least 2 products to compare'}), 400
    if len(normalized_ids) > 4:
        return jsonify({'error': 'You can compare up to 4 products at a time'}), 400

    products = Product.query.filter(Product.id.in_(normalized_ids)).all()
    by_id = {product.id: product for product in products}
    ordered = [by_id[item_id] for item_id in normalized_ids if item_id in by_id]
    if len(ordered) < 2:
        return jsonify({'error': 'Selected products not found'}), 404

    matrix = []
    for product in ordered:
        current_price = product.deal_price if product.deal_price is not None else product.price
        discount_pct = None
        if product.original_price and product.deal_price and product.original_price > 0:
            discount_pct = round(((product.original_price - product.deal_price) / product.original_price) * 100, 1)

        matrix.append({
            'id': product.id,
            'name': product.name,
            'merchant': product.merchant,
            'category': product.category,
            'current_price': current_price,
            'list_price': product.original_price or product.price,
            'discount_pct': discount_pct,
            'rating': product.rating,
            'review_count': product.review_count,
            'description': product.description,
            'stock': product.stock,
            'affiliate_url': product.affiliate_url,
            'image_url': product.image_url,
            'score': round(comparison_score(product), 2)
        })

    summary = build_comparison_summary(ordered)
    return jsonify({
        'products': matrix,
        'summary': summary
    }), 200

@products_bp.route('/<int:product_id>', methods=['GET'])
def get_product(product_id):
    """Get single product"""
    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': 'Product not found'}), 404
    return jsonify(product.to_dict()), 200


@products_bp.route('/<int:product_id>/reviews', methods=['GET'])
def get_product_reviews(product_id):
    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': 'Product not found'}), 404

    include_pending = request.args.get('include_pending') in {'1', 'true', 'yes'}
    status = request.args.get('status')
    query = Review.query.filter_by(product_id=product_id)

    if include_pending:
        auth_error = require_admin_key()
        if auth_error:
            return auth_error
    elif status in {'pending', 'approved', 'rejected'}:
        query = query.filter_by(moderation_status=status)
    else:
        query = query.filter_by(moderation_status='approved')

    reviews = query.order_by(Review.created_at.desc()).all()
    return jsonify([review.to_dict() for review in reviews]), 200


@products_bp.route('/<int:product_id>/reviews', methods=['POST'])
def submit_product_review(product_id):
    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': 'Product not found'}), 404

    data = request.get_json(silent=True) if request.is_json else request.form.to_dict()
    data = data or {}

    reviewer_name = (data.get('reviewer_name') or '').strip()
    reviewer_email = (data.get('reviewer_email') or '').strip().lower()
    title = (data.get('title') or '').strip()
    body = (data.get('body') or '').strip()
    rating = parse_int(data.get('rating'))
    order_number = (data.get('order_number') or '').strip()

    if not reviewer_name:
        return jsonify({'error': 'Reviewer name is required'}), 400
    if not reviewer_email or '@' not in reviewer_email:
        return jsonify({'error': 'Valid reviewer email is required'}), 400
    if rating is None or rating < 1 or rating > 5:
        return jsonify({'error': 'Rating must be between 1 and 5'}), 400
    if not body:
        return jsonify({'error': 'Review text is required'}), 400

    photo_url = data.get('photo_url')
    photo_file = request.files.get('photo')
    if photo_file and photo_file.filename:
        photo_url = save_upload(photo_file)

    verified = has_verified_purchase(reviewer_email, product_id, order_number=order_number or None)

    review = Review(
        product_id=product_id,
        reviewer_name=reviewer_name,
        reviewer_email=reviewer_email,
        rating=rating,
        title=title or None,
        body=body,
        photo_url=photo_url,
        verified_purchase=verified,
        moderation_status='pending'
    )
    db.session.add(review)
    db.session.commit()

    return jsonify({
        'ok': True,
        'message': 'Review submitted and pending moderation.',
        'review': review.to_dict()
    }), 201


@products_bp.route('/reviews/<int:review_id>/helpful', methods=['POST'])
def vote_review_helpful(review_id):
    review = Review.query.get(review_id)
    if not review or review.moderation_status != 'approved':
        return jsonify({'error': 'Review not found'}), 404

    voter_token = review_voter_token()
    existing_vote = ReviewHelpfulVote.query.filter_by(review_id=review_id, voter_token=voter_token).first()
    if existing_vote:
        return jsonify({'ok': True, 'already_voted': True, 'helpful_count': review.helpful_count}), 200

    vote = ReviewHelpfulVote(review_id=review_id, voter_token=voter_token)
    review.helpful_count = (review.helpful_count or 0) + 1
    db.session.add(vote)
    db.session.commit()

    return jsonify({'ok': True, 'already_voted': False, 'helpful_count': review.helpful_count}), 200


@admin_bp.route('/reviews/pending', methods=['GET'])
def pending_reviews():
    auth_error = require_admin_key()
    if auth_error:
        return auth_error

    reviews = Review.query.filter_by(moderation_status='pending').order_by(Review.created_at.asc()).all()
    payload = []
    for review in reviews:
        data = review.to_dict()
        data['product_name'] = review.product.name if review.product else 'Unknown product'
        payload.append(data)
    return jsonify(payload), 200


@admin_bp.route('/reviews/<int:review_id>/moderate', methods=['POST'])
def moderate_review(review_id):
    auth_error = require_admin_key()
    if auth_error:
        return auth_error

    review = Review.query.get(review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404

    data = request.get_json(silent=True) or {}
    next_status = (data.get('status') or '').strip().lower()
    if next_status not in {'approved', 'rejected'}:
        return jsonify({'error': 'Status must be approved or rejected'}), 400

    review.moderation_status = next_status
    db.session.commit()
    recompute_product_review_stats(review.product_id)

    return jsonify({'ok': True, 'review': review.to_dict()}), 200

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
