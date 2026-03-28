require('dotenv').config();
const mongoose = require('mongoose');
const Suggestion = require('./src/models/suggestion.model');
const { connectDb, closeDb } = require('./src/config/mongodb');
const connectMongoose = require('./src/config/mongoose');

const masterSuggestions = [
  { text: 'Baby crying too much', order: 1 },
  { text: 'Can a 3 month baby drink water?', order: 2 },
  { text: 'Baby not sleeping', order: 3 },
  { text: 'Is honey safe for infants?', order: 4 },
  { text: 'How to relieve baby gas?', order: 5 },
  { text: 'When do babies start teething?', order: 6 },
];

async function seedSuggestions() {
  try {
    // We only need mongoose connection, but connecting both just to be safe
    // consistent with server.js setup
    await connectDb();
    await connectMongoose();
    
    console.log('Clearing existing suggestions...');
    await Suggestion.deleteMany({});
    
    console.log('Inserting master data...');
    const result = await Suggestion.insertMany(masterSuggestions);
    
    console.log(`Successfully inserted ${result.length} suggestions.`);
  } catch (error) {
    console.error('Error seeding suggestions:', error);
  } finally {
    await mongoose.disconnect();
    await closeDb();
    console.log('Database connections closed.');
    process.exit(0);
  }
}

seedSuggestions();
