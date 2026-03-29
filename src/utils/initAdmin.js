const bcrypt = require('bcryptjs');
const Admin = require('../models/admin.model');
const logger = require('./logger');

const initAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD not found in .env. Admin will not be seeded.');
      return;
    }

    const existingAdmin = await Admin.findOne({ email: adminEmail.toLowerCase() });
    if (existingAdmin) {
      logger.info('Admin user already exists.');
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const newAdmin = new Admin({
      email: adminEmail,
      password: hashedPassword,
    });

    await newAdmin.save();
    logger.info('✅ Admin user successfully seeded into database.');
  } catch (error) {
    logger.error(`Error seeding admin: ${error.message}`);
  }
};

module.exports = initAdmin;
