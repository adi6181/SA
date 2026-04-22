from flask_mail import Message
from app import mail, db
from app.models import Order
import os
from datetime import datetime
import random
import string

STATUS_LABELS = {
    'open':        'Open',
    'in_progress': 'In Progress',
    'resolved':    'Resolved',
    'closed':      'Closed',
}

STATUS_COLORS = {
    'open':        '#dc2626',
    'in_progress': '#d97706',
    'resolved':    '#16a34a',
    'closed':      '#64748b',
}

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

def send_ticket_status_update_email(ticket, new_status, admin_note=None):
    """Notify customer when their support ticket status changes."""
    try:
        label = STATUS_LABELS.get(new_status, new_status.replace('_', ' ').title())
        color = STATUS_COLORS.get(new_status, '#6b7280')
        site_name = 'DealDrop'
        support_email = os.getenv('MAIL_USERNAME', 'support@dealdrop.com')

        note_block = ''
        if admin_note and admin_note.strip():
            note_block = f"""
            <div style="margin:24px 0;padding:16px 20px;background:#f5f3ff;border-left:4px solid #7c3aed;border-radius:6px;">
                <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#4c1d95;text-transform:uppercase;letter-spacing:.04em;">Message from our team</p>
                <p style="margin:0;font-size:15px;color:#1e1b4b;white-space:pre-wrap;">{ticket.customer_name.split()[0]}, {admin_note.strip()}</p>
            </div>"""

        html = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.07);">

                <!-- Header -->
                <tr>
                  <td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:28px 36px;">
                    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-.3px;">{site_name}</h1>
                    <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px;">Support Team</p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:32px 36px 8px;">
                    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Hi {ticket.customer_name.split()[0]},</p>
                    <h2 style="margin:8px 0 20px;font-size:20px;font-weight:700;color:#111827;">Your ticket has been updated</h2>

                    <!-- Ticket card -->
                    <div style="background:#f8f7ff;border:1.5px solid #e5e7eb;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
                      <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.06em;">{ticket.ticket_number}</p>
                      <p style="margin:0 0 14px;font-size:15px;font-weight:600;color:#111827;">{ticket.subject}</p>
                      <div style="display:inline-block;padding:5px 14px;border-radius:20px;background:{color}15;border:1.5px solid {color}40;">
                        <span style="font-size:13px;font-weight:700;color:{color};">{label}</span>
                      </div>
                    </div>

                    {note_block}

                    <p style="font-size:14px;color:#4b5563;line-height:1.7;">
                      If you have additional questions or need further assistance, simply reply to this email or visit our support page.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:20px 36px 32px;border-top:1.5px solid #f3f4f6;">
                    <p style="margin:0;font-size:12px;color:#9ca3af;">
                      This email was sent by {site_name} · <a href="mailto:{support_email}" style="color:#7c3aed;text-decoration:none;">{support_email}</a>
                    </p>
                  </td>
                </tr>

              </table>
            </td></tr>
          </table>
        </body>
        </html>"""

        msg = Message(
            subject=f'[{site_name}] Ticket {ticket.ticket_number} — Status Updated to {label}',
            recipients=[ticket.customer_email],
            html=html,
        )
        mail.send(msg)
        return True
    except Exception as e:
        print(f'[ticket email] Error sending status update: {e}')
        return False


def generate_order_number():
    """Generate unique order number"""
    timestamp = datetime.utcnow().strftime('%Y%m%d')
    random_suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"ORD-{timestamp}-{random_suffix}"
