/**
 * Two error classes, split by fault and never by status, plus the single
 * boundary that turns them into responses. One question at the throw site:
 * could the caller have avoided this by sending a different request?
 * Yes → `ClientError` (4xx, silent). No → `AppError` (5xx, logged).
 *
 * Lifted from sn-web's `shared/errors`, minus Sentry: `severity` maps to a pino
 * level here instead of to tracking loudness.
 */
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { logger } from './logger';

/** How loudly the logger should treat an error. `ignored` is never logged. */
export type ErrorSeverity = 'ignored' | 'error' | 'fatal';

/** Structured debugging data attached to an error and logged alongside it. */
export type ErrorContext = Record<string, unknown>;

/** The classification carried on every error. */
export type ErrorType =
  | 'internal'
  | 'invariant'
  | 'dependency'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'forbidden'
  | 'unauthorised';

/** The pino level each severity logs at. `null` means don't log it at all. */
export const LOG_LEVEL_BY_SEVERITY = {
  ignored: null,
  error: 'error',
  fatal: 'fatal',
} as const satisfies Record<ErrorSeverity, 'error' | 'fatal' | null>;

type AppErrorConfig = {
  type: ErrorType;
  severity: ErrorSeverity;
  status: ContentfulStatusCode;
  retryable: boolean;
};

/** Base error for failures on our side. Logged unless `severity: 'ignored'`. */
export class AppError extends Error {
  readonly type: ErrorType;
  readonly severity: ErrorSeverity;
  /** Client-facing HTTP status. Pinned per factory; the thrower never sets it. */
  readonly status: ContentfulStatusCode;
  /** Whether the operation may safely be retried. */
  readonly retryable: boolean;
  readonly context: ErrorContext;

  /**
   * Not called directly at throw sites — the factories own status, type,
   * severity and retryability so a thrower can never fat-finger them.
   */
  protected constructor(
    message: string,
    config: AppErrorConfig,
    context: ErrorContext = {},
    cause?: unknown,
  ) {
    super(message, { cause });
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.type = config.type;
    this.severity = config.severity;
    this.status = config.status;
    this.retryable = config.retryable;
    this.context = context;
  }

  /**
   * An unexpected failure on our side. The default 500.
   *
   * @returns {AppError} A non-retryable `internal` error.
   */
  static internal(
    message: string,
    context?: ErrorContext,
    cause?: unknown,
  ): AppError {
    return new AppError(
      message,
      { type: 'internal', severity: 'error', status: 500, retryable: false },
      context,
      cause,
    );
  }

  /**
   * An assumption we were certain held was violated — a "can't happen" branch,
   * a recipe with no versions. A bug, so it logs at `fatal`.
   *
   * @returns {AppError} A non-retryable `invariant` error.
   */
  static invariant(
    message: string,
    context?: ErrorContext,
    cause?: unknown,
  ): AppError {
    return new AppError(
      message,
      { type: 'invariant', severity: 'fatal', status: 500, retryable: false },
      context,
      cause,
    );
  }

  /**
   * An upstream we depend on failed. A failed extraction is this — including
   * the model returning unparseable or schema-invalid JSON, because the
   * request was fine and the upstream wasn't. Retryable from the photo on disk.
   *
   * @returns {AppError} A retryable `dependency` error.
   */
  static dependency(
    message: string,
    context?: ErrorContext,
    cause?: unknown,
  ): AppError {
    return new AppError(
      message,
      { type: 'dependency', severity: 'error', status: 503, retryable: true },
      context,
      cause,
    );
  }
}

/** Error caused by the caller. Never logged; only the status varies. */
export class ClientError extends AppError {
  /** Private so throw sites go through the named factories, never a raw status. */
  private constructor(
    message: string,
    type: ErrorType,
    status: ContentfulStatusCode,
    context?: ErrorContext,
    cause?: unknown,
  ) {
    super(
      message,
      { type, severity: 'ignored', status, retryable: false },
      context,
      cause,
    );
  }

  /**
   * The caller asked for something that does not exist.
   *
   * @returns {ClientError} A 404 error.
   */
  static notFound(
    message: string,
    context?: ErrorContext,
    cause?: unknown,
  ): ClientError {
    return new ClientError(message, 'not_found', 404, context, cause);
  }

  /**
   * The request payload failed validation.
   *
   * @returns {ClientError} A 400 error.
   */
  static validation(
    message: string,
    context?: ErrorContext,
    cause?: unknown,
  ): ClientError {
    return new ClientError(message, 'validation', 400, context, cause);
  }

  /**
   * The request conflicts with current state.
   *
   * @returns {ClientError} A 409 error.
   */
  static conflict(
    message: string,
    context?: ErrorContext,
    cause?: unknown,
  ): ClientError {
    return new ClientError(message, 'conflict', 409, context, cause);
  }

  /**
   * Authenticated, but not allowed to do this.
   *
   * @returns {ClientError} A 403 error.
   */
  static forbidden(
    message: string,
    context?: ErrorContext,
    cause?: unknown,
  ): ClientError {
    return new ClientError(message, 'forbidden', 403, context, cause);
  }

  /**
   * Not authenticated.
   *
   * @returns {ClientError} A 401 error.
   */
  static unauthorised(
    message: string,
    context?: ErrorContext,
    cause?: unknown,
  ): ClientError {
    return new ClientError(message, 'unauthorised', 401, context, cause);
  }
}

/**
 * The app's single error boundary. A `ClientError` says what went wrong,
 * because the caller can act on it; anything else gets a generic message and a
 * short error id, logged beside the full error so "it broke, it said a3f9c1"
 * is greppable. The stack never leaves the process.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  // Falls back rather than throwing inside the error handler, which is the
  // worst possible place to discover the request-id middleware went missing.
  const requestId: string = c.get('requestId') ?? crypto.randomUUID();
  const errorId = requestId.slice(0, 8);

  // Hono's own middleware — csrf, body limits — throws this, and it already
  // carries the right status. Turning a deliberate 403 into a 500 would both
  // lie to the caller and page us about a defence working.
  if (err instanceof HTTPException) {
    // Resource/CSRF refusals need actionable messages in the same JSON shape
    // as other API errors; never expose unexpected server exception messages.
    return c.json({ error: err.message || 'Request refused.' }, err.status);
  }
  const level =
    err instanceof AppError ? LOG_LEVEL_BY_SEVERITY[err.severity] : 'error';

  if (level) {
    logger[level](
      {
        requestId,
        errorId,
        ...(err instanceof AppError ? { type: err.type, ...err.context } : {}),
        err,
      },
      err.message,
    );
  }

  if (err instanceof ClientError) {
    return c.json({ error: err.message }, err.status);
  }
  return c.json(
    { error: 'Something went wrong.', errorId },
    err instanceof AppError ? err.status : 500,
  );
};
