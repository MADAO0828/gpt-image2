function normalizedHostname(url) {
  return url.hostname.toLowerCase().replace(/\.$/, '');
}

function isIpLiteral(hostname) {
  const value = String(hostname || '').toLowerCase();
  if (value.includes(':')) return true;
  if (!/^\d+(?:\.\d+){0,3}$/.test(value)) return false;
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => {
    const number = Number(part);
    return Number.isInteger(number) && number >= 0 && number <= 255;
  });
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

function isReservedTestHostname(hostname) {
  return hostname === 'example'
    || hostname.endsWith('.example')
    || hostname === 'example.com'
    || hostname.endsWith('.example.com')
    || hostname === 'example.org'
    || hostname.endsWith('.example.org')
    || hostname === 'example.net'
    || hostname.endsWith('.example.net');
}

function parseIpv4(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const octets = parts.map(Number);
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return octets;
}

function isPrivateIpv4(value) {
  const octets = parseIpv4(value);
  if (!octets) return true;
  const [a, b, c, d] = octets;
  return a === 0
    || a === 10
    || a === 100 && b >= 64 && b <= 127
    || a === 127
    || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31
    || a === 192 && b === 0
    || a === 192 && b === 168
    || a === 192 && b === 2
    || a === 192 && b === 88 && c === 99
    || a === 198 && (b === 18 || b === 19 || b === 51)
    || a === 203 && b === 0 && c === 113
    || a >= 224
    || a === 255 && b === 255 && c === 255 && d === 255;
}

function parseIpv6(value) {
  let host = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes(':')) return null;
  const sections = host.split('::');
  if (sections.length > 2) return null;
  const parseSection = (section) => String(section || '').split(':').filter(Boolean).flatMap((part) => {
    if (!part.includes('.')) {
      if (!/^[0-9a-f]{1,4}$/.test(part)) return [Number.NaN];
      return [Number.parseInt(part, 16)];
    }
    const octets = parseIpv4(part);
    if (!octets) return [Number.NaN];
    return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
  });
  const left = parseSection(sections[0]);
  const right = sections.length === 2 ? parseSection(sections[1]) : [];
  if ([...left, ...right].some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return null;
  if (sections.length === 2) {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    return [...left, ...Array(missing).fill(0), ...right];
  }
  return left.length === 8 ? left : null;
}

function isPrivateIp(value) {
  const host = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (!host.includes(':')) return isPrivateIpv4(host);
  const groups = parseIpv6(host);
  if (!groups) return true;
  const mapped = groups.slice(0, 5).every((part) => part === 0) && groups[5] === 0xffff;
  if (mapped) return isPrivateIpv4(`${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`);
  const allZero = groups.every((part) => part === 0);
  const loopback = allZero || groups.slice(0, 7).every((part) => part === 0) && groups[7] === 1;
  const uniqueLocal = (groups[0] & 0xfe00) === 0xfc00;
  const linkLocal = (groups[0] & 0xffc0) === 0xfe80;
  const multicast = (groups[0] & 0xff00) === 0xff00;
  const documentation = groups[0] === 0x2001 && groups[1] === 0x0db8;
  const specialUse = groups[0] === 0x0100 && groups.slice(1, 4).every((part) => part === 0)
    || groups[0] === 0x0064 && groups[1] === 0xff9b
    || groups[0] === 0x2001 && [0, 2, 0x10, 0x20].includes(groups[1])
    || groups[0] === 0x2002;
  return loopback || uniqueLocal || linkLocal || multicast || documentation || specialUse;
}

export function isPrivateIpAddress(value) {
  return isPrivateIp(value);
}

function normalizedAddresses(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))].sort();
}

function sameAddresses(first, second) {
  const left = normalizedAddresses(first);
  const right = normalizedAddresses(second);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizedAllowedHostnames(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/);
  return [...new Set(values
    .map((item) => String(item || '').trim().toLowerCase().replace(/\.$/, ''))
    .filter((item) => /^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(item)))];
}

function hostMatchesAllowlist(hostname, allowedHosts) {
  return allowedHosts.some((allowed) => {
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1);
      return hostname.endsWith(suffix) && hostname.length > suffix.length;
    }
    return hostname === allowed;
  });
}

export function assertUpstreamHostAllowed(rawUrl, allowedHosts) {
  const url = assertSafeUpstreamUrl(rawUrl);
  const configured = String(Array.isArray(allowedHosts) ? allowedHosts.join(',') : allowedHosts || '').trim();
  if (!configured) {
    const error = new Error('生产环境未配置上游域名白名单');
    error.code = 'UPSTREAM_HOST_ALLOWLIST_MISSING';
    throw error;
  }
  const normalized = normalizedAllowedHostnames(allowedHosts);
  if (!normalized.length) {
    const error = new Error('上游域名白名单无有效主机名');
    error.code = 'UPSTREAM_HOST_ALLOWLIST_INVALID';
    throw error;
  }
  if (!hostMatchesAllowlist(normalizedHostname(url), normalized)) {
    const error = new Error('上游 API 域名不在允许列表中');
    error.code = 'UPSTREAM_HOST_NOT_ALLOWED';
    throw error;
  }
  return url;
}

const PUBLIC_DNS_RESOLVERS = Object.freeze([
  { id: 'cloudflare', endpoint: 'https://cloudflare-dns.com/dns-query' },
  { id: 'google', endpoint: 'https://dns.google/resolve' }
]);
const PUBLIC_DNS_ATTEMPT_TIMEOUT_MS = 2500;
const PUBLIC_DNS_TOTAL_TIMEOUT_MS = 5000;

function publicDnsError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function orderedPublicDnsResolvers(preferredResolverId = '') {
  const preferred = PUBLIC_DNS_RESOLVERS.find((resolver) => resolver.id === preferredResolverId);
  if (!preferred) return [...PUBLIC_DNS_RESOLVERS];
  return [preferred, ...PUBLIC_DNS_RESOLVERS.filter((resolver) => resolver.id !== preferred.id)];
}

async function queryPublicDnsResolver(resolver, hostname, signal) {
  if (signal?.aborted) throw publicDnsError('公共 DNS 解析已取消', 'UPSTREAM_DNS_TIMEOUT');
  const controller = new AbortController();
  let attemptTimedOut = false;
  const timeoutId = setTimeout(() => {
    attemptTimedOut = true;
    controller.abort();
  }, PUBLIC_DNS_ATTEMPT_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener?.('abort', abortFromCaller, { once: true });
  if (signal?.aborted) abortFromCaller();
  try {
    const answersByType = await Promise.all(['A', 'AAAA'].map(async (recordType) => {
      const dnsUrl = new URL(resolver.endpoint);
      dnsUrl.searchParams.set('name', hostname);
      dnsUrl.searchParams.set('type', recordType);
      const response = await fetch(dnsUrl.toString(), {
        cache: 'no-store',
        headers: { Accept: 'application/dns-json', 'Cache-Control': 'no-cache' },
        redirect: 'error',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('DNS resolver returned a non-success status');
      const payload = await response.json();
      return Array.isArray(payload?.Answer) ? payload.Answer : [];
    }));
    const addresses = [];
    for (const answer of answersByType.flat()) {
      if (![1, 28].includes(Number(answer?.type))) continue;
      const address = String(answer?.data || '').trim();
      if (!address) continue;
      if (isPrivateIp(address)) throw publicDnsError('上游 API 域名解析到了内部网络', 'UPSTREAM_DNS_REJECTED');
      addresses.push(address);
    }
    return normalizedAddresses(addresses);
  } catch (error) {
    if (error?.code === 'UPSTREAM_DNS_REJECTED') throw error;
    if (signal?.aborted) throw publicDnsError('公共 DNS 解析已取消', 'UPSTREAM_DNS_TIMEOUT');
    if (attemptTimedOut || error?.name === 'AbortError') throw publicDnsError('公共 DNS 解析服务响应超时', 'UPSTREAM_DNS_ATTEMPT_TIMEOUT');
    throw publicDnsError('公共 DNS 解析服务请求失败', 'UPSTREAM_DNS_ATTEMPT_FAILED');
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }
}

export async function resolvePublicAddresses(hostname, signal, options = {}) {
  const normalizedHost = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (signal?.aborted) throw publicDnsError('公共 DNS 解析已取消', 'UPSTREAM_DNS_TIMEOUT');
  if (isReservedTestHostname(normalizedHost) && options.allowReservedTestHostname !== false) return { addresses: [], resolverId: 'reserved' };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PUBLIC_DNS_TOTAL_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener?.('abort', abortFromCaller, { once: true });
  if (signal?.aborted) abortFromCaller();
  let sawEmptyResult = false;
  let lastFailure = null;
  try {
    for (const resolver of orderedPublicDnsResolvers(options.preferredResolverId)) {
      if (controller.signal.aborted) break;
      try {
        const addresses = await queryPublicDnsResolver(resolver, normalizedHost, controller.signal);
        if (!addresses.length) {
          sawEmptyResult = true;
          continue;
        }
        return { addresses, resolverId: resolver.id };
      } catch (error) {
        if (error?.code === 'UPSTREAM_DNS_REJECTED') throw error;
        if (error?.code === 'UPSTREAM_DNS_TIMEOUT' && signal?.aborted) throw error;
        lastFailure = error;
      }
    }
    if (signal?.aborted || controller.signal.aborted) throw publicDnsError('公共 DNS 解析超时', 'UPSTREAM_DNS_TIMEOUT');
    if (sawEmptyResult && !lastFailure) throw publicDnsError('上游 API 域名没有公网解析结果', 'UPSTREAM_DNS_REJECTED');
    throw publicDnsError('公共 DNS 解析服务暂时不可用', 'UPSTREAM_DNS_FAILED');
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }
}

export const DEFAULT_UPSTREAM_TIMEOUT_SECONDS = 600;
export const MAX_UPSTREAM_TIMEOUT_SECONDS = 6000;

export function isUpstreamTimeoutStatus(status, text = '') {
  const code = Number(status);
  const lower = String(text || '').toLowerCase();
  return code === 408
    || code === 524
    || code === 504
    || (code >= 500 && code < 600 && (lower.includes('timeout') || lower.includes('cloudflare')));
}

export function normalizeUpstreamTimeoutSeconds(value, fallback = DEFAULT_UPSTREAM_TIMEOUT_SECONDS) {
  const fallbackNumber = Number(fallback);
  const safeFallback = Number.isFinite(fallbackNumber) && fallbackNumber > 0 ? fallbackNumber : DEFAULT_UPSTREAM_TIMEOUT_SECONDS;
  const requested = Number(value);
  const seconds = Number.isFinite(requested) && requested > 0 ? requested : safeFallback;
  return Math.max(1, Math.min(Math.ceil(seconds), MAX_UPSTREAM_TIMEOUT_SECONDS));
}

export async function assertPublicUpstreamUrl(rawUrl, signal, expectedAddresses) {
  const url = assertSafeUpstreamUrl(rawUrl);
  const resolved = await resolvePublicAddresses(normalizedHostname(url), signal);
  const addresses = resolved.addresses;
  if (expectedAddresses !== undefined && !sameAddresses(addresses, expectedAddresses)) {
    throw publicDnsError('上游 API 域名解析在请求期间发生变化', 'UPSTREAM_DNS_REBOUND');
  }
  return addresses;
}

export function pinUpstreamFetchInit(init = {}, resolvedAddresses = []) {
  const addresses = normalizedAddresses(resolvedAddresses);
  if (!addresses.length) return { ...init };
  if (addresses.some((address) => isPrivateIp(address))) {
    throw publicDnsError('上游 API 域名解析到了内部网络', 'UPSTREAM_DNS_REJECTED');
  }
  // Workers 不允许把 IP 地址作为 cf.resolveOverride；请求继续使用已校验的原始主机名。
  return { ...init };
}

export async function fetchPinnedUpstream(rawUrl, init = {}, options = {}) {
  const requireAllowlist = options?.requireAllowlist === true;
  const url = !requireAllowlist && options?.allowedHosts === undefined
    ? assertSafeUpstreamUrl(rawUrl)
    : assertUpstreamHostAllowed(rawUrl, options.allowedHosts);
  const resolved = await resolvePublicAddresses(normalizedHostname(url), init?.signal);
  const response = resolved.addresses.length
    ? await fetchWithPinnedAddress(url.toString(), resolved.addresses, init, { preferredResolverId: resolved.resolverId })
    : await fetch(url.toString(), pinUpstreamFetchInit(init, resolved.addresses));
  return { response, addresses: resolved.addresses, resolverId: resolved.resolverId };
}

export async function fetchWithPinnedAddress(rawUrl, address, init = {}, options = {}) {
  const url = assertSafeUpstreamUrl(rawUrl);
  const expectedAddresses = normalizedAddresses(Array.isArray(address) ? address : [address]);
  if (isReservedTestHostname(normalizedHostname(url))) return fetch(url.toString(), pinUpstreamFetchInit(init, expectedAddresses));
  if (!expectedAddresses.length || expectedAddresses.some((candidate) => isPrivateIp(candidate))) {
    throw publicDnsError('上游 API 域名解析到了内部网络', 'UPSTREAM_DNS_REJECTED');
  }
  const current = await resolvePublicAddresses(normalizedHostname(url), init?.signal, { preferredResolverId: options.preferredResolverId });
  if (!sameAddresses(current.addresses, expectedAddresses)) {
    throw publicDnsError('上游 API 域名解析在请求期间发生变化', 'UPSTREAM_DNS_REBOUND');
  }
  return fetch(url.toString(), pinUpstreamFetchInit(init, current.addresses));
}

export function bindClientAbort(request, controller) {
  if (!controller || typeof controller.abort !== 'function') throw new Error('AbortController is required');
  const signal = request?.signal;
  let clientAborted = Boolean(signal?.aborted);
  const abortFromClient = () => {
    clientAborted = true;
    if (!controller.signal.aborted) controller.abort();
  };
  if (clientAborted) abortFromClient();
  else signal?.addEventListener?.('abort', abortFromClient, { once: true });
  return {
    wasAborted() { return clientAborted || Boolean(signal?.aborted); },
    cleanup() { signal?.removeEventListener?.('abort', abortFromClient); }
  };
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
