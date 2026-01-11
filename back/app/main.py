import json
import logging
import os
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from PIL import Image
import redis
import stripe
from fastapi import Depends, FastAPI, HTTPException, UploadFile, File, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from . import models, security
from .db import check_db_connection, create_db_and_tables, get_session
from .settings import settings

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
if "*" not in cors_origins_list:
    cors_origins_list.append("*")

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


def publish_order_update(tenant_id: int, order_data: dict) -> None:
    """Publish order update to Redis for WebSocket bridge."""
    r = get_redis()
    if r:
        try:
            r.publish(f"orders:{tenant_id}", json.dumps(order_data))
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
    return {"access_token": access_token, "token_type": "bearer"}


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
    return session.exec(select(models.Product).where(models.Product.tenant_id == current_user.tenant_id)).all()


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


# ============ TABLES ============

@app.get("/tables")
def list_tables(
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> list[models.Table]:
    return session.exec(select(models.Table).where(models.Table.tenant_id == current_user.tenant_id)).all()


@app.post("/tables")
def create_table(
    table_data: models.TableCreate,
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> models.Table:
    table = models.Table(name=table_data.name, tenant_id=current_user.tenant_id)
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
    
    products = session.exec(
        select(models.Product).where(models.Product.tenant_id == table.tenant_id)
    ).all()
    
    tenant = session.exec(select(models.Tenant).where(models.Tenant.id == table.tenant_id)).first()
    
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
        "products": [
            {
                "id": p.id,
                "name": p.name,
                "price_cents": p.price_cents,
                "image_filename": p.image_filename,
                "tenant_id": p.tenant_id,
                "ingredients": p.ingredients,
            }
            for p in products
        ],
    }


@app.get("/menu/{table_token}/order")
def get_current_order(
    table_token: str,
    session: Session = Depends(get_session)
) -> dict:
    """Public endpoint - get current active order for a table (if any)."""
    table = session.exec(select(models.Table).where(models.Table.token == table_token)).first()
    
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    # Find active order: not paid AND no [PAID:] in notes
    potential_orders = session.exec(
        select(models.Order).where(
            models.Order.table_id == table.id,
            models.Order.status != "paid"
        ).order_by(models.Order.created_at.desc())
    ).all()
    
    # Filter out orders with payment confirmation in notes
    active_order = None
    for order in potential_orders:
        if "[PAID:" not in (order.notes or ""):
            active_order = order
            break
    
    if not active_order:
        return {"order": None}
    
    # Get order items
    items = session.exec(
        select(models.OrderItem).where(models.OrderItem.order_id == active_order.id)
    ).all()
    
    return {
        "order": {
            "id": active_order.id,
            "status": active_order.status.value if hasattr(active_order.status, 'value') else str(active_order.status),
            "notes": active_order.notes,
            "created_at": active_order.created_at.isoformat(),
            "items": [
                {
                    "id": item.id,
                    "product_id": item.product_id,
                    "product_name": item.product_name,
                    "quantity": item.quantity,
                    "price_cents": item.price_cents,
                    "notes": item.notes
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
    
    # Check for existing unpaid order for this table (reuse until paid)
    # Get all non-paid orders, then filter out ones with payment confirmation in notes
    potential_orders = session.exec(
        select(models.Order).where(
            models.Order.table_id == table.id,
            models.Order.status != "paid"
        ).order_by(models.Order.created_at.desc())
    ).all()
    
    # Filter out orders that have payment confirmation in notes (edge case for corrupted data)
    existing_order = None
    for order in potential_orders:
        has_paid_note = "[PAID:" in (order.notes or "")
        if not has_paid_note:
            existing_order = order
            break
        else:
            print(f"[DEBUG] Skipping order #{order.id} - has [PAID:] in notes despite status={order.status!r}")
    
    print(f"[DEBUG] Query result after filtering: {existing_order}")
    if existing_order:
        print(f"[DEBUG] Found existing order #{existing_order.id} with status={existing_order.status!r}")
    else:
        print(f"[DEBUG] No existing unpaid order found - will create new one")
    
    is_new_order = existing_order is None
    
    if is_new_order:
        # Create new order
        order = models.Order(
            tenant_id=table.tenant_id,
            table_id=table.id,
            notes=order_data.notes
        )
        session.add(order)
        session.commit()
        session.refresh(order)
        print(f"[DEBUG] Created NEW order #{order.id}")
    else:
        order = existing_order
        print(f"[DEBUG] REUSING existing order #{order.id}")
        # If the order was completed, reset it to pending since new items were added
        if str(order.status) == "completed" or order.status == models.OrderStatus.completed:
            order.status = models.OrderStatus.pending
            print(f"[DEBUG] Reset order status from completed to pending")
        # Append notes if provided
        if order_data.notes:
            order.notes = f"{order.notes or ''}\n{order_data.notes}".strip()
    
    print(f"[DEBUG] Final order #{order.id}, status={order.status!r}")
    print(f"{'='*60}\n")
    
    # Add order items
    for item in order_data.items:
        product = session.exec(
            select(models.Product).where(
                models.Product.id == item.product_id,
                models.Product.tenant_id == table.tenant_id
            )
        ).first()
        
        if not product:
            raise HTTPException(status_code=400, detail=f"Product {item.product_id} not found")
        
        # Check if this product already exists in the order
        existing_item = session.exec(
            select(models.OrderItem).where(
                models.OrderItem.order_id == order.id,
                models.OrderItem.product_id == product.id
            )
        ).first()
        
        if existing_item:
            # Increment quantity
            existing_item.quantity += item.quantity
            if item.notes:
                existing_item.notes = f"{existing_item.notes or ''}, {item.notes}".strip(", ")
            session.add(existing_item)
        else:
            # Create new order item
            order_item = models.OrderItem(
                order_id=order.id,
                product_id=product.id,
                product_name=product.name,
                quantity=item.quantity,
                price_cents=product.price_cents,
                notes=item.notes
            )
            session.add(order_item)
    
    session.commit()
    session.refresh(order)
    
    # Publish to Redis for real-time updates
    publish_order_update(table.tenant_id, {
        "type": "new_order" if is_new_order else "items_added",
        "order_id": order.id,
        "table_name": table.name,
        "status": order.status.value,
        "created_at": order.created_at.isoformat()
    })
    
    return {"status": "created" if is_new_order else "updated", "order_id": order.id}


# ============ ORDERS (Protected) ============

@app.get("/orders")
def list_orders(
    current_user: Annotated[models.User, Depends(security.get_current_user)],
    session: Session = Depends(get_session)
) -> list[dict]:
    orders = session.exec(
        select(models.Order).where(models.Order.tenant_id == current_user.tenant_id).order_by(models.Order.created_at.desc())
    ).all()
    
    result = []
    for order in orders:
        table = session.exec(select(models.Table).where(models.Table.id == order.table_id)).first()
        items = session.exec(select(models.OrderItem).where(models.OrderItem.order_id == order.id)).all()
        
        result.append({
            "id": order.id,
            "table_name": table.name if table else "Unknown",
            "status": order.status.value,
            "notes": order.notes,
            "created_at": order.created_at.isoformat(),
            "items": [
                {
                    "id": item.id,
                    "product_name": item.product_name,
                    "quantity": item.quantity,
                    "price_cents": item.price_cents,
                    "notes": item.notes
                }
                for item in items
            ],
            "total_cents": sum(item.price_cents * item.quantity for item in items)
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
    
    order.status = status_update.status
    session.add(order)
    session.commit()
    
    # Publish status update
    table = session.exec(select(models.Table).where(models.Table.id == order.table_id)).first()
    publish_order_update(current_user.tenant_id, {
        "type": "status_update",
        "order_id": order.id,
        "table_name": table.name if table else "Unknown",
        "status": order.status.value
    })
    
    return {"status": "updated", "order_id": order.id, "new_status": order.status.value}


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
        })
        
        return {"status": "paid", "order_id": order.id}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))