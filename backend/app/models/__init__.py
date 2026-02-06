from datetime import datetime
from app import db

class Product(db.Model):
    __tablename__ = 'products'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, index=True)
    description = db.Column(db.Text, nullable=False)
    price = db.Column(db.Float, nullable=False)
    image_url = db.Column(db.String(500))
    stock = db.Column(db.Integer, default=0)
    category = db.Column(db.String(100), index=True)
    affiliate_url = db.Column(db.String(1000))
    merchant = db.Column(db.String(50))
    rating = db.Column(db.Float)
    review_count = db.Column(db.Integer)
    is_deal = db.Column(db.Boolean, default=False)
    deal_price = db.Column(db.Float)
    original_price = db.Column(db.Float)
    images = db.relationship(
        'ProductImage',
        backref='product',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='ProductImage.sort_order.asc()'
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        image_urls = [img.image_url for img in self.images] if self.images else []
        if self.image_url and self.image_url not in image_urls:
            image_urls.insert(0, self.image_url)

        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'price': self.price,
            'image_url': self.image_url,
            'image_urls': image_urls,
            'stock': self.stock,
            'category': self.category,
            'affiliate_url': self.affiliate_url,
            'merchant': self.merchant,
            'rating': self.rating,
            'review_count': self.review_count,
            'is_deal': self.is_deal,
            'deal_price': self.deal_price,
            'original_price': self.original_price
        }


class ProductImage(db.Model):
    __tablename__ = 'product_images'

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False, index=True)
    image_url = db.Column(db.String(500), nullable=False)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Cart(db.Model):
    __tablename__ = 'carts'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(255), unique=True, nullable=False, index=True)
    items = db.relationship('CartItem', backref='cart', lazy=True, cascade='all, delete-orphan')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        total = sum(item.product.price * item.quantity for item in self.items)
        return {
            'id': self.id,
            'items': [item.to_dict() for item in self.items],
            'total': total,
            'item_count': sum(item.quantity for item in self.items)
        }

class CartItem(db.Model):
    __tablename__ = 'cart_items'
    
    id = db.Column(db.Integer, primary_key=True)
    cart_id = db.Column(db.Integer, db.ForeignKey('carts.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    quantity = db.Column(db.Integer, default=1)
    product = db.relationship('Product')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'product': self.product.to_dict(),
            'quantity': self.quantity,
            'subtotal': self.product.price * self.quantity
        }

class Order(db.Model):
    __tablename__ = 'orders'
    
    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(50), unique=True, nullable=False, index=True)
    customer_name = db.Column(db.String(255), nullable=False)
    customer_email = db.Column(db.String(255), nullable=False, index=True)
    customer_phone = db.Column(db.String(20), nullable=False)
    total_amount = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(50), default='pending')  # pending, confirmed, shipped, delivered
    payment_status = db.Column(db.String(50), default='awaiting')  # awaiting, completed, failed
    items = db.relationship('OrderItem', backref='order', lazy=True, cascade='all, delete-orphan')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'order_number': self.order_number,
            'customer_name': self.customer_name,
            'customer_email': self.customer_email,
            'customer_phone': self.customer_phone,
            'total_amount': self.total_amount,
            'status': self.status,
            'payment_status': self.payment_status,
            'items': [item.to_dict() for item in self.items],
            'created_at': self.created_at.isoformat()
        }

class OrderItem(db.Model):
    __tablename__ = 'order_items'
    
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('orders.id'), nullable=False)
    product_name = db.Column(db.String(255), nullable=False)
    product_id = db.Column(db.Integer)
    quantity = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Float, nullable=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'product_name': self.product_name,
            'product_id': self.product_id,
            'quantity': self.quantity,
            'price': self.price,
            'subtotal': self.price * self.quantity
        }
