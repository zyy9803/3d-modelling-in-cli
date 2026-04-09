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
});
