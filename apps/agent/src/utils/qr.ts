import qrcode from 'qrcode-terminal'

/**
 * Prints the QR code to the terminal for device pairing.
 * The mobile app scans JSON: { deviceId, secret }
 * Users without a camera can type the Device ID and Secret manually.
 */
export function printBindQR(deviceId: string, secret: string): void {
  const payload = JSON.stringify({ deviceId, secret })

  const sep = '═'.repeat(52)
  console.log(`\n${sep}`)
  console.log('  Scan this QR code in the mobile application')
  console.log(`${sep}\n`)

  qrcode.generate(payload, { small: true })

  console.log(`\n  Device ID : ${deviceId}`)
  console.log(`  Secret    : ${secret}`)
  console.log(`\n  Can't scan? Open the app → Add Device → Enter Code`)
  console.log(`${sep}\n`)
}
