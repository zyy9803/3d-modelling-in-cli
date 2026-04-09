export function isStlFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.stl');
}

export function createFileDropzone(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'file-dropzone';
  wrapper.innerHTML = `
    <div>
      <p class="file-dropzone__title">拖拽本地 .stl 文件到这里</p>
      <p class="file-dropzone__hint">或使用右上角按钮选择文件</p>
    </div>
  `;
  return wrapper;
}
