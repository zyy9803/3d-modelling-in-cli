import './styles.css';

import { ViewerApp } from './app/ViewerApp';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('App root #app was not found.');
}

new ViewerApp(root);
