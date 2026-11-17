import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Field, GraphQLSchemaHost, ObjectType } from '@nestjs/graphql';
import { getMetadataStorage } from 'class-validator';
import type { ValidationMetadata } from 'class-validator/types/metadata/ValidationMetadata';
import { getNamedType, GraphQLEnumType, GraphQLInputObjectType, isNonNullType } from 'graphql';
import { FormName, FORMS, LABELS } from './form-registry';

@ObjectType()
export class FormField {
  @Field()
  name: string;

  @Field()
  label: string;

  @Field({ description: 'GraphQL type name: String, Int, Boolean, DateTime or an enum' })
  type: string;

  @Field()
  required: boolean;

  @Field({ description: 'Help text for the field (the input type’s description)' })
  help: string;

  @Field(() => [String], { description: 'Human-readable validation rules, from the field’s validators' })
  rules: string[];

  @Field(() => [String], { nullable: true })
  options?: string[];
}

@ObjectType()
export class FormDefinition {
  @Field(() => FormName)
  name: FormName;

  @Field()
  title: string;

  @Field()
  purpose: string;

  @Field(() => [FormField])
  fields: FormField[];
}

const startCase = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

/** Turns class-validator metadata into short rules a person (or the model) can read. */
function describeRule(m: ValidationMetadata): string | null {
  if (typeof m.message === 'string') return m.message;
  const [a, b] = (m.constraints ?? []) as unknown[];
  switch (m.name) {
    case 'isLength':
      return b === undefined ? `at least ${a} characters` : `${a}–${b} characters`;
    case 'maxLength':
      return `at most ${a} characters`;
    case 'min':
      return `minimum ${a}`;
    case 'max':
      return `maximum ${a}`;
    case 'isEmail':
      return 'a valid email address';
    case 'isInt':
      return 'a whole number';
    case 'isDate':
      return 'a date and time';
    case 'matches':
      return 'must match the expected format';
    default:
      return null; // isString, isOptional, isEnum… are covered by type/required/options
  }
}

/**
 * Form definitions built from the live GraphQL schema (field types, required,
 * enum options, descriptions) and class-validator metadata (rules). Served to
 * the admin, which shows `help` under each input, and fed to the help chat.
 */
@Injectable()
export class FormsService {
  private cache?: FormDefinition[];

  // The schema is built when the app starts, so it's looked up lazily (first request), not at construction.
  constructor(private readonly moduleRef: ModuleRef) {}

  private get schema() {
    return this.moduleRef.get(GraphQLSchemaHost, { strict: false }).schema;
  }

  all(): FormDefinition[] {
    return (this.cache ??= (Object.keys(FORMS) as FormName[]).map((name) => this.build(name)));
  }

  get(name: FormName): FormDefinition {
    return this.all().find((f) => f.name === name)!;
  }

  private build(name: FormName): FormDefinition {
    const spec = FORMS[name];
    const fields = new Map<string, FormField>();

    for (const dto of spec.inputs) {
      const gqlType = this.schema.getType(dto.name);
      if (!(gqlType instanceof GraphQLInputObjectType)) throw new Error(`${dto.name} is not a GraphQL input type`);
      const validators = getMetadataStorage().getTargetValidationMetadatas(dto, '', true, false);

      // Declaration order of the DTO (the schema itself is sorted alphabetically).
      const order = [...new Set(validators.map((v) => v.propertyName))];
      const ordered = Object.values(gqlType.getFields()).sort(
        (a, b) => (order.indexOf(a.name) + 1 || 999) - (order.indexOf(b.name) + 1 || 999),
      );

      for (const field of ordered) {
        if (fields.has(field.name) || spec.hidden?.includes(field.name)) continue;
        const named = getNamedType(field.type);
        // References (authorId, memberId…) are chosen from a picker, so id-range rules are just noise.
        const isReference = /Id$/.test(field.name);
        const rules = validators
          .filter((v) => v.propertyName === field.name && !isReference)
          .map(describeRule)
          .filter((r): r is string => !!r);
        fields.set(field.name, {
          name: field.name,
          label: LABELS[field.name] ?? startCase(field.name),
          type: named.name,
          required: isNonNullType(field.type) && field.defaultValue === undefined,
          help: field.description ?? '',
          rules: [...new Set(rules)],
          options: named instanceof GraphQLEnumType ? named.getValues().map((v) => v.name) : undefined,
        });
      }
    }
    return { name, title: spec.title, purpose: spec.purpose, fields: [...fields.values()] };
  }
}
