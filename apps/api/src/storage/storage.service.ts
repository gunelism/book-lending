import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { ServiceUnavailableError } from '../common/errors';
import { Env } from '../config/env';

export interface StoredObject {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  etag?: string;
}

/**
 * Thin wrapper around any S3-compatible object store (MinIO locally, AWS S3 /
 * Cloudflare R2 in production). Files never touch the container's disk.
 *
 * Outages are handled gracefully: the API still starts if storage is down,
 * cover requests fail with a clear 503 (STORAGE_UNAVAILABLE) instead of a
 * crash or a generic 500, and /api/health reports storage as "down".
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      // Fail fast when storage is unreachable instead of hanging requests.
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 3_000, requestTimeout: 15_000 },
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
    });
  }

  /** Checked in the background so an unreachable store never blocks or crashes startup. */
  onModuleInit() {
    this.ensureBucket().catch((err) =>
      this.logger.error(
        `Object storage is unreachable or misconfigured (${err?.name ?? err}). The API keeps running; ` +
          `cover uploads/images return 503 until S3_ENDPOINT / credentials / bucket "${this.bucket}" are fixed.`,
      ),
    );
  }

  /** Creates the (private) bucket if missing. Retries while MinIO is starting up. */
  async ensureBucket(attempts = 30): Promise<void> {
    for (let i = 1; i <= attempts; i++) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
        return;
      } catch (err: any) {
        const status = err?.$metadata?.httpStatusCode;
        if (status === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchBucket') {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.logger.log(`Created bucket "${this.bucket}"`);
          return;
        }
        if (i === attempts) throw err;
        this.logger.warn(`Object storage not reachable yet (attempt ${i}/${attempts}): ${err?.message ?? err}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  /** True if the bucket answers. Used by the health check. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.guard('upload', () =>
      this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: 'private, max-age=31536000, immutable' }),
      ),
    );
  }

  async get(key: string): Promise<StoredObject> {
    const out = await this.guard('read', () => this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key })));
    return {
      body: out.Body as Readable,
      contentType: out.ContentType,
      contentLength: out.ContentLength,
      etag: out.ETag,
    };
  }

  async delete(key: string): Promise<void> {
    await this.guard('delete', () => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })));
  }

  /** Maps storage failures to a clear 404 / 503; details go to the log, not the client. */
  private async guard<T>(action: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('The image was not found in storage.');
      }
      this.logger.error(`Object storage ${action} failed: ${err?.name ?? 'Error'}: ${err?.message ?? err}`);
      throw new ServiceUnavailableError('STORAGE_UNAVAILABLE', 'Image storage is unavailable right now. Please try again shortly.');
    }
  }

  /** Removes every object under a prefix (used by the seed reset). */
  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) {
        await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }));
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }
}
