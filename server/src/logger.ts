import { pino } from 'pino';

import { config } from './config';

/**
 * Structured JSON to stdout — `docker logs` is the aggregator, and nothing is
 * persisted or shipped anywhere at five users on a LAN.
 *
 * Never logged: the OpenAI key or any env dump, photo bytes, prompt text, or
 * the model's response body. Log its size and how it failed, not its content.
 */
export const logger = pino({
  level: config.logLevel,
  // Import URLs may carry private query strings; upstream bodies may echo input.
  redact: {
    paths: [
      'url',
      'location',
      'body',
      'err.context.url',
      'err.context.location',
      'err.context.body',
    ],
    censor: '[redacted]',
  },
  // A TTY is a human reading along; anything else is a log collector wanting
  // JSON. Cheaper and more honest than a NODE_ENV nobody sets.
  ...(process.stdout.isTTY ? { transport: { target: 'pino-pretty' } } : {}),
});
