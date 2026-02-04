# Testing Instructions for ShopHub

## Unit Testing

### Run All Tests
```bash
cd backend
python -m pytest test_app.py -v

# Or with unittest
python -m unittest test_app.py -v
```

### Run Specific Test
```bash
python -m unittest test_app.TestProduct.test_get_products
```

### Test Coverage
```bash
pip install coverage
coverage run -m unittest test_app.py
coverage report
coverage html  # Generate HTML report
```

## Manual Testing

### 1. Test Product Endpoint
```bash
# Get all products
curl http://localhost:5000/api/products/

# Get single product
curl http://localhost:5000/api/products/1

# Create product
curl -X POST http://localhost:5000/api/products/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Item",
    "description": "Test Description",
    "price": 49.99,
    "stock": 5,
    "category": "Test"
  }'
```

### 2. Test Cart Endpoint
```bash
# Get cart
curl http://localhost:5000/api/cart/session_123

# Add to cart
curl -X POST http://localhost:5000/api/cart/session_123/add \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": 1,
    "quantity": 2
  }'

# Remove from cart
curl -X DELETE http://localhost:5000/api/cart/session_123/remove/1

# Clear cart
curl -X DELETE http://localhost:5000/api/cart/session_123/clear
```

### 3. Test Order Endpoint
```bash
# Create order
curl -X POST http://localhost:5000/api/orders/ \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "session_123",
    "customer_name": "John Doe",
    "customer_email": "john@example.com",
    "customer_phone": "+1234567890"
  }'

# Get order
curl http://localhost:5000/api/orders/ORD-20260130-ABC123
```

## Frontend Testing

### Test Checklist
- [ ] Home page loads correctly
- [ ] Product grid displays all products
- [ ] Search functionality works
- [ ] Category filter works
- [ ] Add to cart button works
- [ ] Cart sidebar opens/closes
- [ ] Cart items update correctly
- [ ] Remove item from cart works
- [ ] Checkout form appears
- [ ] Form validation works
- [ ] Order submission works
- [ ] Success message displays
- [ ] Page is responsive on mobile
- [ ] Navigation links work

## Performance Testing

### Load Testing with Apache Bench
```bash
# Single request
ab -n 100 -c 10 http://localhost:5000/api/products/

# Simulate concurrent users
ab -n 1000 -c 50 http://localhost:5000/api/products/
```

### Load Testing with wrk
```bash
brew install wrk  # macOS

# Test endpoints
wrk -t4 -c100 -d30s http://localhost:5000/api/products/
```

## Database Testing

### Check Database Content
```bash
cd backend

# Open SQLite shell
sqlite3 ecommerce.db

# Check products
SELECT * FROM products;

# Check orders
SELECT * FROM orders;

# Check carts
SELECT * FROM carts;
```

## Browser DevTools Testing

### Network Tab
1. Open Developer Tools (F12)
2. Go to Network tab
3. Clear cart, add item, checkout
4. Verify API calls are successful (200 status)
5. Check response times

### Console Tab
1. Open Developer Tools (F12)
2. Go to Console tab
3. Try JavaScript commands:
```javascript
// Get current session ID
localStorage.getItem('sessionId')

// Check cached products
JSON.parse(localStorage.getItem('cachedProducts'))

// Test API call
fetch('http://localhost:5000/api/products/')
  .then(r => r.json())
  .then(d => console.log(d))
```

## Email Testing

### Test Email Service
1. Update .env with your Gmail credentials
2. Create a test account on mailinator.com
3. Use mailinator email in checkout form
4. Verify email received in inbox
5. Check admin email for alerts

### Debug Email Issues
```python
# In Python shell
from app import create_app, mail
from flask_mail import Message

app = create_app()

with app.app_context():
    msg = Message('Test', recipients=['test@example.com'], body='Test')
    mail.send(msg)
    print("Email sent!")
```

## Mobile Testing

### Test on Real Device
1. Get your computer's IP: `ifconfig`
2. On mobile, open: `http://YOUR_IP:8000/templates/index.html`
3. Test all features on mobile

### Test Different Screen Sizes
1. Open DevTools (F12)
2. Click device toggle (Ctrl+Shift+M)
3. Test on different device presets

## CI/CD Testing

### GitHub Actions Example
Create `.github/workflows/test.yml`:
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-python@v2
      with:
        python-version: 3.9
    
    - name: Install dependencies
      run: pip install -r backend/requirements.txt
    
    - name: Run tests
      run: cd backend && python -m unittest test_app.py
```

## Accessibility Testing

- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Color contrast sufficient
- [ ] Form labels present
- [ ] Error messages clear
- [ ] Mobile touch targets large enough

## Security Testing

- [ ] CORS properly configured
- [ ] No sensitive data in console logs
- [ ] SQL injection protection (ORM used)
- [ ] XSS protection (sanitization)
- [ ] CSRF tokens (if needed)
- [ ] Rate limiting implemented

---

**Report Issues:** Document any bugs found and create an issue in your repository.
