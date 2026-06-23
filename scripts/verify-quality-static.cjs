const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const failures = [];
function ok(cond, msg){ if(!cond) failures.push(msg); }
function read(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
const prompts = read('prompts.html');
const bundle = read('assets/index-CZHhOunP-gpt2-20260621-agent-prompts-2.js');
ok(!prompts.includes('filteredData=filteredData.concat(rows)'), '/prompts still appends unlimited prompt DOM data.');
ok(prompts.includes('filteredData=rows'), '/prompts should replace current page rows instead of appending.');
ok(prompts.includes('function updatePager()'), '/prompts pager state function missing.');
ok(prompts.includes('sessionStorage.setItem("prompt_to_use"'), '/prompts use-prompt handoff missing.');
ok(prompts.includes('localStorage.setItem("gpt-image2-pending-prompt"'), '/prompts localStorage prompt handoff missing.');
ok(prompts.includes('escHtml') && prompts.includes('escAttr'), '/prompts escaping helpers missing.');
ok(bundle.includes('const tk=30'), 'Workbench prompt repo page size should be capped to 30.');
ok(bundle.includes('O(Y<5&&Y*tk<(H.total||V.length))'), 'Workbench prompt repo should cap automatic pages to 5.');
ok(!/api\.github\.com\/repos\//.test(bundle), 'Main bundle still calls GitHub release API.');
for (const token of ['GPT Image Playground','github.com/CookSleep','CookSleep/gpt_image_playground']) {
  ok(!bundle.toLowerCase().includes(token.toLowerCase()), `Main bundle still contains upstream trace: ${token}`);
}
for (const token of ['__gptImage2MultiImageRetry','failedRequests','retryableMultiImageFailure','setLightboxImageId','selectedTaskIds','task-card-wrapper']) {
  ok(bundle.includes(token), `Main bundle lost required regression anchor: ${token}`);
}
if (failures.length) {
  console.error('Quality static checks failed:');
  failures.forEach(f => console.error('- ' + f));
  process.exit(1);
}
console.log('Quality static checks passed.');
