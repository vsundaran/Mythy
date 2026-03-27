const logger = require('../utils/logger');

/**
 * Splits a long text into overlapping chunks suitable for embedding.
 *
 * Strategy:
 *  1. Prefer splitting on paragraph breaks (\n\n)
 *  2. Fall back to sentence boundaries (. ! ?)
 *  3. Fall back to word boundaries
 *  4. Hard-cut only as a last resort
 *
 * @param {string} text       Full document text
 * @param {number} chunkSize  Target max chunk character length (default 700)
 * @param {number} overlap    Characters of overlap between adjacent chunks (default 50)
 * @returns {string[]}        Array of text chunks
 */
function chunkText(text, chunkSize = 700, overlap = 50) {
  if (!text || typeof text !== 'string') {
    throw new Error('chunkText: text must be a non-empty string');
  }
  if (chunkSize < 100) {
    throw new Error('chunkText: chunkSize must be at least 100 characters');
  }

  const cleanedText = text
    .replace(/\s+/g, ' ')       // normalise whitespace
    .replace(/\n{3,}/g, '\n\n') // cap blank lines at 2
    .trim();

  const chunks = [];
  let start = 0;

  while (start < cleanedText.length) {
    const end = Math.min(start + chunkSize, cleanedText.length);

    // If we're not at the end, try to find a clean break point
    let splitAt = end;
    if (end < cleanedText.length) {
      splitAt = _findSplitPoint(cleanedText, start, end);
    }

    const chunk = cleanedText.slice(start, splitAt).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move forward, stepping back by `overlap` to create continuity
    start = splitAt - overlap;
    if (start <= 0 || splitAt === cleanedText.length) break;
  }

  logger.debug(`chunkText: created ${chunks.length} chunks from ${cleanedText.length} characters`);
  return chunks;
}

/**
 * Finds the best position to split within a window, using progressively
 * looser criteria: paragraph → sentence → word → hard cut.
 *
 * @param {string} text
 * @param {number} windowStart
 * @param {number} windowEnd
 * @returns {number} Split index
 */
function _findSplitPoint(text, windowStart, windowEnd) {
  const window = text.slice(windowStart, windowEnd);

  // 1. Paragraph break (furthest from start wins)
  const paraIdx = window.lastIndexOf('\n\n');
  if (paraIdx > 0) return windowStart + paraIdx + 2;

  // 2. Sentence boundary
  const sentenceMatch = window.match(/.*[.!?]\s/s);
  if (sentenceMatch) return windowStart + sentenceMatch[0].length;

  // 3. Word boundary
  const spaceIdx = window.lastIndexOf(' ');
  if (spaceIdx > 0) return windowStart + spaceIdx + 1;

  // 4. Hard cut — unavoidable
  return windowEnd;
}

module.exports = { chunkText };
