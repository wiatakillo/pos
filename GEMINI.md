# Gemini Context: POS System

## Project Overview
This is a full-stack Point of Sale (POS) system.
- **Frontend:** Angular 20+ (SPA with SSR capability, though SSR is disabled in dev script).
- **Backend:** FastAPI (Python) using SQLModel for ORM.
- **Database:** PostgreSQL 18 (Alpine 3.23), managed via Docker Compose.

## Architecture & Directory Structure
```
/
├── back/               # Python FastAPI Backend
│   ├── app/            # Application source
│   │   ├── main.py     # App entry point
│   │   ├── models.py   # SQLModel database models
│   │   └── db.py       # Database connection logic
│   └── requirements.txt
├── front/              # Angular Frontend
│   ├── src/            # Source code
│   └── package.json    # Angular 20 dependencies & scripts
├── docker-compose.yml  # Database service configuration
└── run.sh              # Main development entry script
```

## Setup & Development

### Prerequisites
- Docker & Docker Compose
- Python 3.12+ (Virtual environment recommended)
- Node.js 18+

### Quick Start
The project includes a helper script `run.sh` that orchestrates the entire stack.

1.  **Configure Environment:**
    ```bash
    cp config.env.example config.env
    ```
2.  **Start Application:**
    ```bash
    ./run.sh
    ```
    *   Starts PostgreSQL container.
    *   Temporarily disables Angular SSR files for faster client-side dev.
    *   Starts `ng serve` on port 4200.
    *   Starts `uvicorn` backend on port 8020.
    *   **Note:** The script handles cleanup (restoring SSR files) on exit.

### Manual Commands
If `run.sh` is not used, services can be run individually:

*   **Database:** `docker compose --env-file config.env up -d`
*   **Backend:**
    ```bash
    cd back
    source venv/bin/activate
    export $(grep -v '^#' ../config.env | xargs)
    uvicorn app.main:app --host 0.0.0.0 --port 8020 --reload
    ```
*   **Frontend:**
    ```bash
    cd front
    npm install
    npm start # Runs 'ng serve'
    ```

## Development Conventions

### Frontend (Angular)
-   **Style:** Prettier configuration is embedded in `package.json` (`singleQuote: true`, `printWidth: 100`).
-   **SSR:** The project uses `@angular/ssr`, but development is typically done in client-side mode (handled by `run.sh`).
-   **Structure:** Standard Angular CLI structure.

### Backend (FastAPI)
-   **ORM:** Uses **SQLModel** (combining Pydantic & SQLAlchemy).
-   **DB Driver:** Uses `psycopg[binary]` (v3).
-   **Imports:** `from . import models` in `main.py` ensures models are registered with SQLModel before DB creation.
-   **Environment:** Relies on environment variables (loaded from `config.env`).

### Testing
-   **Frontend:** `ng test` (Karma/Jasmine).
-   **Backend:** Standard `pytest` conventions likely apply, though explicit test files were not immediately visible in the root scan.

## Key URLs
-   Frontend: http://localhost:4200
-   Backend API Docs: http://localhost:8020/docs
-   Health Check: http://localhost:8020/health
