"""
Sample Products Script
Run this to populate the database with sample products
"""

from app import create_app, db
from app.models import Product

app = create_app()

with app.app_context():
    # Clear existing products
    Product.query.delete()

    # Sample products with varied merchants: Amazon, Walmart, Target, Best Buy
    products = [
        Product(
            name="Wireless Headphones",
            description="Premium noise-cancelling wireless headphones with 30-hour battery life. Perfect for music lovers and professionals.",
            price=199.99,
            image_url="/static/images/wireless_headphones.svg",
            stock=50,
            category="Electronics",
            affiliate_url="https://www.bestbuy.com/site/searchpage.jsp?st=Wireless+Headphones",
            merchant="Best Buy",
            rating=4.6,
            review_count=1842,
            is_deal=True,
            deal_price=179.99,
            original_price=249.99
        ),
        Product(
            name="Premium Smartwatch",
            description="Advanced fitness tracking smartwatch with heart rate monitor, GPS, and 7-day battery life.",
            price=299.99,
            image_url="/static/images/smartwatch.svg",
            stock=35,
            category="Electronics",
            affiliate_url="https://www.amazon.com/s?k=Premium+Smartwatch",
            merchant="Amazon",
            rating=4.4,
            review_count=935
        ),
        Product(
            name="Wireless Speaker",
            description="Portable Bluetooth speaker with 360-degree sound and waterproof design. Great for outdoor adventures.",
            price=79.99,
            image_url="/static/images/wireless_speaker.svg",
            stock=100,
            category="Electronics",
            affiliate_url="https://www.walmart.com/search?q=Wireless+Bluetooth+Speaker",
            merchant="Walmart",
            rating=4.5,
            review_count=1260,
            is_deal=True,
            deal_price=59.99,
            original_price=79.99
        ),
        Product(
            name="USB-C Cable (2-Pack)",
            description="High-quality durable USB-C charging and data transfer cables. Compatible with most devices.",
            price=19.99,
            image_url="/static/images/usb_c_cable.svg",
            stock=200,
            category="Electronics",
            affiliate_url="https://www.amazon.com/s?k=USB-C+Cable+2+Pack",
            merchant="Amazon",
            rating=4.3,
            review_count=860,
            is_deal=True,
            deal_price=14.99,
            original_price=19.99
        ),
        Product(
            name="Classic T-Shirt",
            description="Comfortable cotton t-shirt available in multiple colors. Perfect for casual wear.",
            price=24.99,
            image_url="/static/images/tshirt.svg",
            stock=150,
            category="Fashion",
            affiliate_url="https://www.target.com/s?searchTerm=Classic+Cotton+T-Shirt",
            merchant="Target",
            rating=4.2,
            review_count=412
        ),
        Product(
            name="Denim Jeans",
            description="Stylish and comfortable denim jeans with modern fit. Suitable for any occasion.",
            price=59.99,
            image_url="/static/images/denim_jeans.svg",
            stock=80,
            category="Fashion",
            affiliate_url="https://www.walmart.com/search?q=Denim+Jeans+Men+Women",
            merchant="Walmart",
            rating=4.1,
            review_count=268
        ),
        Product(
            name="Running Shoes",
            description="Lightweight and comfortable running shoes designed for performance and durability.",
            price=89.99,
            image_url="/static/images/running_shoes.svg",
            stock=60,
            category="Fashion",
            affiliate_url="https://www.amazon.com/s?k=Running+Shoes",
            merchant="Amazon",
            rating=4.5,
            review_count=1421,
            is_deal=True,
            deal_price=74.99,
            original_price=89.99
        ),
        Product(
            name="Winter Jacket",
            description="Warm and stylish winter jacket with water-resistant material. Perfect for cold weather.",
            price=129.99,
            image_url="/static/images/winter_jacket.svg",
            stock=40,
            category="Fashion",
            affiliate_url="https://www.target.com/s?searchTerm=Winter+Jacket",
            merchant="Target",
            rating=4.4,
            review_count=522
        ),
        Product(
            name="Garden Tool Set",
            description="Complete 12-piece garden tool set for all your gardening needs. Durable and ergonomic.",
            price=49.99,
            image_url="/static/images/garden_tool_set.svg",
            stock=45,
            category="Home",
            affiliate_url="https://www.walmart.com/search?q=Garden+Tool+Set+12+Piece",
            merchant="Walmart",
            rating=4.3,
            review_count=338
        ),
        Product(
            name="LED Desk Lamp",
            description="Adjustable LED desk lamp with touch control and multiple brightness levels. Energy-efficient.",
            price=34.99,
            image_url="/static/images/led_desk_lamp.svg",
            stock=70,
            category="Home",
            affiliate_url="https://www.bestbuy.com/site/searchpage.jsp?st=LED+Desk+Lamp",
            merchant="Best Buy",
            rating=4.4,
            review_count=904,
            is_deal=True,
            deal_price=27.99,
            original_price=34.99
        ),
        Product(
            name="Python Programming Guide",
            description="Comprehensive guide to Python programming for beginners and intermediate users.",
            price=29.99,
            image_url="/static/images/python_programming_guide.svg",
            stock=55,
            category="Books",
            affiliate_url="https://www.amazon.com/s?k=Python+Programming+Guide+Book",
            merchant="Amazon",
            rating=4.7,
            review_count=511
        ),
        Product(
            name="Web Development Handbook",
            description="Complete handbook covering HTML, CSS, JavaScript, and modern web frameworks.",
            price=39.99,
            image_url="/static/images/web_development_handbook.svg",
            stock=40,
            category="Books",
            affiliate_url="https://www.amazon.com/s?k=Web+Development+Handbook",
            merchant="Amazon",
            rating=4.6,
            review_count=633
        ),
    ]

    for product in products:
        db.session.add(product)

    db.session.commit()
    print(f"✓ Successfully added {len(products)} sample products!")
    print("  Merchants: Amazon (4), Walmart (3), Target (2), Best Buy (2), Amazon Books (2)")
