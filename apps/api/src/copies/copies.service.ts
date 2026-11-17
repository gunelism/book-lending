import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'node:crypto';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { runBulk } from '../common/bulk-result';
import { DomainError, NotFoundError } from '../common/errors';
import { findPage, likePattern, ListArgs, Page, SortOrder } from '../common/pagination';
import { Book, BookCopy, CopyStatus, Loan } from '../entities';
import { AddCopiesInput, BulkCopyStatusInput, CopyFilter, UpdateCopyInput } from './copies.dto';

@Injectable()
export class CopiesService {
  constructor(
    @InjectRepository(BookCopy) private readonly copies: Repository<BookCopy>,
    @InjectRepository(Book) private readonly books: Repository<Book>,
    @InjectRepository(Loan) private readonly loans: Repository<Loan>,
  ) {}

  list(args: ListArgs, filter: CopyFilter = {}): Promise<Page<BookCopy>> {
    const base: FindOptionsWhere<BookCopy> = {};
    if (filter.ids?.length) base.id = In(filter.ids);
    if (filter.bookId) base.book = { id: filter.bookId };
    if (filter.status) base.status = filter.status;
    if (filter.condition) base.condition = filter.condition;

    // Search the barcode OR the related book's title (OR = array of where objects).
    const where = filter.q
      ? [
          { ...base, barcode: ILike(likePattern(filter.q)) },
          { ...base, book: { ...(base.book as object), title: ILike(likePattern(filter.q)) } },
        ]
      : base;

    return findPage(this.copies, args, {
      where,
      relations: { book: true },
      defaultSort: { field: 'id', order: SortOrder.DESC },
    });
  }

  async get(id: number): Promise<BookCopy> {
    const copy = await this.copies.findOne({ where: { id }, relations: { book: true } });
    if (!copy) throw new NotFoundError('Copy', id);
    return copy;
  }

  /** Adds N physical copies of a book, each with a unique generated barcode. */
  async add(input: AddCopiesInput): Promise<BookCopy[]> {
    const book = await this.books.findOneBy({ id: input.bookId });
    if (!book) throw new NotFoundError('Book', input.bookId);

    const barcodes = await this.freshBarcodes(input.count);
    const saved = await this.copies.save(
      barcodes.map((barcode) => this.copies.create({ book, barcode, condition: input.condition, status: CopyStatus.AVAILABLE })),
    );
    return this.copies.find({ where: { id: In(saved.map((c) => c.id)) }, relations: { book: true }, order: { id: 'ASC' } });
  }

  async update(id: number, input: UpdateCopyInput): Promise<BookCopy> {
    const copy = await this.get(id);
    if (input.status && input.status !== copy.status) {
      if (copy.status === CopyStatus.ON_LOAN) {
        throw new DomainError('COPY_ON_LOAN', `Copy ${copy.barcode} is on loan; return or mark the loan lost instead.`);
      }
      copy.status = input.status;
    }
    if (input.condition) copy.condition = input.condition;
    return this.copies.save(copy);
  }

  /** Bulk admin action: send copies to maintenance or back to the shelf. Copies on loan are skipped. */
  bulkSetStatus(input: BulkCopyStatusInput) {
    return runBulk(input.ids, (id) => this.update(id, { status: input.status }));
  }

  async delete(id: number): Promise<BookCopy> {
    const copy = await this.get(id);
    const loans = await this.loans.countBy({ copy: { id } });
    if (loans > 0) {
      throw new DomainError('COPY_HAS_LOANS', `Copy ${copy.barcode} has loan history and cannot be deleted; mark it LOST instead.`);
    }
    await this.copies.remove(copy);
    return { ...copy, id };
  }

  private async freshBarcodes(count: number): Promise<string[]> {
    const result = new Set<string>();
    while (result.size < count) {
      const candidates = Array.from({ length: count - result.size }, () => `LIB${String(randomInt(0, 1e9)).padStart(9, '0')}`);
      const taken = await this.copies.find({ where: { barcode: In(candidates) }, select: { id: true, barcode: true } });
      const takenSet = new Set(taken.map((c) => c.barcode));
      candidates.filter((c) => !takenSet.has(c)).forEach((c) => result.add(c));
    }
    return [...result];
  }
}
