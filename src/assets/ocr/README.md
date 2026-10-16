# Offline OCR language data

Unmodified Arabic and English LSTM data from `tesseract-ocr/tessdata_fast`, retrieved for this project on 2026-10-15. Licensed under Apache-2.0; a copy is at `licenses/tessdata-fast/LICENSE`.

| File | Bytes | SHA-256 |
|---|---:|---|
| ara.traineddata | 1432056 | e3206d3dc87fd50c24a0fb9f01838615911d25168f4e64415244b67d2bb3e729 |
| eng.traineddata | 4113088 | 7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2 |

Source: https://github.com/tesseract-ocr/tessdata_fast

Vite embeds the bytes into the single HTML. `solver/ocr.ts` sends the bytes directly to the local Tesseract worker. No runtime language download or hosted OCR service is used. Recognition is an imperfect aid for printed text; the user must review and explicitly approve the transcription before sending a math question.
