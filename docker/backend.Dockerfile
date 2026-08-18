FROM python:3.12-slim

WORKDIR /app

# rasterio's wheel dynamically links against these
RUN apt-get update && apt-get install -y --no-install-recommends \
    libexpat1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY analysis/plots.py analysis/plots.py
COPY analysis/noise.py analysis/noise.py
COPY analysis/noise_impact.py analysis/noise_impact.py
COPY frontend/src/data/colors.json frontend/src/data/colors.json

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
