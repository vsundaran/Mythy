"use strict";

const openai = require("../config/openai");
const supabase = require("../config/supabase");
const { generateEmbedding } = require("./embedding.service");
const logger = require("../utils/logger");

const CHAT_MODEL = "gpt-4o-mini";
const MATCH_THRESHOLD = 0.20;
const MATCH_COUNT = 5;

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
 * Full RAG query pipeline.
 *
 * Steps:
 *  1. Embed the user question
 *  2. Retrieve most similar chunks from Supabase via match_documents RPC
 *  3. Handle empty retrieval gracefully (AI generates the fallback in the correct language)
 *  4. Build context string from retrieved chunks
 *  5. Call GPT-4o-mini with strict system prompt + context + question
 *  6. Return answer, sources, and retrieved chunk preview
 *
 * @param {string} question - The user's natural-language question
 * @returns {Promise<{
 *   answer: string,
 *   sources: Array<{ content: string, source: string, similarity: number }>,
 *   retrievedChunks: number
 * }>}
 */
async function queryRAG(question) {
  if (
    !question ||
    typeof question !== "string" ||
    question.trim().length === 0
  ) {
    throw new Error("queryRAG: question must be a non-empty string");
  }

  const trimmedQuestion = question.trim();
  logger.info(`RAG query received: "${trimmedQuestion.slice(0, 100)}..."`);

  // ── Step 1: Embed the question ────────────────────────────────────────────
  logger.debug("Step 1: Generating question embedding...");
  const queryEmbedding = await generateEmbedding(trimmedQuestion);
  logger.debug("Question embedding generated");

  // ── Step 2: Retrieve relevant chunks ─────────────────────────────────────
  logger.debug("Step 2: Calling match_documents RPC...");
  const { data: chunks, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
  });

  if (error) {
    logger.error(`Supabase RPC error: ${error.message}`);
    throw new Error(`Retrieval failed: ${error.message}`);
  }

  logger.info(`Step 2 complete — ${chunks?.length ?? 0} chunk(s) retrieved`);

  // ── Step 3: Handle empty retrieval ────────────────────────────────────────
  // We STILL call the LLM even if no chunks are found, so it can provide the
  // "I don't know" message in the user's language (e.g., Thanglish).
  let context = "";
  if (chunks && chunks.length > 0) {
    logger.debug("─── Retrieved Chunk Preview ─────────────────");
    chunks.forEach((chunk, idx) => {
      logger.debug(
        `Chunk ${idx + 1} | similarity: ${chunk.similarity.toFixed(4)} | source: ${chunk.source}`,
      );
      logger.debug(`  Preview: "${chunk.content.slice(0, 120)}..."`);
    });
    logger.debug("─────────────────────────────────────────────");

    context = chunks
      .map(
        (chunk, idx) =>
          `[Source ${idx + 1}: ${chunk.source || "unknown"}]\n${chunk.content}`,
      )
      .join("\n\n---\n\n");
  } else {
    logger.warn(
      "No relevant chunks found for the query. LLM will provide localized fallback.",
    );
    context = "NO_CONTEXT_AVAILABLE"; // Hint for the model to use its fallback rule
  }

  // ── Step 5: Call GPT-4o-mini ──────────────────────────────────────────────
  logger.debug("Step 5: Calling GPT-4o-mini...");

  const userMessage = `CONTEXT:\n${context}\n\n---\n\nQUESTION: ${trimmedQuestion}`;

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0, // Deterministic — no creativity, strictly grounded
    max_tokens: 1024,
  });

  const answer = completion.choices[0]?.message?.content?.trim() ?? "";
  logger.info(`RAG answer generated — ${answer.length} characters`);

  // ── Step 6: Return structured response ───────────────────────────────────
  return {
    answer,
    sources: (chunks || []).map((c) => ({
      content: c.content.slice(0, 200), // Preview only — not full chunk
      source: c.source,
      similarity: parseFloat(c.similarity.toFixed(4)),
    })),
    retrievedChunks: chunks?.length ?? 0,
  };
}

module.exports = { queryRAG };
