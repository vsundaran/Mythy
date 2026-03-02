# 🧠 RAG System — Node.js + Supabase + OpenAI

A production-ready **Retrieval-Augmented Generation (RAG)** backend that ingests PDF/text documents, stores semantic embeddings in Supabase (pgvector), and answers user questions using only retrieved context via OpenAI GPT-4o-mini.

---

## 📁 Project Structure

```
rag-system/
├── server.js                  # Express app entry point
├── ingest.js                  # CLI ingestion script
├── sql/
│   └── setup.sql              # Supabase table + RPC setup
├── sample/
│   └── sample.txt             # Test document
├── src/
│   ├── config/
│   │   ├── supabase.js        # Singleton Supabase client
│   │   └── openai.js          # Singleton OpenAI client
│   ├── utils/
│   │   ├── pdfLoader.js       # PDF + text file parser
│   │   └── logger.js          # Winston structured logger
│   ├── services/
│   │   ├── chunk.service.js   # Semantic text chunking
│   │   ├── embedding.service.js # OpenAI embeddings (batch)
│   │   ├── ingest.service.js  # Full ingestion pipeline
│   │   └── query.service.js   # Full RAG query pipeline
│   └── routes/
│       └── rag.routes.js      # POST /rag/query + /rag/ingest
├── .env.example
├── .gitignore
└── package.json
```

---

## ⚙️ Step 1 — Database Setup (Supabase)

1. Open your **Supabase Dashboard** → **SQL Editor** → **New Query**
2. Paste and run the contents of [`sql/setup.sql`](./sql/setup.sql)

This will:

- Enable the `pgvector` extension
- Create the `documents` table (`id`, `content`, `embedding`, `source`, `metadata`, `created_at`)
- Create the `match_documents` RPC function using cosine similarity
- Grant required permissions to the `anon` role

---

## 🔐 Step 2 — Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
NODE_ENV=development
PORT=3000
OPENAI_API_KEY=sk-your-openai-api-key
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
```

---

## 📦 Step 3 — Install Dependencies

```bash
npm install
```

---

## 📄 Step 4 — Ingest a Document

### Using the CLI script (PDF or TXT):

```bash
# Ingest the included sample document
node ingest.js ./sample/sample.txt "AI Overview"

# Ingest a PDF
node ingest.js ./docs/report.pdf "Q4 Financial Report"
```

**Expected console output:**

```
🚀 Starting document ingestion
   File   : /path/to/sample.txt
   Source : AI Overview

─────────────────────────────────────────
Ingestion started: AI Overview
─────────────────────────────────────────
Document loaded — 4832 characters
✔ Chunks created: 9
Generating embeddings — total chunks: 9, batches: 1
✔ Batch 1/1 — 9 embeddings generated
✔ Records inserted: 9/9 (batch 1/1)
─────────────────────────────────────────
Ingestion complete: {"source":"AI Overview","chunksCreated":9,"recordsInserted":9}
─────────────────────────────────────────

✅ Ingestion Summary
   Source           : AI Overview
   Chunks Created   : 9
   Records Inserted : 9
   Time Elapsed     : 3.21s
```

---

## 🚀 Step 5 — Start the Server

```bash
node server.js

# Or with auto-restart (dev):
npm run dev
```

**Expected output:**

```
✅ RAG Server running on http://localhost:3000
   Environment : development
   Health check: http://localhost:3000/health
   Query API   : POST http://localhost:3000/rag/query
   Ingest API  : POST http://localhost:3000/rag/ingest
```

---

## 🧪 Step 6 — Test the API

### Health Check

```bash
curl http://localhost:3000/health
```

```json
{
  "success": true,
  "message": "Server is healthy",
  "data": { "status": "ok", "environment": "development", "timestamp": "..." },
  "error": null
}
```

---

### POST /rag/query — Ask a question

**curl:**

```bash
curl -X POST http://localhost:3000/rag/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is Retrieval-Augmented Generation and what are its benefits?"}'
```

**Postman:**

- Method: `POST`
- URL: `http://localhost:3000/rag/query`
- Headers: `Content-Type: application/json`
- Body (raw JSON):

```json
{
  "question": "What is Retrieval-Augmented Generation and what are its benefits?"
}
```

**Expected response:**

```json
{
  "success": true,
  "message": "Query processed successfully",
  "data": {
    "answer": "Retrieval-Augmented Generation (RAG) is a technique that combines retrieval systems with generative models. Instead of relying solely on parametric memory, RAG retrieves relevant documents from an external knowledge base and provides them as context to the language model at inference time. Benefits include: reducing hallucination by grounding answers in retrieved facts, allowing access to up-to-date information without retraining, and supporting private or domain-specific document Q&A.",
    "retrievedChunks": 3,
    "sources": [
      {
        "content": "RAG is a technique that combines retrieval systems with generative models...",
        "source": "AI Overview",
        "similarity": 0.9123
      }
    ]
  },
  "error": null
}
```

---

### POST /rag/query — Out-of-scope question (safety test)

```bash
curl -X POST http://localhost:3000/rag/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the capital of France?"}'
```

**Expected response:**

```json
{
  "success": true,
  "message": "Query processed successfully",
  "data": {
    "answer": "I'm sorry, that information is not available in the provided documents.",
    "retrievedChunks": 0,
    "sources": []
  },
  "error": null
}
```

---

### POST /rag/ingest — Upload a file via API

**curl:**

```bash
curl -X POST http://localhost:3000/rag/ingest \
  -F "document=@./sample/sample.txt" \
  -F "source=AI Overview"
```

**Postman:**

- Method: `POST`
- URL: `http://localhost:3000/rag/ingest`
- Body: `form-data`
  - Key: `document` (type: **File**), Value: upload your file
  - Key: `source` (type: Text), Value: `My Document`

**Expected response:**

```json
{
  "success": true,
  "message": "Document ingested successfully",
  "data": {
    "source": "AI Overview",
    "chunksCreated": 9,
    "recordsInserted": 9
  },
  "error": null
}
```

---

### POST /rag/query — Validation error test

```bash
curl -X POST http://localhost:3000/rag/query \
  -H "Content-Type: application/json" \
  -d '{"question": ""}'
```

**Expected response (400):**

```json
{
  "success": false,
  "message": "Validation failed",
  "error": [{ "field": "question", "reason": "question is required" }],
  "data": null
}
```

---

## 🔄 RAG Pipeline Flow

```
User Question
     │
     ▼
Generate Question Embedding (text-embedding-3-small)
     │
     ▼
Cosine Similarity Search (Supabase match_documents RPC)
     │
     ▼
Top-5 Relevant Chunks Retrieved
     │
     ├── No chunks? → Return "information unavailable"
     │
     ▼
Build Context String (chunks joined with source labels)
     │
     ▼
GPT-4o-mini (temperature=0, strict system prompt)
     │
     ▼
Grounded Answer + Source Preview
```

---

## 🛡️ Security Features

| Feature            | Implementation                         |
| ------------------ | -------------------------------------- |
| Rate limiting      | 100 req / 15 min per IP                |
| HTTP headers       | `helmet` middleware                    |
| CORS               | Configured globally                    |
| Input validation   | `express-validator` on all endpoints   |
| File upload limits | 50 MB max, PDF/TXT/MD only             |
| No hallucination   | `temperature: 0`, strict system prompt |
| Secrets            | `.env` only, never hardcoded           |
| Error exposure     | Stack traces hidden in production      |

---

## 🧩 Multi-Document Support

Each ingested document is tagged with a `source` label. You can ingest multiple documents:

```bash
node ingest.js ./docs/doc1.pdf "Product Manual"
node ingest.js ./docs/doc2.txt "Company FAQ"
node ingest.js ./docs/doc3.pdf "Q4 Report"
```

When you query, the answer will cite which source each retrieved chunk came from.

---

## 📊 Recommended Supabase Index Timing

> Build the IVFFlat index **after** ingesting at least 100+ rows for optimal performance.

The index is included in `setup.sql` but may need to be rebuilt:

```sql
REINDEX INDEX documents_embedding_idx;
```
