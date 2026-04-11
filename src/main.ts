import './styles.css';

import { ViewerApp } from './app/ViewerApp';
import { MockSessionClient, resolveMockCodexScenarioId } from './chat/mock-session-client';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('App root #app was not found.');
}

const mockScenarioId = resolveMockCodexScenarioId(window.location.search);

new ViewerApp(root, mockScenarioId ? { sessionClient: new MockSessionClient(mockScenarioId) } : undefined);
