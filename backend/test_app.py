#!/usr/bin/env python
"""
Testing Guide for ShopHub E-Commerce Platform
Run tests to ensure everything works correctly
"""

import unittest
from app import create_app, db
from app.models import Product, Cart, CartItem, Order, OrderItem

class TestProduct(unittest.TestCase):
    """Test Product functionality"""
    
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        self.client = self.app.test_client()
        
        with self.app.app_context():
            db.create_all()
            # Add test product
            product = Product(
                name="Test Product",
                description="This is a test product",
                price=29.99,
                stock=10,
                category="Test"
            )
            db.session.add(product)
            db.session.commit()
    
    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
    
    def test_get_products(self):
        """Test getting all products"""
        response = self.client.get('/api/products/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json, list)
    
    def test_get_single_product(self):
        """Test getting a single product"""
        response = self.client.get('/api/products/1')
        self.assertEqual(response.status_code, 200)
        data = response.json
        self.assertEqual(data['name'], 'Test Product')
    
    def test_create_product(self):
        """Test creating a new product"""
        response = self.client.post('/api/products/', json={
            'name': 'New Product',
            'description': 'A new product',
            'price': 49.99,
            'stock': 20,
            'category': 'New'
        })
        self.assertEqual(response.status_code, 201)

class TestCart(unittest.TestCase):
    """Test Cart functionality"""
    
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        self.client = self.app.test_client()
        
        with self.app.app_context():
            db.create_all()
            # Add test product
            product = Product(
                name="Test Product",
                description="This is a test product",
                price=29.99,
                stock=10,
                category="Test"
            )
            db.session.add(product)
            db.session.commit()
    
    def test_get_cart(self):
        """Test getting cart"""
        session_id = "test_session_123"
        response = self.client.get(f'/api/cart/{session_id}')
        self.assertEqual(response.status_code, 200)
    
    def test_add_to_cart(self):
        """Test adding item to cart"""
        session_id = "test_session_123"
        response = self.client.post(f'/api/cart/{session_id}/add', json={
            'product_id': 1,
            'quantity': 2
        })
        self.assertEqual(response.status_code, 200)
        data = response.json
        self.assertEqual(len(data['items']), 1)
        self.assertEqual(data['items'][0]['quantity'], 2)

class TestOrder(unittest.TestCase):
    """Test Order functionality"""
    
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        self.client = self.app.test_client()
        
        with self.app.app_context():
            db.create_all()
            # Add test product
            product = Product(
                name="Test Product",
                description="This is a test product",
                price=29.99,
                stock=10,
                category="Test"
            )
            db.session.add(product)
            db.session.commit()
    
    def test_create_order(self):
        """Test creating an order"""
        session_id = "test_session_123"
        
        # Add item to cart first
        self.client.post(f'/api/cart/{session_id}/add', json={
            'product_id': 1,
            'quantity': 1
        })
        
        # Create order
        response = self.client.post('/api/orders/', json={
            'session_id': session_id,
            'customer_name': 'John Doe',
            'customer_email': 'john@example.com',
            'customer_phone': '+1234567890'
        })
        
        self.assertEqual(response.status_code, 201)
        data = response.json
        self.assertEqual(data['customer_name'], 'John Doe')
        self.assertIn('ORD-', data['order_number'])

if __name__ == '__main__':
    unittest.main()
