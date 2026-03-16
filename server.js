'use strict';

const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Check whether the `typst` binary is available on PATH
// ---------------------------------------------------------------------------
function isTypstAvailable() {
  return new Promise((resolve) => {
    execFile('typst', ['--version'], { timeout: 5000 }, (err) => resolve(!err));
  });
}

// ---------------------------------------------------------------------------
// POST /export
// Body: { content: "<typst source>", images: { "<placeholder>": "<base64>" } }
// Returns: application/pdf  –or–  JSON error
// ---------------------------------------------------------------------------
app.post('/export', async (req, res) => {
  const { content, images = {} } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Brak treści do wyeksportowania.' });
  }

  if (!(await isTypstAvailable())) {
    return res.status(503).json({
      error:
        'Typst nie jest zainstalowany. Pobierz ze strony https://typst.app/. ' +
        'Poniżej znajduje się wygenerowany kod Typst – możesz go skopiować i skompilować ręcznie.',
      typstContent: content,
    });
  }

  const id = crypto.randomBytes(8).toString('hex');
  const tmpDir = os.tmpdir();
  const inputFile = path.join(tmpDir, `typst-${id}.typ`);
  const outputFile = path.join(tmpDir, `typst-${id}.pdf`);

  // Save embedded base64 images to temp files and rewrite paths in the source
  const imageFiles = [];
  let processedContent = content;

  for (const [placeholder, dataUrl] of Object.entries(images)) {
    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) continue;
    const [, ext, b64] = match;
    const imgFile = path.join(tmpDir, `img-${id}-${imageFiles.length}.${ext}`);
    fs.writeFileSync(imgFile, Buffer.from(b64, 'base64'));
    processedContent = processedContent.replaceAll(placeholder, imgFile);
    imageFiles.push(imgFile);
  }

  try {
    fs.writeFileSync(inputFile, processedContent, 'utf-8');

    execFile(
      'typst',
      ['compile', inputFile, outputFile],
      { timeout: 30000 },
      (error, _stdout, stderr) => {
        // Cleanup input
        try { fs.unlinkSync(inputFile); } catch (_) {}
        imageFiles.forEach((f) => { try { fs.unlinkSync(f); } catch (_) {} });

        if (error) {
          return res.status(500).json({ error: stderr || error.message });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="dokument.pdf"');

        const stream = fs.createReadStream(outputFile);
        stream.pipe(res);
        res.on('finish', () => { try { fs.unlinkSync(outputFile); } catch (_) {} });
        stream.on('error', (err) => {
          try { fs.unlinkSync(outputFile); } catch (_) {}
          res.status(500).json({ error: err.message });
        });
      }
    );
  } catch (err) {
    try { fs.unlinkSync(inputFile); } catch (_) {}
    imageFiles.forEach((f) => { try { fs.unlinkSync(f); } catch (_) {} });
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n  ✏️  Typst WYSIWYG Editor\n`);
  console.log(`  Otwórz w przeglądarce: \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`\n  Naciśnij Ctrl+C aby zatrzymać.\n`);
});
