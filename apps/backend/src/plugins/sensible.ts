import fp from 'fastify-plugin'
import sensible from '@fastify/sensible'
import { FastifyInstance } from 'fastify'

const sensiblePlugin = fp(async function (app: FastifyInstance) {
  await app.register(sensible)
})

export default sensiblePlugin
