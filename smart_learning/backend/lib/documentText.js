// Reads the text out of an uploaded question paper or study guide, on this computer, with no
// AI and no internet: photos and scans by OCR (Tesseract, English), PDFs from their text layer
// (scanned pages are drawn and OCR'd instead), and Word .docx files from their XML.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// the English OCR model ships with @tesseract.js-data/eng, so nothing is downloaded at run time
const LANG_PATH = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
const OCR_CACHE = path.join(os.tmpdir(), 'smart-learning-ocr');
const MAX_PDF_PAGES = 20;
// a PDF page with less text than this is taken to be a scan and OCR'd
const MIN_TEXT_PER_PAGE = 40;
const PDF_SCALE = 2; // render scanned pages at 2x for sharper OCR

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// pdf.js's own decoders and data, from the package: scanned papers are often JBIG2 or JPEG2000
// images (wasm decoders), and some text PDFs need the standard fonts and character maps
const PDFJS_DIR = path.dirname(require.resolve('pdfjs-dist/package.json'));
const pdfjsDir = (sub) => path.join(PDFJS_DIR, sub).replace(/\\/g, '/') + '/';

async function withOcr(fn) {
  const { createWorker } = require('tesseract.js');
  await fs.mkdir(OCR_CACHE, { recursive: true });
  const worker = await createWorker('eng', 1, { langPath: LANG_PATH, cachePath: OCR_CACHE, gzip: true });
  try {
    return await fn((image) => worker.recognize(image).then((r) => r.data.text));
  } finally {
    await worker.terminate();
  }
}

async function pdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    wasmUrl: pdfjsDir('wasm'),
    standardFontDataUrl: pdfjsDir('standard_fonts'),
    cMapUrl: pdfjsDir('cmaps'),
    cMapPacked: true,
  });
  const doc = await loading.promise;
  try {
    const pages = [];
    const scanned = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PDF_PAGES); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      // keep the PDF's own line breaks
      const text = content.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('').trim();
      pages[n - 1] = text;
      if (text.replace(/\s/g, '').length < MIN_TEXT_PER_PAGE) scanned.push(page);
    }
    if (scanned.length) {
      await withOcr(async (ocr) => {
        for (const page of scanned) {
          const viewport = page.getViewport({ scale: PDF_SCALE });
          const { canvas, context } = doc.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvasContext: context, canvas, viewport }).promise;
          pages[page.pageNumber - 1] = await ocr(canvas.toBuffer('image/png'));
        }
      });
    }
    return pages.join('\n\n');
  } finally {
    await loading.destroy();
  }
}

async function docxText(buffer) {
  const mammoth = require('mammoth');
  return (await mammoth.extractRawText({ buffer })).value;
}

// the text of the file at `filePath` of type `mimeType`, tidied: no stray spaces, at most one blank line
async function documentText(filePath, mimeType) {
  const buffer = await fs.readFile(filePath);
  let text;
  if (mimeType === 'application/pdf') text = await pdfText(buffer);
  else if (mimeType === DOCX) text = await docxText(buffer);
  else if (mimeType.startsWith('image/')) text = await withOcr((ocr) => ocr(buffer));
  else text = '';
  return text
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { documentText, DOCX };
