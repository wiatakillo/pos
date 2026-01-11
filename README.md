# POS System

A Point of Sale system with Angular frontend and FastAPI backend using PostgreSQL, Redis, and WebSocket support for real-time updates.

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Git

### Setup

1. **Clone and setup environment:**
   ```bash
   # Copy environment config
   cp config.env.example config.env
   ```

2. **Edit configuration (optional):**
   ```bash
   # Edit config.env to set your domain/IP if needed
   # For localhost development, defaults are fine
   ```

3. **Start all services with Docker Compose:**
   ```bash
   docker compose --env-file config.env up -d
   ```

   This will start:
   - PostgreSQL 18 (Alpine 3.23) on port 5433
   - Redis 7 on port 6379
   - FastAPI backend on port 8020
   - Angular frontend on port 4200
   - WebSocket bridge on port 8021

### Access Points

- **Frontend**: http://localhost:4200
- **API**: http://localhost:8020
- **WebSocket Bridge**: ws://localhost:8021
- **Health Check**: http://localhost:8020/health
- **DB Health Check**: http://localhost:8020/health/db
- **API Docs**: http://localhost:8020/docs

### Viewing Logs

```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f back
docker compose logs -f front
```

### Stopping Services

```bash
docker compose --env-file config.env down
```

## Configuration

### Environment Variables

The system is configured via `config.env`. Key variables:

- **Database**: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- **Frontend URLs**: `API_URL`, `WS_URL` (for domain/IP deployment)
- **CORS**: `CORS_ORIGINS` (comma-separated list of allowed origins)
- **Security**: `SECRET_KEY` (required for production)
- **Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_CURRENCY`

See `config.env.example` for all available configuration options.

### Domain/IP Deployment

To deploy on a specific domain or IP address:

1. Edit `config.env`:
   ```bash
   # For domain
   API_URL=https://api.yourdomain.com
   WS_URL=wss://api.yourdomain.com
   CORS_ORIGINS=https://app.yourdomain.com,*

   # For IP address
   API_URL=http://192.168.1.100:8020
   WS_URL=ws://192.168.1.100:8021
   CORS_ORIGINS=http://192.168.1.100:4200,*
   ```

2. Restart services:
   ```bash
   docker compose --env-file config.env down
   docker compose --env-file config.env up -d
   ```

For detailed deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Architecture

- **Frontend**: Angular 21+ (SPA) - Containerized
- **Backend**: FastAPI with SQLModel ORM - Containerized
- **Database**: PostgreSQL 18 (Alpine 3.23) - Containerized
- **Cache/Pub-Sub**: Redis 7 - Containerized
- **Real-time**: WebSocket bridge microservice - Containerized
- **Payments**: Stripe integration

### Service Communication

```
Browser → Frontend (Angular) → Backend (FastAPI) → PostgreSQL
                              ↓
                         Redis Pub/Sub
                              ↓
                    WebSocket Bridge → Browser (real-time updates)
```

## Development

### Database Migrations

The project uses a versioned migration system to manage database schema changes. Migrations are automatically applied on application startup.

**Migration files** are located in `back/migrations/` and follow the naming pattern:
```
{version}_{description}.sql
```

Example: `001_add_tenant_fields.sql`, `002_add_user_preferences.sql`

**Running migrations manually:**
```bash
# Check for pending migrations (dry run)
docker compose exec back python -m app.migrate --check

# Apply pending migrations
docker compose exec back python -m app.migrate
```

**Creating a new migration:**

**Recommended: Use timestamp-based naming** (prevents conflicts in concurrent development):
```bash
# Use the helper script
./back/create_migration.sh add_user_preferences
# Creates: migrations/20260111143000_add_user_preferences.sql
```

**Alternative: Sequential numbering** (backward compatible):
1. Create a new SQL file: `back/migrations/XXX_description.sql` (where XXX is the next version number)
2. Write your SQL statements (CREATE TABLE, ALTER TABLE, etc.)
3. Test locally before committing

⚠️ **Note**: Sequential numbers can conflict if two developers work simultaneously. Timestamps eliminate this issue.

**Important:**
- Migrations are applied automatically on startup
- Never modify existing migration files - create a new migration to fix issues
- The system tracks applied migrations in the `schema_version` table
- Use `IF NOT EXISTS` clauses where possible for idempotency

See `back/migrations/README.md` for more details.

### Hot Reload

All services support hot reload when running in Docker:
- Frontend: File changes trigger automatic rebuild
- Backend: Uvicorn reloads on Python file changes

### Manual Development (Alternative)

If you prefer to run components outside Docker:

```bash
# 1. Start database and Redis
docker compose --env-file config.env up -d db redis

# 2. Start backend
cd back
source venv/bin/activate  # or use your virtual environment
export $(grep -v '^#' ../config.env | xargs)
uvicorn app.main:app --host 0.0.0.0 --port 8020 --reload

# 3. Start frontend (in another terminal)
cd front
npm install
npm start  # Runs on http://localhost:4200
```

## Features

- **Multi-tenant**: Each restaurant/tenant has isolated data
- **Public Menu**: Customers access menus via QR codes (table tokens)
- **Order Management**: Real-time order status updates via WebSocket
- **Payment Processing**: Stripe integration for customer checkout
- **Product Management**: CRUD operations with image uploads
- **Table Management**: Generate QR codes for tables

## Security Notes

- **SECRET_KEY**: Must be changed in production (used for JWT tokens)
- **CORS**: Configure `CORS_ORIGINS` to restrict frontend access
- **Database**: Use strong passwords in production
- **Stripe**: Use production keys in production environment

## Troubleshooting

**Services won't start:**
- Check if ports are already in use
- Verify `config.env` exists and is properly formatted
- Check Docker logs: `docker compose logs`

**Frontend can't connect to backend:**
- Verify `API_URL` in `config.env` matches backend location
- Check CORS settings allow your frontend origin
- Check browser console for errors

**Database connection errors:**
- Ensure database container is healthy: `docker compose ps`
- Verify `DB_HOST=db` (service name) when using Docker Compose
- Check database credentials in `config.env`

For more troubleshooting, see [DEPLOYMENT.md](DEPLOYMENT.md).
