import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  FindOptionsRelations,
  FindOptionsWhere,
  ILike,
  In,
  LessThan,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { runBulk } from '../common/bulk-result';
import { DomainError, NotFoundError } from '../common/errors';
import { findPage, likePattern, ListArgs, nameAlternatives, Page, SortOrder } from '../common/pagination';
import { Book, BookCopy, CopyStatus, Loan, LoanDisplayStatus, LoanStatus, Member } from '../entities';
import {
  addDays,
  checkoutViolation,
  LOAN_POLICY,
  lateFineCents,
  renewViolation,
  resolveDueDate,
  RuleViolation,
} from './loan-policy';
import { CheckoutInput, LoanFilter } from './loans.dto';
import { EMPTY_STATS, loanStatsForMembers } from './member-standing';

/** Relations every loan is returned with, so resolvers never refetch them. */
const LOAN_RELATIONS: FindOptionsRelations<Loan> = { member: true, copy: { book: true } };

const asDomainError = (v: RuleViolation) => new DomainError(v.code, v.message);

/** AND-combines groups of OR alternatives into the array form TypeORM's find API uses for OR. */
function combine<T>(base: FindOptionsWhere<T>, ...groups: FindOptionsWhere<T>[][]): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
  let result: FindOptionsWhere<T>[] = [base];
  for (const group of groups) {
    result = result.flatMap((w) => group.map((alt) => deepMerge(w, alt)));
  }
  return result.length === 1 ? result[0] : result;
}

function deepMerge(a: any, b: any): any {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const isPlain = v && typeof v === 'object' && v.constructor === Object;
    out[k] = isPlain && out[k] && out[k].constructor === Object ? deepMerge(out[k], v) : v;
  }
  return out;
}

/**
 * The lending workflow. Every state change runs in a transaction with row
 * locks, so two librarians can never lend the same copy or push a member past
 * the loan limit by clicking at the same moment.
 *
 *   checkout ──▶ ACTIVE ──return──▶ RETURNED
 *                  │ ▲
 *                  └─┘ renew
 *                  │
 *                  └──markLost──▶ LOST
 */
@Injectable()
export class LoansService {
  private readonly loans: Repository<Loan>;

  constructor(@InjectDataSource() private readonly ds: DataSource) {
    this.loans = ds.getRepository(Loan);
  }

  list(args: ListArgs, filter: LoanFilter = {}): Promise<Page<Loan>> {
    const now = new Date();
    const base: FindOptionsWhere<Loan> = {};
    if (filter.ids?.length) base.id = In(filter.ids);
    if (filter.memberId) base.member = { id: filter.memberId };
    if (filter.copyId) base.copy = { id: filter.copyId };
    if (filter.bookId) base.copy = { ...(base.copy as object), book: { id: filter.bookId } };
    if (filter.loanedFrom && filter.loanedTo) base.loanedAt = Between(filter.loanedFrom, filter.loanedTo);
    else if (filter.loanedFrom) base.loanedAt = MoreThanOrEqual(filter.loanedFrom);
    else if (filter.loanedTo) base.loanedAt = LessThanOrEqual(filter.loanedTo);

    // "Overdue" isn't stored: it's an active loan whose due date has passed.
    switch (filter.status) {
      case LoanDisplayStatus.OVERDUE:
        Object.assign(base, { status: LoanStatus.ACTIVE, dueDate: LessThan(now) });
        break;
      case LoanDisplayStatus.ACTIVE:
        Object.assign(base, { status: LoanStatus.ACTIVE, dueDate: MoreThanOrEqual(now) });
        break;
      case LoanDisplayStatus.RETURNED:
      case LoanDisplayStatus.LOST:
        base.status = filter.status as unknown as LoanStatus;
        break;
    }

    const groups: FindOptionsWhere<Loan>[][] = [];
    if (filter.unpaidFine === true) Object.assign(base, { fineCents: MoreThan(0), finePaid: false });
    if (filter.unpaidFine === false) groups.push([{ fineCents: 0 }, { finePaid: true }]);
    if (filter.q) {
      const q = ILike(likePattern(filter.q));
      groups.push([
        ...nameAlternatives(filter.q).map((alt) => ({ member: alt }) as FindOptionsWhere<Loan>),
        { member: { cardNumber: q } },
        { copy: { barcode: q } },
        { copy: { book: { title: q } } },
      ]);
    }

    return findPage(this.loans, args, {
      where: combine(base, ...groups),
      relations: LOAN_RELATIONS,
      defaultSort: { field: 'loanedAt', order: SortOrder.DESC },
    });
  }

  async get(id: number, em: EntityManager = this.ds.manager): Promise<Loan> {
    const loan = await em.findOne(Loan, { where: { id }, relations: LOAN_RELATIONS });
    if (!loan) throw new NotFoundError('Loan', id);
    return loan;
  }

  /** Lend a copy to a member, enforcing every eligibility rule. */
  async checkout(input: CheckoutInput, now = new Date()): Promise<Loan> {
    const identifiers = [input.copyId, input.barcode, input.bookId].filter((v) => v !== undefined && v !== null);
    if (identifiers.length !== 1) {
      throw new DomainError('INVALID_INPUT', 'Provide exactly one of copyId, barcode or bookId.');
    }

    let dueDate: Date;
    try {
      dueDate = resolveDueDate(now, input.dueDate);
    } catch (e) {
      throw e instanceof RuleViolation ? asDomainError(e) : e;
    }

    return this.ds.transaction(async (em) => {
      // Locking the member row serialises concurrent checkouts for the same
      // member, so the loan limit cannot be exceeded by racing requests.
      const member = await em.findOne(Member, { where: { id: input.memberId }, lock: { mode: 'pessimistic_write' } });
      if (!member) throw new NotFoundError('Member', input.memberId);

      const stats = (await loanStatsForMembers(em, [member.id])).get(member.id) ?? EMPTY_STATS;
      const violation = checkoutViolation({ isActive: member.isActive, ...stats });
      if (violation) throw asDomainError(violation);

      const copy = await this.lockCopyForCheckout(em, input);
      copy.status = CopyStatus.ON_LOAN;
      await em.save(copy);

      const loan = await em.save(em.create(Loan, { copy, member, loanedAt: now, dueDate, status: LoanStatus.ACTIVE }));
      return this.get(loan.id, em);
    });
  }

  /** Close a loan, charging a late fee if it is overdue. */
  async returnLoan(id: number, now = new Date()): Promise<Loan> {
    return this.ds.transaction(async (em) => {
      const loan = await this.lockLoan(em, id);
      if (loan.status !== LoanStatus.ACTIVE) {
        throw new DomainError('LOAN_NOT_ACTIVE', `Loan #${id} is already ${loan.status.toLowerCase()}.`);
      }
      const fine = lateFineCents(loan.dueDate, now);
      loan.status = LoanStatus.RETURNED;
      loan.returnedAt = now;
      loan.fineCents = fine;
      loan.finePaid = fine === 0;
      if (loan.copy.status === CopyStatus.ON_LOAN) loan.copy.status = CopyStatus.AVAILABLE;
      await em.save([loan.copy, loan]);
      return this.get(id, em);
    });
  }

  /** Extend the due date (limited renewals, never while overdue). */
  async renew(id: number, now = new Date()): Promise<Loan> {
    return this.ds.transaction(async (em) => {
      const loan = await this.lockLoan(em, id);
      const violation = renewViolation(loan, now);
      if (violation) throw asDomainError(violation);
      loan.dueDate = addDays(loan.dueDate, LOAN_POLICY.renewDays);
      loan.renewCount += 1;
      await em.save(loan);
      return this.get(id, em);
    });
  }

  /** The member lost the copy: close the loan and charge the book's replacement cost. */
  async markLost(id: number): Promise<Loan> {
    return this.ds.transaction(async (em) => {
      const loan = await this.lockLoan(em, id);
      if (loan.status !== LoanStatus.ACTIVE) {
        throw new DomainError('LOAN_NOT_ACTIVE', `Only active loans can be marked lost (loan #${id} is ${loan.status.toLowerCase()}).`);
      }
      const cost = loan.copy.book.replacementCostCents;
      loan.copy.status = CopyStatus.LOST;
      loan.status = LoanStatus.LOST;
      loan.fineCents = cost;
      loan.finePaid = cost === 0;
      await em.save([loan.copy, loan]);
      return this.get(id, em);
    });
  }

  /** Record that the member paid the fine on this loan. */
  async settleFine(id: number): Promise<Loan> {
    return this.ds.transaction(async (em) => {
      const loan = await this.lockLoan(em, id);
      if (loan.fineCents === 0 || loan.finePaid) throw new DomainError('NO_OUTSTANDING_FINE', `Loan #${id} has no outstanding fine.`);
      loan.finePaid = true;
      await em.save(loan);
      return this.get(id, em);
    });
  }

  /** Cancel a fine entirely (admin only). */
  async waiveFine(id: number): Promise<Loan> {
    return this.ds.transaction(async (em) => {
      const loan = await this.lockLoan(em, id);
      if (loan.fineCents === 0 || loan.finePaid) throw new DomainError('NO_OUTSTANDING_FINE', `Loan #${id} has no outstanding fine.`);
      loan.fineCents = 0;
      loan.finePaid = true;
      await em.save(loan);
      return this.get(id, em);
    });
  }

  /** Bulk admin action: return many loans; each one succeeds or fails on its own. */
  bulkReturn(ids: number[]) {
    return runBulk(ids, (id) => this.returnLoan(id));
  }

  /**
   * Loads the loan with its copy and book, locking only the loan row
   * (FOR UPDATE OF loans): Postgres can't lock the nullable side of a join.
   */
  private async lockLoan(em: EntityManager, id: number): Promise<Loan> {
    const loan = await em.findOne(Loan, {
      where: { id },
      relations: { copy: { book: true } },
      lock: { mode: 'pessimistic_write', tables: ['loans'] },
    });
    if (!loan) throw new NotFoundError('Loan', id);
    return loan;
  }

  private async lockCopyForCheckout(em: EntityManager, input: CheckoutInput): Promise<BookCopy> {
    if (input.bookId) {
      // Best-condition available copy (the enum is ordered NEW → POOR).
      // SKIP LOCKED lets parallel checkouts of the same title each grab a
      // different copy instead of queueing on the same row.
      const copy = await em.findOne(BookCopy, {
        where: { book: { id: input.bookId }, status: CopyStatus.AVAILABLE },
        order: { condition: 'ASC', id: 'ASC' },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });
      if (copy) return copy;
      const book = await em.findOneBy(Book, { id: input.bookId });
      if (!book) throw new NotFoundError('Book', input.bookId);
      throw new DomainError('NO_COPY_AVAILABLE', `No copies of "${book.title}" are available right now.`);
    }

    const where = input.copyId ? { id: input.copyId } : { barcode: input.barcode! };
    const copy = await em.findOne(BookCopy, { where, lock: { mode: 'pessimistic_write' } });
    if (!copy) throw new NotFoundError('Copy', input.copyId ?? input.barcode!);
    if (copy.status !== CopyStatus.AVAILABLE) {
      throw new DomainError('COPY_NOT_AVAILABLE', `Copy ${copy.barcode} is not available (status: ${copy.status.toLowerCase().replace('_', ' ')}).`);
    }
    return copy;
  }
}
