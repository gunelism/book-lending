import { EntityManager } from 'typeorm';
import { Loan, LoanStatus } from '../entities';
import { MemberStanding } from './loan-policy';

export type LoanStats = Omit<MemberStanding, 'isActive'>;

export const EMPTY_STATS: LoanStats = { activeLoans: 0, overdueLoans: 0, unpaidFinesCents: 0 };

/**
 * Loan statistics per member in a single grouped query. Used both for the
 * checkout rules and for the computed fields in the admin list (batched by
 * DataLoader, so a page of 25 members costs one query, not 75).
 *
 * QueryBuilder is needed for the conditional aggregates (COUNT … FILTER).
 */
export async function loanStatsForMembers(em: EntityManager, memberIds: readonly number[]): Promise<Map<number, LoanStats>> {
  if (!memberIds.length) return new Map();
  const rows = await em
    .createQueryBuilder(Loan, 'loan')
    .select('loan.memberId', 'memberId')
    .addSelect('COUNT(*) FILTER (WHERE loan.status = :active)', 'active')
    .addSelect('COUNT(*) FILTER (WHERE loan.status = :active AND loan.dueDate < now())', 'overdue')
    .addSelect('COALESCE(SUM(loan.fineCents) FILTER (WHERE loan.finePaid = false), 0)', 'unpaid')
    .where('loan.memberId IN (:...memberIds)', { memberIds })
    .setParameter('active', LoanStatus.ACTIVE)
    .groupBy('loan.memberId')
    .getRawMany<{ memberId: number; active: string; overdue: string; unpaid: string }>();

  return new Map(
    rows.map((r) => [
      Number(r.memberId),
      { activeLoans: Number(r.active), overdueLoans: Number(r.overdue), unpaidFinesCents: Number(r.unpaid) },
    ]),
  );
}
