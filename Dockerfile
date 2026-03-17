FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies (includes gunicorn for production serving)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Runtime environment
ENV DJANGO_SETTINGS_MODULE=typst_editor.settings \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "60", "--graceful-timeout", "30", "typst_editor.wsgi:application"]
