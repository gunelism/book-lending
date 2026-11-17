import { INestApplication, LoggerService } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthService } from '../src/auth/auth.service';
import { BooksService } from '../src/books/books.service';
import { ADMIN, Client, createApp, errorCode, login, resetDatabase } from './helpers';

/** Captures what the app logs, so the tests can check lines and levels. */
class CaptureLogger implements LoggerService {
  lines: { level: string; text: string }[] = [];
  private add(level: string, args: unknown[]) {
    this.lines.push({ level, text: args.map(String).join(' ') });
  }
  log(...a: unknown[]) {
    this.add('log', a);
  }
  warn(...a: unknown[]) {
    this.add('warn', a);
  }
  error(...a: unknown[]) {
    this.add('error', a);
  }
  debug(...a: unknown[]) {
    this.add('debug', a);
  }
  find(level: string, ...parts: string[]) {
    return this.lines.filter((l) => l.level === level && parts.every((p) => l.text.includes(p)));
  }
}

describe('Logging & error handling (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: Client;
  const logs = new CaptureLogger();

  beforeAll(async () => {
    ({ app, ds } = await createApp());
    await resetDatabase(ds);
    app.useLogger(logs);
    admin = await login(app, ADMIN);
  });
  afterAll(() => app.close());
  beforeEach(() => (logs.lines = []));
  afterEach(() => jest.restoreAllMocks());

  it('logs every request once, naming the GraphQL operation, with the id sent back in X-Request-Id', async () => {
    const res = await admin.agent.post('/graphql').set('X-CSRF-Token', admin.csrf).send({ query: '{ books { total } }' });
    const id = res.headers['x-request-id'];

    expect(id).toMatch(/^[0-9a-f]{12}$/);
    const line = logs.find('log', 'POST /graphql query books → 200', `req ${id}`);
    expect(line).toHaveLength(1);
    expect(line[0].text).toMatch(/user \d+/);
  });

  it('logs an expected error (bad input, business rule…) as a warning with its code, not as a crash', async () => {
    const res = await admin.gql('{ book(id: 999999) { id } }');

    expect(errorCode(res)).toBe('NOT_FOUND');
    expect(res.errors![0].message).toBe('Book #999999 was not found');
    expect(logs.find('warn', 'query book: NOT_FOUND — Book #999999 was not found')).toHaveLength(1);
    expect(logs.find('warn', 'POST /graphql query book → 200 [NOT_FOUND]')).toHaveLength(1);
    expect(logs.find('error')).toHaveLength(0);
  });

  it('hides an unexpected GraphQL error from the user but logs it with its stack under the same reference', async () => {
    jest.spyOn(BooksService.prototype, 'get').mockRejectedValueOnce(new Error('relation "secret_table" does not exist'));

    const res = await admin.agent.post('/graphql').set('X-CSRF-Token', admin.csrf).send({ query: '{ book(id: 1) { id } }' });
    const id = res.headers['x-request-id'];
    const err = res.body.errors[0];

    expect(err.extensions.code).toBe('INTERNAL_SERVER_ERROR');
    expect(err.message).toBe(`Something went wrong on our side. Please try again. (reference ${id})`);
    expect(JSON.stringify(res.body)).not.toContain('secret_table'); // no internals leak to the client
    const logged = logs.find('error', 'query book failed', `req ${id}`, 'secret_table');
    expect(logged).toHaveLength(1);
    expect(logged[0].text).toContain('at '); // the stack trace is in the log
  });

  it('does the same for REST endpoints (login, uploads)', async () => {
    jest.spyOn(AuthService.prototype, 'login').mockRejectedValueOnce(new Error('db connection reset'));
    const anon = await admin.agent.get('/auth/csrf');

    const res = await admin.agent.post('/auth/login').set('X-CSRF-Token', anon.body.csrfToken).send(ADMIN);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: `Something went wrong on our side. Please try again. (reference ${res.headers['x-request-id']})`,
      requestId: res.headers['x-request-id'],
    });
    expect(logs.find('error', 'POST /auth/login failed', 'db connection reset')).toHaveLength(1);
    admin = await login(app, ADMIN); // the failed attempt replaced the session
  });

  it('logs why a sign-in failed, without the password, while the user gets a generic message', async () => {
    const anon = await admin.agent.get('/auth/csrf');
    const res = await admin.agent
      .post('/auth/login')
      .set('X-CSRF-Token', anon.body.csrfToken)
      .send({ email: ADMIN.email, password: 'Wrong-Passw0rd-999' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
    expect(logs.find('warn', `Failed sign-in for "${ADMIN.email}": wrong password`)).toHaveLength(1);
    expect(logs.find('warn', 'POST /auth/login → 401')).toHaveLength(1);
    expect(logs.lines.some((l) => l.text.includes('Wrong-Passw0rd-999'))).toBe(false);
    admin = await login(app, ADMIN);
  });
});
