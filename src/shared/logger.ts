import { pino, type LevelWithSilent } from 'pino';

export function createLogger(level: LevelWithSilent) {
  return pino({
    level,
    redact: {
      paths: ['DATABASE_URL', '*.DATABASE_URL', 'connectionString', '*.connectionString'],
      censor: '[REDACTED]',
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
