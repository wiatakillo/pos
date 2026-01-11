"""
Seed standard restaurant categories into the product catalog.

This creates placeholder catalog items with standard restaurant categories
so they appear in the category filter dropdowns even before products are added.

Usage:
    python -m app.seeds.categories
"""

import sys
from sqlmodel import Session, select
from app.db import engine
from app.models import ProductCatalog


# Standard restaurant categories with their subcategories
STANDARD_CATEGORIES = {
    "Starters": [
        "Appetizers",
        "Salads",
        "Soups",
        "Bread & Dips",
    ],
    "Main Course": [
        "Meat",
        "Fish",
        "Poultry",
        "Vegetarian",
        "Vegan",
        "Pasta",
        "Rice",
        "Pizza",
    ],
    "Desserts": [
        "Cakes",
        "Ice Cream",
        "Fruit",
        "Cheese",
    ],
    "Beverages": [
        "Hot Drinks",
        "Cold Drinks",
        "Alcoholic",
        "Non-Alcoholic",
        "Wine",
        "Beer",
        "Cocktails",
        "Soft Drinks",
    ],
    "Sides": [
        "Vegetables",
        "Potatoes",
        "Rice",
        "Bread",
    ],
}


def seed_categories() -> dict[str, int]:
    """
    Create placeholder catalog items for standard categories.
    These items won't have actual products but will appear in category filters.
    
    Returns:
        dict with counts of created categories and subcategories
    """
    with Session(engine) as session:
        categories_created = 0
        subcategories_created = 0
        
        for category_name, subcategories in STANDARD_CATEGORIES.items():
            # Check if category already exists (by checking for any item with this category)
            existing = session.exec(
                select(ProductCatalog).where(ProductCatalog.category == category_name).limit(1)
            ).first()
            
            if not existing:
                # Create a placeholder catalog item for this category
                # This ensures the category appears in filters
                placeholder = ProductCatalog(
                    name=f"[{category_name}]",  # Brackets indicate it's a category placeholder
                    category=category_name,
                    subcategory=None,
                    normalized_name=f"[{category_name.lower()}]",
                    description=f"Category: {category_name}"
                )
                session.add(placeholder)
                session.commit()
                categories_created += 1
                print(f"Created category placeholder: {category_name}")
            
            # Create placeholder items for subcategories
            for subcat_name in subcategories:
                existing_subcat = session.exec(
                    select(ProductCatalog).where(
                        ProductCatalog.category == category_name,
                        ProductCatalog.subcategory == subcat_name
                    ).limit(1)
                ).first()
                
                if not existing_subcat:
                    placeholder_subcat = ProductCatalog(
                        name=f"[{category_name} - {subcat_name}]",
                        category=category_name,
                        subcategory=subcat_name,
                        normalized_name=f"[{category_name.lower()} - {subcat_name.lower()}]",
                        description=f"Subcategory: {subcat_name} under {category_name}"
                    )
                    session.add(placeholder_subcat)
                    session.commit()
                    subcategories_created += 1
                    print(f"  Created subcategory placeholder: {category_name} > {subcat_name}")
        
        return {
            "categories_created": categories_created,
            "subcategories_created": subcategories_created,
        }


if __name__ == "__main__":
    print("Seeding standard restaurant categories...")
    result = seed_categories()
    print(f"\nComplete!")
    print(f"  Categories created: {result['categories_created']}")
    print(f"  Subcategories created: {result['subcategories_created']}")
