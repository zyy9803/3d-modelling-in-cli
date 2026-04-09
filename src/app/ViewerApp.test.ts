import { describe, expect, it } from 'vitest';

import { ViewerApp } from './ViewerApp';

describe('ViewerApp', () => {
  it('renders the empty state and phase-2 toolbar actions', () => {
    const root = document.createElement('div');

    new ViewerApp(root);

    expect(root.textContent?.match(/拖拽 STL 文件到这里开始预览/g)?.length ?? 0).toBe(1);
    expect(root.querySelector('[data-dropzone-root]')?.textContent?.trim()).toBe('');
    expect(root.querySelector('[data-export-context]')).not.toBeNull();
    expect(root.querySelector('[data-clear-selection]')).not.toBeNull();
    expect(root.querySelector('[data-reset-view]')).not.toBeNull();
  });

  it('renders the selection status bar', () => {
    const root = document.createElement('div');

    new ViewerApp(root);

    expect(root.querySelector('[data-selection-status]')?.textContent).toContain('0');
  });

  it('keeps the orientation anchor mounted but empty before a model is loaded', () => {
    const root = document.createElement('div');

    new ViewerApp(root);

    expect(root.querySelector('[data-orientation-root]')).not.toBeNull();
    expect(root.querySelector('[data-orientation-root]')?.childElementCount).toBe(0);
  });

  it('marks the shell as a viewport-filling layout', () => {
    const root = document.createElement('div');

    new ViewerApp(root);

    expect(root.querySelector('.app-shell--viewport')).not.toBeNull();
  });
});
