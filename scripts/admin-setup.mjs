import { randomBytes, scryptSync } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// Interactive only: never accept a password in a command argument or log it.
if (!process.stdin.isTTY)
  throw new Error('Run this setup in your local interactive terminal.');
const path = fileURLToPath(new URL('../.env', import.meta.url));
const original = await readFile(path, 'utf8');
const configured = parseEnv(original);
if (configured.ADMIN_PASSWORD_HASH || configured.ADMIN_TOTP_SECRET)
  throw new Error(
    'Administrator credentials already exist. Back up and deliberately remove those entries before rotating them.',
  );
function hidden(prompt) {
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const handler = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') {
          cleanup();
          reject(new Error('Setup cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ' && value.length < 128) value += char;
      }
    };
    const cleanup = () => {
      process.stdin.off('data', handler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    process.stdin.on('data', handler);
  });
}
const password = await hidden(
  'Choose a unique operator passphrase (16–128 characters; hidden input): ',
);
const confirmation = await hidden('Confirm passphrase: ');
if (password !== confirmation || password.length < 16 || password.length > 128)
  throw new Error(
    'Passphrases must match and contain 16–128 characters. No configuration changed.',
  );
const salt = randomBytes(16).toString('hex');
const hash = `scrypt$32768$8$3$${salt}$${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString('hex')}`;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const secret = [...randomBytes(32)]
  .map((value) => alphabet[value & 31])
  .join('');
const cleaned = original
  .replace(/^ADMIN_PASSWORD_HASH=.*\r?\n?/gm, '')
  .replace(/^ADMIN_TOTP_SECRET=.*\r?\n?/gm, '');
await writeFile(
  path,
  `${cleaned.trimEnd()}\nADMIN_PASSWORD_HASH='${hash}'\nADMIN_TOTP_SECRET=${secret}\n`,
  { mode: 0o600 },
);
console.info('Administrator credentials saved to the ignored local .env file.');
console.info(
  'Add this secret to your authenticator as Strangely operator, TOTP, SHA1, 6 digits, 30 seconds. Keep it private:',
);
console.info(secret);
console.info(
  'Open http://127.0.0.1:5173/developer. For hosting, copy the HASH and TOTP SECRET directly to backend variables. Never upload .env.',
);
