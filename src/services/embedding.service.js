const openai = require('../config/openai');
const logger = require('../utils/logger');

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generates a single embedding vector for a given text.
 *
 * @param {string} text - The text to embed
 * @returns {Promise<number[]>} - 1536-dimensional float array
 */
async function generateEmbedding(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('generateEmbedding: text must be a non-empty string');
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim(),
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data[0].embedding;
}

/**
 * Generates embeddings for an array of texts in async batches.
 * Batching prevents hitting OpenAI API rate limits.
 *
 * @param {string[]} texts        - Array of text chunks
 * @param {number}   batchSize    - Number of texts per API call (default 10)
 * @param {number}   delayMs      - Delay between batches in ms (default 300)
 * @returns {Promise<number[][]>} - Array of embedding vectors (same order as input)
 */
async function generateEmbeddingsBatch(texts, batchSize = 10, delayMs = 300) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('generateEmbeddingsBatch: texts must be a non-empty array');
  }

  const allEmbeddings = [];
  const totalBatches = Math.ceil(texts.length / batchSize);

  logger.info(`Generating embeddings — total chunks: ${texts.length}, batches: ${totalBatches}`);

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    logger.debug(`Embedding batch ${batchNumber}/${totalBatches} — ${batch.length} texts`);

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((t) => t.trim()),
      dimensions: EMBEDDING_DIMENSIONS,
    });

    // The API returns embeddings in the same order as the input
    const batchEmbeddings = response.data.map((item) => item.embedding);
    allEmbeddings.push(...batchEmbeddings);

    logger.info(`✔ Batch ${batchNumber}/${totalBatches} — ${batch.length} embeddings generated`);

    // Rate-limit buffer between batches (skip delay after last batch)
    if (i + batchSize < texts.length) {
      await _sleep(delayMs);
    }
  }

  logger.info(`Embedding complete — total vectors: ${allEmbeddings.length}`);
  return allEmbeddings;
}

// ─── Private ─────────────────────────────────────────────────────────────────

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { generateEmbedding, generateEmbeddingsBatch };
