const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const adminAuthController = require('../controllers/admin.auth.controller');
const adminAuthMiddleware = require('../middlewares/adminAuth.middleware');
const { ingestDocument } = require('../services/ingest.service');
const logger = require('../utils/logger');

const router = express.Router();

// ─── Multer Setup from RAG ──────────────────────────────────────────────────
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${file.originalname.replace(/\\s/g, '_')}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: PDF, TXT, MD`));
    }
  },
});

// ─── POST /admin/login ────────────────────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  adminAuthController.login
);

// ─── POST /admin/rag/ingest ───────────────────────────────────────────────────
router.post('/rag/ingest', adminAuthMiddleware, upload.single('document'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: { field: 'document', reason: 'A file must be uploaded in the "document" field' },
      data: null,
    });
  }

  try {
    const source = req.body.source || req.file.originalname;
    const metadata = {
      documentId: req.body.documentId || 'breastfeeding_myths',
      category: req.body.category || 'health',
      subCategory: req.body.subCategory || 'breastfeeding',
      sourceLink: req.body.sourceLink || '',
      uploadedBy: req.admin.email,
    };

    logger.info(`POST /admin/rag/ingest — file: ${req.file.filename}, source: ${source}`);

    const summary = await ingestDocument(req.file.path, source, metadata);

    fs.unlink(req.file.path, (err) => {
      if (err) logger.warn(`Could not delete temp file: ${req.file.path}`);
    });

    return res.status(201).json({
      success: true,
      message: 'Document ingested successfully',
      data: summary,
      error: null,
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
});

module.exports = router;
