import json
import logging
import os
from datetime import timedelta, datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from PIL import Image
import redis
import stripe
from fastapi import Depends, FastAPI, HTTPException, UploadFile, File, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from . import models, security
from .db import check_db_connection, create_db_and_tables, get_session
from .settings import settings
from .inventory_routes import router as inventory_router
from .inventory_service import deduct_inventory_for_order
from . import inventory_models

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configure Stripe (global fallback - will be overridden by tenant-specific keys)
# Note: stripe.api_key is set globally but individual API calls use api_key parameter
stripe.api_key = settings.stripe_secret_key or ""

def _get_stripe_currency_code(currency_symbol: str | None) -> str | None:
    """
    Map currency symbol to Stripe currency code.
    Returns None if symbol is not recognized.
    """
    if not currency_symbol:
        return None
    
    # Common currency symbol to Stripe currency code mapping
    currency_map = {
        '€': 'eur',
        '$': 'usd',
        '£': 'gbp',
        '¥': 'jpy',
        '₹': 'inr',
        '₽': 'rub',
        '₩': 'krw',
        '₨': 'pkr',
        '₦': 'ngn',
        '₴': 'uah',
        '₫': 'vnd',
        '₪': 'ils',
        '₡': 'crc',
        '₱': 'php',
        '₨': 'lkr',
        '₦': 'ngn',
        '₨': 'npr',
        '₨': 'mru',
        'MXN': 'mxn',
        'mxn': 'mxn',
        'EUR': 'eur',
        'eur': 'eur',
        'USD': 'usd',
        'usd': 'usd',
        'GBP': 'gbp',
        'gbp': 'gbp',
    }
    
    # Try direct lookup
    if currency_symbol in currency_map:
        return currency_map[currency_symbol]
    
    # Try case-insensitive lookup for 3-letter codes
    currency_upper = currency_symbol.upper()
    if currency_upper in currency_map:
        return currency_map[currency_upper]
    
    # If it's already a 3-letter code, return as-is (Stripe will validate)
    if len(currency_symbol) == 3:
        return currency_symbol.lower()
    
    return None


app = FastAPI(
    title="POS API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    swagger_ui_parameters={
        "faviconUrl": "/favicon.ico"
    }
)

# Parse CORS origins from environment (comma-separated)
cors_origins_list = [
    origin.strip() 
    for origin in settings.cors_origins.split(",") 
    if origin.strip()
]
# Add wildcard for public menu access if not already present
# Add wildcard for public menu access if not already present
# if "*" not in cors_origins_list:
#     cors_origins_list.append("*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploads directory for product images
UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE = 2 * 1024 * 1024  # 2MB

# Image optimization settings
MAX_IMAGE_WIDTH = 1920  # Maximum width in pixels
MAX_IMAGE_HEIGHT = 1920  # Maximum height in pixels
JPEG_QUALITY = 85  # JPEG quality (1-100, 85 is a good balance)
PNG_OPTIMIZE = True  # Enable PNG optimization
WEBP_QUALITY = 85  # WebP quality (1-100)

# Static files directory for favicon and other assets
STATIC_DIR = Path(__file__).parent.parent
STATIC_DIR.mkdir(exist_ok=True)

# Mount static files for serving images
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Register Inventory API router
app.include_router(inventory_router, prefix="/inventory", tags=["Inventory"])


# ============ IMAGE OPTIMIZATION ============

def get_file_size(file_path: Path) -> int | None:
    """Get file size in bytes. Returns None if file doesn't exist."""
    try:
        if file_path.exists():
            return file_path.stat().st_size
    except Exception:
        pass
    return None

def format_file_size(size_bytes: int | None) -> str:
    """Format file size in human-readable format."""
    if size_bytes is None:
        return "Unknown"
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"

def optimize_image(image_data: bytes, content_type: str) -> bytes:
    """
    Optimize image locally using Pillow.
    - Resizes if too large
    - Compresses JPEG/WebP with quality settings
    - Optimizes PNG files
    Returns optimized image data.
    """
    try:
        # Open image from bytes
        image = Image.open(BytesIO(image_data))
        original_format = image.format
        original_size = len(image_data)
        
        # Convert RGBA to RGB for JPEG (JPEG doesn't support transparency)
        if (content_type == "image/jpeg" or original_format == "JPEG") and image.mode in ("RGBA", "LA", "P"):
            # Create white background
            background = Image.new("RGB", image.size, (255, 255, 255))
            if image.mode == "P":
                image = image.convert("RGBA")
            background.paste(image, mask=image.split()[-1] if image.mode == "RGBA" else None)
            image = background
        elif image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        
        # Resize if image is too large
        width, height = image.size
        if width > MAX_IMAGE_WIDTH or height > MAX_IMAGE_HEIGHT:
            # Calculate new dimensions maintaining aspect ratio
            ratio = min(MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height)
            new_width = int(width * ratio)
            new_height = int(height * ratio)
            image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
            logger.info(f"Image resized: {width}x{height} -> {new_width}x{new_height}")
        
        # Save optimized image to bytes
        output = BytesIO()
        
        if content_type == "image/jpeg" or original_format == "JPEG":
            image.save(output, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        elif content_type == "image/webp" or original_format == "WEBP":
            image.save(output, format="WEBP", quality=WEBP_QUALITY, method=6)
        elif content_type == "image/png" or original_format == "PNG":
            # PNG optimization
            image.save(output, format="PNG", optimize=PNG_OPTIMIZE)
        else:
            # Default to JPEG
            image.save(output, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        
        optimized_data = output.getvalue()
        optimized_size = len(optimized_data)
        reduction = ((original_size - optimized_size) / original_size) * 100
        
        logger.info(
            f"Image optimized: {original_size / 1024:.1f}KB -> "
            f"{optimized_size / 1024:.1f}KB ({reduction:.1f}% reduction)"
        )
        
        return optimized_data
        
    except Exception as e:
        logger.warning(f"Error optimizing image: {e}, using original image")
        return image_data

# Serve favicon for API docs (blue icon to distinguish from frontend)
@app.get("/favicon.ico", include_in_schema=False)
@app.head("/favicon.ico", include_in_schema=False)
async def favicon():
    from fastapi.responses import FileResponse, Response
    favicon_path = STATIC_DIR / "favicon.svg"
    if favicon_path.exists():
        response = FileResponse(
            str(favicon_path), 
            media_type="image/svg+xml",
            headers={
                "Cache-Control": "public, max-age=3600",
                "X-Favicon-Source": "backend"
            }
        )
        return response
    raise HTTPException(status_code=404)

# Redis client for pub/sub
redis_client: redis.Redis | None = None


def get_redis() -> redis.Redis | None:
    global redis_client
    if redis_client is None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        try:
            redis_client = redis.from_url(redis_url)
            redis_client.ping()
        except Exception:
            redis_client = None
    return redis_client


def publish_order_update(tenant_id: int, order_data: dict, table_id: int | None = None) -> None:
    """Publish order update to Redis for WebSocket bridge.
    
    Publishes to both:
    - orders:tenant:{tenant_id} - for restaurant owners (all tenant orders)
    - orders:table:{table_id} - for customers (table-specific orders, if table_id provided)
    """
    r = get_redis()
    if r:
        try:
            # Always publish to tenant channel for restaurant owners
            r.publish(f"orders:tenant:{tenant_id}", json.dumps(order_data))
            
            # Also publish to table channel if table_id is provided (for customers)
            if table_id is not None:
                r.publish(f"orders:table:{table_id}", json.dumps(order_data))
        except Exception:
            pass  # Fail silently if Redis unavailable


@app.on_event("startup")
def on_startup() -> None:
    logger.info("Starting application...")
    create_db_and_tables()
    # Run database migrations
    try:
        from .migrate import MigrationRunner
        from pathlib import Path
        migrations_dir = Path(__file__).parent.parent / "migrations"
        runner = MigrationRunner(migrations_dir)
        db_version = runner.run_migrations()
        logger.info(f"Database schema version: {db_version}")
    except Exception as e:
        # Log but don't fail startup - migrations can be run manually
        logger.warning(f"Migration check failed: {e}", exc_info=True)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/health/db")
def health_db(session: Session = Depends(get_session)) -> dict:
    """Check database connection and version."""
    try:
        check_db_connection()
        
        # Get database schema version
        try:
            from .migrate import MigrationRunner
            from pathlib import Path
            migrations_dir = Path(__file__).parent.parent / "migrations"
            runner = MigrationRunner(migrations_dir)
            db_version = runner.get_current_version(session)
        except Exception:
            db_version = None
        
        return {
            "status": "ok",
            "database": "connected",
            "schema_version": db_version
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database error: {e}")


# ============ AUTH ============

@app.post("/register")
def register(
    tenant_name: str,
    email: str,
    password: str,
    full_name: str | None = None,
    session: Session = Depends(get_session)
) -> dict:
    existing_user = session.exec(select(models.User).where(models.User.email == email)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    tenant = models.Tenant(name=tenant_name)
    session.add(tenant)
    session.commit()
    session.refresh(tenant)

    hashed_password = security.get_password_hash(password)
    user = models.User(
        email=email,
        hashed_password=hashed_password,
        full_name=full_name,
        tenant_id=tenant.id
    )
    session.add(user)
    session.commit()
    
    return {"status": "created", "tenant_id": tenant.id, "email": email}


@app.post("/token")
def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Session = Depends(get_session)
) -> dict:
    statement = select(models.User).where(models.User.email == form_data.username)
    user = session.exec(statement).first()
    
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = security.create_access_token(
        data={"sub": user.email, "tenant_id": user.tenant_id},
        expires_delta=security.timedelta(minutes=settings.access_token_expire_minutes)
    )
    
    response = JSONResponse(content={"status": "success", "message": "Logged in"})
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.is_production,  # Only enforce HTTPS in production
        samesite="lax",
        path="/",  # Ensure cookie is sent with all API requests
        max_age=settings.access_token_expire_minutes * 60
    )
    return response


@app.post("/logout")
def logout():
    response = JSONResponse(content={"status": "success", "message": "Logged out"})
    response.delete_cookie(key="access_token", path="/")  # Must match path used in set_cookie
    return response


@app.get("/users/me")
def read_users_me(
    current_user: Annotated[models.User, Depends(security.get_current_user)]
) -> models.User:
    return current_user


# ============ TENANT SETTINGS ============

@app.get("/tenant/settings")
def get_tenant_settings(
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    """Get tenant/business profile settings."""
    tenant = session.exec(
        select(models.Tenant).where(models.Tenant.id == current_user.tenant_id)
    ).first()
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Get logo file size if exists
    logo_size = None
    if tenant.logo_filename:
        logo_path = UPLOADS_DIR / str(current_user.tenant_id) / "logo" / tenant.logo_filename
        logo_size = get_file_size(logo_path)
    
    # Convert tenant to dict and add file size
    tenant_dict = tenant.model_dump()
    tenant_dict["logo_size_bytes"] = logo_size
    tenant_dict["logo_size_formatted"] = format_file_size(logo_size)
    
    # Don't expose full secret key - only show last 4 characters for verification
    if tenant_dict.get("stripe_secret_key"):
        secret_key = tenant_dict["stripe_secret_key"]
        tenant_dict["stripe_secret_key"] = f"{secret_key[:7]}...{secret_key[-4:]}" if len(secret_key) > 11 else "***"
    
    return tenant_dict


@app.put("/tenant/settings")
def update_tenant_settings(
    tenant_update: models.TenantUpdate,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    """Update tenant/business profile settings."""
    tenant = session.exec(
        select(models.Tenant).where(models.Tenant.id == current_user.tenant_id)
    ).first()
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Update fields if provided (convert empty strings to None)
    if tenant_update.name is not None:
        tenant.name = tenant_update.name.strip() if isinstance(tenant_update.name, str) else tenant_update.name
    if tenant_update.business_type is not None:
        tenant.business_type = tenant_update.business_type if tenant_update.business_type else None
    if tenant_update.description is not None:
        tenant.description = tenant_update.description.strip() if tenant_update.description else None
    if tenant_update.phone is not None:
        tenant.phone = tenant_update.phone.strip() if tenant_update.phone else None
    if tenant_update.whatsapp is not None:
        tenant.whatsapp = tenant_update.whatsapp.strip() if tenant_update.whatsapp else None
    if tenant_update.email is not None:
        tenant.email = tenant_update.email.strip() if tenant_update.email else None
    if tenant_update.address is not None:
        tenant.address = tenant_update.address.strip() if tenant_update.address else None
    if tenant_update.website is not None:
        tenant.website = tenant_update.website.strip() if tenant_update.website else None
    if tenant_update.opening_hours is not None:
        tenant.opening_hours = tenant_update.opening_hours.strip() if tenant_update.opening_hours else None
    if tenant_update.immediate_payment_required is not None:
        tenant.immediate_payment_required = tenant_update.immediate_payment_required
    if tenant_update.currency is not None:
        tenant.currency = tenant_update.currency.strip() if isinstance(tenant_update.currency, str) and tenant_update.currency.strip() else None
    if tenant_update.stripe_secret_key is not None:
        # Only update if a non-empty value is provided
        # Empty string or None means don't change the existing value
        if tenant_update.stripe_secret_key and isinstance(tenant_update.stripe_secret_key, str) and tenant_update.stripe_secret_key.strip():
            tenant.stripe_secret_key = tenant_update.stripe_secret_key.strip()
        # If empty/None, we don't update (keep existing value)
    if tenant_update.stripe_publishable_key is not None:
        tenant.stripe_publishable_key = tenant_update.stripe_publishable_key.strip() if isinstance(tenant_update.stripe_publishable_key, str) and tenant_update.stripe_publishable_key.strip() else None
    
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    
    # Get logo file size if exists
    logo_size = None
    if tenant.logo_filename:
        logo_path = UPLOADS_DIR / str(current_user.tenant_id) / "logo" / tenant.logo_filename
        logo_size = get_file_size(logo_path)
    
    # Convert tenant to dict and add file size
    tenant_dict = tenant.model_dump()
    tenant_dict["logo_size_bytes"] = logo_size
    tenant_dict["logo_size_formatted"] = format_file_size(logo_size)
    
    # Don't expose full secret key - only show last 4 characters for verification
    if tenant_dict.get("stripe_secret_key"):
        secret_key = tenant_dict["stripe_secret_key"]
        tenant_dict["stripe_secret_key"] = f"{secret_key[:7]}...{secret_key[-4:]}" if len(secret_key) > 11 else "***"
    
    return tenant_dict


@app.post("/tenant/logo")
async def upload_tenant_logo(
    file: Annotated[UploadFile, File()],
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.Tenant:
    """Upload a logo for the tenant/business."""
    tenant = session.exec(
        select(models.Tenant).where(models.Tenant.id == current_user.tenant_id)
    ).first()
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Validate content type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}"
        )
    
    # Read file and check size
    contents = await file.read()
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {MAX_IMAGE_SIZE // (1024*1024)}MB"
        )
    
    # Optimize image locally
    contents = optimize_image(contents, file.content_type)
    
    # Create tenant logo directory
    tenant_dir = UPLOADS_DIR / str(current_user.tenant_id) / "logo"
    tenant_dir.mkdir(parents=True, exist_ok=True)
    
    # Delete old logo if exists
    if tenant.logo_filename:
        old_path = tenant_dir / tenant.logo_filename
        if old_path.exists():
            old_path.unlink()
    
    # Generate unique filename
    ext = Path(file.filename or "logo.jpg").suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"
    new_filename = f"{uuid4()}{ext}"
    
    # Save file
    file_path = tenant_dir / new_filename
    file_path.write_bytes(contents)
    
    # Update tenant
    tenant.logo_filename = new_filename
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    
    # Get file size for response
    logo_size = get_file_size(file_path)
    tenant_dict = tenant.model_dump()
    tenant_dict["logo_size_bytes"] = logo_size
    tenant_dict["logo_size_formatted"] = format_file_size(logo_size)
    
    return tenant_dict


# ============ PRODUCTS ============

@app.get("/products")
def list_products(
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> list[models.Product]:
    """List all products for the tenant.
    
    Returns all Product entries. Also:
    1. Creates Product entries for TenantProducts that don't have a linked Product entry
    2. Updates existing Product entries that are missing images but have a linked TenantProduct with provider_product
    """
    # Get all Product entries
    products = session.exec(
        select(models.Product).where(models.Product.tenant_id == current_user.tenant_id)
    ).all()
    
    # Get TenantProducts that don't have a linked Product entry
    tenant_products_without_product = session.exec(
        select(models.TenantProduct).where(
            models.TenantProduct.tenant_id == current_user.tenant_id,
            models.TenantProduct.product_id.is_(None)
        )
    ).all()
    
    # Create Product entries for TenantProducts that don't have one
    for tp in tenant_products_without_product:
        # Get catalog item for category/subcategory
        catalog_item = session.exec(
            select(models.ProductCatalog).where(models.ProductCatalog.id == tp.catalog_id)
        ).first()
        
        # Get image from TenantProduct or provider product
        image_filename = tp.image_filename
        if not image_filename and tp.provider_product_id:
            # Try to get image from provider product
            provider_product = session.exec(
                select(models.ProviderProduct).where(models.ProviderProduct.id == tp.provider_product_id)
            ).first()
            if provider_product and provider_product.image_filename:
                provider = session.exec(
                    select(models.Provider).where(models.Provider.id == provider_product.provider_id)
                ).first()
                if provider:
                    image_filename = f"providers/{provider.token}/products/{provider_product.image_filename}"
        
        # Create Product entry
        product = models.Product(
            tenant_id=tp.tenant_id,
            name=tp.name,
            price_cents=tp.price_cents,
            image_filename=image_filename,
            ingredients=tp.ingredients,
            category=catalog_item.category if catalog_item else None,
            subcategory=catalog_item.subcategory if catalog_item else None,
        )
        session.add(product)
        session.flush()  # Flush to get the ID
        session.refresh(product)
        
        # Link TenantProduct to the new Product
        tp.product_id = product.id
        session.add(tp)
        
        products.append(product)
    
    # Update existing Product entries that are missing images
    updated_count = 0
    for product in products:
        if not product.image_filename:
            # Find linked TenantProduct
            tenant_product = session.exec(
                select(models.TenantProduct).where(
                    models.TenantProduct.product_id == product.id,
                    models.TenantProduct.tenant_id == current_user.tenant_id
                )
            ).first()
            
            if tenant_product and tenant_product.provider_product_id:
                # Get image from provider product
                provider_product = session.exec(
                    select(models.ProviderProduct).where(
                        models.ProviderProduct.id == tenant_product.provider_product_id
                    )
                ).first()
                if provider_product and provider_product.image_filename:
                    provider = session.exec(
                        select(models.Provider).where(models.Provider.id == provider_product.provider_id)
                    ).first()
                    if provider:
                        product.image_filename = f"providers/{provider.token}/products/{provider_product.image_filename}"
                        session.add(product)
                        updated_count += 1
    
    # Commit all changes
    if tenant_products_without_product or updated_count > 0:
        session.commit()
        # Refresh products to get updated image_filename
        for product in products:
            session.refresh(product)
    
    return products


@app.post("/products")
def create_product(
    product: models.Product,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.Product:
    product.tenant_id = current_user.tenant_id
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


@app.put("/products/{product_id}")
def update_product(
    product_id: int,
    product_update: models.ProductUpdate,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.Product:
    product = session.exec(
        select(models.Product).where(
            models.Product.id == product_id,
            models.Product.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if product_update.name is not None:
        product.name = product_update.name
    if product_update.price_cents is not None:
        product.price_cents = product_update.price_cents
    if product_update.ingredients is not None:
        product.ingredients = product_update.ingredients
    if product_update.category is not None:
        product.category = product_update.category
    if product_update.subcategory is not None:
        product.subcategory = product_update.subcategory
    
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


@app.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    product = session.exec(
        select(models.Product).where(
            models.Product.id == product_id,
            models.Product.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    session.delete(product)
    session.commit()
    return {"status": "deleted", "id": product_id}


@app.post("/products/{product_id}/image")
async def upload_product_image(
    product_id: int,
    file: Annotated[UploadFile, File()],
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.Product:
    """Upload an image for a product. Validates file type and size."""
    product = session.exec(
        select(models.Product).where(
            models.Product.id == product_id,
            models.Product.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Validate content type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}"
        )
    
    # Read file and check size
    contents = await file.read()
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {MAX_IMAGE_SIZE // (1024*1024)}MB"
        )
    
    # Optimize image locally
    contents = optimize_image(contents, file.content_type)
    
    # Create tenant upload directory
    tenant_dir = UPLOADS_DIR / str(current_user.tenant_id) / "products"
    tenant_dir.mkdir(parents=True, exist_ok=True)
    
    # Delete old image if exists
    if product.image_filename:
        old_path = tenant_dir / product.image_filename
        if old_path.exists():
            old_path.unlink()
    
    # Generate unique filename
    ext = Path(file.filename or "image.jpg").suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"
    new_filename = f"{uuid4()}{ext}"
    
    # Save file
    file_path = tenant_dir / new_filename
    file_path.write_bytes(contents)
    
    # Update product
    product.image_filename = new_filename
    session.add(product)
    session.commit()
    session.refresh(product)
    
    # Get file size for response
    image_size = get_file_size(file_path)
    product_dict = product.model_dump()
    product_dict["image_size_bytes"] = image_size
    product_dict["image_size_formatted"] = format_file_size(image_size)
    
    return product_dict


# ============ PROVIDERS ============

@app.get("/providers")
def list_providers(
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session),
    active_only: bool = True
) -> list[models.Provider]:
    """List all product providers."""
    query = select(models.Provider)
    if active_only:
        query = query.where(models.Provider.is_active == True)
    return session.exec(query.order_by(models.Provider.name)).all()


@app.get("/providers/{provider_id}")
def get_provider(
    provider_id: int,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.Provider:
    """Get a specific provider."""
    provider = session.exec(select(models.Provider).where(models.Provider.id == provider_id)).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider


@app.post("/providers")
def create_provider(
    provider: models.Provider,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.Provider:
    """Create a new provider (admin function)."""
    session.add(provider)
    session.commit()
    session.refresh(provider)
    return provider


# ============ PRODUCT CATALOG ============

@app.get("/catalog")
async def list_catalog(
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session),
    category: str | None = None,
    subcategory: str | None = None,
    search: str | None = None
) -> list[dict]:
    """List products from catalog with price comparison across providers."""
    query = select(models.ProductCatalog)
    
    if category:
        query = query.where(models.ProductCatalog.category == category)
    if subcategory:
        query = query.where(models.ProductCatalog.subcategory == subcategory)
    if search:
        search_term = f"%{search.lower()}%"
        query = query.where(
            (models.ProductCatalog.name.ilike(search_term)) |
            (models.ProductCatalog.description.ilike(search_term))
        )
    
    catalog_items = session.exec(query.order_by(models.ProductCatalog.name)).all()
    
    result = []
    for item in catalog_items:
        # Get all provider products for this catalog item
        provider_products = session.exec(
            select(models.ProviderProduct).where(
                models.ProviderProduct.catalog_id == item.id,
                models.ProviderProduct.availability == True
            )
        ).all()
        
        # Get provider info
        providers_data = []
        for pp in provider_products:
            provider = session.exec(
                select(models.Provider).where(models.Provider.id == pp.provider_id)
            ).first()
            if provider:
                # Construct image URL - only use local images, never external URLs
                image_url = None
                if pp.image_filename:
                    image_url = f"/uploads/providers/{provider.token}/products/{pp.image_filename}"
                
                providers_data.append({
                    "provider_id": provider.id,
                    "provider_name": provider.name,
                    "provider_product_id": pp.id,
                    "price_cents": pp.price_cents,
                    "image_url": image_url,
                    "country": pp.country,
                    "region": pp.region,
                    "grape_variety": pp.grape_variety,
                    "volume_ml": pp.volume_ml,
                    "unit": pp.unit,
                    "detailed_description": pp.detailed_description,
                    "wine_style": pp.wine_style,
                    "vintage": pp.vintage,
                    "winery": pp.winery,
                    "aromas": pp.aromas,
                    "elaboration": pp.elaboration,
                })
        
        # Sort providers by price (lowest first)
        providers_data.sort(key=lambda x: x["price_cents"] if x["price_cents"] else float('inf'))
        
        # Get main image from first provider (if available)
        main_image_url = None
        if providers_data and providers_data[0].get("image_url"):
            main_image_url = providers_data[0]["image_url"]
        
        # Get origin (country/region) and detailed info from first provider - this is product-level info
        origin_country = None
        origin_region = None
        detailed_description = None
        wine_style = None
        vintage = None
        winery = None
        grape_variety = None
        aromas = None
        elaboration = None
        
        if providers_data:
            # Use first provider's data (most common case)
            origin_country = providers_data[0].get("country")
            origin_region = providers_data[0].get("region")
            detailed_description = providers_data[0].get("detailed_description")
            wine_style = providers_data[0].get("wine_style")
            vintage = providers_data[0].get("vintage")
            winery = providers_data[0].get("winery")
            grape_variety = providers_data[0].get("grape_variety")
            aromas = providers_data[0].get("aromas")
            elaboration = providers_data[0].get("elaboration")
        
        result.append({
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "detailed_description": detailed_description,
            "category": item.category,
            "subcategory": item.subcategory,
            "barcode": item.barcode,
            "brand": item.brand,
            "image_url": main_image_url,
            "country": origin_country,
            "region": origin_region,
            "wine_style": wine_style,
            "vintage": vintage,
            "winery": winery,
            "grape_variety": grape_variety,
            "aromas": aromas,
            "elaboration": elaboration,
            "providers": providers_data,
            "min_price_cents": min([p["price_cents"] for p in providers_data if p["price_cents"]], default=None),
            "max_price_cents": max([p["price_cents"] for p in providers_data if p["price_cents"]], default=None),
        })
    
    return result


@app.get("/catalog/categories")
async def get_catalog_categories(
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    """Get all categories and subcategories from catalog."""
    catalog_items = session.exec(select(models.ProductCatalog)).all()
    
    categories = {}
    for item in catalog_items:
        if item.category:
            if item.category not in categories:
                categories[item.category] = set()
            if item.subcategory:
                categories[item.category].add(item.subcategory)
    
    return {
        cat: sorted(list(subcats)) 
        for cat, subcats in categories.items()
    }


@app.get("/catalog/{catalog_id}")
async def get_catalog_item(
    catalog_id: int,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    """Get a specific catalog item with price comparison."""
    catalog_item = session.exec(
        select(models.ProductCatalog).where(models.ProductCatalog.id == catalog_id)
    ).first()
    
    if not catalog_item:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    
    # Get all provider products
    provider_products = session.exec(
        select(models.ProviderProduct).where(
            models.ProviderProduct.catalog_id == catalog_id,
            models.ProviderProduct.availability == True
        )
    ).all()
    
    providers_data = []
    for pp in provider_products:
        provider = session.exec(
            select(models.Provider).where(models.Provider.id == pp.provider_id)
        ).first()
        if provider:
            # Construct image URL - only use local images, never external URLs
            image_url = None
            if pp.image_filename:
                image_url = f"/uploads/providers/{provider.token}/products/{pp.image_filename}"
            
            providers_data.append({
                "provider_id": provider.id,
                "provider_name": provider.name,
                "price_cents": pp.price_cents,
                "image_url": image_url,
                "country": pp.country,
                "region": pp.region,
                "grape_variety": pp.grape_variety,
                "volume_ml": pp.volume_ml,
                "unit": pp.unit,
            })
    
    providers_data.sort(key=lambda x: x["price_cents"] if x["price_cents"] else float('inf'))
    
    # Get main image from first provider (if available)
    main_image_url = None
    if providers_data and providers_data[0].get("image_url"):
        main_image_url = providers_data[0]["image_url"]
    
    # Get origin (country/region) and detailed info from first provider - this is product-level info
    origin_country = None
    origin_region = None
    detailed_description = None
    wine_style = None
    vintage = None
    winery = None
    grape_variety = None
    aromas = None
    elaboration = None
    
    if providers_data:
        origin_country = providers_data[0].get("country")
        origin_region = providers_data[0].get("region")
        detailed_description = providers_data[0].get("detailed_description")
        wine_style = providers_data[0].get("wine_style")
        vintage = providers_data[0].get("vintage")
        winery = providers_data[0].get("winery")
        grape_variety = providers_data[0].get("grape_variety")
        aromas = providers_data[0].get("aromas")
        elaboration = providers_data[0].get("elaboration")
    
    return {
        "id": catalog_item.id,
        "name": catalog_item.name,
        "description": catalog_item.description,
        "detailed_description": detailed_description,
        "category": catalog_item.category,
        "subcategory": catalog_item.subcategory,
        "barcode": catalog_item.barcode,
        "brand": catalog_item.brand,
        "image_url": main_image_url,
        "country": origin_country,
        "region": origin_region,
        "wine_style": wine_style,
        "vintage": vintage,
        "winery": winery,
        "grape_variety": grape_variety,
        "aromas": aromas,
        "elaboration": elaboration,
        "providers": providers_data,
        "min_price_cents": min([p["price_cents"] for p in providers_data if p["price_cents"]], default=None),
        "max_price_cents": max([p["price_cents"] for p in providers_data if p["price_cents"]], default=None),
    }


# ============ PROVIDER PRODUCTS ============

@app.get("/providers/{provider_id}/products")
def list_provider_products(
    provider_id: int,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> list[models.ProviderProduct]:
    """List all products from a specific provider."""
    provider = session.exec(select(models.Provider).where(models.Provider.id == provider_id)).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    return session.exec(
        select(models.ProviderProduct)
        .where(models.ProviderProduct.provider_id == provider_id)
        .order_by(models.ProviderProduct.name)
    ).all()


# ============ TENANT PRODUCTS ============

@app.get("/tenant-products")
def list_tenant_products(
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session),
    active_only: bool = True
) -> list[dict]:
    """List products selected by the tenant (restaurant)."""
    query = select(models.TenantProduct).where(
        models.TenantProduct.tenant_id == current_user.tenant_id
    )
    
    if active_only:
        query = query.where(models.TenantProduct.is_active == True)
    
    tenant_products = session.exec(query.order_by(models.TenantProduct.name)).all()
    
    result = []
    for tp in tenant_products:
        # Get catalog item info
        catalog_item = session.exec(
            select(models.ProductCatalog).where(models.ProductCatalog.id == tp.catalog_id)
        ).first()
        
        # Get provider product info if linked
        provider_info = None
        if tp.provider_product_id:
            provider_product = session.exec(
                select(models.ProviderProduct).where(models.ProviderProduct.id == tp.provider_product_id)
            ).first()
            if provider_product:
                provider = session.exec(
                    select(models.Provider).where(models.Provider.id == provider_product.provider_id)
                ).first()
                if provider:
                    provider_info = {
                        "provider_id": provider.id,
                        "provider_name": provider.name,
                        "provider_price_cents": provider_product.price_cents,
                    }
        
        result.append({
            "id": tp.id,
            "name": tp.name,
            "price_cents": tp.price_cents,
            "image_filename": tp.image_filename,
            "ingredients": tp.ingredients,
            "is_active": tp.is_active,
            "catalog_id": tp.catalog_id,
            "catalog_name": catalog_item.name if catalog_item else None,
            "provider_info": provider_info,
            "product_id": tp.product_id,  # For backward compatibility
        })
    
    return result


@app.post("/tenant-products")
def create_tenant_product(
    product_data: models.TenantProductCreate,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.TenantProduct:
    """Add a product from catalog to tenant's menu.
    
    This creates BOTH:
    1. A Product entry (shows on /products page)
    2. A TenantProduct entry (links to catalog for metadata)
    """
    # Get catalog item
    catalog_item = session.exec(
        select(models.ProductCatalog).where(models.ProductCatalog.id == product_data.catalog_id)
    ).first()
    if not catalog_item:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    
    # Get provider product for additional info if specified
    provider_product = None
    if product_data.provider_product_id:
        provider_product = session.exec(
            select(models.ProviderProduct).where(
                models.ProviderProduct.id == product_data.provider_product_id,
                models.ProviderProduct.catalog_id == product_data.catalog_id
            )
        ).first()
        if not provider_product:
            raise HTTPException(status_code=404, detail="Provider product not found or doesn't match catalog")
    
    # Use catalog name if name not provided
    product_name = product_data.name or catalog_item.name
    
    # Determine price
    price_cents = product_data.price_cents
    if price_cents is None and provider_product:
        price_cents = provider_product.price_cents
    if price_cents is None:
        raise HTTPException(status_code=400, detail="Price is required")
    
    # Determine category and subcategory from catalog
    category = catalog_item.category
    subcategory = catalog_item.subcategory
    
    # Get image from provider product if available
    image_filename = None
    if provider_product and provider_product.image_filename:
        provider = session.exec(
            select(models.Provider).where(models.Provider.id == provider_product.provider_id)
        ).first()
        if provider:
            image_filename = f"providers/{provider.token}/products/{provider_product.image_filename}"
    
    # 1. Create the actual Product (shows on /products page)
    product = models.Product(
        tenant_id=current_user.tenant_id,
        name=product_name,
        price_cents=price_cents,
        image_filename=image_filename,
        category=category,
        subcategory=subcategory,
    )
    session.add(product)
    session.commit()
    session.refresh(product)
    
    # 2. Create TenantProduct (links to catalog for metadata tracking)
    tenant_product = models.TenantProduct(
        tenant_id=current_user.tenant_id,
        catalog_id=product_data.catalog_id,
        provider_product_id=product_data.provider_product_id,
        product_id=product.id,  # Link to the actual Product
        name=product_name,
        price_cents=price_cents,
    )
    
    session.add(tenant_product)
    session.commit()
    session.refresh(tenant_product)
    
    # 3. Create or find inventory Supplier from Provider (if provider selected)
    inventory_supplier_id = None
    if provider_product:
        provider = session.exec(
            select(models.Provider).where(models.Provider.id == provider_product.provider_id)
        ).first()
        if provider:
            # Check if Supplier already exists for this provider+tenant
            existing_supplier = session.exec(
                select(inventory_models.Supplier).where(
                    inventory_models.Supplier.tenant_id == current_user.tenant_id,
                    inventory_models.Supplier.code == f"PROV-{provider.id}",
                    inventory_models.Supplier.is_deleted == False
                )
            ).first()
            
            if existing_supplier:
                inventory_supplier_id = existing_supplier.id
            else:
                # Create new Supplier from Provider
                new_supplier = inventory_models.Supplier(
                    tenant_id=current_user.tenant_id,
                    name=provider.name,
                    code=f"PROV-{provider.id}",
                    notes=f"Auto-created from catalog provider: {provider.name}",
                )
                session.add(new_supplier)
                session.commit()
                session.refresh(new_supplier)
                inventory_supplier_id = new_supplier.id
    
    # 4. Create InventoryItem for this product (if inventory tracking enabled)
    tenant = session.exec(
        select(models.Tenant).where(models.Tenant.id == current_user.tenant_id)
    ).first()
    
    if tenant:
        # Generate SKU from catalog info
        sku_base = catalog_item.name[:20].upper().replace(" ", "-").replace(".", "")
        sku = f"CAT-{catalog_item.id}-{sku_base}"
        
        # Check if InventoryItem already exists (by SKU)
        existing_item = session.exec(
            select(inventory_models.InventoryItem).where(
                inventory_models.InventoryItem.tenant_id == current_user.tenant_id,
                inventory_models.InventoryItem.sku == sku,
                inventory_models.InventoryItem.is_deleted == False
            )
        ).first()
        
        if not existing_item:
            # Map catalog category to inventory category
            inv_category = "other"
            if category:
                cat_lower = category.lower()
                if "wine" in cat_lower or "beverage" in cat_lower or "drink" in cat_lower:
                    inv_category = "beverages"
                elif "food" in cat_lower or "main" in cat_lower or "starter" in cat_lower:
                    inv_category = "ingredients"
            
            # Create InventoryItem
            inventory_item = inventory_models.InventoryItem(
                tenant_id=current_user.tenant_id,
                sku=sku,
                name=product_name,
                description=catalog_item.description,
                unit="piece",  # Default to piece for catalog items
                category=inv_category,
                reorder_level=5,  # Default reorder level
                reorder_quantity=10,  # Default reorder quantity
                default_supplier_id=inventory_supplier_id,
                current_quantity=0,  # Start with 0 stock
                average_cost_cents=provider_product.price_cents if provider_product and provider_product.price_cents else 0,
            )
            session.add(inventory_item)
            session.commit()
    
    return tenant_product


@app.put("/tenant-products/{tenant_product_id}")
def update_tenant_product(
    tenant_product_id: int,
    product_update: models.TenantProductUpdate,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.TenantProduct:
    """Update a tenant product."""
    tenant_product = session.exec(
        select(models.TenantProduct).where(
            models.TenantProduct.id == tenant_product_id,
            models.TenantProduct.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not tenant_product:
        raise HTTPException(status_code=404, detail="Tenant product not found")
    
    if product_update.name is not None:
        tenant_product.name = product_update.name
    if product_update.price_cents is not None:
        tenant_product.price_cents = product_update.price_cents
    if product_update.is_active is not None:
        tenant_product.is_active = product_update.is_active
    
    session.add(tenant_product)
    session.commit()
    session.refresh(tenant_product)
    return tenant_product


@app.delete("/tenant-products/{tenant_product_id}")
def delete_tenant_product(
    tenant_product_id: int,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    """Delete a tenant product."""
    tenant_product = session.exec(
        select(models.TenantProduct).where(
            models.TenantProduct.id == tenant_product_id,
            models.TenantProduct.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not tenant_product:
        raise HTTPException(status_code=404, detail="Tenant product not found")
    
    session.delete(tenant_product)
    session.commit()
    return {"status": "deleted", "id": tenant_product_id}


# ============ FLOORS ============

@app.get("/floors")
def list_floors(
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> list[models.Floor]:
    """List all floors for this tenant."""
    return session.exec(
        select(models.Floor)
        .where(models.Floor.tenant_id == current_user.tenant_id)
        .order_by(models.Floor.sort_order, models.Floor.name)
    ).all()


@app.post("/floors")
def create_floor(
    floor_data: models.FloorCreate,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.Floor:
    """Create a new floor/zone."""
    # Auto-assign sort_order if not provided
    sort_order = floor_data.sort_order
    if sort_order is None:
        max_order = session.exec(
            select(models.Floor.sort_order)
            .where(models.Floor.tenant_id == current_user.tenant_id)
            .order_by(models.Floor.sort_order.desc())
        ).first()
        sort_order = (max_order or 0) + 1
    
    floor = models.Floor(
        name=floor_data.name,
        sort_order=sort_order,
        tenant_id=current_user.tenant_id
    )
    session.add(floor)
    session.commit()
    session.refresh(floor)
    return floor


@app.put("/floors/{floor_id}")
def update_floor(
    floor_id: int,
    floor_update: models.FloorUpdate,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.Floor:
    """Update a floor."""
    floor = session.exec(
        select(models.Floor).where(
            models.Floor.id == floor_id,
            models.Floor.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    
    if floor_update.name is not None:
        floor.name = floor_update.name
    if floor_update.sort_order is not None:
        floor.sort_order = floor_update.sort_order
    
    session.add(floor)
    session.commit()
    session.refresh(floor)
    return floor


@app.delete("/floors/{floor_id}")
def delete_floor(
    floor_id: int,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    """Delete a floor. Tables on this floor will have floor_id set to null."""
    floor = session.exec(
        select(models.Floor).where(
            models.Floor.id == floor_id,
            models.Floor.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    
    session.delete(floor)
    session.commit()
    return {"status": "deleted", "id": floor_id}


# ============ TABLES ============

@app.get("/tables")
def list_tables(
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> list[models.Table]:
    return session.exec(select(models.Table).where(models.Table.tenant_id == current_user.tenant_id)).all()


@app.get("/tables/with-status")
def list_tables_with_status(
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> list[dict]:
    """List tables with computed status based on active orders."""
    tables = session.exec(
        select(models.Table).where(models.Table.tenant_id == current_user.tenant_id)
    ).all()
    
    result = []
    for table in tables:
        # Check for active orders (pending, preparing, ready)
        active_order = session.exec(
            select(models.Order).where(
                models.Order.table_id == table.id,
                models.Order.status.in_(["pending", "preparing", "ready"])
            )
        ).first()
        
        status = "occupied" if active_order else "available"
        
        result.append({
            "id": table.id,
            "name": table.name,
            "token": table.token,
            "tenant_id": table.tenant_id,
            "floor_id": table.floor_id,
            "x_position": table.x_position,
            "y_position": table.y_position,
            "rotation": table.rotation,
            "shape": table.shape,
            "width": table.width,
            "height": table.height,
            "seat_count": table.seat_count,
            "status": status
        })
    
    return result


@app.post("/tables")
def create_table(
    table_data: models.TableCreate,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.Table:
    table = models.Table(
        name=table_data.name,
        tenant_id=current_user.tenant_id,
        floor_id=table_data.floor_id
    )
    session.add(table)
    session.commit()
    session.refresh(table)
    return table


@app.put("/tables/{table_id}")
def update_table(
    table_id: int,
    table_update: models.TableUpdate,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.Table:
    """Update table properties including canvas layout."""
    table = session.exec(
        select(models.Table).where(
            models.Table.id == table_id,
            models.Table.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    # Update all provided fields
    if table_update.name is not None:
        table.name = table_update.name
    if table_update.floor_id is not None:
        table.floor_id = table_update.floor_id
    if table_update.x_position is not None:
        table.x_position = table_update.x_position
    if table_update.y_position is not None:
        table.y_position = table_update.y_position
    if table_update.rotation is not None:
        table.rotation = table_update.rotation
    if table_update.shape is not None:
        table.shape = table_update.shape
    if table_update.width is not None:
        table.width = table_update.width
    if table_update.height is not None:
        table.height = table_update.height
    if table_update.seat_count is not None:
        table.seat_count = table_update.seat_count
    
    session.add(table)
    session.commit()
    session.refresh(table)
    return table


@app.delete("/tables/{table_id}")
def delete_table(
    table_id: int,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    table = session.exec(
        select(models.Table).where(
            models.Table.id == table_id,
            models.Table.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    session.delete(table)
    session.commit()
    return {"status": "deleted", "id": table_id}


# ============ INTERNAL VALIDATION (for ws-bridge) ============

@app.get("/internal/validate-table/{table_token}")
def validate_table_token(
    table_token: str,
    session: Session = Depends(get_session)
) -> dict:
    """Internal endpoint for ws-bridge to validate table tokens."""
    table = session.exec(select(models.Table).where(models.Table.token == table_token)).first()
    
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    return {
        "table_id": table.id,
        "tenant_id": table.tenant_id,
        "valid": True
    }


# ============ PUBLIC MENU ============

@app.get("/menu/{table_token}")
def get_menu(
    table_token: str,
    session: Session = Depends(get_session)
) -> dict:
    """Public endpoint - get menu for a table by its token."""
    table = session.exec(select(models.Table).where(models.Table.token == table_token)).first()
    
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    # Get products from TenantProduct (new catalog system) and Product (legacy)
    tenant_products = session.exec(
        select(models.TenantProduct).where(
            models.TenantProduct.tenant_id == table.tenant_id,
            models.TenantProduct.is_active == True
        )
    ).all()
    
    legacy_products = session.exec(
        select(models.Product).where(models.Product.tenant_id == table.tenant_id)
    ).all()
    
    tenant = session.exec(select(models.Tenant).where(models.Tenant.id == table.tenant_id)).first()
    
    # Combine products from both sources
    products_list = []
    
    # Add TenantProducts (from catalog)
    for tp in tenant_products:
        # Get image from provider product if available, otherwise use tenant product image
        image_filename = tp.image_filename
        provider_product = None
        catalog_item = None
        
        # Get catalog item for description
        catalog_item = session.exec(
            select(models.ProductCatalog).where(models.ProductCatalog.id == tp.catalog_id)
        ).first()
        
        # Get provider product for detailed wine info
        if tp.provider_product_id:
            provider_product = session.exec(
                select(models.ProviderProduct).where(models.ProviderProduct.id == tp.provider_product_id)
            ).first()
            if provider_product and provider_product.image_filename:
                provider = session.exec(
                    select(models.Provider).where(models.Provider.id == provider_product.provider_id)
                ).first()
                if provider:
                    # Construct path to provider image
                    image_filename = f"providers/{provider.token}/products/{provider_product.image_filename}"
        
        # Build product data with detailed wine information
        product_data = {
            "id": tp.id,
            "name": tp.name,
            "price_cents": tp.price_cents,
            "image_filename": image_filename,
            "tenant_id": tp.tenant_id,
            "ingredients": tp.ingredients,
            "_source": "tenant_product",  # Indicate this is from TenantProduct table
        }
        
        # Add catalog category, subcategory and description
        # Use codes for internationalization
        if catalog_item:
            if catalog_item.category:
                from .category_codes import get_category_code
                product_data["category"] = catalog_item.category
                product_data["category_code"] = get_category_code(catalog_item.category)
            if catalog_item.subcategory:
                product_data["subcategory"] = catalog_item.subcategory
            if catalog_item.description:
                product_data["description"] = catalog_item.description
        
        # Extract wine type - use API category ID first, but check description for conflicts
        wine_type = None
        description_wine_type = None
        
        # Get description text first to check for conflicts
        description_text = ""
        if provider_product and provider_product.detailed_description:
            description_text = provider_product.detailed_description.lower()
        elif catalog_item and catalog_item.description:
            description_text = catalog_item.description.lower()
        
        # Extract wine type from description
        if description_text:
            if "vino blanco" in description_text:
                description_wine_type = "White Wine"
            elif "vino tinto" in description_text:
                description_wine_type = "Red Wine"
            elif "espumoso" in description_text or "cava" in description_text:
                description_wine_type = "Sparkling Wine"
            elif "rosado" in description_text or "rosé" in description_text:
                description_wine_type = "Rosé Wine"
        
        # First, use the category ID from provider product (direct from API)
        category_wine_type = None
        if provider_product and provider_product.wine_category_id:
            from app.seeds.wine_import import get_category_name
            category_wine_type = get_category_name(provider_product.wine_category_id, None)
            # If we got a valid wine type, use it
            if category_wine_type and category_wine_type == "Wine":
                category_wine_type = None
        
        # If description explicitly contradicts category, trust description (more reliable)
        if description_wine_type and category_wine_type:
            if description_wine_type != category_wine_type:
                # Description contradicts category - trust description
                wine_type = description_wine_type
            else:
                # They match - use category (from API)
                wine_type = category_wine_type
        elif description_wine_type:
            # Only description available
            wine_type = description_wine_type
        elif category_wine_type:
            # Only category available
            wine_type = category_wine_type
        
        # If still no wine type, try subcategory as last resort
        if not wine_type and catalog_item and catalog_item.subcategory:
            # Subcategory format: "Red Wine - D.O. Empordà - Wine by Glass"
            # Extract first part before first " - "
            subcategory_parts = catalog_item.subcategory.split(" - ")
            first_part = subcategory_parts[0].strip()
            # Check if it's a known wine type
            wine_types = ["Red Wine", "White Wine", "Sparkling Wine", "Rosé Wine", "Sweet Wine", "Fortified Wine"]
            if first_part in wine_types:
                wine_type = first_part
            # Also check for Spanish terms
            elif "Red" in first_part or "Tinto" in first_part or "Tintos" in first_part:
                wine_type = "Red Wine"
            elif "White" in first_part or "Blanco" in first_part or "Blancos" in first_part:
                wine_type = "White Wine"
            elif "Sparkling" in first_part or "Espumoso" in first_part or "Cava" in first_part:
                wine_type = "Sparkling Wine"
            elif "Rosé" in first_part or "Rosado" in first_part:
                wine_type = "Rosé Wine"
        
        # Now build subcategory_codes AFTER wine_type is determined
        # This ensures wine_type takes precedence over subcategory string
        subcategory_codes = []
        
        # First, extract all non-wine-type codes from subcategory (e.g., WINE_BY_GLASS)
        if catalog_item and catalog_item.subcategory:
            from .category_codes import get_all_subcategory_codes, extract_wine_type_code
            all_codes = get_all_subcategory_codes(catalog_item.subcategory)
            # Remove wine type codes - we'll add the correct one based on wine_type
            wine_type_codes = ["WINE_RED", "WINE_WHITE", "WINE_SPARKLING", "WINE_ROSE", "WINE_SWEET", "WINE_FORTIFIED"]
            for code in all_codes:
                if code not in wine_type_codes:
                    subcategory_codes.append(code)
        
        # Add the correct wine type code based on determined wine_type
        if wine_type:
            product_data["wine_type"] = wine_type
            from .category_codes import extract_wine_type_code
            wine_type_code = extract_wine_type_code(wine_type)
            if wine_type_code and wine_type_code not in subcategory_codes:
                subcategory_codes.append(wine_type_code)
        
        # Set subcategory_codes if we have any
        if subcategory_codes:
            product_data["subcategory_codes"] = subcategory_codes
        
        # Add detailed wine information from provider product
        if provider_product:
            if provider_product.detailed_description:
                product_data["detailed_description"] = provider_product.detailed_description
            if provider_product.country:
                product_data["country"] = provider_product.country
            if provider_product.region:
                product_data["region"] = provider_product.region
            if provider_product.wine_style:
                product_data["wine_style"] = provider_product.wine_style
            if provider_product.vintage:
                product_data["vintage"] = provider_product.vintage
            if provider_product.winery:
                product_data["winery"] = provider_product.winery
            if provider_product.grape_variety:
                product_data["grape_variety"] = provider_product.grape_variety
            if provider_product.aromas:
                product_data["aromas"] = provider_product.aromas
            if provider_product.elaboration:
                product_data["elaboration"] = provider_product.elaboration
        
        products_list.append(product_data)
    
    # Add legacy Products (for backward compatibility)
    for p in legacy_products:
        product_data = {
            "id": p.id,
            "name": p.name,
            "price_cents": p.price_cents,
            "image_filename": p.image_filename,
            "tenant_id": p.tenant_id,
            "ingredients": p.ingredients,
            "_source": "product",  # Indicate this is from legacy Product table
        }
        
        # Add category and subcategory if they exist
        if p.category:
            product_data["category"] = p.category
            from .category_codes import get_category_code
            product_data["category_code"] = get_category_code(p.category)
        
        if p.subcategory:
            product_data["subcategory"] = p.subcategory
            from .category_codes import get_all_subcategory_codes
            subcategory_codes = get_all_subcategory_codes(p.subcategory)
            if subcategory_codes:
                product_data["subcategory_codes"] = subcategory_codes
        
        products_list.append(product_data)
    
    return {
        "table_name": table.name,
        "table_id": table.id,
        "tenant_id": table.tenant_id,  # For WebSocket connection
        "tenant_name": tenant.name if tenant else "Unknown",
        "tenant_logo": tenant.logo_filename if tenant else None,
        "tenant_description": tenant.description if tenant else None,
        "tenant_phone": tenant.phone if tenant else None,
        "tenant_whatsapp": tenant.whatsapp if tenant else None,
        "tenant_address": tenant.address if tenant else None,
        "tenant_website": tenant.website if tenant else None,
        "tenant_currency": tenant.currency if tenant else None,
        "tenant_stripe_publishable_key": tenant.stripe_publishable_key if tenant else None,
        "products": products_list,
    }


@app.get("/menu/{table_token}/order")
def get_current_order(
    table_token: str,
    session_id: str | None = Query(None, description="Session identifier for order isolation"),
    session: Session = Depends(get_session)
) -> dict:
    """Public endpoint - get current active order for a table (if any)."""
    table = session.exec(select(models.Table).where(models.Table.token == table_token)).first()
    
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    # If session_id provided, look for order with matching session_id
    if session_id:
        potential_orders = session.exec(
            select(models.Order).where(
                models.Order.table_id == table.id,
                models.Order.session_id == session_id,
                models.Order.status != models.OrderStatus.paid
            ).order_by(models.Order.created_at.desc())
        ).all()
    else:
        # Backward compatibility: find any unpaid order (old behavior)
        potential_orders = session.exec(
            select(models.Order).where(
                models.Order.table_id == table.id,
                models.Order.status != models.OrderStatus.paid
            ).order_by(models.Order.created_at.desc())
        ).all()
    
    # Filter out orders with payment confirmation in notes
    # Also explicitly check status to ensure we don't return paid orders
    active_order = None
    for order in potential_orders:
        # Explicitly check if order is paid (defensive check)
        if order.status == models.OrderStatus.paid:
            continue
        if "[PAID:" not in (order.notes or ""):
            active_order = order
            break
    
    if not active_order:
        return {"order": None}
    
    # Get order items (exclude removed items for customer view)
    # Order by ID descending so newest items appear first (for customer view)
    items = session.exec(
        select(models.OrderItem).where(
            models.OrderItem.order_id == active_order.id,
            models.OrderItem.removed_by_customer == False
        ).order_by(models.OrderItem.id.desc())
    ).all()
    
    # Compute order status from items
    all_items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == active_order.id)).all()
    computed_status = compute_order_status_from_items(all_items)
    
    return {
        "order": {
            "id": active_order.id,
            "status": computed_status.value,
            "notes": active_order.notes,
            "session_id": active_order.session_id,
            "customer_name": active_order.customer_name,
            "created_at": active_order.created_at.isoformat(),
            "items": [
                {
                    "id": item.id,
                    "product_id": item.product_id,
                    "product_name": item.product_name,
                    "quantity": item.quantity,
                    "price_cents": item.price_cents,
                    "notes": item.notes,
                    "status": item.status.value if hasattr(item.status, 'value') else str(item.status)
                }
                for item in items
            ],
            "total_cents": sum(item.price_cents * item.quantity for item in items)
        }
    }


@app.post("/menu/{table_token}/order")
def create_order(
    table_token: str,
    order_data: models.OrderCreate,
    session: Session = Depends(get_session)
) -> dict:
    """Public endpoint - create or add to order for a table."""
    table = session.exec(select(models.Table).where(models.Table.token == table_token)).first()
    
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    if not order_data.items:
        raise HTTPException(status_code=400, detail="Order must have at least one item")
    
    # DEBUG: Log all orders for this table
    all_orders = session.exec(
        select(models.Order).where(models.Order.table_id == table.id)
    ).all()
    print(f"\n{'='*60}")
    print(f"[DEBUG] POST /menu/{table_token}/order")
    print(f"[DEBUG] Table: id={table.id}, name={table.name}")
    print(f"[DEBUG] All orders for this table:")
    for o in all_orders:
        has_paid_note = "[PAID:" in (o.notes or "")
        print(f"  - Order #{o.id}: status={o.status!r}, has_paid_note={has_paid_note}")
    
    # Check for existing unpaid order for this table and session (reuse until paid)
    # If session_id provided, only look for orders with matching session_id
    # Otherwise, fall back to old behavior (any unpaid order for table)
    if order_data.session_id:
        potential_orders = session.exec(
            select(models.Order).where(
                models.Order.table_id == table.id,
                models.Order.session_id == order_data.session_id,
                models.Order.status != models.OrderStatus.paid
            ).order_by(models.Order.created_at.desc())
        ).all()
        print(f"[DEBUG] Looking for orders with session_id={order_data.session_id}")
    else:
        # Backward compatibility: find any unpaid order (old behavior)
        potential_orders = session.exec(
            select(models.Order).where(
                models.Order.table_id == table.id,
                models.Order.status != models.OrderStatus.paid
            ).order_by(models.Order.created_at.desc())
        ).all()
        print(f"[DEBUG] No session_id provided, using backward compatibility mode")
    
    # Filter out orders that have payment confirmation in notes (edge case for corrupted data)
    # Also explicitly check status to prevent adding items to paid orders
    existing_order = None
    for order in potential_orders:
        # Explicitly check if order is paid (defensive check)
        if order.status == models.OrderStatus.paid:
            print(f"[DEBUG] Skipping order #{order.id} - status is paid")
            continue
        
        has_paid_note = "[PAID:" in (order.notes or "")
        if not has_paid_note:
            existing_order = order
            break
        else:
            print(f"[DEBUG] Skipping order #{order.id} - has [PAID:] in notes despite status={order.status!r}")
    
    print(f"[DEBUG] Query result after filtering: {existing_order}")
    if existing_order:
        # Final safety check: never reuse a paid order
        if existing_order.status == models.OrderStatus.paid:
            print(f"[DEBUG] Found order #{existing_order.id} is paid - will create new order instead")
            existing_order = None
        else:
            print(f"[DEBUG] Found existing order #{existing_order.id} with status={existing_order.status!r}")
    else:
        print(f"[DEBUG] No existing unpaid order found - will create new one")
    
    is_new_order = existing_order is None
    
    if is_new_order:
        # Generate session_id if not provided (for backward compatibility)
        session_id = order_data.session_id
        if not session_id:
            session_id = str(uuid4())
            print(f"[DEBUG] Generated new session_id: {session_id}")
        
        # Create new order
        order = models.Order(
            tenant_id=table.tenant_id,
            table_id=table.id,
            session_id=session_id,
            customer_name=order_data.customer_name,
            notes=order_data.notes
        )
        session.add(order)
        session.commit()
        session.refresh(order)
        print(f"[DEBUG] Created NEW order #{order.id} with session_id={session_id}, customer_name={order_data.customer_name}")
    else:
        order = existing_order
        print(f"[DEBUG] REUSING existing order #{order.id}")
        # Append notes if provided
        if order_data.notes:
            order.notes = f"{order.notes or ''}\n{order_data.notes}".strip()
    
    print(f"[DEBUG] Final order #{order.id}, status={order.status!r}")
    print(f"{'='*60}\n")
    
    # Add order items
    for item in order_data.items:
        # Use source indicator if provided, otherwise try TenantProduct first, then legacy Product
        product_name = None
        price_cents = None
        
        if item.source == "tenant_product":
            # Explicitly look up TenantProduct
            tenant_product = session.exec(
                select(models.TenantProduct).where(
                    models.TenantProduct.id == item.product_id,
                    models.TenantProduct.tenant_id == table.tenant_id
                )
            ).first()
            if not tenant_product:
                raise HTTPException(status_code=400, detail=f"TenantProduct {item.product_id} not found")
            product_name = tenant_product.name
            price_cents = tenant_product.price_cents
        elif item.source == "product":
            # Explicitly look up legacy Product
            product = session.exec(
                select(models.Product).where(
                    models.Product.id == item.product_id,
                    models.Product.tenant_id == table.tenant_id
                )
            ).first()
            if not product:
                raise HTTPException(status_code=400, detail=f"Product {item.product_id} not found")
            product_name = product.name
            price_cents = product.price_cents
        else:
            # No source specified - try TenantProduct first, then fallback to legacy Product
            # This maintains backward compatibility
            tenant_product = session.exec(
                select(models.TenantProduct).where(
                    models.TenantProduct.id == item.product_id,
                    models.TenantProduct.tenant_id == table.tenant_id
                )
            ).first()
            
            if tenant_product:
                product_name = tenant_product.name
                price_cents = tenant_product.price_cents
            else:
                # Fallback to legacy Product table
                product = session.exec(
                    select(models.Product).where(
                        models.Product.id == item.product_id,
                        models.Product.tenant_id == table.tenant_id
                    )
                ).first()
                
                if not product:
                    raise HTTPException(status_code=400, detail=f"Product {item.product_id} not found")
                
                product_name = product.name
                price_cents = product.price_cents
        
        # Check if this product already exists in the order (only active, non-removed items)
        # Only merge if the existing item is NOT delivered (to preserve item-level status tracking)
        existing_item = session.exec(
            select(models.OrderItem).where(
                models.OrderItem.order_id == order.id,
                models.OrderItem.product_id == item.product_id,
                models.OrderItem.removed_by_customer == False,  # Only check active items
                models.OrderItem.status != models.OrderItemStatus.delivered  # Don't merge with delivered items
            )
        ).first()
        
        if existing_item:
            # Increment quantity (item is active and not delivered)
            existing_item.quantity += item.quantity
            if item.notes:
                existing_item.notes = f"{existing_item.notes or ''}, {item.notes}".strip(", ")
            session.add(existing_item)
        else:
            # Create new order item with default status
            # This happens when:
            # 1. No existing item found, OR
            # 2. Existing item is delivered (we create a new item to track separately)
            order_item = models.OrderItem(
                order_id=order.id,
                product_id=item.product_id,
                product_name=product_name,
                quantity=item.quantity,
                price_cents=price_cents,
                notes=item.notes,
                status=models.OrderItemStatus.pending  # New items start as pending
            )
            session.add(order_item)
    
    # After adding items, recompute order status from all items (if not paid or cancelled)
    # This ensures correct status like 'partially_delivered' when there are both delivered and undelivered items
    if order.status not in [models.OrderStatus.paid, models.OrderStatus.cancelled]:
        all_items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order.id)).all()
        computed_status = compute_order_status_from_items(all_items)
        order.status = computed_status
        print(f"[DEBUG] Recomputed order status from items: {computed_status.value}")
    
    session.commit()
    session.refresh(order)
    
    # Auto-deduct inventory if enabled for tenant
    tenant = session.get(models.Tenant, table.tenant_id)
    if tenant and tenant.inventory_tracking_enabled:
        try:
            deduct_inventory_for_order(session, order, tenant)
            session.commit()
            logger.info(f"Inventory deducted for order #{order.id}")
        except Exception as e:
            # Log but don't fail the order - inventory can go negative
            logger.warning(f"Inventory deduction warning for order #{order.id}: {e}")
    
    # Publish to Redis for real-time updates
    publish_order_update(table.tenant_id, {
        "type": "new_order" if is_new_order else "items_added",
        "order_id": order.id,
        "table_name": table.name,
        "status": order.status.value,
        "created_at": order.created_at.isoformat()
    }, table_id=table.id)
    
    return {
        "status": "created" if is_new_order else "updated",
        "order_id": order.id,
        "session_id": order.session_id,
        "customer_name": order.customer_name
    }


# ============ ORDERS (Protected) ============

def compute_order_status_from_items(items: list[models.OrderItem]) -> models.OrderStatus:
    """Compute order status from item statuses (single source of truth)."""
    if not items:
        return models.OrderStatus.pending
    
    # Filter out removed items for status computation (removed by customer OR staff)
    active_items = [item for item in items if not item.removed_by_customer and item.removed_by_user_id is None]
    if not active_items:
        return models.OrderStatus.cancelled
    
    # Check if all items are delivered
    all_delivered = all(item.status == models.OrderItemStatus.delivered for item in active_items)
    if all_delivered:
        return models.OrderStatus.completed
    
    # Check if some items are delivered (partial delivery)
    any_delivered = any(item.status == models.OrderItemStatus.delivered for item in active_items)
    if any_delivered:
        return models.OrderStatus.partially_delivered
    
    # Check if all items are ready
    all_ready = all(item.status == models.OrderItemStatus.ready for item in active_items)
    if all_ready:
        return models.OrderStatus.ready
    
    # Check if any item is preparing or ready
    any_preparing_or_ready = any(
        item.status in [models.OrderItemStatus.preparing, models.OrderItemStatus.ready] 
        for item in active_items
    )
    if any_preparing_or_ready:
        return models.OrderStatus.preparing
    
    # All items are pending
    return models.OrderStatus.pending


@app.get("/orders")
def list_orders(
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    include_removed: bool = Query(False, description="Include removed items in response"),
    session: Session = Depends(get_session)
) -> list[dict]:
    orders = session.exec(
        select(models.Order).where(models.Order.tenant_id == current_user.tenant_id).order_by(models.Order.created_at.desc())
    ).all()
    
    result = []
    for order in orders:
        table = session.exec(select(models.Table).where(models.Table.id == order.table_id)).first()
        
        # Get items, optionally including removed ones
        if include_removed:
            items = session.exec(
                select(models.OrderItem)
                .where(models.OrderItem.order_id == order.id)
                .order_by(models.OrderItem.removed_by_customer.asc(), models.OrderItem.created_at.asc())
            ).all()
        else:
            items = session.exec(
                select(models.OrderItem)
                .where(
                    models.OrderItem.order_id == order.id,
                    models.OrderItem.removed_by_customer == False
                )
            ).all()
        
        # Compute order status from items (if not paid or cancelled)
        computed_status = order.status
        if order.status not in [models.OrderStatus.paid, models.OrderStatus.cancelled]:
            computed_status = compute_order_status_from_items(
                session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order.id)).all()
            )
        
        # Get all items for removed count calculation
        all_items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order.id)).all()
        
        # Calculate total from active items only (exclude items removed by customer OR staff)
        active_items = [item for item in all_items if not item.removed_by_customer and item.removed_by_user_id is None]
        total_cents = sum(item.price_cents * item.quantity for item in active_items)
        
        result.append({
            "id": order.id,
            "table_name": table.name if table else "Unknown",
            "status": computed_status.value,
            "notes": order.notes,
            "session_id": order.session_id,
            "customer_name": order.customer_name,
            "created_at": order.created_at.isoformat(),
            "paid_at": order.paid_at.isoformat() if order.paid_at else None,
            "payment_method": order.payment_method,
            "items": [
                {
                    "id": item.id,
                    "product_name": item.product_name,
                    "quantity": item.quantity,
                    "price_cents": item.price_cents,
                    "notes": item.notes,
                    "status": item.status.value if hasattr(item.status, 'value') else str(item.status),
                    "removed_by_customer": item.removed_by_customer,
                    "removed_at": item.removed_at.isoformat() if item.removed_at else None,
                    "removed_reason": item.removed_reason
                }
                for item in items
            ],
            "total_cents": total_cents,
            "removed_items_count": len([item for item in all_items if item.removed_by_customer])
        })
    
    return result


@app.put("/orders/{order_id}/status")
def update_order_status(
    order_id: int,
    status_update: models.OrderStatusUpdate,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    order = session.exec(
        select(models.Order).where(
            models.Order.id == order_id,
            models.Order.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Update order status
    order.status = status_update.status
    
    # For backward compatibility: if updating order-level status, update all active items
    # Map order status to item status
    items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order_id)).all()
    active_items = [item for item in items if not item.removed_by_customer]
    
    if active_items:
        status_mapping = {
            models.OrderStatus.pending: models.OrderItemStatus.pending,
            models.OrderStatus.preparing: models.OrderItemStatus.preparing,
            models.OrderStatus.ready: models.OrderItemStatus.ready,
            models.OrderStatus.completed: models.OrderItemStatus.delivered,  # completed = all items delivered
            models.OrderStatus.partially_delivered: models.OrderItemStatus.delivered,  # Partial delivery
        }
        
        item_status = status_mapping.get(status_update.status)
        if item_status:
            for item in active_items:
                # Only update if item is not already delivered
                if item.status != models.OrderItemStatus.delivered:
                    item.status = item_status
                    item.status_updated_at = datetime.now(timezone.utc)
                    if item_status == models.OrderItemStatus.ready:
                        item.prepared_by_user_id = current_user.id
                    elif item_status == models.OrderItemStatus.delivered:
                        item.delivered_by_user_id = current_user.id
                    session.add(item)
    
    session.add(order)
    session.commit()
    
    # Publish status update
    table = session.exec(select(models.Table).where(models.Table.id == order.table_id)).first()
    publish_order_update(current_user.tenant_id, {
        "type": "status_update",
        "order_id": order.id,
        "table_name": table.name if table else "Unknown",
        "status": order.status.value
    }, table_id=order.table_id)
    
    return {"status": "updated", "order_id": order.id, "new_status": order.status.value}


@app.put("/orders/{order_id}/mark-paid")
def mark_order_paid(
    order_id: int,
    payment_data: models.OrderMarkPaid,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    """Mark order as paid manually (for cash/terminal payments)."""
    order = session.exec(
        select(models.Order).where(
            models.Order.id == order_id,
            models.Order.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Validation: Order must be completed (all items delivered) before marking as paid
    if order.status != models.OrderStatus.completed:
        raise HTTPException(
            status_code=400, 
            detail=f"Order must be completed before marking as paid. Current status: {order.status.value}"
        )
    
    # Mark as paid
    order.status = models.OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    order.paid_by_user_id = current_user.id
    order.payment_method = payment_data.payment_method
    
    session.add(order)
    session.commit()
    
    # Publish update
    table = session.exec(select(models.Table).where(models.Table.id == order.table_id)).first()
    publish_order_update(current_user.tenant_id, {
        "type": "order_paid",
        "order_id": order.id,
        "table_name": table.name if table else "Unknown",
        "payment_method": payment_data.payment_method
    }, table_id=order.table_id)
    
    return {
        "status": "paid",
        "order_id": order.id,
        "payment_method": payment_data.payment_method,
        "paid_at": order.paid_at.isoformat()
    }


@app.put("/orders/{order_id}/items/{item_id}/status")
def update_order_item_status(
    order_id: int,
    item_id: int,
    status_update: models.OrderItemStatusUpdate,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    """Update individual order item status (restaurant staff)."""
    order = session.exec(
        select(models.Order).where(
            models.Order.id == order_id,
            models.Order.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    item = session.exec(
        select(models.OrderItem).where(
            models.OrderItem.id == item_id,
            models.OrderItem.order_id == order_id
        )
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")
    
    # Update item status
    old_status = item.status
    item.status = status_update.status
    item.status_updated_at = datetime.now(timezone.utc)
    
    # Track who prepared/delivered
    if status_update.status == models.OrderItemStatus.ready:
        item.prepared_by_user_id = status_update.user_id or current_user.id
    elif status_update.status == models.OrderItemStatus.delivered:
        item.delivered_by_user_id = status_update.user_id or current_user.id
    
    session.add(item)
    
    # Recompute order status from items
    all_items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order_id)).all()
    if order.status not in [models.OrderStatus.paid, models.OrderStatus.cancelled]:
        order.status = compute_order_status_from_items(all_items)
    
    session.add(order)
    session.commit()
    
    # Publish update
    table = session.exec(select(models.Table).where(models.Table.id == order.table_id)).first()
    publish_order_update(current_user.tenant_id, {
        "type": "item_status_update",
        "order_id": order.id,
        "item_id": item.id,
        "old_status": old_status.value if hasattr(old_status, 'value') else str(old_status),
        "new_status": item.status.value,
        "status": order.status.value if hasattr(order.status, 'value') else str(order.status),  # Include computed order status
        "table_name": table.name if table else "Unknown"
    }, table_id=order.table_id)
    
    return {
        "status": "updated",
        "order_id": order.id,
        "item_id": item.id,
        "item_status": item.status.value,
        "order_status": order.status.value
    }


@app.put("/orders/{order_id}/items/{item_id}/reset-status")
def reset_item_status(
    order_id: int,
    item_id: int,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    """Reset item status from preparing to pending (restaurant staff only)."""
    order = session.exec(
        select(models.Order).where(
            models.Order.id == order_id,
            models.Order.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    item = session.exec(
        select(models.OrderItem).where(
            models.OrderItem.id == item_id,
            models.OrderItem.order_id == order_id
        )
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")
    
    # Validation: Can only reset from preparing to pending
    if item.status != models.OrderItemStatus.preparing:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reset status from {item.status.value}. Only 'preparing' items can be reset to 'pending'."
        )
    
    # Reset status
    old_status = item.status
    item.status = models.OrderItemStatus.pending
    item.status_updated_at = datetime.now(timezone.utc)
    item.prepared_by_user_id = None  # Clear prepared_by since we're resetting
    
    session.add(item)
    
    # Recompute order status
    all_items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order_id)).all()
    if order.status not in [models.OrderStatus.paid, models.OrderStatus.cancelled]:
        order.status = compute_order_status_from_items(all_items)
    
    session.add(order)
    session.commit()
    
    # Publish update
    table = session.exec(select(models.Table).where(models.Table.id == order.table_id)).first()
    publish_order_update(current_user.tenant_id, {
        "type": "item_status_update",
        "order_id": order.id,
        "item_id": item.id,
        "old_status": old_status.value,
        "new_status": item.status.value,
        "status": order.status.value,
        "table_name": table.name if table else "Unknown"
    }, table_id=order.table_id)
    
    return {
        "status": "reset",
        "order_id": order.id,
        "item_id": item.id,
        "old_status": old_status.value,
        "new_status": item.status.value,
        "order_status": order.status.value
    }


@app.put("/orders/{order_id}/items/{item_id}/cancel")
def cancel_order_item_staff(
    order_id: int,
    item_id: int,
    cancel_data: models.OrderItemCancel,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    """Cancel order item (restaurant staff) - requires reason if item is ready."""
    order = session.exec(
        select(models.Order).where(
            models.Order.id == order_id,
            models.Order.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    item = session.exec(
        select(models.OrderItem).where(
            models.OrderItem.id == item_id,
            models.OrderItem.order_id == order_id
        )
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")
    
    # Validation: Cannot cancel delivered items
    if item.status == models.OrderItemStatus.delivered:
        raise HTTPException(status_code=400, detail="Cannot cancel delivered items")
    
    # Validation: If item is ready, reason is required (for tax authorities)
    if item.status == models.OrderItemStatus.ready and not cancel_data.reason:
        raise HTTPException(
            status_code=400,
            detail="Reason is required when cancelling ready items (required for tax reporting)"
        )
    
    # Cancel item (soft delete)
    item.removed_by_customer = False  # Removed by staff, not customer
    item.removed_by_user_id = current_user.id
    item.removed_at = datetime.now(timezone.utc)
    item.removed_reason = cancel_data.reason
    item.cancelled_reason = cancel_data.reason  # Store for tax reporting
    item.status = models.OrderItemStatus.cancelled
    
    session.add(item)
    
    # Recompute order status and total
    all_items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order_id)).all()
    if order.status not in [models.OrderStatus.paid, models.OrderStatus.cancelled]:
        order.status = compute_order_status_from_items(all_items)
    
    session.add(order)
    session.commit()
    
    # Calculate new total
    active_items = [i for i in all_items if not i.removed_by_customer and i.removed_by_user_id is None]
    new_total = sum(i.price_cents * i.quantity for i in active_items)
    
    # Publish update
    table = session.exec(select(models.Table).where(models.Table.id == order.table_id)).first()
    publish_order_update(current_user.tenant_id, {
        "type": "item_cancelled",
        "order_id": order.id,
        "item_id": item.id,
        "cancelled_by": "staff",
        "table_name": table.name if table else "Unknown",
        "new_total_cents": new_total
    }, table_id=order.table_id)
    
    return {
        "status": "item_cancelled",
        "order_id": order.id,
        "item_id": item.id,
        "new_total_cents": new_total
    }


@app.put("/orders/{order_id}/items/{item_id}")
def update_order_item_staff(
    order_id: int,
    item_id: int,
    item_update: models.OrderItemStaffUpdate,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> dict:
    """Update order item (restaurant staff) - can modify any item except delivered."""
    order = session.exec(
        select(models.Order).where(
            models.Order.id == order_id,
            models.Order.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    item = session.exec(
        select(models.OrderItem).where(
            models.OrderItem.id == item_id,
            models.OrderItem.order_id == order_id
        )
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")
    
    # Validation: Cannot modify delivered items
    if item.status == models.OrderItemStatus.delivered:
        raise HTTPException(status_code=400, detail="Cannot modify delivered items")
    
    # Update item
    if item_update.quantity is not None:
        if item_update.quantity <= 0:
            # Remove item (soft delete)
            item.removed_by_customer = False
            item.removed_by_user_id = current_user.id
            item.removed_at = datetime.now(timezone.utc)
            item.status = models.OrderItemStatus.cancelled
        else:
            item.quantity = item_update.quantity
            item.modified_by_user_id = current_user.id
            item.modified_at = datetime.now(timezone.utc)
    
    if item_update.notes is not None:
        item.notes = item_update.notes
        item.modified_by_user_id = current_user.id
        item.modified_at = datetime.now(timezone.utc)
    
    session.add(item)
    
    # Recompute order status and total
    all_items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order_id)).all()
    if order.status not in [models.OrderStatus.paid, models.OrderStatus.cancelled]:
        order.status = compute_order_status_from_items(all_items)
    
    session.add(order)
    session.commit()
    
    # Calculate new total
    active_items = [i for i in all_items if not i.removed_by_customer and i.removed_by_user_id is None]
    new_total = sum(i.price_cents * i.quantity for i in active_items)
    
    # Publish update
    table = session.exec(select(models.Table).where(models.Table.id == order.table_id)).first()
    publish_order_update(current_user.tenant_id, {
        "type": "item_updated",
        "order_id": order.id,
        "item_id": item.id,
        "new_quantity": item.quantity,
        "table_name": table.name if table else "Unknown",
        "new_total_cents": new_total
    }, table_id=order.table_id)
    
    return {
        "status": "item_updated",
        "order_id": order.id,
        "item_id": item.id,
        "new_quantity": item.quantity,
        "new_total_cents": new_total
    }


@app.delete("/orders/{order_id}/items/{item_id}")
def remove_order_item_staff(
    order_id: int,
    item_id: int,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    reason: str | None = Query(None, description="Required reason when removing ready items"),
    session: Session = Depends(get_session)
) -> dict:
    """Remove order item (restaurant staff) - requires reason if item is ready."""
    order = session.exec(
        select(models.Order).where(
            models.Order.id == order_id,
            models.Order.tenant_id == current_user.tenant_id
        )
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    item = session.exec(
        select(models.OrderItem).where(
            models.OrderItem.id == item_id,
            models.OrderItem.order_id == order_id
        )
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")
    
    # Validation: Cannot remove delivered items
    if item.status == models.OrderItemStatus.delivered:
        raise HTTPException(status_code=400, detail="Cannot remove delivered items")
    
    # Validation: If item is ready, reason is required
    if item.status == models.OrderItemStatus.ready:
        if not reason:
            raise HTTPException(
                status_code=400,
                detail="Reason is required when removing ready items (required for tax reporting)"
            )
    
    # Soft delete
    item.removed_by_customer = False
    item.removed_by_user_id = current_user.id
    item.removed_at = datetime.now(timezone.utc)
    item.removed_reason = reason
    item.cancelled_reason = reason
    item.status = models.OrderItemStatus.cancelled
    
    session.add(item)
    
    # Recompute order status and total
    all_items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order_id)).all()
    if order.status not in [models.OrderStatus.paid, models.OrderStatus.cancelled]:
        order.status = compute_order_status_from_items(all_items)
    
    session.add(order)
    session.commit()
    
    # Calculate new total
    active_items = [i for i in all_items if not i.removed_by_customer and i.removed_by_user_id is None]
    new_total = sum(i.price_cents * i.quantity for i in active_items)
    
    # Publish update
    table = session.exec(select(models.Table).where(models.Table.id == order.table_id)).first()
    publish_order_update(current_user.tenant_id, {
        "type": "item_removed",
        "order_id": order.id,
        "item_id": item.id,
        "removed_by": "staff",
        "table_name": table.name if table else "Unknown",
        "new_total_cents": new_total
    }, table_id=order.table_id)
    
    return {
        "status": "item_removed",
        "order_id": order.id,
        "removed_item_id": item.id,
        "new_total_cents": new_total
    }


# ============ ORDER MODIFICATION (Public - Customer) ============

@app.delete("/menu/{table_token}/order/{order_id}/items/{item_id}")
def remove_order_item(
    table_token: str,
    order_id: int,
    item_id: int,
    session_id: str | None = Query(None, description="Session identifier for order validation"),
    reason: str | None = Query(None, description="Optional reason for removal"),
    session: Session = Depends(get_session)
) -> dict:
    """Remove item from order (soft delete - customer)."""
    table = session.exec(select(models.Table).where(models.Table.token == table_token)).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    order = session.exec(
        select(models.Order).where(
            models.Order.id == order_id,
            models.Order.table_id == table.id
        )
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Security: Validate that order belongs to this session
    if session_id and order.session_id and order.session_id != session_id:
        raise HTTPException(status_code=403, detail="Order does not belong to this session")
    
    item = session.exec(
        select(models.OrderItem).where(
            models.OrderItem.id == item_id,
            models.OrderItem.order_id == order_id
        )
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")
    
    # Validation: Cannot remove items that are already being prepared or delivered
    if item.status in [models.OrderItemStatus.delivered, models.OrderItemStatus.preparing, models.OrderItemStatus.ready]:
        status_label = {
            models.OrderItemStatus.delivered: "delivered",
            models.OrderItemStatus.preparing: "being prepared",
            models.OrderItemStatus.ready: "ready"
        }.get(item.status, "in progress")
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot remove items that are {status_label}. Only pending items can be removed."
        )
    
    # Soft delete: Mark as removed (NEVER actually delete)
    item.removed_by_customer = True
    item.removed_at = datetime.now(timezone.utc)
    item.removed_reason = reason
    item.status = models.OrderItemStatus.cancelled
    
    session.add(item)
    
    # Recompute order status and total
    all_items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order_id)).all()
    if order.status not in [models.OrderStatus.paid, models.OrderStatus.cancelled]:
        order.status = compute_order_status_from_items(all_items)
    
    session.add(order)
    session.commit()
    
    # Calculate new total (exclude removed items)
    active_items = [i for i in all_items if not i.removed_by_customer]
    new_total = sum(i.price_cents * i.quantity for i in active_items)
    
    # Publish update
    publish_order_update(order.tenant_id, {
        "type": "item_removed",
        "order_id": order.id,
        "item_id": item.id,
        "table_name": table.name,
        "new_total_cents": new_total
    }, table_id=order.table_id)
    
    return {
        "status": "item_removed",
        "order_id": order.id,
        "removed_item_id": item.id,
        "new_total_cents": new_total,
        "items_remaining": len(active_items)
    }


@app.put("/menu/{table_token}/order/{order_id}/items/{item_id}")
def update_order_item_quantity(
    table_token: str,
    order_id: int,
    item_id: int,
    item_update: models.OrderItemUpdate,
    session_id: str | None = Query(None, description="Session identifier for order validation"),
    session: Session = Depends(get_session)
) -> dict:
    """Update order item quantity (customer)."""
    table = session.exec(select(models.Table).where(models.Table.token == table_token)).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    order = session.exec(
        select(models.Order).where(
            models.Order.id == order_id,
            models.Order.table_id == table.id
        )
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Security: Validate that order belongs to this session
    if session_id and order.session_id and order.session_id != session_id:
        raise HTTPException(status_code=403, detail="Order does not belong to this session")
    
    item = session.exec(
        select(models.OrderItem).where(
            models.OrderItem.id == item_id,
            models.OrderItem.order_id == order_id
        )
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")
    
    # Validation: Cannot modify items that are already being prepared or delivered
    if item.status in [models.OrderItemStatus.delivered, models.OrderItemStatus.preparing, models.OrderItemStatus.ready]:
        status_label = {
            models.OrderItemStatus.delivered: "delivered",
            models.OrderItemStatus.preparing: "being prepared",
            models.OrderItemStatus.ready: "ready"
        }.get(item.status, "in progress")
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot modify items that are {status_label}. Only pending items can be modified."
        )
    
    # If quantity is 0, remove item (soft delete)
    if item_update.quantity <= 0:
        item.removed_by_customer = True
        item.removed_at = datetime.now(timezone.utc)
        item.status = models.OrderItemStatus.cancelled
    else:
        item.quantity = item_update.quantity
    
    session.add(item)
    
    # Recompute order status and total
    all_items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order_id)).all()
    if order.status not in [models.OrderStatus.paid, models.OrderStatus.cancelled]:
        order.status = compute_order_status_from_items(all_items)
    
    session.add(order)
    session.commit()
    
    # Calculate new total (exclude items removed by customer OR staff)
    active_items = [i for i in all_items if not i.removed_by_customer and i.removed_by_user_id is None]
    new_total = sum(i.price_cents * i.quantity for i in active_items)
    
    # Publish update
    publish_order_update(order.tenant_id, {
        "type": "item_updated",
        "order_id": order.id,
        "item_id": item.id,
        "new_quantity": item.quantity,
        "table_name": table.name,
        "new_total_cents": new_total
    }, table_id=order.table_id)
    
    return {
        "status": "item_updated",
        "order_id": order.id,
        "item_id": item.id,
        "new_quantity": item.quantity,
        "new_total_cents": new_total
    }


@app.delete("/menu/{table_token}/order/{order_id}")
def cancel_order(
    table_token: str,
    order_id: int,
    session_id: str | None = Query(None, description="Session identifier for order validation"),
    session: Session = Depends(get_session)
) -> dict:
    """Cancel entire order (soft delete - customer)."""
    table = session.exec(select(models.Table).where(models.Table.token == table_token)).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    order = session.exec(
        select(models.Order).where(
            models.Order.id == order_id,
            models.Order.table_id == table.id
        )
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Security: Validate that order belongs to this session
    if session_id and order.session_id and order.session_id != session_id:
        raise HTTPException(status_code=403, detail="Order does not belong to this session")
    
    # Validation: Cannot cancel if any items are being prepared, ready, or delivered
    items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order_id)).all()
    active_items = [item for item in items if not item.removed_by_customer]
    in_progress_items = [
        item for item in active_items 
        if item.status in [models.OrderItemStatus.preparing, models.OrderItemStatus.ready, models.OrderItemStatus.delivered]
    ]
    if in_progress_items:
        statuses = [item.status.value for item in in_progress_items]
        if models.OrderItemStatus.delivered.value in statuses:
            raise HTTPException(status_code=400, detail="Cannot cancel order with delivered items")
        elif models.OrderItemStatus.ready.value in statuses:
            raise HTTPException(status_code=400, detail="Cannot cancel order with items that are ready. Only pending items can be cancelled.")
        else:
            raise HTTPException(status_code=400, detail="Cannot cancel order with items that are being prepared. Only pending items can be cancelled.")
    
    # Soft delete: Mark order and all items as cancelled
    order.status = models.OrderStatus.cancelled
    order.cancelled_at = datetime.now(timezone.utc)
    order.cancelled_by = "customer"
    
    for item in items:
        if not item.removed_by_customer:  # Only cancel items not already removed
            item.removed_by_customer = True
            item.removed_at = datetime.now(timezone.utc)
            item.status = models.OrderItemStatus.cancelled
    
    session.add(order)
    session.commit()
    
    # Publish update
    publish_order_update(order.tenant_id, {
        "type": "order_cancelled",
        "order_id": order.id,
        "table_name": table.name,
        "cancelled_items": len(items)
    }, table_id=order.table_id)
    
    return {
        "status": "order_cancelled",
        "order_id": order.id,
        "cancelled_items": len(items)
    }


# ============ PAYMENTS (Public - for customer checkout) ============

@app.post("/orders/{order_id}/create-payment-intent")
def create_payment_intent(
    order_id: int,
    table_token: str,
    session: Session = Depends(get_session)
) -> dict:
    """Create a Stripe PaymentIntent for an order."""
    # Verify table token matches the order
    table = session.exec(select(models.Table).where(models.Table.token == table_token)).first()
    
    if not table:
        raise HTTPException(status_code=404, detail="Invalid table")
    
    order = session.exec(
        select(models.Order).where(
            models.Order.id == order_id,
            models.Order.table_id == table.id
        )
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Calculate total from order items
    items = session.exec(
        select(models.OrderItem).where(models.OrderItem.order_id == order_id)
    ).all()
    
    total_cents = sum(item.price_cents * item.quantity for item in items)
    
    if total_cents <= 0:
        raise HTTPException(status_code=400, detail="Order has no items")
    
    # Get tenant for description, currency, and Stripe keys
    tenant = session.exec(select(models.Tenant).where(models.Tenant.id == order.tenant_id)).first()
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Use tenant-specific Stripe keys, fallback to global config
    stripe_secret_key = tenant.stripe_secret_key or settings.stripe_secret_key
    if not stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe not configured for this tenant")
    
    # Map currency symbol to Stripe currency code
    # Default to settings.stripe_currency if tenant currency is not set
    currency_symbol = tenant.currency if tenant.currency else None
    stripe_currency = _get_stripe_currency_code(currency_symbol) or settings.stripe_currency
    
    try:
        # Use tenant-specific Stripe key
        intent = stripe.PaymentIntent.create(
            amount=total_cents,
            currency=stripe_currency,
            api_key=stripe_secret_key,
            metadata={
                "order_id": str(order.id),
                "table_id": str(table.id),
                "tenant_id": str(order.tenant_id)
            },
            description=f"Order #{order.id} at {tenant.name} - {table.name}"
        )
        
        return {
            "client_secret": intent.client_secret,
            "payment_intent_id": intent.id,
            "amount": total_cents
        }
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/orders/{order_id}/confirm-payment")
def confirm_payment(
    order_id: int,
    table_token: str,
    payment_intent_id: str,
    session: Session = Depends(get_session)
) -> dict:
    """Mark order as paid after successful Stripe payment."""
    table = session.exec(select(models.Table).where(models.Table.token == table_token)).first()
    
    if not table:
        raise HTTPException(status_code=404, detail="Invalid table")
    
    order = session.exec(
        select(models.Order).where(
            models.Order.id == order_id,
            models.Order.table_id == table.id
        )
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get tenant for Stripe keys
    tenant = session.exec(select(models.Tenant).where(models.Tenant.id == order.tenant_id)).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Use tenant-specific Stripe keys, fallback to global config
    stripe_secret_key = tenant.stripe_secret_key or settings.stripe_secret_key
    if not stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe not configured for this tenant")
    
    # Verify payment with Stripe
    try:
        intent = stripe.PaymentIntent.retrieve(payment_intent_id, api_key=stripe_secret_key)
        if intent.status != "succeeded":
            raise HTTPException(status_code=400, detail="Payment not completed")
        
        # Mark order as paid
        order.status = models.OrderStatus.paid
        order.notes = f"{order.notes or ''}\n[PAID: {payment_intent_id}]".strip()
        session.add(order)
        session.commit()
        
        # Notify tenant
        publish_order_update(order.tenant_id, {
            "type": "order_paid",
            "order_id": order.id,
            "table_name": table.name,
            "status": order.status.value
        }, table_id=order.table_id)
        
        return {"status": "paid", "order_id": order.id}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))