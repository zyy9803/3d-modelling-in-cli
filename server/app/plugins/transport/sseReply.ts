import type { FastifyReply } from 'fastify';

import type { SessionStreamEvent } from '../../../../src/shared/codex-session-types.js';

export function formatSseEvent(event: SessionStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function openSse(reply: FastifyReply): void {
  reply.hijack();
  reply.raw.statusCode = 200;
  reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.flushHeaders();
}

export function writeSseEvent(
  reply: FastifyReply,
  event: SessionStreamEvent,
): boolean {
  if (reply.raw.destroyed || reply.raw.writableEnded) {
    return false;
  }

  try {
    reply.raw.write(formatSseEvent(event));
    return true;
  } catch {
    return false;
  }
}
