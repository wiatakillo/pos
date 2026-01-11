"""
Import beer collection into the provider/catalog system.

This seed file provides a ready-to-use template of popular Spanish and international beers
that restaurants can browse and select from to quickly populate their menu.

Usage:
    python -m app.seeds.beer_import
    python -m app.seeds.beer_import --clear  # Clear existing data first
"""

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

try:
    import requests
    from PIL import Image
    from io import BytesIO
except ImportError:
    print("Error: 'requests' and 'Pillow' libraries are required. Install with: pip install requests Pillow")
    sys.exit(1)

from sqlmodel import Session, select, text
from app.db import engine
from app.models import Provider, ProductCatalog, ProviderProduct


# Uploads directory (relative to back directory)
UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"

PROVIDER_NAME = "Beer Collection"


# Embedded JSON data - popular beers
BEER_DATA = [
    {
        "name": "Mahou Cinco Estrellas",
        "brand": "Mahou",
        "country": "Spain",
        "region": "Madrid",
        "description": "Classic Spanish lager, crisp and refreshing with a balanced flavor profile. One of Spain's most popular beers.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.50",
        "image": "https://images.pexels.com/photos/1267701/pexels-photo-1267701.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Estrella Damm",
        "brand": "Damm",
        "country": "Spain",
        "region": "Barcelona",
        "description": "Iconic Barcelona beer, light and smooth with Mediterranean character. Perfect for warm weather.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.50",
        "image": "https://images.pexels.com/photos/11098951/pexels-photo-11098951.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Cruzcampo",
        "brand": "Cruzcampo",
        "country": "Spain",
        "region": "Andalusia",
        "description": "Traditional Andalusian beer, full-bodied with a distinctive flavor. A favorite in southern Spain.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.30",
        "image": "https://images.pexels.com/photos/4276950/pexels-photo-4276950.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "San Miguel",
        "brand": "San Miguel",
        "country": "Spain",
        "region": "Malaga",
        "description": "Premium Spanish lager with a smooth, clean taste. Brewed since 1890 with traditional methods.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.40",
        "image": "https://images.pexels.com/photos/30271798/pexels-photo-30271798.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Alhambra Reserva 1925",
        "brand": "Alhambra",
        "country": "Spain",
        "region": "Granada",
        "description": "Premium Spanish beer with a rich, malty flavor and smooth finish. Aged for enhanced character.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.80",
        "image": "https://images.pexels.com/photos/31681158/pexels-photo-31681158.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Voll-Damm",
        "brand": "Damm",
        "country": "Spain",
        "region": "Barcelona",
        "description": "Strong double malt lager with a rich, full-bodied taste. Higher alcohol content for a more intense experience.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€3.00",
        "image": "https://upload.wikimedia.org/wikipedia/commons/8/86/Voll-DammBotella33cl.jpg"
    },
    {
        "name": "Heineken",
        "brand": "Heineken",
        "country": "Netherlands",
        "region": "Amsterdam",
        "description": "World-famous Dutch lager with a distinctive green bottle. Crisp, refreshing taste with a slight bitterness.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.80",
        "image": "https://images.pexels.com/photos/1478386/pexels-photo-1478386.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Corona Extra",
        "brand": "Corona",
        "country": "Mexico",
        "region": "Mexico City",
        "description": "Light, crisp Mexican lager with a smooth finish. Best served with a lime wedge.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€3.20",
        "image": "https://images.pexels.com/photos/1478386/pexels-photo-1478386.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Stella Artois",
        "brand": "Stella Artois",
        "country": "Belgium",
        "region": "Leuven",
        "description": "Premium Belgian lager with a crisp, clean taste and golden color. Brewed since 1366.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€3.00",
        "image": "https://images.pexels.com/photos/11098951/pexels-photo-11098951.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Guinness Draught",
        "brand": "Guinness",
        "country": "Ireland",
        "region": "Dublin",
        "description": "Iconic Irish stout with a creamy head and rich, roasted flavor. Smooth and velvety texture.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€3.50",
        "image": "https://images.pexels.com/photos/30271798/pexels-photo-30271798.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Budweiser",
        "brand": "Budweiser",
        "country": "United States",
        "region": "Missouri",
        "description": "American-style lager with a clean, crisp taste. Light and refreshing.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.90",
        "image": "https://images.pexels.com/photos/30271798/pexels-photo-30271798.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Carlsberg",
        "brand": "Carlsberg",
        "country": "Denmark",
        "region": "Copenhagen",
        "description": "Danish pilsner with a balanced, smooth taste. Light and refreshing with a hint of hops.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.70",
        "image": "https://images.pexels.com/photos/31681158/pexels-photo-31681158.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Amstel",
        "brand": "Amstel",
        "country": "Netherlands",
        "region": "Amsterdam",
        "description": "Dutch lager with a light, refreshing taste. Smooth and easy-drinking.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.60",
        "image": "https://images.pexels.com/photos/31581609/pexels-photo-31581609.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Beck's",
        "brand": "Beck's",
        "country": "Germany",
        "region": "Bremen",
        "description": "German pilsner with a crisp, hoppy flavor. Brewed according to the German Purity Law.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.80",
        "image": "https://images.pexels.com/photos/4276950/pexels-photo-4276950.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Peroni Nastro Azzurro",
        "brand": "Peroni",
        "country": "Italy",
        "region": "Rome",
        "description": "Premium Italian lager with a crisp, clean taste and distinctive blue ribbon. Light and refreshing.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€3.10",
        "image": "https://images.pexels.com/photos/30271798/pexels-photo-30271798.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Damm Lemon",
        "brand": "Damm",
        "country": "Spain",
        "region": "Barcelona",
        "description": "Refreshing shandy with natural lemon flavor. Light and citrusy, perfect for summer.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.50",
        "image": "https://images.pexels.com/photos/31581609/pexels-photo-31581609.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Mahou Sin Gluten",
        "brand": "Mahou",
        "country": "Spain",
        "region": "Madrid",
        "description": "Gluten-free lager with the same great taste. Suitable for those with gluten intolerance.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.70",
        "image": "https://images.pexels.com/photos/30271798/pexels-photo-30271798.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Estrella Galicia",
        "brand": "Estrella Galicia",
        "country": "Spain",
        "region": "Galicia",
        "description": "Premium Galician beer with a rich, full flavor. Brewed with high-quality ingredients.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.90",
        "image": "https://images.pexels.com/photos/11098951/pexels-photo-11098951.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Mahou Clásica",
        "brand": "Mahou",
        "country": "Spain",
        "region": "Madrid",
        "description": "Classic Spanish beer with traditional flavor. Smooth and balanced taste.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.40",
        "image": "https://images.pexels.com/photos/31681158/pexels-photo-31681158.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Amstel Radler",
        "brand": "Amstel",
        "country": "Netherlands",
        "region": "Amsterdam",
        "description": "Refreshing shandy mix of beer and lemonade. Light, sweet, and perfect for warm days.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.60",
        "image": "https://images.pexels.com/photos/31581609/pexels-photo-31581609.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Cerveza Artesanal IPA",
        "brand": "Craft Beer",
        "country": "Spain",
        "region": "Various",
        "description": "Craft IPA with bold hop flavors and citrus notes. Aromatic and full-bodied.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€4.50",
        "image": "https://images.pexels.com/photos/7292296/pexels-photo-7292296.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz Original",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "Barcelona's classic pilsner, first brewed in 1856. Light golden color with white, fluffy foam. Brewed with extra-pale barley malt, Saaz hops, and mineral water from Font d'Or. Smooth flavor with sweet malt and cereal notes, and a hint of citrus.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.40",
        "image": "https://images.pexels.com/photos/1267701/pexels-photo-1267701.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz 7",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "A strong lager made with 100% barley malt for full-bodied richness and authentic character. Smooth, malty, and full of depth.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.75",
        "image": "https://images.pexels.com/photos/1267701/pexels-photo-1267701.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz Epidor",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "A powerful strong lager with 7.2% ABV, crafted from triple toasted and caramelized malts. Rich, intense, and full of character with deep malty sweetness.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.75",
        "image": "https://images.pexels.com/photos/31581609/pexels-photo-31581609.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz Red IPA",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "A bold red India Pale Ale with intense hop bitterness balanced by rich malts. Features floral, herbal, and resinous hop aromas with fruity notes of apple, peach, and figs.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.95",
        "image": "https://images.pexels.com/photos/30271798/pexels-photo-30271798.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz Radler",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "A refreshing shandy blending Moritz beer with natural lemon juice. Light, citrusy, and perfect for warm days.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.90",
        "image": "https://images.pexels.com/photos/11098951/pexels-photo-11098951.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz 0,0",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "Alcohol-free lager with a clean, crisp taste. Light-bodied and refreshing, ideal as a non-alcoholic alternative.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.90",
        "image": "https://images.pexels.com/photos/4276950/pexels-photo-4276950.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz 0,0 Torrada",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "Toasted alcohol-free beer with rich notes of caramel, coffee, and liquorice. Dark amber color and full-bodied, offering complex flavors without alcohol.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€2.90",
        "image": "https://images.pexels.com/photos/31681158/pexels-photo-31681158.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz Negra",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "A revival of a historic stout, deep black and opaque with a dense, creamy head. Roasted malt flavors with notes of coffee, cocoa, and a hint of smoke.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€4.90",
        "image": "https://images.pexels.com/photos/7292296/pexels-photo-7292296.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz Cum Laude",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "A gose-style experimental beer created by UPC students. Slightly cloudy, pale yellow, with lactic acidity, Himalayan salt, and coriander. Refreshing with a hint of spice and passion fruit aroma.",
        "volume_ml": 250,
        "unit": "draught",
        "price": "€3.90",
        "image": "https://images.pexels.com/photos/1267701/pexels-photo-1267701.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "The Rose of Moritz",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "Limited edition beer for Sant Jordi, infused with red rose petals from Las Ramblas. Floral aroma, sweet taste, and reddish hue. Brewed with beetroot, carrot, and rose flavoring.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€4.50",
        "image": "https://images.pexels.com/photos/31581609/pexels-photo-31581609.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz 17.14",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "A spiced lager infused with honey, ginger, bergamot, and cardamom. Aromatic and complex, inspired by historic flavors. Available exclusively at El 300 del Born and M-Store.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€4.50",
        "image": "https://images.pexels.com/photos/30271798/pexels-photo-30271798.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz Blat",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "A dark, experimental beer with roasted grain character and a smooth, full body. Brewed in limited batches at Moritz Beer Lab.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€4.50",
        "image": "https://images.pexels.com/photos/11098951/pexels-photo-11098951.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz Cítrics",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "A citrus-forward experimental lager with bright notes of orange, lemon, and grapefruit. Refreshing and aromatic, brewed with natural citrus extracts.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€4.50",
        "image": "https://images.pexels.com/photos/4276950/pexels-photo-4276950.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz Scottish",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "A malty, amber ale with a sweet profile and low bitterness. Inspired by Scottish ales, with caramel and toffee notes.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€4.50",
        "image": "https://images.pexels.com/photos/31681158/pexels-photo-31681158.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Moritz Sour",
        "brand": "Moritz",
        "country": "Spain",
        "region": "Barcelona",
        "description": "A tart, refreshing sour beer with fruity notes and a clean acidic finish. Brewed using natural lactic fermentation.",
        "volume_ml": 330,
        "unit": "bottle",
        "price": "€4.50",
        "image": "https://images.pexels.com/photos/7292296/pexels-photo-7292296.jpeg?auto=compress&cs=tinysrgb&w=800"
    }
]


def normalize_name(name: str) -> str:
    """Normalize product name for matching."""
    # Remove extra spaces, lowercase, remove special chars
    name = re.sub(r'\s+', ' ', name.strip().lower())
    # Remove common prefixes/suffixes
    name = re.sub(r'^(el|la|los|las)\s+', '', name)
    return name


def parse_price(price_str: str) -> int | None:
    """
    Parse price string to cents.
    
    Handles formats like:
    - "€2.50" -> 250 cents
    - "€3.20" -> 320 cents
    """
    if not price_str:
        return None
    
    # Remove currency symbols and whitespace
    price_str = price_str.replace("€", "").replace("$", "").replace("£", "").strip()
    
    # Handle range (e.g., "2.50–3.00" or "2.50-3.00")
    if "–" in price_str or "-" in price_str:
        separator = "–" if "–" in price_str else "-"
        parts = price_str.split(separator)
        if len(parts) == 2:
            try:
                price1 = float(parts[0].strip().replace(",", "."))
                price2 = float(parts[1].strip().replace(",", "."))
                # Use average
                avg_price = (price1 + price2) / 2
                return int(avg_price * 100)
            except (ValueError, AttributeError):
                pass
    
    # Single price
    try:
        price = float(price_str.replace(",", "."))
        return int(price * 100)
    except (ValueError, AttributeError):
        return None


def download_and_store_image(
    image_url: str,
    provider_id: int
) -> str | None:
    """
    Download image from URL and store it locally.
    
    Args:
        image_url: URL of the image to download
        provider_id: ID of the provider
        
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
        # Download image with User-Agent header (required for Wikimedia Commons)
        headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; POS-System/1.0; +https://example.com/bot)'
        }
        response = requests.get(image_url, headers=headers, timeout=30, stream=True)
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
            elif image_url.endswith(".jpg") or image_url.endswith(".jpeg"):
                ext = ".jpg"
            else:
                ext = ".jpg"
        
        # Create provider upload directory using token instead of ID
        provider_dir = UPLOADS_DIR / "providers" / provider_token / "products"
        provider_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename using UUID
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
            url=None,
            api_endpoint=None,
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
    description: str | None = None,
    brand: str | None = None
) -> ProductCatalog:
    """Get or create a catalog item, matching by normalized name."""
    normalized_name = normalize_name(name)
    
    # Try to find existing catalog item
    catalog_item = session.exec(
        select(ProductCatalog).where(ProductCatalog.normalized_name == normalized_name)
    ).first()
    
    if not catalog_item:
        catalog_item = ProductCatalog(
            name=name,
            normalized_name=normalized_name,
            category=category or "Beverages",
            subcategory=subcategory or "Beer",
            description=description,
            brand=brand
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
        if description and not catalog_item.description:
            catalog_item.description = description
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


def import_beers(clear_existing: bool = False) -> dict[str, int]:
    """
    Import beers from embedded JSON data into provider/catalog system.
    
    Args:
        clear_existing: If True, deletes all existing beers from this provider before importing
        
    Returns:
        Dictionary with import statistics
    """
    with Session(engine) as session:
        # Get or create provider
        provider = get_or_create_provider(session, PROVIDER_NAME)
        
        if clear_existing:
            # Delete existing provider products that are not referenced by tenant products
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
        
        print(f"\nProcessing {len(BEER_DATA)} beers...")
        
        # Import beers into database
        catalog_created = 0
        provider_products_created = 0
        provider_products_updated = 0
        
        for beer_data in BEER_DATA:
            if not beer_data.get("name"):
                continue
            
            # Parse price
            price_cents = parse_price(beer_data.get("price", ""))
            
            # Build detailed description
            detailed_description = beer_data.get("description", "")
            
            # Get or create catalog item
            catalog_item = get_or_create_catalog_item(
                session,
                name=beer_data["name"],
                category="Beverages",
                subcategory="Beer",
                description=beer_data.get("description"),
                brand=beer_data.get("brand")
            )
            
            if catalog_item.id is None:
                catalog_created += 1
            
            # Generate external_id from beer name (normalized)
            external_id = normalize_name(beer_data["name"]).replace(" ", "_")
            
            # Check if provider product already exists
            existing = session.exec(
                select(ProviderProduct).where(
                    ProviderProduct.provider_id == provider.id,
                    ProviderProduct.external_id == external_id
                )
            ).first()
            
            # Download and store image if URL is available
            image_filename = None
            if beer_data.get("image"):
                print(f"  Downloading image for {beer_data['name']}...", end=" ")
                image_filename = download_and_store_image(
                    beer_data["image"],
                    provider.id
                )
                if image_filename:
                    print(f"✓ Saved as {image_filename}")
                else:
                    print("✗ Failed")
            
            if existing:
                # Update existing provider product
                updated = False
                if price_cents is not None and existing.price_cents != price_cents:
                    existing.price_cents = price_cents
                    updated = True
                if beer_data.get("image") and existing.image_url != beer_data["image"]:
                    existing.image_url = beer_data["image"]
                    updated = True
                if image_filename and existing.image_filename != image_filename:
                    # Delete old image if it exists
                    if existing.image_filename:
                        old_path = UPLOADS_DIR / "providers" / provider.token / "products" / existing.image_filename
                        if old_path.exists():
                            old_path.unlink()
                    existing.image_filename = image_filename
                    # Clear external URL since we have local file
                    existing.image_url = None
                    updated = True
                if detailed_description and existing.detailed_description != detailed_description:
                    existing.detailed_description = detailed_description
                    updated = True
                if beer_data.get("country") and existing.country != beer_data["country"]:
                    existing.country = beer_data["country"]
                    updated = True
                if beer_data.get("region") and existing.region != beer_data["region"]:
                    existing.region = beer_data["region"]
                    updated = True
                if beer_data.get("volume_ml") and existing.volume_ml != beer_data["volume_ml"]:
                    existing.volume_ml = beer_data["volume_ml"]
                    updated = True
                if beer_data.get("unit") and existing.unit != beer_data["unit"]:
                    existing.unit = beer_data["unit"]
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
                    external_id=external_id,
                    name=beer_data["name"],
                    price_cents=price_cents,
                    image_url=None if image_filename else beer_data.get("image"),  # Don't store external URL if we have local file
                    image_filename=image_filename,
                    country=beer_data.get("country"),
                    region=beer_data.get("region"),
                    volume_ml=beer_data.get("volume_ml"),
                    unit=beer_data.get("unit"),
                    detailed_description=detailed_description,
                    last_synced_at=datetime.now(timezone.utc)
                )
                session.add(provider_product)
                provider_products_created += 1
        
        session.commit()
        
        stats = {
            "catalog_created": catalog_created,
            "provider_products_created": provider_products_created,
            "provider_products_updated": provider_products_updated,
            "total_beers": len(BEER_DATA)
        }
        
        print(f"\nImport complete!")
        print(f"  Catalog items created: {stats['catalog_created']}")
        print(f"  Provider products created: {stats['provider_products_created']}")
        print(f"  Provider products updated: {stats['provider_products_updated']}")
        print(f"  Total beers processed: {stats['total_beers']}")
        
        return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import beer collection into provider/catalog system")
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear existing beers from this provider before importing"
    )
    args = parser.parse_args()
    
    try:
        import_beers(clear_existing=args.clear)
    except KeyboardInterrupt:
        print("\nImport interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nError during import: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
