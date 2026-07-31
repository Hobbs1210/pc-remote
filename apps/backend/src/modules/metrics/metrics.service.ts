import { PrismaClient } from '@prisma/client'

export class MetricsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Prunes hardware metric records older than retentionDays
   */
  async pruneMetrics(retentionDays = 30): Promise<{ count: number }> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

    const result = await this.prisma.deviceMetric.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    })

    return { count: result.count }
  }

  /**
   * Returns aggregated metrics summary for a device
   */
  async getMetricsSummary(deviceId: string, days = 7) {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const metrics = await this.prisma.deviceMetric.findMany({
      where: {
        deviceId,
        timestamp: {
          gte: cutoffDate,
        },
      },
      orderBy: { timestamp: 'asc' },
    })

    if (metrics.length === 0) {
      return { avgCpu: 0, avgRam: 0, count: 0, history: [] }
    }

    const totalCpu = metrics.reduce((sum, m) => sum + m.cpuPercent, 0)
    const totalRam = metrics.reduce((sum, m) => sum + m.ramPercent, 0)

    return {
      avgCpu: Math.round((totalCpu / metrics.length) * 10) / 10,
      avgRam: Math.round((totalRam / metrics.length) * 10) / 10,
      count: metrics.length,
      history: metrics.map(m => ({
        cpuPercent: m.cpuPercent,
        ramPercent: m.ramPercent,
        activeApp: m.activeApp,
        timestamp: m.timestamp,
      })),
    }
  }
}
