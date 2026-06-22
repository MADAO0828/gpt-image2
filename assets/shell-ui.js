// GPT Image2 unified shell helpers - b18 20260623
// This file only normalizes shared page chrome. It must not mutate React-owned
// workbench content except for already body-level shell nodes.
(function () {
  if (window.GptShell && window.GptShell.version) return;

  var version = 'shell-ui-b18-20260623';

  function esc(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
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
    } catch (e) {}
  }

  window.GptShell = {
    version: version,
    setAccount: setAccount,
    enhanceNav: enhanceNav
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { enhanceNav(document); }, { once: true });
  } else {
    enhanceNav(document);
  }
})();
