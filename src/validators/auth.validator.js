const { body } = require('express-validator');
const { validationResult } = require('express-validator');

const validateGoogleAuth = [
  body('token')
    .notEmpty()
    .withMessage('Google token is required')
    .isString()
    .withMessage('Token must be a string'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: errors.array().map(err => ({
          field: err.path,
          reason: err.msg
        })),
        data: null,
      });
    }
    next();
  }
];

module.exports = {
  validateGoogleAuth,
};
