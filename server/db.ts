import dotenv from 'dotenv';
import mysql, { Pool } from 'mysql2/promise';
import path from 'path';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_DATABASE || 'scoolmeet_db',
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD ?? '',
};

/**
 * Centralized MySQL Connection Pool (mysql2/promise)
 */
export const pool: Pool = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  password: dbConfig.password,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export function getDbInfo() {
  return {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
  };
}

/**
 * Verify MySQL connection by executing a lightweight query
 */
export async function testDatabaseConnection(): Promise<{
  connected: boolean;
  database: string;
  host: string;
  port: number;
  error?: string;
}> {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SELECT 1');
      return {
        connected: true,
        database: dbConfig.database,
        host: dbConfig.host,
        port: dbConfig.port,
      };
    } finally {
      connection.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown MySQL connection error';
    return {
      connected: false,
      database: dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port,
      error: message,
    };
  }
}

