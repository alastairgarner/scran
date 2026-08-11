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
      openaiModel: 'gpt-5',
      logLevel: 'info',
      port: 3000,
      baseUrl: 'http://localhost:3000',
      cookieSecure: false,
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

  it('rejects a log level pino would not understand', () => {
    // Arrange & act
    const parse = () => parseConfig({ ...required, LOG_LEVEL: 'chatty' });

    // Assert
    expect(parse).toThrow(/LOG_LEVEL/);
  });
});
