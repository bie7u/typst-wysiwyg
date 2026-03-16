"""Views for Typst WYSIWYG Editor."""
import base64
import json
import mimetypes
import os
import re
import secrets
import shutil
import tempfile
import threading
import time
from pathlib import Path

import typst
from django.conf import settings
from django.http import FileResponse, HttpResponse, HttpResponseNotFound, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

# ---------------------------------------------------------------------------
# Simple in-memory rate limiter
# Limits each IP to RATE_LIMIT_MAX export requests per RATE_LIMIT_WINDOW seconds.
# ---------------------------------------------------------------------------
_RATE_LIMIT_WINDOW = 60   # seconds
_RATE_LIMIT_MAX    = 15   # requests per window per IP

_rate_store: dict = {}
_rate_lock  = threading.Lock()


def _check_rate_limit(ip: str) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds)."""
    now = time.monotonic()
    with _rate_lock:
        # Remove stale entries
        stale = [k for k, v in _rate_store.items() if now >= v['reset_at']]
        for k in stale:
            del _rate_store[k]

        record = _rate_store.get(ip)
        if not record or now >= record['reset_at']:
            record = {'count': 0, 'reset_at': now + _RATE_LIMIT_WINDOW}
            _rate_store[ip] = record

        record['count'] += 1
        if record['count'] > _RATE_LIMIT_MAX:
            retry_after = int(record['reset_at'] - now) + 1
            return False, retry_after

    return True, 0


# ---------------------------------------------------------------------------
# Static file serving (replaces express.static)
# ---------------------------------------------------------------------------
_PUBLIC_DIR = Path(settings.BASE_DIR) / 'public'


def serve_static(request, path: str = ''):
    """Serve files from public/.  '/' → index.html."""
    if not path:
        path = 'index.html'

    # Resolve and guard against path-traversal
    try:
        target = (_PUBLIC_DIR / path).resolve()
        target.relative_to(_PUBLIC_DIR.resolve())
    except ValueError:
        return HttpResponseNotFound()

    if not target.is_file():
        return HttpResponseNotFound()

    content_type, _ = mimetypes.guess_type(str(target))
    # Django's FileResponse closes the file handle after streaming — do NOT use
    # a `with` context manager here, as that would close the file before Django
    # has a chance to read and send it.
    return FileResponse(
        open(target, 'rb'),
        content_type=content_type or 'application/octet-stream',
    )


# ---------------------------------------------------------------------------
# POST /export
# Body: { "content": "<typst source>", "images": { "<placeholder>": "<base64>" } }
# Returns: application/pdf  –or–  JSON error
# ---------------------------------------------------------------------------
@csrf_exempt
@require_POST
def export_pdf(request):
    # Parse JSON body
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'Nieprawidłowe dane JSON.'}, status=400)

    content = body.get('content', '')
    images  = body.get('images', {})

    if not content or not content.strip():
        return JsonResponse({'error': 'Brak treści do wyeksportowania.'}, status=400)

    # Rate limiting — respect X-Forwarded-For when behind a proxy
    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip = forwarded_for.split(',')[0].strip() if forwarded_for else request.META.get('REMOTE_ADDR', 'unknown')

    allowed, retry_after = _check_rate_limit(ip)
    if not allowed:
        response = JsonResponse(
            {'error': f'Zbyt wiele żądań. Spróbuj ponownie za {retry_after} sekund.'},
            status=429,
        )
        response['Retry-After'] = str(retry_after)
        return response

    # Build the virtual filesystem for typst-py.
    # For pure-text documents we pass the content bytes directly to typst.compile().
    # For documents with embedded images we create an isolated temp directory,
    # write all files there (source + images), and compile using relative paths.
    # This ensures Typst's root is limited to that temp directory and cannot
    # access other parts of the filesystem.
    uid     = secrets.token_hex(8)
    tmp_dir = None   # only created when images are present

    processed = content

    try:
        # Check if there are any valid images to embed
        img_entries = []
        for idx, (placeholder, data_url) in enumerate(images.items()):
            m = re.match(r'^data:image/(\w+);base64,(.+)$', data_url, re.DOTALL)
            if not m:
                continue
            img_entries.append((placeholder, m.group(1), m.group(2), idx))

        if img_entries:
            # Create an isolated temp directory for this compile job
            tmp_dir = tempfile.mkdtemp(prefix=f'typst-{uid}-')
            for placeholder, ext, b64, idx in img_entries:
                img_name = f'img-{idx}.{ext}'
                img_path = os.path.join(tmp_dir, img_name)
                with open(img_path, 'wb') as fh:
                    fh.write(base64.b64decode(b64))
                # Replace the placeholder with the relative filename so Typst
                # resolves it inside the temp directory (no absolute paths).
                processed = processed.replace(placeholder, img_name)

            typ_path = os.path.join(tmp_dir, 'main.typ')
            with open(typ_path, 'w', encoding='utf-8') as fh:
                fh.write(processed)
            # Compile from the .typ file; Typst automatically uses its
            # parent directory as root, so only files in tmp_dir are reachable.
            pdf_bytes = typst.compile(typ_path)
        else:
            # No images — compile entirely in memory (no disk I/O)
            pdf_bytes = typst.compile(processed.encode('utf-8'))

    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)
    finally:
        if tmp_dir:
            try:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            except OSError:
                pass

    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = 'attachment; filename="dokument.pdf"'
    return response
