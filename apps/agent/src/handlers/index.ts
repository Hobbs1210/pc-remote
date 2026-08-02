import { execSync, execFileSync } from 'node:child_process'
import { log as logger } from '../utils/logger.js'
import { setPendingLock, setPendingVolume, setPendingScreenshot } from '../local-server.js'
import { killProcess, setVolumeLevel } from '../utils/sysinfo.js'
import { downloadAndInstallUpdate } from '../utils/updater.js'
import type { CommandPayload } from '@pc-remote/shared'

// Sanitize a string for use as a shutdown /c comment — strip shell metacharacters
function sanitizeShellArg(input: string): string {
  // Remove characters that could break out of quoting or inject commands
  return input.replace(/["&|<>^%!\r\n]/g, '')
}

// Encode a PowerShell script as Base64 for -EncodedCommand (prevents all injection)
function encodePsCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

export async function executeCommand(payload: CommandPayload): Promise<string | void> {
  const { type, delaySeconds = 0, message, pid, commandText, volumePercent, downloadUrl, version } = payload

  logger.info({ type, delaySeconds, pid }, 'Executing command')

  if (process.platform !== 'win32' && type !== 'KILL_PROCESS' && type !== 'EXEC_TERMINAL' && type !== 'UPDATE_AGENT') {
    logger.info(`[DEV MODE] Would execute: ${type} after ${delaySeconds}s`)
    return
  }

  switch (type) {
    case 'SHUTDOWN': {
      // Bug #1 fix: use execFileSync with argument array to avoid shell injection
      const args = ['/s', '/t', String(delaySeconds)]
      if (message) {
        args.push('/c', sanitizeShellArg(message))
      }
      execFileSync('shutdown', args, { windowsHide: true })
      break
    }

    case 'REBOOT': {
      // Bug #1 fix: use execFileSync with argument array to avoid shell injection
      const args = ['/r', '/t', String(delaySeconds)]
      if (message) {
        args.push('/c', sanitizeShellArg(message))
      }
      execFileSync('shutdown', args, { windowsHide: true })
      break
    }

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

    case 'VOLUME_UP': {
      const steps = payload.volumeSteps ?? 1
      const action = steps > 1 ? `UP:${steps}` : 'UP'
      if (delaySeconds > 0) {
        setTimeout(() => setPendingVolume(action), delaySeconds * 1000)
      } else {
        setPendingVolume(action)
      }
      break
    }

    case 'VOLUME_DOWN': {
      const steps = payload.volumeSteps ?? 1
      const action = steps > 1 ? `DOWN:${steps}` : 'DOWN'
      if (delaySeconds > 0) {
        setTimeout(() => setPendingVolume(action), delaySeconds * 1000)
      } else {
        setPendingVolume(action)
      }
      break
    }

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
      // Bug #2 fix: use -EncodedCommand to prevent injection via message content
      if (message) {
        try {
          execFileSync('msg.exe', ['*', sanitizeShellArg(message)], { windowsHide: true })
        } catch {
          const psScript = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(${JSON.stringify(message)}, 'PC Remote')`
          execFileSync('powershell.exe', ['-NonInteractive', '-NoProfile', '-EncodedCommand', encodePsCommand(psScript)], { windowsHide: true })
        }
      }
      break

    case 'EXEC_TERMINAL':
      // Bug #3 fix: use -EncodedCommand to safely pass arbitrary PowerShell without escaping issues
      if (commandText) {
        try {
          const output = execFileSync(
            'powershell.exe',
            ['-NonInteractive', '-NoProfile', '-EncodedCommand', encodePsCommand(commandText)],
            { encoding: 'utf-8', timeout: 15000, windowsHide: true }
          )
          return output
        } catch (err: unknown) {
          const errorOutput = err && typeof err === 'object' && 'stdout' in err ? String((err as { stdout: unknown }).stdout) : String(err)
          return `Error executing command: ${errorOutput}`
        }
      }
      break

    case 'UPDATE_AGENT':
      if (downloadUrl && version) {
        return await downloadAndInstallUpdate(downloadUrl, version)
      }
      break

    case 'GET_INSTALLED_APPS':
      {
        const { getInstalledSoftware } = await import('../utils/sysinfo.js')
        const apps = getInstalledSoftware()
        return JSON.stringify(apps)
      }

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