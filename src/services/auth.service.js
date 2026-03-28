const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const logger = require('../utils/logger');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verifies the Google ID token and returns the payload.
 * @param {string} token 
 * @returns {Promise<object>}
 */
const verifyGoogleToken = async (token) => {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: [
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_ANDROID_CLIENT_ID,
        process.env.GOOGLE_IOS_CLIENT_ID,
      ].filter(Boolean),
    });
    return ticket.getPayload();
  } catch (error) {
    logger.error(`Google token verification failed: ${error.message}`);
    throw new Error('Invalid Google token');
  }
};

/**
 * Generates an access token for a user.
 * @param {string} userId 
 * @returns {string}
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

/**
 * Generates a refresh token for a user.
 * @param {string} userId 
 * @returns {string}
 */
const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

/**
 * Refreshes an access token using a valid refresh token.
 * @param {string} token 
 * @returns {Promise<object>}
 */
const refreshAccessToken = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== token) {
      throw new Error('Invalid refresh token');
    }

    const newAccessToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save();

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  } catch (error) {
    logger.error(`Refresh token failed: ${error.message}`);
    throw new Error('Invalid or expired refresh token');
  }
};

/**
 * Authenticates a user with Google (Signup/Login).
 * @param {string} googleToken 
 * @returns {Promise<object>}
 */
const authenticateWithGoogle = async (googleToken) => {
  const payload = await verifyGoogleToken(googleToken);
  
  const { sub: googleId, email, name, picture } = payload;
  
  let user = await User.findOne({ googleId });
  
  if (!user) {
    // Check if user exists with same email (rare but possible)
    user = await User.findOne({ email });
    if (user) {
      user.googleId = googleId;
      user.picture = picture || user.picture;
      await user.save();
    } else {
      user = await User.create({
        googleId,
        email,
        name,
        picture,
      });
      logger.info(`New user created: ${email}`);
    }
  } else {
    // Update last login
    user.lastLogin = new Date();
    await user.save();
  }
  
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  
  user.refreshToken = refreshToken;
  await user.save();
  
  return {
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
    token, // access token
    refreshToken,
  };
};

module.exports = {
  authenticateWithGoogle,
  generateToken,
  generateRefreshToken,
  refreshAccessToken,
};
