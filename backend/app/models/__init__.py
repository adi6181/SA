from datetime import datetime
import uuid
from app import db

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    address_line1 = db.Column(db.String(255))
    address_line2 = db.Column(db.String(255))
    city = db.Column(db.String(100))
    state = db.Column(db.String(2))
    zip_code = db.Column(db.String(10))
    country_code = db.Column(db.String(2), nullable=False, default='US')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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
    reviews = db.relationship(
        'Review',
        backref='product',
        lazy=True,
        cascade='all, delete-orphan',
        order_by='Review.created_at.desc()'
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def build_why_this_product(self):
        reasons = []
        evidence_count = 0

        if self.rating is not None and self.review_count:
            reasons.append(f"Rated {self.rating:.1f}/5 from {self.review_count} reviews.")
            evidence_count += 1
        elif self.rating is not None:
            reasons.append(f"Rated {self.rating:.1f}/5.")
            evidence_count += 1

        if self.deal_price is not None and self.original_price and self.original_price > self.deal_price:
            savings = self.original_price - self.deal_price
            savings_pct = (savings / self.original_price) * 100
            reasons.append(f"Current deal saves ${savings:.2f} ({savings_pct:.0f}% off).")
            evidence_count += 1

        if self.price is not None and self.price > 0 and self.price <= 50:
            reasons.append("Budget-friendly price range.")
            evidence_count += 1
        elif self.price is not None and self.price >= 200:
            reasons.append("Premium-tier product positioning.")
            evidence_count += 1

        if self.stock is not None:
            if self.stock > 20:
                reasons.append("Good stock availability.")
                evidence_count += 1
            elif self.stock > 0:
                reasons.append("Limited stock available.")
                evidence_count += 1

        if self.merchant:
            reasons.append(f"Available via {self.merchant}.")
            evidence_count += 1

        if not reasons:
            reasons = ["Selected for category relevance and catalog quality checks."]

        confidence = 'high' if evidence_count >= 3 else ('medium' if evidence_count >= 2 else 'low')
        return {
            'reasons': reasons[:3],
            'confidence': confidence
        }
    
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
            'original_price': self.original_price,
            'why_this_product': self.build_why_this_product()
        }


class ProductImage(db.Model):
    __tablename__ = 'product_images'

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False, index=True)
    image_url = db.Column(db.String(500), nullable=False)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Review(db.Model):
    __tablename__ = 'reviews'

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False, index=True)
    reviewer_name = db.Column(db.String(255), nullable=False)
    reviewer_email = db.Column(db.String(255), nullable=False, index=True)
    rating = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(255))
    body = db.Column(db.Text, nullable=False)
    photo_url = db.Column(db.String(500))
    helpful_count = db.Column(db.Integer, default=0)
    verified_purchase = db.Column(db.Boolean, default=False)
    moderation_status = db.Column(db.String(20), default='pending', index=True)  # pending, approved, rejected
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.product_id,
            'reviewer_name': self.reviewer_name,
            'rating': self.rating,
            'title': self.title,
            'body': self.body,
            'photo_url': self.photo_url,
            'helpful_count': self.helpful_count,
            'verified_purchase': self.verified_purchase,
            'moderation_status': self.moderation_status,
            'created_at': self.created_at.isoformat()
        }


class ReviewHelpfulVote(db.Model):
    __tablename__ = 'review_helpful_votes'

    id = db.Column(db.Integer, primary_key=True)
    review_id = db.Column(db.Integer, db.ForeignKey('reviews.id'), nullable=False, index=True)
    voter_token = db.Column(db.String(255), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class SupportTicket(db.Model):
    __tablename__ = 'support_tickets'

    id = db.Column(db.Integer, primary_key=True)
    ticket_number = db.Column(
        db.String(20),
        unique=True,
        nullable=False,
        index=True,
        default=lambda: f"TKT-{uuid.uuid4().hex[:10].upper()}"
    )
    customer_name = db.Column(db.String(255), nullable=False)
    customer_email = db.Column(db.String(255), nullable=False, index=True)
    subject = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    channel = db.Column(db.String(30), default='contact_form')  # contact_form/chatbot/faq
    status = db.Column(db.String(30), default='open', index=True)  # open/in_progress/resolved/closed
    assistant_suggestion = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'ticket_number': self.ticket_number,
            'customer_name': self.customer_name,
            'customer_email': self.customer_email,
            'subject': self.subject,
            'message': self.message,
            'channel': self.channel,
            'status': self.status,
            'assistant_suggestion': self.assistant_suggestion,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

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
