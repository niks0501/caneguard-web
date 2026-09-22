#!/bin/sh

set -eu

cd /var/www/html

echo "Starting CaneGuard deployment..."

# Aiven SSL certificate.
# The actual certificate will be stored as a Railway secret,
# never committed to Git.
if [ -n "${AIVEN_CA_CERT:-}" ]; then
    printf '%s\n' "$AIVEN_CA_CERT" > /tmp/aiven-ca.pem
    export MYSQL_ATTR_SSL_CA=/tmp/aiven-ca.pem
fi

# Railway mounts volumes at runtime, so permissions need to be
# corrected after the volume has been mounted.
mkdir -p \
    storage/app/private \
    storage/framework/cache/data \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs \
    bootstrap/cache

chown -R www-data:www-data storage bootstrap/cache

# Clear stale build-time configuration.
php artisan config:clear

echo "Running database migrations..."
php artisan migrate --force

echo "Caching Laravel configuration..."
php artisan config:cache

# Railway provides the listening port at runtime.
PORT="${PORT:-8080}"

sed -ri "s/^Listen [0-9]+/Listen ${PORT}/" /etc/apache2/ports.conf
sed -ri \
    "s/<VirtualHost \*:[0-9]+>/<VirtualHost *:${PORT}>/" \
    /etc/apache2/sites-available/000-default.conf

echo "Starting Apache on port ${PORT}..."

exec apache2-foreground
