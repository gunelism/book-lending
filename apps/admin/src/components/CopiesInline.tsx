import {
  Button,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { useState } from 'react';
import { Link, useDataProvider, useGetManyReference, useNotify, useRecordContext, useRefresh } from 'react-admin';
import type { LibraryDataProvider } from '../dataProvider';
import { CONDITIONS, StatusChip } from './common';

const MANUAL_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'LOST'];

/**
 * Inline editor for a book's physical copies (the related model), embedded in
 * the Book edit page: change condition/status in place, add copies, delete
 * copies that were never lent. When `readOnly` (librarians) it is a plain table.
 */
export const CopiesInline = ({ readOnly = false }: { readOnly?: boolean }) => {
  const book = useRecordContext<any>();
  const dp = useDataProvider<LibraryDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [count, setCount] = useState(1);
  const [condition, setCondition] = useState('NEW');
  const [busy, setBusy] = useState(false);

  const { data: copies = [], isPending, refetch } = useGetManyReference(
    'copies',
    { target: 'bookId', id: book?.id, pagination: { page: 1, perPage: 100 }, sort: { field: 'id', order: 'ASC' } },
    { enabled: !!book?.id },
  );
  if (!book) return null;

  const wrap = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      notify(ok, { type: 'success' });
      await refetch();
      refresh(); // updates the availability counts on the book
    } catch (err: any) {
      notify(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const update = (copy: any, data: Record<string, string>) =>
    wrap(() => dp.update('copies', { id: copy.id, data, previousData: copy }), `Copy ${copy.barcode} updated`);

  return (
    <Stack spacing={2} sx={{ width: '100%' }}>
      <Typography variant="subtitle1">
        Copies ({copies.length}) · {copies.filter((c: any) => c.status === 'AVAILABLE').length} on the shelf
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Barcode</TableCell>
            <TableCell>Condition</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Currently with</TableCell>
            {!readOnly && <TableCell />}
          </TableRow>
        </TableHead>
        <TableBody>
          {isPending && (
            <TableRow>
              <TableCell colSpan={5}>Loading…</TableCell>
            </TableRow>
          )}
          {copies.map((copy: any) => (
            <TableRow key={copy.id}>
              <TableCell sx={{ fontFamily: 'monospace' }}>{copy.barcode}</TableCell>
              <TableCell>
                {readOnly ? (
                  copy.condition
                ) : (
                  <Select size="small" value={copy.condition} disabled={busy} onChange={(e) => update(copy, { condition: e.target.value })}>
                    {CONDITIONS.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                )}
              </TableCell>
              <TableCell>
                {readOnly || copy.status === 'ON_LOAN' ? (
                  <Tooltip title={copy.status === 'ON_LOAN' && !readOnly ? 'Return the loan to change this copy’s status' : ''}>
                    <span>
                      <StatusChip value={copy.status} />
                    </span>
                  </Tooltip>
                ) : (
                  <Select size="small" value={copy.status} disabled={busy} onChange={(e) => update(copy, { status: e.target.value })}>
                    {MANUAL_STATUSES.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s.toLowerCase()}
                      </MenuItem>
                    ))}
                  </Select>
                )}
              </TableCell>
              <TableCell>
                {copy.currentLoan ? (
                  <Link to={`/loans/${copy.currentLoan.id}/show`}>
                    {copy.currentLoan.member?.fullName} · due {new Date(copy.currentLoan.dueDate).toLocaleDateString()}
                  </Link>
                ) : (
                  '—'
                )}
              </TableCell>
              {!readOnly && (
                <TableCell align="right">
                  <Tooltip title="Delete copy (only copies that were never lent)">
                    <span>
                      <IconButton
                        size="small"
                        disabled={busy}
                        onClick={() =>
                          window.confirm(`Delete copy ${copy.barcode}?`) &&
                          wrap(() => dp.delete('copies', { id: copy.id, previousData: copy }), `Copy ${copy.barcode} deleted`)
                        }
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!readOnly && (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            type="number"
            label="Add copies"
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            sx={{ width: 120 }}
            slotProps={{ htmlInput: { min: 1, max: 50 } }}
          />
          <Select size="small" value={condition} onChange={(e) => setCondition(e.target.value)}>
            {CONDITIONS.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            disabled={busy}
            onClick={() => wrap(() => dp.addCopies(book.id, count, condition), `${count} copy(ies) added`)}
          >
            Add
          </Button>
        </Stack>
      )}
    </Stack>
  );
};
