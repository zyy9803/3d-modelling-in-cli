declare module 'ws' {
  import { EventEmitter } from 'node:events';

  export type RawData = string | Buffer | ArrayBuffer | Buffer[];

  class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    static readonly CLOSED: number;
    readonly readyState: number;
    constructor(address: string);
    send(data: string): void;
    close(): void;
    on(event: 'message', listener: (data: RawData) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    once(event: 'open', listener: () => void): this;
    once(event: 'error', listener: (error: Error) => void): this;
    off(event: 'open' | 'error', listener: (...args: any[]) => void): this;
  }

  export default WebSocket;
}
