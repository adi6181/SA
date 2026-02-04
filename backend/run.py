import os
from app import create_app, db
from app.models import Product
from flask import render_template

app = create_app()


@app.shell_context_processor
def make_shell_context():
    return {'db': db, 'Product': Product}


@app.route('/', methods=['GET'])
def home():
    # Render the frontend index template with products for SEO and initial load
    products = Product.query.order_by(Product.created_at.desc()).all()
    # Pass product dicts to template
    return render_template('index.html', products=[p.to_dict() for p in products])


if __name__ == '__main__':
    # Allow overriding port via environment (useful if port 5000 is occupied)
    port = int(os.getenv('PORT', 5000))
    app.run(debug=True, port=port)
