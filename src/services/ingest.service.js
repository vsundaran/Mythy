'use strict';

const path = require('path');
const supabase = require('../config/supabase');
const { loadDocument } = require('../utils/pdfLoader');
const { chunkText } = require('./chunk.service');
const { generateEmbeddingsBatch } = require('./embedding.service');
const logger = require('../utils/logger');

const INSERT_BATCH_SIZE = 50; // Supabase rows per insert call

/**
 * Full document ingestion pipeline.
 *
 * Steps:
 *  1. Load & parse the document (PDF or text)
 *  2. Split into semantic chunks
 *  3. Generate embeddings for all chunks (batched)
 *  4. Insert chunk + embedding rows into Supabase
 *
 * @param {string} filePath   - Path to the document file
 * @param {string} [source]   - Human-readable source label (e.g. filename)
 * @param {object} [metadata] - Optional additional metadata (e.g. { page: 1 })
 * @returns {Promise<{ chunksCreated: number, recordsInserted: number }>}
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

  // ── Step 4: Build rows and insert into Supabase ───────────────────────────
  const rows = chunks.map((content, idx) => ({
    content,
    embedding: embeddings[idx],
    source: sourceName,
    metadata: {
      ...metadata,
      chunkIndex: idx,
      totalChunks: chunks.length,
    },
  }));

  let totalInserted = 0;

  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
    const batchNum = Math.floor(i / INSERT_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / INSERT_BATCH_SIZE);

    const { error } = await supabase.from('documents').insert(batch);

    if (error) {
      logger.error(`Supabase insert failed (batch ${batchNum}): ${error.message}`);
      throw new Error(`Supabase insert error: ${error.message}`);
    }

    totalInserted += batch.length;
    logger.info(`✔ Records inserted: ${totalInserted}/${rows.length} (batch ${batchNum}/${totalBatches})`);
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
