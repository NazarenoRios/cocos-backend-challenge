export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'UNPROCESSABLE'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(message: string) {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static unprocessable(message: string, details?: unknown) {
    return new AppError(422, 'UNPROCESSABLE', message, details);
  }

  static conflict(message: string) {
    return new AppError(409, 'CONFLICT', message);
  }
}
