export class UnauthorizedError extends Error {
  status = 401;

  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  status = 403;

  constructor(message = 'Admin access required') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
