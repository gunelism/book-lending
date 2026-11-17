import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Book } from '../entities';
import { StorageService } from '../storage/storage.service';
import { BooksService } from './books.service';

export const COVER_MAX_BYTES = 2 * 1024 * 1024;
export const COVER_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
/** Rejects decompression bombs (e.g. a tiny PNG claiming 50 000 × 50 000 px). */
const MAX_INPUT_PIXELS = 40_000_000;

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Cover image pipeline. Uploads arrive in memory only, are verified by their
 * actual bytes (not the extension or the browser's Content-Type), then
 * re-encoded to WebP. Re-encoding throws away anything that is not pixel data
 * (EXIF/GPS metadata, embedded scripts, polyglot payloads). The result goes to
 * object storage; nothing is ever written to local disk.
 */
@Injectable()
export class CoversService {
  private readonly logger = new Logger(CoversService.name);

  constructor(
    private readonly books: BooksService,
    private readonly storage: StorageService,
  ) {}

  async upload(bookId: number, file: UploadedImage | undefined): Promise<Book> {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded (expected multipart field "file").');
    if (file.size > COVER_MAX_BYTES) throw new BadRequestException('Cover images must be 2 MB or smaller.');
    if (!COVER_ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG or WebP images are allowed.');
    }

    await this.books.get(bookId); // 404 before doing any image work

    let format: string | undefined;
    try {
      format = (await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
    } catch {
      throw new BadRequestException('The file is not a readable image.');
    }
    if (!format || !ALLOWED_FORMATS.has(format)) {
      throw new BadRequestException('File contents are not a JPEG, PNG or WebP image.');
    }

    let webp: Buffer;
    try {
      webp = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate() // honour EXIF orientation before metadata is stripped
        .resize({ width: 600, height: 900, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException('The image could not be processed.');
    }

    const key = `covers/${bookId}/${randomUUID()}.webp`;
    await this.storage.put(key, webp, 'image/webp');
    const { book, previousKey } = await this.books.setCoverKey(bookId, key);
    if (previousKey) await this.storage.delete(previousKey).catch((e) => this.logger.warn(`Old cover cleanup failed: ${e}`));
    return book;
  }

  async remove(bookId: number): Promise<Book> {
    const { book, previousKey } = await this.books.setCoverKey(bookId, null);
    if (previousKey) await this.storage.delete(previousKey).catch((e) => this.logger.warn(`Cover cleanup failed: ${e}`));
    return book;
  }

  async read(bookId: number) {
    const book = await this.books.get(bookId);
    if (!book.coverKey) return null;
    return this.storage.get(book.coverKey);
  }
}

/** Public URL of a cover (served by CoversController); the version busts caches on change. */
export function coverUrl(book: Pick<Book, 'id' | 'coverKey'>): string | null {
  if (!book.coverKey) return null;
  const version = book.coverKey.split('/').pop()!.replace(/\.\w+$/, '');
  return `/api/books/${book.id}/cover?v=${version}`;
}
