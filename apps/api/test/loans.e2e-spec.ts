import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BookCopy, CopyStatus, Loan, LoanStatus } from '../src/entities';
import { addDays, LOAN_POLICY } from '../src/loans/loan-policy';
import { Client, createApp, errorCode, LIBRARIAN, login, makeBook, makeMember, resetDatabase } from './helpers';

const CHECKOUT = `mutation($input: CheckoutInput!) { checkout(input: $input) { id status dueDate copy { id status } } }`;
const RETURN = `mutation($id: Int!) { returnLoan(id: $id) { id status fineCents finePaid copy { status } } }`;
const RENEW = `mutation($id: Int!) { renewLoan(id: $id) { id dueDate renewCount } }`;

/** The lending workflow end to end, through GraphQL, as a librarian. */
describe('Loans (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let staff: Client;

  beforeAll(async () => {
    ({ app, ds } = await createApp());
    await resetDatabase(ds);
    staff = await login(app, LIBRARIAN);
  });

  afterAll(() => app.close());

  it('lends an available copy for the standard period and takes it off the shelf', async () => {
    const member = await makeMember(ds);
    const { book } = await makeBook(ds, 1);

    const res = await staff.gql(CHECKOUT, { input: { memberId: member.id, bookId: book.id } });

    expect(res.errors).toBeUndefined();
    expect(res.data.checkout.status).toBe('ACTIVE');
    expect(res.data.checkout.copy.status).toBe('ON_LOAN');
    const days = (new Date(res.data.checkout.dueDate).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeCloseTo(LOAN_POLICY.loanDays, 0);
  });

  it('refuses a member who has an overdue loan', async () => {
    const member = await makeMember(ds);
    const { copies } = await makeBook(ds, 1);
    await ds.getRepository(BookCopy).update(copies[0].id, { status: CopyStatus.ON_LOAN });
    await ds.getRepository(Loan).save({
      copy: copies[0],
      member,
      loanedAt: addDays(new Date(), -30),
      dueDate: addDays(new Date(), -16),
      status: LoanStatus.ACTIVE,
    });
    const { book } = await makeBook(ds, 1);

    const res = await staff.gql(CHECKOUT, { input: { memberId: member.id, bookId: book.id } });

    expect(errorCode(res)).toBe('HAS_OVERDUE_LOANS');
  });

  it(`refuses a ${LOAN_POLICY.maxActiveLoans + 1}th active loan`, async () => {
    const member = await makeMember(ds);
    for (let i = 0; i < LOAN_POLICY.maxActiveLoans; i++) {
      const { book } = await makeBook(ds, 1);
      const ok = await staff.gql(CHECKOUT, { input: { memberId: member.id, bookId: book.id } });
      expect(ok.errors).toBeUndefined();
    }
    const { book } = await makeBook(ds, 1);

    const res = await staff.gql(CHECKOUT, { input: { memberId: member.id, bookId: book.id } });

    expect(errorCode(res)).toBe('LOAN_LIMIT_REACHED');
  });

  it('never lends the last copy twice, even to simultaneous requests', async () => {
    const [a, b] = [await makeMember(ds), await makeMember(ds)];
    const { book } = await makeBook(ds, 1);

    const results = await Promise.all([
      staff.gql(CHECKOUT, { input: { memberId: a.id, bookId: book.id } }),
      staff.gql(CHECKOUT, { input: { memberId: b.id, bookId: book.id } }),
    ]);

    expect(results.filter((r) => !r.errors)).toHaveLength(1);
    expect(results.map(errorCode).filter(Boolean)).toEqual(['NO_COPY_AVAILABLE']);
  });

  it('charges a capped late fee on an overdue return and puts the copy back', async () => {
    const member = await makeMember(ds);
    const { copies } = await makeBook(ds, 1);
    await ds.getRepository(BookCopy).update(copies[0].id, { status: CopyStatus.ON_LOAN });
    const loan = await ds.getRepository(Loan).save({
      copy: copies[0],
      member,
      loanedAt: addDays(new Date(), -400),
      dueDate: addDays(new Date(), -386), // ~386 days late → fine hits the cap
      status: LoanStatus.ACTIVE,
    });

    const res = await staff.gql(RETURN, { id: loan.id });

    expect(res.errors).toBeUndefined();
    expect(res.data.returnLoan).toMatchObject({
      status: 'RETURNED',
      fineCents: LOAN_POLICY.maxLateFineCents,
      finePaid: false,
      copy: { status: 'AVAILABLE' },
    });
    // A returned loan cannot be returned again.
    expect(errorCode(await staff.gql(RETURN, { id: loan.id }))).toBe('LOAN_NOT_ACTIVE');
  });

  it(`allows ${LOAN_POLICY.maxRenewals} renewals, then refuses`, async () => {
    const member = await makeMember(ds);
    const { book } = await makeBook(ds, 1);
    const checkout = await staff.gql(CHECKOUT, { input: { memberId: member.id, bookId: book.id } });
    const id = checkout.data.checkout.id;

    for (let i = 1; i <= LOAN_POLICY.maxRenewals; i++) {
      const res = await staff.gql(RENEW, { id });
      expect(res.data.renewLoan.renewCount).toBe(i);
    }
    expect(errorCode(await staff.gql(RENEW, { id }))).toBe('RENEWAL_LIMIT');
  });
});
