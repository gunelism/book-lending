import { LoanDisplayStatus, LoanStatus } from '../entities/enums';
import {
  addDays,
  checkoutViolation,
  daysLate,
  displayStatus,
  LOAN_POLICY,
  lateFineCents,
  renewViolation,
  resolveDueDate,
  RuleViolation,
} from './loan-policy';

const now = new Date('2026-03-15T12:00:00Z');
const goodStanding = { isActive: true, activeLoans: 0, overdueLoans: 0, unpaidFinesCents: 0 };

describe('loan policy', () => {
  describe('late fines', () => {
    it('charges nothing when returned on time', () => {
      expect(lateFineCents(now, addDays(now, -1))).toBe(0);
      expect(lateFineCents(now, now)).toBe(0);
    });

    it('counts a started day as a full day', () => {
      const oneHourLate = new Date(now.getTime() + 60 * 60 * 1000);
      expect(daysLate(now, oneHourLate)).toBe(1);
      expect(lateFineCents(now, addDays(now, 3))).toBe(3 * LOAN_POLICY.finePerDayCents);
    });

    it('caps the fine', () => {
      expect(lateFineCents(now, addDays(now, 365))).toBe(LOAN_POLICY.maxLateFineCents);
    });
  });

  it('derives OVERDUE from an active loan past its due date', () => {
    expect(displayStatus({ status: LoanStatus.ACTIVE, dueDate: addDays(now, -1) }, now)).toBe(LoanDisplayStatus.OVERDUE);
    expect(displayStatus({ status: LoanStatus.ACTIVE, dueDate: addDays(now, 1) }, now)).toBe(LoanDisplayStatus.ACTIVE);
    expect(displayStatus({ status: LoanStatus.RETURNED, dueDate: addDays(now, -9) }, now)).toBe(LoanDisplayStatus.RETURNED);
  });

  describe('checkout eligibility', () => {
    it.each([
      [{ isActive: false }, 'MEMBER_INACTIVE'],
      [{ overdueLoans: 1 }, 'HAS_OVERDUE_LOANS'],
      [{ unpaidFinesCents: LOAN_POLICY.maxUnpaidFinesCents + 1 }, 'UNPAID_FINES'],
      [{ activeLoans: LOAN_POLICY.maxActiveLoans }, 'LOAN_LIMIT_REACHED'],
    ])('blocks %o with %s', (override, code) => {
      expect(checkoutViolation({ ...goodStanding, ...override })?.code).toBe(code);
    });

    it('allows a member in good standing', () => {
      expect(checkoutViolation({ ...goodStanding, activeLoans: LOAN_POLICY.maxActiveLoans - 1 })).toBeNull();
    });
  });

  describe('renewals', () => {
    const active = { status: LoanStatus.ACTIVE, dueDate: addDays(now, 3), renewCount: 0 };

    it('allows renewing an active, on-time loan', () => {
      expect(renewViolation(active, now)).toBeNull();
    });

    it('rejects overdue loans and loans at the renewal limit', () => {
      expect(renewViolation({ ...active, dueDate: addDays(now, -1) }, now)?.code).toBe('LOAN_OVERDUE');
      expect(renewViolation({ ...active, renewCount: LOAN_POLICY.maxRenewals }, now)?.code).toBe('RENEWAL_LIMIT');
    });
  });

  describe('due dates', () => {
    it('defaults to the standard loan period', () => {
      expect(resolveDueDate(now)).toEqual(addDays(now, LOAN_POLICY.loanDays));
    });

    it('rejects past dates and dates beyond the maximum', () => {
      expect(() => resolveDueDate(now, addDays(now, -1))).toThrow(RuleViolation);
      expect(() => resolveDueDate(now, addDays(now, LOAN_POLICY.maxLoanDays + 1))).toThrow(RuleViolation);
    });
  });
});
