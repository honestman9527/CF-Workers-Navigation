export class ServiceError extends Error {
  constructor(
    public readonly status: 400 | 404,
    public readonly code: 'validation_error' | 'not_found',
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
