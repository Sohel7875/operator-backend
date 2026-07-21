import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const e = process.env;

export const config = {
  port: Number(e.PORT || 5000),
  operatorId: e.OPERATOR_ID || 'demo-operator',
  operatorName: e.OPERATOR_NAME || 'Demo Operator',
  publicUrl: e.OPERATOR_PUBLIC_URL || 'http://localhost:5000',

  mongoUrl: e.MONGODB_URL || 'mongodb://localhost:27017/slot-operator-backend',
  // Backoffice (Game/User/gameHistory) data — defaults to the same DB; point at
  // the slot-machines DB that holds the admin users + game history.
  backofficeMongoUrl: e.BACKOFFICE_MONGODB_URL || e.MONGODB_URL || 'mongodb://localhost:27017/slot-operator-backend',

  jwtSecret: e.JWT_SECRET || 'operator-dev-jwt-secret-change-me',
  jwtExpiresIn: e.JWT_EXPIRES_IN || '7d',
  signupBonus: Number(e.SIGNUP_BONUS || 0),

  apiKey: e.OPERATOR_API_KEY || 'opk_demo_operator_key_001',
  inboundSecret: e.OPERATOR_INBOUND_SECRET || 'ins_demo_operator_inbound_secret_001',
  outboundSecret: e.OPERATOR_OUTBOUND_SECRET || 'outs_demo_operator_outbound_secret_001',

  aggregatorRestUrl: e.AGGREGATOR_REST_URL || 'http://localhost:4000',

  currency: e.CURRENCY || 'USD',
  clockSkewSeconds: 30,
};

export default config;
