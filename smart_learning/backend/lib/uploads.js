// Question-paper uploads: images or PDFs up to 5 MB, stored under UPLOAD_DIR with a random
// name (the original name is kept in the database for downloads).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const config = require('./config');
const http = require('./http');

const EXTENSIONS = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'application/pdf': '.pdf',
};

// how each type's files begin; the type the uploader claims is only trusted when the bytes agree
const SIGNATURES = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': (b) => ['GIF87a', 'GIF89a'].includes(b.toString('latin1', 0, 6)),
  'image/webp': (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  'application/pdf': (b) => b.toString('latin1', 0, 5) === '%PDF-',
};

const badType = () => http.badRequest('paper_bad_type', 'Upload a PNG, JPEG, GIF or WebP image, or a PDF');

fs.mkdirSync(config.uploadDir, { recursive: true });

const paperUpload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXTENSIONS[file.mimetype]),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (EXTENSIONS[file.mimetype]) cb(null, true);
    else cb(badType());
  },
}).single('file');

// after the upload is saved: refuses a file whose contents are not the type it claims
async function checkFileType(file) {
  const handle = await fs.promises.open(file.path);
  try {
    const { buffer } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    if (!SIGNATURES[file.mimetype](buffer)) throw badType();
  } finally {
    await handle.close();
  }
}

const filePath = (storedName) => path.join(config.uploadDir, path.basename(storedName));

function removeFile(storedName) {
  fs.rm(filePath(storedName), { force: true }, () => {});
}

module.exports = { paperUpload, checkFileType, filePath, removeFile };
