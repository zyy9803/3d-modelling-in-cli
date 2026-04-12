import { pathToFileURL } from 'node:url';

import { startServer } from './app/create-server.js';

export { createServer, startServer } from './app/create-server.js';

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  void startServer();
}
