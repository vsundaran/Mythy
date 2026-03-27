const path = require('path');
const { getDb } = require('../config/mongodb');
const { loadDocument } = require('../utils/pdfLoader');
const { chunkText } = require('./chunk.service');
const { generateEmbeddingsBatch } = require('./embedding.service');
const logger = require('../utils/logger');

const COLLECTION = 'Documents';
const INSERT_BATCH_SIZE = 50; // documents per insertMany call

/**
 * Full document ingestion pipeline.
 *
 * Steps:
 *  1. Load & parse the document (PDF or text)
 *  2. Split into semantic chunks
 *  3. Generate embeddings for all chunks (batched)
 *  4. Insert chunk + embedding documents into MongoDB
 *
 * @param {string} filePath   - Path to the document file
 * @param {string} [source]   - Human-readable source label (e.g. filename)
 * @param {object} [metadata] - Optional additional metadata (e.g. { page: 1 })
 * @returns {Promise<{ source: string, chunksCreated: number, recordsInserted: number }>}
 */
async function ingestDocument(filePath, source = null, metadata = {}) {
  const sourceName = source || path.basename(filePath);

  logger.info(`─────────────────────────────────────────`);
  logger.info(`Ingestion started: ${sourceName}`);
  logger.info(`─────────────────────────────────────────`);

  // ── Step 1: Load document ─────────────────────────────────────────────────
  const text = await loadDocument(filePath);
  logger.info(`Document loaded — ${text.length} characters`);

  // ── Step 2: Chunk text ────────────────────────────────────────────────────
  const chunks = chunkText(text, 700, 50);
  logger.info(`✔ Chunks created: ${chunks.length}`);

  if (chunks.length === 0) {
    throw new Error('No text chunks could be extracted from the document');
  }

  // ── Step 3: Generate embeddings ───────────────────────────────────────────
  const embeddings = await generateEmbeddingsBatch(chunks, 10, 300);
  logger.info(`✔ Embeddings generated: ${embeddings.length}`);

  // ── Step 4: Build documents and insert into MongoDB ───────────────────────
  const docs = chunks.map((content, idx) => ({
    content,
    embedding: embeddings[idx],
    source: sourceName,
    metadata: {
      ...metadata,
      chunkIndex: idx,
      totalChunks: chunks.length,
    },
    createdAt: new Date(),
  }));

  const db = await getDb();
  const collection = db.collection(COLLECTION);
  let totalInserted = 0;
  const totalBatches = Math.ceil(docs.length / INSERT_BATCH_SIZE);

  for (let i = 0; i < docs.length; i += INSERT_BATCH_SIZE) {
    const batch = docs.slice(i, i + INSERT_BATCH_SIZE);
    const batchNum = Math.floor(i / INSERT_BATCH_SIZE) + 1;

    const result = await collection.insertMany(batch);

    totalInserted += result.insertedCount;
    logger.info(
      `✔ Records inserted: ${totalInserted}/${docs.length} (batch ${batchNum}/${totalBatches})`,
    );
  }

  const summary = {
    source: sourceName,
    chunksCreated: chunks.length,
    recordsInserted: totalInserted,
  };

  logger.info(`─────────────────────────────────────────`);
  logger.info(`Ingestion complete: ${JSON.stringify(summary)}`);
  logger.info(`─────────────────────────────────────────`);

  return summary;
}

module.exports = { ingestDocument };
