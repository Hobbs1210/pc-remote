import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { exec } from 'node:child_process'
import { log as logger } from './logger.js'

export async function downloadAndInstallUpdate(downloadUrl: string, version: string): Promise<string> {
  logger.info({ downloadUrl, version }, 'Starting agent self-update process')

  if (process.platform !== 'win32') {
    logger.info(`[DEV MODE] Would download update ${version} from ${downloadUrl}`)
    return `[DEV MODE] Simulated update to ${version}`
  }

  const tempDir = os.tmpdir()
  const targetPath = path.join(tempDir, `PC-Remote-Setup-${version.replace(/[^a-zA-Z0-9._-]/g, '')}.exe`)

  try {
    const res = await fetch(downloadUrl)
    if (!res.ok) {
      throw new Error(`Failed to download installer: HTTP ${res.status}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    fs.writeFileSync(targetPath, buffer)

    logger.info({ targetPath, bytes: buffer.length }, 'Downloaded setup installer executable')

    // Launch installer in background with silent parameters
    const cmd = `"${targetPath}" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART`
    exec(cmd, { windowsHide: true })

    logger.info('Launched setup installer silently')
    return `Installer launched for version ${version}`
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error({ error: errorMsg }, 'Agent self-update failed')
    throw new Error(`Update failed: ${errorMsg}`)
  }
}
