"""
Django settings for Typst WYSIWYG Editor.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-typst-wysiwyg-change-in-production',
)
DEBUG = os.environ.get('DEBUG', 'False') == 'True'
# `*` allows any Host header, which is required for self-hosted VPS deployments
# where the server hostname is not known at config time.  If you want to restrict
# access, set ALLOWED_HOSTS to a comma-separated list (e.g. example.com,192.0.2.1).
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    'editor',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'typst_editor.urls'

WSGI_APPLICATION = 'typst_editor.wsgi.application'

# No database required
DATABASES = {}

# ---------------------------------------------------------------------------
# Internationalisation
# ---------------------------------------------------------------------------
LANGUAGE_CODE = 'pl'
TIME_ZONE = 'Europe/Warsaw'
USE_I18N = False
USE_TZ = True

# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
# The public/ directory is served directly via the catch-all URL pattern,
# so Django's static-files machinery is not used at runtime.
STATIC_URL = '/static/'
