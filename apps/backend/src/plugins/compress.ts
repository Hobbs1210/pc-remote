import fp from 'fastify-plugin'
import compress from '@fastify/compress'
import { FastifyInstance } from 'fastify'

export default fp(async function compressPlugin(app: FastifyInstance) {
  await app.register(compress, {
    // Prefer Brotli in modern clients, fall back to gzip
    encodings: ['br', 'gzip', 'deflate'],
    // Only compress responses larger than 1 KB (screenshots are already base64)
    threshold: 1024,
  })
})
