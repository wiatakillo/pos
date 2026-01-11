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
from pathlib import Path
from typing import Any
from urllib.parse import urljoin
from uuid import uuid4

try:
    import requests
    from PIL import Image
    from io import BytesIO
except ImportError:
    print("Error: 'requests' and 'Pillow' libraries are required. Install with: pip install requests Pillow")
    sys.exit(1)

from sqlmodel import Session, select
from app.db import engine
from app.models import Provider, ProductCatalog, ProviderProduct


# API configuration from the curl commands
API_BASE_URL = "https://tusumiller.isumi.es"
API_ENDPOINT = f"{API_BASE_URL}/jsonsearch"
IMAGE_BASE_URL = "https://cartas.wineissocial.com/uploads/products/medium"

# Uploads directory (relative to back directory)
UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"

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


def get_category_name(category_id: str, filter_data: dict[str, Any] | None = None) -> str:
    """Map category ID to wine type name (used as subcategory under Beverages)."""
    # Category ID to wine type mapping
    category_map = {
        "18010": "Red Wine",  # Tintos
        "18011": "White Wine",  # Blancos
        "18013": "Sparkling Wine",  # Espumosos
        "18014": "Rosé Wine",  # Rosados
        "18015": "Sweet Wine",  # Dulces
        "18016": "Fortified Wine",  # Generosos
    }
    
    # Remove quotes if present
    cat_id = category_id.strip("'\"")
    return category_map.get(cat_id, "Wine")


def parse_wine_data(api_data: dict[str, Any], fetch_details: bool = False) -> list[dict[str, Any]]:
    """
    Parse API response and extract wine data.
    
    Args:
        api_data: API response data
        fetch_details: If True, fetch detailed descriptions from detail pages (slower)
    """
    wines = []
    
    # The API returns data in the "data" key
    products = api_data.get("data", [])
    
    if not products:
        print("Warning: No products found in API response.")
        return []
    
    # Get filter data for category mapping
    filter_data = api_data.get("filter", {})
    
    for product in products:
        if not isinstance(product, dict):
            continue
        
        # Extract wine ID
        wine_id = str(product.get("id") or product.get("idProduct") or "")
        if not wine_id:
            continue
        
        # Use fullname if available, otherwise nombre
        wine_name = product.get("fullname") or product.get("nombre") or ""
        if not wine_name:
            continue
        
        # Extract price - prioritize bottle price (price) over glass price (pricecopa)
        # price = bottle price (what restaurants need)
        # pricecopa = price per glass
        # coste = cost
        price = product.get("price") or product.get("pricecopa") or product.get("coste") or 0
        if price:
            if isinstance(price, (int, float)):
                price_cents = int(price * 100)
            elif isinstance(price, str):
                try:
                    price_cents = int(float(price.replace(",", ".")) * 100)
                except (ValueError, AttributeError):
                    price_cents = None
            else:
                price_cents = None
        else:
            price_cents = None
        
        # Extract category from categories array or tags
        categories = product.get("categories", [])
        category = "Beverages"  # Main category for all wines
        subcategory = None
        
        if categories and isinstance(categories, list) and len(categories) > 0:
            # Use first category ID to get wine type as subcategory
            cat_id = str(categories[0]).strip("'\"")
            wine_type = get_category_name(cat_id, filter_data)
            # Use wine type as subcategory (e.g., "Red Wine", "White Wine")
            subcategory = wine_type
        
        # Check if wine is available by glass (copa)
        is_by_glass = product.get("copa") == 1 or product.get("copa") == "1" or bool(product.get("pricecopa"))
        
        # Try to get additional subcategory info from tags (e.g., "d.o. cava", "d.o. rioja")
        tags = product.get("tag", [])
        if tags and isinstance(tags, list):
            # Look for D.O. (Denominación de Origen) in tags
            for tag in tags:
                if isinstance(tag, str) and tag.lower().startswith("d.o."):
                    # Append D.O. to subcategory if not already there
                    if subcategory and tag.title() not in subcategory:
                        subcategory = f"{subcategory} - {tag.title()}"
                    elif not subcategory:
                        subcategory = tag.title()
                    break
        
        # Add "Wine by Glass" subcategory if available by glass
        if is_by_glass:
            if subcategory:
                # Append to existing subcategory
                if "Wine by Glass" not in subcategory:
                    subcategory = f"{subcategory} - Wine by Glass"
            else:
                subcategory = "Wine by Glass"
        
        # Extract image - img field contains product number + extension (e.g., "25504.png")
        img_field = product.get("img") or ""
        image_url = None
        product_image_number = None
        
        if img_field:
            # Extract product number from filename (e.g., "25504.png" -> "25504")
            # Remove extension and any prefix like "img_"
            img_clean = img_field.replace("img_", "").strip()
            # Extract number before extension
            match = re.search(r'(\d+)', img_clean)
            if match:
                product_image_number = match.group(1)
                # Construct full URL using the wine image service
                image_url = f"{IMAGE_BASE_URL}/{product_image_number}.png"
        
        # Extract country, region, grape variety from tags or specific fields
        country = None
        region = None
        grape_variety = None
        
        # Country and region are arrays of IDs, but we can extract from tags
        if tags:
            # Look for country in tags
            country_tags = [t for t in tags if isinstance(t, str) and t.lower() in ["españa", "spain", "francia", "france", "italia", "italy"]]
            if country_tags:
                country = country_tags[0].title()
        
        # Region from tags (e.g., "cataluña", "rioja")
        if tags:
            region_tags = [t for t in tags if isinstance(t, str) and any(r in t.lower() for r in ["cataluña", "rioja", "ribera", "priorat", "penedès"])]
            if region_tags:
                region = region_tags[0].title()
        
        # Grape variety from tags or variedad field
        variedad = product.get("variedad", [])
        if variedad and isinstance(variedad, list):
            # Variedad is array of IDs, but we can get from tags
            grape_tags = [t for t in tags if isinstance(t, str) and any(g in t.lower() for g in ["macabeo", "parellada", "xarel", "tempranillo", "garnacha", "cabernet", "syrah", "garnatxa"])]
            if grape_tags:
                grape_variety = ", ".join(grape_tags[:3])  # Join up to 3 varieties
        
        # Extract description (this is the short description from search API)
        description = product.get("description") or ""
        detailed_description = None
        
        # Initialize aromas and elaboration (will be set from detail page if available)
        aromas = None
        elaboration = None
        
        # Get item_id for detail page access
        item_id = str(product.get("idProductMenu") or product.get("id") or "")
        
        # Fetch detailed description from detail page if requested
        if fetch_details and item_id:
            detail_data = fetch_wine_detail_page(str(product.get("idProduct") or ""), item_id)
            if detail_data:
                if detail_data.get("detailed_description"):
                    detailed_description = detail_data["detailed_description"]
                if detail_data.get("aromas"):
                    aromas = detail_data.get("aromas")
                if detail_data.get("elaboration"):
                    elaboration = detail_data.get("elaboration")
        
        # Extract vintage (anada)
        vintage = None
        anada = product.get("anada")
        if anada:
            try:
                vintage = int(anada)
            except (ValueError, TypeError):
                pass
        
        # Extract wine style from tags (e.g., "afrutados", "crianza", "reserva")
        wine_style = None
        if tags:
            style_tags = [t for t in tags if isinstance(t, str) and t.lower() in ["afrutados", "crianza", "reserva", "gran reserva", "joven", "rosado", "dulce"]]
            if style_tags:
                wine_style = style_tags[0].title()
        
        # Extract winery/bodega from tags or name
        winery = None
        brand = None
        if tags:
            # Winery names often appear in tags (exclude common words)
            winery_tags = [t for t in tags if isinstance(t, str) and len(t) > 3 and 
                         not any(x in t.lower() for x in ["d.o.", "españa", "cataluña", "rioja", "montsant", "catalunya", "tintos", "blancos"])]
            if winery_tags:
                # First tag that's not a location/category is likely the winery
                winery = winery_tags[0].title()
                brand = winery
        
        # Extract aromas from tags (fruits, flavors) - only if not already set from detail page
        if not aromas and tags:
            aroma_tags = [t for t in tags if isinstance(t, str) and any(a in t.lower() for a in 
                         ["ciruela", "frambuesa", "fresa", "cereza", "manzana", "limón", "miel", "vainilla", "roble"])]
            if aroma_tags:
                aromas = ", ".join(aroma_tags[:5])  # Join up to 5 aromas
        
        # Store item_id for later detail page access
        item_id = str(product.get("idProductMenu") or product.get("id") or "")
        
        # Store category ID from API (most reliable source for wine type)
        wine_category_id = None
        if categories and isinstance(categories, list) and len(categories) > 0:
            wine_category_id = str(categories[0]).strip("'\"")
        
        wine_data = {
            "external_id": wine_id,
            "item_id": item_id,  # Store for detail page access
            "name": wine_name,
            "price_cents": price_cents,
            "image_url": image_url,
            "image_product_number": product_image_number,  # Store for downloading
            "category": category,
            "subcategory": subcategory,
            "wine_category_id": wine_category_id,  # Store API category ID
            "country": country,
            "region": region,
            "grape_variety": grape_variety,
            "description": description,
            "detailed_description": detailed_description,
            "wine_style": wine_style,
            "vintage": vintage,
            "winery": winery,
            "aromas": aromas,
            "elaboration": elaboration,
            "brand": brand,
            "barcode": product.get("reference") or None,
        }
        
        wines.append(wine_data)
    
    return wines


def fetch_wine_detail_page(product_id: str, item_id: str | None = None) -> dict[str, Any] | None:
    """
    Fetch detailed information from wine detail page.
    
    Args:
        product_id: Product ID from API (idProduct)
        item_id: Item ID from API (idProductMenu) - used for URL
        
    Returns:
        Dictionary with detailed information or None if failed
    """
    try:
        # Construct detail page URL
        if item_id:
            detail_url = f"{API_BASE_URL}/rest-gustazo/item/{item_id}"
        else:
            # Fallback: try to construct from product_id
            detail_url = f"{API_BASE_URL}/rest-gustazo/item/{product_id}"
        
        headers = {
            "user-agent": "Mozilla/5.0",
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        
        response = requests.get(detail_url, headers=headers, cookies=COOKIES, timeout=15)
        response.raise_for_status()
        
        html = response.text
        
        # Extract detailed description
        detailed_description = None
        # Look for description in <div class="descripcion"> or similar
        import re
        desc_patterns = [
            r'<div[^>]*class="[^"]*descripcion[^"]*"[^>]*>.*?<p[^>]*>(.*?)</p>',
            r'Descripción</div>.*?<div[^>]*class="[^"]*descripcion[^"]*"[^>]*>.*?<p[^>]*>(.*?)</p>',
            r'<p[^>]*>([^<]*Un vino[^<]*(?:<[^>]*>[^<]*</[^>]*>[^<]*)*)</p>',
        ]
        
        for pattern in desc_patterns:
            match = re.search(pattern, html, re.IGNORECASE | re.DOTALL)
            if match:
                desc_text = match.group(1)
                # Clean HTML tags but preserve structure
                desc_clean = re.sub(r'<br[^>]*>', '\n', desc_text)
                desc_clean = re.sub(r'</p>\s*<p[^>]*>', '\n\n', desc_clean)
                desc_clean = re.sub(r'<[^>]+>', '', desc_clean)
                desc_clean = re.sub(r'\s+', ' ', desc_clean).strip()
                # Only use if it's longer than 100 chars (to avoid short snippets)
                if len(desc_clean) > 100:
                    detailed_description = desc_clean
                    break
        
        # Extract aromas - look for "text-aroma" divs which contain the aroma names
        aromas = None
        # Pattern: look for section after "Prueba a encontrar estos aromas"
        aromas_section = re.search(r'Prueba a encontrar estos aromas(.*?)(?:Elaboración|</section>)', html, re.IGNORECASE | re.DOTALL)
        
        if aromas_section:
            aromas_html = aromas_section.group(1)
            # Extract from nested divs: <div class="text-aroma">...<div style="width: 80px;">Ciruela</div>...
            # Try pattern matching the nested structure
            aroma_items = re.findall(r'<div[^>]*class="[^"]*text-aroma[^"]*"[^>]*>.*?<div[^>]*style="[^"]*width:\s*80px[^"]*"[^>]*>([A-Za-záéíóúñÁÉÍÓÚÑ\s]+)</div>', aromas_html, re.IGNORECASE | re.DOTALL)
            if not aroma_items:
                # Fallback: any text in divs after text-aroma class
                aroma_items = re.findall(r'text-aroma[^>]*>.*?<div[^>]*>([A-Za-záéíóúñÁÉÍÓÚÑ\s]+)</div>', aromas_html, re.IGNORECASE | re.DOTALL)
            if not aroma_items:
                # Last resort: find all divs with Spanish words (likely aromas)
                all_divs = re.findall(r'<div[^>]*>([A-Za-záéíóúñÁÉÍÓÚÑ\s]{3,20})</div>', aromas_html)
                exclude_words = ['prueba', 'encontrar', 'estos', 'aromas', 'text-aroma', 'pt-2', 'text-center', 'mb-2', 'col-auto', 'border', 'd-flex', 'justify', 'align', 'items', 'center']
                aroma_items = [d.strip() for d in all_divs 
                              if d.strip() and d.strip().lower() not in [w.lower() for w in exclude_words]
                              and not any(char.isdigit() for char in d)]
            # Clean and filter
            exclude_words = ['prueba', 'encontrar', 'estos', 'aromas']
            aroma_items = [a.strip() for a in aroma_items 
                          if a.strip() and len(a.strip()) > 2 
                          and a.strip().lower() not in exclude_words
                          and a.strip().isalpha() or ' ' in a.strip()]  # Allow spaces for multi-word aromas
            if aroma_items:
                aromas = ", ".join(aroma_items[:10])  # Join up to 10 aromas
        
        # Extract elaboration
        elaboration = None
        elaboracion_section = re.search(r'Elaboración[^<]*</[^>]*>.*?<div[^>]*>(.*?)</div>', html, re.IGNORECASE | re.DOTALL)
        if elaboracion_section:
            elabor_text = elaboracion_section.group(1)
            elaboration = re.sub(r'<[^>]+>', '', elabor_text).strip()
        
        result = {}
        if detailed_description:
            result["detailed_description"] = detailed_description
        if aromas:
            result["aromas"] = aromas
        if elaboration:
            result["elaboration"] = elaboration
        
        return result if result else None
        
    except Exception as e:
        print(f"  Warning: Could not fetch detail page for {product_id}: {e}")
        return None


def download_and_store_image(
    image_url: str,
    provider_id: int,
    product_number: str | None = None
) -> str | None:
    """
    Download image from URL and store it locally.
    
    Args:
        image_url: URL of the image to download
        provider_id: ID of the provider
        product_number: Product number for filename (optional, uses UUID if not provided)
        
    Returns:
        Local filename if successful, None otherwise
    """
    if not image_url:
        return None
    
    # Get provider to access token first
    with Session(engine) as session:
        provider = session.exec(select(Provider).where(Provider.id == provider_id)).first()
        if not provider:
            print(f"  Error: Provider {provider_id} not found")
            return None
        if not provider.token:
            print(f"  Error: Provider {provider_id} has no token")
            return None
        provider_token = provider.token
    
    try:
        # Download image
        response = requests.get(image_url, timeout=30, stream=True)
        response.raise_for_status()
        
        # Check content type
        content_type = response.headers.get("content-type", "")
        if not content_type.startswith("image/"):
            print(f"  Warning: {image_url} is not an image (content-type: {content_type})")
            return None
        
        # Read image data
        image_data = response.content
        
        # Optimize image if possible
        try:
            image = Image.open(BytesIO(image_data))
            # Convert to RGB if needed
            if image.mode in ("RGBA", "LA", "P"):
                background = Image.new("RGB", image.size, (255, 255, 255))
                if image.mode == "P":
                    image = image.convert("RGBA")
                background.paste(image, mask=image.split()[-1] if image.mode == "RGBA" else None)
                image = background
            elif image.mode not in ("RGB", "L"):
                image = image.convert("RGB")
            
            # Resize if too large (max 1920x1920)
            max_size = 1920
            if image.width > max_size or image.height > max_size:
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            
            # Save as optimized JPEG
            output = BytesIO()
            image.save(output, format="JPEG", quality=85, optimize=True)
            image_data = output.getvalue()
            ext = ".jpg"
        except Exception as e:
            # If optimization fails, use original
            print(f"  Warning: Could not optimize image: {e}")
            # Determine extension from URL or content type
            if image_url.endswith(".png"):
                ext = ".png"
            elif image_url.endswith(".webp"):
                ext = ".webp"
            else:
                ext = ".jpg"
        
        # Create provider upload directory using token instead of ID
        provider_dir = UPLOADS_DIR / "providers" / provider_token / "products"
        provider_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename
        if product_number:
            # Use product number as base, but ensure uniqueness
            filename = f"{product_number}{ext}"
            # Check if file exists, if so add UUID
            if (provider_dir / filename).exists():
                filename = f"{product_number}_{uuid4().hex[:8]}{ext}"
        else:
            filename = f"{uuid4()}{ext}"
        
        # Save file
        file_path = provider_dir / filename
        file_path.write_bytes(image_data)
        
        return filename
        
    except Exception as e:
        print(f"  Error downloading image from {image_url}: {e}")
        return None


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
            category=category or "Beverages",
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
        # Update subcategory if new one is provided (even if existing one exists, to add Wine by Glass)
        if subcategory:
            # If new subcategory includes "Wine by Glass" and existing doesn't, update it
            if "Wine by Glass" in subcategory and (not catalog_item.subcategory or "Wine by Glass" not in catalog_item.subcategory):
                catalog_item.subcategory = subcategory
                updated = True
            # If no existing subcategory, set it
            elif not catalog_item.subcategory:
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
            # Delete existing provider products that are not referenced by tenant products
            from sqlmodel import text
            existing = session.exec(
                select(ProviderProduct).where(ProviderProduct.provider_id == provider.id)
            ).all()
            
            deleted_count = 0
            for pp in existing:
                # Check if this provider product is referenced by any tenant product
                referenced = session.exec(
                    text("SELECT COUNT(*) FROM tenantproduct WHERE provider_product_id = :pp_id"),
                    {"pp_id": pp.id}
                ).first()
                
                if referenced and referenced[0] > 0:
                    # Don't delete if referenced, just mark for update
                    continue
                
                # Delete old image file if it exists
                if pp.image_filename:
                    old_path = UPLOADS_DIR / "providers" / provider.token / "products" / pp.image_filename
                    if old_path.exists():
                        old_path.unlink()
                
                session.delete(pp)
                deleted_count += 1
            
            session.commit()
            print(f"Deleted {deleted_count} existing provider products (kept {len(existing) - deleted_count} that are in use)")
        
        # Fetch wines from API
        print(f"Fetching wines from {PROVIDER_NAME}...")
        all_wines = []
        seen_wine_ids = set()  # Track wines we've already seen
        
        # First, get all available categories
        api_data = fetch_wines_from_api(1)
        filter_data = api_data.get("filter", {})
        categories = filter_data.get("categories", {})
        
        if categories:
            print(f"Found {len(categories)} categories. Fetching wines from each category...")
            
            # Fetch wines from each category
            for cat_id_str, count in categories.items():
                cat_id = cat_id_str.strip("'\"")
                print(f"\nFetching category {cat_id} ({count} wines)...")
                
                # Update form data to filter by category
                form_data = FORM_DATA_BASE.copy()
                form_data["categories"] = cat_id
                form_data["page"] = "1"
                
                page = 1
                max_pages_per_category = 50
                
                while page <= max_pages_per_category:
                    try:
                        form_data["page"] = str(page)
                        response = requests.post(
                            API_ENDPOINT,
                            headers=HEADERS,
                            cookies=COOKIES,
                            data=form_data,
                            timeout=30
                        )
                        response.raise_for_status()
                        category_api_data = response.json()
                        
                        wines = parse_wine_data(category_api_data)
                        
                        if not wines:
                            break
                        
                        # Add wines, avoiding duplicates
                        for wine in wines:
                            wine_id = wine.get("external_id")
                            if wine_id and wine_id not in seen_wine_ids:
                                all_wines.append(wine)
                                seen_wine_ids.add(wine_id)
                        
                        total_in_category = category_api_data.get("total", 0)
                        print(f"  Page {page}: {len(wines)} wines (total in category: {total_in_category}, unique so far: {len(seen_wine_ids)})")
                        
                        # Check if we've got all wines from this category
                        if len(seen_wine_ids) >= total_in_category or len(wines) == 0:
                            break
                        
                        page += 1
                        
                    except Exception as e:
                        print(f"  Error on page {page} of category {cat_id}: {e}")
                        break
        else:
            # Fallback: fetch without category filter
            print("No categories found, fetching all wines...")
            page = 1
            max_pages = 100
            
            while page <= max_pages:
                try:
                    api_data = fetch_wines_from_api(page)
                    wines = parse_wine_data(api_data, fetch_details=True)
                    
                    if not wines:
                        break
                    
                    for wine in wines:
                        wine_id = wine.get("external_id")
                        if wine_id and wine_id not in seen_wine_ids:
                            all_wines.append(wine)
                            seen_wine_ids.add(wine_id)
                    
                    total_wines = api_data.get("total", 0)
                    print(f"Page {page}: {len(wines)} wines (total: {len(seen_wine_ids)}/{total_wines})")
                    
                    if len(seen_wine_ids) >= total_wines or len(wines) == 0:
                        break
                    
                    page += 1
                    
                except Exception as e:
                    print(f"Error on page {page}: {e}")
                    if page == 1:
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
            
            # Download and store image if URL is available
            image_filename = None
            if wine_data.get("image_url"):
                product_number = wine_data.get("image_product_number")
                print(f"  Downloading image for {wine_data['name']}...", end=" ")
                image_filename = download_and_store_image(
                    wine_data["image_url"],
                    provider.id,
                    product_number
                )
                if image_filename:
                    print(f"✓ Saved as {image_filename}")
                else:
                    print("✗ Failed")
            
            if existing:
                # Update existing provider product
                updated = False
                if wine_data.get("price_cents") is not None and existing.price_cents != wine_data["price_cents"]:
                    existing.price_cents = wine_data["price_cents"]
                    updated = True
                if wine_data.get("image_url") and existing.image_url != wine_data["image_url"]:
                    existing.image_url = wine_data["image_url"]
                    updated = True
                if image_filename and existing.image_filename != image_filename:
                    # Delete old image if it exists
                    if existing.image_filename:
                        old_path = UPLOADS_DIR / "providers" / provider.token / "products" / existing.image_filename
                        if old_path.exists():
                            old_path.unlink()
                    existing.image_filename = image_filename
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
                if wine_data.get("detailed_description") and existing.detailed_description != wine_data["detailed_description"]:
                    existing.detailed_description = wine_data["detailed_description"]
                    updated = True
                if wine_data.get("wine_style") and existing.wine_style != wine_data["wine_style"]:
                    existing.wine_style = wine_data["wine_style"]
                    updated = True
                if wine_data.get("vintage") and existing.vintage != wine_data["vintage"]:
                    existing.vintage = wine_data["vintage"]
                    updated = True
                if wine_data.get("winery") and existing.winery != wine_data["winery"]:
                    existing.winery = wine_data["winery"]
                    updated = True
                if wine_data.get("aromas") and existing.aromas != wine_data["aromas"]:
                    existing.aromas = wine_data["aromas"]
                    updated = True
                if wine_data.get("elaboration") and existing.elaboration != wine_data["elaboration"]:
                    existing.elaboration = wine_data["elaboration"]
                    updated = True
                if wine_data.get("wine_category_id") and existing.wine_category_id != wine_data["wine_category_id"]:
                    existing.wine_category_id = wine_data["wine_category_id"]
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
                    image_filename=image_filename,
                    country=wine_data.get("country"),
                    region=wine_data.get("region"),
                    grape_variety=wine_data.get("grape_variety"),
                    wine_category_id=wine_data.get("wine_category_id"),  # Store API category ID
                    detailed_description=wine_data.get("detailed_description"),
                    wine_style=wine_data.get("wine_style"),
                    vintage=wine_data.get("vintage"),
                    winery=wine_data.get("winery"),
                    aromas=wine_data.get("aromas"),
                    elaboration=wine_data.get("elaboration"),
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
