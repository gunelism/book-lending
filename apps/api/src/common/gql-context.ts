import type { Request, Response } from 'express';
import type { Loaders } from '../loaders/loaders.service';

export interface GqlContext {
  req: Request;
  res: Response;
  loaders: Loaders;
}
