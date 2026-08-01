import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { FastifyInstance } from 'fastify'
import type { RegisterInput, LoginInput } from './auth.schema.js'

const SALT_ROUNDS = 12
const REFRESH_TOKEN_TTL_DAYS = 30

export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private app: FastifyInstance
  ) {}

  async register(input: RegisterInput) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    })

    if (existing) {
      // Не говорим "email занят" — это утечка информации
      // Возвращаем ту же ошибку что и при неверном пароле
      throw new AuthError('Invalid credentials', 401, 'AUTH_INVALID_CREDENTIALS')
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)

    const user = await this.prisma.user.create({
      data: { email: input.email, passwordHash },
      select: { id: true, email: true, createdAt: true },
    })

    return this.issueTokens(user.id, user.email)
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    })

    // Bug #19 fix: use a valid pre-computed bcrypt hash so compare() does a full comparison
    // (the original string was not a valid hash and would be rejected immediately, defeating timing protection)
    const passwordHash = user?.passwordHash ?? '$2b$12$K4v4Y3GQz6YFJqm3nZHDYexMRPFy0v5x2UoYHJqHMqR3w8hOdcUe6'
    const valid = await bcrypt.compare(input.password, passwordHash)

    if (!user || !valid) {
      throw new AuthError('Invalid credentials', 401, 'AUTH_INVALID_CREDENTIALS')
    }

    return this.issueTokens(user.id, user.email)
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    })

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new AuthError('Invalid refresh token', 401, 'AUTH_INVALID_REFRESH_TOKEN')
    }

    // Rotation: старый токен отзываем, выдаём новый
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    return this.issueTokens(stored.user.id, stored.user.email)
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  private async issueTokens(userId: string, email: string) {
    const accessToken = this.app.jwt.sign({ userId, email })

    const rawRefresh = crypto.randomBytes(64).toString('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS)

    await this.prisma.refreshToken.create({
      data: { token: rawRefresh, userId, expiresAt },
    })

    return { accessToken, refreshToken: rawRefresh, expiresAt }
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string = 'AUTH_ERROR'
  ) {
    super(message)
    this.name = 'AuthError'
  }
}