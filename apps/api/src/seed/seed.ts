/**
 * Seeds the database with a large, realistic demo dataset.
 *
 *   npm run seed                 # wipe data and re-seed (keeps schema)
 *   npm run db:reset             # drop everything, re-run migrations, re-seed
 *   node dist/seed/seed.js --covers=none   # skip cover generation (faster)
 *   node dist/seed/seed.js --if-empty      # seed only if there is no data yet (container start)
 *
 * In Docker:  docker compose exec api npm run seed
 *
 * Deterministic (fixed Faker seed) but dates are relative to "now", so there
 * are always active, overdue and recently returned loans to look at.
 */
import 'reflect-metadata';
import { faker } from '@faker-js/faker';
import { DataSource, ObjectLiteral } from 'typeorm';
import { hashPassword } from '../auth/password';
import { isbn13WithCheckDigit } from '../books/isbn';
import { validateEnv } from '../config/env';
import { buildDataSourceOptions } from '../database/data-source';
import { truncateAll } from '../database/truncate';
import { Author, Book, BookCopy, CopyCondition, CopyStatus, Genre, Loan, LoanStatus, Member, Role, User } from '../entities';
import { addDays, DAY_MS, LOAN_POLICY, lateFineCents } from '../loans/loan-policy';
import { StorageService } from '../storage/storage.service';
import { renderCover } from './covers';
import { authorBio, bookDescription, bookTitle, GENRE_WEIGHTS, NATIONALITIES } from './data';

const SCALE = Number(process.env.SEED_SCALE ?? 1);
const COUNTS = {
  authors: Math.round(400 * SCALE),
  books: Math.round(5000 * SCALE),
  members: Math.round(1500 * SCALE),
};
const HISTORY_DAYS = 730; // two years of lending history
const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset');
/** Used on container start: seed only a brand-new database, never wipe existing data. */
const IF_EMPTY = args.has('--if-empty');
const COVERS = !args.has('--covers=none');

const log = (msg: string) => console.log(`[seed] ${msg}`);

async function main() {
  const env = validateEnv(process.env);
  faker.seed(20261115);
  const now = new Date();
  const started = Date.now();

  const ds = new DataSource(buildDataSourceOptions(env.DATABASE_URL, env.DATABASE_SSL));
  await ds.initialize();

  if (IF_EMPTY) {
    await ds.runMigrations({ transaction: 'each' });
    if ((await ds.getRepository(User).count()) > 0) {
      log('Database already has data — skipping seed (run "npm run seed" to regenerate).');
      await ds.destroy();
      return;
    }
    log('Empty database detected — seeding demo data (first start only)…');
  }

  if (RESET) {
    log('Dropping schema and re-running migrations…');
    await ds.dropDatabase();
    await ds.runMigrations({ transaction: 'each' });
  } else if (!IF_EMPTY) {
    await ds.runMigrations({ transaction: 'each' });
    log('Clearing existing data…');
    await truncateAll(ds);
  }

  const storage = new StorageService({ get: (k: keyof typeof env) => env[k] } as any);
  await storage.ensureBucket();
  const removed = await storage.deletePrefix('covers/');
  if (removed) log(`Removed ${removed} old cover image(s) from object storage`);

  // ---------------- staff users ----------------
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const staffPassword = process.env.SEED_STAFF_PASSWORD;
  if (!adminPassword || !staffPassword) throw new Error('Set SEED_ADMIN_PASSWORD and SEED_STAFF_PASSWORD (see .env.example)');
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@library.local').toLowerCase();
  const [adminHash, staffHash] = await Promise.all([hashPassword(adminPassword), hashPassword(staffPassword)]);
  const users: Partial<User>[] = [
    { id: 1, email: adminEmail, name: 'Ada Admin', role: Role.ADMIN, passwordHash: adminHash, isActive: true },
    { id: 2, email: 'librarian@library.local', name: 'Leo Librarian', role: Role.LIBRARIAN, passwordHash: staffHash, isActive: true },
    { id: 3, email: 'librarian2@library.local', name: 'Mari Tamm', role: Role.LIBRARIAN, passwordHash: staffHash, isActive: true },
    { id: 4, email: 'former.staff@library.local', name: 'Former Staff', role: Role.LIBRARIAN, passwordHash: staffHash, isActive: false },
  ];
  await insert(ds, User, users);

  // ---------------- authors ----------------
  const authors: Partial<Author>[] = [];
  const authorGenre = new Map<number, Genre>();
  for (let id = 1; id <= COUNTS.authors; id++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const nationality = faker.helpers.arrayElement(NATIONALITIES);
    const genre = faker.helpers.weightedArrayElement(GENRE_WEIGHTS);
    authorGenre.set(id, genre);
    authors.push({
      id,
      firstName,
      lastName,
      nationality,
      birthYear: faker.number.int({ min: 1890, max: 1998 }),
      bio: faker.datatype.boolean(0.8) ? authorBio(faker, firstName, lastName, nationality, genre) : null,
    });
  }
  await insert(ds, Author, authors);
  log(`${authors.length} authors`);

  // ---------------- books ----------------
  // Some authors are prolific: weight author choice so the list views show a realistic long tail.
  const authorWeights = authors.map((a) => ({ value: a.id!, weight: faker.helpers.weightedArrayElement([{ value: 1, weight: 6 }, { value: 4, weight: 3 }, { value: 15, weight: 1 }]) }));
  const isbns = new Set<string>();
  const books: Partial<Book>[] = [];
  for (let id = 1; id <= COUNTS.books; id++) {
    const authorId = faker.helpers.weightedArrayElement(authorWeights);
    const genre = faker.datatype.boolean(0.75) ? authorGenre.get(authorId)! : faker.helpers.weightedArrayElement(GENRE_WEIGHTS);
    let isbn: string;
    do isbn = isbn13WithCheckDigit(`978${faker.string.numeric(9)}`);
    while (isbns.has(isbn));
    isbns.add(isbn);
    const title = bookTitle(faker, genre);
    books.push({
      id,
      title,
      isbn,
      genre,
      authorId,
      publishedYear: faker.helpers.weightedArrayElement([
        { value: faker.number.int({ min: 1850, max: 1979 }), weight: 2 },
        { value: faker.number.int({ min: 1980, max: 2014 }), weight: 4 },
        { value: faker.number.int({ min: 2015, max: now.getFullYear() }), weight: 4 },
      ]),
      description: faker.datatype.boolean(0.85) ? bookDescription(faker, title) : null,
      replacementCostCents: faker.helpers.arrayElement([1500, 1999, 2500, 2999, 3500, 4500]),
      coverKey: null,
    });
  }
  await insert(ds, Book, books);
  log(`${books.length} books`);

  // ---------------- copies ----------------
  const copies: Partial<BookCopy>[] = [];
  for (const book of books) {
    const n = faker.helpers.weightedArrayElement([
      { value: 1, weight: 35 },
      { value: 2, weight: 35 },
      { value: 3, weight: 20 },
      { value: 4, weight: 10 },
    ]);
    for (let i = 0; i < n; i++) {
      const acquiredAt = faker.date.between({ from: addDays(now, -HISTORY_DAYS - 365), to: addDays(now, -20) });
      const ageDays = (now.getTime() - acquiredAt.getTime()) / DAY_MS;
      const id = copies.length + 1;
      copies.push({
        id,
        bookId: book.id!,
        barcode: `LIB${String(id).padStart(9, '0')}`,
        acquiredAt,
        status: CopyStatus.AVAILABLE,
        condition:
          ageDays < 120 ? CopyCondition.NEW : faker.helpers.weightedArrayElement([
            { value: CopyCondition.GOOD, weight: 6 },
            { value: CopyCondition.FAIR, weight: 3 },
            { value: CopyCondition.POOR, weight: 1 },
          ]),
      });
    }
  }
  // A few copies are out for repair.
  for (const c of faker.helpers.arrayElements(copies, Math.round(copies.length * 0.015))) c.status = CopyStatus.MAINTENANCE;

  // ---------------- members ----------------
  const members: Partial<Member>[] = [];
  const emails = new Set<string>();
  for (let id = 1; id <= COUNTS.members; id++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    let email = faker.internet.email({ firstName, lastName, provider: faker.helpers.arrayElement(['example.com', 'example.org', 'mail.example']) }).toLowerCase();
    while (emails.has(email)) email = email.replace('@', `${faker.number.int(99)}@`);
    emails.add(email);
    members.push({
      id,
      cardNumber: `M${String(id).padStart(7, '0')}`,
      firstName,
      lastName,
      email,
      phone: faker.datatype.boolean(0.8) ? faker.phone.number({ style: 'international' }) : null,
      isActive: faker.datatype.boolean(0.94),
      joinedAt: faker.date.between({ from: addDays(now, -5 * 365), to: addDays(now, -7) }),
    });
  }
  await insert(ds, Member, members);
  log(`${members.length} members`);

  // ---------------- loan history ----------------
  // Each copy is simulated through time: lent, returned (sometimes late), lent again…
  // The loan that spans "now" becomes the active loan (possibly overdue).
  const activeByMember = new Map<number, number>();
  const loans: Partial<Loan>[] = [];
  const memberIds = members.map((m) => m.id!);
  const activeMemberIds = members.filter((m) => m.isActive).map((m) => m.id!);
  const pickMember = (at: Date, mustBeActive: boolean): number | null => {
    for (let tries = 0; tries < 10; tries++) {
      const id = faker.helpers.arrayElement(mustBeActive ? activeMemberIds : memberIds);
      const m = members[id - 1];
      if (m.joinedAt! > at) continue;
      if (mustBeActive && (activeByMember.get(id) ?? 0) >= LOAN_POLICY.maxActiveLoans) continue;
      return id;
    }
    return null;
  };

  for (const copy of copies) {
    if (copy.status === CopyStatus.MAINTENANCE) continue;
    const popularity = faker.helpers.weightedArrayElement([{ value: 0.4, weight: 3 }, { value: 1, weight: 5 }, { value: 2, weight: 2 }]);
    let t = new Date(Math.max(copy.acquiredAt!.getTime(), now.getTime() - HISTORY_DAYS * DAY_MS));
    for (;;) {
      t = addDays(t, faker.number.float({ min: 2, max: 110 / popularity }));
      if (t > now) break;
      const loanedAt = t;
      const renewCount = faker.helpers.weightedArrayElement([{ value: 0, weight: 8 }, { value: 1, weight: 2 }, { value: 2, weight: 1 }]);
      const dueDate = addDays(loanedAt, LOAN_POLICY.loanDays + renewCount * LOAN_POLICY.renewDays);
      const lateness = faker.helpers.weightedArrayElement([
        { value: faker.number.float({ min: -12, max: -0.5 }), weight: 72 }, // on time
        { value: faker.number.float({ min: 0.2, max: 8 }), weight: 18 }, // a bit late
        { value: faker.number.float({ min: 8, max: 45 }), weight: 10 }, // very late
      ]);
      const returnedAt = addDays(dueDate, lateness);

      if (returnedAt > now) {
        // This loan is still out today.
        const memberId = pickMember(loanedAt, true);
        if (!memberId) break;
        activeByMember.set(memberId, (activeByMember.get(memberId) ?? 0) + 1);
        loans.push({ id: loans.length + 1, copyId: copy.id!, memberId, loanedAt, dueDate, renewCount, status: LoanStatus.ACTIVE, fineCents: 0, finePaid: false, returnedAt: null });
        copy.status = CopyStatus.ON_LOAN;
        break;
      }

      const memberId = pickMember(loanedAt, false);
      if (!memberId) continue;
      if (faker.datatype.boolean(0.004)) {
        // Never came back.
        const cost = books[copy.bookId! - 1].replacementCostCents!;
        loans.push({ id: loans.length + 1, copyId: copy.id!, memberId, loanedAt, dueDate, renewCount, status: LoanStatus.LOST, fineCents: cost, finePaid: faker.datatype.boolean(0.7), returnedAt: null });
        copy.status = CopyStatus.LOST;
        break;
      }
      const fine = lateFineCents(dueDate, returnedAt);
      const recent = now.getTime() - returnedAt.getTime() < 45 * DAY_MS;
      loans.push({
        id: loans.length + 1,
        copyId: copy.id!,
        memberId,
        loanedAt,
        dueDate,
        renewCount,
        returnedAt,
        status: LoanStatus.RETURNED,
        fineCents: fine,
        finePaid: fine === 0 || faker.datatype.boolean(recent ? 0.5 : 0.95),
      });
      t = returnedAt;
    }
  }
  await insert(ds, BookCopy, copies);
  log(`${copies.length} copies`);
  await insert(ds, Loan, loans, 2000);
  const active = loans.filter((l) => l.status === LoanStatus.ACTIVE);
  log(
    `${loans.length} loans (${active.length} active, ${active.filter((l) => l.dueDate! < now).length} overdue, ` +
      `${loans.filter((l) => l.status === LoanStatus.LOST).length} lost)`,
  );

  // ---------------- sequences ----------------
  // Rows were inserted with explicit ids, so move each id sequence past them
  // (a Postgres maintenance statement — there is no TypeORM API for it).
  for (const table of ['users', 'authors', 'books', 'book_copies', 'members', 'loans']) {
    await ds.query(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT MAX(id) FROM "${table}"), 1))`);
  }

  // ---------------- covers (object storage) ----------------
  if (COVERS) {
    const withCovers = books.filter(() => faker.datatype.boolean(0.92)); // leave some without, like real data
    log(`Generating and uploading ${withCovers.length} cover images to object storage…`);
    let done = 0;
    const authorName = new Map(authors.map((a) => [a.id!, `${a.firstName} ${a.lastName}`]));
    await pool(withCovers, 16, async (book) => {
      const image = await renderCover(book.title!, authorName.get(book.authorId!)!, book.genre!, book.id!);
      const key = `covers/${book.id}/seed-${book.id}.webp`;
      await storage.put(key, image, 'image/webp');
      await ds.getRepository(Book).update(book.id!, { coverKey: key });
      if (++done % 500 === 0) log(`  ${done}/${withCovers.length} covers`);
    });
  } else {
    log('Skipping covers (--covers=none)');
  }

  await ds.query('ANALYZE'); // refresh planner statistics after the bulk load
  await ds.destroy();
  log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  log(`Sign in as ${adminEmail} (admin) or librarian@library.local (librarian) with the passwords from your .env`);
}

/** Bulk insert in chunks through the entity's repository. */
async function insert<T extends ObjectLiteral>(ds: DataSource, entity: new () => T, rows: Partial<T>[], chunk = 1000) {
  const repo = ds.getRepository(entity);
  for (let i = 0; i < rows.length; i += chunk) {
    await repo.insert(rows.slice(i, i + chunk) as any);
  }
}

async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
