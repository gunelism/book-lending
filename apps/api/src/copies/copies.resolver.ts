import { Args, Context, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Roles } from '../auth/decorators';
import { BulkResult } from '../common/bulk-result';
import { GqlContext } from '../common/gql-context';
import { Book, BookCopy, Loan, Role } from '../entities';
import { AddCopiesInput, BulkCopyStatusInput, CopyPage, UpdateCopyInput, CopyListArgs } from './copies.dto';
import { CopiesService } from './copies.service';

@Resolver(() => BookCopy)
export class CopiesResolver {
  constructor(private readonly service: CopiesService) {}

  @Query(() => CopyPage)
  copies(@Args() args: CopyListArgs) {
    return this.service.list(args, args.filter);
  }

  @Query(() => BookCopy)
  copy(@Args('id', { type: () => Int }) id: number) {
    return this.service.get(id);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => [BookCopy])
  addCopies(@Args('input') input: AddCopiesInput) {
    return this.service.add(input);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => BookCopy)
  updateCopy(@Args('id', { type: () => Int }) id: number, @Args('input') input: UpdateCopyInput) {
    return this.service.update(id, input);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => BulkResult, { description: 'Bulk admin action: set copies to AVAILABLE or MAINTENANCE' })
  bulkSetCopyStatus(@Args('input') input: BulkCopyStatusInput) {
    return this.service.bulkSetStatus(input);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => BookCopy)
  deleteCopy(@Args('id', { type: () => Int }) id: number) {
    return this.service.delete(id);
  }

  @ResolveField(() => Book, { nullable: true })
  book(@Parent() copy: BookCopy, @Context() ctx: GqlContext) {
    return copy.book ?? ctx.loaders.book.load(copy.bookId);
  }

  @ResolveField(() => Loan, { nullable: true, description: 'The active loan, if the copy is out' })
  currentLoan(@Parent() copy: BookCopy, @Context() ctx: GqlContext) {
    return ctx.loaders.activeLoanByCopy.load(copy.id);
  }
}
