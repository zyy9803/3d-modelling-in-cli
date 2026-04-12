import type { IncomingMessage, ServerResponse } from 'node:http';

import { writeCorsHeaders } from './cors.js';

export type JsonValue =
  | Record<string, unknown>
  | Array<unknown>
  | string
  | number
  | boolean
  | null;

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    throw new Error('Request body is required.');
  }

  return JSON.parse(text) as T;
}

export function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: JsonValue,
): void {
  writeCorsHeaders(response);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}
