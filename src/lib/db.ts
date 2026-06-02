import mongoose from 'mongoose';

let isConnected = false;

export default async function connectDB() {
  if (isConnected) return mongoose;

  const MONGODB_URI = process.env.MONGODB_URI || '';
  if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  try {
    await mongoose.connect(MONGODB_URI, { bufferCommands: false });
    isConnected = true;
    console.log('MongoDB connected via Mongoose');
    return mongoose;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}
