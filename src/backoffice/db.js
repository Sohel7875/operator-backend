import mongoose from 'mongoose';
import config from '../config.js';

/**
 * Dedicated connection for backoffice data (Game / User / gameHistory), so the
 * operator's own player+wallet DB (default connection) is untouched. Point
 * BACKOFFICE_MONGODB_URL at the DB that holds the slot-rc-duckhunt data.
 */
const conn = mongoose.createConnection(config.backofficeMongoUrl);
conn.on('connected', () => console.log('✓ Backoffice connected to MongoDB:', config.backofficeMongoUrl));
conn.on('error', (e) => console.error('Backoffice Mongo error:', e.message));

export default conn;
