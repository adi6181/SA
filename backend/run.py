import os
from app import create_app, db
from app.models import Product
from flask import render_template, abort

app = create_app()


@app.shell_context_processor
def make_shell_context():
    return {'db': db, 'Product': Product}


@app.route('/', methods=['GET'])
def home():
    products = Product.query.order_by(Product.created_at.desc()).limit(12).all()
    return render_template('index.html', products=[p.to_dict() for p in products])


@app.route('/category/<string:category>', methods=['GET'])
def category_page(category):
    products = Product.query.filter_by(category=category).order_by(Product.created_at.desc()).all()
    return render_template('category.html', category=category, products=[p.to_dict() for p in products])


@app.route('/product/<int:product_id>', methods=['GET'])
def product_detail(product_id):
    product = Product.query.get(product_id)
    if not product:
        abort(404)
    return render_template('product.html', product=product.to_dict())


@app.route('/reviews', methods=['GET'])
def reviews_page():
    products = Product.query.filter(Product.rating.isnot(None)).order_by(Product.rating.desc()).limit(12).all()
    return render_template('reviews.html', products=[p.to_dict() for p in products])


@app.route('/deals', methods=['GET'])
def deals_page():
    products = Product.query.filter_by(is_deal=True).order_by(Product.created_at.desc()).all()
    return render_template('deals.html', products=[p.to_dict() for p in products])


if __name__ == '__main__':
    # Allow overriding port via environment (useful if port 5000 is occupied)
    port = int(os.getenv('PORT', 5000))
    app.run(debug=True, port=port)
