import sharp from 'sharp';
import { Genre } from '../entities/enums';
import { GENRE_COLORS } from './data';

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > maxChars && line) {
      lines.push(line);
      line = word;
    } else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines.length > maxLines ? [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ').slice(0, maxChars - 1) + '…'] : lines;
}

/** Renders a simple generated cover (title, author, genre colours) as a WebP buffer. */
export async function renderCover(title: string, author: string, genre: Genre, variant: number): Promise<Buffer> {
  const [top, bottom, accent] = GENRE_COLORS[genre];
  const lines = wrap(title.toUpperCase(), 14, 5);
  const shape =
    variant % 3 === 0
      ? `<circle cx="150" cy="${280 + (variant % 30)}" r="${50 + (variant % 30)}" fill="${accent}" opacity="0.85"/>`
      : variant % 3 === 1
        ? `<rect x="40" y="${280 + (variant % 30)}" width="220" height="${12 + (variant % 20)}" fill="${accent}"/>`
        : `<polygon points="150,${250 + (variant % 30)} 230,390 70,390" fill="${accent}" opacity="0.85"/>`;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
  <rect width="300" height="450" fill="url(#g)"/>
  <rect x="14" y="14" width="272" height="422" fill="none" stroke="${accent}" stroke-width="2" opacity="0.6"/>
  ${shape}
  <g font-family="DejaVu Serif, serif" font-weight="bold" font-size="24" fill="${accent}" text-anchor="middle">
    ${lines.map((l, i) => `<text x="150" y="${70 + i * 32}">${escapeXml(l)}</text>`).join('')}
  </g>
  <text x="150" y="420" font-family="DejaVu Sans, sans-serif" font-size="15" fill="${accent}" text-anchor="middle">${escapeXml(author)}</text>
</svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 70 }).toBuffer();
}
