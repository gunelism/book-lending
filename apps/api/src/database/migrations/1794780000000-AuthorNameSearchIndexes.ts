import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Author search now goes through TypeORM's find API, which matches
 * firstName / lastName as separate columns (ILike), so the trigram index on
 * the concatenated full name is replaced by one per column.
 */
export class AuthorNameSearchIndexes1794780000000 implements MigrationInterface {
  name = 'AuthorNameSearchIndexes1794780000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_authors_name_trgm"`);
    await q.query(`CREATE INDEX "IDX_authors_first_name_trgm" ON "authors" USING gin ("firstName" gin_trgm_ops)`);
    await q.query(`CREATE INDEX "IDX_authors_last_name_trgm" ON "authors" USING gin ("lastName" gin_trgm_ops)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "IDX_authors_last_name_trgm"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_authors_first_name_trgm"`);
    await q.query(
      `CREATE INDEX "IDX_authors_name_trgm" ON "authors" USING gin (("firstName" || ' ' || "lastName") gin_trgm_ops)`,
    );
  }
}
