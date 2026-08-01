import { execSync } from 'node:child_process'
import { log as logger } from '../utils/logger.js'
import { setPendingLock, setPendingNotification } from '../local-server.js'
import { getLockReason, getMinutesRemainingToday } from './checker.js'
import { incrementUsage } from './tracker.js'
import { getSchedule } from './store.js'
import { getActiveUsers, killProcessByName } from '../utils/sysinfo.js'
import type { LockReason } from './checker.js'

const CHECK_INTERVAL_MS = 60_000 // проверяем каждую минуту
let enforcerTimer: NodeJS.Timeout | null = null
// Bug #13: flags to avoid duplicate notifications
let notified5min = false
let notified1min = false

const WINLOGON_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'

function setLoginNotice(reason: LockReason) {
  if (process.platform !== 'win32') return

  try {
    if (reason === null) {
      execSync(`reg add "${WINLOGON_KEY}" /v LegalNoticeCaption /t REG_SZ /d "" /f`, { stdio: 'ignore' })
      execSync(`reg add "${WINLOGON_KEY}" /v LegalNoticeText /t REG_SZ /d "" /f`, { stdio: 'ignore' })
    } else {
      const caption = 'PC Remote — Access Restricted'
      const text = reason === 'downtime'
        ? 'Curfew is active. Access to PC is restricted at this time.'
        : reason === 'daily_limit'
          ? 'Daily screen time limit reached.'
          : reason === 'temporary_lock'
            ? 'PC is temporarily locked by administrator.'
            : 'Access to PC is restricted at this time of day.'

      execSync(`reg add "${WINLOGON_KEY}" /v LegalNoticeCaption /t REG_SZ /d "${caption}" /f`, { stdio: 'ignore' })
      execSync(`reg add "${WINLOGON_KEY}" /v LegalNoticeText /t REG_SZ /d "${text}" /f`, { stdio: 'ignore' })
    }
  } catch (err) {
    logger.error({ err }, 'Failed to set login notice')
  }
}

function lockSession(reason: LockReason) {
  logger.warn({ reason }, 'Locking session')

  if (process.platform !== 'win32') {
    logger.info('[DEV MODE] Would lock session')
    return
  }

  const message = reason === 'downtime'
    ? 'Curfew Active: logging off session'
    : reason === 'daily_limit'
      ? 'Daily limit reached: PC will be locked'
      : reason === 'temporary_lock'
        ? 'PC temporarily locked by administrator'
        : 'Access restricted: PC will be locked'

  // downtime → full logoff, others → screen lock
  const logoff = reason === 'downtime'
  setPendingLock(message, logoff)
}

function hasActiveSession(): boolean {
  const users = getActiveUsers()
  return users.some((u) => u.state === 'Active')
}


function checkBlockedApps(blockedApps?: string[]) {
  if (!blockedApps || blockedApps.length === 0) return
  for (const appName of blockedApps) {
    killProcessByName(appName)
  }
}

export function startEnforcer() {
  stopEnforcer()

  logger.info('Schedule enforcer started')

  const check = () => {
    const schedule = getSchedule() as (ReturnType<typeof getSchedule> & { blockedApps?: string[] })

    // Enforce blacklisted applications
    if (schedule?.blockedApps) {
      checkBlockedApps(schedule.blockedApps)
    }

    // If daily limit enabled and session active — track usage time
    if (schedule?.dailyLimit?.enabled && hasActiveSession()) {
      incrementUsage(schedule.timezone)
    }

    // Check lock reason
    const reason = getLockReason()

    // Update Legal Notice on Windows login screen
    setLoginNotice(reason)

    if (reason !== null) {
      lockSession(reason)
      return
    }

    // Bug #13 fix: use range checks with flags to avoid missing notifications due to timing jitter
    const remaining = getMinutesRemainingToday()
    if (remaining !== null && remaining <= 5 && remaining > 1 && !notified5min) {
      notified5min = true
      setPendingNotification('5 minutes of screen time remaining')
      logger.warn({ remaining }, 'Daily limit: 5 min remaining')
    } else if (remaining !== null && remaining <= 1 && remaining > 0 && !notified1min) {
      notified1min = true
      setPendingNotification('1 minute of screen time remaining')
      logger.warn({ remaining }, 'Daily limit: 1 min remaining')
    } else if (remaining === null || remaining > 5) {
      // Reset flags when limit is cleared or time refilled (e.g., bonus time)
      notified5min = false
      notified1min = false
    }
  }



  // Проверяем сразу при старте (защита после перезагрузки)
  check()

  enforcerTimer = setInterval(check, CHECK_INTERVAL_MS)
}

export function stopEnforcer() {
  if (enforcerTimer) {
    clearInterval(enforcerTimer)
    enforcerTimer = null
  }
}
