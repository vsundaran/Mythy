'use strict';

const OpenAI = require('openai');
const logger = require('../utils/logger');

// Validate required environment variable at startup
if (!process.env.OPENAI_API_KEY) {
  logger.error('OPENAI_API_KEY must be set in environment variables');
  process.exit(1);
}

// Singleton OpenAI client — reused across all service calls
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // maxRetries and timeout can be tuned per environment
  maxRetries: 3,
  timeout: 60_000, // 60 seconds
});

module.exports = openai;
