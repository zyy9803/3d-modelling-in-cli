import { pathToFileURL } from 'node:url';

import { buildApp } from './app/buildApp.js';
import { startServer } from './app/startServer.js';

export { buildApp, startServer };

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  void startServer();
}
