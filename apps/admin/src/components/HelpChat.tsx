import { Alert, Box, Button, Chip, CircularProgress, Fab, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HelpIcon from '@mui/icons-material/HelpOutline';
import SendIcon from '@mui/icons-material/Send';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDataProvider } from 'react-admin';
import { useLocation } from 'react-router-dom';
import type { ChatTurn, FormName, LibraryDataProvider } from '../dataProvider';
import { useFormDefinitions } from '../formHelp';

const MAX_QUESTION = 500;

/** Which form the user is looking at, from the current admin route. */
export function formForPath(path: string): FormName | undefined {
  if (/^\/books\/\d+\/copies/.test(path) || path.startsWith('/copies')) return 'copy';
  if (path.startsWith('/loans')) return 'checkout';
  if (path.startsWith('/books')) return 'book';
  if (path.startsWith('/authors')) return 'author';
  if (path.startsWith('/members')) return 'member';
  if (path.startsWith('/users')) return 'user';
  return undefined;
}

/**
 * "How do I fill this out?" help chat, available on every admin page.
 * It knows which form is open and the server answers from that form's real
 * field definitions (help text + validation rules). If the AI provider is
 * down or not configured, the panel says so; nothing else is affected.
 */
export const HelpChat = () => {
  const dp = useDataProvider<LibraryDataProvider>();
  const { pathname } = useLocation();
  const form = formForPath(pathname);
  const forms = useFormDefinitions();
  const def = forms?.find((f) => f.name === form);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ enabled: boolean } | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !status) dp.helpChatStatus().then(setStatus).catch(() => setStatus({ enabled: false }));
  }, [open, status, dp]);

  // A new form is a new topic.
  useEffect(() => {
    setTurns([]);
    setError(null);
  }, [form]);

  useEffect(() => {
    // Block body on purpose: newer browsers return a Promise from scrollIntoView,
    // and React must not receive it as an effect cleanup.
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [turns, pending]);

  const suggestions = useMemo(() => {
    if (!def) return ['Which forms are there, and what are they for?', 'How do I lend a book to a member?'];
    const tricky = def.fields.filter((f) => f.rules.length || f.options).slice(0, 2);
    return [`How do I fill in the ${def.title} form?`, ...tricky.map((f) => `What does “${f.label}” mean?`)];
  }, [def]);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || pending) return;
    setError(null);
    setPending(text);
    setQuestion('');
    try {
      const { answer } = await dp.askHelp(form, text, turns.slice(-8));
      setTurns((t) => [...t, { role: 'user', content: text }, { role: 'assistant', content: answer }]);
    } catch (err: any) {
      setError(err?.message ?? 'The help assistant is unavailable right now.');
      setQuestion(text); // let them retry without retyping
    } finally {
      setPending(null);
    }
  };

  if (!open) {
    return (
      <Fab color="primary" variant="extended" onClick={() => setOpen(true)} sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: 1300 }}>
        <HelpIcon sx={{ mr: 1 }} /> Help
      </Fab>
    );
  }

  return (
    <Paper
      elevation={8}
      sx={{ position: 'fixed', right: 24, bottom: 24, width: 380, maxWidth: 'calc(100vw - 48px)', height: 520, maxHeight: 'calc(100vh - 100px)', zIndex: 1300, display: 'flex', flexDirection: 'column' }}
    >
      <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <HelpIcon color="primary" sx={{ mr: 1 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2">Form help</Typography>
          <Typography variant="caption" color="text.secondary">
            {def ? `${def.title} form` : 'All forms'}
          </Typography>
        </Box>
        <IconButton size="small" onClick={() => setOpen(false)} aria-label="Close help">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Stack spacing={1.5} sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
        {status && !status.enabled ? (
          <Alert severity="info">
            The help chat is turned off. An administrator can enable it by setting <code>AI_API_KEY</code> on the server (a free Groq key works).
          </Alert>
        ) : (
          <>
            {!turns.length && !pending && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Ask what a field means or how to fill in this form. Answers come from the form’s own field help and rules.
                </Typography>
                <Stack spacing={1} alignItems="flex-start">
                  {suggestions.map((s) => (
                    <Chip key={s} label={s} variant="outlined" onClick={() => ask(s)} sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }} />
                  ))}
                </Stack>
              </>
            )}
            {turns.map((t, i) => (
              <Bubble key={i} role={t.role} text={t.content} />
            ))}
            {pending && (
              <>
                <Bubble role="user" text={pending} />
                <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
                  <CircularProgress size={14} />
                  <Typography variant="body2">Thinking…</Typography>
                </Stack>
              </>
            )}
            {error && (
              <Alert severity="warning" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
          </>
        )}
        <div ref={endRef} />
      </Stack>

      {status?.enabled !== false && (
        <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth
            size="small"
            multiline
            maxRows={4}
            placeholder="Ask about a field…"
            value={question}
            disabled={!!pending}
            onChange={(e) => setQuestion(e.target.value.slice(0, MAX_QUESTION))}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter adds a line. Never submit a form underneath.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask(question);
              }
            }}
          />
          <Button type="button" variant="contained" disabled={!question.trim() || !!pending} onClick={() => ask(question)} aria-label="Send">
            <SendIcon fontSize="small" />
          </Button>
        </Stack>
      )}
    </Paper>
  );
};

const Bubble = ({ role, text }: { role: ChatTurn['role']; text: string }) => (
  <Paper
    variant="outlined"
    sx={{ p: 1.25, maxWidth: '90%', alignSelf: role === 'user' ? 'flex-end' : 'flex-start', borderColor: role === 'user' ? 'primary.light' : 'divider' }}
  >
    {/* Plain text (React escapes it); line breaks preserved. */}
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
      {text}
    </Typography>
  </Paper>
);
