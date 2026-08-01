import fp from 'fastify-plugin'
import fastifyStatic from '@fastify/static'
import { FastifyInstance } from 'fastify'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Resolves the views directory across dev (src/views) and prod (dist/views) layouts.
 */
function resolveViewsDir(): string {
  const candidates = [
    path.join(__dirname, 'views'),
    path.join(__dirname, '..', 'src', 'views'),
    path.join(__dirname, '..', 'views'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0] // fallback — @fastify/static will log a warning if missing
}

export default fp(async function staticPlugin(app: FastifyInstance) {
  await app.register(fastifyStatic, {
    root: resolveViewsDir(),
    prefix: '/static/',
    // Let the route handler serve dashboard.html at '/' — don't auto-serve index
    index: false,
    // Cache static assets for 1 hour in production
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    etag: true,
    lastModified: true,
  })
})
