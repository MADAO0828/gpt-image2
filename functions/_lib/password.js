const LEGACY_PASSWORD_SALT = 'gpt-image2-auth-salt-2026';
const PBKDF2_ALGORITHM = 'pbkdf2-sha256';
// Cloudflare Pages Web Crypto currently rejects PBKDF2 counts above 100000.
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(value) {
  let input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return Uint8Array.from(atob(input), char => char.charCodeAt(0));
}

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BITS
  ));
}

async function legacyPasswordHash(password) {
  return new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(password + ':' + LEGACY_PASSWORD_SALT)
  ));
}

export function validateNewPassword(password) {
  if (String(password || '').length < 6) return 'Password must be at least 6 characters';
  return '';
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derivePbkdf2(String(password), salt, PBKDF2_ITERATIONS);
  return [PBKDF2_ALGORITHM, PBKDF2_ITERATIONS, b64url(salt), b64url(derived)].join('$');
}

export async function verifyPassword(password, storedHash) {
  const encoded = String(storedHash || '');
  const parts = encoded.split('$');
  if (parts.length === 4 && parts[0] === PBKDF2_ALGORITHM) {
    const iterations = Number.parseInt(parts[1], 10);
    if (!Number.isSafeInteger(iterations) || iterations < 100000 || iterations > PBKDF2_ITERATIONS) {
      return { valid: false, needsRehash: false };
    }
    try {
      const expected = b64urlDecode(parts[3]);
      const actual = await derivePbkdf2(String(password), b64urlDecode(parts[2]), iterations);
      return {
        valid: equalBytes(actual, expected),
        needsRehash: iterations !== PBKDF2_ITERATIONS
      };
    } catch (error) {
      return { valid: false, needsRehash: false };
    }
  }

  try {
    const expected = b64urlDecode(encoded);
    const actual = await legacyPasswordHash(String(password));
    const valid = equalBytes(actual, expected);
    return { valid, needsRehash: valid };
  } catch (error) {
    return { valid: false, needsRehash: false };
  }
}
