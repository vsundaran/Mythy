"use strict";

const { createClient } = require("@supabase/supabase-js");
const logger = require("../utils/logger");

// Validate required environment variables at startup
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  logger.error(
    "SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment variables",
  );
  process.exit(1);
}

// Singleton Supabase client — reused across all service calls
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false, // server-side: no session persistence
    },
  },
);

module.exports = supabase;
