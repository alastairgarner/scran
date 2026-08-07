import { expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import { app } from './index';

test('POST /api/extract saves the photo and returns the model JSON verbatim', async () => {
  const modelJson = {
    name: 'Toast',
    ingredients: [{ title: null, text: '1 slice bread' }],
  };
  type SentBody = {
    messages: { content: { image_url?: { url: string } }[] }[];
  };
  let sentBody: SentBody | undefined;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sentBody = JSON.parse(init.body as string);
    return Response.json({
      choices: [{ message: { content: JSON.stringify(modelJson) } }],
      usage: { total_tokens: 42 },
    });
  }) as typeof fetch;

  const form = new FormData();
  form.append(
    'photo',
    new File([new Uint8Array([1, 2, 3])], '../evil name.jpg', {
      type: 'image/jpeg',
    }),
  );

  try {
    const res = await app.request('/api/extract', {
      method: 'POST',
      body: form,
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.recipe).toEqual(modelJson);
    expect(body.usage.total_tokens).toBe(42);
    expect(await Bun.file(body.photoPath).bytes()).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(body.photoPath).not.toInclude('/../'); // filename is not a path
    expect(sentBody?.messages[1].content[1].image_url?.url).toBe(
      'data:image/jpeg;base64,AQID',
    );
    expect(await Bun.file(`${body.photoPath}.json`).json()).toEqual(body);

    await unlink(body.photoPath);
    await unlink(`${body.photoPath}.json`);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('POST /api/extract rejects a request with no photo', async () => {
  const res = await app.request('/api/extract', {
    method: 'POST',
    body: new FormData(),
  });
  expect(res.status).toBe(400);
});
