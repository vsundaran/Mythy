const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const chatController = require('../controllers/chat.controller');

const router = express.Router();

// ─── GET /chat/suggestions ──────────────────────────────────────────────────────
router.get('/suggestions', chatController.getSuggestions);

// ─── GET /chat/conversations ────────────────────────────────────────────────────
router.get(
  '/conversations',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  chatController.getConversations
);

// ─── GET /chat/conversations/:id/messages ───────────────────────────────────────
router.get(
  '/conversations/:id/messages',
  [
    param('id').isMongoId().withMessage('Valid conversation ID required'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  chatController.getMessages
);

// ─── POST /chat/conversations/message ───────────────────────────────────────────
// Start a new conversation or send a message to an existing one
router.post(
  '/conversations/message',
  [
    body('conversationId').optional().isMongoId().withMessage('Valid conversation ID required if provided'),
    body('content').trim().notEmpty().withMessage('Message content is required')
      .isLength({ max: 2000 }).withMessage('Message must not exceed 2000 characters'),
  ],
  chatController.sendMessage
);

module.exports = router;
