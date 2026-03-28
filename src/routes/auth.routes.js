const authController = require('../controllers/auth.controller');
const { validateGoogleAuth } = require('../validators/auth.validator');
const express = require('express');
const router = express.Router();

/**
 * @route   POST /auth/google
 * @desc    Authenticate with Google
 * @access  Public
 */
router.post('/google', validateGoogleAuth, authController.googleAuth);

/**
 * @route   POST /auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh', authController.refresh);

module.exports = router;
