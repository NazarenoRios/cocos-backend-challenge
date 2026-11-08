import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDataSource } from './db/data-source.js';
import { createLogger } from './shared/logger.js';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const dataSource = createDataSource(env.DATABASE_URL, env.DB_POOL_MAX);

try {
  await dataSource.initialize();
} catch (err) {
  logger.fatal({ err: { message: (err as Error).message } }, 'No se pudo conectar a la base');
  process.exit(1);
}
const server = createApp(dataSource, logger).listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API escuchando');
});

let shuttingDown = false;
function shutdown(reason: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, 'Cerrando servidor');
  const forceExit = setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await dataSource.destroy().catch((err: unknown) => logger.error({ err }, 'Error cerrando la base'));
    clearTimeout(forceExit);
    process.exit(exitCode);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'Promesa rechazada sin manejar');
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Excepción no capturada');
  shutdown('uncaughtException', 1);
});
