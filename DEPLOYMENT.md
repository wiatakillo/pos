# Deployment Configuration Guide

This guide explains how to configure the POS system to run on a specific domain or IP address.

## Quick Start

1. Copy the example configuration:
   ```bash
   cp config.env.example config.env
   ```

2. Edit `config.env` with your domain/IP settings (see examples below)

3. Start all services:
   ```bash
   docker compose --env-file config.env up -d
   ```

## Configuration Variables

### Frontend URLs (`API_URL` and `WS_URL`)

These tell the Angular frontend where to connect to the backend:

**For Domain Deployment:**
```bash
API_URL=https://api.yourdomain.com
WS_URL=wss://api.yourdomain.com  # Note: wss:// for secure WebSocket
```

**For IP Address Deployment:**
```bash
API_URL=http://192.168.1.100:8020
WS_URL=ws://192.168.1.100:8021
```

**For Localhost (Development):**
```bash
API_URL=http://localhost:8020
WS_URL=ws://localhost:8021
```

### CORS Origins (`CORS_ORIGINS`)

This tells the backend which frontend origins are allowed to make requests:

**Single Domain:**
```bash
CORS_ORIGINS=https://app.yourdomain.com
```

**Multiple Domains:**
```bash
CORS_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com
```

**IP Address:**
```bash
CORS_ORIGINS=http://192.168.1.100:4200
```

**With Wildcard (for public menu access):**
```bash
CORS_ORIGINS=https://app.yourdomain.com,*
```

## Example Configurations

### Example 1: Domain with HTTPS

```bash
# config.env
API_URL=https://api.example.com
WS_URL=wss://api.example.com
CORS_ORIGINS=https://app.example.com,*
```

### Example 2: IP Address on Local Network

```bash
# config.env
API_URL=http://192.168.1.100:8020
WS_URL=ws://192.168.1.100:8021
CORS_ORIGINS=http://192.168.1.100:4200,*
```

### Example 3: Development (Localhost)

```bash
# config.env
API_URL=http://localhost:8020
WS_URL=ws://localhost:8021
CORS_ORIGINS=http://localhost:4200,*
```

## Important Notes

1. **HTTPS/WSS**: If using HTTPS for the API, use `wss://` (not `ws://`) for WebSocket connections
2. **Ports**: Make sure the ports you specify are accessible and not blocked by firewalls
3. **CORS**: The `CORS_ORIGINS` must include the exact URL where users access the frontend
4. **Wildcard**: The `*` in CORS_ORIGINS allows public menu access from any origin (useful for QR code menus)

## Reverse Proxy Setup (Optional)

If you want to use a reverse proxy (nginx, Traefik, etc.):

1. Set `API_URL` and `WS_URL` to point to your reverse proxy
2. Configure the proxy to forward:
   - `/api/*` → `http://pos-back:8020`
   - `/ws/*` → `ws://pos-ws-bridge:8021`
3. Update `CORS_ORIGINS` to match your frontend domain

## Troubleshooting

**Frontend can't connect to backend:**
- Check that `API_URL` matches where the backend is accessible
- Verify CORS settings allow your frontend origin
- Check browser console for CORS errors

**WebSocket connection fails:**
- Ensure `WS_URL` uses `ws://` for HTTP or `wss://` for HTTPS
- Check that port 8021 is accessible
- Verify WebSocket bridge container is running

**CORS errors:**
- Make sure `CORS_ORIGINS` includes the exact frontend URL (including protocol and port)
- Check browser network tab for the exact origin being blocked
