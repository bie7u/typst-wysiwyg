/* ═══════════════════════════════════════════════════════════════════
   Typst WYSIWYG Editor  –  editor.js
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────
     EMOJI DATA
     ───────────────────────────────────────────────────────────────── */
  const EMOJIS = [
    '😀','😁','😂','🤣','😃','😄','😅','😆','😇','😉','😊','🙂','😋','😎',
    '😍','🤩','😘','🥰','😗','😙','😚','🤔','🤨','😐','😑','😶','🙄','😏',
    '😣','😥','😮','🤐','😯','😪','😫','😴','😌','😛','😜','🤪','😝','🤑',
    '🤗','🤭','🤫','🤥','😒','😓','😔','😕','🙃','😲','☹','🙁','😖','😞',
    '😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶',
    '😳','🤪','😵','🥴','😷','🤒','🤕','🤢','🤮','🤧','🥳','🥺','🤡','💀',
    '👍','👎','👏','🙌','🤝','🤜','🤛','✊','👊','🖐','✋','🤚','🤙','💪',
    '🦾','🙏','💅','🤳','💡','🔥','⭐','✅','❌','❓','❗','💯','🎉','🎊',
    '📝','📄','📊','📈','📉','🔍','🔎','📌','📍','🗂','📁','📂','🖥','💻',
    '📱','⌨','🖨','🖱','💾','💿','📀','🎵','🎶','🔔','🔕','🔊','🔇','📣',
    '❤','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💕','💞','💓','💗','💘',
    '→','←','↑','↓','↔','↕','⇒','⇐','⇑','⇓','⇔','•','–','—','…','©','®','™',
  ];

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

    /* Wrap content with alignment if needed */
    withAlignment(node, content) {
      const align = node.style && node.style.textAlign;
      if (!align || align === 'left' || align === 'start') return content;
      return `#align(${align === 'justify' ? 'justify' : align})[\n${content.trim()}\n]`;
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
      // font-family
      if (s.fontFamily) {
        const f = s.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
        if (f) result = `#text(font: "${f}")[${result}]`;
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
      // bold — styleWithCSS produces span[style="font-weight:bold"] or "700"
      if (s.fontWeight === 'bold' || parseInt(s.fontWeight) >= 700) {
        result = `*${result}*`;
      }
      // italic — styleWithCSS produces span[style="font-style:italic"]
      if (s.fontStyle === 'italic') {
        result = `_${result}_`;
      }
      // underline / strikethrough — styleWithCSS puts these in text-decoration.
      // Applied outermost last: bold → italic → underline → strikethrough.
      const td = s.textDecoration || s.textDecorationLine || '';
      if (td.includes('underline'))    result = `#underline[${result}]`;
      if (td.includes('line-through')) result = `#strike[${result}]`;

      return result;
    },

    /* Convert a list node (ul / ol) */
    listToTypst(node, ordered) {
      const items = Array.from(node.children).filter(el => el.tagName === 'LI');
      const lines = items.map(li => {
        // task list item?
        const checkbox = li.querySelector('input[type="checkbox"]');
        const checkSpan = li.querySelector('.task-checkbox');
        if (checkbox || checkSpan) {
          const checked = checkbox ? checkbox.checked
            : checkSpan && checkSpan.textContent.trim() === '☑';
          const raw = li.querySelector('.task-text');
          const txt = raw ? raw.textContent : li.textContent;
          return `- ${checked ? '[x]' : '[ ]'} ${this.escapeText(txt.trim())}`;
        }
        // normal item – recurse into children (supports nesting)
        const content = Array.from(li.childNodes)
          .map(c => this.nodeToTypst(c)).join('').trim();
        return `${ordered ? '+' : '-'} ${content}`;
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
          // Wrap entire header row in table.header()
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
        // Drop whitespace-only text nodes between block-level siblings
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
        // ── Structural block elements ──────────────────────────────
        case 'h1': return `\n= ${children().trim()}\n\n`;
        case 'h2': return `\n== ${children().trim()}\n\n`;
        case 'h3': return `\n=== ${children().trim()}\n\n`;
        case 'h4': return `\n==== ${children().trim()}\n\n`;
        case 'h5': return `\n===== ${children().trim()}\n\n`;
        case 'h6': return `\n====== ${children().trim()}\n\n`;

        case 'p':
        case 'div': {
          const inner = children().trim();
          // empty paragraph or just a forced line-break → produce a blank line
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
          const codeEl = node.querySelector('code');
          const lang = codeEl
            ? (codeEl.className.match(/language-(\w+)/) || [])[1] || ''
            : '';
          const src = (codeEl || node).textContent;
          return `\n\`\`\`${lang}\n${src}\n\`\`\`\n\n`;
        }

        case 'ul': return this.listToTypst(node, false);
        case 'ol': return this.listToTypst(node, true);
        case 'li': return children();   // handled by listToTypst

        case 'table': return this.tableToTypst(node);

        // ── Inline formatting ──────────────────────────────────────
        case 'strong':
        case 'b': return `*${children()}*`;

        case 'em':
        case 'i': return `_${children()}_`;

        case 'u': return `#underline[${children()}]`;

        case 's':
        case 'del':
        case 'strike': return `#strike[${children()}]`;

        case 'sup': return `#super[${children()}]`;
        case 'sub': return `#sub[${children()}]`;

        case 'code': {
          const inner = node.textContent;
          if (ctx.inCode) return inner;  // inside <pre>
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
          const alt = node.getAttribute('alt') || '';
          // base64 images get a placeholder comment
          if (src.startsWith('data:')) {
            const id = node.dataset.typstId || 'embedded-image';
            return `\n#figure(\n  image("${id}"),\n  caption: [${this.escapeText(alt)}]\n)\n\n`;
          }
          return `\n#figure(\n  image("${src}"),\n  caption: [${this.escapeText(alt)}]\n)\n\n`;
        }

        case 'span': return this.spanToTypst(node, children());

        case 'font': {
          // execCommand legacy <font> elements
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

        case 'input':
          if (node.type === 'checkbox') return node.checked ? '☑' : '☐';
          return '';

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
        '#show heading: set text(fill: rgb("#1a1a2e"))',
        '#show link: underline',
        '',
      ].join('\n');

      return { source: preamble + '\n' + body.trim() + '\n', images };
    },
  };

  /* ─────────────────────────────────────────────────────────────────
     EDITOR MAIN
     ───────────────────────────────────────────────────────────────── */

  const editor      = document.getElementById('editor');
  const typstSource = document.getElementById('typst-source');
  const overlay     = document.getElementById('overlay');
  const toast       = document.getElementById('toast');
  const statusMsg   = document.getElementById('status-msg');
  const wordCount   = document.getElementById('word-count');
  const charCount   = document.getElementById('char-count');

  let savedRange    = null;
  let toastTimer    = null;

  // ── Enable CSS-based formatting ──────────────────────────────────
  try { document.execCommand('styleWithCSS', false, true); } catch (_) {}

  // ── Emoji picker population ──────────────────────────────────────
  (function buildEmojiPicker() {
    const grid = document.getElementById('emoji-grid');
    EMOJIS.forEach(em => {
      const btn = document.createElement('button');
      btn.className  = 'emoji-btn';
      btn.type       = 'button';
      btn.textContent = em;
      btn.title      = em;
      btn.addEventListener('click', () => {
        restoreRange();
        document.execCommand('insertText', false, em);
        closeEmojiPicker();
        syncAll();
      });
      grid.appendChild(btn);
    });
  }());

  /* ── Selection helpers ──────────────────────────────────────────── */
  function saveRange() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
  }
  function restoreRange() {
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
  function getSelectedText() {
    const sel = window.getSelection();
    return sel ? sel.toString() : '';
  }

  /* ── execCommand wrapper ────────────────────────────────────────── */
  function exec(cmd, value) {
    editor.focus();
    document.execCommand(cmd, false, value || null);
    syncAll();
    updateActiveStates();
  }

  /* ── Heading / block format ─────────────────────────────────────── */
  function formatBlock(tag) {
    editor.focus();
    document.execCommand('formatBlock', false, `<${tag}>`);
    syncAll();
  }

  /* ── Code block insertion ───────────────────────────────────────── */
  function insertCodeBlock() {
    editor.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const pre  = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = range.toString() || 'kod tutaj';
    pre.appendChild(code);

    range.deleteContents();
    range.insertNode(pre);

    const after = document.createRange();
    after.setStartAfter(pre);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);

    // Add empty paragraph after so cursor can leave the block
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    pre.after(p);
    const pRange = document.createRange();
    pRange.setStart(p, 0);
    pRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(pRange);

    syncAll();
  }

  /* ── Task list insertion ─────────────────────────────────────────── */
  function insertTaskList() {
    editor.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    const ul  = document.createElement('ul');
    ul.className = 'task-list';
    const li  = document.createElement('li');
    li.className = 'task-item';

    const chk = document.createElement('span');
    chk.className  = 'task-checkbox';
    chk.contentEditable = 'false';
    chk.textContent = '☐';
    chk.addEventListener('click', toggleTaskItem);

    const txt = document.createElement('span');
    txt.className = 'task-text';
    txt.textContent = 'Zadanie';

    li.appendChild(chk);
    li.appendChild(document.createTextNode(' '));
    li.appendChild(txt);
    ul.appendChild(li);

    range.deleteContents();
    range.insertNode(ul);

    // Position cursor inside task-text
    const r2 = document.createRange();
    r2.selectNodeContents(txt);
    sel.removeAllRanges();
    sel.addRange(r2);
    syncAll();
  }

  /* Toggle a task item's checked state */
  function toggleTaskItem(e) {
    const span = e.currentTarget;
    const li   = span.closest('.task-item');
    if (!li) return;
    const checked = span.textContent.trim() === '☑';
    span.textContent = checked ? '☐' : '☑';
    li.classList.toggle('done', !checked);
    syncAll();
  }

  // Delegate click on task checkboxes (for dynamically inserted ones)
  editor.addEventListener('click', (e) => {
    if (e.target.classList.contains('task-checkbox')) toggleTaskItem(e);
  });

  /* ── Link insertion ─────────────────────────────────────────────── */
  function showLinkDialog() {
    saveRange();
    const selText = getSelectedText();
    document.getElementById('link-text').value = selText;
    document.getElementById('link-url').value  = '';
    openDialog('dialog-link');
    document.getElementById('link-url').focus();
  }
  function applyLink() {
    const text = document.getElementById('link-text').value.trim();
    const url  = document.getElementById('link-url').value.trim();
    if (!url) return;
    restoreRange();
    if (text) {
      const a = document.createElement('a');
      a.href        = url;
      a.textContent = text || url;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0);
        r.deleteContents();
        r.insertNode(a);
        r.setStartAfter(a);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    } else {
      document.execCommand('createLink', false, url);
    }
    closeDialog('dialog-link');
    syncAll();
  }

  /* ── Image insertion ─────────────────────────────────────────────── */
  function showImageDialog() {
    saveRange();
    document.getElementById('image-url').value  = '';
    document.getElementById('image-alt').value  = '';
    document.getElementById('image-file').value = '';
    openDialog('dialog-image');
  }
  function applyImage() {
    const url  = document.getElementById('image-url').value.trim();
    const alt  = document.getElementById('image-alt').value.trim();
    const file = document.getElementById('image-file').files[0];

    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const id = 'img-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
        insertImageNode(ev.target.result, alt, id);
      };
      reader.readAsDataURL(file);
    } else if (url) {
      insertImageNode(url, alt, null);
    }
    closeDialog('dialog-image');
  }
  function insertImageNode(src, alt, typstId) {
    restoreRange();
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt || '';
    if (typstId) img.dataset.typstId = typstId;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      r.deleteContents();
      r.insertNode(img);
      r.setStartAfter(img);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      editor.appendChild(img);
    }
    syncAll();
  }

  /* ── Table insertion ─────────────────────────────────────────────── */
  function showTableDialog() {
    saveRange();
    openDialog('dialog-table');
  }
  function applyTable() {
    const rows    = parseInt(document.getElementById('table-rows').value, 10) || 3;
    const cols    = parseInt(document.getElementById('table-cols').value, 10) || 3;
    const header  = document.getElementById('table-header').checked;

    let html = '<table><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        const cell = (r === 0 && header) ? 'th' : 'td';
        html += `<${cell}>${(r === 0 && header) ? `Nagł. ${c + 1}` : '&nbsp;'}</${cell}>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';

    restoreRange();
    exec('insertHTML', html);
    closeDialog('dialog-table');
  }

  /* ── HTML view dialog ───────────────────────────────────────────── */
  function showHtmlView() {
    document.getElementById('html-source').value = editor.innerHTML;
    openDialog('dialog-html');
  }
  function applyHtml() {
    editor.innerHTML = document.getElementById('html-source').value;
    closeDialog('dialog-html');
    syncAll();
  }

  /* ── Emoji picker ───────────────────────────────────────────────── */
  function toggleEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    if (!picker.classList.contains('hidden')) {
      closeEmojiPicker();
      return;
    }
    saveRange();
    const btn  = document.getElementById('btn-emoji');
    const rect = btn.getBoundingClientRect();
    picker.style.top  = (rect.bottom + 4) + 'px';
    picker.style.left = Math.min(rect.left, window.innerWidth - 316) + 'px';
    picker.classList.remove('hidden');
    document.addEventListener('mousedown', onOutsideEmojiClick);
  }
  function closeEmojiPicker() {
    document.getElementById('emoji-picker').classList.add('hidden');
    document.removeEventListener('mousedown', onOutsideEmojiClick);
  }
  function onOutsideEmojiClick(e) {
    const picker = document.getElementById('emoji-picker');
    if (!picker.contains(e.target) && e.target.id !== 'btn-emoji') {
      closeEmojiPicker();
    }
  }

  /* ── Font / size helpers ─────────────────────────────────────────── */
  function applyFontFamily(family) {
    if (!family) return;
    editor.focus();
    document.execCommand('fontName', false, family);
    syncAll();
  }
  function applyFontSize(px) {
    if (!px) return;
    editor.focus();
    // Use temporary font-size span via execCommand workaround
    const marker = '\u200b'; // zero-width space as marker
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const r    = sel.getRangeAt(0).cloneRange();
    const span = document.createElement('span');
    span.style.fontSize = px;
    try {
      r.surroundContents(span);
    } catch (_) {
      // Fallback: use fontSize=7 as a marker (legacy execCommand workaround)
      document.execCommand('fontSize', false, '7');
      editor.querySelectorAll('font[size="7"]').forEach(f => {
        f.removeAttribute('size');
        f.style.fontSize = px;
      });
    }
    syncAll();
  }
  function applyLineHeight(lh) {
    if (!lh) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    let node = sel.getRangeAt(0).startContainer;
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        if (['p','div','h1','h2','h3','h4','h5','h6','li','blockquote'].includes(tag)) {
          node.style.lineHeight = lh;
          break;
        }
      }
      node = node.parentNode;
    }
    syncAll();
  }

  /* ── Clear formatting ────────────────────────────────────────────── */
  function clearFormat() {
    editor.focus();
    document.execCommand('removeFormat', false, null);
    syncAll();
  }

  /* ── Sync Typst preview & status ────────────────────────────────── */
  function syncAll() {
    const { source } = TypstConverter.convert(editor.innerHTML);
    typstSource.textContent = source;
    updateCounts();
    updateActiveStates();
  }
  function updateCounts() {
    const text  = editor.innerText || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    wordCount.textContent = `Słowa: ${words}`;
    charCount.textContent = `Znaki: ${text.length}`;
  }
  function updateActiveStates() {
    [['bold','bold'],['italic','italic'],['underline','underline'],
     ['strikeThrough','strikeThrough']].forEach(([cmd, dataCmd]) => {
      try {
        const active = document.queryCommandState(cmd);
        const btn = document.querySelector(`[data-command="${dataCmd}"]`);
        if (btn) btn.classList.toggle('active', active);
      } catch (_) {}
    });
  }

  /* ── Toast helper ───────────────────────────────────────────────── */
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

  /* ── Dialog helpers ─────────────────────────────────────────────── */
  function openDialog(id) {
    overlay.classList.remove('hidden');
    document.getElementById(id).classList.remove('hidden');
  }
  function closeDialog(id) {
    overlay.classList.add('hidden');
    document.getElementById(id).classList.add('hidden');
  }
  function closeAllDialogs() {
    overlay.classList.add('hidden');
    document.querySelectorAll('.dialog').forEach(d => d.classList.add('hidden'));
  }

  /* ── PDF Export ─────────────────────────────────────────────────── */
  async function exportToPDF() {
    const { source, images } = TypstConverter.convert(editor.innerHTML);
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
          // Typst not installed – offer to copy .typ source
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

  /* ── Copy Typst source ──────────────────────────────────────────── */
  function copyTypst() {
    const text = typstSource.textContent;
    navigator.clipboard.writeText(text)
      .then(() => showToast('📋 Skopiowano kod Typst!', 'ok', 2000))
      .catch(() => showToast('❌ Nie można skopiować', 'err', 2000));
  }

  /* ── Panel resizing ─────────────────────────────────────────────── */
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

  /* ═══════════════════════════════════════════════════════════════════
     WIRE UP ALL EVENT LISTENERS
     ═══════════════════════════════════════════════════════════════════ */

  // ── Toolbar: execCommand buttons ─────────────────────────────────
  document.querySelectorAll('[data-command]').forEach(btn => {
    btn.addEventListener('mousedown', (e) => e.preventDefault());  // keep focus in editor
    btn.addEventListener('click', () => {
      exec(btn.dataset.command, btn.dataset.value);
    });
  });

  // ── Toolbar: special buttons ─────────────────────────────────────
  document.getElementById('btn-h1').addEventListener('click', () => formatBlock('h1'));
  document.getElementById('btn-h2').addEventListener('click', () => formatBlock('h2'));
  document.getElementById('btn-h3').addEventListener('click', () => formatBlock('h3'));
  document.getElementById('btn-blockquote').addEventListener('click', () => formatBlock('blockquote'));
  document.getElementById('btn-codeblock').addEventListener('click', insertCodeBlock);
  document.getElementById('btn-tasklist').addEventListener('click', insertTaskList);
  document.getElementById('btn-link').addEventListener('click', showLinkDialog);
  document.getElementById('btn-image').addEventListener('click', showImageDialog);
  document.getElementById('btn-table').addEventListener('click', showTableDialog);
  document.getElementById('btn-emoji').addEventListener('click', toggleEmojiPicker);
  document.getElementById('btn-clear-format').addEventListener('click', clearFormat);
  document.getElementById('btn-html-view').addEventListener('click', showHtmlView);
  document.getElementById('btn-export').addEventListener('click', exportToPDF);
  document.getElementById('btn-copy-typst').addEventListener('click', copyTypst);

  // Prevent toolbar buttons from stealing focus
  document.getElementById('toolbar').addEventListener('mousedown', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
      e.preventDefault();
    }
  });

  // ── Font family ──────────────────────────────────────────────────
  document.getElementById('font-family').addEventListener('change', (e) => {
    applyFontFamily(e.target.value);
    e.target.value = '';
  });

  // ── Font size ────────────────────────────────────────────────────
  document.getElementById('font-size').addEventListener('change', (e) => {
    applyFontSize(e.target.value);
    e.target.value = '';
  });

  // ── Text color ───────────────────────────────────────────────────
  document.getElementById('text-color').addEventListener('input', (e) => {
    editor.focus();
    document.execCommand('foreColor', false, e.target.value);
    document.getElementById('text-color-bar').style.background = e.target.value;
    syncAll();
  });

  // ── Background / highlight color ──────────────────────────────────
  document.getElementById('bg-color').addEventListener('input', (e) => {
    editor.focus();
    document.execCommand('hiliteColor', false, e.target.value);
    document.getElementById('bg-color-bar').style.background = e.target.value;
    syncAll();
  });

  // ── Line height ───────────────────────────────────────────────────
  document.getElementById('line-height').addEventListener('change', (e) => {
    applyLineHeight(e.target.value);
    e.target.value = '';
  });

  // ── Editor: sync on every change ──────────────────────────────────
  editor.addEventListener('input', syncAll);
  editor.addEventListener('keyup', updateActiveStates);
  editor.addEventListener('mouseup', updateActiveStates);

  // ── Paste: strip external styles but keep plain text/simple markup
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text) document.execCommand('insertText', false, text);
  });

  // ── Overlay click closes all dialogs ─────────────────────────────
  overlay.addEventListener('click', closeAllDialogs);

  // ── Dialog: Link ─────────────────────────────────────────────────
  document.getElementById('dlg-link-ok').addEventListener('click', applyLink);
  document.getElementById('dlg-link-cancel').addEventListener('click', () => closeDialog('dialog-link'));
  document.getElementById('dialog-link').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyLink();
    if (e.key === 'Escape') closeDialog('dialog-link');
  });

  // ── Dialog: Image ─────────────────────────────────────────────────
  document.getElementById('dlg-image-ok').addEventListener('click', applyImage);
  document.getElementById('dlg-image-cancel').addEventListener('click', () => closeDialog('dialog-image'));

  // ── Dialog: Table ─────────────────────────────────────────────────
  document.getElementById('dlg-table-ok').addEventListener('click', applyTable);
  document.getElementById('dlg-table-cancel').addEventListener('click', () => closeDialog('dialog-table'));

  // ── Dialog: HTML view ─────────────────────────────────────────────
  document.getElementById('dlg-html-apply').addEventListener('click', applyHtml);
  document.getElementById('dlg-html-close').addEventListener('click', () => closeDialog('dialog-html'));

  // ── Keyboard shortcuts ────────────────────────────────────────────
  // `ctrl` covers both Ctrl (Windows/Linux) and Cmd (macOS via metaKey),
  // so all shortcuts work cross-platform.
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    switch (e.key) {
      // ── History ───────────────────────────────────────────────────
      case 'z': case 'Z':
        e.preventDefault();
        if (e.shiftKey) { exec('redo'); } else { exec('undo'); }
        break;
      case 'y': case 'Y':
        e.preventDefault(); exec('redo'); break;

      // ── Formatting ────────────────────────────────────────────────
      case 'b': case 'B':
        e.preventDefault(); exec('bold'); break;
      case 'i': case 'I':
        e.preventDefault(); exec('italic'); break;
      case 'u': case 'U':
        if (!e.shiftKey) { e.preventDefault(); exec('underline'); }
        break;
      case 'd': case 'D':
        e.preventDefault(); exec('strikeThrough'); break;

      // ── Superscript (Ctrl+Shift+=) / Subscript (Ctrl+=) ──────────
      case '=':
        e.preventDefault();
        if (e.shiftKey) { exec('superscript'); } else { exec('subscript'); }
        break;

      // ── Link ──────────────────────────────────────────────────────
      case 'k': case 'K':
        e.preventDefault(); showLinkDialog(); break;

      // ── Export ────────────────────────────────────────────────────
      case 's': case 'S':
        e.preventDefault(); exportToPDF(); break;
    }
  });

  // ── Initial render ────────────────────────────────────────────────
  syncAll();
  editor.focus();

}());
