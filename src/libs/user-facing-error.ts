/**
 * A failure caused by what someone typed or chose, carrying a message safe to
 * show them verbatim (issue #54).
 *
 * Pure by design, like `rbac/errors`: `error-mapping` reaches the client bundle
 * through `appMiddleware`, so the classes it matches on cannot live beside a
 * top-level import of `env`, `sharp` or the S3 client.
 */
export class UserFacingError extends Error {
  status = 400;

  constructor(message: string, name = 'UserFacingError') {
    super(message);
    this.name = name;
  }
}
