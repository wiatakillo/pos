"""
Migrate provider directories from ID-based to token-based paths.

This script:
1. Generates tokens for existing providers that don't have one
2. Renames provider image directories from providers/{id} to providers/{token}
3. Updates the database with tokens

Usage:
    python -m app.seeds.migrate_provider_tokens
"""

import sys
from pathlib import Path
from sqlmodel import Session, select
from app.db import engine
from app.models import Provider

# Uploads directory
UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"


def migrate_provider_tokens() -> dict[str, int]:
    """
    Generate tokens for providers and migrate directories.
    
    Returns:
        dict with counts of providers updated and directories migrated
    """
    with Session(engine) as session:
        providers = session.exec(select(Provider)).all()
        
        providers_updated = 0
        directories_migrated = 0
        
        for provider in providers:
            # Generate token if not present
            if not provider.token:
                from uuid import uuid4
                provider.token = str(uuid4())
                session.add(provider)
                providers_updated += 1
                print(f"Generated token for provider {provider.id} ({provider.name}): {provider.token[:8]}...")
            
            # Migrate directory if it exists
            old_dir = UPLOADS_DIR / "providers" / str(provider.id)
            new_dir = UPLOADS_DIR / "providers" / provider.token
            
            if old_dir.exists() and not new_dir.exists():
                try:
                    old_dir.rename(new_dir)
                    directories_migrated += 1
                    print(f"  Migrated directory: providers/{provider.id} -> providers/{provider.token[:8]}...")
                except Exception as e:
                    print(f"  Error migrating directory for provider {provider.id}: {e}")
            elif old_dir.exists() and new_dir.exists():
                # Both exist - copy files and remove old
                print(f"  Warning: Both directories exist for provider {provider.id}, copying files...")
                try:
                    import shutil
                    for item in old_dir.iterdir():
                        dest = new_dir / item.name
                        if item.is_dir():
                            if dest.exists():
                                shutil.rmtree(dest)
                            shutil.copytree(item, dest)
                        else:
                            if dest.exists():
                                dest.unlink()
                            shutil.copy2(item, dest)
                    shutil.rmtree(old_dir)
                    directories_migrated += 1
                    print(f"  Copied and removed old directory for provider {provider.id}")
                except Exception as e:
                    print(f"  Error copying directory for provider {provider.id}: {e}")
        
        session.commit()
        
        return {
            "providers_updated": providers_updated,
            "directories_migrated": directories_migrated,
        }


if __name__ == "__main__":
    print("Migrating provider tokens and directories...")
    result = migrate_provider_tokens()
    print(f"\nComplete!")
    print(f"  Providers updated: {result['providers_updated']}")
    print(f"  Directories migrated: {result['directories_migrated']}")
