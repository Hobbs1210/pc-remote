import { execSync } from 'node:child_process'
import { log as logger } from '../utils/logger.js'
import { setPendingLock, setPendingVolume, setPendingScreenshot } from '../local-server.js'
import { killProcess, setVolumeLevel } from '../utils/sysinfo.js'
import type { CommandPayload } from '@pc-remote/shared'

export async function executeCommand(payload: CommandPayload): Promise<string | void> {
  const { type, delaySeconds = 0, message, pid, commandText, volumePercent } = payload

  logger.info({ type, delaySeconds, pid }, 'Executing command')

  if (process.platform !== 'win32' && type !== 'KILL_PROCESS' && type !== 'EXEC_TERMINAL') {
    logger.info(`[DEV MODE] Would execute: ${type} after ${delaySeconds}s`)
    return
  }

  switch (type) {
    case 'SHUTDOWN':
      execSync(
        `shutdown /s /t ${delaySeconds}${message ? ` /c "${message}"` : ''}`,
        { windowsHide: true }
      )
      break

    case 'REBOOT':
      execSync(
        `shutdown /r /t ${delaySeconds}${message ? ` /c "${message}"` : ''}`,
        { windowsHide: true }
      )
      break

    case 'LOCK':
      if (delaySeconds > 0) {
        setTimeout(() => setPendingLock(), delaySeconds * 1000)
      } else {
        setPendingLock()
      }
      break

    case 'SLEEP':
      execSync('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', { windowsHide: true })
      break

    case 'VOLUME_UP':
      if (delaySeconds > 0) {
        setTimeout(() => setPendingVolume('UP'), delaySeconds * 1000)
      } else {
        setPendingVolume('UP')
      }
      break

    case 'VOLUME_DOWN':
      if (delaySeconds > 0) {
        setTimeout(() => setPendingVolume('DOWN'), delaySeconds * 1000)
      } else {
        setPendingVolume('DOWN')
      }
      break

    case 'VOLUME_MUTE':
      setPendingVolume('MUTE')
      break

    case 'SET_VOLUME':
      if (volumePercent !== undefined) {
        setVolumeLevel(volumePercent)
      }
      break

    case 'SCREENSHOT':
      setPendingScreenshot()
      break

    case 'KILL_PROCESS':
      if (pid) {
        killProcess(pid)
      }
      break

    case 'SHOW_MESSAGE':
      if (message) {
        try {
          execSync(`msg.exe * "${message.replace(/"/g, '""')}"`, { windowsHide: true })
        } catch {
          execSync(
            `powershell.exe -NonInteractive -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${message.replace(/'/g, "''")}', 'PC Remote')"`,
            { windowsHide: true }
          )
        }
      }
      break

    case 'EXEC_TERMINAL':
      if (commandText) {
        try {
          const output = execSync(
            `powershell.exe -NonInteractive -NoProfile -Command "${commandText.replace(/"/g, '""')}"`,
            { encoding: 'utf-8', timeout: 15000, windowsHide: true }
          )
          return output
        } catch (err: unknown) {
          const errorOutput = err && typeof err === 'object' && 'stdout' in err ? String((err as { stdout: unknown }).stdout) : String(err)
          return `Error executing command: ${errorOutput}`
        }
      }
      break

    default:
      logger.warn({ type }, 'Unknown command type')
  }
}




// Отменить отложенный shutdown/reboot
export function cancelShutdown(): void {
  if (process.platform !== 'win32') {
    logger.info('[DEV MODE] Would cancel shutdown')
    return
  }
  try {
    execSync('shutdown /a', { windowsHide: true })
    logger.info('Shutdown cancelled')
  } catch {
    // Нет активного shutdown — это нормально
  }
}