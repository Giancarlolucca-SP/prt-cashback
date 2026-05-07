const app = require('./app');
const { startScheduler } = require('./utils/scheduler');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 PostoCash rodando na porta ${PORT}`);
  console.log(`   Ambiente : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health   : http://localhost:${PORT}/health\n`);

  // Start background jobs (non-blocking)
  startScheduler();
});
