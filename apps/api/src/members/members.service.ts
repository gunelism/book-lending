import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'node:crypto';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { runBulk } from '../common/bulk-result';
import { DomainError, NotFoundError } from '../common/errors';
import { likePattern, ListArgs, Page, paginate, SortOrder } from '../common/pagination';
import { Loan, LoanStatus, Member } from '../entities';
import { BulkMemberActiveInput, CreateMemberInput, MemberFilter, UpdateMemberInput } from './members.dto';

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(Member) private readonly members: Repository<Member>,
    @InjectRepository(Loan) private readonly loans: Repository<Loan>,
  ) {}

  /**
   * QueryBuilder is used here because the "has overdue loans" and "has unpaid
   * fines" filters are EXISTS subqueries over the member's loans.
   */
  list(args: ListArgs, filter: MemberFilter = {}): Promise<Page<Member>> {
    const qb = this.members.createQueryBuilder('member');
    if (filter.ids?.length) qb.andWhere('member.id IN (:...ids)', { ids: filter.ids });
    if (filter.isActive !== undefined) qb.andWhere('member.isActive = :active', { active: filter.isActive });
    if (filter.q) {
      qb.andWhere(
        new Brackets((or) =>
          or
            .where(`(member.firstName || ' ' || member.lastName) ILIKE :q`)
            .orWhere('member.email ILIKE :q')
            .orWhere('member.cardNumber ILIKE :q'),
        ),
        { q: likePattern(filter.q) },
      );
    }
    if (filter.hasOverdue !== undefined) {
      const overdue = this.loanExists(qb, 'overdue')
        .andWhere('overdue.status = :activeStatus')
        .andWhere('overdue.dueDate < now()')
        .getQuery();
      qb.andWhere(`${filter.hasOverdue ? '' : 'NOT '}EXISTS ${overdue}`, { activeStatus: LoanStatus.ACTIVE });
    }
    if (filter.hasUnpaidFines !== undefined) {
      const unpaid = this.loanExists(qb, 'fine').andWhere('fine.fineCents > 0').andWhere('fine.finePaid = false').getQuery();
      qb.andWhere(`${filter.hasUnpaidFines ? '' : 'NOT '}EXISTS ${unpaid}`);
    }
    return paginate(qb, args, { field: 'lastName', order: SortOrder.ASC });
  }

  async get(id: number): Promise<Member> {
    const member = await this.members.findOneBy({ id });
    if (!member) throw new NotFoundError('Member', id);
    return member;
  }

  async create(input: CreateMemberInput): Promise<Member> {
    const cardNumber = input.cardNumber ?? (await this.freshCardNumber());
    return this.members.save(this.members.create({ ...input, cardNumber }));
  }

  async update(id: number, input: UpdateMemberInput): Promise<Member> {
    const member = await this.get(id);
    return this.members.save(this.members.merge(member, input));
  }

  async delete(id: number): Promise<Member> {
    const member = await this.get(id);
    const loans = await this.loans.countBy({ member: { id } });
    if (loans > 0) {
      throw new DomainError('MEMBER_HAS_LOANS', `Member has ${loans} loan record(s); deactivate the account instead of deleting it.`);
    }
    await this.members.remove(member);
    return { ...member, id };
  }

  /** Bulk admin action: activate or deactivate many members at once. */
  bulkSetActive(input: BulkMemberActiveInput) {
    return runBulk(input.ids, (id) => this.update(id, { isActive: input.isActive }));
  }

  /** `SELECT 1 FROM loans <alias> WHERE <alias>.memberId = member.id` as a correlated subquery. */
  private loanExists(qb: SelectQueryBuilder<Member>, alias: string): SelectQueryBuilder<Loan> {
    return qb.subQuery().select('1').from(Loan, alias).where(`${alias}.memberId = member.id`) as SelectQueryBuilder<Loan>;
  }

  private async freshCardNumber(): Promise<string> {
    for (;;) {
      const card = `M${String(randomInt(0, 1e7)).padStart(7, '0')}`;
      if (!(await this.members.existsBy({ cardNumber: card }))) return card;
    }
  }
}
