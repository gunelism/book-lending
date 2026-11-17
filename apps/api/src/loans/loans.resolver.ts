import { Args, Context, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Roles } from '../auth/decorators';
import { BulkResult } from '../common/bulk-result';
import { GqlContext } from '../common/gql-context';
import { Book, BookCopy, Loan, LoanDisplayStatus, LoanStatus, Member, Role } from '../entities';
import { daysLate, displayStatus, isOverdue, lateFineCents, renewViolation } from './loan-policy';
import { CheckoutInput, LoanIdsInput, LoanPage, LoanListArgs } from './loans.dto';
import { LoansService } from './loans.service';

@Resolver(() => Loan)
export class LoansResolver {
  constructor(private readonly service: LoansService) {}

  @Query(() => LoanPage)
  loans(@Args() args: LoanListArgs) {
    return this.service.list(args, args.filter);
  }

  @Query(() => Loan)
  loan(@Args('id', { type: () => Int }) id: number) {
    return this.service.get(id);
  }

  @Mutation(() => Loan)
  checkout(@Args('input') input: CheckoutInput) {
    return this.service.checkout(input);
  }

  @Mutation(() => Loan)
  returnLoan(@Args('id', { type: () => Int }) id: number) {
    return this.service.returnLoan(id);
  }

  @Mutation(() => Loan)
  renewLoan(@Args('id', { type: () => Int }) id: number) {
    return this.service.renew(id);
  }

  @Mutation(() => Loan)
  markLoanLost(@Args('id', { type: () => Int }) id: number) {
    return this.service.markLost(id);
  }

  @Mutation(() => Loan)
  settleFine(@Args('id', { type: () => Int }) id: number) {
    return this.service.settleFine(id);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => Loan)
  waiveFine(@Args('id', { type: () => Int }) id: number) {
    return this.service.waiveFine(id);
  }

  @Mutation(() => BulkResult, { description: 'Bulk admin action: mark many loans as returned' })
  bulkReturnLoans(@Args('input') input: LoanIdsInput) {
    return this.service.bulkReturn(input.ids);
  }

  // ---- relations (batched) ----

  @ResolveField(() => Member, { nullable: true })
  member(@Parent() loan: Loan, @Context() ctx: GqlContext) {
    return loan.member ?? ctx.loaders.member.load(loan.memberId);
  }

  @ResolveField(() => BookCopy, { nullable: true })
  copy(@Parent() loan: Loan, @Context() ctx: GqlContext) {
    return loan.copy ?? ctx.loaders.copy.load(loan.copyId);
  }

  @ResolveField(() => Book, { nullable: true })
  async book(@Parent() loan: Loan, @Context() ctx: GqlContext) {
    if (loan.copy?.book) return loan.copy.book;
    const copy = loan.copy ?? (await ctx.loaders.copy.load(loan.copyId));
    return copy ? (copy.book ?? ctx.loaders.book.load(copy.bookId)) : null;
  }

  // ---- computed properties ----

  @ResolveField(() => Boolean)
  isOverdue(@Parent() loan: Loan) {
    return isOverdue(loan, new Date());
  }

  @ResolveField(() => Int, { description: 'Days past the due date (0 if not late). For closed loans, as of the return.' })
  daysOverdue(@Parent() loan: Loan) {
    if (loan.status === LoanStatus.LOST) return 0;
    return daysLate(loan.dueDate, loan.returnedAt ?? new Date());
  }

  @ResolveField(() => LoanDisplayStatus)
  displayStatus(@Parent() loan: Loan) {
    return displayStatus(loan, new Date());
  }

  @ResolveField(() => Int, { description: 'Fine so far: the fine that would be charged if returned now, or the final fine for closed loans' })
  accruedFineCents(@Parent() loan: Loan) {
    return loan.status === LoanStatus.ACTIVE ? lateFineCents(loan.dueDate, new Date()) : loan.fineCents;
  }

  @ResolveField(() => String, { nullable: true, description: 'Why this loan cannot be renewed, or null if it can' })
  renewBlockReason(@Parent() loan: Loan) {
    return renewViolation(loan, new Date())?.message ?? null;
  }
}
