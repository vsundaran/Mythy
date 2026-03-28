const { validationResult } = require('express-validator');
const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');
const Suggestion = require('../models/suggestion.model');
const { queryRAG } = require('../services/query.service');
const logger = require('../utils/logger');

// ─── GET /chat/suggestions ──────────────────────────────────────────────────────
exports.getSuggestions = async (req, res, next) => {
  try {
    const suggestions = await Suggestion.find({ isActive: true })
      .sort({ order: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Suggestions fetched',
      data: suggestions,
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /chat/conversations ────────────────────────────────────────────────────
exports.getConversations = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const conversations = await Conversation.find({ userId: req.user.id })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Conversation.countDocuments({ userId: req.user.id });

    return res.status(200).json({
      success: true,
      message: 'Conversations fetched',
      data: {
        conversations,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /chat/conversations/:id/messages ───────────────────────────────────────
exports.getMessages = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: errors.array().map((e) => ({ field: e.path, reason: e.msg })),
        data: null,
      });
    }

    const { id } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    // Verify conversation belongs to user
    const conversation = await Conversation.findOne({ _id: id, userId: req.user.id });
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
        error: null,
        data: null,
      });
    }

    const messages = await Message.find({ conversationId: id })
      .sort({ createdAt: -1 }) // Sort desc for pagination (latest first)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Message.countDocuments({ conversationId: id });

    return res.status(200).json({
      success: true,
      message: 'Messages fetched',
      data: {
         // UI expects chronological order, but fetching latest pages makes sense in reverse.
         // Let's reverse back to chronological.
        messages: messages.reverse(),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
      error: null,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /chat/conversations/message ───────────────────────────────────────────
exports.sendMessage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: errors.array().map((e) => ({ field: e.path, reason: e.msg })),
        data: null,
      });
    }

    const { conversationId, content } = req.body;
    let conversation;

    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, userId: req.user.id });
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found',
          error: null,
          data: null,
        });
      }
    } else {
      // Create new conversation
      // Optional enhancement: use LLM to summarize content as title
      const title = content.length > 30 ? content.slice(0, 30) + '...' : content;
      conversation = await Conversation.create({
        userId: req.user.id,
        title,
      });
    }

    // Save user message
    const userMessage = await Message.create({
      conversationId: conversation._id,
      sender: 'user',
      content,
    });

    // Update conversation lastMessageAt
    conversation.lastMessageAt = Date.now();
    await conversation.save();

    // Trigger RAG query
    logger.info(`Processing RAG for user ${req.user.id} in conversation ${conversation._id}`);
    
    // We do NOT block the whole initial process if it's slow, but here we await it
    // since we need the AI reply in response. Proper async SSE could be done later.
    const result = await queryRAG(content);

    // Save AI message
    const aiMessage = await Message.create({
      conversationId: conversation._id,
      sender: 'ai',
      content: result.answer,
    });

    conversation.lastMessageAt = Date.now();
    await conversation.save();

    return res.status(201).json({
      success: true,
      message: 'Message processed',
      data: {
        conversation: {
          _id: conversation._id,
          title: conversation.title,
        },
        userMessage,
        aiMessage,
        sources: result.sources,
      },
      error: null,
    });

  } catch (err) {
    next(err);
  }
};
