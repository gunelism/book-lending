import { Author } from './author.entity';
import { BookCopy } from './book-copy.entity';
import { Book } from './book.entity';
import { Loan } from './loan.entity';
import { Member } from './member.entity';
import { Session } from './session.entity';
import { User } from './user.entity';

export * from './enums';
export { Author, Book, BookCopy, Loan, Member, Session, User };

export const ENTITIES = [User, Author, Book, BookCopy, Member, Loan, Session];
