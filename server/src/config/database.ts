import mongoose from 'mongoose';
import config from './config';
import logger from '../utils/logger';

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      const mongoUri = config.get('mongoUri');
      
      await mongoose.connect(mongoUri);

      this.isConnected = true;
      
      logger.info('Database connected successfully', {
        host: mongoose.connection.host,
        database: mongoose.connection.name
      });

      mongoose.connection.on('error', (error) => {
        logger.error('Database connection error', error);
      });

      mongoose.connection.on('disconnected', () => {
        this.isConnected = false;
        logger.warn('Database disconnected');
      });

    } catch (error) {
      logger.error('Database connection failed', error as Error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Error disconnecting from database', error as Error);
      throw error;
    }
  }

  public isHealthy(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }
}

export const database = DatabaseConnection.getInstance();
export default database;