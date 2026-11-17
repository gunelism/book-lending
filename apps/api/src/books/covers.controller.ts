import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators';
import { Role } from '../entities';
import { COVER_MAX_BYTES, CoversService, coverUrl } from './covers.service';

/**
 * Cover uploads use a small REST endpoint instead of GraphQL multipart:
 * GraphQL multipart uploads are a known CSRF vector and need extra plumbing.
 * This route still sits behind the session guard, the role guard and the
 * global CSRF middleware.
 */
@Controller('api/books')
export class CoversController {
  constructor(private readonly covers: CoversService) {}

  @Roles(Role.ADMIN)
  @Post(':id/cover')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // never written to disk
      limits: { fileSize: COVER_MAX_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  async upload(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File) {
    const book = await this.covers.upload(id, file);
    return { id: book.id, coverUrl: coverUrl(book) };
  }

  @Roles(Role.ADMIN)
  @Delete(':id/cover')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const book = await this.covers.remove(id);
    return { id: book.id, coverUrl: null };
  }

  /** Streams the cover from object storage. Requires a signed-in session like everything else. */
  @Get(':id/cover')
  async read(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const object = await this.covers.read(id);
    if (!object) throw new NotFoundException('This book has no cover image.');
    res.set({
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      ...(object.contentLength ? { 'Content-Length': String(object.contentLength) } : {}),
      ...(object.etag ? { ETag: object.etag } : {}),
    });
    object.body.pipe(res);
  }
}
