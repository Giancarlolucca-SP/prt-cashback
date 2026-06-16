require('./src/agent').runLoop().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
