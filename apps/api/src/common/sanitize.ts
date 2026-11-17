import { Transform } from 'class-transformer';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Normalises user-submitted text: trims whitespace and strips control
 * characters. Output is always rendered as text (React escapes it), never as
 * HTML, so no markup is interpreted.
 */
export const Clean = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.replace(CONTROL_CHARS, '').trim() : value));

/** Like Clean(), and lower-cases (emails). */
export const CleanLower = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.replace(CONTROL_CHARS, '').trim().toLowerCase() : value));
