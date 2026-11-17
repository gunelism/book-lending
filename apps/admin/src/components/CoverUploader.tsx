import { Box, Button, Stack, Typography } from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import { useRef, useState } from 'react';
import { useDataProvider, useNotify, useRecordContext, useRefresh } from 'react-admin';
import type { LibraryDataProvider } from '../dataProvider';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Cover upload. The browser checks type and size first for quick feedback,
 * but the server re-checks everything (real image bytes, size, dimensions)
 * and re-encodes the image before storing it in object storage.
 */
export const CoverUploader = () => {
  const book = useRecordContext<any>();
  const dp = useDataProvider<LibraryDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!book) return null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) return notify('Please choose a JPEG, PNG or WebP image.', { type: 'error' });
    if (file.size > MAX_BYTES) return notify('Cover images must be 2 MB or smaller.', { type: 'error' });
    setBusy(true);
    try {
      await dp.uploadCover(book.id, file);
      notify('Cover updated', { type: 'success' });
      refresh();
    } catch (err: any) {
      notify(err.message, { type: 'error' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await dp.removeCover(book.id);
      notify('Cover removed', { type: 'info' });
      refresh();
    } catch (err: any) {
      notify(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
      <Box sx={{ width: 120, height: 180, bgcolor: 'grey.200', borderRadius: 1, overflow: 'hidden', flexShrink: 0 }}>
        {book.coverUrl && <img src={book.coverUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </Box>
      <Stack spacing={1}>
        <Typography variant="subtitle2">Cover image</Typography>
        <Typography variant="body2" color="text.secondary">
          JPEG, PNG or WebP, up to 2 MB. Stored in object storage.
        </Typography>
        <input ref={input} type="file" accept={ACCEPT.join(',')} hidden onChange={(e) => upload(e.target.files?.[0])} />
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small" startIcon={<UploadIcon />} disabled={busy} onClick={() => input.current?.click()}>
            {book.coverUrl ? 'Replace' : 'Upload'}
          </Button>
          {book.coverUrl && (
            <Button size="small" color="error" disabled={busy} onClick={remove}>
              Remove
            </Button>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
};
