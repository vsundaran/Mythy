const authService = require('../services/auth.service');
const logger = require('../utils/logger');

/**
 * Handles Google Login/Signup.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 */
const googleAuth = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Google token is required',
        error: { field: 'token', reason: 'Token is missing' },
        data: null,
      });
    }
    
    const result = await authService.authenticateWithGoogle(token);
    
    res.status(200).json({
      success: true,
      message: 'Authentication successful',
      data: result,
      error: null,
    });
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`);
    res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: { reason: error.message },
      data: null,
    });
  }
};

/**
 * Refreshes an access token using a valid refresh token.
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 */
const refresh = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
        error: { field: 'token', reason: 'Token is missing' },
        data: null,
      });
    }

    const result = await authService.refreshAccessToken(token);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: result,
      error: null,
    });
  } catch (error) {
    logger.error(`Refresh token endpoint error: ${error.message}`);
    res.status(401).json({
      success: false,
      message: 'Token refresh failed',
      error: { reason: error.message },
      data: null,
    });
  }
};

module.exports = {
  googleAuth,
  refresh,
};
