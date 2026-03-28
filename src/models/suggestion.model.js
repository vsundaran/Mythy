const mongoose = require('mongoose');

const suggestionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Suggestion text is required'],
      trim: true,
      maxlength: [100, 'Suggestion cannot exceed 100 characters'],
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Suggestion', suggestionSchema);
