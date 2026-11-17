import { useEffect, useState } from 'react';
import type { FormName } from './dataProvider';
import { gql } from './http';

export interface FormFieldDef {
  name: string;
  label: string;
  type: string;
  required: boolean;
  help: string;
  rules: string[];
  options?: string[] | null;
}

export interface FormDef {
  name: FormName;
  title: string;
  purpose: string;
  fields: FormFieldDef[];
}

let cache: Promise<FormDef[]> | null = null;

/**
 * Form definitions from the API (`forms` query): the same field help text and
 * rules the help chat answers from. Loaded once per page load.
 */
export function useFormDefinitions(): FormDef[] | null {
  const [forms, setForms] = useState<FormDef[] | null>(null);
  useEffect(() => {
    cache ??= gql<{ forms: FormDef[] }>('{ forms { name title purpose fields { name label type required help rules options } } }').then((d) => d.forms);
    cache.then(setForms).catch(() => {
      cache = null; // retry on next mount
    });
  }, []);
  return forms;
}

/** `help('isbn')` → the field's help text, shown under the input (empty while loading). */
export function useFieldHelp(form: FormName): (field: string) => string {
  const forms = useFormDefinitions();
  const def = forms?.find((f) => f.name === form);
  return (field) => def?.fields.find((f) => f.name === field)?.help ?? '';
}
