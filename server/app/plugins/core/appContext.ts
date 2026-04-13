export type SessionControllerLike = {
  start(): void;
  stop(): void;
  getSnapshot(): unknown;
  subscribe(listener: (event: unknown) => void): () => void;
  submitMessage(payload: unknown): Promise<unknown>;
  submitDecision(payload: unknown): Promise<unknown>;
  generateModel(payload: unknown): Promise<unknown>;
  interruptTurn(payload: unknown): Promise<unknown>;
  switchModel(payload: unknown): Promise<unknown>;
  clearSession(): Promise<unknown>;
  importModel(payload: unknown): Promise<unknown>;
  readModelFile(modelId: string): Promise<Buffer | null>;
};

export type AppContext = {
  session: SessionControllerLike;
};

declare module 'fastify' {
  interface FastifyInstance {
    appContext: AppContext;
  }
}

export function registerAppContext(
  app: import('fastify').FastifyInstance,
  context: AppContext,
): void {
  app.decorate('appContext', context);
}
