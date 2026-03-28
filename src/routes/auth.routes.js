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

module.exports = router;
