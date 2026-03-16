# ✏️ Typst WYSIWYG Editor

Przeglądarkowy edytor tekstu z pełnym paskiem formatowania, który w czasie rzeczywistym tłumaczy treść na język znaczników [Typst](https://typst.app/) i eksportuje gotowy dokument do **PDF** za pomocą lokalnego kompilatora `typst`.

---

## Spis treści

1. [Wymagania](#wymagania)
2. [Szybki start](#szybki-start)
3. [Struktura projektu](#struktura-projektu)
4. [Jak to działa — krok po kroku](#jak-to-działa--krok-po-kroku)
   - [Krok 1 — Uruchomienie serwera](#krok-1--uruchomienie-serwera)
   - [Krok 2 — Przeglądarka otwiera edytor](#krok-2--przeglądarka-otwiera-edytor)
   - [Krok 3 — Pisanie i formatowanie tekstu](#krok-3--pisanie-i-formatowanie-tekstu)
   - [Krok 4 — Podgląd kodu Typst w czasie rzeczywistym](#krok-4--podgląd-kodu-typst-w-czasie-rzeczywistym)
   - [Krok 5 — Konwerter HTML → Typst (szczegóły)](#krok-5--konwerter-html--typst-szczegóły)
   - [Krok 6 — Eksport do PDF](#krok-6--eksport-do-pdf)
   - [Krok 7 — Obsługa obrazków](#krok-7--obsługa-obrazków)
   - [Krok 8 — Ograniczanie liczby żądań (rate limiting)](#krok-8--ograniczanie-liczby-żądań-rate-limiting)
   - [Krok 9 — Tryb awaryjny (Typst niezainstalowany)](#krok-9--tryb-awaryjny-typst-niezainstalowany)
5. [Funkcje paska narzędzi](#funkcje-paska-narzędzi)
6. [Skróty klawiszowe](#skróty-klawiszowe)
7. [Tabela konwersji HTML → Typst](#tabela-konwersji-html--typst)

---

## Wymagania

| Wymaganie | Wersja | Uwagi |
|-----------|--------|-------|
| [Node.js](https://nodejs.org/) | ≥ 18 | wymagane |
| [npm](https://www.npmjs.com/) | ≥ 9 | wymagane |
| [Typst](https://typst.app/) | dowolna | opcjonalne — potrzebne tylko do eksportu PDF |

Jeśli `typst` nie jest zainstalowany, edytor nadal działa w pełni — przy eksporcie wyświetli komunikat i skopiuje wygenerowany kod `.typ` do schowka, który można wkleić na [typst.app](https://typst.app/).

---

## Szybki start

```bash
# 1. Zainstaluj zależności Node.js
npm install

# 2. Uruchom serwer
npm start

# 3. Otwórz w przeglądarce
# http://localhost:3000
```

Port można zmienić zmienną środowiskową:

```bash
PORT=8080 npm start
```

---

## Struktura projektu

```
typst-wysiwyg/
├── package.json        ← metadane projektu, zależność: express
├── server.js           ← serwer Express: statyczne pliki + endpoint /export
└── public/
    ├── index.html      ← szkielet UI: nagłówek, pasek narzędzi, panel edytora, dialogi
    ├── style.css       ← style (zmienne CSS, podział paneli, motywy)
    └── editor.js       ← cała logika przeglądarki + konwerter HTML→Typst
```

---

## Jak to działa — krok po kroku

### Krok 1 — Uruchomienie serwera

```
npm start
  └─► node server.js
        └─► Express nasłuchuje na porcie 3000
              ├─► app.use(express.static('public'))  ← serwuje pliki HTML/CSS/JS
              └─► app.post('/export', rateLimit, handler)  ← endpoint PDF
```

`server.js` uruchamia aplikację Express, która:

- Serwuje katalog `public/` jako statyczne pliki (przeglądarka pobiera `index.html`, `style.css`, `editor.js`).
- Rejestruje jeden endpoint API: `POST /export`, który przyjmuje treść dokumentu i zwraca plik PDF.

---

### Krok 2 — Przeglądarka otwiera edytor

Po wejściu na `http://localhost:3000` przeglądarka pobiera `index.html`. Strona ładuje `style.css` i `editor.js`, a następnie:

1. `editor.js` uruchamia się w trybie IIFE (`(function () { ... }())`), żeby nie zaśmiecać przestrzeni globalnej.
2. Wywołuje `document.execCommand('styleWithCSS', false, true)` — sprawia to, że polecenia formatowania (`bold`, `italic` itd.) zapisują formatowanie jako styl CSS (`style="font-weight:bold"`) zamiast starych tagów `<b>`, co ułatwia późniejszą konwersję.
3. Buduje siatkę emoji w `#emoji-grid` ze stałej tablicy `EMOJIS`.
4. Wywołuje `syncAll()` — wypełnia panel podglądu Typst.
5. Ustawia kursor w obszarze edycji.

---

### Krok 3 — Pisanie i formatowanie tekstu

Edytor to element `<div id="editor" contenteditable="true">`. Przeglądarka obsługuje wpisywanie tekstu natywnie.

#### Jak działa pasek narzędzi

Większość przycisków używa **`document.execCommand()`** — starszego, ale powszechnie obsługiwanego API, które bezpośrednio modyfikuje zaznaczony fragment DOM:

```
Użytkownik klika „B" (pogrubienie)
  └─► exec('bold')
        └─► editor.focus()                     ← upewniamy się, że fokus jest w edytorze
        └─► document.execCommand('bold')        ← przeglądarka owijia zaznaczenie w <strong>
        └─► syncAll()                           ← odświeżamy podgląd Typst
        └─► updateActiveStates()               ← podświetlamy przycisk, jeśli styl jest aktywny
```

Kluczowe szczegóły:
- Przyciski paska narzędzi mają `mousedown → preventDefault()`, żeby kliknięcie nie zabierało fokusu z edytora. Fokus wraca po `editor.focus()` wewnątrz `exec()`.
- `updateActiveStates()` sprawdza `document.queryCommandState()` i dodaje/usuwa klasę `.active` na przyciskach B, I, U, S.

#### Specjalne operacje (nieużywające execCommand)

| Operacja | Mechanizm |
|----------|-----------|
| **Nagłówki H1/H2/H3** | `execCommand('formatBlock', false, '<h1>')` — zamienia bieżący akapit na tag nagłówka |
| **Cytat** | `execCommand('formatBlock', false, '<blockquote>')` |
| **Blok kodu** | Ręcznie tworzy `<pre><code>…</code></pre>` i wstawia go przez `range.insertNode()` |
| **Lista zadań** | Ręcznie buduje `<ul class="task-list"><li class="task-item">…</li></ul>` i wstawia przez `range.insertNode()` |
| **Rozmiar czcionki** | Próbuje `range.surroundContents(span)` z `style.fontSize`; jeśli zaznaczenie obejmuje kilka elementów, używa `execCommand('fontSize', '7')` jako znacznika, a następnie zamienia wygenerowane `<font size="7">` na `<span style="font-size:…">` |
| **Interlinia** | Chodzi w górę drzewa DOM od kursora do pierwszego elementu blokowego (`p`, `div`, `h1`…) i ustawia `style.lineHeight` |

#### Dialogi (Link, Obraz, Tabela)

Przed otwarciem dialogu `saveRange()` zapisuje aktualną pozycję kursora (`sel.getRangeAt(0).cloneRange()`). Po zatwierdzeniu `restoreRange()` przywraca kursor i wstawia element:

```
Klik „Wstaw link"
  ├─► saveRange()           ← zapamiętaj kursor
  ├─► openDialog('dialog-link')
  │     └─► użytkownik wypełnia tekst + URL i klika „Wstaw"
  └─► applyLink()
        ├─► restoreRange()  ← wróć do zachowanej pozycji
        ├─► utwórz <a href="URL">tekst</a>
        ├─► wstaw przez range.insertNode()
        └─► syncAll()
```

---

### Krok 4 — Podgląd kodu Typst w czasie rzeczywistym

Za każdym razem gdy treść edytora się zmienia, wywoływane jest `syncAll()`:

```
syncAll()
  ├─► TypstConverter.convert(editor.innerHTML)
  │     └─► zwraca { source: "...", images: {...} }
  ├─► typstSource.textContent = source   ← aktualizuje prawy panel
  ├─► updateCounts()                     ← aktualizuje licznik słów i znaków
  └─► updateActiveStates()              ← aktualizuje podświetlenia przycisków
```

`syncAll()` jest wywoływane przy:
- każdym zdarzeniu `input` edytora (wpisywanie, wklejanie, usuwanie),
- kliknięciu dowolnego przycisku formatowania,
- potwierdzeniu dialogu (link, obraz, tabela, HTML),
- przełączeniu checkboxa w liście zadań.

**Wklejanie tekstu** jest przechwytywane przez `editor.addEventListener('paste')` — edytor odrzuca bogate formatowanie ze schowka i wstawia wyłącznie czysty tekst (`text/plain`), żeby nie zanieczyszczać dokumentu zewnętrznymi stylami.

---

### Krok 5 — Konwerter HTML → Typst (szczegóły)

Serce projektu to obiekt `TypstConverter` w `editor.js`. Metoda `convert(html)` działa w trzech fazach:

#### Faza 1 — Parsowanie HTML

```js
const div = document.createElement('div');
div.innerHTML = html;   // przeglądarka parsuje HTML do drzewa DOM
```

#### Faza 2 — Rekurencyjny obchód drzewa DOM

Metoda `nodeToTypst(node, ctx)` odwiedza każdy węzeł drzewa:

```
nodeToTypst(node)
  ├─► jeśli TEXT_NODE:
  │     ├─► jeśli ctx.inCode → zwróć tekst dosłownie
  │     ├─► jeśli tylko białe znaki między elementami blokowymi → pomiń (unikamy wcięć)
  │     └─► escapeText() → zbackslashuj znaki specjalne Typst: \ # * _ ` $ @ ~
  │
  └─► jeśli ELEMENT_NODE → switch(tagName):
        ├─► h1..h6  → "= Tytuł\n\n" (liczba = to poziom nagłówka)
        ├─► p/div   → treść + "\n\n"; jeśli pusty → "\n"
        ├─► strong/b → "*treść*"
        ├─► em/i    → "_treść_"
        ├─► u       → "#underline[treść]"
        ├─► s/del   → "#strike[treść]"
        ├─► sup     → "#super[treść]"
        ├─► sub     → "#sub[treść]"
        ├─► code    → "`treść`" (lub dosłowny tekst jeśli jesteśmy w <pre>)
        ├─► pre     → "\`\`\`lang\n...\n\`\`\`\n\n"
        ├─► blockquote → "#quote(block: true)[...]\n\n"
        ├─► a       → "#link("url")[treść]"
        ├─► img     → "#figure(image("ścieżka"), caption: [opis])\n\n"
        ├─► ul      → listToTypst(node, ordered=false)
        ├─► ol      → listToTypst(node, ordered=true)
        ├─► table   → tableToTypst(node)
        ├─► span    → spanToTypst(node, dzieci)  ← style inline
        ├─► font    → #text(font/fill)[...]  ← legacy execCommand
        ├─► br      → "\\\n"
        └─► hr      → "#line(length: 100%)\n\n"
```

#### Konwersja list

```
listToTypst(ul, ordered=false)
  └─► dla każdego <li>:
        ├─► jeśli zawiera .task-checkbox:
        │     → "- [x] Zadanie"  lub  "- [ ] Zadanie"
        └─► normalny element:
              ordered ? "+ treść" : "- treść"
```

#### Konwersja tabel

```
tableToTypst(table)
  ├─► znajdź liczbę kolumn (max szerokość wiersza)
  ├─► dla pierwszego wiersza złożonego wyłącznie z <th>:
  │     → table.header([Nagł. 1], [Nagł. 2], ...)
  └─► dla pozostałych wierszy:
        → [komórka1], [komórka2], ...
  Wynik: #table(columns: N, table.header(...), [...], [...])
```

#### Konwersja stylów inline (`spanToTypst`)

`<span>` może nieść wiele stylów naraz — funkcja owijuje treść od środka na zewnątrz:

```
<span style="font-size:19px; color:rgb(220,50,50); background:yellow">Tekst</span>
  ↓
#highlight(fill: yellow)[#text(fill: rgb("#dc3232"))[#text(size: 14pt)[Tekst]]]
```

Konwersje pomocnicze:
- `cssColorToTypst()` — zamienia `rgb(220,50,50)` lub `#dc3232` na `rgb("#dc3232")`
- `cssSizeToTypst()` — zamienia `19px` na `14pt` (przelicznik: px × 0.75)

#### Faza 3 — Składanie dokumentu Typst

```js
const preamble = `
#set page(paper: "a4", margin: (x: 2.5cm, y: 2cm))
#set text(size: 11pt, lang: "pl")
#set par(justify: false, leading: 0.65em)
#show heading: set text(fill: rgb("#1a1a2e"))
#show link: underline
`;
return { source: preamble + body, images };
```

Preambuła ustawia format strony A4, język, rozmiar tekstu i styl nagłówków. `images` to słownik `{ placeholder → dataURL }` dla obrazków wbudowanych (base64).

---

### Krok 6 — Eksport do PDF

Po kliknięciu **„Eksportuj PDF"** (lub `Ctrl+S`):

```
Przeglądarka                          Serwer (server.js)
─────────────────────────────────     ──────────────────────────────────────
exportToPDF()
  ├─► TypstConverter.convert(...)     
  ├─► btn.disabled = true             
  └─► fetch('POST /export', {
        content: "<kod Typst>",
        images: { "img-xxx": "data:image/png;base64,..." }
      })
                                 ──►  rateLimit()  ← sprawdź limit żądań
                                      isTypstAvailable()  ← typst --version
                                      
                                      id = crypto.randomBytes(8).hex()
                                      tmpDir = os.tmpdir()
                                      
                                      [dla każdego obrazka]
                                        dekoduj base64 → plik /tmp/img-{id}-N.png
                                        zastąp placeholder ścieżką w kodzie .typ
                                      
                                      zapisz kod do /tmp/typst-{id}.typ
                                      
                                      execFile('typst', ['compile',
                                        '/tmp/typst-{id}.typ',
                                        '/tmp/typst-{id}.pdf'
                                      ], timeout: 30s)
                                      
                                      usuń /tmp/typst-{id}.typ
                                      usuń pliki obrazków
                                      
                                      res.setHeader('Content-Type', 'application/pdf')
                                      stream /tmp/typst-{id}.pdf → res
                                      po finish → usuń /tmp/typst-{id}.pdf
  ◄──
  blob = await resp.blob()
  URL.createObjectURL(blob)
  <a download="dokument.pdf">.click()
  URL.revokeObjectURL(url)
  showToast('✅ PDF został pobrany!')
```

Pliki tymczasowe zawsze są sprzątane — zarówno przy sukcesie jak i przy błędzie — w bloku `catch` lub w callbacku `execFile`.

---

### Krok 7 — Obsługa obrazków

Obrazki wstawione przez dialog „Wstaw obrazek" mogą pochodzić z:

**a) adresu URL** — tag `<img src="https://...">` zostaje w edytorze; konwerter generuje `#figure(image("https://..."), caption: [opis])`. Typst pobiera ten obraz podczas kompilacji.

**b) pliku lokalnego** — `FileReader.readAsDataURL()` konwertuje plik do ciągu base64 (`data:image/png;base64,...`). W DOM obraz otrzymuje unikalny atrybut `data-typst-id="img-<uuid>"`. Konwerter zamienia `src` na ten identyfikator w kodzie Typst. Słownik `images` przenosi mapowanie `id → dataURL` na serwer. Serwer:
1. Dekoduje base64 → zapisuje do pliku tymczasowego `/tmp/img-{id}-N.png`
2. Zastępuje placeholder (`img-<uuid>`) absolutną ścieżką do tego pliku w kodzie `.typ`
3. Uruchamia `typst compile` — kompilator odczytuje obraz z dysku
4. Usuwa plik tymczasowy

---

### Krok 8 — Ograniczanie liczby żądań (rate limiting)

Endpoint `/export` uruchamia zewnętrzny proces (`typst compile`) i operacje na plikach. Żeby zapobiec nadmiernemu obciążeniu, `server.js` używa prostego ogranicznika in-memory:

```
rateLimit(req, res, next)
  ├─► klucz = adres IP żądania
  ├─► jeśli nie ma rekordu lub okno czasowe wygasło → utwórz nowy rekord {count: 0, resetAt: teraz+60s}
  ├─► count++
  ├─► jeśli count > 15 → HTTP 429 + nagłówek Retry-After
  └─► w przeciwnym razie → next()

Co 60 sekund: usuń wygasłe rekordy z mapy (zapobieganie wyciekowi pamięci)
```

Limit: **15 żądań na minutę na adres IP**.

---

### Krok 9 — Tryb awaryjny (Typst niezainstalowany)

Przed każdą kompilacją serwer sprawdza dostępność Typst:

```js
execFile('typst', ['--version'], { timeout: 5000 }, (err) => resolve(!err));
```

Jeśli Typst nie jest zainstalowany:
1. Serwer zwraca **HTTP 503** z treścią `{ error: "...", typstContent: "<kod .typ>" }`.
2. Przeglądarka wyświetla toast ostrzegawczy i **automatycznie kopiuje kod Typst do schowka**.
3. Użytkownik może wkleić kod na [typst.app/playground](https://typst.app/) lub zainstalować Typst lokalnie.

Edytor jest w pełni funkcjonalny bez Typst — brakuje tylko generowania PDF.

---

## Funkcje paska narzędzi

### Wiersz 1

| Przycisk | Skrót | Działanie |
|----------|-------|-----------|
| ↩ Cofnij | `Ctrl+Z` | Cofa ostatnią zmianę |
| ↪ Ponów | `Ctrl+Y` / `Ctrl+Shift+Z` | Ponawia cofniętą zmianę |
| **B** Pogrubienie | `Ctrl+B` | `<strong>` → `*tekst*` |
| *I* Kursywa | `Ctrl+I` | `<em>` → `_tekst_` |
| <u>U</u> Podkreślenie | `Ctrl+U` | `<u>` → `#underline[tekst]` |
| ~~S~~ Przekreślenie | — | `<s>` → `#strike[tekst]` |
| x² Indeks górny | — | `<sup>` → `#super[tekst]` |
| x₂ Indeks dolny | — | `<sub>` → `#sub[tekst]` |
| Czcionka | — | Zmienia krój pisma |
| Rozmiar | — | Zmienia rozmiar (pt) |
| **A** Kolor tekstu | — | `foreColor` → `#text(fill: …)` |
| **A** Kolor tła | — | `hiliteColor` → `#highlight(fill: …)` |
| 🧹 Usuń formatowanie | — | Usuwa wszystkie style inline |

### Wiersz 2

| Przycisk | Działanie |
|----------|-----------|
| ≡ Wyrównaj do lewej / środka / prawej / obustronnie | `text-align` → `#align(...)` |
| ⇤ / ⇥ Wcięcie | Zwiększa / zmniejsza `padding-left` |
| ↕ Interlinia | Ustawia `line-height` na bieżącym akapicie |
| • Lista punktowana | `<ul>` → `- element` |
| 1. Lista numerowana | `<ol>` → `+ element` |
| ☐ Lista zadań | Interaktywna lista z checkboxami |
| H1 / H2 / H3 | Nagłówki pierwszego / drugiego / trzeciego poziomu |
| „" Cytat | `<blockquote>` → `#quote(block: true)[...]` |
| `</>` Blok kodu | `<pre><code>` → ` ```kod``` ` |
| 🔗 Link | Dialog → `#link("url")[tekst]` |
| 🖼 Obraz | Dialog (URL lub plik) → `#figure(image(...), caption: [...])` |
| ⊞ Tabela | Dialog (wiersze × kolumny) → `#table(columns: N, ...)` |
| 😊 Emoji | Siatka emoji / symboli |

---

## Skróty klawiszowe

| Skrót | Działanie |
|-------|-----------|
| `Ctrl+B` | Pogrubienie |
| `Ctrl+I` | Kursywa |
| `Ctrl+U` | Podkreślenie |
| `Ctrl+Z` | Cofnij |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Ponów |
| `Ctrl+S` | Eksportuj do PDF |
| `Enter` w dialogu linku | Zatwierdź link |
| `Escape` w dialogu linku | Zamknij dialog |

---

## Tabela konwersji HTML → Typst

| HTML | Typst |
|------|-------|
| `<h1>Tytuł</h1>` | `= Tytuł` |
| `<h2>Tytuł</h2>` | `== Tytuł` |
| `<h3>Tytuł</h3>` | `=== Tytuł` |
| `<strong>tekst</strong>` | `*tekst*` |
| `<em>tekst</em>` | `_tekst_` |
| `<u>tekst</u>` | `#underline[tekst]` |
| `<s>tekst</s>` | `#strike[tekst]` |
| `<sup>2</sup>` | `#super[2]` |
| `<sub>2</sub>` | `#sub[2]` |
| `<code>kod</code>` | `` `kod` `` |
| `<pre><code>blok</code></pre>` | ` ```\nblok\n``` ` |
| `<blockquote>cytat</blockquote>` | `#quote(block: true)[cytat]` |
| `<a href="url">tekst</a>` | `#link("url")[tekst]` |
| `<img src="..." alt="opis">` | `#figure(image("..."), caption: [opis])` |
| `<ul><li>element</li></ul>` | `- element` |
| `<ol><li>element</li></ol>` | `+ element` |
| `☐ / ☑` (lista zadań) | `- [ ] Zadanie` / `- [x] Zadanie` |
| `<table>` | `#table(columns: N, ...)` |
| `<tr><th>…</th></tr>` | `table.header([…], […], …)` |
| `<hr>` | `#line(length: 100%)` |
| `<br>` | `\` (wymuszone łamanie wiersza) |
| `style="text-align:center"` | `#align(center)[...]` |
| `style="color:rgb(R,G,B)"` | `#text(fill: rgb("#rrggbb"))[...]` |
| `style="background-color:…"` | `#highlight(fill: …)[...]` |
| `style="font-family:Georgia"` | `#text(font: "Georgia")[...]` |
| `style="font-size:19px"` | `#text(size: 14pt)[...]` |

