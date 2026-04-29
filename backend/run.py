import os
from app import create_app, db, mail, limiter
from app.models import Product, User
from flask import render_template, abort, request, jsonify, url_for, current_app
from flask_mail import Message
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import inspect, text
import re

app = create_app()


@app.shell_context_processor
def make_shell_context():
    return {'db': db, 'Product': Product, 'User': User}


EMAIL_PATTERN = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def reset_token_serializer():
    return URLSafeTimedSerializer(current_app.config['SECRET_KEY'])


def generate_reset_token(email):
    serializer = reset_token_serializer()
    return serializer.dumps(email, salt='password-reset')


def verify_reset_token(token, max_age_seconds=3600):
    serializer = reset_token_serializer()
    return serializer.loads(token, salt='password-reset', max_age=max_age_seconds)


def send_password_reset_email(user_email, reset_link):
    mail_server = current_app.config.get('MAIL_SERVER')
    mail_sender = current_app.config.get('MAIL_DEFAULT_SENDER')
    if not mail_server or not mail_sender:
        return False

    message = Message(
        subject='DealDrop Password Reset Link',
        recipients=[user_email]
    )
    message.body = (
        "You requested a password reset for DealDrop.\n\n"
        f"Reset your password: {reset_link}\n\n"
        "If you did not request this, you can ignore this email."
    )
    message.html = (
        "<p>You requested a password reset for DealDrop.</p>"
        f"<p><a href=\"{reset_link}\">Reset your password</a></p>"
        "<p>If you did not request this, you can ignore this email.</p>"
    )
    mail.send(message)
    return True


def is_valid_us_state(state_value):
    return bool(re.match(r'^[A-Za-z]{2}$', state_value or ''))


def is_valid_us_zip(zip_value):
    return bool(re.match(r'^\d{5}(?:-\d{4})?$', zip_value or ''))


def ensure_user_schema():
    """Apply lightweight SQLite-safe column additions for existing user tables."""
    with app.app_context():
        inspector = inspect(db.engine)
        if 'users' not in inspector.get_table_names():
            return

        existing_columns = {column['name'] for column in inspector.get_columns('users')}
        migrations = {
            'address_line1': "ALTER TABLE users ADD COLUMN address_line1 VARCHAR(255)",
            'address_line2': "ALTER TABLE users ADD COLUMN address_line2 VARCHAR(255)",
            'city': "ALTER TABLE users ADD COLUMN city VARCHAR(100)",
            'state': "ALTER TABLE users ADD COLUMN state VARCHAR(2)",
            'zip_code': "ALTER TABLE users ADD COLUMN zip_code VARCHAR(10)"
        }

        for column_name, statement in migrations.items():
            if column_name not in existing_columns:
                db.session.execute(text(statement))
        db.session.commit()


@app.route('/api/newsletter/subscribe', methods=['POST'])
@limiter.limit("5 per hour")
def newsletter_subscribe():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email or not EMAIL_PATTERN.match(email):
        return jsonify({'error': 'Valid email is required'}), 400
    # Log subscription (extend later to save to DB or send to email service)
    current_app.logger.info(f'Newsletter subscription: {email}')
    try:
        mail_server = current_app.config.get('MAIL_SERVER')
        mail_sender = current_app.config.get('MAIL_DEFAULT_SENDER')
        if mail_server and mail_sender:
            msg = Message(
                subject='Welcome to DealDrop Deals! 🎉',
                recipients=[email]
            )
            msg.body = (
                "Hey there!\n\n"
                "You're now subscribed to DealDrop — your daily source for the best deals on "
                "Electronics, Fashion, Books, and Home products.\n\n"
                "We'll send you the hottest deals every week. Stay tuned!\n\n"
                "— The DealDrop Team\n"
                "https://dealdrop.com"
            )
            msg.html = (
                "<h2>Welcome to DealDrop! 🏷️</h2>"
                "<p>You're now subscribed to our weekly deals newsletter.</p>"
                "<p>Every week we'll send you the best curated deals on Electronics, Fashion, Books and Home — all in one place.</p>"
                "<p>Stay tuned for your first drop!</p>"
                "<p><strong>— The DealDrop Team</strong></p>"
            )
            mail.send(msg)
    except Exception as e:
        current_app.logger.warning(f'Newsletter welcome email failed: {e}')
    return jsonify({'ok': True, 'message': "You're subscribed! Check your inbox."}), 200


@app.route('/', methods=['GET'])
def home():
    products = Product.query.order_by(Product.created_at.desc()).limit(12).all()
    return render_template('index.html', products=[p.to_dict() for p in products])


@app.route('/category/Fashion', methods=['GET'])
def fashion_page():
    products = Product.query.filter_by(category='Fashion').order_by(Product.created_at.desc()).all()
    return render_template('fashion.html', products=[p.to_dict() for p in products])


@app.route('/category/Books', methods=['GET'])
def books_page():
    products = Product.query.filter_by(category='Books').order_by(Product.created_at.desc()).all()
    return render_template('books.html', products=[p.to_dict() for p in products])


@app.route('/category/Electronics', methods=['GET'])
def electronics_page():
    products = Product.query.filter_by(category='Electronics').order_by(Product.created_at.desc()).all()
    return render_template('electronics.html', products=[p.to_dict() for p in products])


@app.route('/category/Home', methods=['GET'])
def home_category_page():
    products = Product.query.filter_by(category='Home').order_by(Product.created_at.desc()).all()
    return render_template('home_category.html', products=[p.to_dict() for p in products])


@app.route('/category/<string:category>', methods=['GET'])
def category_page(category):
    products = Product.query.filter_by(category=category).order_by(Product.created_at.desc()).all()
    return render_template('category.html', category=category, products=[p.to_dict() for p in products])


@app.route('/product/<int:product_id>', methods=['GET'])
def product_detail(product_id):
    product = Product.query.get(product_id)
    if not product:
        abort(404)
    d = product.to_dict()
    imgs = d.get('image_urls') or []
    primary_image = imgs[0] if imgs else (d.get('image_url') or '')
    popup = request.args.get('popup') in {'1', 'true', 'yes'}
    template_name = 'product_popup.html' if popup else 'product.html'
    return render_template(template_name, product=d, primary_image=primary_image)


@app.route('/cart', methods=['GET'])
def cart_page():
    return render_template('cart.html')


@app.route('/wishlist', methods=['GET'])
def wishlist_page():
    return render_template('wishlist.html')


@app.route('/reviews', methods=['GET'])
def reviews_page():
    products = Product.query.filter(Product.rating.isnot(None)).order_by(Product.rating.desc()).limit(12).all()
    return render_template('reviews.html', products=[p.to_dict() for p in products])


@app.route('/deals', methods=['GET'])
def deals_page():
    products = Product.query.filter_by(is_deal=True).order_by(Product.created_at.desc()).all()
    return render_template('deals.html', products=[p.to_dict() for p in products])

@app.route('/login', methods=['GET'])
def login_page():
    return render_template('login.html')


@app.route('/signup', methods=['GET'])
def signup_page():
    return render_template('signup.html')


@app.route('/support', methods=['GET'])
def support_page():
    return render_template('support.html')


@app.route('/privacy', methods=['GET'])
def privacy_page():
    return render_template('privacy.html')


@app.route('/terms', methods=['GET'])
def terms_page():
    return render_template('terms.html')


@app.route('/robots.txt', methods=['GET'])
def robots_txt():
    from flask import send_from_directory
    import os
    static_dir = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'static')
    return send_from_directory(os.path.abspath(static_dir), 'robots.txt', mimetype='text/plain')


@app.route('/sw.js', methods=['GET'])
def service_worker():
    from flask import send_from_directory, make_response
    import os
    static_dir = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'static')
    response = make_response(send_from_directory(os.path.abspath(static_dir), 'sw.js', mimetype='application/javascript'))
    response.headers['Service-Worker-Allowed'] = '/'
    response.headers['Cache-Control'] = 'no-cache'
    return response


@app.route('/sitemap.xml', methods=['GET'])
def sitemap_xml():
    from flask import Response
    products = Product.query.order_by(Product.created_at.desc()).all()
    base = request.host_url.rstrip('/')
    urls = [
        f'<url><loc>{base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>',
        f'<url><loc>{base}/deals</loc><changefreq>daily</changefreq><priority>0.9</priority></url>',
        f'<url><loc>{base}/category/Electronics</loc><changefreq>daily</changefreq><priority>0.8</priority></url>',
        f'<url><loc>{base}/category/Fashion</loc><changefreq>daily</changefreq><priority>0.8</priority></url>',
        f'<url><loc>{base}/category/Books</loc><changefreq>daily</changefreq><priority>0.8</priority></url>',
        f'<url><loc>{base}/category/Home</loc><changefreq>daily</changefreq><priority>0.8</priority></url>',
        f'<url><loc>{base}/privacy</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>',
        f'<url><loc>{base}/terms</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>',
    ]
    for p in products:
        urls.append(f'<url><loc>{base}/product/{p.id}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>')
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += '\n'.join(urls)
    xml += '\n</urlset>'
    return Response(xml, mimetype='application/xml')


@app.route('/reset-password', methods=['GET'])
def reset_password_page():
    token = request.args.get('token', '').strip()
    return render_template('reset_password.html', token=token)


@app.route('/api/auth/forgot-password', methods=['POST'])
@limiter.limit("5 per hour")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()

    if not email or not EMAIL_PATTERN.match(email):
        return jsonify({'error': 'Valid email is required'}), 400

    # Do not reveal whether an account exists.
    user = User.query.filter_by(email=email).first()
    response = {'ok': True, 'message': 'If an account exists, a password reset link has been sent to your email.'}
    if not user:
        return jsonify(response), 200

    token = generate_reset_token(user.email)
    reset_link = url_for('reset_password_page', token=token, _external=True)

    try:
        sent = send_password_reset_email(user.email, reset_link)
    except Exception as error:
        current_app.logger.warning(f'Password reset email failed: {error}')
        sent = False

    # In local/dev setup where mail is not configured, expose the link for testing.
    if not sent:
        response['reset_link'] = reset_link
        response['message'] = 'Email service is not configured. Use the reset link below for development.'

    return jsonify(response), 200


@app.route('/api/auth/register', methods=['POST'])
@limiter.limit("10 per hour")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    address_line1 = (data.get('address_line1') or '').strip()
    address_line2 = (data.get('address_line2') or '').strip() or None
    city = (data.get('city') or '').strip()
    state = (data.get('state') or '').strip().upper()
    zip_code = (data.get('zip_code') or '').strip()
    country_code = (data.get('country_code') or 'US').strip().upper()

    if not name:
        return jsonify({'error': 'Name is required'}), 400
    if not email or not EMAIL_PATTERN.match(email):
        return jsonify({'error': 'Valid email is required'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    if not address_line1 or not city:
        return jsonify({'error': 'Address and city are required'}), 400
    if not is_valid_us_state(state):
        return jsonify({'error': 'State must be 2 letters'}), 400
    if not is_valid_us_zip(zip_code):
        return jsonify({'error': 'Enter a valid US ZIP code'}), 400
    if country_code != 'US':
        return jsonify({'error': 'Registration is currently available only in the USA'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 409

    user = User(
        name=name,
        email=email,
        password_hash=generate_password_hash(password),
        address_line1=address_line1,
        address_line2=address_line2,
        city=city,
        state=state,
        zip_code=zip_code,
        country_code='US'
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({'ok': True, 'message': 'Account created successfully.'}), 201


@app.route('/api/auth/login', methods=['POST'])
@limiter.limit("10 per minute")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Invalid email or password'}), 401

    return jsonify({'ok': True, 'message': 'Login successful.'}), 200


@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json(silent=True) or {}
    token = (data.get('token') or '').strip()
    new_password = data.get('new_password') or ''
    verify_password = data.get('verify_password') or ''

    if not token:
        return jsonify({'error': 'Reset token is required'}), 400
    if len(new_password) < 8:
        return jsonify({'error': 'New password must be at least 8 characters'}), 400
    if new_password != verify_password:
        return jsonify({'error': 'Passwords do not match'}), 400

    try:
        email = verify_reset_token(token, max_age_seconds=3600)
    except SignatureExpired:
        return jsonify({'error': 'Reset link has expired. Request a new one.'}), 400
    except BadSignature:
        return jsonify({'error': 'Invalid reset link'}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'Account not found'}), 404

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({'ok': True, 'message': 'Password reset successful. You can now log in.'}), 200

ensure_user_schema()


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV', 'production') == 'development'
    app.run(debug=debug, port=port)
