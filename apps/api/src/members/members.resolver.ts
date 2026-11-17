import { Args, Context, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Roles } from '../auth/decorators';
import { BulkResult } from '../common/bulk-result';
import { GqlContext } from '../common/gql-context';
import { Member, Role } from '../entities';
import { checkoutViolation } from '../loans/loan-policy';
import { BulkMemberActiveInput, CreateMemberInput, MemberPage, UpdateMemberInput, MemberListArgs } from './members.dto';
import { MembersService } from './members.service';

@Resolver(() => Member)
export class MembersResolver {
  constructor(private readonly service: MembersService) {}

  @Query(() => MemberPage)
  members(@Args() args: MemberListArgs) {
    return this.service.list(args, args.filter);
  }

  @Query(() => Member)
  member(@Args('id', { type: () => Int }) id: number) {
    return this.service.get(id);
  }

  @Mutation(() => Member)
  createMember(@Args('input') input: CreateMemberInput) {
    return this.service.create(input);
  }

  @Mutation(() => Member)
  updateMember(@Args('id', { type: () => Int }) id: number, @Args('input') input: UpdateMemberInput) {
    return this.service.update(id, input);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => Member)
  deleteMember(@Args('id', { type: () => Int }) id: number) {
    return this.service.delete(id);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => BulkResult, { description: 'Bulk admin action: activate / deactivate members' })
  bulkSetMemberActive(@Args('input') input: BulkMemberActiveInput) {
    return this.service.bulkSetActive(input);
  }

  @ResolveField(() => String)
  fullName(@Parent() m: Member) {
    return `${m.firstName} ${m.lastName}`;
  }

  @ResolveField(() => Int)
  async activeLoanCount(@Parent() m: Member, @Context() ctx: GqlContext) {
    return (await ctx.loaders.loanStatsByMember.load(m.id)).activeLoans;
  }

  @ResolveField(() => Int)
  async overdueLoanCount(@Parent() m: Member, @Context() ctx: GqlContext) {
    return (await ctx.loaders.loanStatsByMember.load(m.id)).overdueLoans;
  }

  @ResolveField(() => Int)
  async unpaidFinesCents(@Parent() m: Member, @Context() ctx: GqlContext) {
    return (await ctx.loaders.loanStatsByMember.load(m.id)).unpaidFinesCents;
  }

  @ResolveField(() => String, {
    nullable: true,
    description: 'Why this member cannot borrow right now (same rules as checkout), or null if they can',
  })
  async borrowBlockReason(@Parent() m: Member, @Context() ctx: GqlContext) {
    const stats = await ctx.loaders.loanStatsByMember.load(m.id);
    return checkoutViolation({ isActive: m.isActive, ...stats })?.message ?? null;
  }
}
