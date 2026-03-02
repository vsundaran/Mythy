'use strict';

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const logger = require('./logger');

/**
 * Extracts plain text from a PDF or plain-text file.
 *
 * @param {string} filePath - Absolute or relative path to the file
 * @returns {Promise<string>}  Clean extracted text
 * @throws {Error} If the file does not exist or cannot be parsed
 */
async function loadDocument(filePath) {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const ext = path.extname(absolutePath).toLowerCase();
  logger.debug(`Loading document: ${absolutePath} (${ext})`);

  if (ext === '.pdf') {
    return _parsePdf(absolutePath);
  }

  if (ext === '.txt' || ext === '.md' || ext === '') {
    return _parseTextFile(absolutePath);
  }

  throw new Error(`Unsupported file type: ${ext}. Supported: .pdf, .txt, .md`);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function _parsePdf(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);

  const text = data.text
    .replace(/\r\n/g, '\n')       // normalise line endings
    .replace(/\n{3,}/g, '\n\n')   // collapse excessive blank lines
    .trim();

  logger.debug(`PDF parsed — pages: ${data.numpages}, characters: ${text.length}`);
  return text;
}

async function _parseTextFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  logger.debug(`Text file parsed — characters: ${text.length}`);
  return text;
}

module.exports = { loadDocument };
