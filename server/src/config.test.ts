import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

import { parseConfig } from './config';

const required = {
  OPENAI_API_KEY: 'sk-test',
  AUTH_SECRET: 'x'.repeat(32),
};

describe('parseConfig', () => {
  it('names every missing variable in the message', () => {
    // Arrange & act
    const parse = () => parseConfig({});

    // Assert
    expect(parse).toThrow(/OPENAI_API_KEY/);
  });

  it('names a variable that is present but unusable', () => {
    // Arrange & act
    const parse = () => parseConfig({ ...required, PORT: 'nine' });

    // Assert
    expect(parse).toThrow(/PORT/);
  });

  it('falls back to laptop defaults for everything optional', () => {
    // Arrange & act
    const config = parseConfig(required);

    // Assert: the paths are anchored to the repo, not the working directory.
    expect(config.dataDir).toBe(join(import.meta.dir, '..', '..', 'data'));
    expect(config.databaseUrl).toBe(`${config.dataDir}/scran.db`);
    expect(config).toMatchObject({
      openaiApiKey: 'sk-test',
      openaiModel: 'gpt-4.1',
      logLevel: 'info',
      port: 3000,
      baseUrl: 'http://localhost:5173',
      cookieSecure: false,
      authCookiePrefix: 'better-auth',
    });
  });

  it('coerces the numeric and boolean variables', () => {
    // Arrange & act
    const config = parseConfig({
      ...required,
      PORT: '8080',
      COOKIE_SECURE: 'true',
    });

    // Assert
    expect(config.port).toBe(8080);
    expect(config.cookieSecure).toBe(true);
  });

  it('accepts distinct preview cookie prefixes and rejects invalid cookie names', () => {
    const config = parseConfig({
      ...required,
      AUTH_COOKIE_PREFIX: 'scran-preview-123',
    });
    expect(config.authCookiePrefix).toBe('scran-preview-123');
    expect(() =>
      parseConfig({ ...required, AUTH_COOKIE_PREFIX: 'invalid; cookie' }),
    ).toThrow(/AUTH_COOKIE_PREFIX/);
  });

  it('rejects unsafe origins and insecure production cookies', () => {
    for (const BASE_URL of [
      'https://recipes.example.com/',
      'https://recipes.example.com/path',
      'ftp://recipes.example.com',
      'https://user:pass@recipes.example.com',
    ]) {
      expect(() =>
        parseConfig({ ...required, BASE_URL, COOKIE_SECURE: 'true' }),
      ).toThrow(/BASE_URL/);
    }
    expect(() =>
      parseConfig({ ...required, BASE_URL: 'https://recipes.example.com' }),
    ).toThrow(/COOKIE_SECURE/);
    expect(() => parseConfig({ ...required, NODE_ENV: 'production' })).toThrow(
      /HTTPS/,
    );
    expect(() =>
      parseConfig({
        ...required,
        NODE_ENV: 'production',
        ALLOW_INSECURE_HTTP: 'true',
        BASE_URL: 'http://192.168.1.1',
      }),
    ).toThrow(/HTTPS/);
    expect(
      parseConfig({
        ...required,
        NODE_ENV: 'production',
        ALLOW_INSECURE_HTTP: 'true',
        BASE_URL: 'http://127.0.0.1:8080',
      }).baseUrl,
    ).toBe('http://127.0.0.1:8080');
    expect(
      parseConfig({
        ...required,
        NODE_ENV: 'production',
        BASE_URL: 'https://recipes.example.com',
        COOKIE_SECURE: 'true',
      }).cookieSecure,
    ).toBe(true);
  });

  it('validates configurable resource budgets', () => {
    expect(parseConfig(required)).toMatchObject({
      maxExtractionsPerUserDay: 60,
      maxExtractionsPerDay: 200,
      maxStoredSourceBytes: 5 * 1024 ** 3,
      maxConcurrentExtractions: 2,
    });
    for (const name of [
      'MAX_EXTRACTIONS_PER_USER_DAY',
      'MAX_EXTRACTIONS_PER_DAY',
      'MAX_STORED_SOURCE_BYTES',
      'MAX_CONCURRENT_EXTRACTIONS',
    ]) {
      expect(() => parseConfig({ ...required, [name]: '0' })).toThrow(name);
    }
  });

  it('rejects a log level pino would not understand', () => {
    // Arrange & act
    const parse = () => parseConfig({ ...required, LOG_LEVEL: 'chatty' });

    // Assert
    expect(parse).toThrow(/LOG_LEVEL/);
  });
});
