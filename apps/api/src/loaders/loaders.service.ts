import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import DataLoader from 'dataloader';
import { DataSource, In } from 'typeorm';
import { Author, Book, BookCopy, CopyStatus, Loan, LoanStatus, Member } from '../entities';
import { EMPTY_STATS, LoanStats, loanStatsForMembers } from '../loans/member-standing';

export interface CopyCounts {
  total: number;
  available: number;
}

/**
 * Per-request DataLoaders. A fresh set is created for every GraphQL request
 * (see app.module), so caching never leaks data between users.
 *
 * Services already return the common relations (e.g. a loan comes with its
 * member and copy → book); these loaders only fill the gaps, batching what
 * would otherwise be one query per row.
 */
@Injectable()
export class LoadersService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  create() {
    const byId = <T extends { id: number }>(entity: new () => T) =>
      new DataLoader<number, T | null>(async (ids) => {
        const rows = await this.ds.getRepository(entity).findBy({ id: In(ids as number[]) } as any);
        const map = new Map(rows.map((r) => [r.id, r]));
        return ids.map((id) => map.get(id) ?? null);
      });

    return {
      author: byId(Author),
      book: byId(Book),
      copy: byId(BookCopy),
      member: byId(Member),

      /** QueryBuilder: grouped COUNT per author. */
      bookCountByAuthor: new DataLoader<number, number>(async (ids) => {
        const rows = await this.ds
          .getRepository(Book)
          .createQueryBuilder('book')
          .select('book.authorId', 'authorId')
          .addSelect('COUNT(*)', 'n')
          .where('book.authorId IN (:...ids)', { ids })
          .groupBy('book.authorId')
          .getRawMany<{ authorId: number; n: string }>();
        const map = new Map(rows.map((r) => [Number(r.authorId), Number(r.n)]));
        return ids.map((id) => map.get(id) ?? 0);
      }),

      /** QueryBuilder: total and available copies per book in one grouped query. */
      copyCountsByBook: new DataLoader<number, CopyCounts>(async (ids) => {
        const rows = await this.ds
          .getRepository(BookCopy)
          .createQueryBuilder('copy')
          .select('copy.bookId', 'bookId')
          .addSelect('COUNT(*)', 'total')
          .addSelect('COUNT(*) FILTER (WHERE copy.status = :available)', 'available')
          .where('copy.bookId IN (:...ids)', { ids })
          .setParameter('available', CopyStatus.AVAILABLE)
          .groupBy('copy.bookId')
          .getRawMany<{ bookId: number; total: string; available: string }>();
        const map = new Map(rows.map((r) => [Number(r.bookId), { total: Number(r.total), available: Number(r.available) }]));
        return ids.map((id) => map.get(id) ?? { total: 0, available: 0 });
      }),

      activeLoanByCopy: new DataLoader<number, Loan | null>(async (ids) => {
        const rows = await this.ds.getRepository(Loan).find({
          where: { copy: { id: In(ids as number[]) }, status: LoanStatus.ACTIVE },
          relations: { member: true },
        });
        const map = new Map(rows.map((r) => [r.copyId, r]));
        return ids.map((id) => map.get(id) ?? null);
      }),

      loanStatsByMember: new DataLoader<number, LoanStats>(async (ids) => {
        const map = await loanStatsForMembers(this.ds.manager, ids);
        return ids.map((id) => map.get(id) ?? EMPTY_STATS);
      }),
    };
  }
}

export type Loaders = ReturnType<LoadersService['create']>;
