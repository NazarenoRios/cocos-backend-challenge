import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import type { Logger } from './logger.js';

const VALID_REQUEST_ID = /^[\w-]{1,64}$/;

export function httpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
  });
}
