const fs = require('fs');
const path = require('path');
const bundle = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index-CZHhOunP-gpt2-20260621-agent-prompts-2.js'), 'utf8');

function assertContains(name, needle) {
  if (!bundle.includes(needle)) {
    console.error(`FAIL ${name}: missing ${needle}`);
    process.exitCode = 1;
  } else {
    console.log(`OK   ${name}`);
  }
}

// Gallery image generation JSON body must include toolbar params.
assertContains('generation sends size/output_format/moderation', 'const k={model:r.model,prompt:u,size:s.size,output_format:s.output_format,moderation:s.moderation}');
assertContains('generation sends quality unless codexCli', 'r.codexCli||(k.quality=s.quality)');
assertContains('generation sends jpeg/webp compression only', 's.output_format!=="png"&&s.output_compression!=null&&(k.output_compression=s.output_compression)');
assertContains('generation sends n only when >1', 's.n>1&&(k.n=s.n)');
assertContains('generation sends stream flags from profile', 'r.streamImages&&(k.stream=!0,k.partial_images=Ph(r))');

// Edit / image-to-image FormData branch must include the same toolbar params.
assertContains('edit sends quality unless codexCli', 'r.codexCli||k.append("quality",s.quality)');
assertContains('edit sends jpeg/webp compression only', 's.output_format!=="png"&&s.output_compression!=null&&k.append("output_compression",String(s.output_compression))');
assertContains('edit sends n only when >1', 's.n>1&&k.append("n",String(s.n))');

// Parameter normalization must not silently keep compression for PNG, and codexCli should disable quality.
assertContains('png disables output_compression', 'u.output_format==="png"&&(u.output_compression=oa.output_compression)');
assertContains('codexCli resets quality to auto', 's.provider==="openai"&&s.codexCli&&(u.quality=oa.quality)');

// 4K mapping currently used by the toolbar.
assertContains('4K 16:9 maps to 3840x2160', '"16:9":"3840x2160"');

if (process.exitCode) process.exit(process.exitCode);
