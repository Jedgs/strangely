import { createHmac, scrypt, timingSafeEqual } from 'node:crypto';
export const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
};

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (!/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded))
    return false;
  const [, , , , salt, expected] = encoded.split('$');
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt!, 64, SCRYPT_OPTIONS, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
  return timingSafeEqual(actual, Buffer.from(expected!, 'hex'));
}
export function totp(secret: string, counter: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(input).digest();
  const offset = digest[19]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    '0',
  );
}
export function verifyTotp(
  secret: string,
  code: string,
  now = Date.now(),
): number | null {
  if (!/^[A-Z2-7]{32,64}$/.test(secret) || !/^\d{6}$/.test(code)) return null;
  const counter = Math.floor(now / 30000);
  for (const candidate of [counter - 1, counter, counter + 1])
    if (
      candidate >= 0 &&
      timingSafeEqual(Buffer.from(totp(secret, candidate)), Buffer.from(code))
    )
      return candidate;
  return null;
}
