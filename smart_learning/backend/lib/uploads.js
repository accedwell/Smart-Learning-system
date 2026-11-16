// Question-paper and study-guide uploads: images, PDFs or Word (.docx) files up to 4 MB. The
// file is kept in the database (paper_files), so it survives a restart or redeploy of the server
// (a hosting service wipes its disk then). Papers uploaded before that were saved under
// UPLOAD_DIR, and are still read from there.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const config = require('./config');
const db = require('./db');
const http = require('./http');
const { DOCX } = require('./documentText');

const EXTENSIONS = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'application/pdf': '.pdf',
  [DOCX]: '.docx',
};

// how each type's files begin; the type the uploader claims is only trusted when the bytes agree
const SIGNATURES = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': (b) => ['GIF87a', 'GIF89a'].includes(b.toString('latin1', 0, 6)),
  'image/webp': (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  'application/pdf': (b) => b.toString('latin1', 0, 5) === '%PDF-',
  // a .docx is a ZIP archive
  [DOCX]: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
};

const badType = () => http.badRequest('paper_bad_type', 'Upload a photo (PNG, JPEG, GIF or WebP), a PDF or a Word (.docx) file');

// the upload stays in memory (req.file.buffer) until it is saved with the paper
const paperUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (EXTENSIONS[file.mimetype]) cb(null, true);
    else cb(badType());
  },
}).single('file');

// refuses a file whose contents are not the type it claims
function checkFileType(file) {
  if (!SIGNATURES[file.mimetype](file.buffer)) throw badType();
}

// a random name for the paper's file, with the extension of its type
const storedName = (file) => crypto.randomBytes(16).toString('hex') + EXTENSIONS[file.mimetype];

function saveFile(paperId, file, conn) {
  return db.query('INSERT INTO paper_files (paper_id, data) VALUES (?, ?) RETURNING paper_id', [paperId, file.buffer], conn);
}

const oldFilePath = (paper) => path.join(config.uploadDir, path.basename(paper.stored_name));

// the paper's file as a Buffer
async function fileData(paper) {
  const row = await db.one('SELECT data FROM paper_files WHERE paper_id = ?', [paper.id]);
  return row ? row.data : fs.promises.readFile(oldFilePath(paper));
}

// after the paper is deleted (its paper_files row goes with it): an older file on disk too
function removeOldFile(paper) {
  fs.rm(oldFilePath(paper), { force: true }, () => {});
}

module.exports = { paperUpload, checkFileType, storedName, saveFile, fileData, removeOldFile };
