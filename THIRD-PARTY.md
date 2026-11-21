# Local OCR assets

Run `node phrase-player/setup-ocr.cjs` once after cloning. Downloads use npm registry package metadata and verify SHA-512 integrity. Runtime OCR uses only these local files, with no CDN fallback and no IndexedDB cache.

- Tesseract.js 6.0.1: https://github.com/naptha/tesseract.js (Apache-2.0; included LICENSE.md)
- Tesseract.js-core 6.0.0: https://github.com/naptha/tesseract.js-core (Apache-2.0; included LICENSE)
- @tesseract.js-data/jpn and @tesseract.js-data/eng 1.0.0: https://github.com/naptha/tessdata (Apache-2.0); 4.0.0_best_int models.

Generated binaries are excluded from Git. Keep this folder local; it is not part of the public player. Selected images and recognized text are never written here.
