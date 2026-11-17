import { Field, Int, ObjectType } from '@nestjs/graphql';
import { HttpException } from '@nestjs/common';

@ObjectType()
export class BulkFailure {
  @Field(() => Int)
  id: number;

  @Field()
  reason: string;
}

/** Result of a bulk admin action: which rows worked and why the others didn't. */
@ObjectType()
export class BulkResult {
  @Field(() => [Int])
  succeeded: number[] = [];

  @Field(() => [BulkFailure])
  failed: BulkFailure[] = [];
}

/** Runs `fn` for each id, collecting per-row failures instead of aborting the batch. */
export async function runBulk(ids: number[], fn: (id: number) => Promise<unknown>): Promise<BulkResult> {
  const result = new BulkResult();
  for (const id of [...new Set(ids)]) {
    try {
      await fn(id);
      result.succeeded.push(id);
    } catch (err) {
      const reason =
        err instanceof HttpException ? String((err.getResponse() as any)?.message ?? err.message) : 'Unexpected error';
      result.failed.push({ id, reason });
    }
  }
  return result;
}
