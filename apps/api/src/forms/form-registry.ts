import { registerEnumType } from '@nestjs/graphql';
import { CreateAuthorInput } from '../authors/authors.dto';
import { CreateBookInput } from '../books/books.dto';
import { AddCopiesInput, UpdateCopyInput } from '../copies/copies.dto';
import { formatCents, LOAN_POLICY } from '../loans/loan-policy';
import { CheckoutInput } from '../loans/loans.dto';
import { CreateMemberInput } from '../members/members.dto';
import { CreateUserInput } from '../users/users.dto';

export enum FormName {
  book = 'book',
  author = 'author',
  member = 'member',
  checkout = 'checkout',
  copy = 'copy',
  user = 'user',
}
registerEnumType(FormName, { name: 'FormName', description: 'An admin form the help chat can explain' });

export interface FormSpec {
  title: string;
  /** What the form is for and how it fits the workflow (form-level help). */
  purpose: string;
  /** Input DTOs whose fields make up the form. Field help = their GraphQL `description`s. */
  inputs: Array<new () => object>;
  /** Fields that exist on the DTO but are not shown in the admin form. */
  hidden?: string[];
}

/**
 * The admin forms the help chat knows about. Field-level help is NOT written
 * here: it comes from the `description` on each input-type field (the
 * equivalent of Django's help_text) plus the field's real validation rules,
 * so the forms, the API schema and the chat can never disagree.
 */
export const FORMS: Record<FormName, FormSpec> = {
  [FormName.book]: {
    title: 'Book',
    purpose:
      'Create or edit a catalogue entry: one per edition (ISBN). Only admins can edit books; librarians see them read-only. ' +
      'The cover image is uploaded on the book page (JPEG, PNG or WebP, max 2 MB; it is re-encoded and stored in object storage). ' +
      'Physical copies are managed on the Copies tab after the book is saved. A book with loan history cannot be deleted.',
    inputs: [CreateBookInput],
  },
  [FormName.author]: {
    title: 'Author',
    purpose: 'Create or edit an author. Admins only. An author who still has books cannot be deleted; reassign or delete the books first.',
    inputs: [CreateAuthorInput],
  },
  [FormName.member]: {
    title: 'Member',
    purpose:
      'Register or edit a library member (a borrower, not a staff account). Admins and librarians can create and edit members; ' +
      'only admins can delete them, and only if they never borrowed anything.',
    inputs: [CreateMemberInput],
  },
  [FormName.checkout]: {
    title: 'New loan (checkout)',
    purpose:
      `Lend a copy to a member. A member cannot borrow if they are inactive, have any overdue loan, owe more than ${formatCents(LOAN_POLICY.maxUnpaidFinesCents)} ` +
      `in unpaid fines, or already have ${LOAN_POLICY.maxActiveLoans} active loans. Loans last ${LOAN_POLICY.loanDays} days by default and can be renewed ` +
      `${LOAN_POLICY.maxRenewals} times (+${LOAN_POLICY.renewDays} days each) unless overdue. Late returns cost ${formatCents(LOAN_POLICY.finePerDayCents)} ` +
      `per started day, capped at ${formatCents(LOAN_POLICY.maxLateFineCents)}; a lost copy costs the book's replacement cost.`,
    inputs: [CheckoutInput],
    hidden: ['copyId'],
  },
  [FormName.copy]: {
    title: 'Book copies',
    purpose:
      'The Copies tab on a book page manages the physical copies of that book (admins only): add copies, and change each copy’s condition or status in place. ' +
      'Copies that were ever lent cannot be deleted; mark them Lost instead.',
    inputs: [AddCopiesInput, UpdateCopyInput],
    hidden: ['bookId'],
  },
  [FormName.user]: {
    title: 'Staff account',
    purpose:
      'Create or edit staff who sign in to this admin (admins only; the Staff menu is hidden from librarians). ' +
      'When editing, leave the password empty to keep it. You cannot change your own role, deactivate or delete yourself.',
    inputs: [CreateUserInput],
  },
};

/** Labels as shown in the admin forms, where they differ from the field name. */
export const LABELS: Record<string, string> = {
  isbn: 'ISBN',
  authorId: 'Author',
  bookId: 'Book',
  memberId: 'Member',
  copyId: 'Copy',
  publishedYear: 'Published year',
  replacementCostCents: 'Replacement cost (€)',
  cardNumber: 'Card number',
  isActive: 'Active',
  dueDate: 'Due date',
  birthYear: 'Birth year',
  firstName: 'First name',
  lastName: 'Last name',
  count: 'Add copies',
};
