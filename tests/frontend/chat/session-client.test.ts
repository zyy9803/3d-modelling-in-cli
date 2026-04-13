import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionClient } from '../../../src/components/chat/services/sessionClient';

describe('SessionClient', () => {
  const fetchMock = vi.fn();
  const eventSources: Array<{ url: string; close: () => void }> = [];

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'EventSource',
      class FakeEventSource {
        public onmessage: ((event: MessageEvent<string>) => void) | null = null;
        public onerror: (() => void) | null = null;
        public readyState = 1;

        public constructor(public readonly url: string) {
          eventSources.push(this);
        }

        public close(): void {}
      } as unknown as typeof EventSource,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    eventSources.length = 0;
  });

  it('uses the migrated Fastify API paths', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            connectionStatus: 'connected',
            connectionMessage: 'ready',
            sessionStatus: 'idle',
            activeModelId: null,
            modelLabel: null,
            draft: {
              status: 'empty',
              jobId: null,
              baseModelId: null,
              scriptPath: null,
              message: null,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response('solid demo', { status: 200 }));

    const client = new SessionClient('http://127.0.0.1:4178');

    await client.getStatus();
    client.connect({ onEvent: vi.fn() });
    await client.sendMessage({
      sessionId: 'sess_main',
      activeModelId: null,
      message: { role: 'user', text: 'hello' },
      selectionContext: { mode: 'click', triangleIds: [], components: [] },
      viewContext: {
        cameraPosition: [0, 0, 10],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 50,
        viewDirection: [0, 0, -1],
        dominantOrientation: '+Z',
        viewportSize: [800, 600],
      },
    });
    await client.fetchModelFile('model_001');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:4178/api/session');
    expect(eventSources[0]?.url).toBe('http://127.0.0.1:4178/api/session/events');
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'http://127.0.0.1:4178/api/models/model_001/file',
    );
  });
});
