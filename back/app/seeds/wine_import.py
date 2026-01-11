"""
Import wines from Tusumiller API into the provider/catalog system.

Usage:
    python -m app.seeds.wine_import
    python -m app.seeds.wine_import --clear  # Clear existing data first
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin

try:
    import requests
except ImportError:
    print("Error: 'requests' library is required. Install it with: pip install requests")
    sys.exit(1)

from sqlmodel import Session, select
from app.db import engine
from app.models import Provider, ProductCatalog, ProviderProduct


# API configuration from the curl commands
API_BASE_URL = "https://tusumiller.isumi.es"
API_ENDPOINT = f"{API_BASE_URL}/jsonsearch"

# Headers and cookies from the curl command
HEADERS = {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-language": "en-US,en;q=0.7",
    "cache-control": "no-cache",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "origin": "https://tusumiller.isumi.es",
    "pragma": "no-cache",
    "referer": "https://tusumiller.isumi.es/rest-gustazo/list",
    "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
}

COOKIES = {
    "ci_session": "5fj99r3a5rjj5uh1notlruu5qmqgksfp",
    "ws_user_id": "6963bd390f543",
    "ws_lang_1122": "es",
    "visitorisumiId": "visumi-kiyxfwwampob2k1g2ljkee",
}

# Form data from the curl command
FORM_DATA_BASE = {
    "txt": "",
    "page": "1",
    "categories": "",
    "simbolo": "",
    "tipes": "",
    "country": "",
    "zonado": "",
    "region": "",
    "variedad": "",
    "prices": "",
    "lista": "",
    "copa": "",
    "lang_code": "es",
    "lang_id": "1",
    "menu": "1521",
    "showsimbolo": "1",
    "restautant_id": "1122",
    "sortresult": "",
}

PROVIDER_NAME = "Tusumiller"


def normalize_name(name: str) -> str:
    """Normalize product name for matching."""
    # Remove extra spaces, lowercase, remove special chars
    name = re.sub(r'\s+', ' ', name.strip().lower())
    # Remove common prefixes/suffixes
    name = re.sub(r'^(el|la|los|las)\s+', '', name)
    return name


def fetch_wines_from_api(page: int = 1) -> dict[str, Any]:
    """Fetch wines from the external API."""
    form_data = FORM_DATA_BASE.copy()
    form_data["page"] = str(page)
    
    try:
        response = requests.post(
            API_ENDPOINT,
            headers=HEADERS,
            cookies=COOKIES,
            data=form_data,
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"Error fetching wines from API: {e}")
        raise


def parse_wine_data(api_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Parse API response and extract wine data."""
    wines = []
    
    # The API response structure needs to be explored
    # Based on typical wine API structures, it might have:
    # - products/list array
    # - items array
    # - data array
    
    # Try different possible structures
    products = []
    
    if "products" in api_data:
        products = api_data["products"]
    elif "list" in api_data:
        products = api_data["list"]
    elif "items" in api_data:
        products = api_data["items"]
    elif "data" in api_data:
        products = api_data["data"]
    elif isinstance(api_data, list):
        products = api_data
    else:
        # Try to find any array that might contain products
        for key, value in api_data.items():
            if isinstance(value, list) and len(value) > 0:
                if isinstance(value[0], dict):
                    products = value
                    break
    
    # If still no products, print the structure for debugging
    if not products:
        print("Warning: Could not find products in API response.")
        print("API response keys:", list(api_data.keys())[:10])
        print("Sample response structure (first 500 chars):")
        print(json.dumps(api_data, indent=2)[:500])
        return []
    
    for product in products:
        if not isinstance(product, dict):
            continue
        
        # Extract wine data - adapt field names based on actual API response
        wine_id = str(product.get("id") or product.get("product_id") or product.get("wine_id") or "")
        wine_name = product.get("name") or product.get("nombre") or product.get("title") or product.get("wine_name") or ""
        
        if not wine_name or not wine_id:
            continue
        
        # Extract price - might be in different formats
        price = product.get("price") or product.get("precio") or product.get("price_cents")
        if price:
            # Convert to cents if it's a decimal
            if isinstance(price, float):
                price_cents = int(price * 100)
            elif isinstance(price, str):
                try:
                    price_cents = int(float(price.replace(",", ".")) * 100)
                except (ValueError, AttributeError):
                    price_cents = None
            else:
                price_cents = int(price)
        else:
            price_cents = None
        
        # Extract category
        category = product.get("category") or product.get("categoria") or product.get("type") or "Wine"
        subcategory = product.get("subcategory") or product.get("subcategoria") or product.get("category_name") or None
        
        # Extract image
        image_url = product.get("image") or product.get("imagen") or product.get("image_url") or product.get("photo")
        if image_url and not image_url.startswith("http"):
            image_url = urljoin(API_BASE_URL, image_url)
        
        wine_data = {
            "external_id": wine_id,
            "name": wine_name,
            "price_cents": price_cents,
            "image_url": image_url,
            "category": category,
            "subcategory": subcategory,
            "country": product.get("country") or product.get("pais") or product.get("country_name"),
            "region": product.get("region") or product.get("region_name") or product.get("zonado"),
            "grape_variety": product.get("variety") or product.get("variedad") or product.get("grape_variety") or product.get("uva"),
            "description": product.get("description") or product.get("descripcion") or product.get("notes"),
            "brand": product.get("brand") or product.get("marca") or product.get("winery"),
            "barcode": product.get("barcode") or product.get("ean") or product.get("sku"),
        }
        
        wines.append(wine_data)
    
    return wines


def get_or_create_provider(session: Session, provider_name: str) -> Provider:
    """Get or create the provider."""
    provider = session.exec(
        select(Provider).where(Provider.name == provider_name)
    ).first()
    
    if not provider:
        provider = Provider(
            name=provider_name,
            url="tusumiller.isumi.es",
            api_endpoint=API_ENDPOINT,
            is_active=True
        )
        session.add(provider)
        session.commit()
        session.refresh(provider)
        print(f"Created provider: {provider_name}")
    
    return provider


def get_or_create_catalog_item(
    session: Session,
    name: str,
    category: str | None = None,
    subcategory: str | None = None,
    barcode: str | None = None,
    brand: str | None = None,
    description: str | None = None
) -> ProductCatalog:
    """Get or create a catalog item, matching by normalized name."""
    normalized_name = normalize_name(name)
    
    # Try to find existing catalog item
    catalog_item = session.exec(
        select(ProductCatalog).where(ProductCatalog.normalized_name == normalized_name)
    ).first()
    
    if not catalog_item:
        # Try matching by barcode if available
        if barcode:
            catalog_item = session.exec(
                select(ProductCatalog).where(ProductCatalog.barcode == barcode)
            ).first()
    
    if not catalog_item:
        catalog_item = ProductCatalog(
            name=name,
            normalized_name=normalized_name,
            category=category or "Wine",
            subcategory=subcategory,
            barcode=barcode,
            brand=brand,
            description=description
        )
        session.add(catalog_item)
        session.commit()
        session.refresh(catalog_item)
        print(f"Created catalog item: {name}")
    else:
        # Update if needed
        updated = False
        if category and not catalog_item.category:
            catalog_item.category = category
            updated = True
        if subcategory and not catalog_item.subcategory:
            catalog_item.subcategory = subcategory
            updated = True
        if barcode and not catalog_item.barcode:
            catalog_item.barcode = barcode
            updated = True
        if brand and not catalog_item.brand:
            catalog_item.brand = brand
            updated = True
        if updated:
            catalog_item.updated_at = datetime.now(timezone.utc)
            session.add(catalog_item)
            session.commit()
            session.refresh(catalog_item)
    
    return catalog_item


def import_wines(clear_existing: bool = False) -> dict[str, int]:
    """
    Import wines from external API into provider/catalog system.
    
    Args:
        clear_existing: If True, deletes all existing wines from this provider before importing
        
    Returns:
        Dictionary with import statistics
    """
    with Session(engine) as session:
        # Get or create provider
        provider = get_or_create_provider(session, PROVIDER_NAME)
        
        if clear_existing:
            # Delete existing provider products
            existing = session.exec(
                select(ProviderProduct).where(ProviderProduct.provider_id == provider.id)
            ).all()
            for pp in existing:
                session.delete(pp)
            session.commit()
            print(f"Deleted {len(existing)} existing provider products")
        
        # Fetch wines from API
        print(f"Fetching wines from {PROVIDER_NAME}...")
        all_wines = []
        page = 1
        max_pages = 50  # Safety limit
        
        while page <= max_pages:
            try:
                api_data = fetch_wines_from_api(page)
                wines = parse_wine_data(api_data)
                
                if not wines:
                    print(f"No wines found on page {page}, stopping.")
                    break
                
                all_wines.extend(wines)
                print(f"Fetched {len(wines)} wines from page {page} (total: {len(all_wines)})")
                
                # Check if there are more pages
                # Look for pagination info in response
                total_pages = api_data.get("total_pages") or api_data.get("pages") or api_data.get("last_page")
                if total_pages and page >= total_pages:
                    break
                
                # If we got fewer wines than expected, might be last page
                if len(wines) < 20:  # Assuming ~20 wines per page
                    break
                
                page += 1
                
            except Exception as e:
                print(f"Error on page {page}: {e}")
                if page == 1:
                    # If first page fails, stop
                    raise
                break
        
        if not all_wines:
            print("No wines found in API response.")
            print("This might mean:")
            print("1. The API structure is different than expected")
            print("2. The API requires different authentication")
            print("3. The API endpoint or parameters have changed")
            return {"catalog_created": 0, "provider_products_created": 0, "provider_products_updated": 0}
        
        print(f"\nProcessing {len(all_wines)} wines...")
        
        # Import wines into database
        catalog_created = 0
        provider_products_created = 0
        provider_products_updated = 0
        
        for wine_data in all_wines:
            if not wine_data.get("name") or not wine_data.get("external_id"):
                continue
            
            # Get or create catalog item
            catalog_item = get_or_create_catalog_item(
                session,
                name=wine_data["name"],
                category=wine_data.get("category"),
                subcategory=wine_data.get("subcategory"),
                barcode=wine_data.get("barcode"),
                brand=wine_data.get("brand"),
                description=wine_data.get("description")
            )
            
            if catalog_item.id is None:
                catalog_created += 1
            
            # Check if provider product already exists
            existing = session.exec(
                select(ProviderProduct).where(
                    ProviderProduct.provider_id == provider.id,
                    ProviderProduct.external_id == wine_data["external_id"]
                )
            ).first()
            
            if existing:
                # Update existing provider product
                updated = False
                if wine_data.get("price_cents") is not None and existing.price_cents != wine_data["price_cents"]:
                    existing.price_cents = wine_data["price_cents"]
                    updated = True
                if wine_data.get("image_url") and existing.image_url != wine_data["image_url"]:
                    existing.image_url = wine_data["image_url"]
                    updated = True
                if wine_data.get("country") and existing.country != wine_data["country"]:
                    existing.country = wine_data["country"]
                    updated = True
                if wine_data.get("region") and existing.region != wine_data["region"]:
                    existing.region = wine_data["region"]
                    updated = True
                if wine_data.get("grape_variety") and existing.grape_variety != wine_data["grape_variety"]:
                    existing.grape_variety = wine_data["grape_variety"]
                    updated = True
                
                # Update catalog link if needed
                if existing.catalog_id != catalog_item.id:
                    existing.catalog_id = catalog_item.id
                    updated = True
                
                if updated:
                    existing.updated_at = datetime.now(timezone.utc)
                    existing.last_synced_at = datetime.now(timezone.utc)
                    session.add(existing)
                    provider_products_updated += 1
            else:
                # Create new provider product
                provider_product = ProviderProduct(
                    catalog_id=catalog_item.id,
                    provider_id=provider.id,
                    external_id=wine_data["external_id"],
                    name=wine_data["name"],
                    price_cents=wine_data.get("price_cents"),
                    image_url=wine_data.get("image_url"),
                    country=wine_data.get("country"),
                    region=wine_data.get("region"),
                    grape_variety=wine_data.get("grape_variety"),
                    last_synced_at=datetime.now(timezone.utc)
                )
                session.add(provider_product)
                provider_products_created += 1
        
        session.commit()
        
        stats = {
            "catalog_created": catalog_created,
            "provider_products_created": provider_products_created,
            "provider_products_updated": provider_products_updated,
            "total_wines": len(all_wines)
        }
        
        print(f"\nImport complete!")
        print(f"  Catalog items created: {stats['catalog_created']}")
        print(f"  Provider products created: {stats['provider_products_created']}")
        print(f"  Provider products updated: {stats['provider_products_updated']}")
        print(f"  Total wines processed: {stats['total_wines']}")
        
        return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import wines from Tusumiller API")
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear existing wines from this provider before importing"
    )
    args = parser.parse_args()
    
    try:
        import_wines(clear_existing=args.clear)
    except KeyboardInterrupt:
        print("\nImport interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nError during import: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
