"""
Update existing wines with detailed descriptions from detail pages.

This script fetches detailed information from wine detail pages for all
existing provider products that don't have detailed descriptions yet.

Usage:
    python -m app.seeds.update_wine_details
"""

import sys
import time
from sqlmodel import Session, select
from app.db import engine
from app.models import Provider, ProviderProduct

try:
    from app.seeds.wine_import import fetch_wine_detail_page
except ImportError:
    print("Error: Could not import fetch_wine_detail_page")
    sys.exit(1)


def update_wine_details() -> dict[str, int]:
    """
    Update existing wines with detailed information from detail pages.
    
    Returns:
        dict with counts of updated wines
    """
    with Session(engine) as session:
        provider = session.exec(select(Provider).where(Provider.name == "Tusumiller")).first()
        if not provider:
            print("Error: Tusumiller provider not found")
            return {"updated": 0, "skipped": 0, "errors": 0}
        
        products = session.exec(
            select(ProviderProduct).where(ProviderProduct.provider_id == provider.id)
        ).all()
        
        updated = 0
        skipped = 0
        errors = 0
        
        print(f"Processing {len(products)} wines...")
        
        for idx, pp in enumerate(products, 1):
            # Skip if already has detailed description and aromas
            if pp.detailed_description and len(pp.detailed_description) > 200 and pp.aromas:
                skipped += 1
                continue
            
            # Try to construct item_id from external_id
            # The external_id format is like "1039382" which maps to item page
            # We need to find the idProductMenu from the API or try different IDs
            print(f"[{idx}/{len(products)}] Processing {pp.name}...", end=" ")
            
            # Try to fetch detail page
            # We need to get the item_id (idProductMenu) from the API
            # For now, try constructing it or fetching from API
            try:
                # Fetch from API to get idProductMenu mapping
                import requests
                from app.seeds.wine_import import API_ENDPOINT, HEADERS, COOKIES
                
                form_data = {
                    "txt": "", "page": "1", "categories": "", "simbolo": "", "tipes": "",
                    "country": "", "zonado": "", "region": "", "variedad": "", "prices": "",
                    "lista": "", "copa": "", "lang_code": "es", "lang_id": "1",
                    "menu": "1521", "showsimbolo": "1", "restautant_id": "1122", "sortresult": "",
                }
                
                # Search for this wine by name to get current API data
                form_data["txt"] = pp.name.split()[0] if pp.name else ""  # Use first word of name
                response = requests.post(API_ENDPOINT, headers=HEADERS, cookies=COOKIES, data=form_data, timeout=15)
                api_data = response.json()
                
                item_id = None
                product_id = None
                for wine in api_data.get("data", []):
                    wine_api_id = str(wine.get("id") or "")
                    if wine_api_id == pp.external_id:
                        item_id = str(wine.get("idProductMenu") or wine.get("id") or "")
                        product_id = str(wine.get("idProduct") or wine.get("id") or "")
                        break
                
                if item_id:
                    detail_data = fetch_wine_detail_page(product_id or pp.external_id, item_id)
                else:
                    # Fallback: try with external_id
                    detail_data = fetch_wine_detail_page(pp.external_id, pp.external_id)
                if detail_data:
                    has_update = False
                    if detail_data.get("detailed_description") and (
                        not pp.detailed_description or 
                        len(detail_data["detailed_description"]) > len(pp.detailed_description or "")
                    ):
                        pp.detailed_description = detail_data["detailed_description"]
                        has_update = True
                    if detail_data.get("aromas") and not pp.aromas:
                        pp.aromas = detail_data["aromas"]
                        has_update = True
                    if detail_data.get("elaboration") and not pp.elaboration:
                        pp.elaboration = detail_data["elaboration"]
                        has_update = True
                    
                    if has_update:
                        session.add(pp)
                        updated += 1
                        print(f"✓ Updated")
                    else:
                        skipped += 1
                        print("⊘ No new data")
                else:
                    skipped += 1
                    print("⊘ No detail page data")
            except Exception as e:
                errors += 1
                print(f"✗ Error: {e}")
            
            # Be nice to the server - small delay
            if idx % 10 == 0:
                time.sleep(1)
                session.commit()  # Commit every 10 items
        
        session.commit()
        
        return {
            "updated": updated,
            "skipped": skipped,
            "errors": errors,
        }


if __name__ == "__main__":
    print("Updating wine details from detail pages...")
    print("This may take a while as we fetch each wine's detail page...")
    result = update_wine_details()
    print(f"\nComplete!")
    print(f"  Updated: {result['updated']}")
    print(f"  Skipped: {result['skipped']}")
    print(f"  Errors: {result['errors']}")
