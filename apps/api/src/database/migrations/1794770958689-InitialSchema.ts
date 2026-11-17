import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1794770958689 implements MigrationInterface {
    name = 'InitialSchema1794770958689'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "authors" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "firstName" character varying(100) NOT NULL, "lastName" character varying(100) NOT NULL, "bio" text, "birthYear" integer, "nationality" character varying(80), CONSTRAINT "PK_d2ed02fabd9b52847ccb85e6b88" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4c25845f02be5847ed6a81ef07" ON "authors" ("lastName", "firstName") `);
        await queryRunner.query(`CREATE TYPE "public"."copy_condition" AS ENUM('NEW', 'GOOD', 'FAIR', 'POOR')`);
        await queryRunner.query(`CREATE TYPE "public"."copy_status" AS ENUM('AVAILABLE', 'ON_LOAN', 'LOST', 'MAINTENANCE')`);
        await queryRunner.query(`CREATE TABLE "book_copies" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "bookId" integer NOT NULL, "barcode" character varying(32) NOT NULL, "condition" "public"."copy_condition" NOT NULL DEFAULT 'GOOD', "status" "public"."copy_status" NOT NULL DEFAULT 'AVAILABLE', "acquiredAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_1898a8d374e5b83af172664568e" UNIQUE ("barcode"), CONSTRAINT "PK_f79606d3fd05df7dcce9542d438" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_040b1ae378f2683ba2fb6d61d0" ON "book_copies" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_9f1f2eade7a89f99ef13b50788" ON "book_copies" ("bookId", "status") `);
        await queryRunner.query(`CREATE TYPE "public"."genre" AS ENUM('FICTION', 'NON_FICTION', 'MYSTERY', 'SCIENCE_FICTION', 'FANTASY', 'ROMANCE', 'THRILLER', 'BIOGRAPHY', 'HISTORY', 'SCIENCE', 'CHILDREN', 'POETRY')`);
        await queryRunner.query(`CREATE TABLE "books" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying(300) NOT NULL, "isbn" character varying(17) NOT NULL, "publishedYear" integer, "genre" "public"."genre" NOT NULL, "description" text, "coverKey" character varying(255), "replacementCostCents" integer NOT NULL DEFAULT '2500', "authorId" integer NOT NULL, CONSTRAINT "UQ_54337dc30d9bb2c3fadebc69094" UNIQUE ("isbn"), CONSTRAINT "PK_f3f2f25a099d24e12545b70b022" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6f50357a540439c8d17050c830" ON "books" ("genre") `);
        await queryRunner.query(`CREATE INDEX "IDX_54f49efe2dd4d2850e736e9ab8" ON "books" ("authorId") `);
        await queryRunner.query(`CREATE TYPE "public"."loan_status" AS ENUM('ACTIVE', 'RETURNED', 'LOST')`);
        await queryRunner.query(`CREATE TABLE "loans" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "copyId" integer NOT NULL, "memberId" integer NOT NULL, "loanedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "dueDate" TIMESTAMP WITH TIME ZONE NOT NULL, "returnedAt" TIMESTAMP WITH TIME ZONE, "renewCount" integer NOT NULL DEFAULT '0', "status" "public"."loan_status" NOT NULL DEFAULT 'ACTIVE', "fineCents" integer NOT NULL DEFAULT '0', "finePaid" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_5c6942c1e13e4de135c5203ee61" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c75c2327ce6368e9c120a5326c" ON "loans" ("copyId") `);
        await queryRunner.query(`CREATE INDEX "IDX_93045f91e891f088085356685a" ON "loans" ("loanedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_d2764288a2212b331ac3de6ab9" ON "loans" ("status", "dueDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_9bc1a67c381ddf3bd960706175" ON "loans" ("memberId", "status") `);
        await queryRunner.query(`CREATE TABLE "members" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cardNumber" character varying(20) NOT NULL, "firstName" character varying(100) NOT NULL, "lastName" character varying(100) NOT NULL, "email" character varying(254) NOT NULL, "phone" character varying(32), "isActive" boolean NOT NULL DEFAULT true, "joinedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_64d776be6c6a637c0fdc89b7d01" UNIQUE ("cardNumber"), CONSTRAINT "UQ_2714af51e3f7dd42cf66eeb08d6" UNIQUE ("email"), CONSTRAINT "PK_28b53062261b996d9c99fa12404" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7eee76dccf32d384452fa404a6" ON "members" ("lastName", "firstName") `);
        await queryRunner.query(`CREATE TYPE "public"."role" AS ENUM('ADMIN', 'LIBRARIAN')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying(254) NOT NULL, "name" character varying(120) NOT NULL, "passwordHash" character varying, "githubId" character varying(64), "role" "public"."role" NOT NULL DEFAULT 'LIBRARIAN', "isActive" boolean NOT NULL DEFAULT true, "lastLoginAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_42148de213279d66bf94b363bf2" UNIQUE ("githubId"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "book_copies" ADD CONSTRAINT "FK_447efeb15b6c881052abd7605ec" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "books" ADD CONSTRAINT "FK_54f49efe2dd4d2850e736e9ab86" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_c75c2327ce6368e9c120a5326cd" FOREIGN KEY ("copyId") REFERENCES "book_copies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_95f07ed85a66f8cca696347f529" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_95f07ed85a66f8cca696347f529"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_c75c2327ce6368e9c120a5326cd"`);
        await queryRunner.query(`ALTER TABLE "books" DROP CONSTRAINT "FK_54f49efe2dd4d2850e736e9ab86"`);
        await queryRunner.query(`ALTER TABLE "book_copies" DROP CONSTRAINT "FK_447efeb15b6c881052abd7605ec"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."role"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7eee76dccf32d384452fa404a6"`);
        await queryRunner.query(`DROP TABLE "members"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9bc1a67c381ddf3bd960706175"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d2764288a2212b331ac3de6ab9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_93045f91e891f088085356685a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c75c2327ce6368e9c120a5326c"`);
        await queryRunner.query(`DROP TABLE "loans"`);
        await queryRunner.query(`DROP TYPE "public"."loan_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_54f49efe2dd4d2850e736e9ab8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6f50357a540439c8d17050c830"`);
        await queryRunner.query(`DROP TABLE "books"`);
        await queryRunner.query(`DROP TYPE "public"."genre"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9f1f2eade7a89f99ef13b50788"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_040b1ae378f2683ba2fb6d61d0"`);
        await queryRunner.query(`DROP TABLE "book_copies"`);
        await queryRunner.query(`DROP TYPE "public"."copy_status"`);
        await queryRunner.query(`DROP TYPE "public"."copy_condition"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4c25845f02be5847ed6a81ef07"`);
        await queryRunner.query(`DROP TABLE "authors"`);
    }

}
