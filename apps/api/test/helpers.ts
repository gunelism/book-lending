import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { configureApp } from '../src/bootstrap';
import { truncateAll } from '../src/database/truncate';
import { Author, Book, BookCopy, CopyStatus, Genre, Member, Role, User } from '../src/entities';

export const ADMIN = { email: 'admin@test.local', password: 'Admin-Passw0rd-123' };
export const LIBRARIAN = { email: 'librarian@test.local', password: 'Staff-Passw0rd-123' };

/** Boots the real application (same middleware, guards, pipes as production). */
export async function createApp(): Promise<{ app: INestApplication; ds: DataSource }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, logger: ['error'] });
  configureApp(app);
  await app.init();
  const ds = app.get(DataSource);
  await ds.runMigrations();
  return { app, ds };
}

export async function resetDatabase(ds: DataSource) {
  await truncateAll(ds);
  const [adminHash, staffHash] = await Promise.all([hashPassword(ADMIN.password), hashPassword(LIBRARIAN.password)]);
  await ds.getRepository(User).save([
    { email: ADMIN.email, name: 'Test Admin', role: Role.ADMIN, passwordHash: adminHash },
    { email: LIBRARIAN.email, name: 'Test Librarian', role: Role.LIBRARIAN, passwordHash: staffHash },
  ]);
}

let seq = 0;
export async function makeBook(ds: DataSource, copies = 1): Promise<{ book: Book; copies: BookCopy[] }> {
  seq++;
  const author = await ds.getRepository(Author).save({ firstName: 'Test', lastName: `Author ${seq}` });
  const book = await ds.getRepository(Book).save({
    title: `Test Book ${seq}`,
    isbn: `978000${String(seq).padStart(7, '0')}`,
    genre: Genre.FICTION,
    author,
    replacementCostCents: 3000,
  });
  const created = await ds.getRepository(BookCopy).save(
    Array.from({ length: copies }, (_, i) => ({ book, barcode: `T${seq}-${i}`, status: CopyStatus.AVAILABLE })),
  );
  return { book, copies: created };
}

export async function makeMember(ds: DataSource, overrides: Partial<Member> = {}): Promise<Member> {
  seq++;
  return ds.getRepository(Member).save({
    cardNumber: `M${String(seq).padStart(7, '0')}`,
    firstName: 'Test',
    lastName: `Member ${seq}`,
    email: `member${seq}@test.local`,
    ...overrides,
  });
}

/** A signed-in browser-like client: keeps cookies and sends the CSRF token. */
export interface Client {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  gql: (query: string, variables?: Record<string, unknown>) => Promise<{ data?: any; errors?: any[] }>;
}

export async function anonymous(app: INestApplication): Promise<Client> {
  const agent = request.agent(app.getHttpServer());
  const { body } = await agent.get('/auth/csrf').expect(200);
  return client(agent, body.csrfToken);
}

export async function login(app: INestApplication, who: { email: string; password: string }): Promise<Client> {
  const anon = await anonymous(app);
  const res = await anon.agent.post('/auth/login').set('X-CSRF-Token', anon.csrf).send(who).expect(200);
  return client(anon.agent, res.body.csrfToken);
}

function client(agent: ReturnType<typeof request.agent>, csrf: string): Client {
  const c: Client = {
    agent,
    csrf,
    gql: async (query, variables = {}) => {
      const res = await agent.post('/graphql').set('X-CSRF-Token', c.csrf).send({ query, variables });
      return res.body;
    },
  };
  return c;
}

export const errorCode = (res: { errors?: any[] }) => res.errors?.[0]?.extensions?.code;
