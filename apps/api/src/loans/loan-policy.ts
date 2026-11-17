import { LoanDisplayStatus, LoanStatus } from '../entities/enums';

/**
 * Library lending rules. Pure functions with no database access, so the same
 * rules drive the mutations, the computed GraphQL fields the admin displays,
 * and the unit tests.
 */
export const LOAN_POLICY = {
  /** Default loan length. */
  loanDays: 14,
  /** Longest due date staff may set by hand. */
  maxLoanDays: 60,
  /** Days added per renewal. */
  renewDays: 14,
  maxRenewals: 2,
  maxActiveLoans: 5,
  /** Late fee per started day after the due date. */
  finePerDayCents: 25,
  /** Late fee cap per loan. */
  maxLateFineCents: 2000,
  /** Members owing more than this cannot borrow. */
  maxUnpaidFinesCents: 1000,
} as const;

export const DAY_MS = 24 * 60 * 60 * 1000;

export class RuleViolation {
  constructor(
    public readonly code: string,
    public readonly message: string,
  ) {}
}

export interface LoanLike {
  status: LoanStatus;
  dueDate: Date;
  renewCount: number;
}

export interface MemberStanding {
  isActive: boolean;
  activeLoans: number;
  overdueLoans: number;
  unpaidFinesCents: number;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Whole days late, counting a started day as a full day. 0 if not late. */
export function daysLate(dueDate: Date, at: Date): number {
  const ms = at.getTime() - dueDate.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}

export function isOverdue(loan: Pick<LoanLike, 'status' | 'dueDate'>, now: Date): boolean {
  return loan.status === LoanStatus.ACTIVE && loan.dueDate.getTime() < now.getTime();
}

export function displayStatus(loan: Pick<LoanLike, 'status' | 'dueDate'>, now: Date): LoanDisplayStatus {
  if (loan.status === LoanStatus.RETURNED) return LoanDisplayStatus.RETURNED;
  if (loan.status === LoanStatus.LOST) return LoanDisplayStatus.LOST;
  return isOverdue(loan, now) ? LoanDisplayStatus.OVERDUE : LoanDisplayStatus.ACTIVE;
}

/** Late fee for returning at `returnedAt`: €0.25 per started day, capped at €20. */
export function lateFineCents(dueDate: Date, returnedAt: Date): number {
  return Math.min(daysLate(dueDate, returnedAt) * LOAN_POLICY.finePerDayCents, LOAN_POLICY.maxLateFineCents);
}

/** Reasons a member may not borrow right now, in priority order. Null = allowed. */
export function checkoutViolation(member: MemberStanding): RuleViolation | null {
  if (!member.isActive) return new RuleViolation('MEMBER_INACTIVE', 'Member account is inactive.');
  if (member.overdueLoans > 0) {
    return new RuleViolation(
      'HAS_OVERDUE_LOANS',
      `Member has ${member.overdueLoans} overdue loan(s); they must be returned first.`,
    );
  }
  if (member.unpaidFinesCents > LOAN_POLICY.maxUnpaidFinesCents) {
    return new RuleViolation(
      'UNPAID_FINES',
      `Member owes ${formatCents(member.unpaidFinesCents)} in fines (limit ${formatCents(LOAN_POLICY.maxUnpaidFinesCents)}).`,
    );
  }
  if (member.activeLoans >= LOAN_POLICY.maxActiveLoans) {
    return new RuleViolation('LOAN_LIMIT_REACHED', `Member already has ${member.activeLoans} active loans (max ${LOAN_POLICY.maxActiveLoans}).`);
  }
  return null;
}

/** Due date for a new loan; a requested date must be in the future and within the maximum. */
export function resolveDueDate(now: Date, requested?: Date | null): Date {
  if (!requested) return addDays(now, LOAN_POLICY.loanDays);
  if (requested.getTime() <= now.getTime()) {
    throw new RuleViolation('INVALID_DUE_DATE', 'Due date must be in the future.');
  }
  if (requested.getTime() > addDays(now, LOAN_POLICY.maxLoanDays).getTime()) {
    throw new RuleViolation('INVALID_DUE_DATE', `Due date cannot be more than ${LOAN_POLICY.maxLoanDays} days away.`);
  }
  return requested;
}

export function renewViolation(loan: LoanLike, now: Date): RuleViolation | null {
  if (loan.status !== LoanStatus.ACTIVE) return new RuleViolation('LOAN_NOT_ACTIVE', 'Only active loans can be renewed.');
  if (isOverdue(loan, now)) return new RuleViolation('LOAN_OVERDUE', 'Overdue loans cannot be renewed; return the book first.');
  if (loan.renewCount >= LOAN_POLICY.maxRenewals) {
    return new RuleViolation('RENEWAL_LIMIT', `Loan has already been renewed ${LOAN_POLICY.maxRenewals} times.`);
  }
  return null;
}

export function formatCents(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}
