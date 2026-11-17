export enum Role {
  ADMIN = 'ADMIN',
  LIBRARIAN = 'LIBRARIAN',
}

export enum Genre {
  FICTION = 'FICTION',
  NON_FICTION = 'NON_FICTION',
  MYSTERY = 'MYSTERY',
  SCIENCE_FICTION = 'SCIENCE_FICTION',
  FANTASY = 'FANTASY',
  ROMANCE = 'ROMANCE',
  THRILLER = 'THRILLER',
  BIOGRAPHY = 'BIOGRAPHY',
  HISTORY = 'HISTORY',
  SCIENCE = 'SCIENCE',
  CHILDREN = 'CHILDREN',
  POETRY = 'POETRY',
}

export enum CopyStatus {
  AVAILABLE = 'AVAILABLE',
  ON_LOAN = 'ON_LOAN',
  LOST = 'LOST',
  MAINTENANCE = 'MAINTENANCE',
}

export enum CopyCondition {
  NEW = 'NEW',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
}

/**
 * Stored loan states. "Overdue" is deliberately NOT stored: it is derived from
 * status = ACTIVE and dueDate < now(), so it can never go stale.
 */
export enum LoanStatus {
  ACTIVE = 'ACTIVE',
  RETURNED = 'RETURNED',
  LOST = 'LOST',
}

/** What the admin shows: the stored status plus the computed OVERDUE state. */
export enum LoanDisplayStatus {
  ACTIVE = 'ACTIVE',
  OVERDUE = 'OVERDUE',
  RETURNED = 'RETURNED',
  LOST = 'LOST',
}

// ---- expose the enums in the GraphQL schema ----
import { registerEnumType } from '@nestjs/graphql';

registerEnumType(Role, { name: 'Role' });
registerEnumType(Genre, { name: 'Genre' });
registerEnumType(CopyStatus, { name: 'CopyStatus' });
registerEnumType(CopyCondition, { name: 'CopyCondition' });
registerEnumType(LoanStatus, { name: 'LoanStatus', description: 'Stored loan state' });
registerEnumType(LoanDisplayStatus, { name: 'LoanDisplayStatus', description: 'Stored state plus computed OVERDUE' });
