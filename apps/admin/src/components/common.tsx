import { Chip, Tooltip } from '@mui/material';
import type { ChipProps } from '@mui/material';
import LockIcon from '@mui/icons-material/LockOutlined';
import { FunctionField, useNotify, usePermissions, useRecordContext } from 'react-admin';
import type { Role } from '../authProvider';
import type { BulkResult } from '../dataProvider';

export function useRole(): Role | undefined {
  return usePermissions<Role>().permissions;
}

export function useIsAdmin(): boolean {
  return useRole() === 'ADMIN';
}

export const euros = (cents: number | null | undefined) =>
  cents == null ? '' : new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);

/** Displays an integer cents field as euros. */
export const MoneyField = ({ source, label, sortable }: { source: string; label?: string; sortable?: boolean }) => (
  <FunctionField source={source} label={label} sortable={sortable} render={(r: any) => euros(r?.[source])} />
);

const STATUS_COLORS: Record<string, ChipProps['color']> = {
  ACTIVE: 'info',
  OVERDUE: 'error',
  RETURNED: 'success',
  LOST: 'default',
  AVAILABLE: 'success',
  ON_LOAN: 'info',
  MAINTENANCE: 'warning',
};

export const StatusChip = ({ value }: { value?: string }) =>
  value ? <Chip size="small" label={value.replace('_', ' ')} color={STATUS_COLORS[value] ?? 'default'} variant={value === 'LOST' ? 'outlined' : 'filled'} /> : null;

export const StatusField = ({ source, label, sortBy }: { source: string; label?: string; sortBy?: string }) => (
  <FunctionField source={source} label={label} sortBy={sortBy} render={(r: any) => <StatusChip value={r?.[source]} />} />
);

/** Shown on screens a librarian can open but not change. */
export const ReadOnlyBadge = () => {
  const isAdmin = useIsAdmin();
  if (isAdmin) return null;
  return (
    <Tooltip title="Your role (Librarian) can view this record but not change it. Ask an admin for edits.">
      <Chip icon={<LockIcon />} label="Read-only for librarians" size="small" variant="outlined" sx={{ ml: 1 }} />
    </Tooltip>
  );
};

/** Shows a bulk-action result: how many worked, and the first few failure reasons. */
export function useBulkNotify() {
  const notify = useNotify();
  return (result: BulkResult, verb: string) => {
    const ok = result.succeeded.length;
    const bad = result.failed.length;
    if (!bad) return notify(`${ok} ${verb}`, { type: 'success' });
    const reasons = result.failed.slice(0, 3).map((f) => `#${f.id}: ${f.reason}`).join(' · ');
    notify(`${ok} ${verb}, ${bad} skipped — ${reasons}${bad > 3 ? ' …' : ''}`, { type: ok ? 'warning' : 'error', autoHideDuration: 10000 });
  };
}

export const CoverThumb = ({ size = 40 }: { size?: number }) => {
  const record = useRecordContext<any>();
  if (!record) return null;
  return record.coverUrl ? (
    <img src={record.coverUrl} alt="" loading="lazy" style={{ width: size, height: size * 1.5, objectFit: 'cover', borderRadius: 2, display: 'block' }} />
  ) : (
    <div style={{ width: size, height: size * 1.5, background: '#e0e0e0', borderRadius: 2 }} />
  );
};

export const GENRES = [
  'FICTION', 'NON_FICTION', 'MYSTERY', 'SCIENCE_FICTION', 'FANTASY', 'ROMANCE', 'THRILLER', 'BIOGRAPHY', 'HISTORY', 'SCIENCE', 'CHILDREN', 'POETRY',
].map((id) => ({ id, name: id.charAt(0) + id.slice(1).toLowerCase().replace('_', ' ') }));

export const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR'].map((id) => ({ id, name: id.charAt(0) + id.slice(1).toLowerCase() }));
export const COPY_STATUSES = ['AVAILABLE', 'ON_LOAN', 'MAINTENANCE', 'LOST'].map((id) => ({ id, name: id.replace('_', ' ').toLowerCase() }));
export const LOAN_STATUSES = ['ACTIVE', 'OVERDUE', 'RETURNED', 'LOST'].map((id) => ({ id, name: id.charAt(0) + id.slice(1).toLowerCase() }));
