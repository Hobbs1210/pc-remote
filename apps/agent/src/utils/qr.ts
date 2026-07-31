import qrcode from 'qrcode-terminal'

/**
 * Печатает QR-код в терминал для привязки устройства.
 * Мобильное приложение сканирует JSON: { deviceId, secret }
 */
export function printBindQR(deviceId: string, secret: string): void {
  const payload = JSON.stringify({ deviceId, secret })

  const sep = '═'.repeat(52)
  console.log(`\n${sep}`)
  console.log('  Scan this QR code in the mobile application')
  console.log(`${sep}\n`)

  qrcode.generate(payload, { small: true })

  console.log(`\n  Device ID : ${deviceId}`)
  console.log(`${sep}\n`)
}
