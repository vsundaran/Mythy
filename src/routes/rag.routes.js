const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { queryRAG } = require('../services/query.service');
const { ingestDocument } = require('../services/ingest.service');
const logger = require('../utils/logger');

const router = express.Router();

// ─── Multer — file upload config ──────────────────────────────────────────────
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;
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

// ─── POST /rag/query ──────────────────────────────────────────────────────────
/**
 * @route   POST /rag/query
 * @desc    Ask a question against the ingested document corpus
 * @access  Public
 * @body    { question: string }
 */
router.post(
  '/query',
  [
    body('question')
      .trim()
      .notEmpty().withMessage('question is required')
      .isLength({ min: 3, max: 2000 }).withMessage('question must be between 3 and 2000 characters'),
  ],
  async (req, res, next) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: errors.array().map((e) => ({ field: e.path, reason: e.msg })),
        data: null,
      });
    }

    try {
      const { question } = req.body;
      logger.info(`POST /rag/query — question: "${question.slice(0, 80)}..."`);

      const result = await queryRAG(question);

      return res.status(200).json({
        success: true,
        message: 'Query processed successfully',
        data: {
          answer: result.answer,
          retrievedChunks: result.retrievedChunks,
          sources: result.sources,
        },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /rag/ingest ─────────────────────────────────────────────────────────
/**
 * @route   POST /rag/ingest
 * @desc    Upload and ingest a document into the vector store
 * @access  Public
 * @body    multipart/form-data — field: "document" (PDF/TXT/MD)
 *          optional body field: "source" (string label)
 */
router.post('/ingest', upload.single('document'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: { field: 'document', reason: 'A file must be uploaded in the "document" field' },
      data: null,
    });
  }

  if (!req.body.sourceLink || req.body.sourceLink.trim() === '') {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: { field: 'sourceLink', reason: "Without source link don't store" },
      data: null,
    });
  }

  try {
    const source = req.body.source || req.file.originalname;
    
    // Extract metadata with default fallback values
    const metadata = {
      documentId: req.body.documentId || 'breastfeeding_myths',
      category: req.body.category || 'health',
      subCategory: req.body.subCategory || 'breastfeeding',
      sourceLink: req.body.sourceLink.trim(),
    };

    logger.info(`POST /rag/ingest — file: ${req.file.filename}, source: ${source}`);

    const summary = await ingestDocument(req.file.path, source, metadata);

    // Clean up uploaded file after ingestion
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
    // Clean up on failure too
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
});

module.exports = router;
