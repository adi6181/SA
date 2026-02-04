from flask_mail import Message
from app import mail, db
from app.models import Order
import os
from datetime import datetime
import random
import string

def send_order_alert_to_admin(order):
    """Send email alert to admin about new order"""
    try:
        msg = Message(
            subject=f'New Order Received - {order.order_number}',
            recipients=[os.getenv('ADMIN_EMAIL')],
            html=f"""
            <h2>New Order Received</h2>
            <p><strong>Order Number:</strong> {order.order_number}</p>
            <p><strong>Customer Name:</strong> {order.customer_name}</p>
            <p><strong>Customer Email:</strong> {order.customer_email}</p>
            <p><strong>Customer Phone:</strong> {order.customer_phone}</p>
            <p><strong>Total Amount:</strong> ${order.total_amount:.2f}</p>
            <h3>Items:</h3>
            <ul>
                {''.join([f'<li>{item.product_name} x {item.quantity} - ${item.price * item.quantity:.2f}</li>' for item in order.items])}
            </ul>
            <p><strong>Status:</strong> {order.status}</p>
            <p>Please contact the customer to proceed with payment.</p>
            """
        )
        mail.send(msg)
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

def send_order_confirmation_to_customer(order):
    """Send order confirmation email to customer"""
    try:
        msg = Message(
            subject=f'Order Confirmation - {order.order_number}',
            recipients=[order.customer_email],
            html=f"""
            <h2>Thank You for Your Order!</h2>
            <p>Hi {order.customer_name},</p>
            <p>We have received your order and will contact you shortly for payment.</p>
            <p><strong>Order Number:</strong> {order.order_number}</p>
            <p><strong>Total Amount:</strong> ${order.total_amount:.2f}</p>
            <h3>Order Items:</h3>
            <ul>
                {''.join([f'<li>{item.product_name} x {item.quantity} - ${item.price * item.quantity:.2f}</li>' for item in order.items])}
            </ul>
            <p>We will reach out to you at {order.customer_phone} for payment details.</p>
            <p>Thank you for shopping with us!</p>
            """
        )
        mail.send(msg)
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

def generate_order_number():
    """Generate unique order number"""
    timestamp = datetime.utcnow().strftime('%Y%m%d')
    random_suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"ORD-{timestamp}-{random_suffix}"
