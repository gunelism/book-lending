import { Button, Chip, Typography } from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/CheckCircleOutline';
import { useState } from 'react';
import {
  BooleanField,
  BooleanInput,
  Create,
  Datagrid,
  DateField,
  DeleteButton,
  Edit,
  EmailField,
  FunctionField,
  List,
  NullableBooleanInput,
  NumberField,
  Pagination,
  ReferenceField,
  ReferenceManyField,
  required,
  SaveButton,
  SearchInput,
  SimpleForm,
  TabbedForm,
  TextField,
  TextInput,
  Toolbar,
  email,
  useDataProvider,
  useListContext,
  useRecordContext,
  useRefresh,
  useUnselectAll,
} from 'react-admin';
import { euros, MoneyField, StatusField, useBulkNotify, useIsAdmin } from '../components/common';
import { LoanActions } from '../components/LoanActions';
import { useFieldHelp } from '../formHelp';
import type { LibraryDataProvider } from '../dataProvider';

const memberFilters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Name, email or card" />,
  <NullableBooleanInput key="isActive" source="isActive" label="Active" />,
  <NullableBooleanInput key="hasOverdue" source="hasOverdue" label="Has overdue loans" />,
  <NullableBooleanInput key="hasUnpaidFines" source="hasUnpaidFines" label="Has unpaid fines" />,
];

/** Custom bulk action (admins only): activate or deactivate the selected members. */
const BulkActiveButton = ({ isActive }: { isActive: boolean }) => {
  const { selectedIds } = useListContext();
  const dp = useDataProvider<LibraryDataProvider>();
  const unselectAll = useUnselectAll('members');
  const refresh = useRefresh();
  const bulkNotify = useBulkNotify();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="small"
      color={isActive ? 'primary' : 'warning'}
      startIcon={isActive ? <CheckIcon /> : <BlockIcon />}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          bulkNotify(await dp.bulkSetMemberActive(selectedIds, isActive), isActive ? 'member(s) activated' : 'member(s) deactivated');
          unselectAll();
          refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {isActive ? 'Activate' : 'Deactivate'}
    </Button>
  );
};

const MemberBulkActions = () => (
  <>
    <BulkActiveButton isActive />
    <BulkActiveButton isActive={false} />
  </>
);

export const MemberList = () => {
  const isAdmin = useIsAdmin();
  return (
    <List filters={memberFilters} sort={{ field: 'lastName', order: 'ASC' }} perPage={25}>
      {/* Librarians get no checkboxes at all: bulk actions are admin-only. */}
      <Datagrid rowClick="edit" bulkActionButtons={isAdmin ? <MemberBulkActions /> : false}>
        <TextField source="cardNumber" label="Card" />
        <TextField source="fullName" label="Name" sortBy="lastName" />
        <EmailField source="email" />
        <NumberField source="activeLoanCount" label="Active loans" sortable={false} />
        <FunctionField
          label="Overdue"
          render={(r: any) => (r.overdueLoanCount ? <Chip size="small" color="error" label={r.overdueLoanCount} /> : '—')}
        />
        <FunctionField label="Unpaid fines" render={(r: any) => (r.unpaidFinesCents ? euros(r.unpaidFinesCents) : '—')} />
        <BooleanField source="isActive" label="Active" />
        <DateField source="joinedAt" label="Joined" />
      </Datagrid>
    </List>
  );
};

const MemberEditToolbar = () => {
  const isAdmin = useIsAdmin();
  return (
    <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
      <SaveButton />
      {isAdmin && <DeleteButton mutationMode="pessimistic" />}
    </Toolbar>
  );
};

const MemberTitle = () => {
  const record = useRecordContext<any>();
  return <span>Member {record ? `${record.fullName} (${record.cardNumber})` : ''}</span>;
};

/** Member edit with the member's loans inline, each with its own status-transition buttons. */
export const MemberEdit = () => (
  <Edit title={<MemberTitle />} mutationMode="pessimistic">
    <TabbedForm toolbar={<MemberEditToolbar />}>
      <TabbedForm.Tab label="Details">
        <FunctionField
          render={(r: any) =>
            r.borrowBlockReason ? (
              <Typography color="error">Cannot borrow: {r.borrowBlockReason}</Typography>
            ) : (
              <Typography color="success.main">In good standing — can borrow.</Typography>
            )
          }
        />
        <TextField source="cardNumber" label="Card number" />
        <MemberFields />
      </TabbedForm.Tab>
      <TabbedForm.Tab label="Loans" path="loans">
        <ReferenceManyField
          reference="loans"
          target="memberId"
          label={false}
          sort={{ field: 'loanedAt', order: 'DESC' }}
          perPage={10}
          pagination={<Pagination rowsPerPageOptions={[10, 25, 50]} />}
        >
          <Datagrid bulkActionButtons={false} rowClick="show">
            <ReferenceField source="book.id" reference="books" label="Book" link={false} sortable={false} />
            <TextField source="copy.barcode" label="Copy" sortable={false} />
            <DateField source="loanedAt" label="Loaned" />
            <DateField source="dueDate" label="Due" />
            <DateField source="returnedAt" label="Returned" emptyText="—" />
            <StatusField source="displayStatus" label="Status" sortBy="status" />
            <MoneyField source="accruedFineCents" label="Fine" sortable={false} />
            <FunctionField label="Paid" render={(r: any) => (r.fineCents ? (r.finePaid ? 'yes' : 'no') : '')} />
            <LoanActions compact />
          </Datagrid>
        </ReferenceManyField>
      </TabbedForm.Tab>
    </TabbedForm>
  </Edit>
);

/** Helper texts come from the API's field definitions — the same ones the Help chat answers from. */
const MemberFields = ({ create = false }: { create?: boolean }) => {
  const help = useFieldHelp('member');
  return (
    <>
      <TextInput source="firstName" validate={required()} helperText={help('firstName')} />
      <TextInput source="lastName" validate={required()} helperText={help('lastName')} />
      <TextInput source="email" validate={[required(), email()]} helperText={help('email')} fullWidth />
      <TextInput source="phone" helperText={help('phone')} />
      {create && <TextInput source="cardNumber" label="Card number" helperText={help('cardNumber')} fullWidth />}
      <BooleanInput source="isActive" label="Active" defaultValue={create ? true : undefined} helperText={help('isActive')} />
    </>
  );
};

export const MemberCreate = () => (
  <Create redirect="edit">
    <SimpleForm>
      <MemberFields create />
    </SimpleForm>
  </Create>
);
