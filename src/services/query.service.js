const openai = require('../config/openai');
const { getDb } = require('../config/mongodb');
const { generateEmbedding } = require('./embedding.service');
const logger = require('../utils/logger');

const COLLECTION = 'Documents';
const VECTOR_INDEX_NAME = 'vector_index'; // Atlas Vector Search index name
const CHAT_MODEL = 'gpt-4o-mini';
const MATCH_THRESHOLD = 0.20; 
const MATCH_COUNT = 5;
const NUM_CANDIDATES = 100; // candidates considered by Atlas ANN before filtering

// System prompt: strict grounding — no hallucination
const SYSTEM_PROMPT = `You are a precise question-answering assistant.
You must answer the user's question using ONLY the context provided below.
Rules:
- Answer factually and concisely based solely on the given context.
- You MUST respond in the EXACT SAME LANGUAGE and SCRIPT as the user's question.
- If the question is in English, respond in English.
- If the question is in "Thanglish" (Tamil words written using English/Roman alphabet), you MUST respond in Thanglish.
- If the answer is not present in the context, respond with a polite message in the SAME LANGUAGE as the query stating that the information is not available.
- Do NOT speculate, infer beyond what the context says, or use external knowledge.
- Do NOT make up information.`;

/**
 * Full RAG query pipeline using MongoDB Atlas Vector Search.
 *
 * Steps:
 *  1. Embed the user question
 *  2. Run $vectorSearch aggregation against MongoDB Atlas Vector Search index
 *  3. Handle empty retrieval gracefully
 *  4. Build context string from retrieved chunks
 *  5. Call GPT-4o-mini with strict system prompt + context + question
 *  6. Return answer, sources, and retrieved chunk count
 *
 * @param {string} question - The user's natural-language question
 * @returns {Promise<{
 *   answer: string,
 *   sources: Array<{ content: string, source: string, similarity: number }>,
 *   retrievedChunks: number
 * }>}
 */
async function queryRAG(question) {
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    throw new Error('queryRAG: question must be a non-empty string');
  }

  const trimmedQuestion = question.trim();
  logger.info(`RAG query received: "${trimmedQuestion.slice(0, 100)}..."`);

  // ── Step 1: Embed the question ────────────────────────────────────────────
  logger.debug('Step 1: Generating question embedding...');
  const queryEmbedding = await generateEmbedding(trimmedQuestion);
  logger.debug('Question embedding generated');

  // ── Step 2: Atlas Vector Search via $vectorSearch aggregation ─────────────
  // Uses the pre-created Atlas Search index (field: "embedding", cosine, 1536 dims).
  // $vectorSearch performs Approximate Nearest Neighbour (ANN) search entirely
  // inside MongoDB Atlas — no data is pulled into memory for scoring.
  logger.debug('Step 2: Running MongoDB Atlas $vectorSearch...');

  const db = await getDb();
  const collection = db.collection(COLLECTION);

  const pipeline = [
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates: NUM_CANDIDATES,
        limit: MATCH_COUNT,
      },
    },
    {
      // $meta "vectorSearchScore" is the cosine similarity score injected by Atlas
      $project: {
        _id: 0,
        content: 1,
        source: 1,
        metadata: 1,
        similarity: { $meta: 'vectorSearchScore' },
      },
    },
    // NOTE: No $match threshold filter here.
    // Atlas ANN already guarantees the top-N most relevant results.
    // A hard post-filter silently drops valid chunks when cosine scores float
    // below an arbitrary cutoff, causing false "no context found" responses.
  ];

  const chunks = await collection.aggregate(pipeline).toArray();

  // Soft observability log — warn if scores look low, but still proceed
  if (chunks.length > 0) {
    const topScore = chunks[0].similarity ?? 0;
    if (topScore < MATCH_THRESHOLD) {
      logger.warn(
        `Top similarity score (${topScore.toFixed(4)}) is below threshold (${MATCH_THRESHOLD}). ` +
        'Results may be weakly relevant but will still be passed to the LLM.',
      );
    }
  }

  logger.info(`Step 2 complete — ${chunks.length} chunk(s) retrieved`);

  // ── Step 3: Handle empty retrieval ────────────────────────────────────────
  let context = '';
  if (chunks.length > 0) {
    logger.debug('─── Retrieved Chunk Preview ─────────────────');
    chunks.forEach((chunk, idx) => {
      logger.debug(
        `Chunk ${idx + 1} | similarity: ${chunk.similarity.toFixed(4)} | source: ${chunk.source}`,
      );
      logger.debug(`  Preview: "${chunk.content.slice(0, 120)}..."`);
    });
    logger.debug('─────────────────────────────────────────────');

    context = chunks
      .map(
        (chunk, idx) =>
          `[Source ${idx + 1}: ${chunk.source || 'unknown'}]\n${chunk.content}`,
      )
      .join('\n\n---\n\n');
  } else {
    logger.warn(
      'No relevant chunks found for the query. LLM will provide localized fallback.',
    );
    context = 'NO_CONTEXT_AVAILABLE'; // hint for the model to use its fallback rule
  }

  // ── Step 4: Call GPT-4o-mini ──────────────────────────────────────────────
  logger.debug('Step 4: Calling GPT-4o-mini...');

  const userMessage = `CONTEXT:\n${context}\n\n---\n\nQUESTION: ${trimmedQuestion}`;

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0, // deterministic — strictly grounded
    max_tokens: 1024,
  });

  const answer = completion.choices[0]?.message?.content?.trim() ?? '';
  logger.info(`RAG answer generated — ${answer.length} characters`);

  // ── Step 5: Return structured response ───────────────────────────────────
  return {
    answer,
    sources: chunks.map((c) => ({
      content: c.content.slice(0, 200), // preview only — not full chunk
      source: c.source,
      similarity: parseFloat(c.similarity.toFixed(4)),
    })),
    retrievedChunks: chunks.length,
  };
}

module.exports = { queryRAG };
