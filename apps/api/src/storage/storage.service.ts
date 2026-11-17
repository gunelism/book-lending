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
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
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
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
    });
  }

  async onModuleInit() {
    await this.ensureBucket();
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

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: 'private, max-age=31536000, immutable' }),
    );
  }

  async get(key: string): Promise<StoredObject> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return {
      body: out.Body as Readable,
      contentType: out.ContentType,
      contentLength: out.ContentLength,
      etag: out.ETag,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
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
