/** Normalises an ISBN (strips hyphens/spaces) and verifies its checksum. */
export function normalizeIsbn(raw: string): string | null {
  const isbn = raw.replace(/[-\s]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
    return sum % 11 === 0 ? isbn : null;
  }
  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0 ? isbn : null;
  }
  return null;
}

/** Appends the correct check digit to a 12-digit ISBN-13 prefix. */
export function isbn13WithCheckDigit(first12: string): string {
  const sum = [...first12].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return first12 + ((10 - (sum % 10)) % 10);
}
