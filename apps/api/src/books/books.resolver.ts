import { Args, Context, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Roles } from '../auth/decorators';
import { GqlContext } from '../common/gql-context';
import { Author, Book, Role } from '../entities';
import { BookPage, CreateBookInput, UpdateBookInput, BookListArgs } from './books.dto';
import { BooksService } from './books.service';
import { coverUrl } from './covers.service';

@Resolver(() => Book)
export class BooksResolver {
  constructor(private readonly service: BooksService) {}

  @Query(() => BookPage)
  books(@Args() args: BookListArgs) {
    return this.service.list(args, args.filter);
  }

  @Query(() => Book)
  book(@Args('id', { type: () => Int }) id: number) {
    return this.service.get(id);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => Book)
  createBook(@Args('input') input: CreateBookInput) {
    return this.service.create(input);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => Book)
  updateBook(@Args('id', { type: () => Int }) id: number, @Args('input') input: UpdateBookInput) {
    return this.service.update(id, input);
  }

  @Roles(Role.ADMIN)
  @Mutation(() => Book)
  deleteBook(@Args('id', { type: () => Int }) id: number) {
    return this.service.delete(id);
  }

  @ResolveField(() => Author, { nullable: true })
  author(@Parent() book: Book, @Context() ctx: GqlContext) {
    return book.author ?? ctx.loaders.author.load(book.authorId);
  }

  @ResolveField(() => String, { nullable: true, description: 'Relative URL of the cover image, served from object storage' })
  coverUrl(@Parent() book: Book) {
    return coverUrl(book);
  }

  @ResolveField(() => Int)
  async totalCopies(@Parent() book: Book, @Context() ctx: GqlContext) {
    return (await ctx.loaders.copyCountsByBook.load(book.id)).total;
  }

  @ResolveField(() => Int)
  async availableCopies(@Parent() book: Book, @Context() ctx: GqlContext) {
    return (await ctx.loaders.copyCountsByBook.load(book.id)).available;
  }
}
