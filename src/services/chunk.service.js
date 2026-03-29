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

/**
 * Extracts all 'Did you know?' facts from the text.
 * A fact starts from "Did you know?" and continues until \n\n or the next "Myth " pattern.
 * @param {string} text Full document text.
 * @returns {string[]} Array of extracted fact strings.
 */
function extractDidYouKnowSections(text) {
  if (!text) return [];
  
  const facts = [];
  const regex = /Did you know\?[^]*?(?=\n\s*\n|(?:\n\s*(?:Myth\s*)?\d+[\.\:\)]?\s+)|$)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const factText = match[0].trim();
    if (factText.length > 15) {
      facts.push(factText);
    }
  }
  return facts;
}

/**
 * Splits the document into semantic myths.
 * Looks for patterns like "Myth 1:", "Myth 2:", etc.
 * @param {string} rawText Full document text.
 * @returns {Array<{ mythNumber: number, title: string, content: string }>}
 */
function splitIntoMyths(rawText) {
  if (!rawText) return [];
  
  const myths = [];
  const mythRegex = /(?:^|\n)\s*(?:Myth\s*)?(\d+)[\.\:\)]?\s+([^\n\r]*)/gi;
  const matches = [...rawText.matchAll(mythRegex)];
  
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const startIndex = match.index;
    const nextMatchIndex = (i + 1 < matches.length) ? matches[i + 1].index : rawText.length;
    
    // Extract the full myth block
    let fullBlock = rawText.slice(startIndex, nextMatchIndex).trim();
    
    // Remove extracted "Did you know?" chunks from the myth's content so they are not duplicated
    // However, if we just remove them, we might break the original text's flow, but it's requested to treat them as independent.
    const factsInBlock = extractDidYouKnowSections(fullBlock);
    for (const fact of factsInBlock) {
      fullBlock = fullBlock.replace(fact, '').trim();
    }
    
    const mythNumber = match[1] ? parseInt(match[1], 10) : (i + 1);
    let titleMatch = match[2] ? match[2].trim() : `Myth ${mythNumber}`;
    // Fallback if title is empty
    if (!titleMatch || titleMatch.length === 0) {
      titleMatch = `Myth ${mythNumber}`;
    }
    
    // If the block is too large (>2000 chars), split it into 2 chunks max
    if (fullBlock.length > 2000) {
      const splitIndex = _findSplitPoint(fullBlock, Math.floor(fullBlock.length / 2), fullBlock.length - 1);
      const chunk1 = fullBlock.slice(0, splitIndex).trim();
      const chunk2 = fullBlock.slice(splitIndex).trim();
      
      if (chunk1.length > 0) {
        myths.push({ mythNumber, title: titleMatch, content: chunk1 });
      }
      if (chunk2.length > 0) {
        myths.push({ mythNumber, title: `${titleMatch} (Continued)`, content: chunk2 });
      }
    } else if (fullBlock.length > 0) {
      myths.push({ mythNumber, title: titleMatch, content: fullBlock });
    }
  }
  
  return myths;
}

module.exports = { chunkText, extractDidYouKnowSections, splitIntoMyths };
