#!/bin/bash

# Exit on error
set -e

# Get the directory of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Activate virtual environment
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "Warning: 'venv' directory not found. Assuming packages are installed globally or in another environment."
fi

# Load environment variables
if [ -f "../config.env" ]; then
    export $(grep -v '^#' ../config.env | xargs)
else
    echo "Warning: '../config.env' not found. Ensure environment variables are set."
fi

echo "========================================"
echo "Starting Database Seeding"
echo "========================================"

echo "[1/4] Seeding Categories..."
python -m app.seeds.categories

echo "[2/4] Seeding Pizzas..."
# Pass arguments (like --clear) to the importers
python -m app.seeds.pizza_import "$@"

echo "[3/4] Seeding Beers..."
python -m app.seeds.beer_import "$@"

echo "[4/4] Seeding Wines..."
python -m app.seeds.wine_import "$@"

echo "========================================"
echo "Seeding Complete!"
echo "========================================"
