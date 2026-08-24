/**
 * A failure caused by what someone typed or chose, carrying a message safe to
 * show them verbatim. Kept free of imports: `error-mapping` matches on this
 * class and reaches the client bundle through `appMiddleware`.
 */
export class UserFacingError extends Error {
  status = 400;

  constructor(message: string, name = 'UserFacingError') {
    super(message);
    this.name = name;
  }
}
