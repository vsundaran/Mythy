const { MongoClient, ServerApiVersion } = require('mongodb');
const logger = require('../utils/logger');

if (!process.env.MONGODB_URI) {
  logger.error('MONGODB_URI must be set in environment variables');
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,        // Must be false — $vectorSearch is not in API v1 strict spec
    deprecationErrors: true,
  },
});

const DB_NAME = 'NilaBaby';

let _db = null;

/**
 * Connects the MongoClient (idempotent — safe to call multiple times).
 * @returns {Promise<void>}
 */
async function connectDb() {
  if (_db) return; // already connected
  await client.connect();
  _db = client.db(DB_NAME);
  logger.info(`✅ MongoDB connected — database: "${DB_NAME}"`);
}

/**
 * Returns the connected Db instance.
 * Connects lazily if not already connected.
 * @returns {Promise<import('mongodb').Db>}
 */
async function getDb() {
  if (!_db) await connectDb();
  return _db;
}

/**
 * Gracefully closes the MongoClient connection.
 * Call on process shutdown (SIGTERM / SIGINT).
 * @returns {Promise<void>}
 */
async function closeDb() {
  if (!_db) return;
  await client.close();
  _db = null;
  logger.info('MongoDB connection closed');
}

module.exports = { connectDb, getDb, closeDb };
