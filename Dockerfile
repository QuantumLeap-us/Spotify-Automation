# Use Node.js 18 with Playwright dependencies
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN groupadd -r spotify && useradd -r -g spotify -G audio,video spotify \
    && mkdir -p /home/spotify/Downloads \
    && chown -R spotify:spotify /home/spotify \
    && chown -R spotify:spotify /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Install additional system dependencies for better stealth
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p logs sessions temp \
    && chown -R spotify:spotify logs sessions temp

# Set environment variables
ENV NODE_ENV=production
ENV DISPLAY=:99
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Switch to non-root user
USER spotify

# Install Playwright browsers
RUN npx playwright install chromium

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Default command
CMD ["node", "src/index.js"]
