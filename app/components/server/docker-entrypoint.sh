#!/bin/sh
set -e

echo "Waiting for database..."
until node -e "require('./db').query('SELECT 1').then(() => process.exit(0)).catch(() => process.exit(1))"; do
  sleep 2
done

echo "Starting server..."
exec node server.js