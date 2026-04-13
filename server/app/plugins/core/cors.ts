import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

export function registerCors(app: FastifyInstance): void {
  void app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });
}
