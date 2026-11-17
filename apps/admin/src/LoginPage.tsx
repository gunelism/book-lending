import { Alert, Button, Divider, Stack } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import { useEffect, useState } from 'react';
import { Login, LoginForm } from 'react-admin';

const ERRORS: Record<string, string> = {
  pending_approval: 'Your GitHub account is registered but waiting for an admin to activate it.',
  oauth_state: 'The GitHub sign-in could not be verified. Please try again.',
  no_verified_email: 'Your GitHub account has no verified primary email address.',
  token_exchange_failed: 'GitHub sign-in failed. Please try again.',
  github_unavailable: 'GitHub could not be reached. Please try again later.',
};

/** Email/password login plus "Sign in with GitHub" when OAuth is configured. */
export const LoginPage = () => {
  const [github, setGithub] = useState(false);
  const error = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('error');

  useEffect(() => {
    fetch('/auth/providers', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((p) => setGithub(!!p.github))
      .catch(() => setGithub(false));
  }, []);

  return (
    <Login>
      <Stack sx={{ px: 2, pt: 1 }}>{error && <Alert severity="warning">{ERRORS[error] ?? 'Sign-in failed.'}</Alert>}</Stack>
      <LoginForm />
      {github && (
        <Stack sx={{ px: 2, pb: 2 }} spacing={1}>
          <Divider>or</Divider>
          <Button variant="outlined" startIcon={<GitHubIcon />} href="/auth/github" fullWidth>
            Sign in with GitHub
          </Button>
        </Stack>
      )}
    </Login>
  );
};
