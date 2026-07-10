function normalizedHostname(url) {
  return url.hostname.toLowerCase().replace(/\.$/, '');
}

function isIpLiteral(hostname) {
  if (hostname.includes(':')) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function isLocalHostname(hostname) {
  return hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.lan')
    || hostname.endsWith('.home')
    || hostname === 'host.docker.internal';
}

export function assertSafeUpstreamUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch (error) {
    throw new Error('API URL is invalid');
  }
  if (url.protocol !== 'https:') throw new Error('API URL must use HTTPS');
  if (url.username || url.password) throw new Error('API URL must not contain credentials');
  const hostname = normalizedHostname(url);
  if (!hostname || isIpLiteral(hostname)) throw new Error('API URL must use a public hostname, not an IP literal');
  if (isLocalHostname(hostname)) throw new Error('API URL must not target localhost or a private network hostname');
  return url;
}

export function normalizeSafeBaseUrl(raw, ensureV1 = true) {
  let value = String(raw || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  const url = assertSafeUpstreamUrl(value);
  const parts = url.pathname.split('/').filter(Boolean);
  if (ensureV1 && !parts.includes('v1')) parts.push('v1');
  url.pathname = '/' + parts.join('/');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

export function safeUpstreamEndpoint(baseUrl, path) {
  const base = assertSafeUpstreamUrl(baseUrl);
  const cleanPath = String(path || '').replace(/^\/+/, '');
  const endpoint = assertSafeUpstreamUrl(base.toString().replace(/\/+$/, '') + '/' + cleanPath);
  if (endpoint.origin !== base.origin) throw new Error('API path changed the upstream origin');
  return endpoint.toString();
}
