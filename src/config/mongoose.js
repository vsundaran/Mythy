const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectMongoose = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, { dbName: 'NilaBaby' });
    logger.info(`✅ Mongoose connected — host: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`❌ Mongoose connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectMongoose;
