# syntax=docker/dockerfile:1

# ------------------------------------------------------------
# Stage 1: Build the React/Vite frontend
# ------------------------------------------------------------
FROM node:22-bookworm-slim AS frontend

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL
ARG VITE_DATA_SOURCE=api
ARG VITE_REPORT_REFRESH_MS=600000
ARG VITE_MAPTILER_KEY=
ARG VITE_REALTIME_ENABLED=false

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_DATA_SOURCE=${VITE_DATA_SOURCE} \
    VITE_REPORT_REFRESH_MS=${VITE_REPORT_REFRESH_MS} \
    VITE_MAPTILER_KEY=${VITE_MAPTILER_KEY} \
    VITE_REALTIME_ENABLED=${VITE_REALTIME_ENABLED}

RUN npm run build


# ------------------------------------------------------------
# Stage 2: Laravel / Apache runtime
# ------------------------------------------------------------
FROM php:8.3-apache-bookworm AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        unzip \
        libicu-dev \
        libonig-dev \
        libzip-dev \
        libxml2-dev \
    && docker-php-ext-install \
        pdo_mysql \
        mbstring \
        intl \
        bcmath \
        zip \
        opcache \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

# mod_php requires the prefork MPM. Debian enables the event MPM by
# default, which coexists with prefork here and makes Apache exit with
# "More than one MPM loaded"; enforce exactly one MPM at build time.
RUN a2dismod mpm_event mpm_worker 2>/dev/null; a2enmod mpm_prefork

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public

RUN sed -ri -e "s!/var/www/html!${APACHE_DOCUMENT_ROOT}!g" \
        /etc/apache2/sites-available/*.conf \
        /etc/apache2/apache2.conf \
        /etc/apache2/conf-available/*.conf \
    && sed -ri "s/AllowOverride None/AllowOverride All/g" \
        /etc/apache2/apache2.conf

WORKDIR /var/www/html

COPY api/ ./
# Contract readers use base_path('../docs/...'); weekly rendering uses ../brand.
COPY docs/contracts/mobile-report-upload-v1.json docs/contracts/mobile-report-upload-v2.json docs/contracts/mobile-field-validation-assignment-v1.json docs/contracts/mobile-field-validation-completion-v1.json docs/contracts/mobile-notifications-v1.json /var/www/docs/contracts/
COPY brand/CaneGuard_logo_flat.svg /var/www/brand/
COPY railway/uploads.ini /usr/local/etc/php/conf.d/caneguard-uploads.ini
# Fail the image build if mod_php's CLI-shared upload configuration is missing.
RUN php -r 'if (ini_get("upload_max_filesize") !== "12M" || ini_get("post_max_size") !== "16M") { exit(1); }'

RUN composer install \
    --no-dev \
    --prefer-dist \
    --no-interaction \
    --no-progress \
    --optimize-autoloader

# Put the compiled React application inside Laravel's public directory.
COPY --from=frontend /app/dist/ ./public/

COPY railway/start.sh /usr/local/bin/caneguard-start

RUN chmod +x /usr/local/bin/caneguard-start \
    && mkdir -p \
        storage/app/private \
        storage/framework/cache/data \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs \
        bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

CMD ["/usr/local/bin/caneguard-start"]
