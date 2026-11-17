import { Query, Resolver } from '@nestjs/graphql';
import { FormDefinition, FormsService } from './forms.service';

@Resolver()
export class FormsResolver {
  constructor(private readonly service: FormsService) {}

  /** Field help for every admin form; the admin shows it under each input. */
  @Query(() => [FormDefinition])
  forms() {
    return this.service.all();
  }
}
