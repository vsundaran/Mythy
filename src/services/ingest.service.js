const path = require('path');
const { getDb } = require('../config/mongodb');
const { loadDocument } = require('../utils/pdfLoader');
const { chunkText, extractDidYouKnowSections, splitIntoMyths } = require('./chunk.service');
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
  let chunkObjects = [];
  let factsExtractedCount = 0;

  const hasMyths = /(?:^|\n)\s*(?:Myth\s*)?\d+[\.\:\)]?\s+/i.test(text);

  if (hasMyths) {
    logger.info(`Detected structured "Myth" patterns. Applying semantic chunking.`);
    
    // Extract facts
    const facts = extractDidYouKnowSections(text);
    factsExtractedCount = facts.length;
    facts.forEach((fact, idx) => {
      chunkObjects.push({
        content: fact,
        metadata: { ...metadata, type: 'fact', title: `Fact ${idx + 1}` },
      });
    });

    // Extract myths
    const myths = splitIntoMyths(text);
    myths.forEach((myth) => {
      chunkObjects.push({
        content: myth.content,
        metadata: {
          ...metadata,
          type: 'myth',
          mythNumber: myth.mythNumber,
          title: myth.title,
        },
      });
    });
  } else {
    logger.info(`No structured "Myth" patterns detected. Applying generic chunking.`);
    const chunks = chunkText(text, 700, 50);
    chunks.forEach((chunk, idx) => {
      chunkObjects.push({
        content: chunk,
        metadata: {
          ...metadata,
          type: 'generic',
          chunkIndex: idx,
          totalChunks: chunks.length,
        },
      });
    });
  }

  logger.info(`✔ Chunks created: ${chunkObjects.length} (Facts: ${factsExtractedCount})`);

  if (chunkObjects.length === 0) {
    throw new Error('No text chunks could be extracted from the document');
  }

  // ── Step 3: Generate embeddings ───────────────────────────────────────────
  const textsToEmbed = chunkObjects.map((obj) => obj.content);
  const embeddings = await generateEmbeddingsBatch(textsToEmbed, 10, 300);
  logger.info(`✔ Embeddings generated: ${embeddings.length}`);

  // ── Step 4: Build documents and insert into MongoDB ───────────────────────
  const docs = chunkObjects.map((obj, idx) => ({
    content: obj.content,
    embedding: embeddings[idx],
    metadata: {
      documentId: metadata.documentId || 'unknown_document',
      category: metadata.category || 'general',
      subCategory: metadata.subCategory,
      sourceLink: metadata.sourceLink,
      type: obj.metadata.type,
      mythNumber: obj.metadata.mythNumber,
      title: obj.metadata.title,
      source: sourceName,
      chunkIndex: obj.metadata.chunkIndex,
      totalChunks: obj.metadata.totalChunks,
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
    chunksCreated: chunkObjects.length,
    recordsInserted: totalInserted,
  };

  logger.info(`─────────────────────────────────────────`);
  logger.info(`Ingestion complete: ${JSON.stringify(summary)}`);
  logger.info(`─────────────────────────────────────────`);

  return summary;
}

module.exports = { ingestDocument };
