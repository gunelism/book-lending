import { Args, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { CurrentUser, Roles } from '../auth/decorators';
import { Role, User } from '../entities';
import { CreateUserInput, UpdateUserInput, UserPage, UserListArgs } from './users.dto';
import { UsersService } from './users.service';

/** Staff account management — admins only. */
@Roles(Role.ADMIN)
@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly service: UsersService) {}

  @Query(() => UserPage)
  users(@Args() args: UserListArgs) {
    return this.service.list(args, args.filter);
  }

  @Query(() => User)
  user(@Args('id', { type: () => Int }) id: number) {
    return this.service.get(id);
  }

  @Mutation(() => User)
  createUser(@Args('input') input: CreateUserInput) {
    return this.service.create(input);
  }

  @Mutation(() => User)
  updateUser(@Args('id', { type: () => Int }) id: number, @Args('input') input: UpdateUserInput, @CurrentUser() me: User) {
    return this.service.update(id, input, me);
  }

  @Mutation(() => User)
  deleteUser(@Args('id', { type: () => Int }) id: number, @CurrentUser() me: User) {
    return this.service.delete(id, me);
  }

  @ResolveField(() => Boolean)
  githubLinked(@Parent() user: User) {
    return !!user.githubId;
  }
}
