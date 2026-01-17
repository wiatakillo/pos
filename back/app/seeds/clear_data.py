"""
Reset the database and cleanup uploaded provider images.
WARNING: This deletes all data in the specified tables.

Usage:
    python -m app.seeds.clear_data
"""

import shutil
from pathlib import Path
from sqlmodel import Session, select, delete
from app.db import engine
from app.models import (
    OrderItem, 
    Order, 
    TenantProduct, 
    ProviderProduct, 
    ProductCatalog, 
    Product, 
    Provider,
    I18nText
)

def clear_all_data():
    """Clear all data from the database and cleanup uploads."""
    print("🗑️  Starting global data cleanup...")
    
    with Session(engine) as session:
        # Tables to clear in order (to respect foreign keys)
        tables_to_clear = [
            I18nText,
            OrderItem,
            Order,
            TenantProduct,
            ProviderProduct,
            ProductCatalog,
            Product,
            Provider
        ]
        
        for table in tables_to_clear:
            try:
                # Direct delete is faster than loading all and deleting
                statement = delete(table)
                result = session.exec(statement)
                session.commit()
                # rowcount might not be available for all dialects in SQLModel/SQLAlchemy easily this way,
                # but we'll try or just show success.
                print(f"✅ Cleared table: {table.__name__}")
            except Exception as e:
                print(f"❌ Error clearing table {table.__name__}: {e}")
                session.rollback()

    # Cleanup uploads/providers directory
    providers_dir = Path("app").parent / "uploads" / "providers"
    if providers_dir.exists():
        print(f"📁 Cleaning up: {providers_dir}")
        try:
            # We don't want to delete the dir itself necessarily, but its contents
            for item in providers_dir.iterdir():
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()
            print("✅ Uploaded provider images removed.")
        except PermissionError:
            print("⚠️  Permission denied while cleaning up uploads. Please run 'sudo chown -R $USER:$USER back/uploads' on the host.")
        except Exception as e:
            print(f"❌ Error cleaning up uploads: {e}")
    else:
        print("ℹ️  Uploads directory already empty or not found.")

    print("\n✨ Cleanup finished!")

if __name__ == "__main__":
    clear_all_data()
