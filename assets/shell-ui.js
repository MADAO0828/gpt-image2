// NexGen unified shell helpers
// This file only normalizes shared page chrome. It must not mutate React-owned
// workbench content except for already body-level shell nodes.
(function () {
  if (window.GptShell && window.GptShell.version) return;

  var version = 'shell-ui-b38-20260705';
  var THEME_KEY = 'gpt-image2.theme';
  var LEGACY_THEME_KEY = 'gpt-image2-theme';
  var themeListenersBound = false;

  function esc(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function safeLocalStorageGet(key) {
    try {
      return window.localStorage ? localStorage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }

  function safeLocalStorageSet(key, value) {
    try {
      if (!window.localStorage) return false;
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function safeLocalStorageRemove(key) {
    try {
      if (window.localStorage) localStorage.removeItem(key);
    } catch (e) {}
  }

  function normalizeThemeMode(value) {
    return value === 'dark' || value === 'system' ? value : 'light';
  }

  function prefersDark() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) {
      return false;
    }
  }

  function migrateLegacyTheme() {
    var current = safeLocalStorageGet(THEME_KEY);
    if (current) return normalizeThemeMode(current);
    var legacy = safeLocalStorageGet(LEGACY_THEME_KEY);
    if (!legacy) return null;
    var normalized = normalizeThemeMode(legacy);
    safeLocalStorageSet(THEME_KEY, normalized);
    safeLocalStorageRemove(LEGACY_THEME_KEY);
    return normalized;
  }

  function currentThemeMode(fallback) {
    return normalizeThemeMode(migrateLegacyTheme() || safeLocalStorageGet(THEME_KEY) || fallback || 'light');
  }

  function resolveThemeMode(mode) {
    return mode === 'system' ? (prefersDark() ? 'dark' : 'light') : normalizeThemeMode(mode);
  }

  function nextThemeMode(mode) {
    var current = normalizeThemeMode(mode || 'system');
    return current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
  }

  function themeLabel(mode) {
    return mode === 'dark' ? '\u4e3b\u9898\uff1a\u6df1\u8272' : mode === 'system' ? '\u4e3b\u9898\uff1a\u8ddf\u968f\u7cfb\u7edf' : '\u4e3b\u9898\uff1a\u6d45\u8272';
  }

  function themeIconSvg(mode) {
    if (mode === 'dark') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3.3a8.8 8.8 0 1 0 5.2 15.4 9.6 9.6 0 0 1-7.7 3.8A9.5 9.5 0 0 1 9.4 4a9.6 9.6 0 0 1 6.1-.7Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (mode === 'system') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="2.7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 19h6M12 16v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.8v2.4M12 18.8v2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M2.8 12h2.4M18.8 12h2.4M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }

  function themeButtons(root) {
    try {
      var scope = root || document;
      var nodes = Array.prototype.slice.call(scope.querySelectorAll('[data-theme-toggle-button], #theme-toggle'));
      return nodes.filter(function (node, index) { return nodes.indexOf(node) === index; });
    } catch (e) {
      return [];
    }
  }

  function syncThemeButtons(root, mode, resolved, animate) {
    themeButtons(root).forEach(function (button) {
      var previous = button.getAttribute('data-theme-mode') || '';
      var label = themeLabel(mode);
      button.setAttribute('data-theme-mode', mode);
      button.setAttribute('data-theme-resolved', resolved);
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.classList.toggle('is-light', mode === 'light');
      button.classList.toggle('is-dark', mode === 'dark');
      button.classList.toggle('is-system', mode === 'system');
      var icon = button.querySelector('.theme-toggle-icon, .nav-ico') || button;
      icon.innerHTML = themeIconSvg(mode);
      if (animate && previous && previous !== mode) {
        button.classList.remove('is-animating');
        void button.offsetWidth;
        button.classList.add('is-animating');
        setTimeout(function () {
          button.classList.remove('is-animating');
        }, 280);
      }
    });
  }

  function updateMetaThemeColor(resolved) {
    try {
      var meta = document.getElementById('meta-theme-color');
      if (meta) meta.content = resolved === 'dark' ? '#0f172a' : '#ffffff';
    } catch (e) {}
  }

  function applyTheme(mode, animateButtons) {
    var normalized = currentThemeMode(mode || 'light');
    safeLocalStorageSet(THEME_KEY, normalized);
    safeLocalStorageRemove(LEGACY_THEME_KEY);
    var resolved = resolveThemeMode(normalized);
    var root = document.documentElement;
    if (root) {
      root.dataset.themeMode = normalized;
      root.setAttribute('data-theme', resolved);
      root.classList.toggle('dark', resolved === 'dark');
      root.classList.toggle('light', resolved !== 'dark');
    }
    updateMetaThemeColor(resolved);
    syncThemeButtons(document, normalized, resolved, !!animateButtons);
    return { mode: normalized, resolved: resolved };
  }

  function setTheme(mode, options) {
    var normalized = normalizeThemeMode(mode);
    safeLocalStorageSet(THEME_KEY, normalized);
    safeLocalStorageRemove(LEGACY_THEME_KEY);
    var result = applyTheme(normalized, !(options && options.silent));
    if (options && typeof options.onChange === 'function') {
      try {
        options.onChange(result);
      } catch (e) {}
    }
    return result;
  }

  function toggleTheme(options) {
    return setTheme(nextThemeMode(currentThemeMode('system')), options || {});
  }

  function bindThemeSync() {
    if (themeListenersBound) return;
    themeListenersBound = true;
    try {
      window.addEventListener('storage', function (event) {
        if (!event || (event.key && event.key !== THEME_KEY && event.key !== LEGACY_THEME_KEY)) return;
        if (event.storageArea && event.storageArea !== localStorage) return;
        applyTheme(currentThemeMode('light'), false);
      });
    } catch (e) {}
    try {
      var media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      if (!media) return;
      var onChange = function () {
        if (currentThemeMode('light') === 'system') applyTheme('system', false);
      };
      if (media.addEventListener) media.addEventListener('change', onChange);
      else if (media.addListener) media.addListener(onChange);
    } catch (e) {}
  }

  function normalizeRole(roleOrText) {
    var raw = String(roleOrText || '').toLowerCase();
    return raw.indexOf('admin') >= 0 || raw.indexOf('\u7ba1\u7406') >= 0 ? 'admin' : 'user';
  }

  function setAccount(elOrId, userOrName, role) {
    try {
      var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
      if (!el) return;
      var name = '';
      var resolvedRole = role || 'user';
      if (userOrName && typeof userOrName === 'object') {
        name = userOrName.username || userOrName.name || '';
        resolvedRole = userOrName.role || resolvedRole;
      } else {
        var text = String(userOrName || el.textContent || '').trim();
        resolvedRole = normalizeRole(role || text);
        name = text.replace(/^\s*(\u7ba1\u7406\u5458|\u7528\u6237|admin|user)\s*/i, '').trim();
      }
      name = name || '\u9a8c\u8bc1\u4e2d...';
      resolvedRole = normalizeRole(resolvedRole);
      var label = resolvedRole === 'admin' ? '\u7ba1\u7406\u5458' : '\u7528\u6237';
      el.classList.add('shell-account', 'account-chip');
      if (el.classList.contains('label')) el.classList.add('shell-label-account');
      el.setAttribute('data-role', resolvedRole);
      el.setAttribute('title', label + ' ' + name);
      el.setAttribute('aria-label', label + ' ' + name);
      el.innerHTML = '<span class="account-role">' + esc(label) + '</span><span class="account-name">' + esc(name) + '</span>';
    } catch (e) {}
  }

  function enhanceNav(root) {
    try {
      root = root || document;
      Array.prototype.forEach.call(root.querySelectorAll('.nav,.nav-actions,.site-nav'), function (nav) {
        nav.classList.add('shell-nav');
      });
      var workbench = document.getElementById('workbenchAccountInfo');
      if (workbench && !workbench.querySelector('.account-name')) setAccount(workbench, workbench.textContent || '');
      var admin = document.getElementById('accountInfo');
      if (admin && !admin.querySelector('.account-name')) setAccount(admin, admin.textContent || '');
      var prompts = document.getElementById('promptAccountInfo');
      if (prompts && !prompts.querySelector('.account-name')) setAccount(prompts, prompts.textContent || '');
      var applied = applyTheme(currentThemeMode('light'), false);
      syncThemeButtons(root, applied.mode, applied.resolved, false);
    } catch (e) {}
  }

  window.GptShellTheme = {
    key: THEME_KEY,
    legacyKey: LEGACY_THEME_KEY,
    currentThemeMode: currentThemeMode,
    nextThemeMode: nextThemeMode,
    resolveThemeMode: resolveThemeMode,
    labelForTheme: themeLabel,
    iconHtml: themeIconSvg,
    applyTheme: function (mode) { return applyTheme(mode, false); },
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    syncButtons: function (root) {
      var applied = applyTheme(currentThemeMode('light'), false);
      syncThemeButtons(root || document, applied.mode, applied.resolved, false);
      return applied;
    },
    bind: bindThemeSync,
    migrateLegacyTheme: migrateLegacyTheme
  };

  if (typeof window.__applyTheme !== 'function') window.__applyTheme = function () { return window.GptShellTheme.applyTheme(); };
  if (typeof window.toggleTheme !== 'function') window.toggleTheme = function () { return window.GptShellTheme.toggleTheme(); };

  window.GptShell = {
    version: version,
    setAccount: setAccount,
    enhanceNav: enhanceNav,
    theme: window.GptShellTheme
  };

  bindThemeSync();
  applyTheme(currentThemeMode('light'), false);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { enhanceNav(document); }, { once: true });
  } else {
    enhanceNav(document);
  }
})();
