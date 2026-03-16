"""URL configuration for Typst WYSIWYG Editor."""
from django.urls import path, re_path

from editor import views

urlpatterns = [
    # API: PDF export
    path('export', views.export_pdf),
    # Catch-all: serve files from public/ (index.html, editor.js, style.css…)
    re_path(r'^(?P<path>.*)$', views.serve_static),
]
