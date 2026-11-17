import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { DomainError, NotFoundError } from '../common/errors';
import { likePattern, ListArgs, Page, paginate, SortOrder } from '../common/pagination';
import { Author, Book, BookCopy, CopyStatus, Loan } from '../entities';
import { StorageService } from '../storage/storage.service';
import { BookFilter, CreateBookInput, UpdateBookInput } from './books.dto';
import { normalizeIsbn } from './isbn';

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);

  constructor(
    @InjectRepository(Book) private readonly books: Repository<Book>,
    @InjectRepository(Author) private readonly authors: Repository<Author>,
    @InjectRepository(Loan) private readonly loans: Repository<Loan>,
    private readonly storage: StorageService,
  ) {}

  /**
   * QueryBuilder is used here because the "available" filter needs an EXISTS
   * subquery on copies, and the search spans the book and its author.
   * The author relation is joined and selected, so resolvers don't refetch it.
   */
  list(args: ListArgs, filter: BookFilter = {}): Promise<Page<Book>> {
    const qb = this.books.createQueryBuilder('book').leftJoinAndSelect('book.author', 'author');

    if (filter.ids?.length) qb.andWhere('book.id IN (:...ids)', { ids: filter.ids });
    if (filter.authorId) qb.andWhere('author.id = :authorId', { authorId: filter.authorId });
    if (filter.genre) qb.andWhere('book.genre = :genre', { genre: filter.genre });
    if (filter.publishedFrom) qb.andWhere('book.publishedYear >= :from', { from: filter.publishedFrom });
    if (filter.publishedTo) qb.andWhere('book.publishedYear <= :to', { to: filter.publishedTo });
    if (filter.hasCover !== undefined) qb.andWhere(`book.coverKey IS ${filter.hasCover ? 'NOT ' : ''}NULL`);
    if (filter.q) {
      qb.andWhere(
        new Brackets((or) =>
          or
            .where('book.title ILIKE :q')
            .orWhere('book.isbn ILIKE :q')
            .orWhere(`(author.firstName || ' ' || author.lastName) ILIKE :q`),
        ),
        { q: likePattern(filter.q) },
      );
    }
    if (filter.available !== undefined) {
      const onShelf = qb
        .subQuery()
        .select('1')
        .from(BookCopy, 'copy')
        .where('copy.bookId = book.id')
        .andWhere('copy.status = :available')
        .getQuery();
      qb.andWhere(`${filter.available ? '' : 'NOT '}EXISTS ${onShelf}`, { available: CopyStatus.AVAILABLE });
    }
    return paginate(qb, args, { field: 'title', order: SortOrder.ASC });
  }

  async get(id: number): Promise<Book> {
    const book = await this.books.findOne({ where: { id }, relations: { author: true } });
    if (!book) throw new NotFoundError('Book', id);
    return book;
  }

  async create(input: CreateBookInput): Promise<Book> {
    const { authorId, isbn, ...rest } = input;
    const book = this.books.create({ ...rest, isbn: this.validIsbn(isbn), author: await this.getAuthor(authorId) });
    const saved = await this.books.save(book);
    return this.get(saved.id);
  }

  async update(id: number, input: UpdateBookInput): Promise<Book> {
    const book = await this.get(id);
    const { authorId, isbn, ...rest } = input;
    this.books.merge(book, rest);
    if (isbn !== undefined) book.isbn = this.validIsbn(isbn);
    if (authorId !== undefined) book.author = await this.getAuthor(authorId);
    await this.books.save(book);
    return this.get(id);
  }

  async delete(id: number): Promise<Book> {
    const book = await this.get(id);
    const loans = await this.loans.countBy({ copy: { book: { id } } });
    if (loans > 0) {
      throw new DomainError(
        'BOOK_HAS_LOANS',
        `This book has ${loans} loan record(s) and cannot be deleted. Mark its copies as lost or in maintenance instead.`,
      );
    }
    await this.books.remove(book); // copies are removed by the ON DELETE CASCADE relation
    if (book.coverKey) await this.storage.delete(book.coverKey).catch((e) => this.logger.warn(`Cover cleanup failed: ${e}`));
    return { ...book, id };
  }

  async setCoverKey(id: number, key: string | null): Promise<{ book: Book; previousKey: string | null }> {
    const book = await this.get(id);
    const previousKey = book.coverKey;
    book.coverKey = key;
    return { book: await this.books.save(book), previousKey };
  }

  private validIsbn(raw: string): string {
    const isbn = normalizeIsbn(raw);
    if (!isbn) throw new DomainError('INVALID_ISBN', `"${raw}" is not a valid ISBN (checksum mismatch).`);
    return isbn;
  }

  private async getAuthor(id: number): Promise<Author> {
    const author = await this.authors.findOneBy({ id });
    if (!author) throw new NotFoundError('Author', id);
    return author;
  }
}
