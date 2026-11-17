import { Alert, Button, Typography } from '@mui/material';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import {
  AutocompleteInput,
  Create,
  Datagrid,
  DateField,
  DateInput,
  DateTimeInput,
  FunctionField,
  List,
  NullableBooleanInput,
  NumberField,
  ReferenceField,
  ReferenceInput,
  SearchInput,
  SelectInput,
  Show,
  SimpleForm,
  SimpleShowLayout,
  TextField,
  TextInput,
  TopToolbar,
  useDataProvider,
  useGetOne,
  useListContext,
  useRefresh,
  useUnselectAll,
} from 'react-admin';
import { useWatch } from 'react-hook-form';
import { useState } from 'react';
import { euros, LOAN_STATUSES, MoneyField, StatusField, useBulkNotify } from '../components/common';
import { LoanActions } from '../components/LoanActions';
import type { LibraryDataProvider } from '../dataProvider';
import { useFieldHelp } from '../formHelp';

const loanFilters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Member, card, title or barcode" />,
  <SelectInput key="status" source="status" choices={LOAN_STATUSES} alwaysOn emptyText="Any status" />,
  <ReferenceInput key="memberId" source="memberId" reference="members">
    <AutocompleteInput label="Member" filterToQuery={(q: string) => ({ q })} />
  </ReferenceInput>,
  <ReferenceInput key="bookId" source="bookId" reference="books">
    <AutocompleteInput label="Book" filterToQuery={(q: string) => ({ q })} />
  </ReferenceInput>,
  <NullableBooleanInput key="unpaidFine" source="unpaidFine" label="Unpaid fine" />,
  <DateInput key="loanedFrom" source="loanedFrom" label="Loaned from" />,
  <DateInput key="loanedTo" source="loanedTo" label="Loaned until" />,
];

/** Custom bulk action: mark every selected loan as returned (fines are calculated per loan). */
const BulkReturnButton = () => {
  const { selectedIds } = useListContext();
  const dp = useDataProvider<LibraryDataProvider>();
  const unselectAll = useUnselectAll('loans');
  const refresh = useRefresh();
  const bulkNotify = useBulkNotify();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="small"
      startIcon={<AssignmentReturnIcon />}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          bulkNotify(await dp.bulkReturnLoans(selectedIds), 'loan(s) returned');
          unselectAll();
          refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      Mark returned
    </Button>
  );
};

const renderDue = (r: any) => (
      <span style={{ color: r.isOverdue ? '#c62828' : undefined, fontWeight: r.isOverdue ? 600 : undefined }}>
        {new Date(r.dueDate).toLocaleDateString()}
        {r.isOverdue ? ` (${r.daysOverdue}d late)` : ''}
      </span>
);

export const LoanList = () => (
  <List filters={loanFilters} sort={{ field: 'loanedAt', order: 'DESC' }} perPage={25} filterDefaultValues={{ status: 'ACTIVE' }}>
    <Datagrid rowClick="show" bulkActionButtons={<BulkReturnButton />}>
      <NumberField source="id" />
      <ReferenceField source="book.id" reference="books" label="Book" link="show" sortable={false}>
        <TextField source="title" />
      </ReferenceField>
      <TextField source="copy.barcode" label="Copy" />
      <ReferenceField source="memberId" reference="members" label="Member" link="edit" sortBy="member.lastName" />
      <DateField source="loanedAt" label="Loaned" />
      <FunctionField label="Due" sortBy="dueDate" render={renderDue} />
      <StatusField source="displayStatus" label="Status" sortBy="status" />
      <FunctionField
        label="Fine"
        sortBy="fineCents"
        render={(r: any) => (r.accruedFineCents ? `${euros(r.accruedFineCents)}${r.status !== 'ACTIVE' && !r.finePaid ? ' (unpaid)' : ''}` : '')}
      />
      <LoanActions compact />
    </Datagrid>
  </List>
);

const LoanShowActions = () => (
  <TopToolbar>
    <LoanActions />
  </TopToolbar>
);

export const LoanShow = () => (
  <Show actions={<LoanShowActions />}>
    <SimpleShowLayout>
      <NumberField source="id" />
      <StatusField source="displayStatus" label="Status" />
      <ReferenceField source="book.id" reference="books" label="Book" link="show" />
      <TextField source="copy.barcode" label="Copy barcode" />
      <ReferenceField source="memberId" reference="members" label="Member" link="edit" />
      <DateField source="loanedAt" showTime />
      <DateField source="dueDate" showTime />
      <DateField source="returnedAt" showTime emptyText="—" />
      <NumberField source="renewCount" label="Renewals" />
      <NumberField source="daysOverdue" label="Days late" />
      <MoneyField source="accruedFineCents" label="Fine" />
      <FunctionField label="Fine status" render={(r: any) => (r.fineCents === 0 ? '—' : r.finePaid ? 'Paid' : 'Outstanding')} />
      <TextField source="renewBlockReason" label="Renewal" emptyText="Can be renewed" />
    </SimpleShowLayout>
  </Show>
);

/** Live eligibility check: shows why the selected member can't borrow before you submit. */
const MemberStanding = () => {
  const memberId = useWatch({ name: 'memberId' });
  const { data: member } = useGetOne('members', { id: memberId }, { enabled: !!memberId });
  if (!member) return null;
  return member.borrowBlockReason ? (
    <Alert severity="error" sx={{ mb: 2, width: '100%' }}>
      {member.fullName} cannot borrow: {member.borrowBlockReason}
    </Alert>
  ) : (
    <Alert severity="success" sx={{ mb: 2, width: '100%' }}>
      {member.fullName} can borrow ({member.activeLoanCount} active loan{member.activeLoanCount === 1 ? '' : 's'}
      {member.unpaidFinesCents ? `, owes ${euros(member.unpaidFinesCents)}` : ''}).
    </Alert>
  );
};

export const LoanCreate = () => {
  const help = useFieldHelp('checkout');
  return (
  <Create title="New loan (checkout)" redirect="show">
    <SimpleForm>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose a member, then either a book (any available copy is picked) or scan a specific copy's barcode.
      </Typography>
      <ReferenceInput source="memberId" reference="members" filter={{ isActive: true }}>
        <AutocompleteInput label="Member" filterToQuery={(q: string) => ({ q })} isRequired fullWidth helperText={help('memberId')} />
      </ReferenceInput>
      <MemberStanding />
      <ReferenceInput source="bookId" reference="books" filter={{ available: true }}>
        <AutocompleteInput label="Book (available copies only)" filterToQuery={(q: string) => ({ q })} fullWidth helperText={help('bookId')} />
      </ReferenceInput>
      <TextInput source="barcode" label="…or copy barcode" helperText={help('barcode')} fullWidth />
      <DateTimeInput source="dueDate" label="Due date (optional)" helperText={help('dueDate')} />
    </SimpleForm>
  </Create>
  );
};
