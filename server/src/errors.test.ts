import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { AppError, ClientError, errorHandler } from './errors';

/** The boundary as index.ts wires it, over a route that throws what we hand it. */
const respondTo = (thrown: unknown) => {
  const app = new Hono();
  app.use('*', requestId());
  app.get('/boom', () => {
    throw thrown;
  });
  app.onError(errorHandler);
  return app.request('/boom');
};

describe('AppError', () => {
  it('classifies a dependency failure as a retryable 503', () => {
    // Arrange & act: a failed extraction is this error.
    const err = AppError.dependency('The model returned invalid JSON');

    // Assert
    expect(err.status).toBe(503);
    expect(err.severity).toBe('error');
    expect(err.retryable).toBe(true);
  });

  it('classifies a broken invariant as fatal, so it stands out', () => {
    // Arrange & act
    const err = AppError.invariant('Ready recipe has no versions');

    // Assert
    expect(err.status).toBe(500);
    expect(err.severity).toBe('fatal');
  });

  it('keeps the context and cause handed to it', () => {
    // Arrange
    const cause = new Error('ECONNRESET');

    // Act
    const err = AppError.dependency('Upstream died', { recipeId: 7 }, cause);

    // Assert
    expect(err.context).toEqual({ recipeId: 7 });
    expect(err.cause).toBe(cause);
  });
});

describe('ClientError', () => {
  it('is an AppError, so one boundary classifies both', () => {
    // Arrange & act & assert
    expect(ClientError.notFound('No such recipe')).toBeInstanceOf(AppError);
  });

  it('is silent whatever its status, because it is not our fault', () => {
    // Arrange & act & assert
    expect(ClientError.validation('Bad body').severity).toBe('ignored');
    expect(ClientError.forbidden('Not yours').severity).toBe('ignored');
  });

  it('pins a status per factory so a throw site cannot pick one', () => {
    // Arrange & act & assert
    expect(ClientError.unauthorised('x').status).toBe(401);
    expect(ClientError.forbidden('x').status).toBe(403);
    expect(ClientError.notFound('x').status).toBe(404);
    expect(ClientError.conflict('x').status).toBe(409);
    expect(ClientError.validation('x').status).toBe(400);
  });
});

describe('errorHandler', () => {
  it('tells the caller what they got wrong', async () => {
    // Arrange & act
    const res = await respondTo(ClientError.notFound('No such recipe'));

    // Assert
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'No such recipe' });
  });

  it('gives an AppError its status but never its message', async () => {
    // Arrange & act
    const res = await respondTo(AppError.dependency('OpenAI 429: sk-live-abc'));

    // Assert
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; errorId: string };
    expect(body.error).toBe('Something went wrong.');
    expect(body.errorId).toHaveLength(8);
  });

  it('turns an unexpected throw into a 500 with no stack', async () => {
    // Arrange & act: this is what the prototype returned raw, on purpose.
    const res = await respondTo(new Error('Cannot read properties of null'));

    // Assert
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('null');
    expect(body).not.toContain('at ');
  });

  it('derives the error id from the request id, so logs join up', async () => {
    // Arrange & act
    const res = await respondTo(AppError.internal('Broke'));

    // Assert
    const { errorId } = (await res.json()) as { errorId: string };
    expect(res.headers.get('x-request-id')).toStartWith(errorId);
  });
});
