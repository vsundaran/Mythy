'use strict';

const winston = require('winston');

const { combine, timestamp, json, errors, colorize, simple } = winston.format;

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Structured Winston logger.
 *
 * - Production : JSON format, written to logs/ files + console
 * - Development: Human-readable colourised output in console
 *
 * Never log sensitive data (API keys, user PII, embeddings).
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    isProduction ? json() : simple()
  ),
  transports: [
    // Always log to console
    new winston.transports.Console({
      format: isProduction
        ? json()
        : combine(colorize(), simple()),
    }),
    // In production, persist logs to disk
    ...(isProduction
      ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5 * 1024 * 1024, // 5 MB
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 10 * 1024 * 1024, // 10 MB
            maxFiles: 10,
          }),
        ]
      : []),
  ],
  // Prevent Winston from crashing on unhandled exceptions/rejections
  exitOnError: false,
});

module.exports = logger;
