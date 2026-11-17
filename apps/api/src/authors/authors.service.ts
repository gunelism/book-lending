import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { DomainError, NotFoundError } from '../common/errors';
import { findPage, ListArgs, nameAlternatives, Page, SortOrder } from '../common/pagination';
import { Author, Book } from '../entities';
import { AuthorFilter, CreateAuthorInput, UpdateAuthorInput } from './authors.dto';

@Injectable()
export class AuthorsService {
  constructor(
    @InjectRepository(Author) private readonly authors: Repository<Author>,
    @InjectRepository(Book) private readonly books: Repository<Book>,
  ) {}

  list(args: ListArgs, filter: AuthorFilter = {}): Promise<Page<Author>> {
    const base: FindOptionsWhere<Author> = {};
    if (filter.ids?.length) base.id = In(filter.ids);
    if (filter.nationality) base.nationality = filter.nationality;
    const where = filter.q ? nameAlternatives(filter.q).map((alt) => ({ ...base, ...alt }) as FindOptionsWhere<Author>) : base;
    return findPage(this.authors, args, { where, defaultSort: { field: 'lastName', order: SortOrder.ASC } });
  }

  async get(id: number): Promise<Author> {
    const author = await this.authors.findOneBy({ id });
    if (!author) throw new NotFoundError('Author', id);
    return author;
  }

  create(input: CreateAuthorInput): Promise<Author> {
    return this.authors.save(this.authors.create(input));
  }

  async update(id: number, input: UpdateAuthorInput): Promise<Author> {
    const author = await this.get(id);
    return this.authors.save(this.authors.merge(author, input));
  }

  async delete(id: number): Promise<Author> {
    const author = await this.get(id);
    const books = await this.books.countBy({ author: { id } });
    if (books > 0) {
      throw new DomainError('AUTHOR_HAS_BOOKS', `Author has ${books} book(s); reassign or delete them first.`);
    }
    await this.authors.remove(author);
    return { ...author, id };
  }
}
