"""
Import Spanish pizza collection into the provider/catalog system.

This seed file provides a ready-to-use template of award-winning Spanish pizzas
that restaurants can browse and select from to quickly populate their menu.

Usage:
    python -m app.seeds.pizza_import
    python -m app.seeds.pizza_import --clear  # Clear existing data first
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

PROVIDER_NAME = "Spanish Pizza Collection"


# Embedded JSON data - award-winning Spanish pizzas
PIZZA_DATA = [
    {
        "name": "Búfala Fest",
        "restaurant": "Baldoria",
        "city": "Madrid",
        "description": "Modern take on the classic Margherita, made with buffalo mozzarella, San Marzano tomatoes, fresh basil, and olive oil.",
        "ingredients": [
            "Buffalo mozzarella",
            "San Marzano tomatoes",
            "Fresh basil",
            "Olive oil"
        ],
        "price": "€16–€18",
        "image": "https://fotografias-2.larazon.es/clipping/cmsimages01/2024/12/04/DAB58020-5216-4B42-AA9D-5ECD3DE736E7/ganadora_58.jpg?crop=1728,980,x0,y85&width=1000&height=567&optimize=high&format=webply"
    },
    {
        "name": "Due.Zero",
        "restaurant": "Le Otto",
        "city": "Castellón",
        "description": "Award-winning gourmet pizza featuring a rich blend of pumpkin, smoked scamorza, and speck with a nutty, savory profile.",
        "ingredients": [
            "Pumpkin",
            "Onion",
            "Pepper",
            "Fior di latte",
            "Smoked scamorza",
            "San Marzano tomato",
            "Garlic",
            "Toasted almonds",
            "Sun-dried tomato",
            "Parmesan",
            "Speck",
            "Crystallized basil"
        ],
        "price": "€17",
        "image": "https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "UnDueTre…",
        "restaurant": "Pizzería Siciliana Kuró",
        "city": "Palencia",
        "description": "A Sicilian-inspired pizza that takes you on a flavor journey with mortadella, seasoned sausages, and fried eggplant.",
        "ingredients": [
            "Mortadella",
            "Seasoned sausages",
            "Fried eggplant",
            "Grana Padano",
            "Red pesto sauce"
        ],
        "price": "€15",
        "image": "https://images.pexels.com/photos/2619967/pexels-photo-2619967.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Caminito",
        "restaurant": "La Bicicleta Pizzería",
        "city": "Dos Hermanas",
        "description": "Argentinian-inspired pizza with chorizo and chimichurri, blending Mediterranean and South American flavors.",
        "ingredients": [
            "Mozzarella",
            "Chorizo",
            "Chimichurri",
            "Roasted red peppers"
        ],
        "price": "€14",
        "image": "https://images.pexels.com/photos/1146760/pexels-photo-1146760.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Pizza Margherita",
        "restaurant": "Sartoria Panatieri",
        "city": "Barcelona",
        "description": "Neapolitan-style Margherita ranked among the best in Europe, made with premium ingredients and slow-fermented dough.",
        "ingredients": [
            "San Marzano tomato",
            "Buffalo mozzarella",
            "Fresh basil",
            "Olive oil"
        ],
        "price": "€15–€18",
        "image": "https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "La Bestiale",
        "restaurant": "Trafalgar Pizza Club",
        "city": "Barcelona",
        "description": "Spicy salami and nduja pizza with a honey drizzle, known for bold, balanced flavors.",
        "ingredients": [
            "Spicy salami",
            "Nduja",
            "Mozzarella",
            "Tomato",
            "Honey drizzle"
        ],
        "price": "€16",
        "image": "https://images.pexels.com/photos/2619967/pexels-photo-2619967.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Giana",
        "restaurant": "La Balmesina",
        "city": "Barcelona",
        "description": "Vegetarian favorite with ricotta, cherry tomatoes, fried eggplant, and basil oil on 72-hour fermented dough.",
        "ingredients": [
            "Mozzarella",
            "Ricotta",
            "Cherry tomatoes",
            "Fried eggplant",
            "Parmesan",
            "Fresh basil",
            "Basil oil"
        ],
        "price": "€14.50",
        "image": "https://images.pexels.com/photos/1146760/pexels-photo-1146760.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Sei.Bella",
        "restaurant": "Le Otto",
        "city": "Castellón",
        "description": "Creamy pizza with mortadella, pistachos, and stracciatella, offering a rich and nutty flavor profile.",
        "ingredients": [
            "Tomato",
            "Mozzarella",
            "Mortadella",
            "Pistachos",
            "Stracciatella"
        ],
        "price": "€16",
        "image": "https://images.pexels.com/photos/2619967/pexels-photo-2619967.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Flor de Guanciale",
        "restaurant": "Yamona",
        "city": "Pamplona",
        "description": "Savory pizza with guanciale, chili, and honey, balancing spicy, sweet, and umami notes.",
        "ingredients": [
            "Guanciale",
            "Mozzarella",
            "Tomato",
            "Chili",
            "Honey"
        ],
        "price": "€15",
        "image": "https://images.pexels.com/photos/1146760/pexels-photo-1146760.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Marinara 2.0",
        "restaurant": "Crettino",
        "city": "Asturias",
        "description": "Modern twist on the classic Neapolitan marinara with capers and olives.",
        "ingredients": [
            "Tomato",
            "Garlic",
            "Oregano",
            "Olive oil",
            "Capers",
            "Olives"
        ],
        "price": "€13",
        "image": "https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Mortazza",
        "restaurant": "Sapore di Napoli",
        "city": "Mallorca",
        "description": "Rich and creamy pizza with mortadella and pistachos, popular in the Balearic Islands.",
        "ingredients": [
            "Mortadella",
            "Pistachos",
            "Mozzarella",
            "Tomato",
            "Basil"
        ],
        "price": "€14",
        "image": "https://images.pexels.com/photos/2619967/pexels-photo-2619967.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Pistachosa",
        "restaurant": "Pizzería La Ritornata",
        "city": "Murcia",
        "description": "Nutty and spicy pizza with pistachos, garlic, and chili, featuring a bold flavor profile.",
        "ingredients": [
            "Mozzarella",
            "Tomato",
            "Pistachos",
            "Garlic",
            "Chili",
            "Olive oil"
        ],
        "price": "€15",
        "image": "https://images.pexels.com/photos/1146760/pexels-photo-1146760.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Annarella",
        "restaurant": "Harinella",
        "city": "Valencia",
        "description": "Simple yet flavorful pizza with anchovies, garlic, and oregano on high-quality Neapolitan dough.",
        "ingredients": [
            "Tomato",
            "Mozzarella",
            "Anchovies",
            "Garlic",
            "Oregano"
        ],
        "price": "€13",
        "image": "https://images.pexels.com/photos/2619967/pexels-photo-2619967.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Benvenuti al Sud!",
        "restaurant": "Dottor Pizza",
        "city": "Bilbao",
        "description": "Spicy Calabrian sausage pizza with honey and sesame seeds, offering a sweet and spicy contrast.",
        "ingredients": [
            "Nduja",
            "Mozzarella",
            "Tomato",
            "Honey",
            "Sesame seeds"
        ],
        "price": "€16",
        "image": "https://images.pexels.com/photos/1146760/pexels-photo-1146760.jpeg?auto=compress&cs=tinysrgb&w=800"
    },
    {
        "name": "Il 4 Napoletano",
        "restaurant": "Pizzería Oro di Napoli",
        "city": "Canary Islands",
        "description": "Classic Neapolitan-style pizza with ham, mushrooms, and artichokes, highly rated in the Canaries.",
        "ingredients": [
            "Tomato",
            "Mozzarella",
            "Ham",
            "Mushrooms",
            "Artichokes"
        ],
        "price": "€14",
        "image": "https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?auto=compress&cs=tinysrgb&w=800"
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
    - "€16–€18" -> average: 1700 cents (€17.00)
    - "€17" -> 1700 cents
    - "€14.50" -> 1450 cents
    """
    if not price_str:
        return None
    
    # Remove currency symbols and whitespace
    price_str = price_str.replace("€", "").replace("$", "").replace("£", "").strip()
    
    # Handle range (e.g., "16–18" or "16-18")
    if "–" in price_str or "-" in price_str:
        # Use dash or en-dash
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
    description: str | None = None
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
            category=category or "Main Course",
            subcategory=subcategory or "Pizza",
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
        if description and not catalog_item.description:
            catalog_item.description = description
            updated = True
        if updated:
            catalog_item.updated_at = datetime.now(timezone.utc)
            session.add(catalog_item)
            session.commit()
            session.refresh(catalog_item)
    
    return catalog_item


def import_pizzas(clear_existing: bool = False) -> dict[str, int]:
    """
    Import pizzas from embedded JSON data into provider/catalog system.
    
    Args:
        clear_existing: If True, deletes all existing pizzas from this provider before importing
        
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
        
        print(f"\nProcessing {len(PIZZA_DATA)} pizzas...")
        
        # Import pizzas into database
        catalog_created = 0
        provider_products_created = 0
        provider_products_updated = 0
        
        for pizza_data in PIZZA_DATA:
            if not pizza_data.get("name"):
                continue
            
            # Parse price
            price_cents = parse_price(pizza_data.get("price", ""))
            
            # Convert ingredients array to comma-separated string
            ingredients_str = None
            if pizza_data.get("ingredients"):
                ingredients_str = ", ".join(pizza_data["ingredients"])
            
            # Build detailed description with restaurant and city info
            detailed_description = pizza_data.get("description", "")
            if pizza_data.get("restaurant") or pizza_data.get("city"):
                location_info = []
                if pizza_data.get("restaurant"):
                    location_info.append(f"Restaurant: {pizza_data['restaurant']}")
                if pizza_data.get("city"):
                    location_info.append(f"City: {pizza_data['city']}")
                if location_info:
                    detailed_description = f"{detailed_description}\n\n{', '.join(location_info)}"
            
            # Get or create catalog item
            catalog_item = get_or_create_catalog_item(
                session,
                name=pizza_data["name"],
                category="Main Course",
                subcategory="Pizza",
                description=pizza_data.get("description")
            )
            
            if catalog_item.id is None:
                catalog_created += 1
            
            # Generate external_id from pizza name (normalized)
            external_id = normalize_name(pizza_data["name"]).replace(" ", "_")
            
            # Check if provider product already exists
            existing = session.exec(
                select(ProviderProduct).where(
                    ProviderProduct.provider_id == provider.id,
                    ProviderProduct.external_id == external_id
                )
            ).first()
            
            # Download and store image if URL is available
            image_filename = None
            if pizza_data.get("image"):
                print(f"  Downloading image for {pizza_data['name']}...", end=" ")
                image_filename = download_and_store_image(
                    pizza_data["image"],
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
                if pizza_data.get("image") and existing.image_url != pizza_data["image"]:
                    existing.image_url = pizza_data["image"]
                    updated = True
                if image_filename and existing.image_filename != image_filename:
                    # Delete old image if it exists
                    if existing.image_filename:
                        old_path = UPLOADS_DIR / "providers" / provider.token / "products" / existing.image_filename
                        if old_path.exists():
                            old_path.unlink()
                    existing.image_filename = image_filename
                    updated = True
                if detailed_description and existing.detailed_description != detailed_description:
                    existing.detailed_description = detailed_description
                    updated = True
                if pizza_data.get("city") and existing.region != pizza_data["city"]:
                    existing.region = pizza_data["city"]
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
                    name=pizza_data["name"],
                    price_cents=price_cents,
                    image_url=pizza_data.get("image"),
                    image_filename=image_filename,
                    region=pizza_data.get("city"),
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
            "total_pizzas": len(PIZZA_DATA)
        }
        
        print(f"\nImport complete!")
        print(f"  Catalog items created: {stats['catalog_created']}")
        print(f"  Provider products created: {stats['provider_products_created']}")
        print(f"  Provider products updated: {stats['provider_products_updated']}")
        print(f"  Total pizzas processed: {stats['total_pizzas']}")
        
        return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import Spanish pizza collection into provider/catalog system")
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear existing pizzas from this provider before importing"
    )
    args = parser.parse_args()
    
    try:
        import_pizzas(clear_existing=args.clear)
    except KeyboardInterrupt:
        print("\nImport interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nError during import: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
