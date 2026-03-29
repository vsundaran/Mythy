const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const Admin = require('../models/admin.model');
const logger = require('../utils/logger');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: errors.array().map((e) => ({ field: e.path, reason: e.msg })),
      data: null,
    });
  }

  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email: email.toLowerCase() });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        error: { reason: 'Admin not found' },
        data: null,
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        error: { reason: 'Invalid credentials' },
        data: null,
      });
    }

    const token = generateToken(admin._id, admin.role);

    res.status(200).json({
      success: true,
      message: 'Admin logged in successfully',
      data: {
        admin: {
          id: admin._id,
          email: admin.email,
          role: admin.role,
        },
        token,
      },
      error: null,
    });
  } catch (error) {
    logger.error(`Admin login error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Server error during admin login',
      error: { reason: error.message },
      data: null,
    });
  }
};

module.exports = { login };
