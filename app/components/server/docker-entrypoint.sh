#!/bin/sh
set -e

echo "Waiting for database..."
until node -e "require('./db').query('SELECT 1').then(() => process.exit(0)).catch(() => process.exit(1))"; do
  sleep 2
done

echo "Running database migration..."
npm run migrate

echo "Ensuring admin user exists..."
npm run bootstrap-admin

echo "Starting server..."
exec node server.js