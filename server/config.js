import dotenv from 'dotenv';
dotenv.config();

export const config = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://arpit:8009138392@cluster0.y0nburv.mongodb.net/',
  JWT_SECRET: process.env.JWT_SECRET || 'r59h3B2!jA0sK1qZ8oTzP0xL3eT9uD5vW9lI7jBzX6qY8oV',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'rishabh_2312res940@iitp.ac.in',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'RishabhRathore940@123',
  PORT: process.env.PORT || 4000
};
