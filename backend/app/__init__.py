from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import os
from dotenv import load_dotenv

# Determine frontend paths so Flask can serve dynamic templates/static
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEMPLATES_DIR = os.path.join(BASE_DIR, 'frontend', 'templates')
STATIC_DIR = os.path.join(BASE_DIR, 'frontend', 'static')

env_path = os.path.join(BASE_DIR, 'backend', '.env')
load_dotenv(env_path)

db = SQLAlchemy()

def create_app():
    # Initialize Flask with frontend templates and static folders
    app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR)
    
    # Configuration
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///ecommerce.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
    app.config['UPLOAD_FOLDER'] = os.path.join(STATIC_DIR, 'uploads')
    app.config['MAX_CONTENT_LENGTH'] = None
    app.config['ADMIN_UPLOAD_KEY'] = os.getenv('ADMIN_UPLOAD_KEY')
    
    # Initialize extensions
    db.init_app(app)
    CORS(app)

    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Register blueprints
    from app.routes import products_bp
    app.register_blueprint(products_bp, url_prefix='/api/products')
    
    # Create database tables
    with app.app_context():
        db.create_all()
    
    return app
