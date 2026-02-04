# 🛍️ ShopHub Development Guide

## Project Overview

ShopHub is a modern e-commerce platform built with:
- **Backend**: Python Flask + SQLAlchemy ORM
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Database**: SQLite (dev) / PostgreSQL (production)
- **API**: RESTful API with CORS support

## 🎯 Current Features (Phase 1 - Complete)

✅ Product Catalog
- Display products with images, descriptions, prices
- Search and filter by category
- Responsive product grid

✅ Shopping Cart
- Session-based cart management
- Add/remove items
- Real-time updates
- Cart persistence

✅ Order Management
- Checkout form with validation
- Order confirmation
- Order number generation
- Order tracking

✅ Email Notifications
- Admin alerts for new orders
- Customer order confirmations
- Phone/email collection for follow-up

✅ User Experience
- Modern gradient UI
- Smooth animations
- Mobile responsive
- Fast loading

✅ SEO Optimization
- Meta tags for social media
- Semantic HTML
- Proper heading structure
- Keyword optimization

## 🚀 Upcoming Features (Phase 2 & 3)

### Phase 2 (Coming Soon)
```
[ ] User Authentication
  - Login/Register system
  - User profiles
  - Order history
  
[ ] Admin Dashboard
  - Product management
  - Order management
  - Analytics
  
[ ] Payment Integration
  - Stripe integration
  - PayPal integration
  - Order payment tracking
  
[ ] Product Reviews
  - Customer reviews
  - Rating system
  - Review moderation
```

### Phase 3 (Future)
```
[ ] Mobile App (React Native/Flutter)
[ ] Advanced Analytics
[ ] Inventory Management
[ ] Wishlist Feature
[ ] Social Media Integration
[ ] Multi-language Support
```

## 📁 Project Structure

```
SA/
├── backend/
│   ├── app/
│   │   ├── __init__.py          # Flask factory & config
│   │   ├── models/
│   │   │   └── __init__.py      # Database models
│   │   ├── routes/
│   │   │   └── __init__.py      # API endpoints
│   │   └── services/
│   │       └── __init__.py      # Business logic
│   ├── run.py                   # Entry point
│   ├── seed_products.py         # Sample data
│   ├── config.py                # Environment config
│   ├── test_app.py              # Unit tests
│   └── requirements.txt          # Dependencies
│
├── frontend/
│   ├── templates/
│   │   └── index.html           # Main page
│   └── static/
│       ├── css/
│       │   └── style.css        # Styling
│       ├── js/
│       │   └── app.js           # Logic
│       └── images/              # Assets
│
├── DEPLOYMENT.md                # Deployment guide
├── TESTING.md                   # Testing guide
├── README.md                    # Main docs
├── .gitignore                   # Git ignore
├── setup.sh                     # Mac/Linux setup
└── setup.bat                    # Windows setup
```

## 🔧 Development Workflow

### 1. Setting Up Development Environment

```bash
# Clone repository
git clone <your-repo> shophub
cd shophub

# Option A: Auto setup (Mac/Linux)
chmod +x setup.sh
./setup.sh

# Option B: Auto setup (Windows)
setup.bat

# Option C: Manual setup
cd backend
python -m venv venv
source venv/bin/activate  # Mac/Linux
# or
venv\Scripts\activate  # Windows
pip install -r requirements.txt
python seed_products.py
```

### 2. Running the Application

```bash
# Terminal 1: Start Backend
cd backend
source venv/bin/activate
python run.py

# Terminal 2: Start Frontend
cd frontend
python -m http.server 8000

# Open browser to:
http://localhost:8000/templates/index.html
```

### 3. Making Code Changes

#### Backend Changes
1. Edit files in `backend/app/`
2. Server auto-reloads (Flask debug mode)
3. Test with API client or frontend

#### Frontend Changes
1. Edit files in `frontend/`
2. Refresh browser (changes instant)
3. Check console for errors

### 4. Testing Changes

```bash
# Run unit tests
cd backend
python -m unittest test_app.py -v

# Manual API testing
curl http://localhost:5000/api/products/

# Check frontend console
# Open DevTools (F12) → Console
```

## 📝 Adding New Features

### Example: Add Product Review Feature

1. **Update Database Model**
```python
# backend/app/models/__init__.py
class Review(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'))
    rating = db.Column(db.Integer)
    text = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

2. **Add API Endpoint**
```python
# backend/app/routes/__init__.py
@products_bp.route('/<int:product_id>/reviews', methods=['GET'])
def get_reviews(product_id):
    reviews = Review.query.filter_by(product_id=product_id).all()
    return jsonify([r.to_dict() for r in reviews])
```

3. **Update Frontend**
```javascript
// frontend/static/js/app.js
async function loadReviews(productId) {
    const response = await fetch(`${API_BASE_URL}/products/${productId}/reviews`);
    const reviews = await response.json();
    displayReviews(reviews);
}
```

4. **Update HTML**
```html
<!-- frontend/templates/index.html -->
<div class="product-reviews" id="reviews"></div>
```

5. **Test the Feature**
```bash
# Run tests
python -m unittest test_app.py

# Manual test
curl http://localhost:5000/api/products/1/reviews
```

## 🐛 Debugging Guide

### Backend Debugging
```python
# Add debug prints
print(f"DEBUG: variable = {variable}")

# Use debugger
import pdb; pdb.set_trace()

# Check logs
# Logs appear in terminal where Flask runs
```

### Frontend Debugging
```javascript
// Check console errors
console.log('Debug:', data);
console.error('Error:', error);

// Use debugger
debugger; // Pauses execution in DevTools

// Check network requests
// DevTools → Network tab
```

### Database Debugging
```bash
# Check database content
sqlite3 backend/ecommerce.db

# Inside SQLite:
.tables  # Show all tables
SELECT * FROM products;
SELECT * FROM orders;
.quit   # Exit SQLite
```

## 📊 Database Schema

### Products Table
```
id          INTEGER PRIMARY KEY
name        VARCHAR(255) NOT NULL
description TEXT NOT NULL
price       FLOAT NOT NULL
image_url   VARCHAR(500)
stock       INTEGER
category    VARCHAR(100)
created_at  DATETIME
updated_at  DATETIME
```

### Carts Table
```
id          INTEGER PRIMARY KEY
session_id  VARCHAR(255) UNIQUE
items       (relationship to CartItem)
created_at  DATETIME
updated_at  DATETIME
```

### Cart Items Table
```
id          INTEGER PRIMARY KEY
cart_id     INTEGER (foreign key)
product_id  INTEGER (foreign key)
quantity    INTEGER
created_at  DATETIME
```

### Orders Table
```
id              INTEGER PRIMARY KEY
order_number    VARCHAR(50) UNIQUE
customer_name   VARCHAR(255)
customer_email  VARCHAR(255)
customer_phone  VARCHAR(20)
total_amount    FLOAT
status          VARCHAR(50)  # pending, confirmed, shipped, delivered
payment_status  VARCHAR(50)  # awaiting, completed, failed
items           (relationship to OrderItem)
created_at      DATETIME
updated_at      DATETIME
```

## 🔌 API Reference

### Base URL
```
http://localhost:5000/api
```

### Authentication
Currently no authentication. To add:
1. Create User model
2. Add JWT tokens
3. Protect endpoints with decorators

### Response Format
```json
{
  "id": 1,
  "name": "Product Name",
  "price": 29.99
}
```

### Error Format
```json
{
  "error": "Error message",
  "code": 404
}
```

## 🎨 Styling Guide

### Color Scheme
```css
Primary: #667eea (Purple)
Secondary: #764ba2 (Dark Purple)
Accent: #ff6b6b (Red)
Success: #4caf50 (Green)
Background: #f8f9fa (Light Gray)
```

### Responsive Breakpoints
```css
Mobile: max-width: 480px
Tablet: max-width: 768px
Desktop: 1200px+
```

### CSS Structure
```
- Reset and base styles
- Typography
- Components (buttons, cards, etc.)
- Layout (grid, flex)
- Utilities
- Responsive media queries
```

## 📦 Dependency Management

### Backend Dependencies
```
Flask==3.0.0          # Web framework
Flask-SQLAlchemy==3.1 # ORM
Flask-CORS==4.0.0     # CORS support
Flask-Mail==0.9.1     # Email service
python-dotenv==1.0.0  # Environment variables
Werkzeug==3.0.1       # Utilities
requests==2.31.0      # HTTP library
```

### Adding New Package
```bash
# Install
pip install package-name

# Update requirements
pip freeze > backend/requirements.txt

# Commit
git add backend/requirements.txt
git commit -m "Add package-name"
```

## 🔐 Security Checklist

- [x] Use environment variables for secrets
- [x] CORS configured
- [ ] Add authentication
- [ ] Add input validation
- [ ] Add rate limiting
- [ ] Add HTTPS redirects
- [ ] Sanitize user input
- [ ] Secure password hashing (if added)
- [ ] CSRF tokens (if forms added)
- [ ] SQL injection protection (using ORM)

## 📈 Performance Tips

1. **Database Indexing**
```python
# Add to model
name = db.Column(db.String(255), index=True)
```

2. **Caching**
```python
from flask_caching import Cache
cache = Cache(app, config={'CACHE_TYPE': 'simple'})
```

3. **Image Optimization**
- Use WebP format
- Lazy load images
- CDN for static assets

4. **Code Splitting**
- Load JS modules as needed
- Minimize CSS
- Gzip compression

## 🚀 Deployment Preparation

1. Update `.env` with production values
2. Set `FLASK_ENV=production`
3. Use PostgreSQL instead of SQLite
4. Enable HTTPS
5. Setup email service
6. Add error logging
7. Setup monitoring
8. Enable backups

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed steps.

## 📚 Learning Resources

- [Flask Documentation](https://flask.palletsprojects.com/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [MDN Web Docs](https://developer.mozilla.org/)
- [REST API Best Practices](https://restfulapi.net/)
- [Web Security Academy](https://portswigger.net/web-security)

## 💡 Tips & Tricks

### Useful Commands
```bash
# Reset database completely
rm backend/ecommerce.db && python backend/run.py

# Generate new secret key
python -c "import secrets; print(secrets.token_hex(32))"

# Check open ports
lsof -i :5000  # Mac/Linux
netstat -ano | findstr :5000  # Windows

# View Flask shell
python backend/run.py
# Then in shell:
from app.models import Product
Product.query.count()
```

### Useful VS Code Extensions
- Python
- Flask-snippets
- Thunder Client (API testing)
- SQLite Viewer
- Prettier (code formatting)

## 📞 Support & Questions

- Check README.md for common issues
- Review code comments
- Check TESTING.md for testing help
- Review DEPLOYMENT.md for production issues

---

**Happy developing! 🚀**

Remember to:
- Write clean code
- Test your changes
- Document new features
- Commit regularly with meaningful messages
- Keep dependencies updated
