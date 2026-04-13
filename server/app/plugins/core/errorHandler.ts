import type { FastifyInstance } from 'fastify';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    const errorStatusCode = getStatusCode(error);
    const statusCode =
      typeof errorStatusCode === 'number' && errorStatusCode >= 400
        ? errorStatusCode
        : 500;

    void reply.code(statusCode).send({
      error: getErrorMessage(error),
    });
  });
}

function getStatusCode(error: unknown): number | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode;
  }

  return null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unknown server error';
}
