"""
Category and subcategory code definitions for internationalization.

Categories and subcategories use codes instead of strings to support
multiple languages. The frontend can map these codes to localized labels.
"""

# Main category codes
CATEGORY_CODES = {
    "STARTERS": "Starters",
    "MAIN_COURSE": "Main Course",
    "DESSERTS": "Desserts",
    "BEVERAGES": "Beverages",
    "SIDES": "Sides",
}

# Subcategory codes for each main category
SUBCATEGORY_CODES = {
    "STARTERS": {
        "APPETIZERS": "Appetizers",
        "SALADS": "Salads",
        "SOUPS": "Soups",
        "BREAD_DIPS": "Bread & Dips",
    },
    "MAIN_COURSE": {
        "MEAT": "Meat",
        "FISH": "Fish",
        "POULTRY": "Poultry",
        "VEGETARIAN": "Vegetarian",
        "VEGAN": "Vegan",
        "PASTA": "Pasta",
        "RICE": "Rice",
        "PIZZA": "Pizza",
    },
    "DESSERTS": {
        "CAKES": "Cakes",
        "ICE_CREAM": "Ice Cream",
        "FRUIT": "Fruit",
        "CHEESE": "Cheese",
    },
    "BEVERAGES": {
        "HOT_DRINKS": "Hot Drinks",
        "COLD_DRINKS": "Cold Drinks",
        "ALCOHOLIC": "Alcoholic",
        "NON_ALCOHOLIC": "Non-Alcoholic",
        "WINE": "Wine",
        "BEER": "Beer",
        "COCKTAILS": "Cocktails",
        "SOFT_DRINKS": "Soft Drinks",
        # Wine subcategories
        "WINE_RED": "Red Wine",
        "WINE_WHITE": "White Wine",
        "WINE_SPARKLING": "Sparkling Wine",
        "WINE_ROSE": "Rosé Wine",
        "WINE_SWEET": "Sweet Wine",
        "WINE_FORTIFIED": "Fortified Wine",
        "WINE_BY_GLASS": "Wine by Glass",
    },
    "SIDES": {
        "VEGETABLES": "Vegetables",
        "POTATOES": "Potatoes",
        "RICE": "Rice",
        "BREAD": "Bread",
    },
}

# Reverse mapping: string -> code
CATEGORY_STRING_TO_CODE = {v: k for k, v in CATEGORY_CODES.items()}

SUBCATEGORY_STRING_TO_CODE = {}
for main_cat_code, subcats in SUBCATEGORY_CODES.items():
    for code, string in subcats.items():
        SUBCATEGORY_STRING_TO_CODE[string] = code


def get_category_code(category_string: str | None) -> str | None:
    """Convert category string to code."""
    if not category_string:
        return None
    return CATEGORY_STRING_TO_CODE.get(category_string)


def get_subcategory_code(subcategory_string: str | None) -> str | None:
    """Convert subcategory string to code."""
    if not subcategory_string:
        return None
    return SUBCATEGORY_STRING_TO_CODE.get(subcategory_string)


def extract_wine_type_code(subcategory_string: str | None) -> str | None:
    """
    Extract wine type code from subcategory string.
    Handles formats like "Red Wine - D.O. Empordà - Wine by Glass"
    """
    if not subcategory_string:
        return None
    
    # Extract first part (wine type)
    parts = subcategory_string.split(" - ")
    wine_type = parts[0].strip()
    
    # Map to code
    if wine_type == "Red Wine":
        return "WINE_RED"
    elif wine_type == "White Wine":
        return "WINE_WHITE"
    elif wine_type == "Sparkling Wine":
        return "WINE_SPARKLING"
    elif wine_type == "Rosé Wine":
        return "WINE_ROSE"
    elif wine_type == "Sweet Wine":
        return "WINE_SWEET"
    elif wine_type == "Fortified Wine":
        return "WINE_FORTIFIED"
    
    return None


def extract_wine_by_glass_code(subcategory_string: str | None) -> str | None:
    """Check if subcategory contains 'Wine by Glass'."""
    if subcategory_string and "Wine by Glass" in subcategory_string:
        return "WINE_BY_GLASS"
    return None


def get_all_subcategory_codes(subcategory_string: str | None) -> list[str]:
    """
    Extract all subcategory codes from a subcategory string.
    Returns list of codes (e.g., ["WINE_RED", "WINE_BY_GLASS"])
    """
    if not subcategory_string:
        return []
    
    codes = []
    
    # Extract wine type code
    wine_type_code = extract_wine_type_code(subcategory_string)
    if wine_type_code:
        codes.append(wine_type_code)
    
    # Check for Wine by Glass
    wine_by_glass_code = extract_wine_by_glass_code(subcategory_string)
    if wine_by_glass_code:
        codes.append(wine_by_glass_code)
    
    # Check for other subcategory codes (non-wine)
    # Map common subcategory strings to codes
    subcat_lower = subcategory_string.lower()
    if "appetizers" in subcat_lower or subcategory_string == "Appetizers":
        codes.append("APPETIZERS")
    elif "salads" in subcat_lower or subcategory_string == "Salads":
        codes.append("SALADS")
    elif "soups" in subcat_lower or subcategory_string == "Soups":
        codes.append("SOUPS")
    elif "bread" in subcat_lower and "dips" in subcat_lower:
        codes.append("BREAD_DIPS")
    elif subcategory_string == "Meat":
        codes.append("MEAT")
    elif subcategory_string == "Fish":
        codes.append("FISH")
    elif subcategory_string == "Poultry":
        codes.append("POULTRY")
    elif subcategory_string == "Vegetarian":
        codes.append("VEGETARIAN")
    elif subcategory_string == "Vegan":
        codes.append("VEGAN")
    elif subcategory_string == "Pasta":
        codes.append("PASTA")
    elif subcategory_string == "Rice":
        codes.append("RICE")
    elif subcategory_string == "Pizza":
        codes.append("PIZZA")
    elif subcategory_string == "Cakes":
        codes.append("CAKES")
    elif subcategory_string == "Ice Cream":
        codes.append("ICE_CREAM")
    elif subcategory_string == "Fruit":
        codes.append("FRUIT")
    elif subcategory_string == "Cheese":
        codes.append("CHEESE")
    elif subcategory_string == "Hot Drinks":
        codes.append("HOT_DRINKS")
    elif subcategory_string == "Cold Drinks":
        codes.append("COLD_DRINKS")
    elif subcategory_string == "Alcoholic":
        codes.append("ALCOHOLIC")
    elif subcategory_string == "Non-Alcoholic":
        codes.append("NON_ALCOHOLIC")
    elif subcategory_string == "Beer":
        codes.append("BEER")
    elif subcategory_string == "Cocktails":
        codes.append("COCKTAILS")
    elif subcategory_string == "Soft Drinks":
        codes.append("SOFT_DRINKS")
    elif subcategory_string == "Vegetables":
        codes.append("VEGETABLES")
    elif subcategory_string == "Potatoes":
        codes.append("POTATOES")
    elif subcategory_string == "Bread":
        codes.append("BREAD")
    
    return codes
