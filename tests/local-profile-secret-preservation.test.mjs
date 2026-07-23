import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = await readFile(new URL('../scripts/local-preview-server.mjs', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unable to extract ${name}`);
}

const preserveProfileSecrets = new Function(
  `${extractFunction('isProxyPlaceholder')}
${extractFunction('profileIdentityPart')}
${extractFunction('uniqueProfileByField')}
${extractFunction('existingProfileForSecrets')}
${extractFunction('preserveProfileSecrets')}
return preserveProfileSecrets;`
)();

const existing = [
  { id: 'gpt-image-2', name: '4K 超分', apiKey: 'super-resolution-key', nativeApiKey: 'super-native' },
  { id: 'gpt-image-2', name: '原生', apiKey: 'native-key', nativeApiKey: 'native-native' }
];
const incoming = existing.map(({ id, name }) => ({
  id,
  name,
  apiKey: '***MASKED***',
  nativeApiKey: '***MASKED***'
}));

const preserved = preserveProfileSecrets(incoming, existing);
assert.equal(preserved[0].apiKey, 'super-resolution-key');
assert.equal(preserved[0].nativeApiKey, 'super-native');
assert.equal(preserved[1].apiKey, 'native-key');
assert.equal(preserved[1].nativeApiKey, 'native-native');

const renamed = preserveProfileSecrets([
  { id: 'only-profile', name: 'renamed', apiKey: '***MASKED***' }
], [{ id: 'only-profile', name: 'original', apiKey: 'only-key' }]);
assert.equal(renamed[0].apiKey, 'only-key', 'a uniquely identified profile may still be renamed without losing its key');

const reordered = preserveProfileSecrets([
  incoming[1],
  incoming[0]
], existing);
assert.equal(reordered[0].apiKey, 'native-key');
assert.equal(reordered[1].apiKey, 'super-resolution-key');

console.log('[local-profile-secret-preservation] duplicate profile ids retain their distinct secrets');
