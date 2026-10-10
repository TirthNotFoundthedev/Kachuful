import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = createApp(config);

app.http.listen(config.port, () => {
  console.log(`Kachuful server listening on :${config.port}`);
  console.log(`Allowed origins: ${config.clientOrigins.join(', ')}`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down`);
  app.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
