# HAProxy Configuration

This HAProxy setup proxies all traffic through port 4202, allowing the POS system to work when only one port is accessible.

## Routing

- **Frontend (Static Files)**: `http://host:4202/` → `pos-front:4200`
- **API Requests**: `http://host:4202/api/*` → `pos-back:8020/*` (path prefix removed)
- **WebSocket**: `ws://host:4202/ws/*` → `pos-ws-bridge:8021/*` (path prefix removed)

## Configuration

The frontend is configured to use relative URLs by default:
- API: `/api` (proxied to backend)
- WebSocket: `ws://host/ws` or `wss://host/ws` (proxied to ws-bridge)

You can override these by setting environment variables:
- `API_URL` - absolute API URL (if not set, uses `/api`)
- `WS_URL` - absolute WebSocket URL (if not set, uses relative `ws://host/ws`)

## Usage

HAProxy is automatically started with `docker compose up`. It listens on port 4202 and routes traffic to the appropriate backend services.

## Testing

1. Frontend: `http://host:4202/`
2. API: `http://host:4202/api/docs`
3. WebSocket: `ws://host:4202/ws/tenant/1?token=...` or `ws://host:4202/ws/table/{token}`
