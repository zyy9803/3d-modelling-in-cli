import { describe, expect, it } from 'vitest';

import { formatSseEvent, openSse } from './sseReply.js';

describe('formatSseEvent', () => {
  it('formats a session event into an SSE frame', () => {
    expect(
      formatSseEvent({
        type: 'status_changed',
        status: 'streaming',
      }),
    ).toBe('data: {"type":"status_changed","status":"streaming"}\n\n');
  });
});

describe('openSse', () => {
  it('sets SSE headers without dropping existing headers', () => {
    const headers = new Map<string, string>();
    const raw = {
      statusCode: 0,
      setHeader(name: string, value: string) {
        headers.set(name.toLowerCase(), value);
      },
      flushHeaders() {},
    };
    const reply = {
      hijack() {},
      raw,
    };

    raw.setHeader('Access-Control-Allow-Origin', '*');

    openSse(reply as never);

    expect(raw.statusCode).toBe(200);
    expect(headers.get('access-control-allow-origin')).toBe('*');
    expect(headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
  });
});
