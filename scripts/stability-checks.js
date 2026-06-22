const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const bundlePath = path.join(root, 'assets', 'index-CZHhOunP-gpt2-20260621-agent-prompts-2.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const failures = [];
function ok(cond, msg){ if(!cond) failures.push(msg); }

// Agent shell patches must not delete/move DOM inside React-owned #root.
ok(!/document\.getElementById\('agentExtraControls'\)[\s\S]{0,160}\.remove\(\)/.test(indexHtml),
  'Agent controls cleanup still calls remove() on a node mounted inside the React tree.');
ok(!/left\.appendChild\(box\)/.test(indexHtml),
  'Agent current-session box is still appended into the React-owned header left slot.');
ok(!/row\.insertBefore\(controls,row\.firstChild\)/.test(indexHtml),
  'Agent extra controls are still inserted into the React-owned input toolbar.');
ok(!/\.prompt-placeholder[\s\S]{0,120}\.textContent\s*=/.test(indexHtml) && !/querySelector\('\.prompt-placeholder'\)[\s\S]{0,220}textContent\s*=/.test(indexHtml),
  'Shell still rewrites React-owned prompt placeholder textContent. Use CSS pseudo-content instead.');
ok(!/inner\.appendChild\(nav\)/.test(indexHtml),
  'Site nav is still appended into the React-owned workbench header.');
ok(indexHtml.includes('ensureAgentShellHost') && indexHtml.includes('agentShellHost'),
  'Agent shell host is missing; custom Agent controls need a non-React body-level host.');
ok(indexHtml.includes('installDomOwnershipGuard') && indexHtml.includes('ignored stale removeChild'),
  'DOM ownership guard is missing; stale React/removeChild crashes can still black-screen Agent.');
ok(/body>#workbenchSiteNav\.site-nav\{position:fixed/.test(indexHtml),
  'Workbench site nav is not protected by a fixed body-level selector.');
ok(indexHtml.includes('function positionShellChrome') && indexHtml.includes('findWorkbenchModeButtons'),
  'Shell chrome positioning is missing; body-level controls will drift away from the Gallery / Agent header.');
ok(!/#agentShellHost\{[^}]*bottom:126px/.test(indexHtml),
  'Agent shell host still uses the old floating bottom layout instead of measured chrome alignment.');
ok(indexHtml.includes('agent-chat-inputbar') && indexHtml.includes('agentExtraControls'),
  'Agent quick controls are not tied to the Agent input bar.');

// Multi-image generation needs explicit retry/recovery markers so a single 5xx/524 slot does not permanently fail while siblings succeed.
ok(bundle.includes('__gptImage2MultiImageRetry'),
  'Main bundle lacks the multi-image retry/recovery patch marker.');
ok(bundle.includes('failedRequests') && bundle.includes('retryableMultiImageFailure'),
  'Main bundle does not expose retryable failed multi-image slots.');

// Cache/version discipline: entry HTML and dynamic chunks must use the same marker.
const markerMatch = indexHtml.match(/index-CZHhOunP-gpt2-20260621-agent-prompts-2\.js\?v=([^"']+)/);
ok(!!markerMatch, 'index.html is missing the main bundle version marker.');
if (markerMatch) {
  const marker = markerMatch[1];
  for (const rel of [
    'assets/highlighted-body-OFNGDK62-BCwJeCkr-a2.js',
    'assets/index-5eh8hj-Z-a2.js',
    'assets/index-DL1LPs_c-a2.js',
    'assets/mermaid-GHXKKRXX-DDXhDTxI-a2.js'
  ]) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    ok(text.includes(`index-CZHhOunP-gpt2-20260621-agent-prompts-2.js?v=${marker}`), `${rel} imports the main bundle with a stale marker.`);
  }
}

if (failures.length) {
  console.error('Stability checks failed:');
  for (const f of failures) console.error('- ' + f);
  process.exit(1);
}
console.log('Stability checks passed.');
