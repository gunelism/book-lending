import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { Link, Title, useGetList } from 'react-admin';
import { useIsAdmin } from './components/common';

const useTotal = (resource: string, filter: Record<string, unknown> = {}) =>
  useGetList(resource, { pagination: { page: 1, perPage: 1 }, filter }).total;

const Stat = ({ label, value, to, color }: { label: string; value?: number; to: string; color?: string }) => (
  <Card sx={{ flex: '1 1 180px' }}>
    <CardContent component={Link} to={to} sx={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ fontSize: 34, fontWeight: 600, color }}>{value?.toLocaleString() ?? '…'}</Box>
    </CardContent>
  </Card>
);

const filterLink = (resource: string, filter: Record<string, unknown>) =>
  `/${resource}?filter=${encodeURIComponent(JSON.stringify(filter))}`;

export const Dashboard = () => {
  const isAdmin = useIsAdmin();
  const active = useTotal('loans', { status: 'ACTIVE' });
  const overdue = useTotal('loans', { status: 'OVERDUE' });
  const unpaid = useTotal('loans', { unpaidFine: true });
  const members = useTotal('members', { isActive: true });
  const blocked = useTotal('members', { hasOverdue: true });
  const books = useTotal('books');
  const unavailable = useTotal('books', { available: false });

  return (
    <Box sx={{ mt: 2 }}>
      <Title title="Library dashboard" />
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center">
        <Button variant="contained" startIcon={<AddIcon />} component={Link} to="/loans/create">
          New loan
        </Button>
        {!isAdmin && (
          <Alert severity="info" sx={{ flex: 1 }}>
            You are signed in as a <b>Librarian</b>: you can lend, return and renew books and manage members. Catalogue
            changes, deletions, staff accounts and most bulk actions are reserved for admins.
          </Alert>
        )}
      </Stack>
      <Stack direction="row" useFlexGap flexWrap="wrap" spacing={2}>
        <Stat label="Active loans (on time)" value={active} to={filterLink('loans', { status: 'ACTIVE' })} />
        <Stat label="Overdue loans" value={overdue} to={filterLink('loans', { status: 'OVERDUE' })} color="#c62828" />
        <Stat label="Loans with unpaid fines" value={unpaid} to={filterLink('loans', { unpaidFine: true })} color="#ef6c00" />
        <Stat label="Active members" value={members} to={filterLink('members', { isActive: true })} />
        <Stat label="Members blocked by overdue loans" value={blocked} to={filterLink('members', { hasOverdue: true })} color="#c62828" />
        <Stat label="Books in catalogue" value={books} to="/books" />
        <Stat label="Books with no copy on the shelf" value={unavailable} to={filterLink('books', { available: false })} />
      </Stack>
    </Box>
  );
};
