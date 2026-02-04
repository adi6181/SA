# Deployment Guide for ShopHub E-Commerce Platform

## 🚀 Deploying to Production

This guide covers deploying ShopHub to various platforms.

### Prerequisites
- Python 3.8+
- PostgreSQL (recommended for production)
- Email service credentials (Gmail, SendGrid, etc.)
- Domain name (optional)
- SSL certificate (for HTTPS)

## Option 1: Deploy on Heroku

### Step 1: Prepare Your App
```bash
# Create Procfile
echo "web: gunicorn backend.run:app" > Procfile

# Create runtime.txt
echo "python-3.9.16" > runtime.txt

# Update requirements.txt
pip install gunicorn
pip freeze > backend/requirements.txt
```

### Step 2: Initialize Heroku
```bash
heroku login
heroku create your-app-name
heroku addons:create heroku-postgresql:hobby-dev
```

### Step 3: Set Environment Variables
```bash
heroku config:set FLASK_ENV=production
heroku config:set SECRET_KEY=$(python -c 'import secrets; print(secrets.token_hex(32))')
heroku config:set MAIL_USERNAME=your-email@gmail.com
heroku config:set MAIL_PASSWORD=your-app-password
```

### Step 4: Deploy
```bash
git push heroku main
heroku run python backend/seed_products.py
```

## Option 2: Deploy on PythonAnywhere

### Step 1: Sign Up
- Go to www.pythonanywhere.com
- Create a free account

### Step 2: Upload Code
- Use the web interface to upload your project
- Or use git clone if enabled

### Step 3: Configure Virtual Environment
```bash
mkvirtualenv --python=/usr/bin/python3.9 shophub
pip install -r backend/requirements.txt
```

### Step 4: Configure Web App
- Set Python version: 3.9
- Set WSGI file: point to backend/run.py
- Add static files path

### Step 5: Set Environment Variables
- Use .env or set in WSGI file

## Option 3: Deploy on AWS (EC2)

### Step 1: Launch EC2 Instance
```bash
# Choose Ubuntu 20.04 LTS
# Allow ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)
```

### Step 2: SSH into Instance
```bash
ssh -i your-key.pem ubuntu@your-instance-ip
```

### Step 3: Install Dependencies
```bash
sudo apt update
sudo apt install python3-pip python3-venv postgresql

# Install Node.js for frontend
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs
```

### Step 4: Clone Repository
```bash
git clone your-repo-url shophub
cd shophub
```

### Step 5: Setup Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn
```

### Step 6: Create Systemd Service
```bash
sudo nano /etc/systemd/system/shophub.service
```

```ini
[Unit]
Description=ShopHub E-Commerce
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/shophub/backend
ExecStart=/home/ubuntu/shophub/backend/venv/bin/gunicorn -w 4 -b 127.0.0.1:5000 run:app
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl start shophub
sudo systemctl enable shophub
```

### Step 7: Setup Nginx
```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/shophub
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /static {
        alias /home/ubuntu/shophub/frontend/static;
    }

    location /templates {
        alias /home/ubuntu/shophub/frontend/templates;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/shophub /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 8: Setup SSL with Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Option 4: Deploy on DigitalOcean

Similar to AWS EC2, but simpler:

1. Create Droplet (Ubuntu 20.04)
2. SSH in and follow AWS EC2 steps (omit IAM/Security Groups)
3. Use DigitalOcean's App Platform for easier deployment

## Production Checklist

- [ ] Change SECRET_KEY to a strong value
- [ ] Set FLASK_ENV=production
- [ ] Use PostgreSQL instead of SQLite
- [ ] Setup email service (Gmail app password, SendGrid, etc.)
- [ ] Enable HTTPS with SSL certificate
- [ ] Setup database backups
- [ ] Configure error logging
- [ ] Setup monitoring (Uptime, errors, performance)
- [ ] Implement rate limiting
- [ ] Add Web Application Firewall (WAF)
- [ ] Regular security updates

## Environment Variables for Production

```env
FLASK_ENV=production
FLASK_APP=run.py
SECRET_KEY=use-strong-random-key
DATABASE_URL=postgresql://user:pass@host:5432/shophub
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=True
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=app-specific-password
ADMIN_EMAIL=admin@yourdomain.com
```

## Database Migration (SQLite to PostgreSQL)

```bash
# Install PostgreSQL client
pip install psycopg2-binary

# Export data from SQLite
python
from app import create_app, db
from app.models import Product
app = create_app()
with app.app_context():
    products = Product.query.all()
    # Backup data
```

## Monitoring & Logging

### Setup Error Logging
```python
import logging
from logging.handlers import RotatingFileHandler

handler = RotatingFileHandler('logs/shophub.log', maxBytes=10240000, backupCount=10)
handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s: %(message)s'))
app.logger.addHandler(handler)
```

### Setup Performance Monitoring
- Use New Relic (APM)
- Use DataDog
- Use Scout APM

## Scaling Tips

1. **Database**: Use PostgreSQL with proper indexing
2. **Caching**: Implement Redis for session/product caching
3. **Storage**: Use S3 for product images
4. **CDN**: Use CloudFront/CloudFlare for static assets
5. **Load Balancing**: Use nginx or AWS ELB

## Backup Strategy

```bash
# Automated PostgreSQL backup
pg_dump shophub > backup-$(date +%Y%m%d).sql
```

Schedule this daily using cron:
```bash
0 2 * * * /home/ubuntu/backup-db.sh
```

---

**Need Help?** Check official deployment docs:
- Heroku: https://devcenter.heroku.com/articles/getting-started-with-python
- DigitalOcean: https://www.digitalocean.com/docs/
- AWS: https://aws.amazon.com/getting-started/
