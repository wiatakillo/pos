#!/usr/bin/env python3
"""
Test script to verify login with credentials from config.env.

This script:
1. Reads POS_TEST_OWNER and POS_TEST_PASSWORD from environment
2. Attempts to login to the API
3. Verifies the login is successful
"""

import os
import sys
import requests
from typing import Optional

# Configuration - reads from environment variables
API_BASE_URL = os.getenv("API_URL", "http://localhost:8020")
TEST_EMAIL = os.getenv("POS_TEST_OWNER", "ralf@roeber.de")
TEST_PASSWORD = os.getenv("POS_TEST_PASSWORD", "foo1234")


def test_login(email: str, password: str) -> Optional[str]:
    """Test login and return access token if successful"""
    print(f"\n[1] Testing login...")
    print(f"   Email: {email}")
    print(f"   API URL: {API_BASE_URL}")
    
    url = f"{API_BASE_URL}/token"
    data = {
        "username": email,
        "password": password
    }
    
    try:
        response = requests.post(url, data=data, timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            token = result.get("access_token")
            token_type = result.get("token_type", "bearer")
            print(f"✅ Login successful!")
            print(f"   Token type: {token_type}")
            print(f"   Token (first 20 chars): {token[:20]}..." if token else "   Token: None")
            return token
        else:
            print(f"❌ Login failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return None
    except requests.exceptions.ConnectionError:
        print(f"❌ Connection error: Could not reach {API_BASE_URL}")
        print(f"   Make sure the backend is running")
        return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None


def test_authenticated_request(token: str) -> bool:
    """Test making an authenticated request"""
    print(f"\n[2] Testing authenticated request...")
    
    url = f"{API_BASE_URL}/orders"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            orders = response.json()
            print(f"✅ Authenticated request successful!")
            print(f"   Found {len(orders)} orders")
            return True
        else:
            print(f"❌ Authenticated request failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def main():
    print("=" * 70)
    print("LOGIN VERIFICATION TEST")
    print("=" * 70)
    print(f"\nConfiguration:")
    print(f"   API URL: {API_BASE_URL}")
    print(f"   Test Email: {TEST_EMAIL}")
    print(f"   Test Password: {'*' * len(TEST_PASSWORD)}")
    print(f"\nNote: Credentials are read from environment variables:")
    print(f"   - POS_TEST_OWNER (or default: ralf@roeber.de)")
    print(f"   - POS_TEST_PASSWORD (or default: foo1234)")
    
    # Test login
    token = test_login(TEST_EMAIL, TEST_PASSWORD)
    
    if not token:
        print("\n" + "=" * 70)
        print("❌ TEST FAILED: Login unsuccessful")
        print("=" * 70)
        print("\nTroubleshooting:")
        print("  1. Check that the backend is running")
        print(f"  2. Verify API URL is correct: {API_BASE_URL}")
        print(f"  3. Verify credentials are correct")
        print(f"  4. Check backend logs for errors")
        sys.exit(1)
    
    # Test authenticated request
    if not test_authenticated_request(token):
        print("\n" + "=" * 70)
        print("⚠️  WARNING: Login successful but authenticated request failed")
        print("=" * 70)
        sys.exit(1)
    
    print("\n" + "=" * 70)
    print("✅ TEST PASSED: Login verification successful")
    print("=" * 70)
    print(f"\nSummary:")
    print(f"  - Successfully logged in as {TEST_EMAIL}")
    print(f"  - Successfully made authenticated API request")
    print(f"  - Credentials from environment are working correctly")


if __name__ == "__main__":
    main()
