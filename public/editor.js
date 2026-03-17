/* ═══════════════════════════════════════════════════════════════════
   Typst WYSIWYG Editor  –  editor.js  (Quill integration)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────
     HTML → TYPST CONVERTER
     ───────────────────────────────────────────────────────────────── */
  const TypstConverter = {

    /* Escape plain text so it is safe inside Typst markup */
    escapeText(text) {
      return text
        .replace(/\\/g,  '\\\\')
        .replace(/#/g,   '\\#')
        .replace(/\*/g,  '\\*')
        .replace(/_/g,   '\\_')
        .replace(/`/g,   '\\`')
        .replace(/\$/g,  '\\$')
        .replace(/@/g,   '\\@')
        .replace(/~/g,   '\\~');
    },

    /* Convert rgb(...) / rgba(...) / #hex to Typst rgb() call */
    cssColorToTypst(color) {
      if (!color) return null;
      const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgb) {
        const hex = [rgb[1], rgb[2], rgb[3]]
          .map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
        return `rgb("#${hex}")`;
      }
      if (/^#[0-9a-fA-F]{3,6}$/.test(color)) return `rgb("${color}")`;
      const named = { black:'black', white:'white', red:'red', green:'green',
        blue:'blue', yellow:'yellow', orange:'orange', purple:'purple',
        gray:'gray', grey:'gray' };
      return named[color.toLowerCase()] || null;
    },

    /* px → pt conversion (approximate) */
    cssSizeToTypst(size) {
      if (!size) return null;
      const px = size.match(/^([\d.]+)px$/);
      if (px) return `${Math.round(parseFloat(px[1]) * 0.75)}pt`;
      const pt = size.match(/^([\d.]+)pt$/);
      if (pt) return `${pt[1]}pt`;
      const em = size.match(/^([\d.]+)em$/);
      if (em) return `${em[1]}em`;
      return null;
    },

    /* Wrap content with alignment if needed.
       Handles both inline style (contenteditable) and Quill's class-based alignment. */
    withAlignment(node, content) {
      // Inline style takes precedence
      let align = node.style && node.style.textAlign;
      // Fall back to Quill's ql-align-* class (only accept known values)
      if (!align) {
        const m = (node.className || '').match(/ql-align-(\w+)/);
        if (m && ['center', 'right', 'justify'].includes(m[1])) align = m[1];
      }
      if (!align || align === 'left' || align === 'start') return content;
      // Typst has no 'justify' alignment value; #align(justify) is a compile error.
      // Justified text must use #par(justify: true) instead.
      if (align === 'justify') return `#par(justify: true)[\n${content.trim()}\n]`;
      return `#align(${align})[\n${content.trim()}\n]`;
    },

    /* Wrap content with left-padding if needed */
    withPadding(node, content) {
      const pl = (node.style && node.style.paddingLeft) || '';
      if (!pl) return content;
      return `#pad(left: ${pl})[\n${content.trim()}\n]`;
    },

    /* Process a <span> with inline styles */
    spanToTypst(node, inner) {
      let result = inner;
      const s = node.style;

      if (s.verticalAlign === 'super') return `#super[${result}]`;
      if (s.verticalAlign === 'sub')   return `#sub[${result}]`;

      // font-size
      if (s.fontSize) {
        const sz = this.cssSizeToTypst(s.fontSize);
        if (sz) result = `#text(size: ${sz})[${result}]`;
      }
      // font-family: inline style takes priority; fall back to Quill's ql-font-* class
      if (s.fontFamily) {
        const f = s.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
        if (f) result = `#text(font: "${f}")[${result}]`;
      } else {
        const fontClass = (node.className || '').match(/ql-font-(\S+)/);
        if (fontClass) {
          const fontMap = {
            'serif':     'New Computer Modern',
            'monospace': 'DejaVu Sans Mono',
          };
          const fontName = fontMap[fontClass[1]];
          if (fontName) result = `#text(font: "${fontName}")[${result}]`;
        }
      }
      // background (highlight)
      if (s.backgroundColor) {
        const c = this.cssColorToTypst(s.backgroundColor);
        if (c) result = `#highlight(fill: ${c})[${result}]`;
      }
      // text color
      if (s.color) {
        const c = this.cssColorToTypst(s.color);
        if (c) result = `#text(fill: ${c})[${result}]`;
      }
      // bold
      if (s.fontWeight === 'bold' || parseInt(s.fontWeight) >= 700) {
        result = `#strong[${result}]`;
      }
      // italic
      if (s.fontStyle === 'italic') {
        result = `#emph[${result}]`;
      }
      // underline / strikethrough
      const td = s.textDecoration || s.textDecorationLine || '';
      if (td.includes('underline'))    result = `#underline[${result}]`;
      if (td.includes('line-through')) result = `#strike[${result}]`;

      return result;
    },

    /* Apply inline color / background-color styles found directly on a
       semantic tag (e.g. <strong style="color:red">) to its already-
       converted Typst content.  Quill puts these styles on the tag itself
       rather than on a child <span>, so spanToTypst never sees them. */
    applyNodeStyles(node, content) {
      let result = content;
      const s = node.style;
      if (!s) return result;
      if (s.backgroundColor) {
        const c = this.cssColorToTypst(s.backgroundColor);
        if (c) result = `#highlight(fill: ${c})[${result}]`;
      }
      if (s.color) {
        const c = this.cssColorToTypst(s.color);
        if (c) result = `#text(fill: ${c})[${result}]`;
      }
      return result;
    },

    /* Convert a list node (ul / ol) */
    listToTypst(node, ordered) {
      const items = Array.from(node.children).filter(el => el.tagName === 'LI');
      const lines = items.map(li => {
        const indentMatch = (li.className || '').match(/ql-indent-(\d+)/);
        const level = indentMatch ? parseInt(indentMatch[1], 10) : 0;
        const indent = '  '.repeat(level);
        const content = Array.from(li.childNodes)
          .map(c => this.nodeToTypst(c)).join('').trim();
        return `${indent}${ordered ? '+' : '-'} ${content}`;
      });
      return '\n' + lines.join('\n') + '\n\n';
    },

    /* Convert an HTML <table> */
    tableToTypst(node) {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (!rows.length) return '';
      const maxCols = Math.max(...rows.map(r => r.children.length));

      const parts = [];
      let headerDone = false;
      rows.forEach(row => {
        const cells = Array.from(row.children);
        const allTH  = cells.every(c => c.tagName === 'TH');
        const cellStrs = cells.map(cell => {
          const content = Array.from(cell.childNodes)
            .map(c => this.nodeToTypst(c)).join('').trim();
          return `[${content}]`;
        });
        if (allTH && !headerDone) {
          parts.push(`table.header(${cellStrs.join(', ')})`);
          headerDone = true;
        } else {
          cellStrs.forEach(s => parts.push(s));
        }
      });
      return `\n#table(\n  columns: ${maxCols},\n  ${parts.join(',\n  ')}\n)\n\n`;
    },

    /* Main recursive node converter */
    nodeToTypst(node, ctx) {
      ctx = ctx || {};

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (ctx.inCode) return text;
        if (/^\s*$/.test(text)) {
          const BLOCK = new Set(['h1','h2','h3','h4','h5','h6','p','div','ul','ol',
                                  'li','table','thead','tbody','tr','td','th',
                                  'blockquote','pre','hr','figure']);
          const isBlock = n => n && n.nodeType === Node.ELEMENT_NODE &&
                               BLOCK.has(n.tagName.toLowerCase());
          if (isBlock(node.previousSibling) || isBlock(node.nextSibling)) return '';
          const pTag = node.parentNode && node.parentNode.tagName &&
                       node.parentNode.tagName.toLowerCase();
          if (['div','body','main','section','article','ul','ol',
               'table','tbody','thead','tr'].includes(pTag)) return '';
        }
        return this.escapeText(text);
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const tag = node.tagName.toLowerCase();
      const childCtx = Object.assign({}, ctx, { inCode: ctx.inCode || tag === 'code' || tag === 'pre' });
      const children = () =>
        Array.from(node.childNodes).map(c => this.nodeToTypst(c, childCtx)).join('');

      switch (tag) {
        case 'h1': return `\n= ${children().trim()}\n\n`;
        case 'h2': return `\n== ${children().trim()}\n\n`;
        case 'h3': return `\n=== ${children().trim()}\n\n`;
        case 'h4': return `\n==== ${children().trim()}\n\n`;
        case 'h5': return `\n===== ${children().trim()}\n\n`;
        case 'h6': return `\n====== ${children().trim()}\n\n`;

        case 'p':
        case 'div': {
          const inner = children().trim();
          if (!inner || /^\\+$/.test(inner)) return '\n';
          const aligned = this.withAlignment(node, inner);
          const padded  = this.withPadding(node, aligned);
          return padded + '\n\n';
        }

        case 'br': return '\\\n';
        case 'hr': return '\n#line(length: 100%)\n\n';

        case 'blockquote':
          return `\n#quote(block: true)[\n${children().trim()}\n]\n\n`;

        case 'pre': {
          // Handle both standard <pre><code class="language-*"> and Quill's <pre class="ql-syntax">
          const codeEl = node.querySelector('code');
          const lang = codeEl
            ? (codeEl.className.match(/language-(\w+)/) || [])[1] || ''
            : '';
          const src = (codeEl || node).textContent;
          return `\n\`\`\`${lang}\n${src}\n\`\`\`\n\n`;
        }

        case 'ul': return this.listToTypst(node, false);
        case 'ol': return this.listToTypst(node, true);
        case 'li': return children();

        case 'table': return this.tableToTypst(node);

        case 'strong':
        case 'b': return `#strong[${this.applyNodeStyles(node, children())}]`;

        case 'em':
        case 'i': return `#emph[${this.applyNodeStyles(node, children())}]`;

        case 'u': return `#underline[${this.applyNodeStyles(node, children())}]`;

        case 's':
        case 'del':
        case 'strike': return `#strike[${this.applyNodeStyles(node, children())}]`;

        case 'sup': return `#super[${children()}]`;
        case 'sub': return `#sub[${children()}]`;

        case 'code': {
          const inner = node.textContent;
          if (ctx.inCode) return inner;
          return `\`${inner}\``;
        }

        case 'mark': {
          const c = this.cssColorToTypst(node.style.backgroundColor || '#ffff00') || 'yellow';
          return `#highlight(fill: ${c})[${children()}]`;
        }

        case 'a': {
          const href = node.getAttribute('href') || '#';
          return `#link("${href}")[${children()}]`;
        }

        case 'img': {
          const src = node.getAttribute('src') || '';
          const width = node.dataset.width;
          const widthArg = width ? `, width: ${width}` : '';
          if (src.startsWith('data:')) {
            let id = node.dataset.typstId;
            if (!id) {
              id = 'img-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
              node.dataset.typstId = id;
            }
            return `\n#image("${id}"${widthArg})\n\n`;
          }
          return `\n#image("${src}"${widthArg})\n\n`;
        }

        case 'span': return this.spanToTypst(node, children());

        case 'font': {
          let res = children();
          const face = node.getAttribute('face');
          const color = node.getAttribute('color');
          if (face) res = `#text(font: "${face}")[${res}]`;
          if (color) {
            const c = this.cssColorToTypst(color);
            if (c) res = `#text(fill: ${c})[${res}]`;
          }
          return res;
        }

        case 'figure': return children();

        default:
          return children();
      }
    },

    /* Build the Typst document from editor innerHTML */
    convert(html) {
      const div = document.createElement('div');
      div.innerHTML = html;
      const body = Array.from(div.childNodes)
        .map(n => this.nodeToTypst(n))
        .join('');

      // Collect embedded images (data URLs) → pass as separate map
      const images = {};
      div.querySelectorAll('img[data-typst-id]').forEach(img => {
        images[img.dataset.typstId] = img.src;
      });

      const preamble = [
        '#set page(paper: "a4", margin: (x: 2.5cm, y: 2cm))',
        '#set text(size: 11pt, lang: "pl")',
        '#set par(justify: false, leading: 0.65em)',
        '#set enum(numbering: "1.a.i.")',
        '#set list(marker: ("•", "◦", "▪"))',
        '#show heading: set text(fill: rgb("#1a1a2e"))',
        '#show link: underline',
        '',
      ].join('\n');

      return { source: preamble + '\n' + body.trim() + '\n', images };
    },
  };

  /* ─────────────────────────────────────────────────────────────────
     QUILL INITIALIZATION
     ───────────────────────────────────────────────────────────────── */

  const toolbarOptions = [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ script: 'sub' }, { script: 'super' }],
    [{ indent: '-1' }, { indent: '+1' }],
    [{ color: [] }, { background: [] }],
    [{ font: [] }],
    [{ align: [] }],
    ['link', 'image'],
    ['clean'],
  ];

  const quill = new Quill('#editor', {
    modules: { toolbar: toolbarOptions },
    theme: 'snow',
    placeholder: 'Zacznij pisać tutaj...',
  });

  /* Set initial document content */
  quill.clipboard.dangerouslyPasteHTML(
    '<h1>Mój dokument</h1>' +
    '<p>Witaj w edytorze <strong>Typst WYSIWYG</strong>! ' +
    'Zacznij pisać tutaj i używaj paska narzędzi, aby formatować tekst.</p>' +
    '<p>Po zakończeniu kliknij <em>Eksportuj PDF</em> — dokument zostanie skompilowany przez ' +
    '<strong>Typst</strong> i pobrany.</p>'
  );

  /* ─────────────────────────────────────────────────────────────────
     IMAGE FILE UPLOAD HANDLER
     Replace Quill's default URL prompt with a file picker.
     ───────────────────────────────────────────────────────────────── */
  quill.getModule('toolbar').addHandler('image', () => {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = 'image/*';
    input.click();
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const range = quill.getSelection(true);
        quill.insertEmbed(range.index, 'image', reader.result, 'user');
      });
      reader.readAsDataURL(file);
    });
  });

  /* ─────────────────────────────────────────────────────────────────
     IMAGE RESIZE TOOLBAR
     Click an image to reveal a floating toolbar for resizing.
     ───────────────────────────────────────────────────────────────── */
  const MIN_IMG_WIDTH = 10;   // percent
  const MAX_IMG_WIDTH = 100;  // percent

  const imgToolbar = document.createElement('div');
  imgToolbar.id        = 'img-toolbar';
  imgToolbar.className = 'hidden';
  imgToolbar.innerHTML =
    '<button data-action="smaller" title="Zmniejsz (−10%)">−</button>' +
    '<span id="img-size-display">100%</span>' +
    '<button data-action="larger"  title="Zwiększ (+10%)">+</button>' +
    '<span class="img-toolbar-sep"></span>' +
    '<button data-size="25">25%</button>' +
    '<button data-size="50">50%</button>' +
    '<button data-size="75">75%</button>' +
    '<button data-size="100">100%</button>';
  document.body.appendChild(imgToolbar);

  let activeImg = null;

  function applyImgWidth(img, pct) {
    img.dataset.width = pct + '%';
    img.style.width   = pct + '%';
    document.getElementById('img-size-display').textContent = pct + '%';
    syncAll();
  }

  function positionImgToolbar(img) {
    const rect = img.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - 290);
    imgToolbar.style.top  = (rect.bottom + 6) + 'px';
    imgToolbar.style.left = Math.max(4, left) + 'px';
  }

  quill.root.addEventListener('click', e => {
    if (e.target.tagName === 'IMG') {
      if (activeImg) activeImg.classList.remove('img-selected');
      activeImg = e.target;
      activeImg.classList.add('img-selected');
      const pct = parseInt(activeImg.dataset.width) || 100;
      document.getElementById('img-size-display').textContent = pct + '%';
      imgToolbar.classList.remove('hidden');
      positionImgToolbar(activeImg);
    } else if (!imgToolbar.contains(e.target)) {
      if (activeImg) activeImg.classList.remove('img-selected');
      activeImg = null;
      imgToolbar.classList.add('hidden');
    }
  });

  imgToolbar.addEventListener('click', e => {
    if (!activeImg) return;
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const size   = btn.dataset.size;
    if (action === 'smaller') {
      applyImgWidth(activeImg, Math.max(MIN_IMG_WIDTH, (parseInt(activeImg.dataset.width) || 100) - 10));
    } else if (action === 'larger') {
      applyImgWidth(activeImg, Math.min(MAX_IMG_WIDTH, (parseInt(activeImg.dataset.width) || 100) + 10));
    } else if (size) {
      applyImgWidth(activeImg, parseInt(size));
    }
    positionImgToolbar(activeImg);
  });

  document.getElementById('editor-pane').addEventListener('scroll', () => {
    if (activeImg) positionImgToolbar(activeImg);
  }, true);

  window.addEventListener('resize', () => {
    if (activeImg) positionImgToolbar(activeImg);
  });

  /* ─────────────────────────────────────────────────────────────────
     UI ELEMENTS
     ───────────────────────────────────────────────────────────────── */

  const typstSource      = document.getElementById('typst-source');
  const toast            = document.getElementById('toast');
  const statusMsg        = document.getElementById('status-msg');
  const wordCount        = document.getElementById('word-count');
  const charCount        = document.getElementById('char-count');
  const outputFormat     = document.getElementById('output-format');
  const outputFormatLabel = document.getElementById('output-format-label');

  let toastTimer = null;

  /* ─────────────────────────────────────────────────────────────────
     FORMAT SELECTOR (HTML / Typst)
     ───────────────────────────────────────────────────────────────── */

  function getOutputFormat() {
    return outputFormat.value; // 'typst' | 'html'
  }

  function updateFormatLabel() {
    if (getOutputFormat() === 'html') {
      outputFormatLabel.textContent = 'Źródło HTML';
    } else {
      outputFormatLabel.textContent = 'Źródło Typst';
    }
  }

  outputFormat.addEventListener('change', () => {
    updateFormatLabel();
    syncAll();
  });

  /* ─────────────────────────────────────────────────────────────────
     SYNC: update right panel with selected output format
     ───────────────────────────────────────────────────────────────── */

  function syncAll() {
    const html = quill.root.innerHTML;
    if (getOutputFormat() === 'html') {
      typstSource.textContent = html;
    } else {
      const { source } = TypstConverter.convert(html);
      typstSource.textContent = source;
    }
    updateCounts();
  }

  function updateCounts() {
    const text  = quill.getText() || '';
    const trimmed = text.trimEnd();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    wordCount.textContent = `Słowa: ${words}`;
    charCount.textContent = `Znaki: ${trimmed.length}`;
  }

  /* Listen for any change in the editor */
  quill.on('text-change', syncAll);

  /* ─────────────────────────────────────────────────────────────────
     COPY BUTTON
     ───────────────────────────────────────────────────────────────── */

  document.getElementById('btn-copy-output').addEventListener('click', () => {
    const text = typstSource.textContent;
    navigator.clipboard.writeText(text)
      .then(() => showToast('📋 Skopiowano!', 'ok', 2000))
      .catch(() => showToast('❌ Nie można skopiować', 'err', 2000));
  });

  /* ─────────────────────────────────────────────────────────────────
     TOAST & STATUS HELPERS
     ───────────────────────────────────────────────────────────────── */

  function showToast(msg, type, duration) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className   = type || '';
    toast.classList.remove('hidden');
    toastTimer = setTimeout(() => toast.classList.add('hidden'), duration || 4000);
  }

  function setStatus(msg, type) {
    statusMsg.textContent = msg;
    statusMsg.className   = type || '';
  }

  /* ─────────────────────────────────────────────────────────────────
     PDF EXPORT  (always converts to Typst, regardless of format selector)
     ───────────────────────────────────────────────────────────────── */

  async function exportToPDF() {
    const html = quill.root.innerHTML;
    const { source, images } = TypstConverter.convert(html);
    setStatus('Eksportowanie...', 'warn');
    const btn = document.getElementById('btn-export');
    btn.disabled = true;

    try {
      const resp = await fetch('/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: source, images }),
      });

      if (resp.ok && resp.headers.get('Content-Type') === 'application/pdf') {
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = 'dokument.pdf';
        a.click();
        URL.revokeObjectURL(url);
        setStatus('PDF gotowy ✓', 'ok');
        showToast('✅ PDF został pobrany!', 'ok', 3000);
      } else {
        const data = await resp.json().catch(() => ({}));
        if (resp.status === 503) {
          setStatus('Typst nie zainstalowany', 'err');
          showToast(
            '⚠️ Typst nie jest zainstalowany.\n\nKod Typst skopiowany do schowka. ' +
            'Wklej go na https://typst.app/ lub zainstaluj lokalnie.',
            'warn', 8000
          );
          navigator.clipboard.writeText(source).catch(() => {});
        } else {
          const msg = data.error || 'Błąd eksportu';
          setStatus('Błąd eksportu', 'err');
          showToast('❌ ' + msg, 'err', 6000);
        }
      }
    } catch (err) {
      setStatus('Błąd połączenia', 'err');
      showToast('❌ Nie można połączyć się z serwerem: ' + err.message, 'err', 6000);
    } finally {
      btn.disabled = false;
    }
  }

  document.getElementById('btn-export').addEventListener('click', exportToPDF);

  /* ─────────────────────────────────────────────────────────────────
     PANEL RESIZING
     ───────────────────────────────────────────────────────────────── */
  (function initResizer() {
    const divider    = document.getElementById('panel-divider');
    const editorPane = document.getElementById('editor-pane');
    const typstPane  = document.getElementById('typst-pane');
    let   dragging   = false;
    let   startX, startEdW;

    divider.addEventListener('mousedown', (e) => {
      dragging = true;
      startX   = e.clientX;
      startEdW = editorPane.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const delta  = e.clientX - startX;
      const total  = editorPane.parentElement.getBoundingClientRect().width - 5;
      const newW   = Math.max(200, Math.min(total - 200, startEdW + delta));
      editorPane.style.flex = `0 0 ${newW}px`;
      typstPane.style.flex  = `0 0 ${total - newW}px`;
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }());

  /* ─────────────────────────────────────────────────────────────────
     KEYBOARD SHORTCUTS  (Ctrl/Cmd+S → export PDF)
     Quill already handles Ctrl+B/I/U/Z/Y natively.
     ───────────────────────────────────────────────────────────────── */
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      exportToPDF();
    }
  });

  /* ─────────────────────────────────────────────────────────────────
     INITIAL RENDER
     ───────────────────────────────────────────────────────────────── */
  updateFormatLabel();
  syncAll();

}());
