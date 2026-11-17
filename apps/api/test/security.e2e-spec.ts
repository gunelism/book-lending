import { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Book, User } from '../src/entities';
import { ADMIN, anonymous, Client, createApp, errorCode, LIBRARIAN, login, makeBook, resetDatabase } from './helpers';

/** Authentication, role permissions, CSRF and upload hardening. */
describe('Security (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: Client;
  let staff: Client;

  beforeAll(async () => {
    ({ app, ds } = await createApp());
    await resetDatabase(ds);
    admin = await login(app, ADMIN);
    staff = await login(app, LIBRARIAN);
  });

  afterAll(() => app.close());

  it('stores passwords as argon2id hashes and rejects a wrong password', async () => {
    const user = await ds.getRepository(User).findOneOrFail({ where: { email: ADMIN.email }, select: { id: true, passwordHash: true } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);

    const anon = await anonymous(app);
    await anon.agent.post('/auth/login').set('X-CSRF-Token', anon.csrf).send({ ...ADMIN, password: 'wrong-password-1A' }).expect(401);
  });

  it('requires a session for GraphQL', async () => {
    const anon = await anonymous(app);
    expect(errorCode(await anon.gql('{ books { total } }'))).toBe('UNAUTHENTICATED');
  });

  it('rejects state-changing requests without a valid CSRF token', async () => {
    const res = await staff.agent.post('/graphql').send({ query: 'mutation { returnLoan(id: 1) { id } }' }).expect(403);
    expect(res.body.code).toBe('CSRF_INVALID');
    await staff.agent.post('/graphql').set('X-CSRF-Token', 'forged-token').send({ query: '{ books { total } }' }).expect(403);
  });

  it('lets an admin delete a book but forbids a librarian', async () => {
    const { book } = await makeBook(ds, 1);
    const mutation = `mutation($id: Int!) { deleteBook(id: $id) { id } }`;

    expect(errorCode(await staff.gql(mutation, { id: book.id }))).toBe('FORBIDDEN');
    expect(errorCode(await staff.gql('{ users { total } }'))).toBe('FORBIDDEN');

    const res = await admin.gql(mutation, { id: book.id });
    expect(res.errors).toBeUndefined();
  });

  it('only sorts on entity columns (and one hop through a relation), never hidden ones', async () => {
    await makeBook(ds, 1);
    const books = await admin.gql('{ books(sortField: "author.lastName") { total } }');
    expect(books.errors).toBeUndefined();

    // Computed GraphQL fields, to-many relations and select:false columns are rejected.
    expect(errorCode(await admin.gql('{ books(sortField: "availableCopies") { total } }'))).toBe('BAD_USER_INPUT');
    expect(errorCode(await admin.gql('{ books(sortField: "copies.barcode") { total } }'))).toBe('BAD_USER_INPUT');
    expect(errorCode(await admin.gql('{ users(sortField: "passwordHash") { total } }'))).toBe('BAD_USER_INPUT');
  });

  describe('cover uploads', () => {
    const upload = (c: Client, bookId: number, buf: Buffer, filename: string, contentType: string) =>
      c.agent.post(`/api/books/${bookId}/cover`).set('X-CSRF-Token', c.csrf).attach('file', buf, { filename, contentType });

    it('rejects a file that only pretends to be an image', async () => {
      const { book } = await makeBook(ds, 1);
      const fake = Buffer.from('<?php system($_GET["c"]); ?> not really a png');
      const res = await upload(admin, book.id, fake, 'cover.png', 'image/png').expect(400);
      expect(res.body.message).toMatch(/not a readable image/i);
    });

    it('rejects files over 2 MB', async () => {
      const { book } = await makeBook(ds, 1);
      await upload(admin, book.id, Buffer.alloc(2 * 1024 * 1024 + 1), 'big.jpg', 'image/jpeg').expect(413);
    });

    it('re-encodes a real image to WebP in object storage, and only admins may upload', async () => {
      const { book } = await makeBook(ds, 1);
      const png = await sharp({ create: { width: 800, height: 1200, channels: 3, background: '#336699' } }).png().toBuffer();

      await upload(staff, book.id, png, 'cover.png', 'image/png').expect(403);
      await upload(admin, book.id, png, 'cover.png', 'image/png').expect(201);

      const saved = await ds.getRepository(Book).findOneByOrFail({ id: book.id });
      expect(saved.coverKey).toMatch(/^covers\/\d+\/[\w-]+\.webp$/);

      const img = await staff.agent.get(`/api/books/${book.id}/cover`).buffer(true).parse(binary).expect(200);
      expect(img.headers['content-type']).toBe('image/webp');
      const meta = await sharp(img.body as Buffer).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBeLessThanOrEqual(600);

      // Covers are not public: no session, no image.
      await request(app.getHttpServer()).get(`/api/books/${book.id}/cover`).expect(401);
    });
  });
});

function binary(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
