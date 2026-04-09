export function isStlFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.stl');
}

export function createFileDropzone(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'file-dropzone';
  return wrapper;
}
