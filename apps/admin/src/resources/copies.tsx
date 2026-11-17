import { Button } from '@mui/material';
import BuildIcon from '@mui/icons-material/Build';
import ShelvesIcon from '@mui/icons-material/LibraryBooks';
import { useState } from 'react';
import {
  AutocompleteInput,
  Datagrid,
  DateField,
  FunctionField,
  Link,
  List,
  ReferenceField,
  ReferenceInput,
  SearchInput,
  SelectField,
  SelectInput,
  TextField,
  useDataProvider,
  useListContext,
  useRefresh,
  useUnselectAll,
} from 'react-admin';
import { CONDITIONS, COPY_STATUSES, StatusField, useBulkNotify, useIsAdmin } from '../components/common';
import type { LibraryDataProvider } from '../dataProvider';

const copyFilters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Barcode or title" />,
  <SelectInput key="status" source="status" choices={COPY_STATUSES} alwaysOn emptyText="Any status" />,
  <SelectInput key="condition" source="condition" choices={CONDITIONS} emptyText="Any condition" />,
  <ReferenceInput key="bookId" source="bookId" reference="books">
    <AutocompleteInput label="Book" filterToQuery={(q: string) => ({ q })} />
  </ReferenceInput>,
];

/** Custom bulk action (admins): send copies to maintenance or put them back on the shelf. Copies on loan are skipped. */
const BulkStatusButton = ({ status }: { status: 'AVAILABLE' | 'MAINTENANCE' }) => {
  const { selectedIds } = useListContext();
  const dp = useDataProvider<LibraryDataProvider>();
  const unselectAll = useUnselectAll('copies');
  const refresh = useRefresh();
  const bulkNotify = useBulkNotify();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="small"
      startIcon={status === 'MAINTENANCE' ? <BuildIcon /> : <ShelvesIcon />}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          bulkNotify(await dp.bulkSetCopyStatus(selectedIds, status), status === 'MAINTENANCE' ? 'sent to maintenance' : 'back on the shelf');
          unselectAll();
          refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {status === 'MAINTENANCE' ? 'Send to maintenance' : 'Back on shelf'}
    </Button>
  );
};

export const CopyList = () => {
  const isAdmin = useIsAdmin();
  return (
    <List filters={copyFilters} sort={{ field: 'id', order: 'DESC' }} perPage={25}>
      <Datagrid
        bulkActionButtons={isAdmin ? (
          <>
            <BulkStatusButton status="MAINTENANCE" />
            <BulkStatusButton status="AVAILABLE" />
          </>
        ) : false}
        rowClick={false}
      >
        <TextField source="barcode" sx={{ fontFamily: 'monospace' }} />
        <ReferenceField source="bookId" reference="books" sortBy="book.title" link={isAdmin ? 'edit' : 'show'} />
        <SelectField source="condition" choices={CONDITIONS} />
        <StatusField source="status" label="Status" />
        <FunctionField
          label="Current loan"
          render={(r: any) =>
            r.currentLoan ? (
              <Link to={`/loans/${r.currentLoan.id}/show`}>
                {r.currentLoan.member?.fullName} · due {new Date(r.currentLoan.dueDate).toLocaleDateString()}
              </Link>
            ) : (
              '—'
            )
          }
        />
        <DateField source="acquiredAt" label="Acquired" />
      </Datagrid>
    </List>
  );
};
