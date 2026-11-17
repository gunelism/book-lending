import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hand-written additions the entity decorators can't express:
 *  - pg_trgm GIN indexes so ILIKE '%term%' search stays fast at scale
 *  - a partial unique index: a copy can have at most ONE active loan
 *  - CHECK constraints guarding the loan invariants
 *  - the session table used by express-session (connect-pg-simple)
 */
export class SearchIndexesAndIntegrity1794770958690 implements MigrationInterface {
  name = 'SearchIndexesAndIntegrity1794770958690';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await q.query(`CREATE INDEX "IDX_books_title_trgm" ON "books" USING gin ("title" gin_trgm_ops)`);
    await q.query(`CREATE INDEX "IDX_books_isbn_trgm" ON "books" USING gin ("isbn" gin_trgm_ops)`);
    await q.query(
      `CREATE INDEX "IDX_authors_name_trgm" ON "authors" USING gin (("firstName" || ' ' || "lastName") gin_trgm_ops)`,
    );
    await q.query(
      `CREATE INDEX "IDX_members_name_trgm" ON "members" USING gin (("firstName" || ' ' || "lastName") gin_trgm_ops)`,
    );
    await q.query(`CREATE INDEX "IDX_members_email_trgm" ON "members" USING gin ("email" gin_trgm_ops)`);
    await q.query(`CREATE INDEX "IDX_copies_barcode_trgm" ON "book_copies" USING gin ("barcode" gin_trgm_ops)`);

    // Database-level guarantee against double-lending the same copy.
    await q.query(`CREATE UNIQUE INDEX "UQ_loans_one_active_per_copy" ON "loans" ("copyId") WHERE "status" = 'ACTIVE'`);

    await q.query(`ALTER TABLE "loans" ADD CONSTRAINT "CHK_loans_renew_count" CHECK ("renewCount" >= 0)`);
    await q.query(`ALTER TABLE "loans" ADD CONSTRAINT "CHK_loans_fine" CHECK ("fineCents" >= 0)`);
    await q.query(`ALTER TABLE "loans" ADD CONSTRAINT "CHK_loans_due_after_loan" CHECK ("dueDate" > "loanedAt")`);
    await q.query(
      `ALTER TABLE "loans" ADD CONSTRAINT "CHK_loans_returned_state" CHECK (("status" = 'RETURNED') = ("returnedAt" IS NOT NULL))`,
    );
    await q.query(`ALTER TABLE "books" ADD CONSTRAINT "CHK_books_replacement_cost" CHECK ("replacementCostCents" >= 0)`);

    await q.query(`
      CREATE TABLE "session" (
        "sid" varchar NOT NULL PRIMARY KEY,
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      )`);
    await q.query(`CREATE INDEX "IDX_session_expire" ON "session" ("expire")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "session"`);
    await q.query(`ALTER TABLE "books" DROP CONSTRAINT IF EXISTS "CHK_books_replacement_cost"`);
    for (const c of ['CHK_loans_returned_state', 'CHK_loans_due_after_loan', 'CHK_loans_fine', 'CHK_loans_renew_count']) {
      await q.query(`ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "${c}"`);
    }
    for (const i of [
      'UQ_loans_one_active_per_copy',
      'IDX_copies_barcode_trgm',
      'IDX_members_email_trgm',
      'IDX_members_name_trgm',
      'IDX_authors_name_trgm',
      'IDX_books_isbn_trgm',
      'IDX_books_title_trgm',
    ]) {
      await q.query(`DROP INDEX IF EXISTS "${i}"`);
    }
  }
}
