import app from './app.js';
import config from './config.js';
import { connectMongo } from './db.js';
import { selfRegister } from './aggregatorClient.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function registerWithRetry(attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const out = await selfRegister();
      console.log(`✓ Registered with aggregator as "${out.operatorId}" (wallet: ${config.publicUrl})`);
      console.log(`  enabled games: ${out.enabledGames?.join(', ')}`);
      return;
    } catch (err) {
      console.warn(`register attempt ${i}/${attempts} failed: ${err.message}`);
      if (i < attempts) await sleep(1500);
    }
  }
  console.error('⚠️  Could not self-register. Is the aggregator running on', config.aggregatorRestUrl, '?');
}

async function bootstrap() {
  await connectMongo();
  app.listen(config.port, async () => {
    console.log(`\n🏦 Operator backend "${config.operatorId}" on http://localhost:${config.port}`);
    console.log(`   auth:    POST /api/auth/signup · /api/auth/login`);
    console.log(`   player:  GET /api/me · POST /api/deposit · GET /api/transactions · POST /api/launch  (JWT)`);
    console.log(`   wallet:  POST /bet /win /balance /rollback  (aggregator, signed)`);
    await registerWithRetry();
  });
}

bootstrap().catch((err) => {
  console.error('Fatal boot error:', err.message);
  process.exit(1);
});
