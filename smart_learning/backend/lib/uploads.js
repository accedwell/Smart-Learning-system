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

fs.mkdirSync(config.uploadDir, { recursive: true });

const paperUpload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXTENSIONS[file.mimetype]),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (EXTENSIONS[file.mimetype]) cb(null, true);
    else cb(http.badRequest('paper_bad_type', 'Upload a PNG, JPEG, GIF or WebP image, or a PDF'));
  },
}).single('file');

const filePath = (storedName) => path.join(config.uploadDir, path.basename(storedName));

function removeFile(storedName) {
  fs.rm(filePath(storedName), { force: true }, () => {});
}

module.exports = { paperUpload, filePath, removeFile };
