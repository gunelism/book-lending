import type { DataProvider, Identifier, RaRecord } from 'react-admin';
import { api, gql } from './http';

/**
 * A small GraphQL data provider written against this API's conventions:
 *   list query   xs(page, perPage, sortField, sortOrder, filter: XFilter) { items total }
 *   one query    x(id)
 *   mutations    createX(input) / updateX(id, input) / deleteX(id)
 * Every write goes through the API's services, so the admin can never bypass
 * the business rules or the role checks.
 */
interface ResourceConfig {
  list: string;
  one: string;
  filter: string;
  fields: string;
  create?: { mutation: string; input: string; writable: string[] };
  update?: { mutation: string; input: string; writable: string[] };
  delete?: string;
}

const AUTHOR = `id firstName lastName fullName bio birthYear nationality bookCount createdAt`;
const BOOK = `id title isbn publishedYear genre description replacementCostCents authorId coverUrl totalCopies availableCopies author { id fullName } createdAt`;
const COPY = `id bookId barcode condition status acquiredAt book { id title } currentLoan { id dueDate memberId member { id fullName } }`;
const MEMBER = `id cardNumber firstName lastName fullName email phone isActive joinedAt activeLoanCount overdueLoanCount unpaidFinesCents borrowBlockReason`;
const LOAN = `id loanedAt dueDate returnedAt renewCount status displayStatus isOverdue daysOverdue fineCents finePaid accruedFineCents renewBlockReason memberId copyId member { id fullName cardNumber } book { id title } copy { id barcode }`;
const USER = `id email name role isActive lastLoginAt createdAt githubLinked`;

const BOOK_FIELDS = ['title', 'isbn', 'publishedYear', 'genre', 'description', 'replacementCostCents', 'authorId'];
const MEMBER_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'isActive'];

export const RESOURCES: Record<string, ResourceConfig> = {
  authors: {
    list: 'authors',
    one: 'author',
    filter: 'AuthorFilter',
    fields: AUTHOR,
    create: { mutation: 'createAuthor', input: 'CreateAuthorInput', writable: ['firstName', 'lastName', 'bio', 'birthYear', 'nationality'] },
    update: { mutation: 'updateAuthor', input: 'UpdateAuthorInput', writable: ['firstName', 'lastName', 'bio', 'birthYear', 'nationality'] },
    delete: 'deleteAuthor',
  },
  books: {
    list: 'books',
    one: 'book',
    filter: 'BookFilter',
    fields: BOOK,
    create: { mutation: 'createBook', input: 'CreateBookInput', writable: BOOK_FIELDS },
    update: { mutation: 'updateBook', input: 'UpdateBookInput', writable: BOOK_FIELDS },
    delete: 'deleteBook',
  },
  copies: {
    list: 'copies',
    one: 'copy',
    filter: 'CopyFilter',
    fields: COPY,
    update: { mutation: 'updateCopy', input: 'UpdateCopyInput', writable: ['condition', 'status'] },
    delete: 'deleteCopy',
  },
  members: {
    list: 'members',
    one: 'member',
    filter: 'MemberFilter',
    fields: MEMBER,
    create: { mutation: 'createMember', input: 'CreateMemberInput', writable: ['cardNumber', ...MEMBER_FIELDS] },
    update: { mutation: 'updateMember', input: 'UpdateMemberInput', writable: MEMBER_FIELDS },
    delete: 'deleteMember',
  },
  loans: { list: 'loans', one: 'loan', filter: 'LoanFilter', fields: LOAN },
  users: {
    list: 'users',
    one: 'user',
    filter: 'UserFilter',
    fields: USER,
    create: { mutation: 'createUser', input: 'CreateUserInput', writable: ['email', 'name', 'role', 'password', 'isActive'] },
    update: { mutation: 'updateUser', input: 'UpdateUserInput', writable: ['name', 'role', 'isActive', 'password'] },
    delete: 'deleteUser',
  },
};

function config(resource: string): ResourceConfig {
  const c = RESOURCES[resource];
  if (!c) throw new Error(`Unknown resource "${resource}"`);
  return c;
}

/** Drops empty filter values (react-admin sends "" for cleared inputs). */
function cleanFilter(filter: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== '' && v !== undefined && v !== null));
}

function pick(data: Record<string, any>, keys: string[], previous?: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (!(k in data)) continue;
    if (previous && JSON.stringify(previous[k]) === JSON.stringify(data[k])) continue; // only send changes
    out[k] = data[k] === '' ? null : data[k];
  }
  return out;
}

async function getList(resource: string, page: number, perPage: number, sortField: string | undefined, sortOrder: string | undefined, filter: Record<string, unknown>) {
  const c = config(resource);
  const data = await gql(
    `query($page: Int!, $perPage: Int!, $sortField: String, $sortOrder: SortOrder, $filter: ${c.filter}) {
       result: ${c.list}(page: $page, perPage: $perPage, sortField: $sortField, sortOrder: $sortOrder, filter: $filter) { total items { ${c.fields} } }
     }`,
    { page, perPage, sortField, sortOrder, filter: cleanFilter(filter) },
  );
  return { data: data.result.items, total: data.result.total };
}

/** Runs `mutation(<args>) { result: <call> { <fields> } }`. */
const run = async (call: string, args: string, vars: Record<string, unknown>, fields: string) =>
  (await gql(`mutation(${args}) { result: ${call} { ${fields} } }`, vars)).result;

export interface LibraryDataProvider extends DataProvider {
  checkout(input: { memberId: Identifier; bookId?: Identifier; barcode?: string; dueDate?: string }): Promise<RaRecord>;
  loanAction(action: 'returnLoan' | 'renewLoan' | 'markLoanLost' | 'settleFine' | 'waiveFine', id: Identifier): Promise<RaRecord>;
  bulkReturnLoans(ids: Identifier[]): Promise<BulkResult>;
  bulkSetCopyStatus(ids: Identifier[], status: 'AVAILABLE' | 'MAINTENANCE'): Promise<BulkResult>;
  bulkSetMemberActive(ids: Identifier[], isActive: boolean): Promise<BulkResult>;
  addCopies(bookId: Identifier, count: number, condition: string): Promise<RaRecord[]>;
  uploadCover(bookId: Identifier, file: File): Promise<{ coverUrl: string }>;
  removeCover(bookId: Identifier): Promise<void>;
  helpChatStatus(): Promise<{ enabled: boolean; model: string }>;
  askHelp(form: FormName | undefined, question: string, history: ChatTurn[]): Promise<{ answer: string }>;
}

export type FormName = 'book' | 'author' | 'member' | 'checkout' | 'copy' | 'user';
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface BulkResult {
  succeeded: number[];
  failed: { id: number; reason: string }[];
}
const BULK = 'succeeded failed { id reason }';

export const dataProvider: LibraryDataProvider = {
  getList: (resource, { pagination, sort, filter }) =>
    getList(resource, pagination?.page ?? 1, pagination?.perPage ?? 25, sort?.field, sort?.order, filter),

  async getOne(resource, { id }) {
    const c = config(resource);
    const data = await gql(`query($id: Int!) { result: ${c.one}(id: $id) { ${c.fields} } }`, { id: Number(id) });
    return { data: data.result };
  },

  async getMany(resource, { ids }) {
    const { data } = await getList(resource, 1, Math.max(ids.length, 1), undefined, undefined, { ids: ids.map(Number) });
    return { data };
  },

  getManyReference: (resource, { target, id, pagination, sort, filter }) =>
    getList(resource, pagination.page, pagination.perPage, sort.field, sort.order, { ...filter, [target]: Number(id) }),

  async create(resource, { data }) {
    if (resource === 'loans') return { data: await dataProvider.checkout(data as any) } as any;
    const c = config(resource);
    if (!c.create) throw new Error(`${resource} cannot be created here`);
    const result = await run(`${c.create.mutation}(input: $input)`, `$input: ${c.create.input}!`, { input: pick(data, c.create.writable) }, c.fields);
    return { data: result };
  },

  async update(resource, { id, data, previousData }) {
    const c = config(resource);
    if (!c.update) throw new Error(`${resource} cannot be edited`);
    const input = pick(data, c.update.writable, previousData);
    const result = await run(`${c.update.mutation}(id: $id, input: $input)`, `$id: Int!, $input: ${c.update.input}!`, { id: Number(id), input }, c.fields);
    return { data: result };
  },

  async updateMany(resource, { ids, data }) {
    for (const id of ids) await dataProvider.update(resource, { id, data, previousData: {} as any });
    return { data: ids };
  },

  async delete(resource, { id }) {
    const c = config(resource);
    if (!c.delete) throw new Error(`${resource} cannot be deleted`);
    return { data: await run(`${c.delete}(id: $id)`, '$id: Int!', { id: Number(id) }, 'id') };
  },

  async deleteMany(resource, { ids }) {
    for (const id of ids) await dataProvider.delete(resource, { id });
    return { data: ids };
  },

  // ---------------- custom actions ----------------

  checkout: (input) =>
    run('checkout(input: $input)', '$input: CheckoutInput!', {
      input: cleanFilter({
        memberId: Number(input.memberId),
        bookId: input.bookId ? Number(input.bookId) : undefined,
        barcode: input.barcode || undefined,
        dueDate: input.dueDate ? new Date(input.dueDate).toISOString() : undefined,
      }),
    }, LOAN),

  loanAction: (action, id) => run(`${action}(id: $id)`, '$id: Int!', { id: Number(id) }, LOAN),

  bulkReturnLoans: (ids) => run('bulkReturnLoans(input: $input)', '$input: LoanIdsInput!', { input: { ids: ids.map(Number) } }, BULK),

  bulkSetCopyStatus: (ids, status) =>
    run('bulkSetCopyStatus(input: $input)', '$input: BulkCopyStatusInput!', { input: { ids: ids.map(Number), status } }, BULK),

  bulkSetMemberActive: (ids, isActive) =>
    run('bulkSetMemberActive(input: $input)', '$input: BulkMemberActiveInput!', { input: { ids: ids.map(Number), isActive } }, BULK),

  addCopies: (bookId, count, condition) =>
    run('addCopies(input: $input)', '$input: AddCopiesInput!', { input: { bookId: Number(bookId), count, condition } }, COPY),

  async uploadCover(bookId, file) {
    const form = new FormData();
    form.append('file', file);
    return api(`/api/books/${bookId}/cover`, { method: 'POST', body: form });
  },

  async removeCover(bookId) {
    await api(`/api/books/${bookId}/cover`, { method: 'DELETE' });
  },

  async helpChatStatus() {
    return (await gql('{ helpChatStatus { enabled model } }')).helpChatStatus;
  },

  askHelp: (form, question, history) =>
    run('askHelp(input: $input)', '$input: AskHelpInput!', {
      input: { form, question, history: history.map((t) => ({ role: t.role.toUpperCase(), content: t.content })) },
    }, 'answer'),
};
