# Third-party notices / إشعارات التبعيات

This project retains its original application licensing status. This document does not relicense the application or claim ownership of its original code.

The offline HTML redistributes third-party JavaScript, mathematical fonts, Cairo/Fira Code fonts, and OCR resources. Copies of supplied license and notice texts are under `licenses/`. The production build also embeds those notices as non-executable JSON (`offline-license-notices`) so that they travel with the standalone HTML.

## Principal components

| Component | License / source of notice |
|---|---|
| React, React DOM, scheduler | MIT; `licenses/npm/react*`, `licenses/npm/scheduler` |
| KaTeX and its distributed assets | MIT; `licenses/npm/katex/LICENSE` |
| MathLive | MIT; `licenses/npm/mathlive/LICENSE.txt` |
| mathjs | Apache-2.0; `licenses/npm/mathjs/LICENSE` and `NOTICE` |
| Nerdamer | MIT; `licenses/npm/nerdamer/LICENSE.md` |
| Chart.js / react-chartjs-2 | MIT; corresponding `licenses/npm/` directories |
| lucide-react | ISC/MIT notices included in `licenses/npm/lucide-react/LICENSE` |
| Cairo 5.3.0 | SIL Open Font License 1.1; `licenses/npm/fontsource__cairo/LICENSE` |
| Fira Code 5.3.0 | SIL Open Font License 1.1; `licenses/npm/fontsource__fira-code/LICENSE` |
| Tesseract.js 7.0.0 / tesseract.js-core 7.0.0 | Apache-2.0; corresponding `licenses/npm/` directories |
| Arabic / English tessdata_fast | Apache-2.0; `licenses/tessdata-fast/LICENSE` |

`licenses/npm-packages.json` records the installed production dependency names, versions, license declarations and copied notices. Some production dependency declarations are types or Node-only helpers and need not execute in the browser; retaining their notices is conservative. Development tools are restored by `npm ci` with their own package notices.

For packages whose distributed npm tarball omitted a standalone license file, original source-header notices were retained (`javascript-natural-sort`, `seedrandom`). The MIT notice for `tr46` was obtained from its upstream repository, which retains Sebastian Mayr's copyright.

## OCR data provenance

- Arabic: https://github.com/tesseract-ocr/tessdata_fast/blob/main/ara.traineddata
- English: https://github.com/tesseract-ocr/tessdata_fast/blob/main/eng.traineddata
- Upstream license: https://github.com/tesseract-ocr/tessdata_fast/blob/main/LICENSE

Exact local byte hashes are recorded in `src/assets/ocr/README.md`. These data are checked into the source and embedded during build; the app never downloads them at runtime. The local OCR adapter changes integration/packaging, not the upstream OCR or font binaries.

No dependency's license is replaced by the application's description as an offline educational calculator. Keep these notices when redistributing the source or generated HTML.
