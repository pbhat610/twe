const BRAND = Symbol.for("twe.AppError");

/**
 * Expected, user-facing failures carrying an HTTP status. Detected by a global
 * symbol brand (see isAppError), not instanceof: Next bundles each route
 * separately, so the cached service may throw a different copy of this class.
 */
export class AppError extends Error {
  readonly [BRAND] = true;

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super(`${what} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export const isAppError = (err: unknown): err is AppError =>
  typeof err === "object" && err !== null && (err as Record<symbol, unknown>)[BRAND] === true;
