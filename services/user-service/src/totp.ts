import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Buffer {
  const cleanInput = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleanInput[i]);
    if (val === -1) continue;

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(numBytes = 20): string {
  const bytes = randomBytes(numBytes);
  return base32Encode(bytes);
}

export function generateTotpCode(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1_000_000;

  return code.toString().padStart(6, "0");
}

export function getTotpCounter(timeMs = Date.now(), stepSeconds = 30): number {
  return Math.floor(timeMs / 1000 / stepSeconds);
}

export function verifyTotpCode(secret: string, inputCode: string, window = 1, timeMs = Date.now()): boolean {
  const cleanCode = inputCode.trim();
  if (!/^\d{6}$/.test(cleanCode)) return false;

  const currentCounter = getTotpCounter(timeMs);
  for (let offset = -window; offset <= window; offset++) {
    const expected = generateTotpCode(secret, currentCounter + offset);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(cleanCode))) {
      return true;
    }
  }

  return false;
}

export function buildOtpauthUrl(issuer: string, accountName: string, secret: string): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}
