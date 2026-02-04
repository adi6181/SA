# 🛍️ ShopHub - E-Commerce Platform

A modern, fully responsive e-commerce platform built with Python Flask and vanilla JavaScript. Perfect for online retail with product catalog, shopping cart, order management, and customer alerts.

## 🌟 Features

### Frontend
- ✨ **Modern Responsive Design** - Works perfectly on desktop, tablet, and mobile
- 🎨 **Beautiful UI** - Gradient design with smooth animations
- 🛍️ **Shopping Cart** - Add/remove items with real-time updates
- 🔍 **Product Search & Filter** - Search by name and filter by category
- 📱 **Mobile Optimized** - Touch-friendly interface
- 🎯 **SEO Optimized** - Meta tags, semantic HTML, proper structure

### Backend
- 🐍 **Python Flask** - Lightweight and powerful framework
- 🗄️ **SQLAlchemy ORM** - Easy database management
- 📧 **Email Notifications** - Admin alerts and customer confirmations
- 🔄 **RESTful API** - Clean, scalable API design
- 🛡️ **CORS Enabled** - Cross-origin requests support
- 💾 **SQLite Database** - Easy setup, no external DB needed

### E-Commerce Features
- 📦 **Product Management** - Catalog with images, descriptions, prices
- 🛒 **Shopping Cart** - Session-based cart management
- 📋 **Order Management** - Track orders and payment status
- 🔔 **Order Alerts** - Email notifications to admin and customers
- 💰 **Payment Ready** - Ready for payment gateway integration

## 📋 Project Structure

```
SA/
├── backend/
│   ├── app/
│   │   ├── __init__.py          # Flask app factory
│   │   ├── models/              # Database models
│   │   ├── routes/              # API endpoints
│   │   └── services/            # Business logic & email
│   ├── run.py                   # Entry point
│   ├── seed_products.py         # Sample data script
│   └── requirements.txt          # Python dependencies
│
├── frontend/
│   ├── templates/
│   │   └── index.html           # Main HTML
│   └── static/
│       ├── css/style.css        # Modern styling
│       └── js/app.js            # Application logic
│
└── README.md
```

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- pip (Python package manager)
- Modern web browser

### Backend Setup

1. **Navigate to backend directory:**
```bash
cd backend
```

2. **Create virtual environment:**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies:**
```bash
pip install -r requirements.txt
```

4. **Setup environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. **Add sample products:**
```bash
cd ..
python backend/seed_products.py
```

6. **Run the server:**
```bash
python backend/run.py
```

Server will run on `http://localhost:5000`

### Frontend Setup

1. **Navigate to frontend directory:**
```bash
cd frontend
```

2. **Start a local server:**
```bash
# Option 1: Python
python -m http.server 8000

# Option 2: Node.js with http-server
npm install -g http-server
http-server

# Option 3: VS Code Live Server extension
```

3. **Open in browser:**
```
http://localhost:8000/templates/index.html
```

## 🛠️ Configuration

### Email Setup
Edit `backend/.env`:
```env
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
ADMIN_EMAIL=admin@yourdomain.com
```

### Database
Default SQLite database is created automatically in `backend/ecommerce.db`

To use PostgreSQL:
```env
DATABASE_URL=postgresql://user:password@localhost/ecommerce
```

## 📚 API Endpoints

### Products
- `GET /api/products/` - Get all products
- `GET /api/products/<id>` - Get single product
- `POST /api/products/` - Create product (admin)

### Cart
- `GET /api/cart/<session_id>` - Get cart
- `POST /api/cart/<session_id>/add` - Add to cart
- `DELETE /api/cart/<session_id>/remove/<item_id>` - Remove item
- `DELETE /api/cart/<session_id>/clear` - Clear cart

### Orders
- `POST /api/orders/` - Create order
- `GET /api/orders/<order_number>` - Get order details
- `PATCH /api/orders/<id>/status` - Update order status

## 🎨 Customization

### Colors & Branding
Edit `frontend/static/css/style.css`:
```css
/* Main gradient colors */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

### Product Categories
Update in `frontend/templates/index.html`:
```html
<option value="Electronics">Electronics</option>
<option value="Fashion">Fashion</option>
<!-- Add more categories -->
```

## 📱 SEO Features

✅ **Implemented:**
- Meta tags for social media (Open Graph)
- Responsive viewport settings
- Semantic HTML structure
- Fast loading times
- Mobile-first design
- Proper heading hierarchy
- Product descriptions for search engines

## 🔐 Security Considerations

**Before deploying to production:**

1. Change `SECRET_KEY` in `.env`
2. Set `FLASK_ENV=production`
3. Use HTTPS
4. Add authentication for admin endpoints
5. Validate all user inputs
6. Use environment variables for sensitive data
7. Enable CSRF protection
8. Set secure cookies

## 💳 Payment Gateway Integration

Ready for integration with:
- **Stripe** - Credit/debit cards
- **PayPal** - PayPal payments
- **Razorpay** - Popular in India
- **Square** - Comprehensive payments

Integration examples coming soon!

## 📧 Email Notifications

The system sends emails for:
- ✉️ Order confirmation to customer
- 🔔 Admin notification for new orders
- 📲 Ready for SMS integration

**Email setup required in .env**

## 📞 Contact & Communication

Features ready for:
- Email confirmations
- Phone-based follow-up
- WhatsApp integration ready
- SMS gateway integration ready

## 🐛 Troubleshooting

### CORS Errors
```
Ensure CORS is properly configured in backend/app/__init__.py
Check that API_BASE_URL in app.js matches your backend URL
```

### Email Not Sending
1. Check `.env` email configuration
2. Verify Gmail app password (not regular password)
3. Enable "Less secure app access" if using Gmail
4. Check spam folder
5. Verify admin email in `.env`

### Database Issues
```bash
# Reset database
rm backend/ecommerce.db
python backend/run.py
python backend/seed_products.py
```

### CORS Not Working
```bash
# Make sure both servers are running:
# Backend: python backend/run.py (port 5000)
# Frontend: python -m http.server 8000 (port 8000)
```

## 📈 Future Enhancements

- [ ] User authentication & profiles
- [ ] Admin dashboard
- [ ] Payment gateway integration (Stripe, PayPal)
- [ ] Product reviews & ratings
- [ ] Wishlist feature
- [ ] Inventory management
- [ ] Analytics dashboard
- [ ] Mobile app (React Native)
- [ ] Multi-language support
- [ ] Social media sharing
- [ ] Email marketing integration
- [ ] SMS alerts

## 🎯 Development Roadmap

### Phase 1 (Current) ✓
- [x] Product catalog
- [x] Shopping cart
- [x] Order management
- [x] Email notifications
- [x] Responsive design
- [x] SEO optimization

### Phase 2 (Coming Soon)
- [ ] User authentication
- [ ] Admin panel
- [ ] Payment integration
- [ ] Product reviews

### Phase 3 (Future)
- [ ] Mobile app
- [ ] Analytics
- [ ] Advanced inventory

## 📄 License

This project is open source. Feel free to use and modify for your needs.

## 🤝 Support

For questions or issues during development, check the troubleshooting section or create an issue.

---

**Happy Selling! 🎉**

Built with ❤️ for e-commerce success.
