"""
WebSocket Bridge Microservice

Subscribes to Redis pub/sub channels and broadcasts messages to connected WebSocket clients.
- Table-specific channel: orders:table:{table_id} (for customers)
- Tenant-wide channel: orders:tenant:{tenant_id} (for restaurant owners)
"""
import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

import httpx
import redis.asyncio as redis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send
from jose import JWTError, jwt

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Store connected clients
# Key: "table:{table_id}" or "tenant:{tenant_id}"
table_connections: dict[int, set[WebSocket]] = {}  # table_id -> set of WebSockets
tenant_connections: dict[int, set[WebSocket]] = {}  # tenant_id -> set of WebSockets

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_THIS_IN_PRODUCTION")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
API_URL = os.getenv("API_URL", "http://localhost:8020")


async def validate_table_token(table_token: str) -> Optional[dict]:
    """Validate table token by calling backend API."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{API_URL}/internal/validate-table/{table_token}")
            if response.status_code == 200:
                return response.json()
            return None
    except Exception as e:
        logger.error(f"Error validating table token {table_token}: {e}", exc_info=True)
        return None


def validate_jwt_token(token: str) -> Optional[dict]:
    """Validate JWT token and extract tenant_id."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        tenant_id = payload.get("tenant_id")
        if tenant_id is None:
            return None
        return {"tenant_id": tenant_id, "email": payload.get("sub")}
    except JWTError:
        return None


async def redis_listener():
    """Subscribe to Redis and broadcast to WebSocket clients."""
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    
    while True:
        try:
            r = redis.from_url(redis_url)
            pubsub = r.pubsub()
            
            # Subscribe to both table-specific and tenant-wide channels
            await pubsub.psubscribe("orders:table:*", "orders:tenant:*")
            
            async for message in pubsub.listen():
                if message["type"] == "pmessage":
                    channel = message["channel"].decode()
                    data = message["data"].decode()
                    
                    # Parse channel: orders:table:{table_id} or orders:tenant:{tenant_id}
                    parts = channel.split(":")
                    if len(parts) == 3:
                        channel_type = parts[1]  # "table" or "tenant"
                        entity_id = int(parts[2])
                        
                        dead_connections = set()
                        
                        if channel_type == "table":
                            # Broadcast to all clients connected to this table
                            if entity_id in table_connections:
                                for ws in table_connections[entity_id]:
                                    try:
                                        await ws.send_text(data)
                                    except Exception:
                                        dead_connections.add(ws)
                                table_connections[entity_id] -= dead_connections
                        
                        elif channel_type == "tenant":
                            # Broadcast to all clients connected to this tenant
                            if entity_id in tenant_connections:
                                for ws in tenant_connections[entity_id]:
                                    try:
                                        await ws.send_text(data)
                                    except Exception:
                                        dead_connections.add(ws)
                                tenant_connections[entity_id] -= dead_connections
                        
        except Exception as e:
            logger.error(f"Redis connection error: {e}", exc_info=True)
            await asyncio.sleep(5)  # Retry after 5 seconds


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start Redis listener on startup
    task = asyncio.create_task(redis_listener())
    yield
    task.cancel()


app_base = FastAPI(title="WS Bridge", lifespan=lifespan)


class ASGIRequestLoggingMiddleware:
    """
    ASGI middleware to log all requests including malformed ones.
    
    Note: "Invalid HTTP request received" warnings from uvicorn occur when
    uvicorn itself cannot parse the HTTP request (before it reaches this middleware).
    This middleware logs all requests that successfully reach the ASGI layer.
    """
    def __init__(self, app: ASGIApp):
        self.app = app
    
    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        # Log all incoming requests at ASGI level (catches malformed requests too)
        try:
            if scope["type"] == "http":
                client_host = scope.get("client", ("unknown", 0))[0] if scope.get("client") else "unknown"
                method = scope.get("method", "UNKNOWN")
                path = scope.get("path", "UNKNOWN")
                query_string = scope.get("query_string", b"").decode("utf-8", errors="replace")
                headers = {k.decode("utf-8", errors="replace"): v.decode("utf-8", errors="replace") 
                          for k, v in scope.get("headers", [])}
                
                # Filter sensitive headers
                safe_headers = {k: v for k, v in headers.items() 
                              if k.lower() not in ['authorization', 'cookie', 'x-api-key']}
                
                logger.info(
                    f"HTTP Request: {method} {path} "
                    f"from {client_host} "
                    f"(query: {query_string or 'none'}, "
                    f"headers: {json.dumps(safe_headers, indent=2)})"
                )
            elif scope["type"] == "websocket":
                client_host = scope.get("client", ("unknown", 0))[0] if scope.get("client") else "unknown"
                path = scope.get("path", "UNKNOWN")
                query_string = scope.get("query_string", b"").decode("utf-8", errors="replace")
                headers = {k.decode("utf-8", errors="replace"): v.decode("utf-8", errors="replace") 
                          for k, v in scope.get("headers", [])}
                
                logger.info(
                    f"WebSocket Request: {path} "
                    f"from {client_host} "
                    f"(query: {query_string or 'none'}, "
                    f"Upgrade: {headers.get('upgrade', 'N/A')}, "
                    f"Connection: {headers.get('connection', 'N/A')}, "
                    f"Sec-WebSocket-Key: {headers.get('sec-websocket-key', 'N/A')[:20] if headers.get('sec-websocket-key') else 'N/A'}..., "
                    f"Sec-WebSocket-Version: {headers.get('sec-websocket-version', 'N/A')})"
                )
            elif scope["type"] == "lifespan":
                # Lifespan events are normal (startup/shutdown), don't log as warning
                pass
            else:
                logger.warning(f"Unknown scope type: {scope.get('type', 'UNKNOWN')} from {scope.get('client', ('unknown', 0))[0] if scope.get('client') else 'unknown'}")
        except Exception as e:
            logger.error(f"Error logging request details: {e}", exc_info=True)
        
        try:
            await self.app(scope, receive, send)
        except Exception as e:
            logger.error(
                f"Error processing {scope.get('type', 'UNKNOWN')} request "
                f"{scope.get('method', '')} {scope.get('path', 'UNKNOWN')}: {e}",
                exc_info=True
            )
            raise


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """HTTP middleware to log all incoming requests for debugging."""
    async def dispatch(self, request: Request, call_next):
        # Log request details
        client_host = request.client.host if request.client else "unknown"
        logger.debug(
            f"Request: {request.method} {request.url.path} "
            f"from {client_host} "
            f"(query: {dict(request.query_params)}, "
            f"headers: {dict(request.headers)})"
        )
        
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"Error processing request {request.method} {request.url.path}: {e}", exc_info=True)
            raise


# Add HTTP middleware to base app
app_base.add_middleware(RequestLoggingMiddleware)
app_base.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wrap with ASGI middleware to catch all requests including malformed ones
# This must be the outermost wrapper to catch everything
app = ASGIRequestLoggingMiddleware(app_base)


@app_base.exception_handler(404)
async def not_found_handler(request: Request, exc):
    """Log 404 errors with full request details."""
    client_host = request.client.host if request.client else "unknown"
    logger.warning(
        f"404 Not Found: {request.method} {request.url.path} "
        f"from {client_host} "
        f"(query: {dict(request.query_params)}, "
        f"headers: Upgrade={request.headers.get('upgrade', 'N/A')}, "
        f"Connection={request.headers.get('connection', 'N/A')}, "
        f"Sec-WebSocket-Key={request.headers.get('sec-websocket-key', 'N/A')})"
    )
    return JSONResponse(
        status_code=404,
        content={"detail": f"Not found: {request.url.path}"}
    )


@app_base.exception_handler(405)
async def method_not_allowed_handler(request: Request, exc):
    """Log 405 errors with full request details."""
    client_host = request.client.host if request.client else "unknown"
    logger.warning(
        f"405 Method Not Allowed: {request.method} {request.url.path} "
        f"from {client_host} "
        f"(query: {dict(request.query_params)}, "
        f"headers: {dict(request.headers)})"
    )
    return JSONResponse(
        status_code=405,
        content={"detail": f"Method {request.method} not allowed for {request.url.path}"}
    )


@app_base.get("/health")
def health():
    table_count = sum(len(c) for c in table_connections.values())
    tenant_count = sum(len(c) for c in tenant_connections.values())
    return {
        "status": "ok",
        "table_connections": table_count,
        "tenant_connections": tenant_count,
        "total_connections": table_count + tenant_count,
        "config": {
            "api_url_configured": bool(API_URL),
            "secret_key_configured": bool(SECRET_KEY and SECRET_KEY != "CHANGE_THIS_IN_PRODUCTION"),
            "algorithm": ALGORITHM
        }
    }


@app_base.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def catch_all(request: Request, path: str):
    """Catch-all route to log unmatched requests."""
    client_host = request.client.host if request.client else "unknown"
    headers_dict = dict(request.headers)
    
    logger.warning(
        f"Unmatched request: {request.method} /{path} "
        f"from {client_host} "
        f"(query: {dict(request.query_params)}, "
        f"headers: {json.dumps({k: v for k, v in headers_dict.items() if k.lower() not in ['authorization', 'cookie']}, indent=2)})"
    )
    
    return JSONResponse(
        status_code=404,
        content={
            "detail": f"Endpoint not found: /{path}",
            "available_endpoints": [
                "/health",
                "/ws/table/{table_token}",
                "/ws/tenant/{tenant_id}?token=..."
            ]
        }
    )


@app_base.websocket("/ws/table/{table_token}")
@app_base.websocket("/table/{table_token}")  # Also accept without /ws prefix (for HAProxy)
async def websocket_table_endpoint(websocket: WebSocket, table_token: str):
    """WebSocket endpoint for customers - validates table_token and only sends table-specific updates."""
    client_host = websocket.client.host if websocket.client else "unknown"
    logger.info(f"WebSocket connection attempt: /ws/table/{table_token} from {client_host}")
    
    try:
        await websocket.accept()
    except Exception as e:
        logger.error(f"Failed to accept WebSocket connection for /ws/table/{table_token}: {e}")
        return
    
    # Validate table token
    table_info = await validate_table_token(table_token)
    if not table_info:
        logger.warning(f"Invalid table token: {table_token} from {client_host}")
        await websocket.close(code=1008, reason="Invalid table token")
        return
    
    table_id = table_info["table_id"]
    
    # Add to connections
    if table_id not in table_connections:
        table_connections[table_id] = set()
    table_connections[table_id].add(websocket)
    
    try:
        while True:
            # Keep connection alive, handle any incoming messages
            data = await websocket.receive_text()
            # Could handle client messages here if needed (e.g., ping/pong)
    except WebSocketDisconnect:
        pass
    finally:
        # Remove from connections
        if table_id in table_connections:
            table_connections[table_id].discard(websocket)
            if not table_connections[table_id]:
                del table_connections[table_id]


@app_base.websocket("/ws/tenant/{tenant_id}")
@app_base.websocket("/tenant/{tenant_id}")  # Also accept without /ws prefix (for HAProxy)
async def websocket_tenant_endpoint(
    websocket: WebSocket,
    tenant_id: int,
    token: Optional[str] = Query(None)
):
    """WebSocket endpoint for restaurant owners - requires JWT authentication."""
    client_host = websocket.client.host if websocket.client else "unknown"
    logger.info(f"WebSocket connection attempt: /ws/tenant/{tenant_id} from {client_host} (token present: {bool(token)})")
    
    try:
        await websocket.accept()
    except Exception as e:
        logger.error(f"Failed to accept WebSocket connection for /ws/tenant/{tenant_id}: {e}")
        return
    
    # Validate JWT token
    if not token:
        logger.warning(f"WebSocket /ws/tenant/{tenant_id}: Missing token from {client_host}")
        await websocket.close(code=1008, reason="Missing authentication token")
        return
    
    token_info = validate_jwt_token(token)
    if not token_info:
        logger.warning(
            f"WebSocket /ws/tenant/{tenant_id}: Invalid token from {client_host} "
            f"(SECRET_KEY configured: {bool(SECRET_KEY and SECRET_KEY != 'CHANGE_THIS_IN_PRODUCTION')})"
        )
        await websocket.close(code=1008, reason="Invalid authentication token")
        return
    
    # Verify tenant_id matches token
    if token_info["tenant_id"] != tenant_id:
        logger.warning(
            f"WebSocket /ws/tenant/{tenant_id}: Tenant ID mismatch from {client_host} "
            f"(token has {token_info['tenant_id']})"
        )
        await websocket.close(code=1008, reason="Tenant ID mismatch")
        return
    
    logger.info(f"WebSocket /ws/tenant/{tenant_id}: Successfully authenticated for tenant {tenant_id} from {client_host}")
    
    # Add to connections
    if tenant_id not in tenant_connections:
        tenant_connections[tenant_id] = set()
    tenant_connections[tenant_id].add(websocket)
    
    try:
        while True:
            # Keep connection alive, handle any incoming messages
            data = await websocket.receive_text()
            # Could handle client messages here if needed (e.g., ping/pong)
    except WebSocketDisconnect:
        pass
    finally:
        # Remove from connections
        if tenant_id in tenant_connections:
            tenant_connections[tenant_id].discard(websocket)
            if not tenant_connections[tenant_id]:
                del tenant_connections[tenant_id]
