import { describe, expect, it } from 'vitest';

import { ViewerApp } from './ViewerApp';

describe('ViewerApp', () => {
  it('renders the empty state and keeps only the reset action in the toolbar', () => {
    const root = document.createElement('div');

    new ViewerApp(root);

    expect(root.textContent).toContain('拖拽');
    expect(root.querySelector<HTMLElement>('[data-reset-view]')?.textContent).toBe('重置视角');
    expect(root.querySelectorAll('[data-mode]').length).toBe(0);
  });

  it('renders the orientation gizmo buttons', () => {
    const root = document.createElement('div');

    new ViewerApp(root);

    expect(root.querySelectorAll('[data-orientation]').length).toBe(6);
  });

  it('marks the shell as a viewport-filling layout', () => {
    const root = document.createElement('div');

    new ViewerApp(root);

    expect(root.querySelector('.app-shell--viewport')).not.toBeNull();
  });
});
