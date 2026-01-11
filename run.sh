#!/bin/bash

# POS Application Runner
# Runs all services in Docker containers

set -e

# Function to show help
show_help() {
    cat << EOF
POS Application Runner

Usage: ./run.sh [OPTIONS]

Options:
    -h, --help          Show this help message
    -dev, --dev         Start in development mode (ng serve with hot reload)
                        Default: production mode (build and serve static files)
    -c, --clean         Remove all containers, volumes, and data
    --remove-all        Same as --clean

Examples:
    ./run.sh            Start in production mode (build and serve)
    ./run.sh -dev       Start in development mode (hot reload)
    ./run.sh --clean    Remove all containers and volumes

Development Mode:
    - Frontend runs with 'ng serve' (hot reload enabled)
    - Backend runs with auto-reload
    - All services run in Docker containers

Production Mode:
    - Frontend is built and served as static files via nginx
    - Backend runs in container
    - Optimized for performance

EOF
    exit 0
}

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    if [ "$DEV_MODE" = true ]; then
        docker compose $ENV_FILE down
    else
        docker compose $ENV_FILE -f docker-compose.yml -f docker-compose.prod.yml down
    fi
    exit 0
}

# Function to remove everything including volumes
remove_all() {
    echo "🗑️  Removing all POS containers, volumes, and data..."
    
    # Check if config.env exists
    if [ ! -f "config.env" ]; then
        echo "⚠️  config.env not found, using defaults..."
        ENV_FILE=""
    else
        ENV_FILE="--env-file config.env"
    fi
    
    # Stop and remove containers with volumes
    echo "📦 Stopping and removing containers..."
    docker compose $ENV_FILE down -v 2>/dev/null || true
    docker compose $ENV_FILE -f docker-compose.prod.yml down -v 2>/dev/null || true
    
    # Remove all POS-related volumes (more robust)
    echo "💾 Removing volumes..."
    VOLUMES=$(docker volume ls --format "{{.Name}}" | grep -E "^pos_" || true)
    if [ -n "$VOLUMES" ]; then
        echo "$VOLUMES" | xargs docker volume rm 2>/dev/null || true
    fi
    
    # Remove any orphaned containers
    echo "🧹 Cleaning up orphaned containers..."
    CONTAINERS=$(docker ps -a --filter "name=pos-" --format "{{.ID}}" || true)
    if [ -n "$CONTAINERS" ]; then
        echo "$CONTAINERS" | xargs docker rm -f 2>/dev/null || true
    fi
    
    echo ""
    echo "✅ All POS containers and volumes removed!"
    echo "💡 All data has been deleted. You'll need to recreate your database on next start."
    exit 0
}

# Parse command line arguments
DEV_MODE=false
ENV_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            ;;
        -dev|--dev)
            DEV_MODE=true
            shift
            ;;
        -c|--clean|--remove-all)
            remove_all
            ;;
        *)
            echo "❌ Unknown option: $1"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Check if config.env exists
if [ ! -f "config.env" ]; then
    echo "❌ config.env not found! Copy config.env.example to config.env and edit if needed."
    exit 1
fi

ENV_FILE="--env-file config.env"

# Determine which compose file to use
if [ "$DEV_MODE" = true ]; then
    echo "🚀 Starting POS Application in DEVELOPMENT mode..."
    COMPOSE_FILE=""
    MODE_DESC="Development (hot reload enabled)"
else
    echo "🚀 Starting POS Application in PRODUCTION mode..."
    COMPOSE_FILE="-f docker-compose.yml -f docker-compose.prod.yml"
    MODE_DESC="Production (optimized build)"
fi

# Start all services with Docker Compose
echo "🐳 Starting all services in containers..."
echo "📋 Mode: $MODE_DESC"
echo ""

# Start services (this will run in foreground and show logs)
docker compose $ENV_FILE $COMPOSE_FILE up --build

echo ""
echo "✅ POS Application started!"
echo "🌐 Frontend: http://localhost:4200"
echo "⚡ Backend API: http://localhost:8020"
echo "📊 Health check: http://localhost:8020/health"
echo "🗄️  DB Health check: http://localhost:8020/health/db"
echo "📚 API Docs: http://localhost:8020/docs"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""
echo "💡 Tip: Run './run.sh --clean' to remove all containers and volumes"
