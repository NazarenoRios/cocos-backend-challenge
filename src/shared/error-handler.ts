import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, type ErrorCode } from './errors.js';

function sendError(res: Response, status: number, code: ErrorCode, message: string, details?: unknown) {
  res.status(status).json({
    error: { code, message, ...(details !== undefined ? { details } : {}), requestId: res.req.id },
  });
}

function mapBodyParserError(err: unknown): { status: number; code: ErrorCode; message: string } | null {
  const { type, status } = err as { type?: string; status?: number };
  if (type === 'entity.parse.failed')
    return { status: 400, code: 'INVALID_JSON', message: 'El body no es un JSON válido' };
  if (type === 'entity.too.large')
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'El body supera el límite de 10kb' };
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return { status, code: 'BAD_REQUEST', message: 'Request inválido' };
  }
  return null;
}

export const notFoundHandler: RequestHandler = (req, res) => {
  sendError(res, 404, 'NOT_FOUND', `Ruta ${req.method} ${req.path} inexistente`);
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    sendError(res, 400, 'VALIDATION_ERROR', 'Request inválido', details);
    return;
  }

  if (err instanceof AppError) {
    sendError(res, err.status, err.code, err.message, err.details);
    return;
  }

  const clientError = mapBodyParserError(err);
  if (clientError) {
    sendError(res, clientError.status, clientError.code, clientError.message);
    return;
  }

  req.log.error({ err }, 'Error no controlado');
  sendError(res, 500, 'INTERNAL_ERROR', 'Error interno');
};
