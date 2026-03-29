const jwt = require('jsonwebtoken');
const Admin = require('../models/admin.model');
const logger = require('../utils/logger');

/**
 * Middleware to protect admin routes with JWT.
 */
const adminAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: { reason: 'No token provided' },
        data: null,
      });
    }
    
    const token = authHeader.split(' ')[1];
    // We reuse JWT_SECRET, but we look up in the Admin collection
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
        error: { reason: 'Admin not found or invalid role' },
        data: null,
      });
    }
    
    req.admin = admin; // Attach admin to request
    next();
  } catch (error) {
    logger.error(`Admin auth middleware error: ${error.message}`);
    res.status(401).json({
      success: false,
      message: 'Unauthorized',
      error: { reason: 'Invalid or expired token' },
      data: null,
    });
  }
};

module.exports = adminAuthMiddleware;
