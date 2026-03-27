/**
 * CLI ingestion script.
 *
 * Usage:
 *   node ingest.js <path-to-file> [source-label]
 *
 * Examples:
 *   node ingest.js ./sample/sample.txt "AI Overview Doc"
 *   node ingest.js ./docs/report.pdf "Q4 Report"
 */

require('dotenv').config();

const path = require('path');
const { ingestDocument } = require('./src/services/ingest.service');
const logger = require('./src/utils/logger');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('\n❌  Usage: node ingest.js <path-to-file> [source-label]\n');
    console.error('   Examples:');
    console.error('     node ingest.js ./sample/sample.txt "AI Overview"');
    console.error('     node ingest.js ./docs/report.pdf "Annual Report"\n');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const source = args[1] || path.basename(filePath);

  logger.info(`\n🚀 Starting document ingestion`);
  logger.info(`   File   : ${filePath}`);
  logger.info(`   Source : ${source}\n`);

  const start = Date.now();

  try {
    const result = await ingestDocument(filePath, source);
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);

    logger.info('\n✅ Ingestion Summary');
    logger.info(`   Source           : ${result.source}`);
    logger.info(`   Chunks Created   : ${result.chunksCreated}`);
    logger.info(`   Records Inserted : ${result.recordsInserted}`);
    logger.info(`   Time Elapsed     : ${elapsed}s\n`);

    process.exit(0);
  } catch (err) {
    logger.error(`\n❌ Ingestion failed: ${err.message}`);
    if (process.env.NODE_ENV !== 'production') {
      logger.error(err.stack);
    }
    process.exit(1);
  }
}

main();
