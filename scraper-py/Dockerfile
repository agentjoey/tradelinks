FROM python:3.12-slim

# System dependencies for Scrapling's StealthyFetcher (Camoufox/Firefox)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Scrapling's browser engine. StealthyFetcher runtime is
# Camoufox/Firefox; `scrapling install` still downloads Playwright Chromium
# dependencies as part of its install step. Only a separate Patchright browser
# install was redundant. Fail-closed: if the browser cannot be installed the
# image build must stop.
RUN scrapling install

# Build-time import smoke: verifies StealthyFetcher can be imported after
# scrapling install (exercises BrowserForge UA generation). Fails the build
# if the import chain is broken (e.g. incompatible BrowserForge/apify).
RUN python -c "from scrapling.fetchers import StealthyFetcher; print('StealthyFetcher OK')"

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
