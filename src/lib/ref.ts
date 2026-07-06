// Human-friendly booking reference, e.g. "WTR-7F3K2".
// Avoids ambiguous chars (0/O, 1/I).
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function generateReference(): string {
  let code = ''
  for (let i = 0; i < 5; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return `WTR-${code}`
}
