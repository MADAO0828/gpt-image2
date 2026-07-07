const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'prompts_data.json');
const outDir = path.join(root, 'prompts_fast');
const categoryDir = path.join(outDir, 'categories');
const detailDir = path.join(outDir, 'details');
const outPath = path.join(outDir, 'bootstrap.json');
const previewPath = path.join(outDir, 'category_previews.json');
const searchPath = path.join(outDir, 'search_index.json');
const pageSize = 36;
const detailChunkSize = 100;

function firstPromptImage(row) {
  const images = Array.isArray(row && row.images) ? row.images : [];
  for (const image of images) {
    if (!image) continue;
    const url = image.url || image.image_url || image.imageUrl || image.src || image.href;
    if (url) return url;
  }
  return '';
}

function normalizePrompt(row, fallbackId) {
  row = row || {};
  return {
    id: row.id || fallbackId || 0,
    c: row.category || row.c || '',
    t: row.title || row.t || '',
    p: row.prompt || row.p || row.description || '',
    i: row.image_url || row.imageUrl || row.i || firstPromptImage(row) || ''
  };
}
function previewPrompt(item) {
  const text = String(item.p || '');
  return {
    ...item,
    p: text.length > 32 ? `${text.slice(0, 32)}...` : text,
    partial: text.length > 32
  };
}
function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
function searchPrompt(item) {
  const text = String(item.p || '');
  const searchText = text.length > 72 ? text.slice(0, 72) : text;
  return {
    id: item.id,
    c: item.c,
    t: item.t,
    p: text.length > 48 ? `${text.slice(0, 48)}...` : text,
    i: item.i,
    q: normalizeSearchText(`${item.c} ${item.t} ${searchText}`),
    partial: text.length > 96,
    d: ''
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const rows = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (!Array.isArray(rows)) {
  throw new Error('prompts_data.json must be an array');
}

const categories = ['all'];
const seen = new Set(categories);
const categoryBuckets = new Map();

rows.forEach((row, index) => {
  const category = row.category || row.c || '';
  if (category) {
    if (!seen.has(category)) {
      seen.add(category);
      categories.push(category);
    }
    if (!categoryBuckets.has(category)) categoryBuckets.set(category, []);
    categoryBuckets.get(category).push({ row, index });
  }
});

const allFirstPage = {
  prompts: rows.slice(0, pageSize).map((row, index) => normalizePrompt(row, index + 1)),
  total: rows.length,
  page: 1,
  limit: pageSize,
  pages: Math.ceil(rows.length / pageSize),
  source: 'prebuilt-bootstrap'
};

const categoryFiles = {};
const categoryCounts = {};
const categoryPreviewPages = {};
const normalizedRows = rows.map((row, index) => normalizePrompt(row, index + 1));
const searchIndex = normalizedRows.map(searchPrompt);
ensureDir(outDir);
fs.rmSync(categoryDir, { recursive: true, force: true });
fs.rmSync(detailDir, { recursive: true, force: true });
ensureDir(categoryDir);
ensureDir(detailDir);
let categoryIndex = 1;
for (const category of categories) {
  if (category === 'all') continue;
  const bucket = categoryBuckets.get(category) || [];
  const fileName = `category-${String(categoryIndex).padStart(3, '0')}.json`;
  categoryIndex += 1;
  const pagePayload = {
    prompts: bucket.slice(0, pageSize).map(({ row, index }) => normalizePrompt(row, index + 1)),
    total: bucket.length,
    page: 1,
    limit: pageSize,
    pages: Math.ceil(bucket.length / pageSize),
    source: 'prebuilt-bootstrap-category'
  };
  fs.writeFileSync(path.join(categoryDir, fileName), JSON.stringify(pagePayload));
  categoryFiles[category] = `categories/${fileName}`;
  categoryCounts[category] = bucket.length;
  categoryPreviewPages[category] = {
    ...pagePayload,
    prompts: pagePayload.prompts.map(previewPrompt),
    source: 'prebuilt-bootstrap-category-preview'
  };
}

let detailChunkIndex = 1;
for (let offset = 0; offset < normalizedRows.length; offset += detailChunkSize) {
  const chunk = normalizedRows.slice(offset, offset + detailChunkSize);
  const fileName = `chunk-${String(detailChunkIndex).padStart(3, '0')}.json`;
  const detailPath = `details/${fileName}`;
  for (let i = offset; i < Math.min(offset + detailChunkSize, searchIndex.length); i += 1) {
    searchIndex[i].d = detailPath;
  }
  fs.writeFileSync(path.join(detailDir, fileName), JSON.stringify({
    prompts: chunk,
    offset,
    limit: detailChunkSize,
    source: 'prebuilt-detail-chunk'
  }));
  detailChunkIndex += 1;
}

const payload = {
  generatedAt: new Date().toISOString(),
  pageSize,
  categories,
  total: rows.length,
  allFirstPage,
  categoryFiles,
  categoryCounts,
  categoryPreviewPages
};
const previewPayload = {
  generatedAt: payload.generatedAt,
  pageSize,
  categoryPreviewPages
};

fs.writeFileSync(outPath, JSON.stringify(payload));
fs.writeFileSync(previewPath, JSON.stringify(previewPayload));
fs.writeFileSync(searchPath, JSON.stringify({
  generatedAt: payload.generatedAt,
  total: searchIndex.length,
  prompts: searchIndex
}));
console.log(`[build-prompt-fast-cache] wrote ${path.relative(root, outPath)} (${Buffer.byteLength(JSON.stringify(payload))} bytes)`);
console.log(`[build-prompt-fast-cache] wrote ${path.relative(root, previewPath)} (${Buffer.byteLength(JSON.stringify(previewPayload))} bytes)`);
console.log(`[build-prompt-fast-cache] wrote ${path.relative(root, searchPath)} (${Buffer.byteLength(JSON.stringify({ generatedAt: payload.generatedAt, total: searchIndex.length, prompts: searchIndex }))} bytes)`);
console.log(`[build-prompt-fast-cache] wrote ${categoryIndex - 1} category first-page files`);
console.log(`[build-prompt-fast-cache] wrote ${detailChunkIndex - 1} detail chunk files`);
