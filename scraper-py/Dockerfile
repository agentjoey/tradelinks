# Scrapling ships an official image with Chromium + browser deps preinstalled.
# (Pin a concrete tag at deploy time.)
FROM pyversion/scrapling:latest

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Install Scrapling's browser fetchers (Chromium) if not already in base image
RUN scrapling install || true

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
