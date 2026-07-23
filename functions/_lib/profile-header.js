const PROFILE_HEADER_UTF8_PREFIX = 'gpt-image-profile-utf8-v1:';
const SAFE_HEADER_VALUE = /^[\x20-\x7e]*$/;

function encodeUtf8Component(value) {
  try {
    return encodeURIComponent(value);
  } catch {
    const bytes = new TextEncoder().encode(value);
    return Array.from(bytes, (byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join('');
  }
}

export function encodeProfileHeaderValue(value) {
  const text = String(value ?? '');
  if (SAFE_HEADER_VALUE.test(text) && !text.startsWith(PROFILE_HEADER_UTF8_PREFIX)) return text;
  return PROFILE_HEADER_UTF8_PREFIX + encodeUtf8Component(text);
}

export function decodeProfileHeaderValue(value) {
  const text = String(value ?? '');
  if (!text.startsWith(PROFILE_HEADER_UTF8_PREFIX)) return text;
  try {
    return decodeURIComponent(text.slice(PROFILE_HEADER_UTF8_PREFIX.length));
  } catch {
    return text;
  }
}

export function parseProfileSelectionValue(value) {
  const text = String(value ?? '');
  if (text.startsWith('id:')) return { kind: 'id', value: text.slice(3) };
  if (text.startsWith('name:')) return { kind: 'name', value: text.slice(5) };
  return { kind: 'legacy', value: text };
}

function profileId(profile) {
  return String(profile?.id ?? '').trim();
}

function profileName(profile) {
  return String(profile?.name ?? '').trim();
}

/**
 * Returns a stable key for a profile even when a user has reused its id.
 * Legacy ids remain unchanged while an unambiguous display name is used for
 * duplicate ids, so older settings continue to resolve to their first match.
 */
export function profileSelectionKey(profile, profiles = []) {
  const candidates = Array.isArray(profiles) ? profiles.filter(Boolean) : [];
  const id = profileId(profile);
  const name = profileName(profile);
  if (!id) return name ? `name:${name}` : '';
  const idMatches = candidates.filter((candidate) => profileId(candidate) === id);
  const nameMatches = name ? candidates.filter((candidate) => profileName(candidate) === name) : [];
  const nameCollidesWithId = name && candidates.some((candidate) => candidate !== profile && profileId(candidate) === name);
  if (idMatches.length === 1 && !nameCollidesWithId) return id;
  if (name && nameMatches.length === 1 && !nameCollidesWithId) return `name:${name}`;
  return `id:${id}`;
}

export function findProfileBySelectionKey(profiles, value) {
  const candidates = Array.isArray(profiles) ? profiles.filter(Boolean) : [];
  const selection = parseProfileSelectionValue(value);
  const target = String(selection.value || '').trim();
  if (!target) return null;
  if (selection.kind === 'id') return candidates.find((profile) => profileId(profile) === target) || null;
  if (selection.kind === 'name') return candidates.find((profile) => profileName(profile) === target) || null;
  return candidates.find((profile) => profileId(profile) === target)
    || candidates.find((profile) => profileName(profile) === target)
    || null;
}
