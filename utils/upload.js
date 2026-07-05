// utils/upload.js
// Central multer configuration for every file upload in the app
// (student/teacher/donor photos, ID documents, project photos & videos).

const path = require('path');
const fs = require('fs');
const multer = require('multer');

const ALLOWED_IMAGE = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_VIDEO = ['.mp4', '.mov', '.webm'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB - generous for a demo, tighten for production

function makeStorage(subfolder) {
  const dir = path.join(__dirname, '..', 'public', 'uploads', subfolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const safeExt = path.extname(file.originalname).toLowerCase();
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
      cb(null, unique);
    },
  });
}

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_IMAGE.includes(ext) || ALLOWED_VIDEO.includes(ext)) {
    return cb(null, true);
  }
  cb(new Error('Unsupported file type. Allowed: jpg, jpeg, png, webp, mp4, mov, webm'));
}

function uploader(subfolder) {
  return multer({
    storage: makeStorage(subfolder),
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE },
  });
}

module.exports = { uploader, ALLOWED_IMAGE, ALLOWED_VIDEO };
