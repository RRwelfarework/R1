import dotenv from 'dotenv';
dotenv.config();

export const config = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://rishabhrathorebtech1999_db_user:7880407722@cluster0.asx5jry.mongodb.net/',
  JWT_SECRET: process.env.JWT_SECRET || 'r59h3B2!jA0sK1qZ8oTzP0xL3eT9uD5vW9lI7jBzX6qY8oV',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'rishabh_2312res940@iitp.ac.in',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'RishabhRathore940@123',
  PORT: process.env.PORT || 4000
};
