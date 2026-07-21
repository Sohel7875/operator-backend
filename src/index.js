import app from './app.js';
import config from './config.js';
import { connectMongo } from './db.js';

async function bootstrap() {
  await connectMongo();
  app.listen(config.port, () => {
    console.log(`\n🏦 Operator backend "${config.operatorId}" on port ${config.port}`);
    console.log(`   auth:    POST /api/auth/signup · /api/auth/login`);
    console.log(`   player:  GET /api/me · POST /api/deposit · GET /api/transactions · POST /api/launch  (JWT)`);
    console.log(`   wallet:  POST /bet /win /balance /rollback  (aggregator, signed)`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal boot error:', err.message);
  process.exit(1);
});
