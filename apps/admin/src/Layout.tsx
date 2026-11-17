import { Chip } from '@mui/material';
import type { ReactNode } from 'react';
import { AppBar, Layout as RaLayout, TitlePortal } from 'react-admin';
import { useRole } from './components/common';

/** Always shows which role you're signed in with, so the restricted view is never a surprise. */
const RoleChip = () => {
  const role = useRole();
  if (!role) return null;
  return (
    <Chip
      size="small"
      label={role === 'ADMIN' ? 'Admin' : 'Librarian'}
      color={role === 'ADMIN' ? 'warning' : 'default'}
      sx={{ mr: 1, bgcolor: role === 'ADMIN' ? undefined : 'rgba(255,255,255,0.85)' }}
    />
  );
};

const LibraryAppBar = () => (
  <AppBar>
    <TitlePortal />
    <RoleChip />
  </AppBar>
);

export const Layout = ({ children }: { children: ReactNode }) => <RaLayout appBar={LibraryAppBar}>{children}</RaLayout>;
