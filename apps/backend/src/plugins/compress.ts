import fp from 'fastify-plugin'
import compress from '@fastify/compress'
import { FastifyInstance } from 'fastify'

const compressPlugin = fp(async function (app: FastifyInstance) {
  await app.register(compress, {
    // Prefer Brotli in modern clients, fall back to gzip
    encodings: ['br', 'gzip', 'deflate'],
    // Only compress responses larger than 1 KB
    threshold: 1024,
  })
})

export default compressPlugin
