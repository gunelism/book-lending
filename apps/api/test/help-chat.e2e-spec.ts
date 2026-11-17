import { INestApplication } from '@nestjs/common';
import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import type * as Helpers from './helpers';

/**
 * The "how do I fill this out" help chat, against a local stub of an
 * OpenAI-compatible provider (no key or network needed). Checks that the
 * prompt is grounded in the real form definitions and that provider failures
 * are friendly and contained.
 */
describe('Help chat (e2e)', () => {
  let stub: Server;
  let status = 200;
  const received: Array<{ body: any; auth?: string; path?: string }> = [];

  let h: typeof Helpers;
  let app: INestApplication;
  let staff: Helpers.Client;

  const ASK = `mutation($input: AskHelpInput!) { askHelp(input: $input) { answer } }`;

  beforeAll(async () => {
    stub = createServer(async (req: IncomingMessage, res) => {
      received.push({ body: JSON.parse(await readBody(req)), auth: req.headers.authorization, path: req.url });
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(
        status === 200
          ? JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'Stub answer.' }, finish_reason: 'stop' }] })
          : JSON.stringify({ error: { message: 'stub failure with internal details' } }),
      );
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));

    // Configuration is read when the app module loads, so set it before importing.
    process.env.AI_API_KEY = 'test-key-not-real';
    process.env.AI_BASE_URL = `http://127.0.0.1:${(stub.address() as AddressInfo).port}/v1`;
    process.env.AI_TIMEOUT_MS = '3000';
    h = await import('./helpers');

    let ds;
    ({ app, ds } = await h.createApp());
    await h.resetDatabase(ds);
    staff = await h.login(app, h.LIBRARIAN);
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => stub.close(resolve));
  });

  it('serves form definitions built from the input types: help text, rules and options', async () => {
    const res = await staff.gql('{ forms { name fields { name label required help rules options } } }');
    const book = res.data.forms.find((f: any) => f.name === 'book');
    const isbn = book.fields.find((f: any) => f.name === 'isbn');

    expect(book.fields.map((f: any) => f.name)).toEqual(['title', 'isbn', 'publishedYear', 'genre', 'description', 'replacementCostCents', 'authorId']);
    expect(isbn).toMatchObject({ label: 'ISBN', required: true, rules: ['isbn must be a valid ISBN-10 or ISBN-13'] });
    expect(isbn.help).toMatch(/check digit is verified/);
    expect(book.fields.find((f: any) => f.name === 'genre').options).toContain('SCIENCE_FICTION');
  });

  it("grounds the answer in the current form's field help and rules", async () => {
    const res = await staff.gql(ASK, { input: { form: 'book', question: 'What does replacement cost mean?' } });

    expect(res.errors).toBeUndefined();
    expect(res.data.askHelp.answer).toBe('Stub answer.');

    const { body, auth, path } = received.at(-1)!;
    expect(path).toBe('/v1/chat/completions');
    expect(auth).toBe('Bearer test-key-not-real'); // key sent to the provider only, from the server
    expect(body.model).toBe('openai/gpt-oss-20b');
    expect(body.reasoning_effort).toBe('low');
    const system = body.messages[0];
    expect(system.role).toBe('system');
    expect(system.content).toContain('The user is on the "Book" form');
    expect(system.content).toContain('Replacement cost (€)');
    expect(system.content).toContain('What a member is charged if they lose a copy'); // the field's help text
    expect(system.content).toContain('1–300 characters'); // a validation rule
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'What does replacement cost mean?' });
  });

  it('sends earlier turns so follow-up questions keep their context', async () => {
    const history = [
      { role: 'USER', content: 'What is the ISBN field?' },
      { role: 'ASSISTANT', content: 'The edition identifier.' },
    ];
    await staff.gql(ASK, { input: { form: 'book', question: 'Can I leave it empty?', history } });

    expect(received.at(-1)!.body.messages.slice(1)).toEqual([
      { role: 'user', content: 'What is the ISBN field?' },
      { role: 'assistant', content: 'The edition identifier.' },
      { role: 'user', content: 'Can I leave it empty?' },
    ]);
  });

  it.each([
    [500, 'ASSISTANT_UNAVAILABLE'],
    [429, 'ASSISTANT_BUSY'],
    [401, 'ASSISTANT_MISCONFIGURED'],
    [404, 'ASSISTANT_MISCONFIGURED'], // retired / unknown model
  ])('turns provider HTTP %i into %s without leaking details; the rest of the API keeps working', async (code, expected) => {
    status = code;
    const res = await staff.gql(ASK, { input: { form: 'checkout', question: 'Can I set the due date?' } });
    status = 200;

    expect(res.errors?.[0].extensions.code).toBe(expected);
    expect(res.errors?.[0].message).not.toMatch(/stub failure|test-key/);
    expect((await staff.gql('{ books { total } }')).errors).toBeUndefined();
  });
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}
