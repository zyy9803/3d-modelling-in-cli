import { buildCodexTurnPrompt } from '../src/shared/codex-turn-prompt';
import type {
  SessionMessageRequest,
  SessionStreamEvent,
} from '../src/shared/codex-session-types';

export function createPlaceholderSessionRequest(): SessionMessageRequest {
  return {
    sessionId: 'bootstrap-session',
    activeModelId: null,
    message: {
      role: 'user',
      text: 'Server scaffold ready.',
    },
    selectionContext: {
      version: 1,
      model: {
        id: 'bootstrap-model',
        fileName: 'bootstrap.stl',
      },
      selection: {
        mode: 'click',
        triangleIds: [],
      },
      components: [],
    },
    viewContext: {
      cameraPosition: [0, 0, 1],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fov: 50,
      viewDirection: [0, 0, -1],
      dominantOrientation: '+Z',
      viewportSize: [1280, 720],
    },
  };
}

export function buildPlaceholderPrompt(request: SessionMessageRequest): string {
  return buildCodexTurnPrompt(request);
}

export function createBootstrapEvent(): SessionStreamEvent {
  return {
    type: 'status_changed',
    sessionId: 'bootstrap-session',
    status: 'idle',
  };
}
