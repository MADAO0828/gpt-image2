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
const promptsCss = read('assets/macos-design.css');
const home = read('assets/homepage-v3.js');

ok(index.includes('/assets/homepage-v3.js?v=home-v3-'), '/ must load the standalone homepage v3 module with a cache-busted URL.');
ok(index.includes('/assets/homepage-v3.css?v=home-v3-'), '/ must load the standalone homepage v3 stylesheet with a cache-busted URL.');
ok(!/assets\/index-[^"']+\.js/.test(index), '/ must not load the legacy React homepage bundle.');

ok(/PROMPT_DOM_LIMIT\s*=\s*ITEMS_PER_PAGE\s*\*\s*2/.test(prompts)
  && /rows\.slice\(0,PROMPT_DOM_LIMIT\)/.test(prompts)
  && /rows\.slice\(0,ITEMS_PER_PAGE\)/.test(prompts)
  && /Math\.ceil\(overflow\/ITEMS_PER_PAGE\)/.test(prompts)
  && /function evictPromptWindow\(count\)/.test(prompts)
  && /filteredData=filteredData\.slice\(evictedCount\)\.concat\(nextRows\)/.test(prompts)
  && /anchor\.getBoundingClientRect\(\)\.top/.test(prompts)
  && /grid\.scrollTop\+=delta/.test(prompts), '/prompts progressive rendering must enforce a fixed sliding DOM/data window with scroll anchoring.');
ok(!prompts.includes('filteredData=filteredData.concat(rows)'), '/prompts must not append raw page rows without the fixed window.');
ok(!prompts.includes('if(filteredData.length>=PROMPT_DOM_LIMIT){clearSentinelObserver();return;}'), '/prompts must continue sentinel prefetch after reaching the DOM window cap.');
ok(prompts.includes('function reloadList(){cancelImagePrewarm();clearPromptPrefetch();filteredData=[];'), '/prompts category/search changes must reset accumulated rows and prefetch state.');
ok(prompts.includes('prefetchCacheKey(page,viewKey)')
  && prompts.includes('fetchWithAbort(url,{cache:"force-cache"},"prefetch")'), '/prompts prefetch must use a keyed independent cache/request slot.');
ok(prompts.includes('requestSeq!==pageRequestSeq') && prompts.includes('viewKey!==promptViewKey()'), '/prompts async page results must reject stale request/view results.');
ok(prompts.includes('new IntersectionObserver(function(entries)')
  && prompts.includes('root:grid')
  && prompts.includes('rootMargin:isMobileViewport()?"700px 0px":"900px 0px"'), '/prompts must prefetch from a bounded sentinel in the actual scroll grid.');
ok(prompts.includes('function hasMorePromptPage(page){return !!totalItems&&Math.max(0,(Number(page)||0)-1)*ITEMS_PER_PAGE<totalItems}')
  && prompts.includes('if(!hasMorePromptPage(page)){clearSentinelObserver();return;}')
  && prompts.includes('hasNext=hasMorePromptPage(currentPage+1)'), '/prompts next-page guards must use the pending page start index so a final partial page is loadable.');
ok(prompts.includes('function updatePager()'), '/prompts pager state function missing.');
ok(prompts.includes('sessionStorage.setItem("prompt_to_use"'), '/prompts use-prompt handoff missing.');
ok(prompts.includes('localStorage.setItem("gpt-image2-pending-prompt"'), '/prompts localStorage prompt handoff missing.');
ok(prompts.includes('escHtml') && prompts.includes('escAttr'), '/prompts escaping helpers missing.');
ok(prompts.includes('root:document.getElementById("grid")||null'), '/prompts image lazy-loader must use the inner grid as its IntersectionObserver root.');
ok(promptsCss.includes('.c .grid .card {\n  content-visibility: visible !important;\n  contain-intrinsic-size: none !important;\n}'), '/prompts cards must disable content-visibility skipping and intrinsic sizing.');
ok(!prompts.includes('gpt-image2-cache-cleaned-mobile-b36') && !prompts.includes('navigator.serviceWorker.getRegistrations') && !prompts.includes('caches.keys'), '/prompts must not clear caches or unregister service workers during initialization.');

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
