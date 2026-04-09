import { describe, expect, it } from 'vitest';

import { isStlFile } from './FileDropzone';

describe('isStlFile', () => {
  it('accepts .stl files case-insensitively', () => {
    expect(isStlFile(new File(['solid'], 'model.STL'))).toBe(true);
  });

  it('rejects non-stl files', () => {
    expect(isStlFile(new File(['{}'], 'model.json'))).toBe(false);
  });
});
