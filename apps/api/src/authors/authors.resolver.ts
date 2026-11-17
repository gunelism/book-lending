import { Args, Context, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Roles } from '../auth/decorators';
import { GqlContext } from '../common/gql-context';
import { Author, Role } from '../entities';
import { AuthorPage, CreateAuthorInput, UpdateAuthorInput, AuthorListArgs } from './authors.dto';
import { AuthorsService } from './authors.service';

@Resolver(() => Author)
export class AuthorsResolver {
  constructor(private readonly service: AuthorsService) {}

  @Query(() => AuthorPage)
  authors(@Args() args: AuthorListArgs) {
    return this.service.list(args, args.filter);
  }

  @Query(() => Author)
  author(@Args('id', { type: () => Int }) id: number) {
    return this.service.get(id);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => Author)
  createAuthor(@Args('input') input: CreateAuthorInput) {
    return this.service.create(input);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => Author)
  updateAuthor(@Args('id', { type: () => Int }) id: number, @Args('input') input: UpdateAuthorInput) {
    return this.service.update(id, input);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => Author)
  deleteAuthor(@Args('id', { type: () => Int }) id: number) {
    return this.service.delete(id);
  }

  @ResolveField(() => String)
  fullName(@Parent() a: Author) {
    return `${a.firstName} ${a.lastName}`;
  }

  @ResolveField(() => Int)
  bookCount(@Parent() a: Author, @Context() ctx: GqlContext) {
    return ctx.loaders.bookCountByAuthor.load(a.id);
  }
}
