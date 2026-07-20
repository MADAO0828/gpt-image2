export const SECRET_PLACEHOLDER = '***MASKED***';

const SECRET_KEY_PATTERN = /(?:api.?keys?|access.?keys?|private.?keys?|service.?account.?keys?|secret(?:s?|keys?|values?)|password(?:s?|hash|values?)|credentials?|authorizations?|cookies?|token(?:s?|values?|secrets?|hash))(?:encrypted|ciphertext)?$/i;

export function isSecretKey(key) {
  return SECRET_KEY_PATTERN.test(String(key || '').replace(/[^a-z0-9]/gi, ''));
}

export function isSecretPlaceholder(value) {
  const input = String(value || '').trim();
  return input === 'cloudflare-proxy'
    || input === 'placeholder'
    || /^\*+MASKED\*+$/i.test(input)
    || /^\*+REDACTED\*+$/i.test(input);
}

function itemIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return String(value.id || value.name || value.key || '').trim();
}

function existingArrayItem(incoming, existing, index) {
  const identity = itemIdentity(incoming);
  if (identity) {
    const matched = existing.find(item => itemIdentity(item) === identity);
    if (matched !== undefined) return matched;
  }
  return existing[index];
}

export function preserveSecretPlaceholders(incoming, existing, key = '') {
  if (isSecretKey(key)) {
    return isSecretPlaceholder(incoming) ? (existing ?? '') : incoming;
  }
  if (Array.isArray(incoming)) {
    const oldItems = Array.isArray(existing) ? existing : [];
    return incoming.map((value, index) => preserveSecretPlaceholders(
      value,
      existingArrayItem(value, oldItems, index),
      ''
    ));
  }
  if (incoming && typeof incoming === 'object') {
    const oldObject = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
    const output = {};
    for (const [childKey, value] of Object.entries(incoming)) {
      output[childKey] = preserveSecretPlaceholders(value, oldObject[childKey], childKey);
    }
    return output;
  }
  return incoming;
}

export function maskSecrets(value, key = '', placeholder = SECRET_PLACEHOLDER) {
  if (isSecretKey(key)) return value === undefined || value === null || value === '' ? '' : placeholder;
  if (Array.isArray(value)) return value.map(item => maskSecrets(item, '', placeholder));
  if (value && typeof value === 'object') {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      output[childKey] = maskSecrets(childValue, childKey, placeholder);
    }
    return output;
  }
  return value;
}
