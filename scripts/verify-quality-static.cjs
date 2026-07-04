const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];

function ok(condition, message) {
  if (!condition) failures.push(message);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const index = read('index.html');
const prompts = read('prompts.html');
const home = read('assets/homepage-v3.js');

ok(index.includes('/assets/homepage-v3.js?v=home-v3-'), '/ must load the standalone homepage v3 module with a cache-busted URL.');
ok(index.includes('/assets/homepage-v3.css?v=home-v3-'), '/ must load the standalone homepage v3 stylesheet with a cache-busted URL.');
ok(!/assets\/index-[^"']+\.js/.test(index), '/ must not load the legacy React homepage bundle.');

ok(!prompts.includes('filteredData=filteredData.concat(rows)'), '/prompts still appends unlimited prompt DOM data.');
ok(prompts.includes('filteredData=rows'), '/prompts should replace current page rows instead of appending.');
ok(prompts.includes('function updatePager()'), '/prompts pager state function missing.');
ok(prompts.includes('sessionStorage.setItem("prompt_to_use"'), '/prompts use-prompt handoff missing.');
ok(prompts.includes('localStorage.setItem("gpt-image2-pending-prompt"'), '/prompts localStorage prompt handoff missing.');
ok(prompts.includes('escHtml') && prompts.includes('escAttr'), '/prompts escaping helpers missing.');

ok(home.includes('const PROMPT_PAGE_SIZE = 36'), 'Homepage v3 prompt repository page size should be bounded.');
ok(home.includes('requestSeq') && home.includes('debouncedPromptSearch'), 'Homepage v3 prompt search should guard stale async results.');
ok(home.includes('selectedTaskIds') && home.includes('deleteSelected') && home.includes('downloadSelected'), 'Homepage v3 batch selection actions are missing.');
ok(home.includes('resolveTaskProfile') && home.includes('retryTask') && home.includes('topUpTask'), 'Homepage v3 retry/top-up profile resolution anchors are missing.');
ok(home.includes('onPersistedImages') && home.includes('normalizeRestoredTask'), 'Homepage v3 task persistence/restore anchors are missing.');
ok(home.includes('renderViewer') && home.includes('viewer-prev') && home.includes('viewer-index'), 'Homepage v3 multi-image viewer navigation anchors are missing.');
ok(home.includes('agentFailureDetail') && home.includes('agentRequestTimeoutSeconds'), 'Homepage v3 Agent timeout/error detail anchors are missing.');

ok(!/api\.github\.com\/repos\//.test(home), 'Homepage v3 must not call GitHub release APIs.');
for (const token of ['GPT Image Playground', 'github.com/CookSleep', 'CookSleep/gpt_image_playground']) {
  ok(!home.toLowerCase().includes(token.toLowerCase()), `Homepage v3 still contains upstream trace: ${token}`);
}

if (failures.length) {
  console.error('Quality static checks failed:');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('Quality static checks passed.');
