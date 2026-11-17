import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/LockOutlined';
import { Link, NotFound, Title } from 'react-admin';
import { useLocation } from 'react-router-dom';
import { useRole } from './components/common';

/**
 * The Staff screens are not registered for librarians, so opening one by URL
 * would otherwise show a generic "Not found". This explains the real reason.
 * (Book/author edit URLs already fall back to React-Admin's read-only list, and
 * the API enforces every rule on its own.)
 */
const ADMIN_ONLY: Array<{ pattern: RegExp; readOnly?: (m: RegExpMatchArray) => string }> = [{ pattern: /^\/users(\/|$)/ }];

export const CatchAll = () => {
  const role = useRole();
  const { pathname } = useLocation();
  const match = role === 'LIBRARIAN' ? ADMIN_ONLY.map((r) => ({ r, m: pathname.match(r.pattern) })).find((x) => x.m) : undefined;
  if (!match?.m) return <NotFound />;

  const readOnlyUrl = match.r.readOnly?.(match.m);
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
      <Title title="Access denied" />
      <Card sx={{ maxWidth: 520 }}>
        <CardContent sx={{ textAlign: 'center' }}>
          <LockIcon color="warning" sx={{ fontSize: 48 }} />
          <Typography variant="h6" gutterBottom>
            You don’t have permission to open this page
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your role is <b>Librarian</b>. Editing the catalogue and managing staff accounts are reserved for admins.
            {readOnlyUrl ? ' You can still view this record.' : ''}
          </Typography>
          {readOnlyUrl ? (
            <Button variant="contained" component={Link} to={readOnlyUrl}>
              View read-only
            </Button>
          ) : (
            <Button variant="contained" component={Link} to="/">
              Back to dashboard
            </Button>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
