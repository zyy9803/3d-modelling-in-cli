import { describe, expect, it } from 'vitest';

import { ViewerApp } from './ViewerApp';

describe('ViewerApp', () => {
  it('renders the empty state and defaults to rotate mode', () => {
    const root = document.createElement('div');

    new ViewerApp(root);

    expect(root.textContent).toContain('拖拽');
    expect(root.querySelector<HTMLElement>('[data-mode="rotate"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector<HTMLElement>('[data-mode="pan"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('toggles the active mode button when the user selects pan mode', () => {
    const root = document.createElement('div');

    new ViewerApp(root);

    root.querySelector<HTMLElement>('[data-mode="pan"]')?.click();

    expect(root.querySelector<HTMLElement>('[data-mode="rotate"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector<HTMLElement>('[data-mode="pan"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders the orientation gizmo buttons', () => {
    const root = document.createElement('div');

    new ViewerApp(root);

    expect(root.querySelectorAll('[data-orientation]').length).toBe(6);
  });
});
