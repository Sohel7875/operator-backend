import mongoose from 'mongoose';
import config from './config.js';

export async function connectMongo() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUrl);
  console.log('✓ Operator connected to MongoDB:', config.mongoUrl);
  return mongoose.connection;
}

export default connectMongo;
