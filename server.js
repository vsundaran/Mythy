'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const ragRoutes = require('./src/routes/rag.routes');
const authRoutes = require('./src/routes/auth.routes');
const logger = require('./src/utils/logger');
const { connectDb, closeDb } = require('./src/config/mongodb');
const connectMongoose = require('./src/config/mongoose');
const authMiddleware = require('./src/middlewares/auth.middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // max 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again after 15 minutes.',
    error: null,
    data: null,
  },
});
app.use(limiter);

// ─── Request Logging ──────────────────────────────────────────────────────────
app.use(
  morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (_req, res) => process.env.NODE_ENV === 'test',
  })
);

// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    data: {
      status: 'ok',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    },
    error: null,
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/rag', authMiddleware, ragRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    error: { reason: 'The requested route does not exist' },
    data: null,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const isDev = process.env.NODE_ENV !== 'production';

  logger.error(`Unhandled error: ${err.message}`, { stack: isDev ? err.stack : undefined });

  // Multer file-size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'File too large. Maximum allowed size is 50 MB.',
      error: { reason: err.message },
      data: null,
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    // Never expose stack traces in production
    error: isDev ? { stack: err.stack } : { reason: 'An unexpected error occurred' },
    data: null,
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
async function startServer() {
  // Connect to MongoDB before accepting traffic
  await connectDb();
  await connectMongoose();

  const server = app.listen(PORT, () => {
    logger.info(`✅ RAG Server running on http://localhost:${PORT}`);
    logger.info(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    logger.info(`   Health check: http://localhost:${PORT}/health`);
    logger.info(`   Query API   : POST http://localhost:${PORT}/rag/query`);
    logger.info(`   Ingest API  : POST http://localhost:${PORT}/rag/ingest`);
  });

  // ─── Graceful Shutdown ───────────────────────────────────────────────────
  async function shutdown(signal) {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await closeDb();
      logger.info('Server and MongoDB connection closed');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  logger.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});

module.exports = app;
