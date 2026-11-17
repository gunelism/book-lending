import { BadRequestException, Type } from '@nestjs/common';
import { ArgsType, Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import {
  EntityMetadata,
  FindOptionsOrder,
  FindOptionsRelations,
  FindOptionsWhere,
  ILike,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}
registerEnumType(SortOrder, { name: 'SortOrder' });

/** Pagination + sorting arguments shared by every list query (React-Admin's getList). */
@ArgsType()
export class ListArgs {
  @Field(() => Int, { defaultValue: 1 })
  @IsInt()
  @Min(1)
  page = 1;

  /** Capped so a client cannot ask for the whole table in one request. */
  @Field(() => Int, { defaultValue: 25 })
  @IsInt()
  @Min(1)
  @Max(500)
  perPage = 25;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-zA-Z.]+$/, { message: 'sortField contains invalid characters' })
  sortField?: string;

  @Field(() => SortOrder, { nullable: true })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;
}

export interface Page<T> {
  items: T[];
  total: number;
}

/** Builds a `XxxPage { items, total }` GraphQL type. */
export function Paginated<T>(classRef: Type<T>): Type<Page<T>> {
  @ObjectType({ isAbstract: true })
  abstract class PageType implements Page<T> {
    @Field(() => [classRef])
    items: T[];

    @Field(() => Int)
    total: number;
  }
  return PageType as Type<Page<T>>;
}

/**
 * What a list can be sorted by is read from the entity's TypeORM metadata
 * rather than kept in per-service whitelists:
 *
 *  - any selectable column of the entity: "title", "dueDate", "authorId"
 *  - a column one hop through a many-to-one / owning one-to-one relation:
 *    "author.lastName", "member.lastName", "copy.barcode"
 *
 * Anything else (unknown names, computed GraphQL fields, to-many relations,
 * `select: false` columns such as passwordHash) is rejected, so a client can
 * never sort on arbitrary SQL or use ordering to probe hidden data.
 */
export interface SortTarget {
  relation?: string;
  property: string;
}

export interface DefaultSort {
  field: string;
  order: SortOrder;
}

function sortableColumn(meta: EntityMetadata, property: string): ColumnMetadata | undefined {
  const column = meta.findColumnWithPropertyName(property);
  return column && column.isSelect && column.type !== 'json' && column.type !== 'jsonb' ? column : undefined;
}

export function resolveSortField(meta: EntityMetadata, field: string): SortTarget {
  const [first, second, ...rest] = field.split('.');
  if (!rest.length) {
    if (second === undefined) {
      if (sortableColumn(meta, first)) return { property: first };
    } else {
      const relation = meta.findRelationWithPropertyPath(first);
      if (relation && (relation.isManyToOne || relation.isOneToOneOwner) && sortableColumn(relation.inverseEntityMetadata, second)) {
        return { relation: relation.propertyName, property: second };
      }
    }
  }
  throw new BadRequestException(`Cannot sort ${meta.name} by "${field}".`);
}

function resolveSort(meta: EntityMetadata, args: ListArgs, defaultSort: DefaultSort) {
  const field = args.sortField ?? defaultSort.field;
  return {
    target: resolveSortField(meta, field),
    order: args.sortOrder ?? (args.sortField ? SortOrder.ASC : defaultSort.order),
  };
}

const nullsFor = (order: SortOrder) => (order === SortOrder.ASC ? 'FIRST' : 'LAST');

/**
 * Paginated list through TypeORM's find API (findAndCount). This is the
 * default for list queries; `where` may be an array for OR conditions and
 * `relations` loads related entities in the same query.
 */
export async function findPage<T extends ObjectLiteral & { id: number }>(
  repo: Repository<T>,
  args: ListArgs,
  options: {
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[];
    relations?: FindOptionsRelations<T>;
    defaultSort: DefaultSort;
  },
): Promise<Page<T>> {
  const { target, order } = resolveSort(repo.metadata, args, options.defaultSort);
  const leaf = { direction: order, nulls: nullsFor(order) };
  const sortOrder = target.relation ? { [target.relation]: { [target.property]: leaf } } : { [target.property]: leaf };
  // Sorting through a relation needs that relation joined.
  const relations =
    target.relation && !(options.relations as Record<string, unknown> | undefined)?.[target.relation]
      ? { ...options.relations, [target.relation]: true }
      : options.relations;

  const [items, total] = await repo.findAndCount({
    where: options.where,
    relations: relations as FindOptionsRelations<T>,
    // Stable tiebreaker on id so pages never overlap.
    order: { ...sortOrder, ...(target.property === 'id' && !target.relation ? {} : { id: order }) } as FindOptionsOrder<T>,
    skip: (args.page - 1) * args.perPage,
    take: args.perPage,
  });
  return { items, total };
}

/**
 * Builds OR alternatives for a person-name search with the find API:
 * matches first or last name, and "Jane Doe" matches first AND last name.
 */
export function nameAlternatives(q: string): Array<{ firstName?: unknown; lastName?: unknown }> {
  const parts = q.trim().split(/\s+/);
  const alternatives: Array<{ firstName?: unknown; lastName?: unknown }> = [
    { firstName: ILike(likePattern(q)) },
    { lastName: ILike(likePattern(q)) },
  ];
  if (parts.length > 1) {
    alternatives.push({ firstName: ILike(likePattern(parts[0])), lastName: ILike(likePattern(parts.slice(1).join(' '))) });
  }
  return alternatives;
}

/**
 * QueryBuilder variant, used only by the lists that need SQL the find API
 * can't express (EXISTS subqueries). Sort fields are validated against the
 * query's root entity metadata exactly like findPage; a relation used for
 * sorting is reused if already joined, otherwise left-joined.
 */
export async function paginate<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  args: ListArgs,
  defaultSort: DefaultSort,
): Promise<Page<T>> {
  const { target, order } = resolveSort(qb.expressionMap.mainAlias!.metadata, args, defaultSort);
  let alias = qb.alias;
  if (target.relation) {
    const path = `${qb.alias}.${target.relation}`;
    const joined = qb.expressionMap.joinAttributes.find((j) => j.entityOrProperty === path);
    alias = joined?.alias.name ?? `sort_${target.relation}`;
    if (!joined) qb.leftJoin(path, alias);
  }
  qb.orderBy(`${alias}.${target.property}`, order, order === SortOrder.ASC ? 'NULLS FIRST' : 'NULLS LAST');
  // Stable tiebreaker so pages never overlap.
  qb.addOrderBy(`${qb.alias}.id`, order);
  qb.skip((args.page - 1) * args.perPage).take(args.perPage);
  const [items, total] = await qb.getManyAndCount();
  return { items, total };
}

/** Escapes LIKE wildcards in user-supplied search text. */
export function likePattern(term: string): string {
  return `%${term.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`;
}
