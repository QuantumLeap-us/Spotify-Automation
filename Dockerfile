# Stage 1: Build environment with Node.js 18 Alpine
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for potential build scripts if any, then prune)
# Alpine needs python, make, g++ for some native modules if any.
# Add common build tools. If your app has specific native deps, add them here.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm install \
    && npm prune --production \
    && apk del .build-deps

# Stage 2: Runtime environment with Playwright
FROM mcr.microsoft.com/playwright:v1.40.0-focal AS runtime

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN groupadd -r spotify && useradd -r -g spotify -G audio,video spotify \
    && mkdir -p /home/spotify/Downloads \
    && chown -R spotify:spotify /home/spotify \
    && chown -R spotify:spotify /app

# Copy production node_modules from base stage
COPY --from=base /app/node_modules ./node_modules

# Install additional system dependencies for Playwright & stealth in the runtime stage
# Curl is needed for healthcheck
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    xvfb \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p logs sessions temp \
    && chown -R spotify:spotify logs sessions temp

# Set environment variables
ENV NODE_ENV=production
ENV DISPLAY=:99 # For Xvfb
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright # Default Playwright browser path in this image

# Switch to non-root user
USER spotify

# Install Playwright browsers (Chromium is typically included in the Playwright base image,
# but explicitly installing ensures it's there and matches version if needed)
# This step might be redundant if the specific Playwright image version already includes it.
# RUN npx playwright install chromium
# The base mcr.microsoft.com/playwright image should already have browsers.
# If specific browser versions are needed or different ones, this line would be adjusted.

# Health Check - Updated to /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expose port (application should listen on this port, e.g. dashboard)
EXPOSE 3000

# Default command
CMD ["node", "src/index.js"]
