const STORE_KEY = 'gpt-image2.home.v3';
const THEME_KEY = 'gpt-image2.theme';
const COMPOSER_SESSION_KEY = 'gpt-image2.home.v3.composer-session';
const ENTRY_ADVANCED_PREFIX = 'nexgen-entry-advanced.';
const PERSISTED_PROMPT_KEY = 'gpt-image2.home.v3.persisted-prompt';
const DB_NAME = 'gpt-image2-home-v3';
const DB_STORE = 'blobs';
const PROMPT_PAGE_SIZE = 36;
const PROMPT_VIRTUAL_THRESHOLD = 108;
const PROMPT_VIRTUAL_BUFFER_ROWS = 3;
const PROMPT_REPO_CACHE_LIMIT = 24;
const PROMPT_FAST_VERSION = 'home-v3-20260705-prompt-complete-r48';
const PROMPT_FAST_BOOTSTRAP_URL = `/prompts_fast/bootstrap.json?v=${PROMPT_FAST_VERSION}`;
const PROMPT_FAST_PREVIEWS_URL = `/prompts_fast/category_previews.json?v=${PROMPT_FAST_VERSION}`;
const PROMPT_FAST_SEARCH_URL = `/prompts_fast/search_index.json?v=${PROMPT_FAST_VERSION}`;
const GALLERY_VIRTUAL_BUFFER_ROWS = 4;
const GALLERY_VIRTUAL_THRESHOLD = 42;
const COMPOSER_SETTING_KEYS = ['quality', 'output_format', 'output_compression', 'n', 'transparent_output', 'moderation', 'openaiSize', 'openaiAspectRatio', 'googleBaseResolution', 'googleAspectRatio', 'xaiResolution', 'xaiAspectRatio'];
const COMPOSER_SESSION_FIELDS = ['activeImageProfileId', 'activeProfileId'];

const PROVIDER = {
  openai: {
    name: 'OpenAI',
    refLimit: 4,
    qualities: ['auto', 'low', 'medium', 'high'],
    formats: ['png', 'jpeg', 'webp'],
    sizes: [
      { label: 'auto', value: 'auto', note: '提示词优先，模型自动判断' },
      { label: '1024 x 1024', value: '1024x1024', note: '正方形' },
      { label: '1536 x 1024', value: '1536x1024', note: '横图' },
      { label: '1024 x 1536', value: '1024x1536', note: '竖图' },
      { label: '自定义', value: 'custom', note: '宽高为 16 的倍数' }
    ]
  },
  google: {
    name: 'Google',
    refLimit: 14,
    baseResolutions: ['1K', '2K', '4K'],
    ratios25: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    ratios31: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']
  },
  xai: {
    name: 'Xai',
    refLimit: 3,
    resolutions: ['1k', '2k'],
    ratios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20']
  }
};

const BRUSH_COLORS = [
  { name: '黄', value: '#facc15' },
  { name: '橙', value: '#fb923c' },
  { name: '红', value: '#ef4444' },
  { name: '绿', value: '#22c55e' },
  { name: '青', value: '#06b6d4' },
  { name: '蓝', value: '#3b82f6' },
  { name: '紫', value: '#a855f7' }
];

const HOMEPAGE_V3_TEST_HOOKS = typeof window !== 'undefined' ? (window.__homepageV3TestHooks = window.__homepageV3TestHooks || {}) : null;

const DEFAULT_AGENT_BUDGET = {
  maxSteps: 5,
  maxImages: 8,
  concurrency: 2,
  continueOnStepError: true
};

const DEFAULT_PREFERENCES = {
  themeMode: 'light',
  referenceImageEditAction: 'ask',
  persistInputOnRestart: false,
  clearInputAfterSubmit: false,
  taskCompletionNotification: false,
  alwaysShowRetryButton: true,
  reuseTaskApiProfileTemporarily: false,
  allowPromptRewrite: true,
  enterSubmit: false,
  zipDownloadRoutes: ['task-selection', 'favorite-collection-selection', 'task-detail-all', 'workflow-run-all']
};

const DEFAULT_ENTRY_ADVANCED = {
  responseFormatB64Json: null,
  streamImages: null,
  streamPartialImages: null,
  timeout: null,
  open: false
};

const PRO_WORKBENCH_MODES = {
  ai: {
    title: 'AI 模式',
    label: 'AI 模式',
    icon: 'AI',
    maxRefs: 1,
    helper: '上传底图后先生成专业参数报告，再编辑回填提示词并进行渲染。',
    placeholder: '描述你的目标效果，例如时间、天气、商业氛围、建筑表现重点。'
  },
  manual: {
    title: '手动模式',
    label: '手动模式',
    icon: 'M',
    maxRefs: 1,
    helper: '完整控制时间、天气、灯光、设备、配景和成片质感，按专业参数生成强保结构渲染。',
    placeholder: '可补充项目背景、客户要求、特殊材质、画面氛围或需要避免的问题。'
  },
  styleTransfer: {
    title: '灵感迁移',
    label: '灵感迁移',
    icon: 'S',
    maxRefs: 2,
    helper: '上传底图和参考图，将参考图的风格、色彩、材质或氛围迁移到底图。',
    placeholder: '描述你希望迁移的风格重点，例如配色、材质、灯光、构图或品牌调性。'
  }
};

const PRO_MANUAL_SCHEMA = {
  scenes: ['建筑外景', '室内空间', '景观园林', '城市规划'],
  time: ['4:30 黎明前', '5:50 破晓微光', '6:30 日出边光', '7:25 朝阳暖光', '8:30 清晨柔光', '9:40 侧顺柔光', '10:30 明亮日景', '11:20 通透正午前', '12:10 顶置硬光', '13:30 午后白光', '14:00 午后柔光', '14:35 平射冷光', '15:30 下午侧光', '16:50 斜射金辉', '17:20 暖金低阳', '17:45 黄金时刻', '18:00 橙粉落日', '18:15 粉色晚霞', '18:45 暮色暖调', '19:00 城市亮灯', '19:30 蓝调时刻', '20:10 夜灯氛围光', '22:00 宁静深夜'],
  weather: ['晴朗', '多云', '阴天', '小雨', '阵雨', '雷阵雨', '雨后阴天', '雨后晴天', '降雪', '雪后阴天', '雪后晴天', '薄雾', '大雾', '暴雨'],
  lighting: ['柔和灯光', '自然采光', '通透亮灯', '隐藏灯带', '冷暖混合', '氛围灯', '重点照明'],
  atmosphere: ['动态模糊前景人', '车灯轨迹', '大气纵深', '地面积水反射', '玻璃内透', '植物光影斑驳', '商业氛围', '前景虚化遮挡', '材质风化效果', '云层层次', '雾气薄霭'],
  style: ['现代精致', '极简主义', '粗野主义', '高技派', '参数化', '未来科技', '新中式', '东方禅意', '在地文化', '有机建筑', '生态低碳', '商业精致', '城市活力', '静奢质感', '度假松弛', '工业更新', '北欧现代', '日式现代', '山地地域', '滨海当代'],
  deviceType: ['手机', '微单相机', '单反相机', '胶片相机', '中画幅', '无人机'],
  cameraBrand: ['索尼', '佳能', '尼康', '富士', '松下', '徕卡', '适马', '奥林巴斯', '奥之心', '哈苏', '蔡司', '黑魔法', 'RED', 'ARRI', 'Z CAM'],
  focalLength: ['24mm 移轴', '24mm 建筑常用', '17mm TS-E', '16mm 广角', '20mm 广角', '28mm 环境', '35mm 移轴', '35mm 中广角', '45mm 移轴', '50mm 移轴', '50mm 标准', '70mm 中长焦', '70-200mm'],
  aperture: ['f/2.8', 'f/4.0', 'f/5.6', 'f/8.0', 'f/11', 'f/16'],
  environment: ['植物与城市远景', '保持原环境', '远处城市背景', '植物缓冲背景', '商业街区背景', '室内暖光活动', '滨水或开阔远景', '大量活力人群', '零散人群', '通勤人群', '休闲停留人群'],
  foreground: ['不额外新增', '不加人物', '单人点景', '少量静态人物', '动态模糊前景人', '多人活动', '人物与宠物', '宠物点景', '少量动态车辆', '静态车辆', '路边停车', '车灯轨迹', '骑行者', '街道家具', '前景绿化', '湿地车流反射'],
  rendering: ['电影级写实', '摄影成片', '建筑表现', '自然纪实', '杂志大片', '胶片颗粒', '空间纵深', '大气纵深', '接触阴影', '环境遮蔽', '真实高光滚降', '真实间接光', '体积空气感', '材质微瑕疵', '边缘层次', '克制辉光', '反射叙事', '极简艺术', '高端商业', '现场纪实', '静奢质感', '触感写实'],
  colorGrading: ['清透自然', '徕卡低饱和', '索尼清透', '哈苏冷调', '柯达暖调', '富士胶片', '电影胶片', '柔暖胶片', '鲜明胶片', '银盐漂白', '青橙电影', '冷蓝暗调', '暖金柔调', '高级灰', '黑白建筑', '柔和对比', '深对比', '哑光影调']
};

const PRO_DIMENSIONS = [
  ['time', '时间'],
  ['weather', '天气'],
  ['lighting', '灯光'],
  ['style', '项目风格'],
  ['camera', '设备镜头'],
  ['environment', '配景环境'],
  ['foreground', '人物前景'],
  ['rendering', '画面表现'],
  ['colorGrading', '后期调色'],
  ['atmosphere', '画面氛围']
];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const cssEscape = (value) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(value ?? '')) : String(value ?? '').replace(/["\\]/g, '\\$&'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const AGENT_DEFAULT_TIMEOUT_SECONDS = 60;
let storeWriteTimer = 0;

function makeAgentThread(projectId, overrides = {}) {
  const createdAt = overrides.createdAt || Date.now();
  return {
    id: overrides.id || uid('thread'),
    projectId,
    title: overrides.title || '主对话',
    sourceThreadId: overrides.sourceThreadId || '',
    sourceMessageId: overrides.sourceMessageId || '',
    createdAt,
    updatedAt: overrides.updatedAt || createdAt
  };
}
function agentBranchTitle(message) {
  const text = String(message?.text || '').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 18);
  return `分支 ${new Date(message?.createdAt || Date.now()).toLocaleTimeString('zh-CN', { hour12: false })}`;
}
function normalizeAgentMessage(message, threadId, projectId) {
  const createdAt = message?.createdAt || Date.now();
  const pending = !!message?.pending;
  if (pending && createdAt && Date.now() - createdAt > AGENT_DEFAULT_TIMEOUT_SECONDS * 1000) {
    return {
      ...message,
      id: message?.id || uid('msg'),
      threadId: message?.threadId || threadId,
      projectId: message?.projectId || projectId,
      role: message?.role || 'assistant',
      text: '对话已中断，可重试。',
      createdAt,
      pending: false,
      errorDetail: message?.errorDetail || '页面刷新或上游长时间未返回导致本次 Agent 对话中断。'
    };
  }
  return {
    ...message,
    id: message?.id || uid('msg'),
    threadId: message?.threadId || threadId,
    projectId: message?.projectId || projectId,
    role: message?.role || 'assistant',
    text: String(message?.text || ''),
    createdAt,
    pending
  };
}
function migrateAgentThreads(agent = {}) {
  const migrated = { ...agent };
  const projects = Array.isArray(migrated.projects) && migrated.projects.length ? migrated.projects : [{ id: 'default', name: '默认项目', prompt: '', createdAt: Date.now(), updatedAt: Date.now() }];
  const legacyConversations = migrated.conversations && typeof migrated.conversations === 'object' ? migrated.conversations : {};
  const threadsByProject = migrated.threadsByProject && typeof migrated.threadsByProject === 'object' ? { ...migrated.threadsByProject } : {};
  const messagesByThread = migrated.messagesByThread && typeof migrated.messagesByThread === 'object' ? { ...migrated.messagesByThread } : {};
  const activeThreadIdByProject = migrated.activeThreadIdByProject && typeof migrated.activeThreadIdByProject === 'object' ? { ...migrated.activeThreadIdByProject } : {};
  for (const project of projects) {
    const projectId = project.id;
    const legacyMessages = Array.isArray(legacyConversations[projectId]) ? legacyConversations[projectId] : [];
    let threads = Array.isArray(threadsByProject[projectId]) ? threadsByProject[projectId].map((thread) => makeAgentThread(projectId, thread)) : [];
    if (!threads.length) {
      const thread = makeAgentThread(projectId, {
        title: legacyMessages.length ? '主对话' : '新对话',
        createdAt: legacyMessages[0]?.createdAt || project.createdAt || Date.now(),
        updatedAt: legacyMessages[legacyMessages.length - 1]?.createdAt || project.updatedAt || Date.now()
      });
      threads = [thread];
      messagesByThread[thread.id] = legacyMessages.map((message) => normalizeAgentMessage(message, thread.id, projectId));
    }
    for (const thread of threads) {
      const current = Array.isArray(messagesByThread[thread.id]) ? messagesByThread[thread.id] : [];
      messagesByThread[thread.id] = current.map((message) => normalizeAgentMessage(message, thread.id, projectId));
    }
    threadsByProject[projectId] = threads;
    const activeThreadId = activeThreadIdByProject[projectId];
    activeThreadIdByProject[projectId] = threads.some((thread) => thread.id === activeThreadId) ? activeThreadId : threads[0].id;
  }
  migrated.threadsByProject = threadsByProject;
  migrated.messagesByThread = messagesByThread;
  migrated.activeThreadIdByProject = activeThreadIdByProject;
  migrated.conversations = {};
  return migrated;
}
function formatBeijingTimeLabel(now = new Date()) {
  const formatted = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now).replace(/\//g, '-');
  return `当前北京时间：${formatted}（Asia/Shanghai）`;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
}

function collectObjectsDeep(value, options = {}) {
  const maxDepth = options.maxDepth ?? 6;
  const seen = new Set();
  const out = [];
  const visit = (item, depth) => {
    if (item === null || item === undefined || depth > maxDepth) return;
    if (typeof item !== 'object') return;
    if (seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) {
      item.forEach((child) => visit(child, depth + 1));
      return;
    }
    out.push(item);
    Object.values(item).forEach((child) => visit(child, depth + 1));
  };
  visit(value, 0);
  return out;
}

function readDeepAlias(root, aliases) {
  for (const obj of collectObjectsDeep(root)) {
    for (const key of aliases) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
    }
  }
  return undefined;
}

function normalizeComparableValue(value, type = 'text') {
  if (value === undefined || value === null || value === '') return '';
  if (type === 'bool') {
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    const text = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', '是', '开启', 'on', 'enabled'].includes(text)) return 'yes';
    if (['false', '0', 'no', '否', '关闭', 'off', 'disabled'].includes(text)) return 'no';
    return text;
  }
  if (type === 'number') {
    const num = Number(value);
    return Number.isFinite(num) ? String(num) : String(value).trim().toLowerCase();
  }
  if (type === 'format') {
    return String(value).trim().toLowerCase().replace(/^image\//, '').replace('jpg', 'jpeg');
  }
  if (type === 'ratio') return String(value).trim().toLowerCase().replace(/\s+/g, '').replace('／', '/');
  return String(value).trim().toLowerCase();
}

function displayParamValue(value, fallback = '未设置') {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}
function revokeObjectUrl(url) {
  if (!url || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  try { URL.revokeObjectURL(url); } catch {}
}
function revokeMapEntry(map, key) {
  if (!map || !map.has(key)) return;
  revokeObjectUrl(map.get(key));
  map.delete(key);
}
function scheduleStoreWrite(delay = 260) {
  if (storeWriteTimer) clearTimeout(storeWriteTimer);
  storeWriteTimer = setTimeout(() => {
    storeWriteTimer = 0;
    writeStore();
  }, delay);
}
function shouldCloseModalFromClick(actionTarget, originalTarget) {
  const action = actionTarget?.dataset?.action;
  return (action === 'close-modal-bg' || action === 'cancel-workflow-draft') && !originalTarget?.closest?.('[data-stop]');
}

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function putBlob(blob, id = uid('blob')) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return id;
}
async function getBlob(id) {
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function deleteBlob(id) {
  if (!id) return;
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
function collectReferencedBlobIds() {
  const ids = new Set();
  const add = (id) => { if (id) ids.add(id); };
  for (const task of state.tasks || []) {
    for (const img of task.images || []) add(img.blobId);
    for (const ref of task.referenceSnapshots || []) {
      add(ref.blobId);
      add(ref.originalBlobId);
      add(ref.compositedBlobId);
      add(ref.maskBlobId);
    }
  }
  for (const group of [state.references || [], state.pro?.refs || [], state.workflowInvoke?.references || []]) {
    for (const ref of group) {
      add(ref.blobId);
      add(ref.originalBlobId);
      add(ref.compositedBlobId);
      add(ref.maskBlobId);
    }
  }
  for (const attachment of state.agent?.attachments || []) add(attachment.blobId);
  for (const messages of Object.values(state.agent?.messagesByThread || {})) {
    for (const message of Array.isArray(messages) ? messages : []) {
      for (const attachment of message.attachments || []) add(attachment.blobId);
    }
  }
  return ids;
}
async function cleanupOrphanBlobs() {
  const db = await openDb();
  const keep = collectReferencedBlobIds();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.getAllKeys();
    req.onsuccess = () => {
      for (const key of req.result || []) {
        if (!keep.has(key)) store.delete(key);
      }
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function exportGalleryMigrationPayload() {
  const raw = localStorage.getItem(STORE_KEY) || '';
  const parsed = raw ? JSON.parse(raw) : {};
  const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  const favorites = parsed.favorites && typeof parsed.favorites === 'object' ? parsed.favorites : {};
  const blobIds = new Set();
  const add = (id) => { if (id) blobIds.add(id); };
  for (const task of tasks) {
    for (const img of task.images || []) add(img.blobId);
    for (const ref of task.referenceSnapshots || []) {
      add(ref.blobId);
      add(ref.originalBlobId);
      add(ref.compositedBlobId);
      add(ref.maskBlobId);
    }
  }
  const blobs = [];
  for (const id of blobIds) {
    const blob = await getBlob(id).catch(() => null);
    if (!blob) continue;
    blobs.push({ id, dataUrl: await blobToDataUrl(blob), type: blob.type || 'application/octet-stream' });
  }
  return {
    type: 'nexgen-gallery-migration',
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceOrigin: location.origin,
    tasks,
    favorites,
    blobs
  };
}
async function importGalleryMigrationPayload(payload) {
  if (!payload || payload.type !== 'nexgen-gallery-migration') throw new Error('迁移数据格式无效');
  const incomingTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  const incomingFavorites = payload.favorites && typeof payload.favorites === 'object' ? payload.favorites : {};
  const incomingBlobs = Array.isArray(payload.blobs) ? payload.blobs : [];
  for (const item of incomingBlobs) {
    if (!item?.id || !item?.dataUrl) continue;
    await putBlob(dataUrlToBlob(item.dataUrl), item.id);
  }
  const existingIds = new Set((state.tasks || []).map((task) => task.id));
  const importedTasks = incomingTasks.filter((task) => task?.id && !existingIds.has(task.id));
  state.tasks = [...importedTasks, ...(state.tasks || [])];
  state.favorites = { ...(state.favorites || {}), ...incomingFavorites };
  state.selectedTaskIds = [];
  writeStore();
  render();
  return { tasks: importedTasks.length, skipped: incomingTasks.length - importedTasks.length, blobs: incomingBlobs.length };
}
function dataUrlToBlob(dataUrl) {
  const [meta, body] = String(dataUrl).split(',');
  const type = (meta.match(/data:([^;]+)/) || [])[1] || 'image/png';
  const bin = atob(body || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
function parseImageSizeFromBytes(bytes) {
  if (!bytes || bytes.length < 24) return {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2, false);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: view.getUint16(offset + 5, false), width: view.getUint16(offset + 7, false) };
      }
      if (!length) break;
      offset += 2 + length;
    }
  }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58 && bytes.length >= 30) {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { width, height };
    }
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20 && bytes.length >= 30) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
  }
  return {};
}
function detectImageMimeFromBytes(bytes) {
  if (!bytes || bytes.length < 12) return '';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return '';
}
function pngMayHaveAlpha(bytes) {
  if (!bytes || bytes.length < 26) return false;
  if (detectImageMimeFromBytes(bytes) !== 'image/png') return false;
  const colorType = bytes[25];
  if (colorType === 4 || colorType === 6) return true;
  if (colorType === 3) {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
      const length = view.getUint32(0, false);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (type === 'tRNS') return true;
      if (type === 'IDAT' || type === 'IEND') break;
      offset += 12 + length;
    }
  }
  return false;
}
async function fastImageSizeFromBlob(blob) {
  const head = new Uint8Array(await blob.slice(0, 131072).arrayBuffer());
  const size = parseImageSizeFromBytes(head);
  return size.width && size.height ? size : {};
}
async function imageInfoFromBlob(blob) {
  const head = new Uint8Array(await blob.slice(0, 262144).arrayBuffer());
  const size = parseImageSizeFromBytes(head);
  const detectedType = detectImageMimeFromBytes(head) || blob.type || '';
  return {
    width: size.width,
    height: size.height,
    type: detectedType,
    hasAlpha: detectedType === 'image/png' ? pngMayHaveAlpha(head) : undefined
  };
}
async function imageSizeFromBlob(blob) {
  const fast = await fastImageSizeFromBlob(blob).catch(() => ({}));
  if (fast.width && fast.height) return fast;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function defaultStore() {
  return {
    version: 3,
    mode: 'gallery',
    tasks: [],
    galleryVirtual: { scrollTop: 0, viewportHeight: 720 },
    favorites: {},
    selectedTaskIds: [],
    references: [],
    composerPrompt: '',
    promptQuery: '',
    settings: {
      quality: 'high',
      output_format: 'png',
      output_compression: 90,
      n: 1,
      transparent_output: false,
      moderation: 'auto',
      openaiSize: '1K',
      openaiAspectRatio: 'auto',
      googleBaseResolution: '2K',
      googleAspectRatio: '1:1',
      xaiResolution: '2k',
      xaiAspectRatio: '1:1'
    },
    preferences: { ...DEFAULT_PREFERENCES },
    entryAdvanced: {
      gallery: { ...DEFAULT_ENTRY_ADVANCED },
      pro: { ...DEFAULT_ENTRY_ADVANCED },
      workflow: { ...DEFAULT_ENTRY_ADVANCED },
      agent: { ...DEFAULT_ENTRY_ADVANCED }
    },
    agent: {
      activeProjectId: 'default',
      view: 'chat',
      promptOpen: false,
      projects: [{ id: 'default', name: '默认项目', prompt: '', createdAt: Date.now(), updatedAt: Date.now() }],
      logs: [],
      conversations: {},
      threadsByProject: {},
      messagesByThread: {},
      activeThreadIdByProject: {},
      inputDraft: '',
      workflows: [],
      workflowRuns: [],
      attachments: [],
      imageSettings: null,
      webMode: 'on',
      reasoning: 'medium'
    },
    pro: {
      mode: 'ai',
      prompt: '',
      refs: [],
      analysis: null,
      analyzing: false,
      running: false,
      activeTaskId: '',
      profileId: '',
      advancedOpen: false,
      selectedDimensions: Object.fromEntries(PRO_DIMENSIONS.map(([key]) => [key, true])),
      params: {
        scene: '建筑外景',
        time: '10:30 明亮日景',
        customTime: '',
        weather: '晴朗',
        customWeather: '',
        indoorLighting: '柔和灯光',
        customLighting: '',
        atmosphere: [],
        material: '真实材质',
        lighting: '自然柔光',
        camera: '广角写实',
        style: '电影级写实',
        strength: 'medium',
        projectStyle: '现代精致',
        deviceType: '微单相机',
        cameraBrand: '索尼',
        focalLength: '24mm 建筑常用',
        aperture: 'f/8.0',
        environment: '植物与城市远景',
        foreground: '不额外新增',
        rendering: '电影级写实',
        colorGrading: '清透自然',
        notes: ''
      }
    }
  };
}
function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const base = defaultStore();
    const merged = { ...base, ...parsed };
    merged.settings = { ...base.settings, ...(parsed.settings || {}) };
    merged.preferences = { ...DEFAULT_PREFERENCES, ...(parsed.preferences || {}) };
    merged.entryAdvanced = {
      gallery: { ...DEFAULT_ENTRY_ADVANCED, ...(readEntryAdvanced('gallery') || parsed.entryAdvanced?.gallery || {}) },
      pro: { ...DEFAULT_ENTRY_ADVANCED, ...(readEntryAdvanced('pro') || parsed.entryAdvanced?.pro || {}) },
      workflow: { ...DEFAULT_ENTRY_ADVANCED, ...(readEntryAdvanced('workflow') || parsed.entryAdvanced?.workflow || {}) },
      agent: { ...DEFAULT_ENTRY_ADVANCED, ...(readEntryAdvanced('agent') || parsed.entryAdvanced?.agent || {}) }
    };
    if (typeof sessionStorage !== 'undefined') {
      const sessionSettings = JSON.parse(sessionStorage.getItem(COMPOSER_SESSION_KEY) || 'null');
      for (const key of COMPOSER_SETTING_KEYS) merged.settings[key] = sessionSettings && Object.prototype.hasOwnProperty.call(sessionSettings, key) ? sessionSettings[key] : base.settings[key];
      for (const key of COMPOSER_SESSION_FIELDS) {
        if (sessionSettings && Object.prototype.hasOwnProperty.call(sessionSettings, key)) merged[key] = sessionSettings[key];
        else merged[key] = null;
      }
    }
    merged.agent = migrateAgentThreads({ ...base.agent, ...(parsed.agent || {}) });
    if (!Array.isArray(merged.agent.projects) || !merged.agent.projects.length) merged.agent.projects = base.agent.projects;
    if (!merged.agent.conversations || typeof merged.agent.conversations !== 'object') merged.agent.conversations = {};
    if (!merged.agent.threadsByProject || typeof merged.agent.threadsByProject !== 'object') merged.agent.threadsByProject = {};
    if (!merged.agent.messagesByThread || typeof merged.agent.messagesByThread !== 'object') merged.agent.messagesByThread = {};
    if (!merged.agent.activeThreadIdByProject || typeof merged.agent.activeThreadIdByProject !== 'object') merged.agent.activeThreadIdByProject = {};
    if (!Array.isArray(merged.agent.workflows)) merged.agent.workflows = [];
    if (!Array.isArray(merged.agent.workflowRuns)) merged.agent.workflowRuns = [];
    merged.agent.webMode = merged.agent.webMode === 'off' ? 'off' : 'on';
    merged.agent.reasoning = merged.agent.reasoning || 'medium';
    merged.agent.view = merged.agent.view || 'chat';
    merged.agent.promptOpen = !!merged.agent.promptOpen;
    merged.agent.imageSettings = merged.agent.imageSettings && typeof merged.agent.imageSettings === 'object' ? merged.agent.imageSettings : null;
    merged.pro = { ...base.pro, ...(parsed.pro || {}) };
    merged.pro.params = { ...base.pro.params, ...(merged.pro.params || {}) };
    if (!Array.isArray(merged.pro.refs)) merged.pro.refs = [];
    merged.pro.selectedDimensions = { ...base.pro.selectedDimensions, ...(merged.pro.selectedDimensions || {}) };
    if (!Array.isArray(merged.pro.params.atmosphere)) merged.pro.params.atmosphere = [];
    if (merged.pro.mode === 'modelRender') merged.pro.mode = 'ai';
    if (!PRO_WORKBENCH_MODES[merged.pro.mode]) merged.pro.mode = 'ai';
    merged.agent.workflowRuns = merged.agent.workflowRuns.map((run) => {
      if (run.status === 'queued' || run.status === 'running') {
        return { ...run, status: 'interrupted', error: '页面刷新导致工作流中断，可重试。', finishedAt: Date.now() };
      }
      return run;
    });
    if (!Array.isArray(merged.tasks)) merged.tasks = [];
    merged.tasks = merged.tasks.map(normalizeRestoredTask);
    return merged;
  } catch (err) {
    console.warn('[home-v3] failed to read store', err);
    return defaultStore();
  }
}
function normalizeRestoredTask(task) {
  const images = Array.isArray(task.images) ? task.images : [];
  const hasImages = images.length > 0;
  const errorText = String(task.error || task.errorDetail || '').trim();
  const hasError = !!errorText;
  const isRefreshInterruptionError = /页面刷新|请求中断|任务中断|可重试|interrupted/i.test(errorText);
  const returnedParams = task.returnedParams && typeof task.returnedParams === 'object' ? task.returnedParams : {};
  const hasReturnedParams = Object.keys(returnedParams).length > 0;
  const hasRawCompletion = !!task.rawResponse || hasReturnedParams || !!task.returnedPrompt;
  const completedStatus = task.status === 'success' || task.status === 'partial_success';
  const hasCompletionEvidence = hasImages || completedStatus || (!!task.finishedAt && hasRawCompletion);
  const hasRecoverableSuccessEvidence = hasImages || completedStatus || (!!task.finishedAt && hasRawCompletion);
  const expected = Number(task.expectedCount || task.requestedParams?.count || task.count || 0);
  if (hasImages && expected > 0) {
    const partial = images.length < expected;
    return { ...task, images, status: partial ? 'partial_success' : 'success', error: partial ? task.error || '' : '', errorDetail: partial ? task.errorDetail || '' : '' };
  }
  if ((hasCompletionEvidence && (!hasError || isRefreshInterruptionError)) || (isRefreshInterruptionError && hasRecoverableSuccessEvidence)) {
    const partial = task.status === 'partial_success' || (expected > 0 && images.length > 0 && images.length < expected);
    return { ...task, images, status: partial ? 'partial_success' : 'success', error: partial ? task.error || '' : '', errorDetail: partial ? task.errorDetail || '' : '' };
  }
  if (hasError && !hasImages && task.status !== 'queued' && task.status !== 'running') return { ...task, images, status: 'error' };
  if (task.status === 'queued' || task.status === 'running') {
    return { ...task, images, status: 'interrupted', error: task.error || '页面刷新导致请求中断，可重试。', finishedAt: task.finishedAt || Date.now() };
  }
  return { ...task, images };
}
function sanitizeStoredImages(images = []) {
  return (Array.isArray(images) ? images : []).map((img) => {
    const remoteUrl = /^data:/i.test(String(img.remoteUrl || img.url || '')) ? '' : (img.remoteUrl || img.url || '');
    return { ...img, remoteUrl, url: remoteUrl || undefined, objectUrl: undefined };
  });
}
function sanitizeReferenceSnapshots(refs = []) {
  return (Array.isArray(refs) ? refs : []).map((ref) => ({
    id: ref.id,
    name: ref.name || 'reference.png',
    type: ref.type || 'image/png',
    blobId: ref.blobId,
    compositedBlobId: ref.compositedBlobId || ref.blobId,
    originalBlobId: ref.originalBlobId || ref.blobId,
    maskBlobId: ref.maskBlobId || '',
    width: ref.width,
    height: ref.height
  })).filter((ref) => ref.blobId);
}
async function cloneReferenceSnapshots(refs = []) {
  const out = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    if (!ref?.blobId) continue;
    const usedBlob = await getBlob(ref.blobId).catch(() => null);
    if (!usedBlob) continue;
    const blobId = await putBlob(usedBlob);
    let originalBlobId = blobId;
    if (ref.originalBlobId && ref.originalBlobId !== ref.blobId) {
      const originalBlob = await getBlob(ref.originalBlobId).catch(() => null);
      if (originalBlob) originalBlobId = await putBlob(originalBlob);
    }
    let compositedBlobId = blobId;
    if (ref.compositedBlobId && ref.compositedBlobId !== ref.blobId) {
      const compositedBlob = await getBlob(ref.compositedBlobId).catch(() => null);
      if (compositedBlob) compositedBlobId = await putBlob(compositedBlob);
    }
    let maskBlobId = '';
    if (ref.maskBlobId) {
      const maskBlob = await getBlob(ref.maskBlobId).catch(() => null);
      if (maskBlob) maskBlobId = await putBlob(maskBlob);
    }
    out.push({
      id: uid('taskref'),
      name: ref.name || 'reference.png',
      type: usedBlob.type || ref.type || 'image/png',
      blobId,
      compositedBlobId,
      originalBlobId,
      maskBlobId,
      width: ref.width,
      height: ref.height
    });
  }
  return out;
}
function compactTaskForStorage(task, mode = 'normal') {
  const base = {
    ...task,
    previewUrl: undefined,
    streamPreviewUrl: '',
    streamPreviewRemoteUrl: '',
    images: sanitizeStoredImages(task.images),
    referenceSnapshots: sanitizeReferenceSnapshots(task.referenceSnapshots)
  };
  if (mode === 'normal') {
    return { ...base, rawResponse: base.rawResponse ? summarizeResponse(base.rawResponse) : undefined };
  }
  if (mode === 'compact') {
    return {
      ...base,
      rawResponse: undefined,
      errorDetail: String(base.errorDetail || '').slice(0, 800),
      partialErrors: Array.isArray(base.partialErrors) ? base.partialErrors.slice(0, 12) : []
    };
  }
  return {
    id: base.id,
    status: base.status,
    mode: base.mode,
    prompt: base.prompt,
    profileId: base.profileId,
    profileName: base.profileName,
    model: base.model,
    providerFamily: base.providerFamily,
    sizeLabel: base.sizeLabel,
    quality: base.quality,
    count: base.count,
    referenceCount: base.referenceCount,
    referenceSnapshots: base.referenceSnapshots,
    requestedParams: base.requestedParams,
    returnedParams: base.returnedParams,
    returnedPrompt: base.returnedPrompt,
    createdAt: base.createdAt,
    startedAt: base.startedAt,
    finishedAt: base.finishedAt,
    elapsedMs: base.elapsedMs,
    apiElapsedMs: base.apiElapsedMs,
    persistElapsedMs: base.persistElapsedMs,
    expectedCount: base.expectedCount,
    actualCount: base.actualCount,
    failedCount: base.failedCount,
    partialErrors: Array.isArray(base.partialErrors) ? base.partialErrors.slice(0, 8) : [],
    error: base.error,
    errorDetail: String(base.errorDetail || '').slice(0, 500),
    workflowId: base.workflowId,
    workflowRunId: base.workflowRunId,
    workflowNodeId: base.workflowNodeId,
    batchRowId: base.batchRowId,
    batchLabel: base.batchLabel,
    workflowName: base.workflowName,
    tags: base.tags,
    note: base.note,
    images: base.images
  };
}
function writeStore() {
  const clean = JSON.parse(JSON.stringify({
    ...state,
    popover: null,
    modal: null,
    viewer: null,
    maskEditor: null,
    accountMenuOpen: false,
    workflowDraft: null,
    workflowInvoke: null,
    workflowEditorOpen: false,
    confirmDialog: null,
    entryAdvancedModal: null,
    proFileTarget: '',
    promptRepo: { ...state.promptRepo, detail: null, imageViewer: null }
  }));
  const baseSettings = defaultStore().settings;
  for (const key of COMPOSER_SETTING_KEYS) clean.settings[key] = baseSettings[key];
  for (const key of COMPOSER_SESSION_FIELDS) clean[key] = null;
  clean.references = clean.references.map((ref) => ({ ...ref, url: undefined, file: undefined }));
  clean.pro.refs = (clean.pro.refs || []).map((ref) => ({ ...ref, url: undefined, file: undefined }));
  clean.entryAdvanced = clean.entryAdvanced || {};
  clean.tasks = state.tasks.slice(0, 100).map((task) => compactTaskForStorage(task, 'normal'));
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(clean));
  } catch (err) {
    try {
      const compact = {
        ...clean,
        tasks: state.tasks.slice(0, 80).map((task) => compactTaskForStorage(task, 'compact'))
      };
      localStorage.setItem(STORE_KEY, JSON.stringify(compact));
      console.warn('[home-v3] store write compacted after quota pressure', err);
    } catch (compactErr) {
      try {
        const emergency = {
          ...clean,
          modal: null,
          viewer: null,
          promptRepo: { ...clean.promptRepo, items: [], detail: null, imageViewer: null },
          tasks: state.tasks.slice(0, 60).map((task) => compactTaskForStorage(task, 'essential'))
        };
        localStorage.setItem(STORE_KEY, JSON.stringify(emergency));
        console.warn('[home-v3] store write used emergency task-only compaction', compactErr);
      } catch (emergencyErr) {
        toast('浏览器本地容量不足，请清理历史任务或导出后删除。');
        console.warn('[home-v3] store write failed', emergencyErr);
      }
    }
  }
  writePersistedPrompt();
}
function writeComposerSessionSettings() {
  if (typeof sessionStorage === 'undefined') return;
  const payload = {};
  for (const key of COMPOSER_SETTING_KEYS) payload[key] = state.settings[key];
  for (const key of COMPOSER_SESSION_FIELDS) payload[key] = state[key];
  sessionStorage.setItem(COMPOSER_SESSION_KEY, JSON.stringify(payload));
}

function readEntryAdvanced(entry) {
  try {
    const raw = localStorage.getItem(`${ENTRY_ADVANCED_PREFIX}${entry}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeEntryAdvanced(entry) {
  try {
    localStorage.setItem(`${ENTRY_ADVANCED_PREFIX}${entry}`, JSON.stringify(entryAdvanced(entry)));
  } catch {}
}
function entryAdvanced(entry = currentEntryKey()) {
  state.entryAdvanced = state.entryAdvanced || {};
  state.entryAdvanced[entry] = { ...DEFAULT_ENTRY_ADVANCED, ...(state.entryAdvanced[entry] || {}) };
  return state.entryAdvanced[entry];
}
function currentEntryKey() {
  if (state.mode === 'pro') return 'pro';
  if (state.mode === 'workflow') return 'workflow';
  if (state.mode === 'agent') return 'agent';
  return 'gallery';
}
function profileDefaultAdvanced(profile = imageProfile()) {
  return {
    responseFormatB64Json: !!profile.responseFormatB64Json,
    streamImages: !!profile.streamImages,
    streamPartialImages: Number(profile.streamPartialImages) || 1,
    timeout: Number(profile.timeout) || Number(state.runtime?.timeout) || 600
  };
}
function effectiveAdvanced(entry = currentEntryKey(), profile = imageProfile()) {
  const defaults = profileDefaultAdvanced(profile);
  const overrides = entryAdvanced(entry);
  return {
    responseFormatB64Json: overrides.responseFormatB64Json === null || overrides.responseFormatB64Json === undefined ? defaults.responseFormatB64Json : !!overrides.responseFormatB64Json,
    streamImages: overrides.streamImages === null || overrides.streamImages === undefined ? defaults.streamImages : !!overrides.streamImages,
    streamPartialImages: overrides.streamPartialImages === null || overrides.streamPartialImages === undefined ? defaults.streamPartialImages : Math.max(0, Math.min(3, Number(overrides.streamPartialImages) || 0)),
    timeout: overrides.timeout === null || overrides.timeout === undefined ? defaults.timeout : Math.max(1, Number(overrides.timeout) || defaults.timeout),
    open: !!overrides.open
  };
}
function streamSupported(profile = imageProfile()) {
  const key = providerKey(profile);
  return key === 'openai' && profileMode(profile) === 'images';
}
function openAiTransparentBackgroundSupported(profile = imageProfile()) {
  return providerKey(profile) === 'openai';
}
function transparentBackgroundUnsupportedMessage(profile = imageProfile()) {
  return `当前模型 ${profile?.name || profile?.id || profile?.model || '未命名模型'} / ${profile?.model || 'model'} 不能确认支持透明背景。请切换 OpenAI 图片模型，或关闭透明背景后重试。`;
}
function appendAdvancedHeaders(headers = {}, entry = currentEntryKey(), profile = imageProfile()) {
  const advanced = effectiveAdvanced(entry, profile);
  const out = { ...headers };
  out['X-GPT-Image-Profile-Id'] = profileId(profile);
  if (advanced.timeout) out['X-GPT-Image-Timeout-Seconds'] = String(advanced.timeout);
  out['X-GPT-Image-Response-B64'] = advanced.responseFormatB64Json ? 'true' : 'false';
  out['X-GPT-Image-Stream'] = advanced.streamImages && streamSupported(profile) ? 'true' : 'false';
  out['X-GPT-Image-Partial-Images'] = String(Math.max(0, Math.min(3, Number(advanced.streamPartialImages) || 0)));
  out['X-GPT-Image-Entry'] = entry;
  return out;
}
function applyAdvancedToJsonBody(body, entry = currentEntryKey(), profile = imageProfile()) {
  const advanced = effectiveAdvanced(entry, profile);
  const provider = providerKey(profile);
  if (advanced.responseFormatB64Json && provider !== 'google' && provider !== 'xai') body.response_format = 'b64_json';
  if (advanced.streamImages && streamSupported(profile)) {
    body.stream = true;
    body.partial_images = Math.max(0, Math.min(3, Number(advanced.streamPartialImages) || 1));
  }
  return body;
}
function appendAdvancedToFormData(form, entry = currentEntryKey(), profile = imageProfile()) {
  const advanced = effectiveAdvanced(entry, profile);
  const provider = providerKey(profile);
  if (advanced.responseFormatB64Json && provider !== 'google' && provider !== 'xai') form.append('response_format', 'b64_json');
  if (advanced.streamImages && streamSupported(profile)) {
    form.append('stream', 'true');
    form.append('partial_images', String(Math.max(0, Math.min(3, Number(advanced.streamPartialImages) || 1))));
  }
}
function writePersistedPrompt() {
  if (!state?.preferences) return;
  try {
    if (state.preferences.persistInputOnRestart) localStorage.setItem(PERSISTED_PROMPT_KEY, state.composerPrompt || '');
    else localStorage.removeItem(PERSISTED_PROMPT_KEY);
  } catch {}
}
function applyPromptPersistencePreference() {
  if (!state.preferences?.persistInputOnRestart) {
    try { localStorage.removeItem(PERSISTED_PROMPT_KEY); } catch {}
    return;
  }
  try {
    const saved = localStorage.getItem(PERSISTED_PROMPT_KEY);
    if (saved && !state.composerPrompt) state.composerPrompt = saved;
  } catch {}
}

const initialStore = readStore();
const state = {
  ...initialStore,
  user: null,
  runtime: null,
  profiles: [],
  activeProfileId: '',
  activeImageProfileId: '',
  agentConfig: { mode: 'off', textProfileId: null, imageProfileId: null, webSearchEnabled: false, scrollAfterSubmit: true },
  imageUrls: new Map(),
  refUrls: new Map(),
  selectedTaskIds: initialStore.selectedTaskIds || [],
  popover: null,
  modal: null,
  viewer: null,
  imageContextMenu: null,
  maskEditor: null,
  promptRepo: { open: false, page: 0, pages: 1, total: 0, loading: false, items: [], query: '', detail: null, imageViewer: null },
  accountMenuOpen: false,
  workflowDraft: null,
  workflowInvoke: null,
  workflowEditorOpen: false,
  confirmDialog: null,
  entryAdvancedModal: null,
  proFileTarget: '',
  agentScrollState: { nearBottom: true, offsetFromBottom: 0 },
  agentScrollIntent: '',
  toastSeq: 0
};

function activeProfile() {
  return imageProfile();
}
function profileId(profile) {
  return profile?.id || profile?.name || '';
}
function profileMode(profile) {
  return String(profile?.apiMode || 'images').toLowerCase();
}
function imageProfiles() {
  return state.profiles.filter((profile) => profileMode(profile) === 'images');
}
function responseProfiles() {
  return state.profiles.filter((profile) => profileMode(profile) === 'responses');
}
function fallbackImageProfile() {
  return {
    id: 'default-openai',
    name: 'OpenAI',
    provider: 'openai',
    model: 'gpt-image-2',
    apiMode: 'images'
  };
}
function imageProfile() {
  const candidates = imageProfiles();
  return candidates.find((p) => profileId(p) === state.activeImageProfileId) ||
    candidates.find((p) => profileId(p) === state.activeProfileId) ||
    candidates[0] ||
    fallbackImageProfile();
}
function findImageProfileById(id) {
  const value = String(id || '').trim();
  if (!value) return null;
  return imageProfiles().find((profile) => profileId(profile) === value || profile.name === value) || null;
}
function resolveTaskProfile(task) {
  if (!task || typeof task !== 'object') return null;
  if (task.profile && profileMode(task.profile) === 'images') return task.profile;
  const requested = task.requestedParams && typeof task.requestedParams === 'object' ? task.requestedParams : {};
  return findImageProfileById(task.profileId) ||
    findImageProfileById(requested.profileId) ||
    findImageProfileById(requested.profileName) ||
    null;
}
function proImageProfile() {
  const candidates = imageProfiles();
  return candidates.find((p) => profileId(p) === state.pro?.profileId) || imageProfile();
}
function agentTextProfile() {
  const cfg = state.agentConfig || {};
  const candidates = responseProfiles();
  const usable = candidates.filter(isAgentTextProfileUsable);
  if (cfg.mode === 'hybrid') return usable.find((p) => profileId(p) === cfg.textProfileId) || null;
  return usable.find((p) => profileId(p) === state.activeProfileId) || usable[0] || null;
}
function configuredAgentTextProfile() {
  const cfg = state.agentConfig || {};
  const candidates = responseProfiles();
  if (cfg.mode === 'hybrid') return candidates.find((p) => profileId(p) === cfg.textProfileId) || null;
  return candidates.find((p) => profileId(p) === state.activeProfileId) || candidates[0] || null;
}
function isAgentTextProfileUsable(profile) {
  if (!profile || profileMode(profile) !== 'responses') return false;
  const model = String(profile.model || '').toLowerCase();
  const name = String(profile.name || '').toLowerCase();
  const provider = providerKey(profile);
  if (provider !== 'openai') return true;
  if (/gpt-image|image-?2|imagen|dall[- ]?e|nano|banana|gemini.*image|grok.*image/.test(`${model} ${name}`)) return false;
  return true;
}
function agentTextProfileInvalidReason(profile = configuredAgentTextProfile()) {
  if (!profile) return '未选择可用的 Responses 文本模型配置';
  if (profileMode(profile) !== 'responses') return '所选 Agent 文本配置不是 Responses API 模式';
  const model = String(profile.model || '');
  const name = String(profile.name || profile.id || '');
  if (!isAgentTextProfileUsable(profile)) return `所选 Agent 文本配置“${name}”实际模型是 ${model || '空'}，属于图片模型，不能用于对话。请在后台把该 profile 的模型改成文本模型。`;
  return '';
}
function agentWebSearchSupported(profile = agentTextProfile()) {
  if (!profile || profileMode(profile) !== 'responses') return false;
  return true;
}
function agentWebSearchEnabled(profile = agentTextProfile()) {
  if (!state.agentConfig?.webSearchEnabled) return false;
  if (!agentWebSearchSupported(profile)) return false;
  return state.agent.webMode !== 'off';
}
function agentImageProfile() {
  const cfg = state.agentConfig || {};
  const settings = agentImageSettings();
  return findImageProfileById(settings.profileId) || (cfg.mode === 'hybrid' ? findImageProfileById(cfg.imageProfileId) : null) || imageProfile();
}
function projectThreads(projectId = state.agent.activeProjectId) {
  const threads = state.agent.threadsByProject?.[projectId];
  return Array.isArray(threads) ? threads : [];
}
function activeAgentThreadId(projectId = state.agent.activeProjectId) {
  const configured = state.agent.activeThreadIdByProject?.[projectId];
  const threads = projectThreads(projectId);
  return threads.some((thread) => thread.id === configured) ? configured : threads[0]?.id || '';
}
function activeAgentThread(projectId = state.agent.activeProjectId) {
  const threadId = activeAgentThreadId(projectId);
  return projectThreads(projectId).find((thread) => thread.id === threadId) || null;
}
function ensureAgentProjectThread(projectId = state.agent.activeProjectId) {
  if (!projectId) return null;
  state.agent = migrateAgentThreads(state.agent);
  const threads = projectThreads(projectId);
  if (threads.length) return threads[0];
  const thread = makeAgentThread(projectId, { title: '主对话' });
  state.agent.threadsByProject[projectId] = [thread];
  state.agent.messagesByThread[thread.id] = [];
  state.agent.activeThreadIdByProject[projectId] = thread.id;
  return thread;
}
function setActiveAgentThread(projectId, threadId) {
  if (!projectId || !threadId) return;
  state.agent = migrateAgentThreads(state.agent);
  if (!projectThreads(projectId).some((thread) => thread.id === threadId)) return;
  state.agent.activeThreadIdByProject[projectId] = threadId;
}
function agentConfigNotice() {
  if ((state.agentConfig?.mode || 'off') === 'hybrid') return '';
  return '后台 Agent API 配置未启用混合模式，当前按兼容配置运行。';
}
function providerKey(profile = activeProfile()) {
  const raw = String(profile.provider || '').toLowerCase();
  if (raw.includes('google') || /gemini|banana/i.test(profile.model || '')) return 'google';
  if (raw.includes('xai') || raw.includes('grok') || /grok/i.test(profile.model || '')) return 'xai';
  return 'openai';
}
function googleVersion(profile = activeProfile()) {
  return /3\.1|nano banana 2|banana-?2/i.test(`${profile.model || ''} ${profile.name || ''}`) ? '3.1' : '2.5';
}
function referenceLimit(profile = activeProfile()) {
  const key = providerKey(profile);
  if (key === 'google') return googleVersion(profile) === '3.1' ? 14 : 10;
  return PROVIDER[key]?.refLimit || 4;
}
function settingsForSummary(settings = state.settings) {
  return {
    quality: settings?.quality || 'high',
    output_format: settings?.output_format || 'png',
    output_compression: Number(settings?.output_compression) || 90,
    n: Math.max(1, Number(settings?.n) || 1),
    transparent_output: !!settings?.transparent_output,
    moderation: settings?.moderation || 'auto',
    openaiSize: settings?.openaiSize || '1K',
    openaiAspectRatio: settings?.openaiAspectRatio || 'auto',
    googleBaseResolution: settings?.googleBaseResolution || '2K',
    googleAspectRatio: settings?.googleAspectRatio || '1:1',
    xaiResolution: settings?.xaiResolution || '2k',
    xaiAspectRatio: settings?.xaiAspectRatio || '1:1',
    profileId: settings?.profileId || ''
  };
}
function sizeSummary(profile = activeProfile(), settings = state.settings) {
  const source = settingsForSummary(settings);
  const key = providerKey(profile);
  if (key === 'google') return `${source.googleBaseResolution} · ${source.googleAspectRatio}`;
  if (key === 'xai') return `${source.xaiResolution} · ${source.xaiAspectRatio}`;
  return `${source.openaiSize || 'auto'} · ${source.openaiAspectRatio || 'auto'}`;
}
function resolutionSummary(profile = activeProfile(), settings = state.settings) {
  const source = settingsForSummary(settings);
  const key = providerKey(profile);
  if (key === 'google') return source.googleBaseResolution || '2K';
  if (key === 'xai') return source.xaiResolution || '2k';
  return source.openaiSize || 'auto';
}
function ratioSummary(profile = activeProfile(), settings = state.settings) {
  const source = settingsForSummary(settings);
  const key = providerKey(profile);
  if (key === 'google') return source.googleAspectRatio || '1:1';
  if (key === 'xai') return source.xaiAspectRatio || '1:1';
  return source.openaiAspectRatio || 'auto';
}
function requestedParamsFromSettings(profile = activeProfile(), settings = state.settings) {
  const source = settingsForSummary(settings);
  const key = providerKey(profile);
  return {
    source: `${PROVIDER[key]?.name || profile.provider} · ${profile.name || profile.id} · ${profile.model || 'model'}`,
    provider: key,
    profileId: profile.id,
    profileName: profile.name,
    model: profile.model,
    size: sizeSummary(profile, source),
    resolution: key === 'google' ? source.googleBaseResolution : key === 'xai' ? source.xaiResolution : source.openaiSize,
    aspectRatio: key === 'google' ? source.googleAspectRatio : key === 'xai' ? source.xaiAspectRatio : source.openaiAspectRatio,
    quality: source.quality,
    format: source.output_format,
    compression: source.output_compression,
    transparent: !!source.transparent_output,
    moderation: source.moderation,
    count: Number(source.n) || 1
  };
}
function requestedParams(profile = activeProfile()) {
  return requestedParamsFromSettings(profile, state.settings);
}
function cloneGalleryImageSettingsForAgent() {
  return {
    ...settingsForSummary(state.settings),
    profileId: profileId(imageProfile()),
    initializedFromGallery: true,
    initializedAt: Date.now()
  };
}
function agentImageSettings() {
  state.agent = state.agent || {};
  const existing = state.agent.imageSettings && typeof state.agent.imageSettings === 'object' ? state.agent.imageSettings : null;
  if (!existing) {
    state.agent.imageSettings = cloneGalleryImageSettingsForAgent();
    return state.agent.imageSettings;
  }
  state.agent.imageSettings = {
    ...settingsForSummary(existing),
    profileId: existing.profileId || state.agentConfig?.imageProfileId || profileId(imageProfile()),
    initializedFromGallery: existing.initializedFromGallery !== false,
    initializedAt: existing.initializedAt || Date.now()
  };
  return state.agent.imageSettings;
}
function agentImageParams() {
  return requestedParamsFromSettings(agentImageProfile(), agentImageSettings());
}
function closestAspectRatio(width, height) {
  width = Number(width);
  height = Number(height);
  if (!width || !height) return '';
  const known = ['1:1', '5:4', '4:5', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '9:21', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20'];
  const actual = width / height;
  let best = '';
  let bestDelta = Infinity;
  known.forEach((ratio) => {
    const [w, h] = ratio.split(':').map(Number);
    if (!w || !h) return;
    const delta = Math.abs(actual - (w / h));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = ratio;
    }
  });
  return best;
}
function computeParamMismatches(requested = {}, returned = {}, images = []) {
  const checks = [
    { key: 'resolution', type: 'text', requested: firstDefined(requested.resolution, requested.size), actual: firstDefined(returned.resolution, returned.size) },
    { key: 'aspectRatio', type: 'text', requested: firstDefined(requested.aspectRatio, requested.aspect_ratio), actual: firstDefined(returned.aspectRatio, returned.aspect_ratio) },
    { key: 'quality', type: 'text', requested: firstDefined(requested.quality), actual: firstDefined(returned.quality) },
    { key: 'format', type: 'format', requested: firstDefined(requested.format, requested.output_format), actual: firstDefined(returned.format, returned.outputFormat, returned.output_format) },
    { key: 'transparent', type: 'bool', requested: firstDefined(requested.transparent, requested.background === 'transparent' ? true : requested.transparent_background), actual: firstDefined(returned.transparent, returned.transparentBackground, returned.transparent_background, returned.background) },
    { key: 'compression', type: 'number', requested: firstDefined(requested.compression, requested.outputCompression, requested.output_compression), actual: firstDefined(returned.compression, returned.outputCompression, returned.output_compression) },
    { key: 'moderation', type: 'text', requested: firstDefined(requested.moderation), actual: firstDefined(returned.moderation) },
    { key: 'count', type: 'number', requested: firstDefined(requested.count), actual: firstDefined(returned.count, images.length || undefined) }
  ];
  return checks.reduce((acc, item) => {
    const requestedValue = normalizeComparableValue(item.requested, item.type);
    const actualValue = normalizeComparableValue(item.actual, item.type);
    if (item.key === 'resolution' && isTierResolutionMatch(requested, item.actual, images)) return acc;
    if (requestedValue !== '' && actualValue !== '' && requestedValue !== actualValue) {
      acc[item.key] = { requested: item.requested, actual: item.actual };
    }
    return acc;
  }, {});
}
function openAiSizePayload(params = {}) {
  const size = params.resolution || params.size || state.settings.openaiSize || 'auto';
  const ratio = params.aspectRatio || params.aspect_ratio || state.settings.openaiAspectRatio || 'auto';
  if (!size || size === 'auto') return 'auto';
  const normalizedSize = String(size).toUpperCase();
  const normalizedRatio = String(ratio || 'auto');
  const pixels = { '1K': 1024 * 1024, '2K': 2048 * 2048, '4K': 3840 * 2160 }[normalizedSize];
  if (!pixels) return String(size);
  const ratioValue = !normalizedRatio || normalizedRatio === 'auto' ? '1:1' : normalizedRatio;
  const [rw, rh] = String(ratioValue).split(':').map(Number);
  if (!rw || !rh) return `${Math.floor(Math.sqrt(pixels) / 16) * 16}x${Math.floor(Math.sqrt(pixels) / 16) * 16}`;
  const ratioNumber = rw / rh;
  let height = Math.sqrt(pixels / ratioNumber);
  let width = height * ratioNumber;
  const maxLongEdge = normalizedSize === '4K' ? 3840 : Math.sqrt(pixels) * 1.54;
  if (Math.max(width, height) > maxLongEdge) {
    const scale = maxLongEdge / Math.max(width, height);
    width *= scale;
    height *= scale;
  }
  width = Math.max(16, Math.floor(width / 16) * 16);
  height = Math.max(16, Math.floor(height / 16) * 16);
  return `${width}x${height}`;
}
const OPENAI_RESOLUTION_TABLE = (() => {
  const tiers = ['1K', '2K', '4K'];
  const ratios = ['1:1', '5:4', '4:5', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '2:1', '1:2'];
  return tiers.reduce((acc, tier) => {
    acc[tier] = ratios.reduce((row, ratio) => {
      row[ratio] = openAiSizePayload({ resolution: tier, aspectRatio: ratio });
      return row;
    }, {});
    return acc;
  }, {});
})();
const GOOGLE_OFFICIAL_IMAGE_SIZES = {
  '1K': {
    '1:1': '1024x1024',
    '3:2': '1264x848',
    '2:3': '848x1264',
    '16:9': '1376x768',
    '9:16': '768x1376',
    '4:3': '1200x896',
    '3:4': '896x1200',
    '4:5': '928x1152',
    '5:4': '1152x928',
    '21:9': '1584x672'
  },
  '2K': {
    '1:1': '2048x2048',
    '3:2': '2528x1696',
    '2:3': '1696x2528',
    '16:9': '2752x1536',
    '9:16': '1536x2752',
    '4:3': '2400x1792',
    '3:4': '1792x2400',
    '4:5': '1856x2304',
    '5:4': '2304x1856',
    '21:9': '3168x1344'
  },
  '4K': {
    '1:1': '4096x4096',
    '3:2': '5056x3392',
    '2:3': '3392x5056',
    '16:9': '5504x3072',
    '9:16': '3072x5504',
    '4:3': '4800x3584',
    '3:4': '3584x4608',
    '4:5': '3712x4608',
    '5:4': '4608x3712',
    '21:9': '6336x2688'
  }
};
function normalizeResolutionTier(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return GOOGLE_OFFICIAL_IMAGE_SIZES[normalized] ? normalized : '';
}
function normalizeGoogleAspectRatio(value) {
  const ratio = String(value || '').trim();
  if (!ratio || ratio === 'auto') return '1:1';
  return ratio;
}
function googleOfficialImageSize(resolution, aspectRatio) {
  const tier = normalizeResolutionTier(resolution);
  if (!tier) return '';
  const ratio = normalizeGoogleAspectRatio(aspectRatio);
  return GOOGLE_OFFICIAL_IMAGE_SIZES[tier]?.[ratio] || '';
}
const XAI_RESOLUTION_TABLE = {
  '1K': {
    '1:1': '1024x1024',
    '16:9': '1344x768',
    '9:16': '768x1344',
    '4:3': '1152x864',
    '3:4': '864x1152',
    '3:2': '1216x832',
    '2:3': '832x1216',
    '2:1': '1408x704',
    '1:2': '704x1408'
  },
  '2K': {
    '1:1': '2048x2048',
    '16:9': '2688x1536',
    '9:16': '1536x2688',
    '4:3': '2304x1728',
    '3:4': '1728x2304',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '2:1': '2816x1408',
    '1:2': '1408x2816'
  }
};
function normalizeProviderTier(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (/^[124]K$/.test(normalized)) return normalized;
  return '';
}
function normalizeAspectForProvider(provider, aspectRatio) {
  const ratio = String(aspectRatio || '').trim();
  if (!ratio || ratio === 'auto') return provider === 'openai' ? '1:1' : '1:1';
  return ratio;
}
function expectedProviderResolution(params = {}) {
  const provider = params.provider || providerKey(activeProfile());
  const tier = normalizeProviderTier(firstDefined(params.resolution, params.size, params.image_size));
  if (!tier) return '';
  const ratio = normalizeAspectForProvider(provider, firstDefined(params.aspectRatio, params.aspect_ratio));
  if (provider === 'google') return GOOGLE_OFFICIAL_IMAGE_SIZES[tier]?.[ratio] || '';
  if (provider === 'xai') return XAI_RESOLUTION_TABLE[tier]?.[ratio] || '';
  return OPENAI_RESOLUTION_TABLE[tier]?.[ratio] || '';
}
function normalizeDimensionsValue(value) {
  const text = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  const match = text.match(/(\d{3,5})[x×*](\d{3,5})/);
  return match ? `${Number(match[1])}x${Number(match[2])}` : '';
}
function actualResolutionForCompare(value, images = []) {
  return normalizeDimensionsValue(value) || normalizeDimensionsValue(firstDefined(images?.[0]?.size, images?.[0]?.dimensions, images?.[0]?.resolution)) || (images?.[0]?.width && images?.[0]?.height ? `${images[0].width}x${images[0].height}` : '');
}
function isTierResolutionMatch(requested = {}, actualValue = '', images = []) {
  const expected = expectedProviderResolution(requested);
  const actual = actualResolutionForCompare(actualValue, images);
  return !!expected && !!actual && expected.toLowerCase() === actual.toLowerCase();
}
const GREEN_KEY_COLOR = '#00FF00';
const MAGENTA_KEY_COLOR = '#FF00FF';
const KEY_COLOR_RGB = {
  [GREEN_KEY_COLOR]: { r: 0, g: 255, b: 0 },
  [MAGENTA_KEY_COLOR]: { r: 255, g: 0, b: 255 }
};
const TRANSPARENT_KEY_PROMPT = [
  '[背景指令]',
  '背景色选择规则：如果主体包含绿色系（绿、青绿、黄绿、草绿等）颜色，使用纯洋红色(#FF00FF)背景；否则一律使用纯绿色(#00FF00)背景。',
  '背景要求：整张画布仅由所选纯色填充，无任何渐变、纹理、阴影、光照变化、地面或环境元素。',
  '主体要求：单主体、完整呈现、轮廓清晰锐利。主体与背景之间保持干净的边缘分离，不要有颜色溢出或混合。',
  '禁止：主体本身、描边、光晕、投影或反射中不能出现所选背景色。'
].join('\n');
function wantsTransparentOutput(params = {}) {
  const format = String(firstDefined(params.format, params.output_format, state.settings.output_format) || '').toLowerCase();
  return format === 'png' && !!firstDefined(params.transparent, params.transparent_background, params.transparent_output, state.settings.transparent_output, false);
}
function buildTransparentKeyPrompt(prompt) {
  return `${String(prompt || '').trim()}\n\n${TRANSPARENT_KEY_PROMPT}`;
}
function getTransparentRequestParams(params = {}) {
  return {
    ...params,
    format: 'png',
    output_format: 'png',
    output_compression: null,
    transparent: true,
    transparent_background: true,
    transparent_output: true
  };
}
function promptWithCanvasConstraint(prompt, provider, params = {}) {
  return wantsTransparentOutput(params) ? buildTransparentKeyPrompt(prompt) : prompt;
}
function getKeyColorRgb(keyColor) {
  const rgb = KEY_COLOR_RGB[String(keyColor || '').toUpperCase()];
  if (!rgb) throw new Error('透明背景键色不支持');
  return rgb;
}
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
function detectKeyColorFromPixels(data, width, height) {
  const greenRgb = KEY_COLOR_RGB[GREEN_KEY_COLOR];
  const magentaRgb = KEY_COLOR_RGB[MAGENTA_KEY_COLOR];
  let greenScore = 0;
  let magentaScore = 0;
  const sample = (index) => {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const greenDist = Math.sqrt((r - greenRgb.r) ** 2 + (g - greenRgb.g) ** 2 + (b - greenRgb.b) ** 2);
    const magentaDist = Math.sqrt((r - magentaRgb.r) ** 2 + (g - magentaRgb.g) ** 2 + (b - magentaRgb.b) ** 2);
    if (greenDist < 100) greenScore += 1;
    if (magentaDist < 100) magentaScore += 1;
  };
  for (let x = 0; x < width; x += 1) {
    sample(x);
    sample((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    sample(y * width);
    sample(y * width + width - 1);
  }
  return magentaScore > greenScore ? MAGENTA_KEY_COLOR : GREEN_KEY_COLOR;
}
function backgroundConfidence(data, index, keyRgb) {
  const offset = index * 4;
  const distance = Math.sqrt(
    (data[offset] - keyRgb.r) ** 2 +
    (data[offset + 1] - keyRgb.g) ** 2 +
    (data[offset + 2] - keyRgb.b) ** 2
  );
  return clamp01((150 - distance) / 150);
}
function connectedKeyMask(data, width, height, keyRgb) {
  const pixelCount = width * height;
  const mask = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const enqueue = (index) => {
    if (index < 0 || index >= pixelCount || visited[index]) return;
    visited[index] = 1;
    if (backgroundConfidence(data, index, keyRgb) < 0.18) return;
    mask[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }
  return mask;
}
function addInteriorKeyIslands(data, width, height, keyRgb, mask) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  const component = new Uint32Array(pixelCount);
  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (mask[seed] || visited[seed] || backgroundConfidence(data, seed, keyRgb) < 0.68) continue;
    let head = 0;
    let tail = 0;
    let length = 0;
    let confidenceSum = 0;
    let strictCount = 0;
    let strongCount = 0;
    visited[seed] = 1;
    queue[tail++] = seed;
    const enqueueNeighbor = (neighbor) => {
      if (neighbor < 0 || neighbor >= pixelCount || mask[neighbor] || visited[neighbor]) return;
      if (backgroundConfidence(data, neighbor, keyRgb) < 0.24) return;
      visited[neighbor] = 1;
      queue[tail++] = neighbor;
    };
    while (head < tail) {
      const index = queue[head++];
      const confidence = backgroundConfidence(data, index, keyRgb);
      component[length++] = index;
      confidenceSum += confidence;
      if (confidence >= 0.68) strictCount += 1;
      if (confidence >= 0.86) strongCount += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      enqueueNeighbor(x > 0 ? index - 1 : -1);
      enqueueNeighbor(x < width - 1 ? index + 1 : -1);
      enqueueNeighbor(y > 0 ? index - width : -1);
      enqueueNeighbor(y < height - 1 ? index + width : -1);
    }
    const average = confidenceSum / Math.max(1, length);
    if (average >= 0.42 || strictCount / length >= 0.18 || strongCount / length >= 0.05 || (length <= 3 && average >= 0.34)) {
      for (let i = 0; i < length; i += 1) mask[component[i]] = 1;
    }
  }
}
function distanceToBackground(mask, width, height, maxDistance = 4) {
  const pixelCount = width * height;
  const distance = new Uint8Array(pixelCount);
  let frontier = [];
  for (let index = 0; index < pixelCount; index += 1) {
    if (mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    if ((x > 0 && mask[index - 1]) || (x < width - 1 && mask[index + 1]) || (y > 0 && mask[index - width]) || (y < height - 1 && mask[index + width])) {
      distance[index] = 1;
      frontier.push(index);
    }
  }
  for (let current = 1; current < maxDistance && frontier.length; current += 1) {
    const next = [];
    for (const index of frontier) {
      const x = index % width;
      const y = Math.floor(index / width);
      for (const neighbor of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1]) {
        if (neighbor < 0 || mask[neighbor] || distance[neighbor]) continue;
        distance[neighbor] = current + 1;
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return distance;
}
function keyChannelMix(red, green, blue, keyRgb) {
  if (keyRgb.g === 255) return clamp01((green - Math.min(red, blue)) / 255);
  return clamp01((Math.min(red, blue) - green * 0.65) / 255);
}
function removeColorSpill(red, green, blue, alpha, keyRgb, confidence, distance) {
  if (alpha === 0) return { r: red, g: green, b: blue };
  const edgeStrength = distance <= 0 ? (confidence >= 0.46 ? 0.35 : 0) : distance === 1 ? 0.55 : distance === 2 ? 0.32 : 0.16;
  const spillMix = keyChannelMix(red, green, blue, keyRgb) * edgeStrength;
  const backgroundMix = clamp01(Math.max((255 - alpha) / 255, ((confidence - 0.1) / 0.9) * edgeStrength, spillMix));
  if (backgroundMix <= 0) return { r: red, g: green, b: blue };
  const foregroundMix = Math.max(0.08, 1 - backgroundMix);
  return {
    r: clampByte((red - keyRgb.r * backgroundMix) / foregroundMix),
    g: clampByte((green - keyRgb.g * backgroundMix) / foregroundMix),
    b: clampByte((blue - keyRgb.b * backgroundMix) / foregroundMix)
  };
}
function removeKeyedBackgroundFromPixels(data, width, height, keyColor) {
  if (data.length < width * height * 4) throw new Error('透明背景像素数据尺寸不匹配');
  const keyRgb = getKeyColorRgb(keyColor);
  const mask = connectedKeyMask(data, width, height, keyRgb);
  addInteriorKeyIslands(data, width, height, keyRgb, mask);
  const distance = distanceToBackground(mask, width, height, 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const confidence = backgroundConfidence(data, index, keyRgb);
    let alpha = 255;
    if (mask[index]) {
      alpha = 0;
    } else if (distance[index] > 0) {
      const edgeStrength = distance[index] <= 1 ? 1 : distance[index] === 2 ? 0.75 : distance[index] === 3 ? 0.45 : 0.25;
      const transparency = clamp01(Math.max(((confidence - 0.08) / 0.84) * edgeStrength, keyChannelMix(red, green, blue, keyRgb) * edgeStrength));
      if (transparency > 0) alpha = Math.round(255 * (1 - transparency));
      alpha = Math.max(alpha, distance[index] === 1 ? 48 : distance[index] === 2 ? 128 : 196);
    } else if (confidence >= 0.46 && keyChannelMix(red, green, blue, keyRgb) >= 0.45) {
      alpha = Math.max(96, Math.round(255 * (1 - keyChannelMix(red, green, blue, keyRgb) * 0.75)));
    }
    const cleaned = removeColorSpill(red, green, blue, alpha, keyRgb, confidence, distance[index]);
    data[offset] = cleaned.r;
    data[offset + 1] = cleaned.g;
    data[offset + 2] = cleaned.b;
    data[offset + 3] = alpha;
  }
  return data;
}
async function blobToImageElement(blob) {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片加载失败，无法执行透明背景后处理'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function removeKeyedBackgroundFromBlob(blob, keyColor) {
  const img = await blobToImageElement(blob);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('当前浏览器不支持 Canvas，无法执行透明背景后处理');
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  removeKeyedBackgroundFromPixels(pixels.data, canvas.width, canvas.height, keyColor || detectKeyColorFromPixels(pixels.data, canvas.width, canvas.height));
  ctx.putImageData(pixels, 0, 0);
  return await new Promise((resolve, reject) => {
    canvas.toBlob((out) => out ? resolve(out) : reject(new Error('透明背景 PNG 导出失败')), 'image/png');
  });
}
function normalizeError(error, fallback = '操作失败') {
  const raw = error?.raw ?? error?.cause ?? error;
  let summary = '';
  let detail = '';
  let code = error?.code || '';
  const readObject = (obj) => {
    if (!obj || typeof obj !== 'object') return '';
    code = code || obj.code || obj.type || obj.status || '';
    const message = obj.message || obj.error_description || obj.error || obj.detail || obj.msg;
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') return readObject(message);
    for (const value of Object.values(obj)) {
      if (typeof value === 'string' && value.trim() && value !== '[object Object]') return value;
      if (value && typeof value === 'object') {
        const nested = readObject(value);
        if (nested) return nested;
      }
    }
    return '';
  };
  if (typeof raw === 'string') summary = raw;
  else if (raw instanceof Error) summary = raw.message || '';
  else summary = readObject(raw);
  if (!summary && error instanceof Error) summary = error.message || '';
  if (!summary || summary === '[object Object]') summary = fallback;
  try {
    if (typeof raw === 'string') detail = raw;
    else detail = JSON.stringify(raw, null, 2);
  } catch {
    detail = String(raw || summary);
  }
  if (detail === '[object Object]') detail = summary;
  return { summary: String(summary).slice(0, 220), detail: detail || String(summary), code, raw };
}
function errorSummary(error, fallback) {
  return normalizeError(error, fallback).summary;
}
function extractResponseText(data, fallback = '') {
  const direct = firstDefined(data?.output_text, data?.outputText, data?.text, data?.message, data?.content, data?.choices?.[0]?.message?.content, data?.choices?.[0]?.delta?.content);
  if (typeof direct === 'string') return direct;
  const chunks = [];
  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (item?.type && item.type !== 'message' && !Array.isArray(item?.content)) continue;
      for (const part of item?.content || []) {
        const text = firstDefined(part?.text, part?.output_text, part?.content);
        if (typeof text === 'string' && text.trim()) chunks.push(text.trim());
      }
    }
  }
  if (Array.isArray(data?.choices)) {
    for (const choice of data.choices) {
      const text = firstDefined(choice?.message?.content, choice?.delta?.content, choice?.text);
      if (typeof text === 'string' && text.trim()) chunks.push(text.trim());
    }
  }
  for (const obj of collectObjectsDeep(data, { maxDepth: 7 })) {
    for (const key of ['output_text', 'text', 'content', 'message']) {
      const value = obj?.[key];
      if (typeof value === 'string' && value.trim()) chunks.push(value.trim());
    }
  }
  if (chunks.length) return [...new Set(chunks)].join('\n\n').slice(0, 4000);
  if (fallback) return fallback;
  try { return JSON.stringify(summarizeResponse(data), null, 2).slice(0, 1600); } catch { return '收到响应，但无法解析为文本。'; }
}

function render() {
  const app = $('#app');
  if (!app) return;
  const focusState = captureFocusState();
  const galleryScrollState = captureGalleryScrollState();
  captureAgentScrollState();
  const workspaceMode = state.mode === 'agent' ? 'is-agent' : state.mode === 'pro' ? 'is-pro' : state.mode === 'workflow' ? 'is-workflow' : 'is-gallery';
  app.innerHTML = `
    <div class="workspace ${workspaceMode}">
      ${renderSidebar()}
      <main class="main">
        ${state.mode === 'agent' ? renderAgentStage() : state.mode === 'pro' ? renderProWorkbench() : state.mode === 'workflow' ? renderWorkflowWorkspace(activeProject(), currentProjectWorkflowRuns()) : renderGalleryStage()}
        ${state.mode === 'agent' ? renderAgentComposer() : state.mode === 'gallery' ? renderGalleryComposer() : ''}
      </main>
    </div>
    <div class="toast-stack" id="toastStack"></div>
    ${state.modal ? renderDetailModal(state.modal) : ''}
    ${state.viewer ? renderViewer(state.viewer) : ''}
    ${state.imageContextMenu ? renderImageContextMenu(state.imageContextMenu) : ''}
    ${state.promptRepo.open ? `<div id="promptRepoMount">${renderPromptRepo()}</div>` : ''}
    ${state.popover ? renderPopover(state.popover) : ''}
    ${state.workflowDraft ? renderWorkflowEditorModal(state.workflowDraft) : ''}
    ${state.workflowInvoke ? renderWorkflowInvokeModal() : ''}
    ${state.confirmDialog ? renderConfirmDialog() : ''}
    ${state.entryAdvancedModal ? renderEntryAdvancedModal(state.entryAdvancedModal) : ''}
    ${state.maskEditor ? renderMaskEditor() : ''}
    <input id="refFileInput" class="hidden" type="file" accept="image/*" multiple>
    <input id="proFileInput" class="hidden" type="file" accept="image/*" multiple>
    <input id="workflowRefInput" class="hidden" type="file" accept="image/*" multiple>
    <input id="agentAttachmentInput" class="hidden" type="file" accept="image/*,.txt,.md,.json,.csv,.tsv,.html,.css,.js,.mjs,.cjs,.xml,.yaml,.yml" multiple>
  `;
  hydrateImages();
  bindTransientEvents();
  restoreFocusState(focusState);
  restoreGalleryScrollState(galleryScrollState);
  restoreAgentScrollState();
}
function nextRenderFrame(fn) {
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => setTimeout(callback, 0);
  raf(fn);
}
function captureFocusState() {
  const active = document.activeElement;
  if (!active || active.id !== 'promptRepoSearch') return null;
  return {
    id: active.id,
    value: active.value,
    start: active.selectionStart,
    end: active.selectionEnd
  };
}
function restoreFocusState(focusState) {
  if (!focusState) return;
  const node = document.getElementById(focusState.id);
  if (!node) return;
  node.focus({ preventScroll: true });
  const length = node.value.length;
  const start = Math.min(focusState.start ?? length, length);
  const end = Math.min(focusState.end ?? start, length);
  try { node.setSelectionRange(start, end); } catch {}
}
function currentThemeMode() {
  return window.GptShellTheme?.currentThemeMode?.(state?.preferences?.themeMode || 'light')
    || localStorage.getItem(THEME_KEY)
    || state?.preferences?.themeMode
    || 'light';
}
function themeButtonIconHtml(mode = currentThemeMode()) {
  return window.GptShellTheme?.iconHtml?.(mode)
    || (mode === 'dark' ? '🌙' : mode === 'system' ? '💻' : '☀️');
}
function themeButtonLabel(mode = currentThemeMode()) {
  return window.GptShellTheme?.labelForTheme?.(mode)
    || (mode === 'dark' ? '主题：深色' : mode === 'system' ? '主题：跟随系统' : '主题：浅色');
}
function renderThemeToggleButton(className = '') {
  const mode = currentThemeMode();
  return `<button class="theme-toggle-button${className ? ` ${className}` : ''}" data-action="theme" data-theme-toggle-button="1" data-theme-mode="${esc(mode)}" title="${esc(themeButtonLabel(mode))}" aria-label="${esc(themeButtonLabel(mode))}"><span class="theme-toggle-icon" aria-hidden="true">${themeButtonIconHtml(mode)}</span></button>`;
}
function captureAgentScrollState() {
  const log = $('.agent-log');
  if (!log) return;
  if (state.agentScrollLock?.anchor) {
    state.agentScrollState = {
      nearBottom: false,
      offsetFromBottom: Math.max(0, log.scrollHeight - log.scrollTop - log.clientHeight),
      scrollTop: Number(log.scrollTop) || 0,
      anchor: state.agentScrollLock.anchor
    };
    return;
  }
  const offsetFromBottom = Math.max(0, log.scrollHeight - log.scrollTop - log.clientHeight);
  state.agentScrollState = {
    nearBottom: offsetFromBottom <= 56,
    offsetFromBottom,
    scrollTop: log.scrollTop,
    anchor: captureAgentScrollAnchor(log)
  };
}
function restoreAgentScrollState() {
  const log = $('.agent-log');
  if (!log) return;
  const snapshot = state.agentScrollState || { nearBottom: true, offsetFromBottom: 0 };
  const intent = state.agentScrollIntent || '';
  nextRenderFrame(() => {
    if (intent === 'force-bottom' || snapshot.nearBottom) log.scrollTop = log.scrollHeight;
    else if (!restoreAgentScrollAnchor(log, snapshot.anchor)) log.scrollTop = Math.max(0, log.scrollHeight - log.clientHeight - snapshot.offsetFromBottom);
    state.agentScrollIntent = '';
    if (state.agentScrollLock && !state.agentScrollLock.keep) state.agentScrollLock = null;
  });
}
function freezeAgentScrollForRender(anchor = captureAgentScrollAnchor()) {
  if (!anchor?.id) return null;
  state.agentScrollLock = { anchor, keep: true };
  state.agentScrollState = {
    nearBottom: false,
    offsetFromBottom: 0,
    scrollTop: Number(anchor.scrollTop) || 0,
    anchor
  };
  return anchor;
}
function releaseAgentScrollFreezeAfterRender() {
  if (state.agentScrollLock) state.agentScrollLock.keep = false;
}
function captureAgentScrollAnchor(log = $('.agent-log')) {
  if (!log || typeof log.getBoundingClientRect !== 'function') return null;
  const logRect = log.getBoundingClientRect();
  const messages = Array.from(log.querySelectorAll?.('.agent-message[data-agent-message-id]') || []);
  for (const message of messages) {
    if (!message?.dataset?.agentMessageId || typeof message.getBoundingClientRect !== 'function') continue;
    const rect = message.getBoundingClientRect();
    if (rect.bottom <= logRect.top || rect.top >= logRect.bottom) continue;
    if (rect.top < logRect.top) continue;
    return {
      id: message.dataset.agentMessageId,
      offsetTop: Math.round(rect.top - logRect.top),
      scrollTop: Number(log.scrollTop) || 0
    };
  }
  const spanning = messages.find((message) => {
    if (!message?.dataset?.agentMessageId || typeof message.getBoundingClientRect !== 'function') return false;
    const rect = message.getBoundingClientRect();
    return rect.top < logRect.top && rect.bottom > logRect.top;
  });
  if (!spanning) return null;
  const rect = spanning.getBoundingClientRect();
  return {
    id: spanning.dataset.agentMessageId,
    offsetTop: Math.round(rect.top - logRect.top),
    scrollTop: Number(log.scrollTop) || 0
  };
}
function restoreAgentScrollAnchor(log = $('.agent-log'), anchor = null) {
  if (!log || !anchor?.id || typeof log.getBoundingClientRect !== 'function') return false;
  const selector = `.agent-message[data-agent-message-id="${cssEscape(anchor.id)}"]`;
  const message = log.querySelector?.(selector);
  if (!message || typeof message.getBoundingClientRect !== 'function') return false;
  const logRect = log.getBoundingClientRect();
  const rect = message.getBoundingClientRect();
  const delta = Math.round((rect.top - logRect.top) - (Number(anchor.offsetTop) || 0));
  log.scrollTop = Math.max(0, (Number(log.scrollTop) || 0) + delta);
  return true;
}
function captureGalleryScrollState(root = document) {
  const scroll = $('.gallery-scroll', root);
  if (!scroll) return null;
  return {
    scrollTop: Number(scroll.scrollTop) || 0,
    scrollLeft: Number(scroll.scrollLeft) || 0,
    scrollHeight: Number(scroll.scrollHeight) || 0,
    scrollWidth: Number(scroll.scrollWidth) || 0,
    clientHeight: Number(scroll.clientHeight) || 0,
    clientWidth: Number(scroll.clientWidth) || 0
  };
}
function restoreGalleryScrollState(snapshot, root = document) {
  if (!snapshot) return;
  nextRenderFrame(() => {
    const scroll = $('.gallery-scroll', root);
    if (!scroll) return;
    const maxTop = Math.max(0, (Number(scroll.scrollHeight) || 0) - (Number(scroll.clientHeight) || 0));
    const maxLeft = Math.max(0, (Number(scroll.scrollWidth) || 0) - (Number(scroll.clientWidth) || 0));
    scroll.scrollTop = Math.min(Number(snapshot.scrollTop) || 0, maxTop);
    scroll.scrollLeft = Math.min(Number(snapshot.scrollLeft) || 0, maxLeft);
  });
}

function renderSidebar() {
  const username = state.user?.username || '未登录';
  const userInitial = (state.user?.username || '访').slice(0, 1);
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-logo">NG</div>
        <div class="brand-copy"><div class="brand-title">NexGen</div><div class="brand-subtitle">Nexus Generation</div></div>
        ${renderThemeToggleButton('sidebar-theme-toggle')}
      </div>
      <section class="sidebar-section">
        <button class="nav-button ${state.mode === 'gallery' ? 'active' : ''}" data-action="set-mode" data-mode="gallery" title="画廊生图"><span class="nav-icon">G</span><span>画廊</span></button>
        <button class="nav-button ${state.mode === 'pro' ? 'active' : ''}" data-action="set-mode" data-mode="pro" title="专业工作台"><span class="nav-icon">P</span><span>专业</span></button>
        <button class="nav-button ${state.mode === 'agent' ? 'active' : ''}" data-action="set-mode" data-mode="agent" title="Agent 项目"><span class="nav-icon">A</span><span>Agent</span></button>
        <button class="nav-button ${state.mode === 'workflow' ? 'active' : ''}" data-action="set-mode" data-mode="workflow" title="工作流"><span class="nav-icon">W</span><span>工作流</span></button>
      </section>
      <section class="sidebar-section">
        <div class="account-card">
          <div class="account-line">
            <span class="account-avatar">${esc(userInitial)}</span>
            <div><div class="account-name">${esc(username)}</div><div class="account-role">${esc(state.user?.role || 'guest')}</div></div>
            ${renderThemeToggleButton('mobile-theme-toggle')}
            <button class="account-menu-button" data-action="account-menu" title="菜单">•••</button>
          </div>
          ${state.accountMenuOpen ? `<div class="account-menu" data-stop>
            <button data-action="leave" data-url="/prompts">仓库</button>
            <button data-action="leave" data-url="/admin">后台</button>
            <button data-action="theme">主题</button>
            <button data-action="leave" data-url="/login">${state.user ? '退出/登录' : '登录'}</button>
          </div>` : ''}
        </div>
      </section>
      <div class="sidebar-spacer"></div>
    </aside>
  `;
}

function currentProjectWorkflows(projectId = state.agent.activeProjectId) {
  return (state.agent.workflows || []).filter((workflow) => workflow.projectId === projectId);
}
function currentProjectWorkflowRuns(projectId = state.agent.activeProjectId) {
  return (state.agent.workflowRuns || []).filter((run) => run.projectId === projectId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
function taskCountInfo(task) {
  const actual = Number(task.actualCount || task.images?.length || 0);
  const expected = Math.max(0, Number(task.expectedCount || task.requestedParams?.count || task.count || actual || 0));
  const multi = expected > 1 || actual > 1;
  const ratio = multi ? `${actual}/${expected || '?'}` : '';
  if (task.status === 'partial_success') return { label: multi ? `未完成 ${ratio}` : '部分成功', actual, expected, multi };
  if ((task.status === 'error' || task.status === 'interrupted') && actual > 0) return { label: multi ? `未完成 ${ratio}` : '未完成', actual, expected, multi };
  const statusText = { queued: '排队', running: '生成中', success: '完成', error: '失败', interrupted: '已中断' }[task.status] || task.status;
  return { label: multi && task.status === 'success' ? `${statusText} ${ratio}` : statusText, actual, expected, multi };
}
function taskReferenceSnapshots(task) {
  return sanitizeReferenceSnapshots(task.referenceSnapshots || task.references || []);
}
function taskReferenceDisplayBlobId(ref) {
  return ref?.compositedBlobId || ref?.blobId || '';
}
function taskReferenceOriginalBlobId(ref) {
  return ref?.originalBlobId || ref?.blobId || ref?.compositedBlobId || '';
}
function renderReferenceBadge(task, context = 'card') {
  const refs = taskReferenceSnapshots(task);
  if (!refs.length) return '';
  const extra = refs.length > 1 ? `<span class="task-ref-count">+${esc(refs.length - 1)}</span>` : '';
  return `<button class="task-reference-badge ${context === 'detail' ? 'detail-ref-badge' : ''}" data-action="open-task-reference-viewer" data-task-id="${esc(task.id)}" data-ref-index="0" title="查看参考图原图"><img data-image-kind="task-reference" data-task-ref-task-id="${esc(task.id)}" data-task-ref-index="0" alt="">${extra}</button>`;
}
function renderTaskReferenceStrip(task) {
  const refs = taskReferenceSnapshots(task);
  if (!refs.length) return '';
  return `
    <div class="detail-section-label">参考图</div>
    <div class="detail-reference-strip">
      ${refs.map((ref, index) => `<button class="detail-reference-thumb" data-action="open-task-reference-viewer" data-task-id="${esc(task.id)}" data-ref-index="${esc(index)}" title="查看参考图原图"><img data-image-kind="task-reference" data-task-ref-task-id="${esc(task.id)}" data-task-ref-index="${esc(index)}" alt="${esc(ref.name || 'reference')}"></button>`).join('')}
    </div>
  `;
}
function cardParamSummary(task) {
  const req = task.requestedParams || {};
  const countInfo = taskCountInfo(task);
  const image = (task.images || [])[0] || {};
  const actualSize = image.width && image.height ? `${image.width}×${image.height}` : firstDefined(task.returnedParams?.resolution, task.returnedParams?.size, '');
  const refs = taskReferenceSnapshots(task).length;
  const format = firstDefined(req.format, req.output_format, task.format, state.settings.output_format);
  const isPng = normalizeComparableValue(format, 'format') === 'png';
  const profile = firstDefined(req.profileName, task.profileName, task.model, 'model');
  const variable = isPng
    ? `透明${normalizeComparableValue(firstDefined(req.transparent, req.transparent_background), 'bool') === 'yes' ? '开' : '关'}`
    : `压缩${displayParamValue(firstDefined(req.compression, req.outputCompression, req.output_compression, task.compression), '')}`;
  return [
    profile,
    variable,
    displayParamValue(firstDefined(req.quality, task.quality), '质量auto'),
    displayParamValue(format, 'png'),
    displayParamValue(firstDefined(req.resolution, req.size, task.sizeLabel), 'auto'),
    displayParamValue(firstDefined(req.aspectRatio, req.aspect_ratio), 'auto'),
    actualSize ? `实际 ${actualSize}` : '',
    refs ? `参考图 ${refs}` : '',
    countInfo.multi ? `${countInfo.actual}/${countInfo.expected || '?'} 张` : ''
  ].filter(Boolean);
}
function cardInsightSummary(task, countInfo = taskCountInfo(task)) {
  const refs = taskReferenceSnapshots(task).length;
  const pieces = [];
  if (task.workflowName) pieces.push(task.workflowName);
  if (task.tags) pieces.push(String(task.tags).split(/[，,]/)[0]);
  if (!pieces.length && refs > 1) pieces.push(`多参考 ${refs}`);
  if (!pieces.length && countInfo.multi) pieces.push(`多图任务 ${countInfo.actual}/${countInfo.expected || '?'}`);
  return pieces.slice(0, 5);
}
function iconButtonHtml(action, id, icon, label, extra = '') {
  return `<button class="asset-icon-action ${extra}" data-action="${action}" data-id="${esc(id)}" title="${esc(label)}" aria-label="${esc(label)}"><span aria-hidden="true">${icon}</span></button>`;
}
function taskActionIcon(name, active = false) {
  if (name === 'retry') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M19 12a7 7 0 1 1-2.1-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if (name === 'favorite') return active
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.8 2.45 4.97 5.49.8-3.97 3.88.94 5.47L12 16.34 7.09 18.92l.94-5.47-3.97-3.88 5.49-.8L12 3.8Z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.8 2.45 4.97 5.49.8-3.97 3.88.94 5.47L12 16.34 7.09 18.92l.94-5.47-3.97-3.88 5.49-.8L12 3.8Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>';
  if (name === 'reuse') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H4v5M4.5 12.1A7.5 7.5 0 0 0 17 7.8M15 17h5v-5M19.5 11.9A7.5 7.5 0 0 0 7 16.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if (name === 'edit') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l9.9-9.9a1.9 1.9 0 0 0 0-2.7l-1.3-1.3a1.9 1.9 0 0 0-2.7 0L4 16v4Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="m12.7 7.3 4 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
  if (name === 'delete') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h8m-7 3v6m3-6v6m3-6v6M6.5 8l.7 11.2A2 2 0 0 0 9.2 21h5.6a2 2 0 0 0 2-1.8L17.5 8M10 5h4l.8 2H19M5 7h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return '';
}
function galleryMetrics() {
  const width = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
  if (width <= 760) return { columns: 1, cardHeight: 338, gap: 10 };
  if (width <= 1100) return { columns: 2, cardHeight: 318, gap: 8 };
  return { columns: 3, cardHeight: 306, gap: 8 };
}
function galleryVirtualWindow(totalItems) {
  const metrics = galleryMetrics();
  const totalRows = Math.ceil(totalItems / metrics.columns);
  const pitch = metrics.cardHeight + metrics.gap;
  const viewportHeight = Math.max(320, Number(state.galleryVirtual?.viewportHeight) || 720);
  const scrollTop = Math.max(0, Number(state.galleryVirtual?.scrollTop) || 0);
  const shouldVirtualize = totalItems > GALLERY_VIRTUAL_THRESHOLD;
  if (!shouldVirtualize) {
    return { ...metrics, shouldVirtualize, startIndex: 0, endIndex: totalItems, topPad: 0, bottomPad: 0, totalRows };
  }
  const startRow = Math.max(0, Math.floor(scrollTop / pitch) - GALLERY_VIRTUAL_BUFFER_ROWS);
  const visibleRows = Math.ceil(viewportHeight / pitch) + GALLERY_VIRTUAL_BUFFER_ROWS * 2;
  const endRow = Math.min(totalRows, startRow + visibleRows);
  return {
    ...metrics,
    shouldVirtualize,
    startIndex: startRow * metrics.columns,
    endIndex: Math.min(totalItems, endRow * metrics.columns),
    topPad: startRow * pitch,
    bottomPad: Math.max(0, (totalRows - endRow) * pitch),
    totalRows
  };
}
function renderWorkflowSidebar(project) {
  const workflows = currentProjectWorkflows(project?.id);
  return `
    <section class="sidebar-section workflow-sidebar">
      <div class="section-label">Workflows</div>
      <div class="workflow-list">
        ${workflows.length ? workflows.map((workflow) => `
          <div class="workflow-list-item ${state.workflowInvoke?.workflowId === workflow.id ? 'active' : ''}">
            <button class="workflow-main" data-action="invoke-workflow" data-id="${esc(workflow.id)}">
              <strong>${esc(workflow.name || '未命名工作流')}</strong>
              <span>${esc(workflow.status || 'ready')} · ${workflow.nodes?.length || 0} 节点 · ${workflow.lastRunAt ? formatTime(workflow.lastRunAt) : '未运行'}</span>
            </button>
            <div class="workflow-mini-actions">
              <button data-action="edit-workflow" data-id="${esc(workflow.id)}">编辑</button>
              <button data-action="duplicate-workflow" data-id="${esc(workflow.id)}">复制</button>
              <button data-action="delete-workflow" data-id="${esc(workflow.id)}">删</button>
            </div>
          </div>`).join('') : '<div class="workflow-empty">还没有可复用工作流。用 Agent 生成后保存到这里。</div>'}
      </div>
      <button class="mini-button workflow-new" data-action="new-workflow-draft">新建工作流</button>
    </section>
  `;
}

function renderGalleryStage() {
  const tasks = filteredTasks();
  const hasSelection = state.selectedTaskIds.length > 0;
  const windowState = galleryVirtualWindow(tasks.length);
  const visibleTasks = tasks.slice(windowState.startIndex, windowState.endIndex);
  return `
    <section class="gallery-stage">
      <div class="asset-toolbar">
        <label class="search-box" aria-label="搜索画廊">
          <span class="search-box-prefix" aria-hidden="true">搜索</span>
          <input value="${esc(state.promptQuery || '')}" placeholder="按提示词、模型、尺寸、标签搜索..." data-action="search-gallery" autocomplete="off" spellcheck="false">
        </label>
        ${renderBatchActions(hasSelection)}
      </div>
      <div class="gallery-scroll" data-virtual="${windowState.shouldVirtualize ? '1' : '0'}">
        ${tasks.length ? `
          <div class="gallery-spacer" style="height:${esc(windowState.topPad)}px"></div>
          <div class="gallery-grid ${windowState.shouldVirtualize ? 'is-virtual' : ''}" style="--gallery-card-height:${esc(windowState.cardHeight)}px">${visibleTasks.map(renderAssetCard).join('')}</div>
          <div class="gallery-spacer" style="height:${esc(windowState.bottomPad)}px"></div>
        ` : `<div class="empty-state"><div><strong>画廊等待第一个任务</strong><span>输入提示词并点击生成，运行卡片会立即进入画廊。</span></div></div>`}
      </div>
    </section>
  `;
}
function renderBatchActions(hasSelection = state.selectedTaskIds.length > 0) {
  return hasSelection ? `<div class="batch-actions">
    <button class="toolbar-button" data-action="select-all">全选</button>
    <button class="toolbar-button" data-action="download-selected">批量下载</button>
    <button class="toolbar-button danger" data-action="delete-selected">批量删除</button>
  </div>` : '';
}
function updateBatchActionsDom() {
  const toolbar = $('.asset-toolbar');
  if (!toolbar) return;
  const existing = $('.batch-actions', toolbar);
  const html = renderBatchActions();
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.outerHTML = html;
  } else {
    toolbar.insertAdjacentHTML('beforeend', html);
  }
}
function renderGalleryListOnly() {
  const scroll = $('.gallery-scroll');
  if (!scroll) return render();
  const galleryScrollState = captureGalleryScrollState();
  state.galleryVirtual = { ...(state.galleryVirtual || {}), scrollTop: galleryScrollState?.scrollTop || 0, viewportHeight: scroll.clientHeight || state.galleryVirtual?.viewportHeight || 720 };
  const tasks = filteredTasks();
  const windowState = galleryVirtualWindow(tasks.length);
  const visibleTasks = tasks.slice(windowState.startIndex, windowState.endIndex);
  scroll.dataset.virtual = windowState.shouldVirtualize ? '1' : '0';
  if (galleryImageObserver) galleryImageObserver.disconnect();
  scroll.innerHTML = tasks.length
    ? `<div class="gallery-spacer" style="height:${esc(windowState.topPad)}px"></div><div class="gallery-grid ${windowState.shouldVirtualize ? 'is-virtual' : ''}" style="--gallery-card-height:${esc(windowState.cardHeight)}px">${visibleTasks.map(renderAssetCard).join('')}</div><div class="gallery-spacer" style="height:${esc(windowState.bottomPad)}px"></div>`
    : `<div class="empty-state"><div><strong>没有匹配的任务</strong><span>换一个关键词，或清空搜索查看全部画廊资产。</span></div></div>`;
  hydrateImages();
  restoreGalleryScrollState(galleryScrollState);
}
function scheduleGalleryVirtualRender() {
  if (state.galleryVirtual?.scheduled) return;
  state.galleryVirtual = { ...(state.galleryVirtual || {}), scheduled: true };
  nextRenderFrame(() => {
    state.galleryVirtual = { ...(state.galleryVirtual || {}), scheduled: false };
    renderGalleryListOnly();
  });
}

function renderProWorkbench() {
  const mode = PRO_WORKBENCH_MODES[state.pro.mode] || PRO_WORKBENCH_MODES.ai;
  const refs = state.pro.refs || [];
  const baseRef = refs.find((ref) => ref.slot === 'base') || refs[0];
  const styleRef = refs.find((ref) => ref.slot === 'style') || refs.find((ref) => ref.id !== baseRef?.id);
  const task = state.tasks.find((item) => item.id === state.pro.activeTaskId);
  return `
    <section class="pro-stage">
      <div class="pro-mode-rail">
        <div class="detail-section-label">专业工作台</div>
        ${Object.entries(PRO_WORKBENCH_MODES).map(([key, item]) => `
          <button class="pro-mode-card ${state.pro.mode === key ? 'active' : ''}" data-action="pro-mode" data-mode="${esc(key)}">
            <span>${esc(item.icon)}</span>
            <strong>${esc(item.label)}</strong>
            <small>${esc(key === 'styleTransfer' ? '底图 + 参考图' : '1 张底图')}</small>
          </button>
        `).join('')}
        <div class="pro-hint">${esc(mode.helper)}</div>
      </div>
      <div class="pro-canvas">
        <div class="pro-canvas-head">
          <div>
            <div class="detail-section-label">Render Workspace</div>
            <h1>${esc(mode.title)}</h1>
            <p>${esc(mode.helper)}</p>
          </div>
          <span class="pro-provider">${esc(PROVIDER[providerKey(imageProfile())]?.name || imageProfile().provider)} · ${esc(imageProfile().model || 'model')}</span>
        </div>
        <div class="pro-upload-grid ${state.pro.mode === 'styleTransfer' ? '' : 'single'}">
          ${renderProUploadSlot('base', '底图', baseRef, '上传需要渲染的原始图片')}
          ${state.pro.mode === 'styleTransfer' ? renderProUploadSlot('style', '参考图', styleRef, '上传风格、材质或氛围参考') : ''}
        </div>
        <div class="pro-result-panel">
          ${task ? renderProTaskPreview(task) : '<div class="empty-state"><div><strong>等待专业渲染</strong><span>上传图片并分析参数，结果会自动进入画廊资产库。</span></div></div>'}
        </div>
      </div>
      <aside class="pro-param-panel">
        <div class="detail-section-label">Prompt</div>
        <textarea class="pro-prompt" data-action="pro-prompt-input" placeholder="${esc(mode.placeholder)}">${esc(state.pro.prompt || '')}</textarea>
        <div class="pro-actions">
          ${renderImageProfileSelect('pro', state.pro.profileId || state.activeImageProfileId)}
          <button class="toolbar-button" data-action="pro-analyze" ${state.pro.analyzing ? 'disabled' : ''}>${state.pro.analyzing ? '分析中...' : 'AI 分析'}</button>
          <button class="generate-button" data-action="pro-render" ${state.pro.running ? 'disabled' : ''}>${state.pro.running ? '渲染中' : '开始渲染'}</button>
        </div>
        ${renderEntryAdvancedControls('pro')}
        ${renderProAnalysis()}
        ${renderProControls()}
      </aside>
    </section>
  `;
}
function renderProUploadSlot(slot, title, ref, helper) {
  return `
    <button class="pro-upload-slot ${ref ? 'has-image' : ''}" data-action="pro-pick-file" data-slot="${esc(slot)}">
      ${ref ? `<img data-pro-ref-id="${esc(ref.id)}" alt="">` : `<span class="pro-upload-plus">+</span>`}
      <strong>${esc(title)}</strong>
      <small>${esc(ref?.name || helper)}</small>
      ${ref ? `<em data-action="pro-remove-ref" data-id="${esc(ref.id)}">移除</em>` : ''}
    </button>
  `;
}
function renderProTaskPreview(task) {
  const image = (task.images || [])[0];
  const status = task.status === 'success' ? '已完成' : task.status === 'error' ? '失败' : task.status === 'interrupted' ? '已中断' : '运行中';
  return `
    <div class="pro-task-preview ${esc(task.status)}">
      <div class="pro-preview-media">
        ${image ? `<img data-blob-id="${esc(image.blobId || '')}" data-remote-url="${esc(image.url || image.remoteUrl || '')}" alt="">` : '<div class="progress-ring"></div>'}
      </div>
      <div>
        <div class="detail-section-label">执行状态</div>
        <h3>${esc(status)}</h3>
        <p>${esc(task.prompt || '')}</p>
        <div class="asset-meta">
          <span>${esc(task.sizeLabel || 'auto')}</span>
          <span>${esc(task.quality || 'auto')}</span>
          <span>${esc(formatElapsed(task))}</span>
        </div>
        <div class="detail-actions">
          <button class="reuse" data-action="open-detail" data-id="${esc(task.id)}">查看详情</button>
          ${task.status === 'error' || task.status === 'interrupted' ? `<button class="edit" data-action="retry-task" data-id="${esc(task.id)}">重试</button>` : ''}
        </div>
      </div>
    </div>
  `;
}
function renderProAnalysis() {
  const analysis = state.pro.analysis;
  if (!analysis) return '<div class="pro-analysis empty">AI 分析会生成场景、材质、灯光、镜头和推荐提示词。</div>';
  return `
    <div class="pro-analysis">
      <div><strong>推荐提示词</strong><p>${esc(analysis.recommendedPrompt || '未返回')}</p></div>
      <div class="pro-analysis-grid">
        ${['review', 'intent', 'strategy', 'scene', 'material', 'lighting', 'camera', 'style', 'negative'].map((key) => `<span><b>${esc(proAnalysisLabel(key))}</b>${esc(analysis[key] || '未识别')}</span>`).join('')}
      </div>
      ${Array.isArray(analysis.dimensions) && analysis.dimensions.length ? `<div class="pro-dimension-list">${analysis.dimensions.map((item) => `<span>${esc(item.label || item.name || item)}</span>`).join('')}</div>` : ''}
      <button class="toolbar-button" data-action="pro-use-analysis">采用分析建议</button>
    </div>
  `;
}
function proAnalysisLabel(key) {
  return { review: '读图审片', intent: '意图理解', strategy: '策略封装', scene: '场景', material: '材质', lighting: '灯光', camera: '镜头', style: '风格', negative: '负面' }[key] || key;
}
function renderProParamInput(field, label) {
  return `<label class="pro-field"><span>${esc(label)}</span><input value="${esc(state.pro.params[field] || '')}" data-action="pro-param-input" data-field="${esc(field)}"></label>`;
}
function renderProControls() {
  if (state.pro.mode === 'manual') return renderManualProControls();
  if (state.pro.mode === 'styleTransfer') return `
    <div class="detail-section-label">迁移维度</div>
    <div class="pro-dimension-grid">
      ${PRO_DIMENSIONS.map(([key, label]) => `<label class="pro-check"><input type="checkbox" data-action="pro-dimension-input" data-key="${esc(key)}" ${state.pro.selectedDimensions?.[key] !== false ? 'checked' : ''}>${esc(label)}</label>`).join('')}
    </div>
    <div class="detail-section-label">参数控制</div>
    ${renderProParamInput('scene', '目标场景')}
    ${renderProParamInput('style', '目标风格')}
    <label class="pro-field"><span>参考强度</span><select data-action="pro-param-input" data-field="strength">
      ${['low', 'medium', 'high'].map((value) => `<option value="${value}" ${state.pro.params.strength === value ? 'selected' : ''}>${value}</option>`).join('')}
    </select></label>
  `;
  return `
    <div class="detail-section-label">参数控制</div>
    ${renderProParamInput('scene', '场景类型')}
    ${renderProParamInput('material', '材质')}
    ${renderProParamInput('lighting', '光影')}
    ${renderProParamInput('camera', '镜头')}
    ${renderProParamInput('style', '风格')}
  `;
}
function renderManualProControls() {
  const params = state.pro.params || {};
  return `
    <div class="detail-section-label">手动参数</div>
    ${renderOptionGroup('scene', '渲染场景', PRO_MANUAL_SCHEMA.scenes)}
    ${renderOptionGroup('time', '具体时间', PRO_MANUAL_SCHEMA.time)}
    ${renderProParamInput('customTime', '自定义时间')}
    ${renderOptionGroup('weather', '天气状态', PRO_MANUAL_SCHEMA.weather)}
    ${renderProParamInput('customWeather', '自定义天气')}
    ${renderOptionGroup('indoorLighting', '室内灯光', PRO_MANUAL_SCHEMA.lighting)}
    ${renderProParamInput('customLighting', '自定义灯光')}
    <label class="pro-field"><span>补充说明</span><textarea data-action="pro-param-input" data-field="notes" placeholder="补充环境背景、动态人物、成片质感等">${esc(params.notes || '')}</textarea></label>
    <div class="pro-chip-group">${PRO_MANUAL_SCHEMA.atmosphere.map((item) => `<button class="${(params.atmosphere || []).includes(item) ? 'active' : ''}" data-action="pro-toggle-list" data-field="atmosphere" data-value="${esc(item)}">${esc(item)}</button>`).join('')}</div>
    <button class="toolbar-button" data-action="toggle-pro-advanced">${state.pro.advancedOpen ? '收起高级参数' : '展开高级参数'}</button>
    ${state.pro.advancedOpen ? `<div class="pro-advanced-drawer">
      ${renderOptionGroup('projectStyle', '项目风格', PRO_MANUAL_SCHEMA.style)}
      ${renderOptionGroup('deviceType', '设备类型', PRO_MANUAL_SCHEMA.deviceType)}
      ${renderOptionGroup('cameraBrand', '拍摄设备', PRO_MANUAL_SCHEMA.cameraBrand)}
      ${renderOptionGroup('focalLength', '镜头焦段', PRO_MANUAL_SCHEMA.focalLength)}
      ${renderOptionGroup('aperture', '光圈', PRO_MANUAL_SCHEMA.aperture)}
      ${renderOptionGroup('environment', '环境背景', PRO_MANUAL_SCHEMA.environment)}
      ${renderOptionGroup('foreground', '人物与前景', PRO_MANUAL_SCHEMA.foreground)}
      ${renderOptionGroup('rendering', '画面表现', PRO_MANUAL_SCHEMA.rendering)}
      ${renderOptionGroup('colorGrading', '后期调色', PRO_MANUAL_SCHEMA.colorGrading)}
    </div>` : ''}
  `;
}
function renderOptionGroup(field, label, options) {
  const value = state.pro.params?.[field];
  return `<div class="pro-field"><span>${esc(label)}</span><div class="pro-chip-group">${options.map((item) => `<button class="${value === item ? 'active' : ''}" data-action="pro-option" data-field="${esc(field)}" data-value="${esc(item)}">${esc(item)}</button>`).join('')}</div></div>`;
}
function filteredTasks() {
  const q = String(state.promptQuery || '').trim().toLowerCase();
  const tasks = [...state.tasks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!q) return tasks;
  return tasks.filter((task) => {
    const hay = [task.prompt, task.returnedPrompt, task.model, task.profileName, task.status, task.sizeLabel, task.quality, task.tags, task.note, task.workflowName, task.batchLabel, task.workflowId, task.workflowRunId].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
function renderAssetCard(task) {
  const image = (task.images || [])[0];
  const streamPreview = task.streamPreviewUrl || task.streamPreviewRemoteUrl || '';
  const selected = state.selectedTaskIds.includes(task.id);
  const countInfo = taskCountInfo(task);
  const summary = cardParamSummary(task);
  const insights = cardInsightSummary(task, countInfo);
  const failed = task.status === 'error' || task.status === 'interrupted';
  const placeholder = failed
    ? `<div class="asset-placeholder asset-failed"><strong>${task.status === 'interrupted' ? '已中断' : '生成失败'}</strong><span>${esc(taskErrorSummary(task))}</span><button data-action="retry-task" data-id="${esc(task.id)}">重试</button></div>`
    : `<div class="asset-placeholder"><div class="progress-ring"></div></div>`;
  return `
    <article class="asset-card ${selected ? 'selected' : ''}" data-task-id="${esc(task.id)}">
      <button class="asset-check" title="选择" data-action="toggle-select" data-id="${esc(task.id)}"></button>
      <div class="asset-media" data-action="open-detail" data-id="${esc(task.id)}">
        ${image ? `<img data-image-kind="task-image" data-task-id="${esc(task.id)}" data-index="0" data-blob-id="${esc(image.blobId || '')}" data-remote-url="${esc(image.url || image.remoteUrl || '')}" alt="">` : streamPreview ? `<img data-image-kind="task-image" data-task-id="${esc(task.id)}" src="${esc(streamPreview)}" alt="">` : placeholder}
        ${renderReferenceBadge(task)}
        <div class="asset-badges">
          <span class="badge ${esc(task.status)}">${esc(countInfo.label)}</span>
          <span class="badge" data-elapsed-id="${esc(task.id)}">${esc(formatElapsed(task))}</span>
        </div>
      </div>
      <div class="asset-body">
        <div class="asset-prompt">${esc(task.prompt || '未填写提示词')}</div>
        <div class="asset-meta compact">
          ${summary.map((item, idx) => `<span class="meta-pill ${idx === 0 ? 'profile' : ''}">${esc(item)}</span>`).join('')}
          ${task.workflowName ? `<span class="meta-pill">${esc(task.workflowName)} · ${esc(task.batchLabel || '')}</span>` : ''}
        </div>
        <div class="asset-insights">
          ${insights.map((item) => `<span>${esc(item)}</span>`).join('')}
        </div>
        <div class="asset-actions icon-only">
          ${(state.preferences?.alwaysShowRetryButton !== false || task.status !== 'success') ? iconButtonHtml('retry-task', task.id, taskActionIcon('retry'), '重试') : ''}
          ${iconButtonHtml('favorite-task', task.id, taskActionIcon('favorite', !!state.favorites[task.id]), '收藏', state.favorites[task.id] ? 'active' : '')}
          ${iconButtonHtml('reuse-task', task.id, taskActionIcon('reuse'), '复用配置')}
          ${iconButtonHtml('edit-output', task.id, taskActionIcon('edit'), '编辑输出')}
          ${iconButtonHtml('delete-task', task.id, taskActionIcon('delete'), '删除', 'danger')}
        </div>
      </div>
    </article>
  `;
}
function taskErrorSummary(task) {
  const text = errorSummary(task.error || task.errorDetail || (task.status === 'interrupted' ? '刷新或离开页面导致任务中断。' : '上游没有返回可用结果。')).trim();
  return text.length > 56 ? `${text.slice(0, 56)}...` : text;
}

function renderGalleryComposer() {
  const profile = imageProfile();
  const currentModel = profile.model || 'gpt-image-2';
  const disabled = !imageProfiles().length;
  const refCount = state.references.length;
  const refLimit = referenceLimit();
  const iconButton = (action, icon, title, extra = '', badge = '') => `<button class="control-icon ${extra}" data-action="${action}" title="${esc(title)}" aria-label="${esc(title)}">${icon}${badge ? `<span class="control-badge">${esc(badge)}</span>` : ''}</button>`;
  return `
    <section class="composer ${state.composerExpanded ? 'expanded' : ''}" id="composer" data-drop-zone="1">
      <div class="composer-text-wrap">
        <textarea id="promptInput" placeholder="描述你要生成的图像，或向 Agent 说明任务..." data-action="composer-input">${esc(state.composerPrompt || '')}</textarea>
        <button class="expand-arc" data-action="toggle-composer" title="展开/折叠"></button>
      </div>
      ${state.references.length ? `<div class="reference-strip">${state.references.map(renderReferenceThumb).join('')}</div>` : ''}
      <div class="composer-controls">
        <div class="composer-param-zone">
          <button class="control-chip control-model" data-action="open-model-config" title="模型配置">
            <span class="chip-icon" aria-hidden="true"></span>
            <strong>${esc(currentModel)}</strong>
          </button>
          <button class="control-chip" data-action="open-resolution-modal"><small>分辨率</small>${esc(resolutionSummary())}</button>
          <button class="control-chip" data-action="open-size-modal"><small>自动比例</small>${esc(ratioSummary())}</button>
          <button class="control-chip" data-action="open-popover" data-popover="quality"><small>质量</small>${esc(state.settings.quality)}</button>
          <button class="control-chip" data-action="open-popover" data-popover="format"><small>格式</small>${esc(state.settings.output_format)}</button>
          <button class="control-chip" data-action="open-popover" data-popover="compression"><small>${state.settings.output_format === 'png' ? '透明背景' : '压缩/质量'}</small>${esc(state.settings.output_format === 'png' ? (state.settings.transparent_output ? '是' : '否') : state.settings.output_compression)}</button>
          <label class="control-chip"><small>数量</small><input type="number" min="1" max="8" value="${esc(state.settings.n)}" data-action="count-input"></label>
          <button class="control-icon control-advanced" data-action="open-entry-advanced" data-entry="gallery" title="高级配置" aria-label="高级配置">⚙</button>
        </div>
        <div class="composer-action-zone">
          ${iconButton('pick-reference', '◰', `参考图 ${refCount}/${refLimit}`, 'ref-action-icon', refCount ? `${refCount}` : '')}
          ${iconButton('open-prompt-repo', '⌘', '提示词仓库')}
          <button class="generate-button icon-generate" data-action="generate" title="生成" aria-label="生成" ${disabled ? 'disabled' : ''}>➤</button>
        </div>
      </div>
      ${disabled ? `<div class="composer-empty-tip">暂无生图模型，请到后台添加 Images API 配置。</div>` : ''}
      ${state.mobileParamsOpen ? renderMobileParamDrawer() : ''}
    </section>
  `;
}

function renderImageProfileSelect(entry, activeId) {
  const profiles = imageProfiles();
  return `<label class="profile-select-pill"><small>渲染模型</small><select data-action="entry-profile-select" data-entry="${esc(entry)}">${profiles.map((profile) => `<option value="${esc(profileId(profile))}" ${profileId(profile) === activeId ? 'selected' : ''}>${esc(profile.name || profileId(profile))}</option>`).join('')}</select></label>`;
}
function renderEntryAdvancedControls(entry) {
  const profile = entry === 'pro' ? proImageProfile() : entry === 'workflow' ? imageProfile() : imageProfile();
  const advanced = effectiveAdvanced(entry, profile);
  return `
    <div class="entry-advanced ${advanced.open ? 'open' : ''}" data-entry="${esc(entry)}">
      <button class="entry-advanced-toggle" data-action="toggle-entry-advanced" data-entry="${esc(entry)}">高级 · b64 ${advanced.responseFormatB64Json ? '开' : '关'} · 流式 ${advanced.streamImages && streamSupported(profile) ? '开' : '关'} · ${esc(advanced.timeout)}s</button>
      ${advanced.open ? renderEntryAdvancedFields(entry, profile) : ''}
    </div>
  `;
}
function renderEntryAdvancedFields(entry, profile) {
  const overrides = entryAdvanced(entry);
  const defaults = profileDefaultAdvanced(profile);
  return `<div class="entry-advanced-grid">
    <label><span>返回 b64_json</span><select data-action="entry-advanced-input" data-entry="${esc(entry)}" data-field="responseFormatB64Json">
      ${renderAdvancedBoolOptions(overrides.responseFormatB64Json, defaults.responseFormatB64Json)}
    </select></label>
    <label><span>流式输出</span><select data-action="entry-advanced-input" data-entry="${esc(entry)}" data-field="streamImages">
      ${renderAdvancedBoolOptions(overrides.streamImages, defaults.streamImages)}
    </select></label>
    <label><span>中间步骤图片数</span><input type="number" min="0" max="3" value="${esc(overrides.streamPartialImages ?? defaults.streamPartialImages)}" data-action="entry-advanced-input" data-entry="${esc(entry)}" data-field="streamPartialImages"></label>
    <label><span>超时（秒）</span><input type="number" min="1" max="6000" value="${esc(overrides.timeout ?? defaults.timeout)}" data-action="entry-advanced-input" data-entry="${esc(entry)}" data-field="timeout"></label>
  </div>`;
}
function renderEntryAdvancedModal(entry) {
  const profile = entry === 'pro' ? proImageProfile() : entry === 'agent' ? agentImageProfile() : imageProfile();
  const advanced = effectiveAdvanced(entry, profile);
  const title = entry === 'gallery' ? '画廊高级配置' : entry === 'workflow' ? '工作流高级配置' : entry === 'agent' ? 'Agent 生图高级配置' : '专业工作台高级配置';
  const modelName = profile.name || profile.model || profileId(profile) || '未选择模型';
  return `
    <div class="modal-layer" data-action="close-entry-advanced">
      <div class="entry-advanced-modal" role="dialog" aria-modal="true" data-stop>
        <button class="modal-close" data-action="close-entry-advanced">×</button>
        <div class="entry-advanced-head">
          <div>
            <h2>${esc(title)}</h2>
            <p>这些选项会覆盖当前入口的模型默认值，只影响后续提交。</p>
          </div>
          <div class="entry-advanced-summary">
            <span>${esc(modelName)}</span>
            <strong>b64 ${advanced.responseFormatB64Json ? '开' : '关'} · 流式 ${advanced.streamImages && streamSupported(profile) ? '开' : '关'} · ${esc(advanced.timeout)}s</strong>
          </div>
        </div>
        ${renderEntryAdvancedFields(entry, profile)}
      </div>
    </div>
  `;
}
function renderAdvancedBoolOptions(value, defaultValue) {
  const current = value === null || value === undefined ? 'default' : value ? 'true' : 'false';
  return [
    `<option value="default" ${current === 'default' ? 'selected' : ''}>跟随模型默认（${defaultValue ? '开' : '关'}）</option>`,
    `<option value="true" ${current === 'true' ? 'selected' : ''}>开</option>`,
    `<option value="false" ${current === 'false' ? 'selected' : ''}>关</option>`
  ].join('');
}
function renderMobileParamDrawer() {
  return `
    <div class="mobile-params-drawer">
      <button class="control-chip control-model" data-action="open-model-config" title="模型配置">
        <span class="chip-icon" aria-hidden="true"></span>
        <strong>${esc(activeProfile().model || 'gpt-image-2')}</strong>
      </button>
      <button class="control-chip" data-action="open-resolution-modal"><small>分辨率</small>${esc(resolutionSummary())}</button>
      <button class="control-chip" data-action="open-size-modal"><small>自动比例</small>${esc(ratioSummary())}</button>
      <button class="control-chip" data-action="open-popover" data-popover="quality"><small>质量</small>${esc(state.settings.quality)}</button>
      <button class="control-chip" data-action="open-popover" data-popover="format"><small>格式</small>${esc(state.settings.output_format)}</button>
      <button class="control-chip" data-action="open-popover" data-popover="compression"><small>${state.settings.output_format === 'png' ? '透明背景' : '压缩/质量'}</small>${esc(state.settings.output_format === 'png' ? (state.settings.transparent_output ? '是' : '否') : state.settings.output_compression)}</button>
      <label class="control-chip"><small>数量</small><input type="number" min="1" max="8" value="${esc(state.settings.n)}" data-action="count-input"></label>
      <button class="control-icon control-advanced" data-action="open-entry-advanced" data-entry="gallery" title="高级配置" aria-label="高级配置">⚙</button>
      <button class="control-chip" data-action="pick-reference"><small>参考图</small>${state.references.length}/${referenceLimit()}</button>
      <button class="control-chip" data-action="open-prompt-repo"><small>提示词仓库</small>打开</button>
      <button class="toolbar-button" data-action="toggle-mobile-params">收起</button>
    </div>
  `;
}
function renderReferenceThumb(ref) {
  return `
    <div class="ref-thumb" title="${esc(ref.name || '参考图')}">
      <img data-ref-id="${esc(ref.id)}" alt="" data-action="open-mask-editor" data-ref-id-open="${esc(ref.id)}">
      <button data-action="remove-ref" data-id="${esc(ref.id)}">×</button>
    </div>
  `;
}

function renderAgentStage() {
  const project = state.agent.projects.find((p) => p.id === state.agent.activeProjectId) || state.agent.projects[0];
  ensureAgentProjectThread(project?.id);
  const threadId = activeAgentThreadId(project?.id);
  const threads = projectThreads(project?.id);
  const activeThread = threads.find((thread) => thread.id === threadId) || threads[0];
  const messages = agentMessages(project?.id);
  const textProfile = agentTextProfile();
  const configuredTextProfile = configuredAgentTextProfile();
  const invalidTextReason = textProfile ? '' : agentTextProfileInvalidReason(configuredTextProfile);
  return `
    <section class="agent-stage">
      <div class="agent-head">
        <div class="agent-head-copy">
          <div class="agent-project-title-row">
            <div class="agent-title">${esc(project?.name || '默认项目')}</div>
            <button class="agent-top-icon-button" data-action="open-agent-project-menu" title="项目菜单" aria-label="项目菜单"><span class="agent-menu-bars" aria-hidden="true"></span></button>
          </div>
          <button class="agent-project-prompt-line" data-action="agent-project-edit-prompt" title="${esc(project?.prompt || '编辑项目提示词')}">${esc(project?.prompt || '未设置项目提示词，点击编辑')}</button>
          ${invalidTextReason ? `<div class="agent-config-note">${esc(invalidTextReason)}</div>` : ''}
        </div>
        <div class="agent-head-actions">
          <button class="agent-thread-menu-trigger" data-action="open-agent-thread-menu" title="选择对话" aria-label="选择对话">
            <span>${esc(activeThread?.title || '主对话')}</span>
            <i aria-hidden="true">⌄</i>
          </button>
          <button class="agent-clear-icon-button" data-action="clear-agent-thread" title="清空当前对话" aria-label="清空当前对话">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1 2h4M5 6h14M8 10v8M12 10v8M16 10v8M7 6l1 14h8l1-14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
      <div class="agent-log workflow-stage-scroll">
        ${messages.length ? `<div class="agent-conversation">${messages.map(renderAgentMessage).join('')}</div>` : ''}
        ${!messages.length ? `<div class="empty-state"><div><strong>Agent 项目对话</strong><span>这里现在只保留项目对话。批量生图和工作流请从左侧“工作流”分页进入。</span></div></div>` : ''}
      </div>
    </section>
  `;
}
function workflowCategories(workflows) {
  return ['全部分类', ...Array.from(new Set(workflows.map((w) => w.category || '未分类')))];
}
function filteredWorkflows(projectId = state.agent.activeProjectId) {
  const workflows = currentProjectWorkflows(projectId);
  const q = String(state.agent.workflowQuery || '').trim().toLowerCase();
  const category = state.agent.workflowCategory || '全部分类';
  return workflows.filter((workflow) => {
    const matchCategory = category === '全部分类' || (workflow.category || '未分类') === category;
    const hay = [workflow.name, workflow.category, workflow.description, workflow.mode, workflow.config?.promptTemplate, workflow.templateBindings?.imagePrompt].join(' ').toLowerCase();
    return matchCategory && (!q || hay.includes(q));
  });
}
function renderWorkflowWorkspace(project, runs) {
  const workflows = currentProjectWorkflows(project?.id);
  const visible = filteredWorkflows(project?.id);
  const categories = workflowCategories(workflows);
  return `
    <section class="agent-stage workflow-workspace">
      <div class="workflow-workspace-head">
        <div>
          <div class="detail-section-label">Agent Workflow</div>
          <div class="agent-title">创作工作流</div>
          <div class="project-meta">像调用 skill 一样复用批量生图流程。运行前会确认变量、预算、并发和参考图。</div>
        </div>
        <div class="workflow-head-actions">
          <button class="workflow-project-menu-trigger" data-action="open-agent-project-menu" title="项目菜单" aria-label="项目菜单">
            <span>${esc(project?.name || '默认项目')}</span><i aria-hidden="true">⌄</i>
          </button>
          <button class="toolbar-button" data-action="agent-workflow">AI 创建</button>
          <button class="toolbar-button" data-action="new-series-workflow">新建多图</button>
          <button class="generate-button compact" data-action="new-workflow-draft">新建工作流</button>
        </div>
      </div>
      ${renderEntryAdvancedControls('workflow')}
      <div class="workflow-filters">
        <select class="workflow-filter-select" data-action="workflow-category-input">
          ${categories.map((cat) => `<option value="${esc(cat)}" ${cat === (state.agent.workflowCategory || '全部分类') ? 'selected' : ''}>${esc(cat)}</option>`).join('')}
        </select>
        <label class="search-box workflow-search">搜索
          <input value="${esc(state.agent.workflowQuery || '')}" placeholder="搜索名称、分类、描述、模板..." data-action="workflow-search-input">
        </label>
      </div>
      <div class="workflow-manager-scroll">
        ${visible.length ? `<div class="workflow-card-grid">${visible.map(renderWorkflowCard).join('')}</div>` : `<div class="empty-state"><div><strong>还没有工作流</strong><span>可以 AI 创建，也可以手动新建单图或多图系列工作流。</span></div></div>`}
        ${runs.length ? `<div class="workflow-run-list">${runs.map(renderWorkflowRun).join('')}</div>` : ''}
      </div>
    </section>
  `;
}
function renderWorkflowCard(workflow) {
  const variableCount = workflow.variables?.columns?.length || workflow.variables?.length || 0;
  const template = workflow.config?.promptTemplate || workflow.templateBindings?.imagePrompt || workflowPromptTemplate(workflow);
  const mode = workflow.mode === 'multi_image_series' ? '多图' : '单图';
  return `
    <article class="workflow-card">
      <div class="workflow-card-strip"></div>
      <div class="workflow-card-head">
        <div>
          <strong>${esc(workflow.name || '未命名工作流')}</strong>
          <div class="workflow-tags">
            <span>${esc(workflow.category || '未分类')}</span>
            <span>${esc(mode)}</span>
            <span>${esc(variableCount)} 个变量</span>
            <span>${esc(workflow.scope === 'public' ? '公开' : '个人')}</span>
          </div>
        </div>
        <button class="generate-button compact" data-action="invoke-workflow" data-id="${esc(workflow.id)}">运行</button>
      </div>
      <p>${esc(workflow.description || '暂无描述')}</p>
      <div class="workflow-template-preview">${esc(template || '未设置提示词模板')}</div>
      <div class="workflow-card-foot">
        <span>${workflow.lastRunAt ? `最近运行 ${esc(formatTime(workflow.lastRunAt))}` : `创建于 ${esc(formatTime(workflow.createdAt))}`}</span>
        <div>
          <button data-action="edit-workflow" data-id="${esc(workflow.id)}">编辑</button>
          <button data-action="duplicate-workflow" data-id="${esc(workflow.id)}">复制</button>
          <button class="danger" data-action="delete-workflow" data-id="${esc(workflow.id)}">删除</button>
        </div>
      </div>
    </article>
  `;
}
function agentImageResolutionValue(profile = agentImageProfile(), settings = agentImageSettings()) {
  const source = settingsForSummary(settings);
  const key = providerKey(profile);
  if (key === 'google') return source.googleBaseResolution;
  if (key === 'xai') return source.xaiResolution;
  return source.openaiSize;
}
function agentImageAspectValue(profile = agentImageProfile(), settings = agentImageSettings()) {
  const source = settingsForSummary(settings);
  const key = providerKey(profile);
  if (key === 'google') return source.googleAspectRatio;
  if (key === 'xai') return source.xaiAspectRatio;
  return source.openaiAspectRatio;
}
function agentImageResolutionOptions(profile = agentImageProfile()) {
  const key = providerKey(profile);
  if (key === 'google') return PROVIDER.google.baseResolutions;
  if (key === 'xai') return PROVIDER.xai.resolutions;
  return ['1K', '2K', '4K'];
}
function agentImageAspectOptions(profile = agentImageProfile()) {
  const key = providerKey(profile);
  if (key === 'google') return googleVersion(profile) === '3.1' ? PROVIDER.google.ratios31 : PROVIDER.google.ratios25;
  if (key === 'xai') return PROVIDER.xai.ratios;
  return ['auto', '1:1', '5:4', '9:16', '16:9', '4:3', '3:2', '4:5', '3:4', '2:3', '21:9'];
}
function renderAgentImageParamButton(field, label, value) {
  return `<button class="control-chip agent-image-param-chip" data-action="set-agent-image-param" data-field="${esc(field)}"><small>${esc(label)}</small>${esc(value)}</button>`;
}
function renderAgentImageParamControls() {
  const settings = agentImageSettings();
  const profile = agentImageProfile();
  const format = settings.output_format || 'png';
  const transparent = settings.transparent_output ? '是' : '否';
  return `
    <button class="control-chip control-model" data-action="open-agent-model-config" title="Agent 生图模型">
      <span class="chip-icon" aria-hidden="true"></span>
      <strong>${esc(profile.name || profile.id || profile.model || '模型')}</strong>
    </button>
    <button class="control-chip" data-action="open-agent-resolution-modal"><small>分辨率</small>${esc(agentImageResolutionValue(profile, settings))}</button>
    <button class="control-chip" data-action="open-agent-size-modal"><small>比例</small>${esc(agentImageAspectValue(profile, settings))}</button>
    <button class="control-chip" data-action="open-agent-popover" data-popover="agent-quality"><small>质量</small>${esc(settings.quality || 'high')}</button>
    <button class="control-chip" data-action="open-agent-popover" data-popover="agent-format"><small>格式</small>${esc(format)}</button>
    <button class="control-chip" data-action="open-agent-popover" data-popover="agent-compression"><small>${format === 'png' ? '透明' : '压缩/质量'}</small>${esc(format === 'png' ? transparent : settings.output_compression)}</button>
    <button class="control-chip" data-action="set-agent-image-param" data-field="n"><small>数量</small>${esc(Number(settings.n) || 1)}</button>
    <button class="control-icon control-advanced" data-action="open-agent-image-advanced" title="Agent 生图高级配置" aria-label="Agent 生图高级配置">⚙</button>
  `;
}
function renderAgentComposer() {
  const textProfile = agentTextProfile();
  const webDisabled = !state.agentConfig?.webSearchEnabled || !agentWebSearchSupported(textProfile);
  const webLabel = !state.agentConfig?.webSearchEnabled ? '后台关闭' : webDisabled ? '不支持' : state.agent.webMode === 'off' ? '关闭' : '开启';
  const pending = activeAgentHasPending();
  const attachments = Array.isArray(state.agent.attachments) ? state.agent.attachments : [];
  return `
    <section class="composer agent-composer ${state.agent.attachmentDragActive ? 'is-dragging' : ''}" id="agentComposer">
      <div class="composer-text-wrap">
        <textarea id="agentInput" placeholder="和当前项目 Agent 对话；批量生图请进入左侧工作流分页..." data-action="agent-input">${esc(state.agent.inputDraft || '')}</textarea>
        <div class="agent-drop-hint">松开即可上传到 Agent 对话</div>
      </div>
      ${attachments.length ? renderAgentAttachmentTray(attachments, true) : ''}
      <div class="composer-controls agent-composer-controls agent-unified-toolbar">
        <div class="composer-param-zone agent-param-zone" aria-label="Agent 对话与生图参数">
          <span class="control-chip agent-text-model-chip"><small>文本模型</small>${esc(textProfile?.name || textProfile?.model || '未配置')}</span>
          <button class="control-chip ${!webDisabled && state.agent.webMode !== 'off' ? 'active-chip' : ''}" data-action="agent-web" ${webDisabled ? 'disabled aria-disabled="true"' : ''}><small>联网</small>${esc(webLabel)}</button>
          <button class="control-chip active-chip" data-action="agent-reason"><small>推理</small>${esc(state.agent.reasoning || 'medium')}</button>
          ${renderAgentImageParamControls()}
        </div>
        <div class="composer-action-zone agent-action-zone" aria-label="Agent 发送控制">
          <button class="toolbar-button agent-attach-button" data-action="agent-pick-attachment" title="上传附件" aria-label="上传附件">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 12.5l5.7-5.7a3.2 3.2 0 114.5 4.5l-7.1 7.1a5 5 0 01-7.1-7.1l7.4-7.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 9.5l-7.1 7.1a1.8 1.8 0 01-2.5-2.5l6.5-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="generate-button" data-action="agent-chat" ${pending ? 'disabled aria-disabled="true"' : ''}>${pending ? '正在思考' : '发送'}</button>
        </div>
      </div>
    </section>
  `;
}
function renderAgentAttachmentTray(attachments, removable = false) {
  const items = (attachments || []).filter(Boolean);
  if (!items.length) return '';
  return `<div class="agent-attachment-tray">
    ${items.map((item) => item.kind === 'image' || item.type?.startsWith('image/')
      ? `<div class="agent-image-attachment-thumb" title="${esc(item.name || '图片附件')}">
          <img data-agent-attachment-id="${esc(item.id)}" alt="${esc(item.name || '图片附件')}">
          <span>${esc(item.name || '图片')}</span>
          ${removable ? `<button type="button" data-action="agent-remove-attachment" data-id="${esc(item.id)}" aria-label="移除附件">×</button>` : ''}
        </div>`
      : `<div class="agent-attachment-chip" title="${esc(item.name || '附件')}">
          <span class="agent-attachment-icon">文</span>
          <span class="agent-attachment-name">${esc(item.name || '附件')}</span>
          <small>${esc(formatFileSize(item.size || 0))}</small>
          ${removable ? `<button type="button" data-action="agent-remove-attachment" data-id="${esc(item.id)}" aria-label="移除附件">×</button>` : ''}
        </div>`).join('')}
  </div>`;
}
function formatFileSize(size) {
  const bytes = Number(size) || 0;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${bytes}B`;
}
function isTextAgentAttachment(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  return type.startsWith('text/') || /\.(txt|md|json|csv|tsv|html|css|js|mjs|cjs|xml|ya?ml)$/i.test(name);
}
function isSupportedAgentAttachment(file) {
  const type = String(file?.type || '').toLowerCase();
  return type.startsWith('image/') || isTextAgentAttachment(file);
}
async function addAgentAttachments(files = []) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return;
  state.agent.attachments = Array.isArray(state.agent.attachments) ? state.agent.attachments : [];
  const room = Math.max(0, 8 - state.agent.attachments.length);
  if (!room) return toast('Agent 单次最多上传 8 个附件');
  let added = 0;
  let skippedUnsupported = 0;
  for (const file of list.slice(0, room)) {
    if (!isSupportedAgentAttachment(file)) {
      skippedUnsupported += 1;
      continue;
    }
    if (file.size > 24 * 1024 * 1024) {
      toast(`${file.name || '附件'} 超过 24MB，已跳过`);
      continue;
    }
    const type = file.type || (isTextAgentAttachment(file) ? 'text/plain' : 'application/octet-stream');
    const blobId = await putBlob(file);
    const attachment = {
      id: uid('agent-att'),
      blobId,
      name: file.name || 'attachment',
      type,
      size: file.size || 0,
      kind: type.startsWith('image/') ? 'image' : isTextAgentAttachment(file) ? 'text' : 'file',
      createdAt: Date.now()
    };
    if (type.startsWith('image/')) {
      const size = await imageSizeFromBlob(file).catch(() => ({}));
      attachment.width = size.width;
      attachment.height = size.height;
    }
    state.agent.attachments.push(attachment);
    added += 1;
  }
  if (list.length > room) toast(`已添加前 ${room} 个附件，超出部分未加入`);
  if (skippedUnsupported) toast('已跳过暂不支持的附件类型；Agent 当前支持图片和文本文件');
  if (added) persistRender();
}
async function removeAgentAttachment(id) {
  const attachments = Array.isArray(state.agent.attachments) ? state.agent.attachments : [];
  const item = attachments.find((attachment) => attachment.id === id);
  state.agent.attachments = attachments.filter((attachment) => attachment.id !== id);
  if (item?.blobId) await deleteBlob(item.blobId).catch(() => {});
  persistRender();
}
function agentAttachmentSummary(attachments = []) {
  return attachments.map((item, index) => {
    const dims = item.width && item.height ? `, ${item.width}x${item.height}` : '';
    return `${index + 1}. ${item.name || '附件'} (${item.type || 'unknown'}, ${formatFileSize(item.size || 0)}${dims})`;
  }).join('\n');
}
async function agentAttachmentParts(attachments = []) {
  const parts = [];
  const textNotes = [];
  for (const item of attachments || []) {
    const blob = await getBlob(item.blobId).catch(() => null);
    if (!blob) {
      textNotes.push(`[附件读取失败] ${item.name || item.id}`);
      continue;
    }
    if (String(item.type || blob.type || '').startsWith('image/')) {
      const dataUrl = await blobToDataUrl(blob);
      parts.push({ type: 'input_image', image_url: dataUrl });
      continue;
    }
    if (item.kind === 'text' || isTextAgentAttachment(item)) {
      const text = await blob.text().catch(() => '');
      textNotes.push(`--- 附件：${item.name || 'text'} ---\n${text.slice(0, 12000)}${text.length > 12000 ? '\n[已截断]' : ''}`);
    } else {
      textNotes.push(`[非文本附件] ${item.name || '附件'} (${item.type || blob.type || 'unknown'}, ${formatFileSize(item.size || blob.size || 0)})`);
    }
  }
  return { imageParts: parts, textNote: textNotes.join('\n\n') };
}
function agentMessages(projectId = state.agent.activeProjectId) {
  const thread = ensureAgentProjectThread(projectId);
  if (!thread) return [];
  const messages = state.agent.messagesByThread?.[thread.id];
  return Array.isArray(messages) ? messages : [];
}
function activeAgentHasPending(projectId = state.agent.activeProjectId) {
  return agentMessages(projectId).some((message) => message.pending);
}
function agentRequestTimeoutSeconds(profile = agentTextProfile()) {
  return Math.max(1, Number(profile?.timeout) || AGENT_DEFAULT_TIMEOUT_SECONDS);
}
function agentFailureDetail({ normalized, textProfile, startedAt, timeoutSeconds, upstreamStatus, code } = {}) {
  const requestMs = startedAt ? Math.max(0, Date.now() - Number(startedAt)) : 0;
  const rows = [
    `文本模型配置：${profileId(textProfile) || '未选择'}`,
    `模型 slug：${textProfile?.model || '未知'}`,
    `供应商：${textProfile?.provider || '未知'}`,
    `请求耗时：${requestMs ? formatElapsed({ elapsedMs: requestMs }) : '未知'}`,
    `超时设置：${Number(timeoutSeconds) || AGENT_DEFAULT_TIMEOUT_SECONDS} 秒`
  ];
  if (upstreamStatus) rows.push(`上游状态：${upstreamStatus}`);
  if (code) rows.push(`错误代码：${code}`);
  if (normalized?.summary) rows.push(`摘要：${normalized.summary}`);
  if (normalized?.detail && normalized.detail !== normalized.summary) rows.push(`详情：${normalized.detail}`);
  return rows.join('\n');
}
function branchAgentThreadFromMessage(agentStateOrProjectId, projectIdOrMessageId, maybeMessageId) {
  const agentState = typeof agentStateOrProjectId === 'string' ? state.agent : agentStateOrProjectId;
  const projectId = typeof agentStateOrProjectId === 'string' ? agentStateOrProjectId : projectIdOrMessageId;
  const messageId = typeof agentStateOrProjectId === 'string' ? projectIdOrMessageId : maybeMessageId;
  const nextAgent = migrateAgentThreads(JSON.parse(JSON.stringify(agentState || {})));
  const threads = Array.isArray(nextAgent.threadsByProject?.[projectId]) ? nextAgent.threadsByProject[projectId] : [];
  const sourceThreadId = nextAgent.activeThreadIdByProject?.[projectId] || threads[0]?.id;
  const sourceMessages = Array.isArray(nextAgent.messagesByThread?.[sourceThreadId]) ? nextAgent.messagesByThread[sourceThreadId] : [];
  const pivotIndex = sourceMessages.findIndex((message) => message.id === messageId);
  if (pivotIndex < 0) return nextAgent;
  const pivot = sourceMessages[pivotIndex];
  const branch = makeAgentThread(projectId, {
    title: agentBranchTitle(pivot),
    sourceThreadId,
    sourceMessageId: messageId
  });
  nextAgent.threadsByProject[projectId] = [...threads, branch];
  nextAgent.messagesByThread[branch.id] = sourceMessages.slice(0, pivotIndex + 1).map((message) => normalizeAgentMessage({ ...message }, branch.id, projectId));
  nextAgent.activeThreadIdByProject[projectId] = branch.id;
  return nextAgent;
}
function branchActiveThreadFromMessage(messageId) {
  if (!messageId) return;
  state.agent = branchAgentThreadFromMessage(state.agent, state.agent.activeProjectId, messageId);
}
function newAgentThreadTitle(now = new Date()) {
  return `新对话 ${now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
function createAgentThread(agentStateOrProjectId = state.agent, projectIdOrTitle = '', maybeTitle = '') {
  const useGlobal = typeof agentStateOrProjectId === 'string';
  const agentState = useGlobal ? state.agent : agentStateOrProjectId;
  const projectId = useGlobal ? agentStateOrProjectId : projectIdOrTitle;
  const title = useGlobal ? projectIdOrTitle : maybeTitle;
  const nextAgent = migrateAgentThreads(JSON.parse(JSON.stringify(agentState || {})));
  const project = (nextAgent.projects || []).find((item) => item.id === projectId) || (nextAgent.projects || [])[0];
  if (!project) return nextAgent;
  const threads = Array.isArray(nextAgent.threadsByProject?.[project.id]) ? nextAgent.threadsByProject[project.id] : [];
  const thread = makeAgentThread(project.id, { title: String(title || '').trim() || newAgentThreadTitle() });
  nextAgent.threadsByProject[project.id] = [...threads, thread];
  nextAgent.messagesByThread[thread.id] = [];
  nextAgent.activeThreadIdByProject[project.id] = thread.id;
  if (useGlobal) state.agent = nextAgent;
  return nextAgent;
}
function deleteAgentThread(agentStateOrProjectId = state.agent, projectIdOrThreadId = '', maybeThreadId = '') {
  const useGlobal = typeof agentStateOrProjectId === 'string';
  const agentState = useGlobal ? state.agent : agentStateOrProjectId;
  const projectId = useGlobal ? agentStateOrProjectId : projectIdOrThreadId;
  const threadId = useGlobal ? projectIdOrThreadId : maybeThreadId;
  const nextAgent = migrateAgentThreads(JSON.parse(JSON.stringify(agentState || {})));
  const project = (nextAgent.projects || []).find((item) => item.id === projectId) || (nextAgent.projects || [])[0];
  if (!project || !threadId) return nextAgent;
  const threads = Array.isArray(nextAgent.threadsByProject?.[project.id]) ? nextAgent.threadsByProject[project.id] : [];
  let remaining = threads.filter((thread) => thread.id !== threadId);
  delete nextAgent.messagesByThread[threadId];
  if (!remaining.length) {
    const replacement = makeAgentThread(project.id, { title: newAgentThreadTitle() });
    remaining = [replacement];
    nextAgent.messagesByThread[replacement.id] = [];
  }
  nextAgent.threadsByProject[project.id] = remaining;
  if (!remaining.some((thread) => thread.id === nextAgent.activeThreadIdByProject?.[project.id])) {
    nextAgent.activeThreadIdByProject[project.id] = remaining[0].id;
  }
  if (useGlobal) state.agent = nextAgent;
  return nextAgent;
}
function confirmDeleteAgentThread(threadId) {
  const thread = projectThreads(state.agent.activeProjectId).find((item) => item.id === threadId);
  openConfirmDialog({
    kind: 'delete-agent-thread',
    payload: { projectId: state.agent.activeProjectId, threadId },
    kicker: '删除会话',
    title: `删除「${thread?.title || '当前会话'}」？`,
    message: '只会删除这个 Agent 会话分支，不影响同项目下其它会话。',
    confirmText: '删除会话',
    riskText: '如果这是最后一个会话，系统会自动创建一个新的空会话。'
  });
}
function clearAgentThreadMessages(agentState, threadId) {
  const nextAgent = migrateAgentThreads(JSON.parse(JSON.stringify(agentState || {})));
  nextAgent.messagesByThread[threadId] = [];
  for (const projectThreads of Object.values(nextAgent.threadsByProject || {})) {
    const thread = (projectThreads || []).find((item) => item.id === threadId);
    if (thread) thread.updatedAt = Date.now();
  }
  return nextAgent;
}
async function clearActiveAgentThread() {
  const thread = activeAgentThread();
  if (!thread) return;
  openConfirmDialog({
    kind: 'clear-agent-thread',
    title: `清空「${thread.title || '当前对话'}」？`,
    message: '只会清空当前会话分支，其它分支仍然保留。',
    confirmText: '清空对话',
    riskText: '当前分支消息会从本地记录中移除，但不会影响同项目下的其它分支。'
  });
}
function renderMarkdownInline(text) {
  const source = String(text || '');
  return source.split(/(`[^`\n]*`)/g).map((part) => {
    if (part.startsWith('`') && part.endsWith('`')) return `<code>${esc(part.slice(1, -1))}</code>`;
    return esc(part)
      .replace(/\*\*([^*\n][\s\S]*?[^*\n])\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n][\s\S]*?[^_\n])__/g, '<strong>$1</strong>');
  }).join('');
}
function isMarkdownTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line || ''));
}
function markdownTableCells(line) {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}
function renderMarkdownTable(lines, start) {
  const header = markdownTableCells(lines[start]);
  const rows = [];
  let index = start + 2;
  while (index < lines.length && /\|/.test(lines[index]) && String(lines[index]).trim()) {
    rows.push(markdownTableCells(lines[index]));
    index += 1;
  }
  const head = `<thead><tr>${header.map((cell) => `<th>${renderMarkdownInline(cell)}</th>`).join('')}</tr></thead>`;
  const body = rows.length ? `<tbody>${rows.map((row) => `<tr>${header.map((_, idx) => `<td>${renderMarkdownInline(row[idx] || '')}</td>`).join('')}</tr>`).join('')}</tbody>` : '';
  return { html: `<table>${head}${body}</table>`, next: index };
}
function renderSafeMarkdown(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let index = 0;
  const flushParagraph = (items) => {
    const value = items.join(' ').trim();
    if (value) html.push(`<p>${renderMarkdownInline(value)}</p>`);
  };
  while (index < lines.length) {
    const line = lines[index];
    if (!String(line).trim()) { index += 1; continue; }
    const fence = line.match(/^\s*```([a-z0-9_-]+)?\s*$/i);
    if (fence) {
      const lang = fence[1] || '';
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const codeText = code.join('\n');
      html.push(`<div class="agent-code-block"><div class="agent-code-head"><span>${esc(lang || 'code')}</span><button type="button" data-action="copy-agent-code" data-copy-text="${esc(codeText)}">复制</button></div><pre><code>${esc(codeText)}</code></pre></div>`);
      continue;
    }
    if (/\|/.test(line) && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1])) {
      const table = renderMarkdownTable(lines, index);
      html.push(table.html);
      index = table.next;
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = Math.min(4, Math.max(2, heading[1].length + 1));
      html.push(`<h${level}>${renderMarkdownInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      html.push('<hr>');
      index += 1;
      continue;
    }
    const quote = line.match(/^\s{0,3}>\s?(.*)$/);
    if (quote) {
      const parts = [];
      while (index < lines.length) {
        const current = lines[index].match(/^\s{0,3}>\s?(.*)$/);
        if (!current) break;
        parts.push(current[1]);
        index += 1;
      }
      html.push(`<blockquote>${renderSafeMarkdown(parts.join('\n'))}</blockquote>`);
      continue;
    }
    const unordered = line.match(/^\s{0,3}[-*+]\s+(.+)$/);
    if (unordered) {
      const items = [];
      while (index < lines.length) {
        const current = lines[index].match(/^\s{0,3}[-*+]\s+(.+)$/);
        if (!current) break;
        items.push(`<li>${renderMarkdownInline(current[1])}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    const ordered = line.match(/^\s{0,3}\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items = [];
      while (index < lines.length) {
        const current = lines[index].match(/^\s{0,3}\d+[.)]\s+(.+)$/);
        if (!current) break;
        items.push(`<li>${renderMarkdownInline(current[1])}</li>`);
        index += 1;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    const paragraph = [];
    while (index < lines.length && String(lines[index]).trim()) {
      if (/^\s*```/.test(lines[index]) || /^\s{0,3}(#{1,6})\s+/.test(lines[index]) || /^\s{0,3}(?:[-*+]|\d+[.)])\s+/.test(lines[index]) || /^\s{0,3}>\s?/.test(lines[index])) break;
      if (/\|/.test(lines[index]) && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1])) break;
      paragraph.push(lines[index]);
      index += 1;
    }
    flushParagraph(paragraph);
  }
  return html.join('');
}
function normalizeAgentOptionTitle(title) {
  return stripPromptMarkdown(title)
    .replace(/[（(]\s*推荐\s*[）)]/g, '')
    .replace(/^\s*[：:、.\-—\s]+/, '')
    .trim();
}
function agentOptionLabelType(line) {
  const normalized = stripPromptMarkdown(line)
    .replace(/^\s*(?:[-*+]\s*)?/, '')
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s*/, '')
    .trim();
  const match = normalized.match(/^(适合模型|推荐理由|正向\s*Prompt|正向提示词|中文提示词|出图提示词|图像提示词|Prompt|负面\s*Prompt|负面提示词|反向提示词|Negative\s*Prompt|Negative)\s*[:：]?\s*(.*)$/i);
  if (!match) return null;
  const raw = match[1].toLowerCase();
  const type = /负面|反向|negative/i.test(raw) ? 'negativePrompt'
    : /适合模型/.test(match[1]) ? 'modelHint'
      : /推荐理由/.test(match[1]) ? 'reason'
        : 'prompt';
  return { type, rest: match[2] || '' };
}
function cleanAgentOptionField(type, value) {
  const text = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (type === 'prompt') {
    return stripPromptMarkdown(text)
      .replace(/^(?:正向\s*Prompt|正向提示词|中文提示词|出图提示词|图像提示词|Prompt)\s*[:：]?\s*/i, '')
      .replace(/\s+/g, ' ')
      .replace(/^[：:，,。.["'“”\s]+|[：:，,。.["'“”\s]+$/g, '')
      .trim();
  }
  if (type === 'negativePrompt') return cleanNegativeAgentPrompt(text);
  return stripPromptMarkdown(text).replace(/\s+/g, ' ').trim();
}
function parseAgentOptionSection(section) {
  const fields = { modelHint: '', reason: '', prompt: '', negativePrompt: '' };
  const lines = String(section || '').replace(/\r\n?/g, '\n').split('\n');
  let current = '';
  for (const line of lines) {
    if (/^\s*(?:#{1,6}\s*)?方案\s*[1-5]\b/i.test(line)) break;
    const label = agentOptionLabelType(line);
    if (label) {
      current = label.type;
      fields[current] = [fields[current], label.rest].filter(Boolean).join('\n');
      continue;
    }
    if (current) fields[current] = [fields[current], line].filter(Boolean).join('\n');
  }
  return {
    modelHint: cleanAgentOptionField('modelHint', fields.modelHint),
    reason: cleanAgentOptionField('reason', fields.reason),
    prompt: cleanAgentOptionField('prompt', fields.prompt),
    negativePrompt: cleanAgentOptionField('negativePrompt', fields.negativePrompt)
  };
}
function extractAgentPromptOptions(text) {
  const source = String(text || '').replace(/\r\n?/g, '\n');
  const pattern = /(?:^|\n)\s*(?:#{1,6}\s*)?方案\s*([1-5])\s*[：:、.\-—]?\s*([^\n]*)/gi;
  const matches = [];
  let match;
  while ((match = pattern.exec(source))) {
    matches.push({
      index: Number(match[1]),
      title: match[2] || '',
      recommended: /推荐|最终|首选/i.test(match[2] || ''),
      start: pattern.lastIndex,
      headingStart: match.index
    });
  }
  return matches.map((item, idx) => {
    const end = idx + 1 < matches.length ? matches[idx + 1].headingStart : source.length;
    const fields = parseAgentOptionSection(source.slice(item.start, end));
    return {
      index: item.index,
      title: normalizeAgentOptionTitle(item.title) || `方案 ${item.index}`,
      recommended: item.recommended,
      modelHint: fields.modelHint,
      reason: fields.reason,
      prompt: fields.prompt,
      negativePrompt: fields.negativePrompt
    };
  }).filter((item, idx, arr) => item.index >= 1 && item.index <= 5 && item.prompt && arr.findIndex((other) => other.index === item.index) === idx)
    .sort((a, b) => a.index - b.index)
    .slice(0, 5);
}
function recommendedAgentPromptOption(options = []) {
  const list = Array.isArray(options) ? options : [];
  return list.find((item) => item.recommended) || list[0] || null;
}
function parseAgentOptionSelection(input) {
  const value = String(input || '').trim();
  const chinese = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };
  const direct = value.match(/^\/\s*([1-5])$/) || value.match(/^([1-5])$/);
  if (direct) return Number(direct[1]);
  const ordinal = value.match(/(?:用|选|选择|生成)?\s*(?:第|方案)\s*([1-5一二三四五])\s*(?:个|项|号|方案)?/);
  if (!ordinal) return 0;
  return Number(ordinal[1]) || chinese[ordinal[1]] || 0;
}
function agentPromptOptionsForMessage(message) {
  if (!message) return [];
  const cached = Array.isArray(message.promptOptions) ? message.promptOptions : [];
  const options = cached.length ? cached : extractAgentPromptOptions(message.text || '');
  return options.filter((item) => item && item.prompt);
}
function agentPromptOptionForMessage(message, optionIndex = '') {
  const options = agentPromptOptionsForMessage(message);
  if (!options.length) return null;
  const requested = Number(optionIndex) || 0;
  return options.find((item) => item.index === requested) || (!requested ? recommendedAgentPromptOption(options) : null);
}
function agentMessageById(messageId) {
  for (const messages of Object.values(state.agent?.messagesByThread || {})) {
    const found = Array.isArray(messages) ? messages.find((message) => message.id === messageId) : null;
    if (found) return found;
  }
  return null;
}
function latestAgentPromptOptionsMessage(projectId = state.agent.activeProjectId) {
  const thread = activeAgentThread(projectId);
  const messages = Array.isArray(state.agent.messagesByThread?.[thread?.id]) ? state.agent.messagesByThread[thread.id] : [];
  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    const message = messages[idx];
    if (message?.role === 'assistant' && !message.pending && agentPromptOptionsForMessage(message).length) return message;
  }
  return null;
}
function agentMessageDisplayText(message, options) {
  const text = String(message?.text || '');
  if (!options?.length) return text;
  const firstOption = text.search(/(?:^|\n)\s*(?:#{1,6}\s*)?方案\s*[1-5]\b/i);
  return firstOption > 0 ? text.slice(0, firstOption).trim() : '';
}
function renderAgentPromptOptionCard(message, option, recommended) {
  const messageId = esc(message.id);
  const optionIndex = esc(option.index);
  const isRecommended = recommended?.index === option.index;
  return `<article class="agent-prompt-option-card ${isRecommended ? 'recommended' : ''}">
    <div class="agent-prompt-option-head">
      <span>方案 ${esc(option.index)}${isRecommended ? ' · 推荐' : ''}</span>
      <strong>${esc(option.title || `方案 ${option.index}`)}</strong>
    </div>
    <div class="agent-prompt-option-meta">
      ${option.modelHint ? `<span>适合模型：${esc(option.modelHint)}</span>` : ''}
      ${option.reason ? `<span>理由：${esc(option.reason)}</span>` : ''}
    </div>
    <div class="agent-prompt-box positive">
      <div><strong>正向 Prompt</strong><button type="button" data-action="copy-agent-prompt" data-message-id="${messageId}" data-option-index="${optionIndex}" data-prompt-kind="positive">复制</button></div>
      <p>${esc(option.prompt)}</p>
    </div>
    <div class="agent-prompt-box negative">
      <div><strong>负面 Prompt</strong><button type="button" data-action="copy-agent-prompt" data-message-id="${messageId}" data-option-index="${optionIndex}" data-prompt-kind="negative">复制</button></div>
      <p>${esc(option.negativePrompt || '无')}</p>
    </div>
    <button class="toolbar-button agent-option-generate" data-action="confirm-agent-image" data-message-id="${messageId}" data-option-index="${optionIndex}">${isRecommended ? '生成推荐方案' : '生成该方案'}</button>
  </article>`;
}
function renderAgentPromptOptions(message, options) {
  if (!options.length) return '';
  const recommended = recommendedAgentPromptOption(options);
  return `<div class="agent-prompt-options">
    <div class="agent-recommended-action">
      <button class="generate-button" data-action="confirm-agent-image" data-message-id="${esc(message.id)}" data-option-index="${esc(recommended?.index || options[0].index)}">生成推荐方案</button>
    </div>
    <div class="agent-option-grid">${options.map((option) => renderAgentPromptOptionCard(message, option, recommended)).join('')}</div>
    <div class="agent-option-shortcuts" aria-label="快捷选择方案">
      ${options.map((option) => `<button type="button" data-action="agent-option-shortcut" data-message-id="${esc(message.id)}" data-option-index="${esc(option.index)}">${esc(option.index)}</button>`).join('')}
    </div>
  </div>`;
}
function renderAgentMessage(message) {
  const canRetry = message.role !== 'user' && message.errorDetail && message.retryInput;
  const options = message.role === 'assistant' ? agentPromptOptionsForMessage(message) : [];
  const imagePrompt = message.role === 'assistant' && !options.length ? (inferAgentImagePrompt('', message.text || '') || cleanAgentImagePrompt(message.imagePrompt || '')) : '';
  const displayText = agentMessageDisplayText(message, options);
  const canCollapse = displayText.length > 1600 || displayText.split(/\n/).length > 28;
  const expanded = !!state.agent?.expandedMessageIds?.[message.id];
  const collapsed = canCollapse && !expanded;
  return `<div class="agent-message ${message.role === 'user' ? 'user' : ''} ${message.pending ? 'pending' : ''} ${collapsed ? 'is-collapsed' : ''}" data-agent-message-id="${esc(message.id)}">
    <div class="agent-message-head">
      <span>${esc(message.role === 'user' ? '你' : 'Agent')}</span>
      <button class="agent-message-menu-button" data-action="open-agent-message-menu" data-id="${esc(message.id)}" aria-label="消息操作">···</button>
    </div>
    ${displayText ? `<div class="agent-prose-wrap ${collapsed ? 'is-collapsed' : ''}"><div class="agent-prose">${renderSafeMarkdown(displayText)}</div>${canCollapse ? `<button type="button" class="agent-expand-button" data-action="toggle-agent-message-expanded" data-message-id="${esc(message.id)}">${expanded ? '收起' : '展开全部'}</button>` : ''}</div>` : ''}
    ${message.attachments?.length ? renderAgentAttachmentTray(message.attachments, false) : ''}
    ${canRetry ? `<button class="toolbar-button agent-retry-button" data-action="retry-agent-message" data-id="${esc(message.id)}">重试</button>` : ''}
    ${options.length ? renderAgentPromptOptions(message, options) : ''}
    ${imagePrompt ? `<button class="toolbar-button" data-action="confirm-agent-image" data-message-id="${esc(message.id)}">生成图片</button>` : ''}
    ${renderAgentTaskCards(message)}
    ${message.errorDetail ? `<details class="agent-error-detail"><summary>查看详情</summary><pre>${esc(message.errorDetail)}</pre></details>` : ''}
    <time>${esc(formatTime(message.createdAt || Date.now()))}</time>
  </div>`;
}
function renderAgentTaskCards(message) {
  const ids = Array.isArray(message?.taskIds) ? message.taskIds : message?.taskId ? [message.taskId] : [];
  const tasks = ids.map((id) => state.tasks.find((task) => task.id === id)).filter(Boolean);
  if (!tasks.length) return '';
  return `<div class="agent-task-strip">${tasks.map(renderAgentTaskCard).join('')}</div>`;
}
function renderAgentTaskCard(task) {
  const image = (task.images || [])[0];
  const count = taskCountInfo(task);
  const status = count.label || (task.status === 'running' ? '生成中' : task.status === 'success' ? '完成' : task.status === 'partial_success' ? '部分完成' : '失败');
  const expected = Math.max(1, Number(count.expected || task.expectedCount || task.count || 1));
  const actual = Math.max(0, Number(count.actual || task.actualCount || task.images?.length || 0));
  const percent = task.status === 'success' ? 100 : Math.max(0, Math.min(100, Math.round((actual / expected) * 100)));
  const statusClass = task.status === 'running' || task.status === 'queued' ? 'running' : task.status === 'success' ? 'success' : task.status === 'partial_success' ? 'partial' : 'error';
  const progressText = `${actual}/${expected}`;
  return `<button class="agent-task-card ${esc(statusClass)}" data-action="open-detail" data-id="${esc(task.id)}" title="点击查看完整生图详情">
    <div class="agent-task-preview">
      ${image ? `<img data-image-kind="task-image" data-task-id="${esc(task.id)}" data-index="0" data-blob-id="${esc(image.blobId || '')}" data-remote-url="${esc(image.url || image.remoteUrl || '')}" alt="">` : '<span class="spinner"></span>'}
    </div>
    <div class="agent-task-meta">
      <strong>${esc(status)}</strong>
      <span class="agent-task-process">${esc(progressText)} · ${esc(formatElapsed(task))}</span>
      <span class="agent-task-progress" aria-hidden="true"><i style="width:${esc(percent)}%"></i></span>
    </div>
  </button>`;
}

function renderWorkflowEditorModal(workflow) {
  return `
    <div class="modal-layer" data-action="cancel-workflow-draft">
      <div class="workflow-editor-modal" data-stop>
        ${renderWorkflowEditor(workflow)}
      </div>
    </div>
  `;
}
let confirmDialogResolver = null;
function openConfirmDialog(dialog) {
  state.confirmDialog = { dialogType: 'confirm', ...dialog };
  render();
}
function openTextInputDialog(dialog) {
  return new Promise((resolve) => {
    confirmDialogResolver = resolve;
    state.confirmDialog = {
      dialogType: 'text-input',
      title: '请输入内容',
      confirmText: '确认',
      cancelText: '取消',
      value: '',
      multiline: false,
      ...dialog
    };
    render();
    requestAnimationFrame(() => $('#confirmTextInput')?.focus());
  });
}
function openCopyLinkDialog(dialog) {
  state.confirmDialog = {
    dialogType: 'copy-link',
    title: '复制链接',
    confirmText: '关闭',
    cancelText: '关闭',
    ...dialog
  };
  render();
}
function renderConfirmDialog() {
  const dialog = state.confirmDialog || {};
  const type = dialog.dialogType || 'confirm';
  const copyUrl = dialog.url || dialog.value || '';
  const confirmClass = type === 'confirm' ? 'confirm-danger' : 'confirm-primary';
  const confirmText = dialog.confirmText || (type === 'confirm' ? '确认删除' : '确认');
  return `
    <div class="modal-layer" data-action="cancel-confirm">
      <div class="confirm-modal ${type !== 'confirm' ? 'dialog-modal' : ''}" role="dialog" aria-modal="true" data-stop>
        <div class="confirm-glow"></div>
        <div class="confirm-head">
          <div class="confirm-icon" aria-hidden="true">
            <span></span>
          </div>
          <div class="confirm-copy">
            <div class="detail-section-label">${esc(dialog.kicker || (type === 'copy-link' ? '复制链接' : type === 'text-input' ? '输入内容' : '确认操作'))}</div>
            <h2>${esc(dialog.title || '确认删除？')}</h2>
            <p>${esc(dialog.message || (type === 'confirm' ? '此操作不可恢复。' : ''))}</p>
          </div>
        </div>
        ${type === 'confirm' ? `<div class="confirm-risk">${esc(dialog.riskText || '删除后无法从浏览器本地恢复，请确认已经不再需要这些内容。')}</div>` : ''}
        ${type === 'copy-link' ? `
          <div class="dialog-body">
            <input class="dialog-input readonly" value="${esc(copyUrl)}" readonly>
          </div>
        ` : ''}
        ${type === 'text-input' ? `
          <div class="dialog-body">
            ${dialog.multiline
              ? `<textarea id="confirmTextInput" class="dialog-input textarea" data-action="dialog-input" rows="5" placeholder="${esc(dialog.placeholder || '')}">${esc(dialog.value || '')}</textarea>`
              : `<input id="confirmTextInput" class="dialog-input" data-action="dialog-input" value="${esc(dialog.value || '')}" placeholder="${esc(dialog.placeholder || '')}">`}
          </div>
        ` : ''}
        <div class="confirm-actions">
          ${type === 'copy-link' ? `<button class="confirm-secondary" data-action="copy-dialog-link">复制</button>` : ''}
          <button class="confirm-secondary" data-action="cancel-confirm">${esc(dialog.cancelText || '取消')}</button>
          <button class="${confirmClass}" data-action="confirm-dialog">${esc(confirmText)}</button>
        </div>
      </div>
    </div>
  `;
}
function closeConfirmDialog(result) {
  const dialog = state.confirmDialog;
  state.confirmDialog = null;
  render();
  if (dialog?.dialogType === 'text-input' && confirmDialogResolver) {
    const resolve = confirmDialogResolver;
    confirmDialogResolver = null;
    resolve(result);
  }
}
async function copyConfirmDialogValue() {
  const value = String(state.confirmDialog?.url || state.confirmDialog?.value || '').trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast('链接已复制');
  } catch {
    toast('复制失败，请手动复制');
  }
}
async function copyTextValue(value, successText = '已复制') {
  const text = String(value || '').trim();
  if (!text) return toast('没有可复制的内容');
  try {
    await navigator.clipboard.writeText(text);
    toast(successText);
  } catch {
    openCopyLinkDialog({ title: '复制文本', message: '当前浏览器不允许直接写入剪贴板，请手动复制。', value: text });
  }
}
function renderWorkflowEditor(workflow) {
  const rows = workflow.variables?.rows || [];
  const columns = workflow.variables?.columns || [];
  const config = workflow.config || {};
  const series = workflow.seriesConfig || {};
  return `
    <div class="workflow-editor" data-workflow-id="${esc(workflow.id)}">
      <div class="workflow-editor-head">
        <div>
          <div class="detail-section-label">${workflow.persisted ? '编辑工作流' : '工作流草稿'}</div>
          <input class="workflow-title-input" data-action="workflow-name-input" value="${esc(workflow.name || '')}" placeholder="工作流名称">
        </div>
        <div class="workflow-editor-actions">
          <button class="toolbar-button" data-action="cancel-workflow-draft">取消</button>
          <button class="toolbar-button" data-action="save-workflow-draft">${workflow.persisted ? '保存修改' : '保存工作流'}</button>
        </div>
      </div>
      <div class="workflow-editor-grid">
        <section class="workflow-form-section">
          <div class="detail-section-label">基础信息</div>
          <input data-action="workflow-field-input" data-field="category" value="${esc(workflow.category || '')}" placeholder="分类，例如 电商海报 / 人像写真">
          <select data-action="workflow-field-input" data-field="mode">
            <option value="single_image" ${workflow.mode !== 'multi_image_series' ? 'selected' : ''}>单图生成</option>
            <option value="multi_image_series" ${workflow.mode === 'multi_image_series' ? 'selected' : ''}>多图生成</option>
          </select>
          <textarea data-action="workflow-field-input" data-field="description" placeholder="适用场景说明">${esc(workflow.description || '')}</textarea>
        </section>
        <section class="workflow-form-section">
          <div class="detail-section-label">提示词模板</div>
          <textarea data-action="workflow-config-input" data-field="systemPrompt" placeholder="系统提示词，可选">${esc(config.systemPrompt || '')}</textarea>
          <textarea class="workflow-template-input" data-action="workflow-config-input" data-field="promptTemplate" placeholder="用户提示词模板，使用 {{变量名}} 插入变量">${esc(config.promptTemplate || workflowPromptTemplate(workflow))}</textarea>
          <textarea data-action="workflow-config-input" data-field="negativePrompt" placeholder="负面约束，可选">${esc(config.negativePrompt || '')}</textarea>
        </section>
        <aside class="workflow-form-section workflow-config-section">
          <div class="detail-section-label">生成配置</div>
          <input data-action="workflow-config-input" data-field="quality" value="${esc(config.quality || state.settings.quality)}" placeholder="质量 auto / high">
          <input data-action="workflow-config-input" data-field="outputFormat" value="${esc(config.outputFormat || state.settings.output_format)}" placeholder="格式 png / jpeg / webp">
          <input data-action="workflow-config-input" data-field="count" value="${esc(config.count || '1')}" placeholder="每次数量">
          <input data-action="workflow-config-input" data-field="timeout" value="${esc(config.timeout || '600')}" placeholder="超时秒数">
          ${workflow.mode === 'multi_image_series' ? `
            <div class="detail-section-label">系列配置</div>
            <input data-action="workflow-series-input" data-field="targetCount" value="${esc(series.targetCount || '4')}" placeholder="目标张数">
            <input data-action="workflow-series-input" data-field="concurrency" value="${esc(series.concurrency || '2')}" placeholder="并发">
            <textarea data-action="workflow-series-input" data-field="promptInstruction" placeholder="系列拆分说明">${esc(series.promptInstruction || '')}</textarea>
          ` : ''}
        </aside>
      </div>
      <div class="workflow-variable-panel">
        <div class="detail-section-label">变量表模板</div>
        ${renderWorkflowRowsTable(columns, rows, 'draft')}
      </div>
    </div>
  `;
}

function renderWorkflowRowsTable(columns, rows, scope) {
  const safeColumns = columns.length ? columns : ['subject', 'style'];
  const safeRows = rows.length ? rows : [{ id: uid('row'), values: Object.fromEntries(safeColumns.map((c) => [c, ''])) }];
  return `
    <div class="workflow-table-wrap">
      <table class="workflow-table">
        <thead><tr>${safeColumns.map((column) => `<th>${esc(column)}</th>`).join('')}<th>操作</th></tr></thead>
        <tbody>
          ${safeRows.map((row, rowIndex) => `<tr data-row-id="${esc(row.id)}">
            ${safeColumns.map((column) => `<td><input data-action="workflow-row-input" data-scope="${esc(scope)}" data-row-index="${rowIndex}" data-column="${esc(column)}" value="${esc(row.values?.[column] || '')}"></td>`).join('')}
            <td><button class="toolbar-button" data-action="delete-workflow-row" data-scope="${esc(scope)}" data-row-index="${rowIndex}">删除</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
      <button class="toolbar-button" data-action="add-workflow-row" data-scope="${esc(scope)}">新增变量行</button>
    </div>
  `;
}

function renderWorkflowRun(run) {
  const statusText = { queued: '排队', running: '执行中', success: '完成', error: '失败', interrupted: '已中断' }[run.status] || run.status;
  return `
    <article class="workflow-run-card">
      <div class="workflow-run-head">
        <div><strong>${esc(run.workflowSnapshot?.name || '工作流运行')}</strong><span>${esc(statusText)} · ${esc(run.rows?.length || 0)} 行 · 并发 ${esc(run.concurrency || 1)}</span></div>
        <span>${esc(formatElapsed(run))}</span>
      </div>
      <div class="workflow-run-steps">
        ${(run.steps || []).map((step) => `<div class="workflow-step ${esc(step.status || '')}">
          <span>${esc(step.index || 0)}</span>
          <strong>${esc(step.title || step.type || 'step')}</strong>
          <em>${esc(step.status || '')}</em>
          <p>${esc(step.prompt || step.error || step.resultText || '')}</p>
        </div>`).join('')}
      </div>
    </article>
  `;
}

function renderDetailModal(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return '';
  const images = task.images || [];
  const imageIndex = Math.max(0, Math.min(Number(task.detailImageIndex) || 0, Math.max(0, images.length - 1)));
  const image = images[imageIndex];
  const returnedPrompt = task.returnedPrompt && task.returnedPrompt !== task.prompt ? task.returnedPrompt : '';
  const requested = task.requestedParams || {};
  const returned = task.returnedParams || {};
  const requestedFormat = firstDefined(requested.format, requested.output_format, state.settings.output_format);
  const returnedFormat = firstDefined(readDeepAlias(returned, ['format', 'output_format', 'outputFormat', 'mimeType', 'mime_type']));
  const formatForConditional = normalizeComparableValue(returnedFormat || requestedFormat, 'format');
  const imageSizeLabel = image?.width && image?.height ? `${image.width}x${image.height}` : firstDefined(returned.resolution, returned.size, returned.dimensions, task.sizeLabel);
  const imageRatioLabel = image?.width && image?.height ? closestAspectRatio(image.width, image.height) : firstDefined(returned.aspectRatio, returned.aspect_ratio, requested.aspectRatio);
  const isTransparentPng = formatForConditional === 'png' && normalizeComparableValue(firstDefined(returned.transparent, returned.transparent_background, requested.transparent), 'bool') === 'yes';
  const param = (label, key, requestedValue, options = {}) => {
    const actual = firstDefined(
      readDeepAlias(returned, [key, ...(options.aliases || [])]),
      options.actualFallback
    );
    const requestedDisplay = displayParamValue(requestedValue);
    const actualDisplay = displayParamValue(actual, '');
    const requestedCompare = normalizeComparableValue(requestedValue, options.type);
    const actualCompare = normalizeComparableValue(actual, options.type);
    const mismatch = returned.mismatch?.[key];
    const tierMatch = key === 'resolution' && isTierResolutionMatch(requested, actual, images);
    const hasActual = actualCompare !== '' && actualCompare !== requestedCompare;
    const diff = !tierMatch && (!!mismatch || hasActual);
    const showActual = hasActual || (tierMatch && actualDisplay);
    return `<div class="param-card ${diff ? 'has-mismatch' : ''}"><div class="param-label">${label}</div><div class="param-value"><span>${esc(requestedDisplay)}</span>${showActual ? `<span class="${diff ? 'actual-value' : 'actual-value matched'}">${esc(actualDisplay)}</span>` : ''}</div></div>`;
  };
  const compressionParam = formatForConditional === 'png'
    ? param('透明背景', 'transparent', !!requested.transparent, { type: 'bool', aliases: ['transparentBackground', 'transparent_background'] })
    : param('压缩/质量', 'compression', requested.compression, { type: 'number', aliases: ['outputCompression', 'output_compression', 'compressionQuality'] });
  return `
    <div class="modal-layer" data-action="close-modal-bg">
      <div class="detail-modal" role="dialog" aria-modal="true" data-stop>
        <div class="detail-media">
          <div class="detail-media-badges">
            <span>${esc(imageRatioLabel || requested.aspectRatio || 'auto')}</span>
            <span>${esc(imageSizeLabel || requested.resolution || 'auto')}</span>
          </div>
          ${image ? `<img data-action="open-viewer" data-image-kind="task-image" data-task-id="${esc(task.id)}" data-index="${esc(imageIndex)}" data-blob-id="${esc(image.blobId || '')}" data-remote-url="${esc(image.url || image.remoteUrl || '')}" alt="">` : '<div class="asset-placeholder"><div class="progress-ring"></div></div>'}
          ${isTransparentPng && image ? `<button class="detail-download original" data-action="download-image" data-task-id="${esc(task.id)}" data-index="${esc(imageIndex)}">下载原图</button><button class="detail-download orig" data-action="download-image" data-task-id="${esc(task.id)}" data-index="${esc(imageIndex)}" data-original="true">ORIG</button>` : ''}
          ${renderReferenceBadge(task, 'detail')}
          ${images.length > 1 ? `
            <button class="detail-image-nav prev" data-action="detail-image-prev" data-id="${esc(task.id)}" aria-label="上一张">‹</button>
            <button class="detail-image-nav next" data-action="detail-image-next" data-id="${esc(task.id)}" aria-label="下一张">›</button>
            <div class="detail-image-count">${esc(imageIndex + 1)} / ${esc(images.length)}</div>
            <div class="detail-thumbs">${images.map((img, idx) => `<button class="${idx === imageIndex ? 'active' : ''}" data-action="detail-image-select" data-id="${esc(task.id)}" data-index="${esc(idx)}"><img data-image-kind="task-image" data-task-id="${esc(task.id)}" data-index="${esc(idx)}" data-blob-id="${esc(img.blobId || '')}" data-remote-url="${esc(img.url || img.remoteUrl || '')}" alt=""></button>`).join('')}</div>
          ` : ''}
        </div>
        <div class="detail-info">
          <button class="modal-close" aria-label="关闭" data-action="close-modal">×</button>
          <div class="detail-section-label">输入提示词</div>
          <div class="prompt-block">${esc(task.prompt || '未填写')}</div>
          ${renderTaskReferenceStrip(task)}
          ${returnedPrompt ? `<div class="detail-section-label">返回提示词</div><div class="returned-prompt">${esc(returnedPrompt)}</div>` : ''}
          ${task.error || task.partialErrors?.length ? `<div class="detail-section-label">${task.status === 'partial_success' ? '部分失败信息' : '错误信息'}</div><div class="returned-prompt error-prompt">${esc(task.error || '部分图片生成失败')}${task.errorDetail && task.errorDetail !== task.error ? `\n\n${esc(task.errorDetail)}` : ''}${task.partialErrors?.length ? `\n\n${esc(task.partialErrors.map((item, idx) => `${idx + 1}. ${item.summary || item.error || item}`).join('\n'))}` : ''}</div>` : ''}
          <div class="detail-section-label">参数配置</div>
          ${param('来源', 'source', requested.source)}
          ${param('分辨率', 'resolution', requested.resolution || requested.size || task.sizeLabel, { aliases: ['size', 'dimensions', 'output_size', 'outputSize'], actualFallback: imageSizeLabel })}
          ${param('比例', 'aspectRatio', requested.aspectRatio || 'auto', { type: 'ratio', aliases: ['aspect_ratio', 'ratio'], actualFallback: imageRatioLabel })}
          ${param('质量', 'quality', requested.quality || task.quality)}
          ${param('格式', 'format', requestedFormat, { type: 'format', aliases: ['outputFormat', 'output_format', 'mimeType'] })}
          ${compressionParam}
          ${param('审核', 'moderation', requested.moderation, { aliases: ['moderation_level', 'moderationLevel', 'safety', 'safety_filter', 'safetyFilter'] })}
          ${param('数量', 'count', requested.count || task.count, { type: 'number', aliases: ['n', 'imageCount', 'image_count'], actualFallback: images.length || undefined })}
          ${task.workflowName ? `<div class="detail-section-label">工作流来源</div><div class="param-card"><div class="param-value"><span>${esc(task.workflowName)}</span><span>${esc(task.batchLabel || '批量行')}</span><span>${esc(task.workflowNodeId || '生图节点')}</span></div></div>` : ''}
          <div class="detail-section-label">标签与备注</div>
          <input class="detail-edit-input" data-action="task-tags-input" data-id="${esc(task.id)}" value="${esc(task.tags || '')}" placeholder="标签，用逗号分隔">
          <textarea class="detail-edit-input detail-note" data-action="task-note-input" data-id="${esc(task.id)}" placeholder="备注">${esc(task.note || '')}</textarea>
          <div class="detail-foot">创建于 ${esc(formatTime(task.createdAt))} · API ${esc(formatElapsed(task))}${task.persistElapsedMs ? ` · 本地入库 ${esc(formatElapsed({ elapsedMs: task.persistElapsedMs }))}` : ''}</div>
          <div class="detail-actions">
            <button class="reuse" data-action="reuse-task" data-id="${esc(task.id)}">↩ 复用配置</button>
            ${task.status === 'partial_success' ? `<button class="edit" data-action="top-up-task" data-id="${esc(task.id)}">补生成失败张数</button>` : ''}
            ${(state.preferences?.alwaysShowRetryButton !== false || task.status !== 'success') ? `<button class="edit" data-action="retry-task" data-id="${esc(task.id)}">重试</button>` : ''}
            <button class="edit" data-action="edit-output" data-id="${esc(task.id)}">✎ 编辑输出</button>
            <button class="delete" data-action="delete-task" data-id="${esc(task.id)}">删除任务</button>
            <button class="favorite ${state.favorites[task.id] ? 'active' : ''}" data-action="favorite-task" data-id="${esc(task.id)}">☆</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
function renderViewer(viewer) {
  if (typeof viewer === 'object' && viewer.kind === 'reference') {
    return `
      <div class="viewer-layer" data-action="close-viewer">
        <button class="viewer-close" data-action="close-viewer">×</button>
        <div class="viewer-index">${esc(viewer.name || '参考图原图')}</div>
        <img class="viewer-image" data-action="viewer-image" data-image-kind="task-reference-original" data-blob-id="${esc(viewer.blobId || '')}" alt="">
      </div>
    `;
  }
  const taskId = typeof viewer === 'object' ? viewer.taskId : viewer;
  const index = typeof viewer === 'object' ? Number(viewer.index) || 0 : 0;
  const task = state.tasks.find((t) => t.id === taskId);
  const images = task?.images || [];
  const safeIndex = Math.max(0, Math.min(index, Math.max(0, images.length - 1)));
  const image = images[safeIndex];
  if (!image) return '';
  return `
    <div class="viewer-layer" data-action="close-viewer">
      <button class="viewer-close" data-action="close-viewer">×</button>
      ${images.length > 1 ? `<button class="viewer-nav prev" data-action="viewer-prev" aria-label="上一张">‹</button><button class="viewer-nav next" data-action="viewer-next" aria-label="下一张">›</button><div class="viewer-index">${esc(safeIndex + 1)} / ${esc(images.length)}</div>` : ''}
      <img class="viewer-image" data-action="viewer-image" data-image-kind="task-image" data-task-id="${esc(task.id)}" data-index="${esc(safeIndex)}" data-blob-id="${esc(image.blobId || '')}" data-remote-url="${esc(image.url || image.remoteUrl || '')}" alt="">
    </div>
  `;
}
function setViewerImage(delta) {
  if (!state.viewer || typeof state.viewer !== 'object' || state.viewer.kind === 'reference') return;
  const task = state.tasks.find((item) => item.id === state.viewer.taskId);
  const total = (task?.images || []).length;
  if (total <= 1) return;
  const current = Math.max(0, Math.min(Number(state.viewer.index) || 0, total - 1));
  state.viewer = { ...state.viewer, index: (current + Number(delta) + total) % total };
  render();
}
function setDetailImage(taskId, value, isDelta = false) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const total = (task.images || []).length;
  if (!total) return;
  const current = Number(task.detailImageIndex) || 0;
  task.detailImageIndex = isDelta ? (current + Number(value) + total) % total : Math.max(0, Math.min(Number(value) || 0, total - 1));
  render();
}

function renderImageContextMenu(menu) {
  const x = Math.max(12, Math.min(Number(menu.x) || 12, (window.innerWidth || 1280) - 190));
  const y = Math.max(12, Math.min(Number(menu.y) || 12, (window.innerHeight || 720) - 154));
  return `
    <div class="image-menu-layer" data-action="close-image-menu">
      <div class="image-context-menu" style="left:${esc(x)}px;top:${esc(y)}px" data-stop>
        <button data-action="copy-image">复制</button>
        <button data-action="download-image">下载</button>
        <button data-action="edit-image-source">编辑</button>
      </div>
    </div>
  `;
}
function imageContextFromElement(img, event) {
  const kind = img.dataset.imageKind || (img.dataset.taskRefTaskId ? 'task-reference' : img.dataset.taskId ? 'task-image' : '');
  if (!kind) return null;
  return {
    kind,
    taskId: img.dataset.taskId || img.dataset.taskRefTaskId || '',
    index: Number(img.dataset.index || img.dataset.taskRefIndex || 0) || 0,
    blobId: img.dataset.blobId || '',
    remoteUrl: img.dataset.remoteUrl || img.src || '',
    x: event.clientX,
    y: event.clientY
  };
}
function currentImageMenuSource() {
  const menu = state.imageContextMenu;
  if (!menu) return {};
  if (menu.kind === 'task-reference' || menu.kind === 'task-reference-original') {
    const task = state.tasks.find((item) => item.id === menu.taskId);
    const ref = taskReferenceSnapshots(task || {})[menu.index];
    if (!ref) return {};
    return {
      blobId: taskReferenceOriginalBlobId(ref),
      displayBlobId: taskReferenceDisplayBlobId(ref),
      name: ref.name || `${task?.id || 'reference'}-ref-${menu.index + 1}.png`,
      task,
      ref
    };
  }
  const task = state.tasks.find((item) => item.id === menu.taskId);
  const image = task?.images?.[menu.index] || {};
  return {
    blobId: menu.blobId || image.blobId || '',
    remoteUrl: menu.remoteUrl || image.url || image.remoteUrl || '',
    name: `${task?.id || 'image'}-${menu.index + 1}.png`,
    task,
    image
  };
}
async function blobFromImageSource(source) {
  if (source.blobId) {
    const blob = await getBlob(source.blobId).catch(() => null);
    if (blob) return blob;
  }
  if (source.remoteUrl) {
    const response = await fetch(source.remoteUrl).catch(() => null);
    if (response?.ok) return response.blob();
  }
  return null;
}
async function copyImageFromMenu() {
  const source = currentImageMenuSource();
  const blob = await blobFromImageSource(source);
  if (!blob) return toast('当前图片无法复制');
  try {
    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
      toast('图片已复制');
    } else {
      openCopyLinkDialog({ title: '复制图片', message: '当前浏览器不支持直接复制图片，请手动复制链接。', value: state.imageUrls.get(source.blobId) || source.remoteUrl || '' });
    }
  } catch {
    toast('复制失败，请下载后使用');
  }
}
async function downloadImageFromMenuOrTarget(target = null) {
  let source;
  if (target?.dataset?.taskId) {
    const task = state.tasks.find((item) => item.id === target.dataset.taskId);
    const index = Number(target.dataset.index) || 0;
    const image = task?.images?.[index] || {};
    const wantsOriginal = target.dataset.original === 'true';
    source = {
      blobId: wantsOriginal ? (image.originalBlobId || image.blobId) : image.blobId,
      remoteUrl: image.url || image.remoteUrl,
      name: `${task?.id || 'image'}-${index + 1}${wantsOriginal ? '-orig' : ''}.png`
    };
  } else {
    source = currentImageMenuSource();
  }
  const blob = await blobFromImageSource(source);
  if (!blob) return toast('当前图片无法下载');
  const ext = (blob.type?.split('/')[1] || 'png').replace('jpeg', 'jpg');
  downloadBlob(blob, String(source.name || `image-${Date.now()}.${ext}`).replace(/\.[a-z0-9]+$/i, `.${ext}`));
}
async function editImageFromMenu() {
  const source = currentImageMenuSource();
  if (source.task?.id && state.imageContextMenu?.kind === 'task-image') {
    state.imageContextMenu = null;
    await editOutput(source.task.id);
    return;
  }
  if (source.ref) {
    const blob = await blobFromImageSource(source);
    if (!blob) return toast('参考图原图不在当前浏览器本地，无法编辑');
    const blobId = await putBlob(blob);
    const ref = { id: uid('ref'), blobId, originalBlobId: blobId, name: source.name, type: blob.type || 'image/png' };
    state.references = [ref, ...state.references].slice(0, referenceLimit());
    state.imageContextMenu = null;
    writeStore();
    await openMaskEditor(ref.id);
    return;
  }
  toast('当前图片暂不支持编辑');
}
function openTaskReferenceViewer(taskId, index = 0) {
  const task = state.tasks.find((item) => item.id === taskId);
  const ref = taskReferenceSnapshots(task || {})[Number(index) || 0];
  if (!ref) return toast('参考图不存在');
  state.viewer = { kind: 'reference', taskId, refIndex: Number(index) || 0, blobId: taskReferenceOriginalBlobId(ref), name: ref.name || '参考图原图' };
  state.imageContextMenu = null;
  render();
}

async function addFilesAsProReferences(files, slot = 'base') {
  const imageFiles = files.filter((file) => file && file.type.startsWith('image/'));
  if (!imageFiles.length) return;
  const limit = state.pro.mode === 'styleTransfer' ? 2 : 1;
  if (slot === 'base' && imageFiles.length > 1 && state.pro.mode !== 'styleTransfer') {
    toast('当前专业模式只支持 1 张底图');
    return;
  }
  if (slot === 'style' && state.pro.mode !== 'styleTransfer') return;
  if ((state.pro.refs || []).length >= limit && slot === 'style') {
    toast(`当前模式最多允许 ${limit} 张参考图`);
    return;
  }
  const replacing = (state.pro.refs || []).filter((ref) => ref.slot === slot || (slot === 'base' && !ref.slot && state.pro.refs.indexOf(ref) === 0));
  await Promise.all(replacing.map((ref) => deleteBlob(ref.blobId).catch(() => {})));
  state.pro.refs = (state.pro.refs || []).filter((ref) => !replacing.includes(ref));
  for (const file of imageFiles.slice(0, 1)) {
    if (state.pro.refs.length >= limit && !state.pro.refs.some((ref) => ref.slot === slot)) break;
    const blobId = await putBlob(file);
    const size = await imageSizeFromBlob(file).catch(() => ({}));
    state.pro.refs.push({ id: uid('proref'), blobId, originalBlobId: blobId, name: file.name || 'reference.png', type: file.type, width: size.width, height: size.height, slot });
  }
  state.pro.refs = state.pro.mode === 'styleTransfer'
    ? ['base', 'style'].map((name) => state.pro.refs.find((ref) => ref.slot === name)).filter(Boolean)
    : state.pro.refs.filter((ref) => ref.slot === 'base').slice(0, 1);
  state.pro.analysis = null;
  persistRender();
}
async function removeProReference(id) {
  const ref = (state.pro.refs || []).find((item) => item.id === id);
  if (!ref) return;
  await deleteBlob(ref.blobId).catch(() => {});
  if (ref.originalBlobId && ref.originalBlobId !== ref.blobId) await deleteBlob(ref.originalBlobId).catch(() => {});
  if (ref.compositedBlobId && ref.compositedBlobId !== ref.blobId) await deleteBlob(ref.compositedBlobId).catch(() => {});
  if (ref.maskBlobId) await deleteBlob(ref.maskBlobId).catch(() => {});
  revokeMapEntry(state.refUrls, `pro:${id}`);
  state.pro.refs = (state.pro.refs || []).filter((item) => item.id !== id);
  state.pro.analysis = null;
  persistRender();
}
function setProMode(mode) {
  if (!PRO_WORKBENCH_MODES[mode]) return;
  state.pro.mode = mode;
  if ((mode === 'ai' || mode === 'manual') && (state.pro.refs || []).length > 1) state.pro.refs = state.pro.refs.filter((ref) => ref.slot === 'base').slice(0, 1);
  if (mode === 'styleTransfer' && (state.pro.refs || []).length > 2) state.pro.refs = state.pro.refs.slice(0, 2);
  state.pro.analysis = null;
  persistRender();
}
function normalizeProPrompt() {
  const mode = state.pro.mode || 'ai';
  const base = (state.pro.prompt || '').trim();
  const params = state.pro.params || {};
  const pieces = [];
  const structureLock = '强保原图建筑结构、透视关系、体块比例、开窗位置、主要构图和空间边界，只调整时间、天气、灯光、材质、氛围与成片质感。';
  if (mode === 'manual') {
    pieces.push(
      `专业手动建筑渲染`,
      `渲染场景：${params.scene || '建筑外景'}`,
      `具体时间：${params.customTime || params.time || '10:30 明亮日景'}`,
      `天气状态：${params.customWeather || params.weather || '晴朗'}`,
      `室内灯光：${params.customLighting || params.indoorLighting || '柔和灯光'}`,
      `画面氛围：${(params.atmosphere || []).join('、') || '自然商业氛围'}`,
      `项目风格：${params.projectStyle || '现代精致'}`,
      `拍摄设备：${params.deviceType || '微单相机'}，${params.cameraBrand || '索尼'}，${params.focalLength || '24mm 建筑常用'}，${params.aperture || 'f/8.0'}`,
      `配景布置：${params.environment || '植物与城市远景'}；${params.foreground || '不额外新增'}`,
      `成片质感：${params.rendering || '电影级写实'}；${params.colorGrading || '清透自然'}`,
      params.notes ? `补充说明：${params.notes}` : ''
    );
  } else if (mode === 'ai') {
    pieces.push(`AI 专业渲染`, `场景：${params.scene || '建筑外景'}`, `材质：${params.material || '真实材质'}`, `光影：${params.lighting || '自然柔光'}`, `镜头：${params.camera || '广角写实'}`, `风格：${params.style || '电影级写实'}`);
  } else {
    const dims = PRO_DIMENSIONS.filter(([key]) => state.pro.selectedDimensions?.[key] !== false).map(([, label]) => label).join('、');
    pieces.push(`灵感迁移专业渲染`, `迁移维度：${dims || '光影、色调、材质、氛围'}`, `风格强度：${params.strength || 'medium'}`, `目标场景：${params.scene || '建筑外景'}`, `目标风格：${params.style || '电影级写实'}`);
  }
  pieces.push(structureLock);
  if (base) pieces.push(`用户补充：${base}`);
  return pieces.join('，');
}
function applyProAnalysis() {
  const analysis = state.pro.analysis;
  if (!analysis) return;
  state.pro.prompt = analysis.recommendedPrompt || state.pro.prompt;
  persistRender();
}
async function analyzeProWorkbench() {
  const prompt = normalizeProPrompt();
  if (!(state.pro.refs || []).length) { toast('请先上传底图'); return; }
  const profile = proImageProfile();
  state.pro.analyzing = true;
  persistRender();
  try {
    const refs = await Promise.all((state.pro.refs || []).map(async (ref) => {
      const blob = await getBlob(ref.blobId).catch(() => null);
      return blob ? { ref, blob } : null;
    }));
    if (!refs.some(Boolean)) throw new Error('本地图片数据不可用，请重新上传底图');
    const form = new FormData();
    form.append('mode', state.pro.mode);
    form.append('prompt', prompt);
    form.append('profile', JSON.stringify(requestedParams(profile)));
    form.append('params', JSON.stringify(state.pro.params || {}));
    form.append('selectedDimensions', JSON.stringify(state.pro.selectedDimensions || {}));
    form.append('structureLock', 'true');
    refs.forEach((item, idx) => {
      if (!item?.blob) return;
      form.append(item.ref.slot === 'style' ? 'ref[]' : 'base[]', item.blob, item.ref.name || `pro-analysis-${idx + 1}.png`);
    });
    appendAdvancedToFormData(form, 'pro', profile);
    const data = await fetchJson('/api/pro-workbench/analyze', { method: 'POST', headers: appendAdvancedHeaders({}, 'pro', profile), body: form });
    state.pro.analysis = data.analysis || data.result || data;
  } catch (err) {
    const normalized = normalizeError(err, '分析失败');
    state.pro.analysis = {
      scene: state.pro.params.scene,
      material: state.pro.params.material,
      lighting: state.pro.params.lighting,
      camera: state.pro.params.camera,
      style: state.pro.params.style,
      negative: '无明显负面项',
      recommendedPrompt: normalizeProPrompt()
    };
    toast(`分析使用本地兜底：${normalized.summary}`);
  } finally {
    state.pro.analyzing = false;
    persistRender();
  }
}
async function renderProWorkbenchTask() {
  const prompt = normalizeProPrompt();
  if (!(state.pro.refs || []).length) { toast('请先上传图片'); return; }
  const profile = proImageProfile();
  const provider = providerKey(profile);
  const paramsForProvider = requestedParams(profile);
  state.pro.running = true;
  persistRender();
  try {
    const task = await generateImageTask({
      prompt,
      references: state.pro.refs || [],
      requestedParams: {
        source: `${PROVIDER[provider]?.name || profile.provider} · ${profile.name || profileId(profile)} · ${profile.model || 'model'}`,
        provider,
        profileId: profileId(profile),
        profileName: profile.name,
        model: profile.model,
        size: sizeSummary(profile),
        resolution: paramsForProvider.resolution,
        aspectRatio: paramsForProvider.aspectRatio,
        quality: state.settings.quality,
        format: state.settings.output_format,
        compression: state.settings.output_compression,
        transparent: !!state.settings.transparent_output,
        moderation: state.settings.moderation,
        count: Number(state.settings.n) || 1,
        proMode: PRO_WORKBENCH_MODES[state.pro.mode]?.title || state.pro.mode,
        proParams: { ...state.pro.params },
        selectedDimensions: { ...(state.pro.selectedDimensions || {}) },
        structureLock: true
      },
      workflowMeta: {
        entry: 'pro',
        workflowId: 'pro-workbench',
        workflowNodeId: state.pro.mode,
        batchLabel: PRO_WORKBENCH_MODES[state.pro.mode]?.title || '专业工作台',
        workflowName: '专业工作台',
        onCreated: (createdTask) => {
          state.pro.activeTaskId = createdTask.id;
        }
      }
    });
    if (task) {
      state.pro.activeTaskId = task.id;
      state.mode = 'gallery';
      toast('专业渲染已进入画廊');
    }
  } catch (err) {
    const normalized = normalizeError(err, '专业渲染失败');
    toast(`专业渲染失败：${normalized.summary}`);
  } finally {
    state.pro.running = false;
    persistRender();
  }
}
async function hydrateProResult(data, prompt) {
  const task = {
    id: uid('task'),
    status: 'success',
    mode: 'gallery',
    prompt,
    profileId: activeProfile().id,
    profileName: activeProfile().name,
    model: activeProfile().model,
    providerFamily: providerKey(),
    sizeLabel: sizeSummary(),
    quality: state.settings.quality,
    count: Number(state.settings.n) || 1,
    referenceCount: state.pro.refs.length,
    requestedParams: {
      source: `${PROVIDER[providerKey()]?.name || activeProfile().provider} · ${activeProfile().name || activeProfile().id} · ${activeProfile().model || 'model'}`,
      provider: providerKey(),
      profileId: activeProfile().id,
      profileName: activeProfile().name,
      model: activeProfile().model,
      size: sizeSummary(),
      quality: state.settings.quality,
      format: state.settings.output_format,
      compression: state.settings.output_compression,
      transparent: !!state.settings.transparent_output,
      moderation: state.settings.moderation,
      count: Number(state.settings.n) || 1
    },
    returnedParams: data?.returnedParams || data?.params || {},
    returnedPrompt: data?.returnedPrompt || data?.prompt || prompt,
    workflowId: data?.workflowId || '',
    workflowRunId: data?.workflowRunId || '',
    workflowNodeId: data?.workflowNodeId || '',
    batchRowId: data?.batchRowId || '',
    batchLabel: data?.batchLabel || '',
    workflowName: data?.workflowName || '',
    createdAt: Date.now(),
    startedAt: Date.now(),
    finishedAt: Date.now(),
    elapsedMs: data?.elapsedMs || 0,
    images: [],
    error: ''
  };
  const images = await persistResponseImages(data);
  task.images = images;
  task.rawResponse = summarizeResponse(data);
  state.tasks.unshift(task);
  writeStore();
  render();
  return task;
}

function renderPopover(pop) {
  if (pop.type === 'model-config') return renderModelConfigMenu(pop);
  if (pop.type === 'agent-model-config') return renderAgentModelConfigMenu(pop);
  if (pop.type === 'size') return renderSizeModal();
  if (pop.type === 'resolution') return renderSizeModal();
  if (pop.type === 'agent-size') return renderAgentSizeModal('ratio');
  if (pop.type === 'agent-resolution') return renderAgentSizeModal('resolution');
  if (pop.type === 'agent-message-menu') return renderAgentMessageMenu(pop);
  if (pop.type === 'agent-project-menu') return renderAgentProjectMenu(pop);
  if (pop.type === 'agent-thread-menu') return renderAgentThreadMenu(pop);
  const options = {
    quality: ['auto', 'low', 'medium', 'high'],
    format: ['png', 'jpeg', 'webp'],
    compression: state.settings.output_format === 'png' ? ['是', '否'] : ['100', '95', '90', '80', '70'],
    'agent-quality': ['auto', 'low', 'medium', 'high'],
    'agent-format': ['png', 'jpeg', 'webp'],
    'agent-compression': agentImageSettings().output_format === 'png' ? ['是', '否'] : ['100', '95', '90', '80', '70']
  }[pop.type] || [];
  const rect = pop.rect || { left: 40, top: 40, bottom: 100 };
  return `
    <div class="popover up-popover" style="${popoverStyle(rect, 250, Math.min(320, 48 + options.length * 38))}">
      ${options.map((value) => `<button class="${isPopoverValueActive(pop.type, value) ? 'active' : ''}" data-action="${String(pop.type || '').startsWith('agent-') ? 'set-agent-popover-value' : 'set-popover-value'}" data-type="${esc(pop.type)}" data-value="${esc(value)}">${esc(value)}</button>`).join('')}
    </div>
  `;
}
function renderAgentProjectMenu(pop) {
  const rect = pop.rect || { left: 40, top: 40, bottom: 80 };
  const activeId = state.agent.activeProjectId;
  return `
    <div class="popover up-popover agent-top-menu agent-project-menu" style="${popoverStyle(rect, 290, 380)}">
      <div class="popover-title">项目菜单</div>
      <div class="agent-menu-list">
        ${state.agent.projects.map((project) => `
          <button class="${project.id === activeId ? 'active' : ''}" data-action="agent-project-switch" data-id="${esc(project.id)}">
            <strong>${esc(project.name || '默认项目')}</strong>
            <small>${esc(project.prompt || '未设置项目提示词')}</small>
          </button>
        `).join('')}
      </div>
      <div class="agent-menu-divider"></div>
      <button class="agent-project-menu-action" data-action="agent-project-new">新建项目</button>
      <button class="agent-project-menu-action" data-action="agent-project-rename">修改项目名称</button>
      <button class="agent-project-menu-action" data-action="agent-project-edit-prompt">修改提示词</button>
      <button class="agent-project-menu-action danger" data-action="agent-project-delete">删除项目</button>
    </div>
  `;
}
function renderAgentThreadMenu(pop) {
  const rect = pop.rect || { left: 40, top: 40, bottom: 80 };
  const project = state.agent.projects.find((item) => item.id === state.agent.activeProjectId) || state.agent.projects[0];
  const activeId = activeAgentThreadId(project?.id);
  const threads = projectThreads(project?.id);
  return `
    <div class="popover up-popover agent-top-menu agent-thread-menu-popover" style="${popoverStyle(rect, 300, 380)}">
      <div class="popover-title">对话列表</div>
      <button class="agent-menu-create" data-action="agent-thread-new">新建会话</button>
      <div class="agent-menu-list">
        ${threads.map((thread) => `
          <div class="agent-thread-menu-row">
            <button class="${thread.id === activeId ? 'active' : ''}" data-action="agent-thread-select" data-id="${esc(thread.id)}">
              <strong>${esc(thread.title || '主对话')}</strong>
              <small>${esc(formatTime(thread.updatedAt || thread.createdAt))}</small>
            </button>
            <button class="agent-thread-delete-button" data-action="agent-thread-delete" data-id="${esc(thread.id)}" title="删除会话" aria-label="删除会话">×</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
function popoverStyle(rect, width = 280, height = 320) {
  const safeHeight = Math.min(height, Math.max(160, window.innerHeight - 24));
  const left = Math.max(10, Math.min((rect.left || 40) + ((rect.width || 0) / 2) - (width / 2), window.innerWidth - width - 10));
  const topAbove = (rect.top || 80) - safeHeight - 8;
  const topBelow = (rect.bottom || rect.top || 80) + 8;
  if (topAbove >= 10) {
    const bottom = Math.max(10, window.innerHeight - (rect.top || 80) + 8);
    return `left:${left}px;bottom:${bottom}px;width:${width}px;max-height:${safeHeight}px`;
  }
  const top = Math.min(Math.max(10, topBelow), window.innerHeight - safeHeight - 10);
  return `left:${left}px;top:${top}px;width:${width}px;max-height:${safeHeight}px`;
}
function isPopoverValueActive(type, value) {
  if (type === 'agent-quality') return agentImageSettings().quality === value;
  if (type === 'agent-format') return agentImageSettings().output_format === value;
  if (type === 'agent-compression') {
    const settings = agentImageSettings();
    return settings.output_format === 'png' ? (settings.transparent_output ? '是' : '否') === value : String(settings.output_compression) === String(value);
  }
  if (type === 'quality') return state.settings.quality === value;
  if (type === 'format') return state.settings.output_format === value;
  if (type === 'compression') return state.settings.output_format === 'png' ? (state.settings.transparent_output ? '是' : '否') === value : String(state.settings.output_compression) === String(value);
  return false;
}
function renderModelConfigMenu(pop) {
  const profiles = imageProfiles();
  const rect = pop.rect || { left: 40, top: window.innerHeight - 160 };
  const height = Math.min(340, 52 + Math.max(1, profiles.length) * 42);
  return `
    <div class="popover up-popover model-menu" style="${popoverStyle(rect, 300, height)}">
      <div class="popover-title">模型配置</div>
      ${profiles.length ? profiles.map((profile) => `
        <button class="${profileId(profile) === profileId(imageProfile()) ? 'active' : ''}" data-action="switch-profile" data-value="${esc(profileId(profile))}">
          <strong>${esc(profile.name || profileId(profile))}</strong>
        </button>
      `).join('') : `<div class="popover-empty">暂无生图模型，请到后台添加 Images API 配置。</div>`}
    </div>
  `;
}
function renderAgentModelConfigMenu(pop) {
  const profiles = imageProfiles();
  const current = profileId(agentImageProfile());
  const rect = pop.rect || { left: 40, top: window.innerHeight - 160 };
  const height = Math.min(340, 52 + Math.max(1, profiles.length) * 42);
  return `
    <div class="popover up-popover model-menu" style="${popoverStyle(rect, 300, height)}">
      <div class="popover-title">Agent 生图模型</div>
      ${profiles.length ? profiles.map((profile) => `
        <button class="${profileId(profile) === current ? 'active' : ''}" data-action="set-agent-image-param" data-field="profileId" data-value="${esc(profileId(profile))}">
          <strong>${esc(profile.name || profileId(profile))}</strong>
        </button>
      `).join('') : `<div class="popover-empty">暂无生图模型，请到后台添加 Images API 配置。</div>`}
    </div>
  `;
}
function renderSizeModal() {
  const profile = activeProfile();
  const key = providerKey(profile);
  const mode = state.popover?.type === 'resolution' ? 'resolution' : 'ratio';
  const rect = state.popover?.rect || { left: 40, top: window.innerHeight - 160 };
  let body = '';
  if (mode === 'resolution' && key === 'openai') {
    body = ['1K', '2K', '4K'].map((value) => `<button class="${state.settings.openaiSize === value ? 'active' : ''}" data-action="set-size" data-provider="openai" data-value="${esc(value)}">${esc(value)}</button>`).join('');
  } else if (mode === 'resolution' && key === 'google') {
    body = PROVIDER.google.baseResolutions.map((value) => `<button class="${state.settings.googleBaseResolution === value ? 'active' : ''}" data-action="set-google-base" data-value="${esc(value)}">${esc(value)}</button>`).join('');
  } else if (mode === 'resolution' && key === 'xai') {
    body = PROVIDER.xai.resolutions.map((value) => `<button class="${state.settings.xaiResolution === value ? 'active' : ''}" data-action="set-xai-resolution" data-value="${esc(value)}">${esc(value)}</button>`).join('');
  } else if (key === 'openai') {
    body = ['auto', '1:1', '5:4', '9:16', '16:9', '4:3', '3:2', '4:5', '3:4', '2:3', '21:9']
      .map((value) => `<button class="${state.settings.openaiAspectRatio === value ? 'active' : ''}" data-action="set-openai-ratio" data-value="${esc(value)}">${esc(value === 'auto' ? '自动比例' : value)}</button>`).join('');
  } else if (key === 'google') {
    const ratios = googleVersion(profile) === '3.1' ? PROVIDER.google.ratios31 : PROVIDER.google.ratios25;
    body = ratios.map((value) => `<button class="${state.settings.googleAspectRatio === value ? 'active' : ''}" data-action="set-google-ratio" data-value="${esc(value)}">${esc(value)}</button>`).join('');
  } else {
    body = PROVIDER.xai.ratios.map((value) => `<button class="${state.settings.xaiAspectRatio === value ? 'active' : ''}" data-action="set-xai-ratio" data-value="${esc(value)}">${esc(value)}</button>`).join('');
  }
  return `
    <div class="popover up-popover ratio-menu" style="${popoverStyle(rect, 280, 360)}">
      <div class="popover-title">${mode === 'resolution' ? '分辨率' : '自动比例'} · ${esc(PROVIDER[key]?.name || key)}</div>
      ${body}
    </div>
  `;
}
function renderAgentSizeModal(mode = 'ratio') {
  const profile = agentImageProfile();
  const key = providerKey(profile);
  const settings = agentImageSettings();
  const rect = state.popover?.rect || { left: 40, top: window.innerHeight - 160 };
  let body = '';
  if (mode === 'resolution') {
    body = agentImageResolutionOptions(profile).map((value) => {
      const active = String(value).toLowerCase() === String(agentImageResolutionValue(profile, settings)).toLowerCase();
      return `<button class="${active ? 'active' : ''}" data-action="set-agent-image-param" data-field="resolution" data-value="${esc(value)}">${esc(value)}</button>`;
    }).join('');
  } else {
    body = agentImageAspectOptions(profile).map((value) => {
      const active = String(value).toLowerCase() === String(agentImageAspectValue(profile, settings)).toLowerCase();
      return `<button class="${active ? 'active' : ''}" data-action="set-agent-image-param" data-field="aspectRatio" data-value="${esc(value)}">${esc(value === 'auto' ? '自动比例' : value)}</button>`;
    }).join('');
  }
  return `
    <div class="popover up-popover ratio-menu" style="${popoverStyle(rect, 280, 360)}">
      <div class="popover-title">Agent ${mode === 'resolution' ? '分辨率' : '比例'} · ${esc(PROVIDER[key]?.name || key)}</div>
      ${body}
    </div>
  `;
}
function renderAgentMessageMenu(pop) {
  const rect = pop.rect || { left: 40, top: 40, bottom: 80 };
  const message = agentMessages().find((item) => item.id === pop.messageId);
  return `
    <div class="popover up-popover agent-message-menu" style="${popoverStyle(rect, 190, 136)}">
      <button data-action="branch-agent-thread" data-id="${esc(pop.messageId || '')}">从此处创建分支</button>
      ${message?.retryInput ? `<button data-action="retry-agent-message" data-id="${esc(pop.messageId || '')}">重试这条问题</button>` : ''}
    </div>
  `;
}

function renderPromptRepo() {
  if (state.promptRepo.open && !String(state.promptRepo.query || '').trim() && !state.promptRepo.items?.length && promptBootstrapCache) {
    const pageData = pageDataFromPromptBootstrap(state.promptRepo.category || 'all');
    if (pageData) {
      applyPromptPageData(pageData, 1);
      state.promptRepo.loading = false;
      state.promptRepo.loadingLabel = '';
    }
  }
  const categories = state.promptRepo.categories?.length ? state.promptRepo.categories : ['all'];
  const activeCategory = state.promptRepo.category || 'all';
  const promptWindow = promptRepoVirtualWindow(state.promptRepo.items.length);
  const promptItems = state.promptRepo.items.slice(promptWindow.startIndex, promptWindow.endIndex);
  const isInitialLoading = !!state.promptRepo.loading && !state.promptRepo.items.length;
  const isAppending = !!state.promptRepo.loading && !!state.promptRepo.items.length;
  const loadingLabel = state.promptRepo.loadingLabel || (state.promptRepo.query ? '搜索提示词中...' : '加载提示词中...');
  return `
    <div class="modal-layer prompt-repo-layer">
      <div class="prompt-modal" role="dialog" aria-modal="true" aria-label="提示词仓库" tabindex="-1" data-stop>
        <div class="prompt-head">
          <div><strong>提示词仓库</strong><span>${esc(state.promptRepo.total || 0)} 条 · ${esc(activeCategory === 'all' ? '全部分类' : activeCategory)}</span></div>
          <input id="promptRepoSearch" value="${esc(state.promptRepo.query || '')}" placeholder="搜索中文关键词、标题或提示词..." data-action="prompt-search" autocomplete="off" spellcheck="false">
          <button class="toolbar-button" data-action="close-prompt-repo">关闭</button>
        </div>
        <div class="prompt-repo-body">
          <aside class="prompt-categories" id="promptCategories" aria-label="提示词分类">
            ${categories.map((cat) => `<button class="${cat === activeCategory ? 'active' : ''}" data-action="prompt-category" data-cat="${esc(cat)}">${esc(cat === 'all' ? '全部' : cat)}</button>`).join('')}
            ${state.promptRepo.categoriesLoading ? '<div class="prompt-category-loading">分类加载中...</div>' : ''}
          </aside>
          <div class="prompt-list ${promptWindow.shouldVirtualize ? 'is-virtual' : ''}" id="promptList" data-virtual="${promptWindow.shouldVirtualize ? '1' : '0'}">
            ${promptWindow.topPad ? `<div class="prompt-spacer" style="height:${esc(promptWindow.topPad)}px"></div>` : ''}
            ${isInitialLoading ? `<div class="prompt-status-row">${esc(loadingLabel)}</div>${renderPromptSkeletonCards()}` : promptItems.map((item, index) => renderPromptCard(item, promptWindow.startIndex + index)).join('')}
            ${isAppending ? '<div class="prompt-loading-row">继续加载提示词...</div>' : ''}
            ${(!state.promptRepo.loading && !state.promptRepo.items.length) ? '<div class="prompt-empty">没有匹配的提示词</div>' : ''}
            ${promptWindow.bottomPad ? `<div class="prompt-spacer" style="height:${esc(promptWindow.bottomPad)}px"></div>` : ''}
          </div>
        </div>
      </div>
      <div id="promptRepoOverlays">${renderPromptRepoOverlays()}</div>
    </div>
  `;
}
function renderPromptRepoOverlays() {
  return `
    ${state.promptRepo.detail ? renderPromptDetail(state.promptRepo.detail) : ''}
    ${state.promptRepo.imageViewer ? `<div class="viewer-layer" role="dialog" aria-modal="true" aria-label="提示词大图" data-action="prompt-image-close"><button class="viewer-close" aria-label="关闭" data-action="prompt-image-close">×</button><img class="viewer-image" src="${esc(state.promptRepo.imageViewer)}" alt=""></div>` : ''}
  `;
}
function syncPromptRepoView() {
  if (!state.promptRepo?.open) return false;
  const mount = $('#promptRepoMount');
  if (!mount) return false;
  const focusState = captureFocusState();
  const viewportSnapshot = capturePromptRepoViewportSnapshot();
  mount.innerHTML = renderPromptRepo();
  bindPromptRepoTransientEvents();
  restoreFocusState(focusState);
  restorePromptRepoViewportSnapshot({
    ...viewportSnapshot,
    categoryScrollTop: state.promptRepo.categoryScrollTop || viewportSnapshot.categoryScrollTop || 0
  });
  return true;
}
function syncPromptRepoOverlays() {
  if (!state.promptRepo?.open) return false;
  const host = $('#promptRepoOverlays');
  if (!host) return false;
  host.innerHTML = renderPromptRepoOverlays();
  return true;
}
function focusPromptRepoOverlay() {
  nextRenderFrame(() => {
    const target = $('.size-modal') || $('.viewer-close') || $('#promptRepoOverlays');
    if (target?.focus) {
      try { target.focus({ preventScroll: true }); } catch { target.focus(); }
    }
  });
}
function focusPromptRepoShell() {
  nextRenderFrame(() => {
    const target = $('.prompt-modal') || $('#promptRepoSearch') || $('#promptList');
    if (target?.focus) {
      try { target.focus({ preventScroll: true }); } catch { target.focus(); }
    }
  });
}
function renderPromptSkeletonCards(count = 12) {
  return Array.from({ length: count }, () => `
    <div class="prompt-card prompt-skeleton" aria-hidden="true">
      <span class="prompt-skeleton-media"></span>
      <span class="prompt-skeleton-line strong"></span>
      <span class="prompt-skeleton-line"></span>
      <span class="prompt-skeleton-line short"></span>
    </div>
  `).join('');
}
function promptRepoVirtualWindow(totalItems) {
  const width = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
  const columns = width <= 700 ? 1 : width <= 1040 ? 2 : 3;
  const rowHeight = width <= 700 ? 230 : 252;
  const scrollTop = Math.max(0, Number(state.promptRepo.scrollTop) || 0);
  const viewportHeight = Math.max(320, Number(state.promptRepo.viewportHeight) || 620);
  const shouldVirtualize = totalItems > PROMPT_VIRTUAL_THRESHOLD;
  if (!shouldVirtualize) return { shouldVirtualize, startIndex: 0, endIndex: totalItems, topPad: 0, bottomPad: 0 };
  const totalRows = Math.ceil(totalItems / columns);
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - PROMPT_VIRTUAL_BUFFER_ROWS);
  const visibleRows = Math.ceil(viewportHeight / rowHeight) + PROMPT_VIRTUAL_BUFFER_ROWS * 2;
  const endRow = Math.min(totalRows, startRow + visibleRows);
  return {
    shouldVirtualize,
    startIndex: startRow * columns,
    endIndex: Math.min(totalItems, endRow * columns),
    topPad: startRow * rowHeight,
    bottomPad: Math.max(0, (totalRows - endRow) * rowHeight)
  };
}
function promptItemImageSource(item) {
  const images = Array.isArray(item?.images) ? item.images : [];
  const nestedImage = images.map((image) => firstDefined(image?.url, image?.image_url, image?.imageUrl, image?.src, image?.href)).find(Boolean);
  return firstDefined(item?.i, item?.image_url, item?.imageUrl, item?.src, nestedImage) || '';
}
function normalizePromptImageUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value, window.location.href);
    return parsed.href;
  } catch {}
  try { return encodeURI(value); } catch { return value; }
}
function promptThumbUrl(originalUrl) {
  const normalized = normalizePromptImageUrl(originalUrl);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized, window.location.href);
    const isLeaderOss = parsed.hostname === 'cdn.leaderai.top' && parsed.pathname.includes('/oss/');
    if (!isLeaderOss || parsed.search.includes('x-oss-process=')) return normalized;
    return `${normalized}${normalized.includes('?') ? '&' : '?'}x-oss-process=image/resize,w_420/quality,q_75/format,webp`;
  } catch {
    return normalized;
  }
}
function renderPromptCard(item, index = 0) {
  const originalUrl = normalizePromptImageUrl(promptItemImageSource(item));
  const imageUrl = promptThumbUrl(originalUrl);
  const fetchPriority = index < 12 ? 'high' : 'low';
  return `
    <button class="prompt-card" data-action="prompt-detail" data-id="${esc(item.id)}" data-index="${esc(index)}">
      ${imageUrl ? `
        <span class="prompt-card-media">
          <img src="${esc(imageUrl)}" data-original-src="${esc(originalUrl)}" referrerpolicy="no-referrer" loading="${index < 12 ? 'eager' : 'lazy'}" decoding="sync" fetchpriority="${fetchPriority}" width="420" height="263" alt="" onerror="var f=this.dataset.originalSrc;if(f&&this.src!==f){this.src=f;this.dataset.originalSrc='';return;}var c=this.closest('.prompt-card');if(c)c.classList.add('image-failed');this.remove();">
          <span class="prompt-image-fallback">预览图加载失败</span>
        </span>
      ` : ''}
      <strong>${esc(item.t || '未命名提示词')}</strong>
      <p>${esc(item.p || '')}</p>
    </button>
  `;
}
function renderPromptDetail(item) {
  const imageUrl = normalizePromptImageUrl(promptItemImageSource(item));
  return `
    <div class="modal-layer" style="background:rgba(0,0,0,.18)" data-action="prompt-detail-close">
      <div class="size-modal" role="dialog" aria-modal="true" aria-label="提示词详情" tabindex="-1" data-stop>
        <button class="modal-close" aria-label="关闭" data-action="prompt-detail-close">×</button>
        <h2>${esc(item.t || '提示词详情')}</h2>
        ${imageUrl ? `<img src="${esc(imageUrl)}" referrerpolicy="no-referrer" loading="eager" decoding="async" data-action="prompt-image-view" style="width:100%;max-height:320px;object-fit:contain;border-radius:18px;background:rgba(0,0,0,.05)" alt="">` : ''}
        <p style="line-height:1.7;white-space:pre-wrap">${esc(item.p || '')}</p>
        <div class="detail-actions"><button class="reuse" data-action="use-prompt" data-id="${esc(item.id)}">使用提示词</button></div>
      </div>
    </div>
  `;
}

function renderWorkflowInvokeModal() {
  const invoke = state.workflowInvoke;
  const workflow = state.agent.workflows.find((item) => item.id === invoke.workflowId) || invoke.workflow;
  const columns = workflow?.variables?.columns || invoke.columns || [];
  const rows = invoke.rows || workflow?.variables?.rows || [];
  const totalImages = Math.max(0, rows.length) * Math.max(1, Number(invoke.countPerRow) || 1);
  return `
    <div class="modal-layer" data-action="close-workflow-invoke">
      <div class="workflow-invoke-modal" data-stop>
        <button class="modal-close" data-action="close-workflow-invoke">×</button>
        <div class="workflow-editor-head">
          <div>
            <div class="detail-section-label">调用工作流</div>
            <h2>${esc(workflow?.name || '未命名工作流')}</h2>
            <p class="project-meta">像 skill 一样复用当前项目工作流。确认变量、预算和并发后才会开始批量生图。</p>
          </div>
          <div class="workflow-estimate">预计 ${esc(totalImages)} 张</div>
        </div>
        <div class="workflow-settings-grid">
          <label class="control-chip"><small>每行数量</small><input type="number" min="1" max="8" value="${esc(invoke.countPerRow || 1)}" data-action="workflow-invoke-number" data-field="countPerRow"></label>
          <label class="control-chip"><small>并发</small><input type="number" min="1" max="5" value="${esc(invoke.concurrency || 2)}" data-action="workflow-invoke-number" data-field="concurrency"></label>
          <label class="control-chip"><small>最大步骤</small><input type="number" min="1" max="20" value="${esc(invoke.maxSteps || 5)}" data-action="workflow-invoke-number" data-field="maxSteps"></label>
          <label class="control-chip"><small>最大图片</small><input type="number" min="1" max="80" value="${esc(invoke.maxImages || 8)}" data-action="workflow-invoke-number" data-field="maxImages"></label>
          <label class="control-chip workflow-toggle"><small>失败后继续</small><input type="checkbox" ${invoke.continueOnStepError ? 'checked' : ''} data-action="workflow-invoke-check" data-field="continueOnStepError"></label>
        </div>
        <div class="workflow-ref-panel">
          <div class="detail-section-label">本次运行参考图</div>
          <div class="workflow-ref-strip">
            ${(invoke.references || []).map((ref) => `<div class="ref-thumb"><img data-workflow-ref-id="${esc(ref.id)}" alt=""><button data-action="remove-workflow-ref" data-id="${esc(ref.id)}">×</button></div>`).join('')}
            <button class="workflow-ref-add" data-action="pick-workflow-ref">+ 上传参考图</button>
          </div>
          <p class="project-meta">这些参考图只用于本次运行，所有变量行共享，不写入工作流模板。</p>
        </div>
        <div class="detail-section-label">变量表</div>
        ${renderWorkflowRowsTable(columns, rows, 'invoke')}
        <div class="detail-actions">
          <button class="reuse" data-action="execute-workflow">确认执行</button>
          <button class="delete" data-action="close-workflow-invoke">取消</button>
        </div>
      </div>
    </div>
  `;
}

function renderMaskEditor() {
  const editor = state.maskEditor;
  const refs = state.references;
  const active = refs.find((ref) => ref.id === editor.activeRefId) || refs[0];
  return `
    <section class="mask-layer">
      <div class="mask-topbar">
        <button class="mask-close" data-action="close-mask-editor" style="position:static">×</button>
        <div class="mask-title">编辑遮罩</div>
        <div class="mask-info" title="根据官方说明，此功能仅辅助限定修改区域">i</div>
        <div class="mask-tip">根据官方文档说明，此功能仅基于提示词，无法完全控制模型编辑区域。建议附加类似“只编辑涂抹区域”的提示词以提升遵循程度。</div>
        <button class="mask-save" data-action="save-mask-editor">保存</button>
      </div>
      <div class="mask-body">
        <div class="mask-refs">
          ${refs.map((ref) => `<button class="mask-ref ${ref.id === active?.id ? 'active' : ''}" data-action="switch-mask-ref" data-id="${esc(ref.id)}"><img data-ref-id="${esc(ref.id)}" alt=""></button>`).join('')}
        </div>
        <div class="mask-canvas-wrap"><div class="mask-canvas-shell ${editor.tool === 'eraser' ? 'is-eraser' : 'is-brush'}" style="--mask-cursor-size:${esc(editor.brushSize || 64)}px;--mask-cursor-color:${esc(editor.color || BRUSH_COLORS[0].value)}"><canvas id="maskBaseCanvas"></canvas><canvas id="maskCanvas"></canvas><div class="mask-cursor" id="maskCursor"></div></div></div>
      </div>
      <div class="mask-tools">
        <button class="tool-button ${editor.tool === 'brush' ? 'active' : ''}" data-action="mask-tool" data-tool="brush">笔</button>
        <button class="tool-button ${editor.tool === 'eraser' ? 'active' : ''}" data-action="mask-tool" data-tool="eraser">擦</button>
        <input class="brush-size" type="number" min="4" max="160" value="${esc(editor.brushSize || 64)}" data-action="mask-size">
        ${BRUSH_COLORS.map((c) => `<button class="color-button ${editor.color === c.value ? 'active' : ''}" title="${c.name}" style="background:${c.value}" data-action="mask-color" data-color="${c.value}"></button>`).join('')}
        <button class="tool-button" data-action="mask-undo">↶</button>
        <button class="tool-button" data-action="mask-redo">↷</button>
        <button class="tool-button" data-action="mask-clear">清</button>
      </div>
    </section>
  `;
}

function bindTransientEvents() {
  const promptInput = $('#promptInput');
  if (promptInput) {
    autoGrow(promptInput);
    promptInput.addEventListener('input', (event) => {
      state.composerPrompt = event.target.value;
      autoGrow(event.target);
      scheduleStoreWrite();
    });
    promptInput.addEventListener('paste', handlePaste);
    promptInput.addEventListener('keydown', (event) => {
      const submit = state.preferences?.enterSubmit ? event.key === 'Enter' && !event.shiftKey : event.key === 'Enter' && (event.ctrlKey || event.metaKey);
      if (!submit) return;
      event.preventDefault();
      generateImageTask();
    });
  }
  const refInput = $('#refFileInput');
  if (refInput) {
    refInput.addEventListener('change', async () => {
      await addFilesAsReferences([...refInput.files]);
      refInput.value = '';
    });
  }
  const proFileInput = $('#proFileInput');
  if (proFileInput) {
    proFileInput.addEventListener('change', async () => {
      await addFilesAsProReferences([...proFileInput.files], state.proFileTarget || 'base');
      state.proFileTarget = '';
      proFileInput.value = '';
    });
  }
  const workflowRefInput = $('#workflowRefInput');
  if (workflowRefInput) {
    workflowRefInput.addEventListener('change', async () => {
      await addFilesAsWorkflowReferences([...workflowRefInput.files]);
      workflowRefInput.value = '';
    });
  }
  const agentAttachmentInput = $('#agentAttachmentInput');
  if (agentAttachmentInput) {
    agentAttachmentInput.addEventListener('change', async () => {
      await addAgentAttachments([...agentAttachmentInput.files]);
      agentAttachmentInput.value = '';
    });
  }
  const composer = $('#composer');
  if (composer) {
    composer.addEventListener('dragover', (event) => { event.preventDefault(); composer.classList.add('dragging'); });
    composer.addEventListener('dragleave', () => composer.classList.remove('dragging'));
    composer.addEventListener('drop', async (event) => {
      event.preventDefault();
      composer.classList.remove('dragging');
      await addFilesAsReferences([...event.dataTransfer.files].filter((file) => file.type.startsWith('image/')));
    });
  }
  bindPromptRepoTransientEvents();
  const gallerySearch = $('[data-action="search-gallery"]');
  if (gallerySearch) {
    gallerySearch.addEventListener('compositionstart', () => { state.gallerySearchComposing = true; });
    gallerySearch.addEventListener('compositionend', (event) => {
      state.gallerySearchComposing = false;
      state.promptQuery = event.target.value;
      renderGalleryListOnly();
    });
  }
  const galleryScroll = $('.gallery-scroll');
  if (galleryScroll) {
    state.galleryVirtual = {
      ...(state.galleryVirtual || {}),
      scrollTop: galleryScroll.scrollTop || state.galleryVirtual?.scrollTop || 0,
      viewportHeight: galleryScroll.clientHeight || state.galleryVirtual?.viewportHeight || 720
    };
    galleryScroll.addEventListener('scroll', () => {
      if (state.imageContextMenu) {
        state.imageContextMenu = null;
        $('.image-menu-layer')?.remove();
      }
      state.galleryVirtual = { ...(state.galleryVirtual || {}), scrollTop: galleryScroll.scrollTop || 0, viewportHeight: galleryScroll.clientHeight || 720 };
      if (galleryScroll.dataset.virtual === '1') scheduleGalleryVirtualRender();
    }, { passive: true });
  }
  if (state.maskEditor) setupMaskCanvas();
  const agentInput = $('#agentInput');
  if (agentInput) {
    autoGrow(agentInput);
    agentInput.addEventListener('input', (event) => {
      state.agent.inputDraft = event.target.value;
      autoGrow(event.target);
    });
    agentInput.addEventListener('paste', handlePaste);
    agentInput.addEventListener('keydown', (event) => {
      const submit = state.preferences?.enterSubmit ? event.key === 'Enter' && !event.shiftKey : event.key === 'Enter' && (event.ctrlKey || event.metaKey);
      if (!submit) return;
      event.preventDefault();
      sendAgentChat();
    });
  }
  const agentComposer = $('#agentComposer');
  if (agentComposer) {
    agentComposer.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      state.agent.attachmentDragActive = true;
      agentComposer.classList.add('is-dragging');
    });
    agentComposer.addEventListener('dragleave', (event) => {
      if (agentComposer.contains(event.relatedTarget)) return;
      state.agent.attachmentDragActive = false;
      agentComposer.classList.remove('is-dragging');
    });
    agentComposer.addEventListener('drop', async (event) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      state.agent.attachmentDragActive = false;
      agentComposer.classList.remove('is-dragging');
      await addAgentAttachments([...event.dataTransfer.files]);
    });
  }
  const agentLog = $('.agent-log');
  if (agentLog) agentLog.addEventListener('scroll', captureAgentScrollState, { passive: true });
}
function bindPromptRepoTransientEvents() {
  const promptList = $('#promptList');
  if (promptList && !promptList.dataset.boundPromptRepo) {
    promptList.dataset.boundPromptRepo = '1';
    promptList.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('.prompt-card')) return;
      state.promptRepo.pointerOpenSnapshot = capturePromptRepoViewportSnapshot();
    }, { passive: true });
    promptList.addEventListener('mousedown', (event) => {
      if (!event.target.closest('.prompt-card')) return;
      state.promptRepo.pointerOpenSnapshot = capturePromptRepoViewportSnapshot();
      event.preventDefault();
    });
    promptList.addEventListener('scroll', () => {
      state.promptRepo.scrollTop = promptList.scrollTop;
      state.promptRepo.viewportHeight = promptList.clientHeight || state.promptRepo.viewportHeight || 620;
      if (Date.now() < (state.promptRepo.scrollLockUntil || 0)) return;
      if (promptList.scrollTop + promptList.clientHeight > promptList.scrollHeight - 320) loadPromptPage();
    }, { passive: true });
  }
  const promptCategories = $('#promptCategories');
  if (promptCategories) {
    promptCategories.scrollTop = state.promptRepo.categoryScrollTop || 0;
    if (!promptCategories.dataset.boundPromptRepo) {
      promptCategories.dataset.boundPromptRepo = '1';
      const captureCategoryScroll = (event) => {
        if (!event.target.closest('[data-action="prompt-category"]')) return;
        state.promptRepo.pendingCategoryScrollTop = promptCategories.scrollTop || 0;
        state.promptRepo.categoryScrollTop = promptCategories.scrollTop || 0;
      };
      promptCategories.addEventListener('pointerdown', captureCategoryScroll, { passive: true });
      promptCategories.addEventListener('mousedown', captureCategoryScroll, { passive: true });
      promptCategories.addEventListener('scroll', () => {
        state.promptRepo.categoryScrollTop = promptCategories.scrollTop;
      }, { passive: true });
    }
  }
  const promptRepoSearch = $('#promptRepoSearch');
  if (promptRepoSearch && !promptRepoSearch.dataset.boundPromptRepo) {
    promptRepoSearch.dataset.boundPromptRepo = '1';
    promptRepoSearch.addEventListener('compositionstart', () => {
      state.promptRepo.composing = true;
    });
    promptRepoSearch.addEventListener('compositionend', (event) => {
      state.promptRepo.composing = false;
      state.promptRepo.query = event.target.value;
      debouncedPromptSearch(360);
    });
  }
  flushPromptRepoViewportRestore();
}

document.addEventListener('contextmenu', (event) => {
  const img = event.target.closest?.('img[data-image-kind], img[data-task-ref-task-id]');
  if (!img) return;
  const menu = imageContextFromElement(img, event);
  if (!menu) return;
  event.preventDefault();
  state.imageContextMenu = menu;
  render();
});
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('scroll', () => {
    if (!state.imageContextMenu) return;
    state.imageContextMenu = null;
    render();
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (!state.imageContextMenu) return;
    state.imageContextMenu = null;
    render();
  }, { passive: true });
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) {
    if (state.popover && !event.target.closest('.popover')) { state.popover = null; render(); }
    if (state.imageContextMenu && !event.target.closest('.image-context-menu')) { state.imageContextMenu = null; render(); }
    if (state.accountMenuOpen) { state.accountMenuOpen = false; render(); }
    return;
  }
  if (target.dataset.action === 'close-modal-bg' && !shouldCloseModalFromClick(target, event.target)) return;
  if (target.dataset.action === 'cancel-workflow-draft' && target.classList?.contains('modal-layer') && !shouldCloseModalFromClick(target, event.target)) return;
  if (target.dataset.action === 'cancel-confirm' && target.classList?.contains('modal-layer')) {
    if (event.target.closest?.('[data-stop]')) return;
    closeConfirmDialog(null);
    return;
  }
  if (target.dataset.action === 'close-entry-advanced' && target.classList?.contains('modal-layer') && event.target.closest?.('[data-stop]')) return;
  const action = target.dataset.action;
  if (state.imageContextMenu && !['copy-image', 'download-image', 'edit-image-source', 'close-image-menu'].includes(action)) {
    state.imageContextMenu = null;
  }
  if (action === 'close-image-menu') { state.imageContextMenu = null; render(); return; }
  if (action === 'copy-image') { await copyImageFromMenu(); state.imageContextMenu = null; render(); return; }
  if (action === 'download-image') { await downloadImageFromMenuOrTarget(target); state.imageContextMenu = null; render(); return; }
  if (action === 'edit-image-source') { await editImageFromMenu(); return; }
  if (action === 'set-mode') { state.mode = target.dataset.mode; if (state.mode === 'workflow') state.agent.view = 'workflows'; persistRender(); return; }
  if (action === 'agent-view') { state.agent.view = target.dataset.view || 'chat'; persistRender(); return; }
  if (action === 'toggle-project-prompt') { state.agent.promptOpen = !state.agent.promptOpen; persistRender(); return; }
  if (action === 'open-agent-project-menu') {
    state.popover = { type: 'agent-project-menu', rect: target.getBoundingClientRect() };
    render();
    return;
  }
  if (action === 'agent-project-switch') {
    state.agent.activeProjectId = target.dataset.id;
    ensureAgentProjectThread(target.dataset.id);
    state.popover = null;
    state.agentScrollIntent = 'force-bottom';
    persistRender();
    return;
  }
  if (action === 'agent-project-new') {
    state.popover = null;
    await newProject();
    return;
  }
  if (action === 'agent-project-rename') {
    state.popover = null;
    await renameActiveProject();
    return;
  }
  if (action === 'agent-project-edit-prompt') {
    state.popover = null;
    await editActiveProjectPrompt();
    return;
  }
  if (action === 'agent-project-delete') {
    state.popover = null;
    deleteProject();
    return;
  }
  if (action === 'open-agent-thread-menu') {
    state.popover = { type: 'agent-thread-menu', rect: target.getBoundingClientRect() };
    render();
    return;
  }
  if (action === 'agent-thread-select') {
    setActiveAgentThread(state.agent.activeProjectId, target.dataset.id);
    state.popover = null;
    state.agentScrollIntent = 'force-bottom';
    persistRender();
    return;
  }
  if (action === 'agent-thread-new') {
    createAgentThread(state.agent.activeProjectId, newAgentThreadTitle());
    state.popover = null;
    state.agentScrollIntent = 'force-bottom';
    persistRender();
    return;
  }
  if (action === 'agent-thread-delete') {
    state.popover = null;
    confirmDeleteAgentThread(target.dataset.id);
    return;
  }
  if (action === 'switch-agent-thread') {
    setActiveAgentThread(state.agent.activeProjectId, target.value);
    state.agentScrollIntent = 'force-bottom';
    persistRender();
    return;
  }
  if (action === 'clear-agent-thread') { await clearActiveAgentThread(); return; }
  if (action === 'pro-mode') { setProMode(target.dataset.mode); return; }
  if (action === 'switch-profile') {
    state.activeImageProfileId = target.value || target.dataset.value || state.activeImageProfileId;
    state.activeProfileId = state.activeImageProfileId;
    state.popover = null;
    writeComposerSessionSettings();
    persistRender();
    return;
  }
  if (action === 'entry-profile-select') {
    const entry = target.dataset.entry;
    const value = target.value;
    if (entry === 'pro') state.pro.profileId = value;
    else {
      state.activeImageProfileId = value;
      state.activeProfileId = value;
      writeComposerSessionSettings();
    }
    persistRender();
    return;
  }
  if (action === 'toggle-entry-advanced') {
    const adv = entryAdvanced(target.dataset.entry || currentEntryKey());
    adv.open = !adv.open;
    writeEntryAdvanced(target.dataset.entry || currentEntryKey());
    persistRender();
    return;
  }
  if (action === 'open-entry-advanced') { state.entryAdvancedModal = target.dataset.entry || currentEntryKey(); render(); return; }
  if (action === 'close-entry-advanced') { state.entryAdvancedModal = null; render(); return; }
  if (action === 'switch-project') {
    state.agent.activeProjectId = target.value;
    ensureAgentProjectThread(target.value);
    state.agentScrollIntent = 'force-bottom';
    persistRender();
    return;
  }
  if (action === 'new-project') { await newProject(); return; }
  if (action === 'delete-project') { deleteProject(); return; }
  if (action === 'new-workflow-draft') { newWorkflowDraft(); return; }
  if (action === 'save-workflow-draft') { saveWorkflowDraft(); return; }
  if (action === 'cancel-workflow-draft') { state.workflowDraft = null; render(); return; }
  if (action === 'invoke-workflow') { openWorkflowInvoke(target.dataset.id); return; }
  if (action === 'edit-workflow') { editWorkflow(target.dataset.id); return; }
  if (action === 'duplicate-workflow') { duplicateWorkflow(target.dataset.id); return; }
  if (action === 'delete-workflow') { deleteWorkflow(target.dataset.id); return; }
  if (action === 'close-workflow-invoke') { state.workflowInvoke = null; render(); return; }
  if (action === 'pick-workflow-ref') { $('#workflowRefInput')?.click(); return; }
  if (action === 'remove-workflow-ref') { await removeWorkflowReference(target.dataset.id); return; }
  if (action === 'add-workflow-row') { addWorkflowRow(target.dataset.scope); return; }
  if (action === 'delete-workflow-row') { deleteWorkflowRow(target.dataset.scope, Number(target.dataset.rowIndex)); return; }
  if (action === 'execute-workflow') { await executeWorkflowInvoke(); return; }
  if (action === 'agent-web') {
    const profile = agentTextProfile();
    if (!state.agentConfig?.webSearchEnabled) { toast('后台未开启 Agent 联网'); return; }
    if (!agentWebSearchSupported(profile)) { toast('当前文本模型不支持官方联网搜索'); return; }
    state.agent.webMode = state.agent.webMode === 'off' ? 'on' : 'off';
    persistRender();
    return;
  }
  if (action === 'agent-reason') {
    const order = ['low', 'medium', 'high'];
    const idx = order.indexOf(state.agent.reasoning || 'medium');
    state.agent.reasoning = order[(idx + 1) % order.length];
    persistRender();
    return;
  }
  if (action === 'set-agent-image-param') { setAgentImageParam(target.dataset.field, target.dataset.value); return; }
  if (action === 'open-agent-image-advanced') { state.entryAdvancedModal = 'agent'; render(); return; }
  if (action === 'theme') { toggleTheme(); return; }
  if (action === 'account-menu') { state.accountMenuOpen = !state.accountMenuOpen; render(); return; }
  if (action === 'leave') { leavePage(target.dataset.url); return; }
  if (action === 'open-agent-message-menu') {
    state.popover = { type: 'agent-message-menu', rect: target.getBoundingClientRect(), messageId: target.dataset.id };
    render();
    return;
  }
  if (action === 'branch-agent-thread') {
    branchActiveThreadFromMessage(target.dataset.id);
    state.popover = null;
    state.agentScrollIntent = 'force-bottom';
    persistRender();
    return;
  }
  if (action === 'retry-agent-message') {
    state.popover = null;
    await retryAgentMessage(target.dataset.id);
    return;
  }
  if (action === 'search-gallery') return;
  if (action === 'pick-reference') { $('#refFileInput')?.click(); return; }
  if (action === 'remove-ref') { await removeReference(target.dataset.id); return; }
  if (action === 'toggle-composer') { state.composerExpanded = !state.composerExpanded; persistRender(); return; }
  if (action === 'toggle-mobile-params') { state.mobileParamsOpen = !state.mobileParamsOpen; persistRender(); return; }
  if (action === 'open-popover') { state.popover = { type: target.dataset.popover, rect: target.getBoundingClientRect() }; render(); return; }
  if (action === 'set-popover-value') { setPopoverValue(target.dataset.type, target.dataset.value); return; }
  if (action === 'open-agent-popover') { state.popover = { type: target.dataset.popover, rect: target.getBoundingClientRect() }; render(); return; }
  if (action === 'set-agent-popover-value') { setAgentPopoverValue(target.dataset.type, target.dataset.value); return; }
  if (action === 'open-size-modal') { state.popover = { type: 'size', rect: target.getBoundingClientRect() }; render(); return; }
  if (action === 'open-resolution-modal') { state.popover = { type: 'resolution', rect: target.getBoundingClientRect() }; render(); return; }
  if (action === 'open-agent-size-modal') { state.popover = { type: 'agent-size', rect: target.getBoundingClientRect() }; render(); return; }
  if (action === 'open-agent-resolution-modal') { state.popover = { type: 'agent-resolution', rect: target.getBoundingClientRect() }; render(); return; }
  if (action === 'close-popover') { state.popover = null; render(); return; }
  if (action === 'set-size') { state.settings.openaiSize = target.dataset.value; state.popover = null; writeComposerSessionSettings(); persistRender(); return; }
  if (action === 'set-openai-ratio') { state.settings.openaiAspectRatio = target.dataset.value; state.popover = null; writeComposerSessionSettings(); persistRender(); return; }
  if (action === 'set-google-base') { state.settings.googleBaseResolution = target.dataset.value; state.popover = null; writeComposerSessionSettings(); persistRender(); return; }
  if (action === 'set-google-ratio') { state.settings.googleAspectRatio = target.dataset.value; state.popover = null; writeComposerSessionSettings(); persistRender(); return; }
  if (action === 'set-xai-resolution') { state.settings.xaiResolution = target.dataset.value; state.popover = null; writeComposerSessionSettings(); persistRender(); return; }
  if (action === 'set-xai-ratio') { state.settings.xaiAspectRatio = target.dataset.value; state.popover = null; writeComposerSessionSettings(); persistRender(); return; }
  if (action === 'open-model-config') { state.popover = { type: 'model-config', rect: target.getBoundingClientRect() }; render(); return; }
  if (action === 'open-agent-model-config') { state.popover = { type: 'agent-model-config', rect: target.getBoundingClientRect() }; render(); return; }
  if (action === 'generate') { await generateImageTask(); return; }
  if (action === 'pro-pick-file') { state.proFileTarget = target.dataset.slot || 'base'; $('#proFileInput')?.click(); return; }
  if (action === 'pro-remove-ref') { await removeProReference(target.dataset.id); return; }
  if (action === 'pro-analyze') { await analyzeProWorkbench(); return; }
  if (action === 'pro-use-analysis') { applyProAnalysis(); return; }
  if (action === 'pro-render') { await renderProWorkbenchTask(); return; }
  if (action === 'pro-option') {
    state.pro.params[target.dataset.field] = target.dataset.value;
    persistRender();
    return;
  }
  if (action === 'pro-toggle-list') {
    const field = target.dataset.field;
    const value = target.dataset.value;
    const list = Array.isArray(state.pro.params[field]) ? state.pro.params[field] : [];
    state.pro.params[field] = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
    persistRender();
    return;
  }
  if (action === 'toggle-pro-advanced') { state.pro.advancedOpen = !state.pro.advancedOpen; persistRender(); return; }
  if (action === 'toggle-select') { event.preventDefault(); event.stopPropagation(); toggleSelect(target.dataset.id); return; }
  if (action === 'select-all') { state.selectedTaskIds = filteredTasks().map((t) => t.id); persistRender(); return; }
  if (action === 'delete-selected') { await deleteSelected(); return; }
  if (action === 'copy-dialog-link') { await copyConfirmDialogValue(); return; }
  if (action === 'cancel-confirm') { closeConfirmDialog(null); return; }
  if (action === 'confirm-dialog') { await runConfirmDialog(); return; }
  if (action === 'download-selected') { await downloadSelected(); return; }
  if (action === 'open-detail') { state.modal = target.dataset.id; render(); return; }
  if (action === 'close-modal' || action === 'close-modal-bg') { state.modal = null; render(); return; }
  if (action === 'detail-image-prev' || action === 'detail-image-next' || action === 'detail-image-select') { setDetailImage(target.dataset.id, action === 'detail-image-select' ? Number(target.dataset.index) : action === 'detail-image-next' ? 1 : -1, action !== 'detail-image-select'); return; }
  if (action === 'open-task-reference-viewer') { event.preventDefault(); event.stopPropagation(); openTaskReferenceViewer(target.dataset.taskId, Number(target.dataset.refIndex) || 0); return; }
  if (action === 'open-viewer') { state.viewer = { taskId: target.dataset.taskId, index: Number(target.dataset.index) || 0 }; render(); return; }
  if (action === 'viewer-image') { return; }
  if (action === 'viewer-prev' || action === 'viewer-next') { setViewerImage(action === 'viewer-next' ? 1 : -1); return; }
  if (action === 'close-viewer') { state.viewer = null; render(); return; }
  if (action === 'reuse-task') { reuseTask(target.dataset.id); return; }
  if (action === 'retry-task') { await retryTask(target.dataset.id); return; }
  if (action === 'top-up-task') { await topUpTask(target.dataset.id); return; }
  if (action === 'delete-task') { await deleteTask(target.dataset.id); return; }
  if (action === 'favorite-task') { favoriteTask(target.dataset.id); return; }
  if (action === 'edit-output') { await editOutput(target.dataset.id); return; }
  if (action === 'open-mask-editor') { await handleReferenceEditAction(target.dataset.refIdOpen); return; }
  if (action === 'close-mask-editor') { state.maskEditor = null; render(); return; }
  if (action === 'switch-mask-ref') { await switchMaskRef(target.dataset.id); return; }
  if (action === 'mask-tool') { setMaskTool(target.dataset.tool); return; }
  if (action === 'mask-color') { setMaskColor(target.dataset.color); return; }
  if (action === 'mask-undo') { maskUndo(); return; }
  if (action === 'mask-redo') { maskRedo(); return; }
  if (action === 'mask-clear') { await maskClear(); return; }
  if (action === 'save-mask-editor') { await saveMaskEditor(); return; }
  if (action === 'open-prompt-repo') { openPromptRepo(); return; }
  if (action === 'close-prompt-repo') { state.promptRepo.open = false; state.promptRepo.detail = null; render(); return; }
  if (action === 'prompt-category') { setPromptCategory(target.dataset.cat || 'all'); return; }
  if (action === 'prompt-detail') {
    const index = Number(target.dataset.index);
    const item = Number.isFinite(index) ? state.promptRepo.items[index] : state.promptRepo.items.find((p) => String(p.id) === String(target.dataset.id));
    if (!item) return;
    const snapshot = consumePromptRepoPointerSnapshot() || capturePromptRepoViewportSnapshot();
    state.promptRepo.detailReturnSnapshot = snapshot;
    state.promptRepo.detail = item;
    if (!syncPromptRepoOverlays()) render();
    focusPromptRepoOverlay();
    stabilizePromptRepoViewport(snapshot);
    if (item?.partial) hydratePromptDetailItem(item);
    return;
  }
  if (action === 'prompt-detail-close') { closePromptRepoDetailOverlay(); return; }
  if (action === 'use-prompt') { await usePrompt(target.dataset.id); return; }
  if (action === 'prompt-image-view') { state.promptRepo.imageViewer = target.currentSrc || target.src; if (!syncPromptRepoOverlays()) render(); return; }
  if (action === 'prompt-image-close') { closePromptRepoImageViewerOverlay(); return; }
  if (action === 'agent-pick-attachment') { $('#agentAttachmentInput')?.click(); return; }
  if (action === 'agent-remove-attachment') { await removeAgentAttachment(target.dataset.id); return; }
  if (action === 'agent-chat') { await sendAgentChat(); return; }
  if (action === 'copy-agent-code') {
    await copyTextValue(target.dataset.copyText || '', '代码已复制');
    return;
  }
  if (action === 'copy-agent-prompt') {
    const message = agentMessageById(target.dataset.messageId);
    const option = agentPromptOptionForMessage(message, target.dataset.optionIndex);
    const value = target.dataset.promptKind === 'negative' ? option?.negativePrompt : option?.prompt;
    await copyTextValue(value || '', target.dataset.promptKind === 'negative' ? '负面 Prompt 已复制' : '正向 Prompt 已复制');
    return;
  }
  if (action === 'toggle-agent-message-expanded') {
    state.agent.expandedMessageIds = state.agent.expandedMessageIds && typeof state.agent.expandedMessageIds === 'object' ? state.agent.expandedMessageIds : {};
    const id = target.dataset.messageId;
    if (state.agent.expandedMessageIds[id]) delete state.agent.expandedMessageIds[id];
    else state.agent.expandedMessageIds[id] = true;
    persistRender();
    return;
  }
  if (action === 'agent-option-shortcut') {
    const scrollAnchor = freezeAgentScrollForRender();
    await generateAgentImageFromMessage(target.dataset.messageId, '', { optionIndex: Number(target.dataset.optionIndex) || 0, scrollAnchor });
    return;
  }
  if (action === 'confirm-agent-image') {
    const scrollAnchor = freezeAgentScrollForRender();
    await generateAgentImageFromMessage(target.dataset.messageId, '', { optionIndex: Number(target.dataset.optionIndex) || 0, scrollAnchor });
    return;
  }
  if (action === 'agent-workflow' || action === 'agent-run') { await generateWorkflowFromAgent(); return; }
  if (action === 'new-series-workflow') { newSeriesWorkflowDraft(); return; }
});
document.addEventListener('input', (event) => {
  const action = event.target.dataset.action;
  if (action === 'search-gallery') {
    state.promptQuery = event.target.value;
    if (!state.gallerySearchComposing && !event.isComposing) renderGalleryListOnly();
  }
  if (action === 'count-input') { state.settings.n = Math.max(1, Math.min(8, Number(event.target.value) || 1)); writeComposerSessionSettings(); writeStore(); }
  if (action === 'prompt-search') {
    state.promptRepo.query = event.target.value;
    if (!state.promptRepo.composing && !event.isComposing) debouncedPromptSearch();
  }
  if (action === 'agent-input') {
    state.agent.inputDraft = event.target.value;
    writeStore();
  }
  if (action === 'dialog-input' && state.confirmDialog?.dialogType === 'text-input') {
    state.confirmDialog.value = event.target.value;
  }
  if (action === 'pro-prompt-input') {
    state.pro.prompt = event.target.value;
    writeStore();
  }
  if (action === 'pro-param-input') {
    state.pro.params[event.target.dataset.field] = event.target.value;
    writeStore();
  }
  if (action === 'pro-dimension-input') {
    state.pro.selectedDimensions = state.pro.selectedDimensions || {};
    state.pro.selectedDimensions[event.target.dataset.key] = !!event.target.checked;
    writeStore();
  }
  if (action === 'project-prompt-input') {
    const project = state.agent.projects.find((p) => p.id === state.agent.activeProjectId);
    if (project) {
      project.prompt = event.target.value;
      project.updatedAt = Date.now();
      writeStore();
      debouncedProjectSave();
    }
  }
  if (action === 'workflow-name-input' && state.workflowDraft) {
    state.workflowDraft.name = event.target.value;
    state.workflowDraft.updatedAt = Date.now();
    writeStore();
  }
  if (action === 'workflow-field-input' && state.workflowDraft) {
    state.workflowDraft[event.target.dataset.field] = event.target.value;
    state.workflowDraft.updatedAt = Date.now();
    writeStore();
  }
  if (action === 'workflow-config-input' && state.workflowDraft) {
    state.workflowDraft.config = state.workflowDraft.config || {};
    state.workflowDraft.config[event.target.dataset.field] = event.target.value;
    if (event.target.dataset.field === 'promptTemplate') {
      state.workflowDraft.templateBindings = { ...(state.workflowDraft.templateBindings || {}), imagePrompt: event.target.value };
      const imageNode = (state.workflowDraft.nodes || []).find((node) => node.type === 'image');
      if (imageNode) imageNode.promptTemplate = event.target.value;
    }
    state.workflowDraft.updatedAt = Date.now();
    writeStore();
  }
  if (action === 'workflow-series-input' && state.workflowDraft) {
    state.workflowDraft.seriesConfig = state.workflowDraft.seriesConfig || {};
    state.workflowDraft.seriesConfig[event.target.dataset.field] = event.target.value;
    state.workflowDraft.updatedAt = Date.now();
    writeStore();
  }
  if (action === 'workflow-row-input') {
    updateWorkflowRow(event.target.dataset.scope, Number(event.target.dataset.rowIndex), event.target.dataset.column, event.target.value);
  }
  if (action === 'workflow-invoke-number' && state.workflowInvoke) {
    const field = event.target.dataset.field;
    const limits = { countPerRow: [1, 8], concurrency: [1, 5], maxSteps: [1, 20], maxImages: [1, 80] }[field] || [1, 99];
    state.workflowInvoke[field] = Math.max(limits[0], Math.min(limits[1], Number(event.target.value) || limits[0]));
    writeStore();
  }
  if (action === 'workflow-invoke-check' && state.workflowInvoke) {
    state.workflowInvoke[event.target.dataset.field] = !!event.target.checked;
    writeStore();
  }
  if (action === 'workflow-search-input') {
    state.agent.workflowQuery = event.target.value;
    writeStore();
    render();
  }
  if (action === 'workflow-category-input') {
    state.agent.workflowCategory = event.target.value || '全部分类';
    persistRender();
  }
  if (action === 'entry-advanced-input') {
    const entry = event.target.dataset.entry || currentEntryKey();
    const field = event.target.dataset.field;
    const adv = entryAdvanced(entry);
    if (field === 'responseFormatB64Json' || field === 'streamImages') {
      adv[field] = event.target.value === 'default' ? null : event.target.value === 'true';
    } else {
      adv[field] = event.target.value === '' ? null : Number(event.target.value);
    }
    writeEntryAdvanced(entry);
    writeStore();
  }
  if (action === 'task-tags-input' || action === 'task-note-input') {
    const task = state.tasks.find((t) => t.id === event.target.dataset.id);
    if (task) {
      if (action === 'task-tags-input') task.tags = event.target.value;
      if (action === 'task-note-input') task.note = event.target.value;
      writeStore();
    }
  }
  if (action === 'mask-size' && state.maskEditor) {
    state.maskEditor.brushSize = Math.max(4, Math.min(160, Number(event.target.value) || 64));
    updateMaskToolUi();
  }
});
document.addEventListener('keydown', (event) => {
  const topDialog = $('.viewer-layer, .modal-layer [role="dialog"], .detail-modal, .prompt-modal, .size-modal, .workflow-editor-modal, .workflow-invoke-modal, .confirm-modal');
  if (event.key === 'Tab' && topDialog) {
    const focusable = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', topDialog).filter((node) => !node.disabled && node.offsetParent !== null);
    if (focusable.length) {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  if (event.key === 'Escape') {
    if (state.imageContextMenu) { state.imageContextMenu = null; render(); return; }
    if (state.popover) { state.popover = null; render(); return; }
    if (state.viewer) { state.viewer = null; render(); return; }
    if (state.promptRepo.imageViewer) { closePromptRepoImageViewerOverlay(); return; }
    if (state.promptRepo.detail) { closePromptRepoDetailOverlay(); return; }
    if (state.modal) { state.modal = null; render(); return; }
    if (state.workflowInvoke) { state.workflowInvoke = null; render(); return; }
    if (state.workflowDraft) { state.workflowDraft = null; render(); return; }
    if (state.entryAdvancedModal) { state.entryAdvancedModal = null; render(); return; }
    if (state.maskEditor) { state.maskEditor = null; render(); return; }
    if (state.promptRepo.open) { state.promptRepo.open = false; render(); return; }
  }
  if (!state.viewer) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    setViewerImage(event.key === 'ArrowRight' ? 1 : -1);
  }
});

function persistRender() { writeStore(); render(); }
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * .48)}px`;
}
function setPopoverValue(type, value) {
  if (type === 'quality') state.settings.quality = value;
  if (type === 'format') state.settings.output_format = value;
  if (type === 'compression' && state.settings.output_format === 'png') state.settings.transparent_output = value === '是';
  else if (type === 'compression') state.settings.output_compression = Number(value);
  state.popover = null;
  writeComposerSessionSettings();
  persistRender();
}
function nextFromList(list, current) {
  const values = Array.isArray(list) && list.length ? list : [];
  if (!values.length) return current;
  const idx = values.findIndex((item) => String(item).toLowerCase() === String(current).toLowerCase());
  return values[(idx + 1 + values.length) % values.length];
}
function setAgentImageParam(field, value) {
  const settings = agentImageSettings();
  const profile = agentImageProfile();
  if (field === 'profileId') {
    const profiles = imageProfiles();
    const specified = findImageProfileById(value);
    const currentId = settings.profileId || profileId(profile);
    const idx = profiles.findIndex((item) => profileId(item) === currentId);
    const next = specified || (profiles.length ? profiles[(idx + 1 + profiles.length) % profiles.length] : null);
    if (next) settings.profileId = profileId(next);
  } else if (field === 'resolution') {
    const key = providerKey(profile);
    const next = value || nextFromList(agentImageResolutionOptions(profile), agentImageResolutionValue(profile, settings));
    if (key === 'google') settings.googleBaseResolution = next;
    else if (key === 'xai') settings.xaiResolution = next;
    else settings.openaiSize = next;
  } else if (field === 'aspectRatio') {
    const key = providerKey(profile);
    const next = value || nextFromList(agentImageAspectOptions(profile), agentImageAspectValue(profile, settings));
    if (key === 'google') settings.googleAspectRatio = next;
    else if (key === 'xai') settings.xaiAspectRatio = next;
    else settings.openaiAspectRatio = next;
  } else if (field === 'quality') {
    settings.quality = value || nextFromList(['auto', 'low', 'medium', 'high'], settings.quality || 'high');
  } else if (field === 'output_format') {
    settings.output_format = value || nextFromList(['png', 'jpeg', 'webp'], settings.output_format || 'png');
  } else if (field === 'transparent_output') {
    settings.transparent_output = value === undefined ? !settings.transparent_output : value === 'true' || value === '是';
    settings.output_format = 'png';
  } else if (field === 'n') {
    settings.n = value ? Math.max(1, Math.min(8, Number(value) || 1)) : ((Number(settings.n) || 1) % 8) + 1;
  }
  state.agent.imageSettings = settings;
  writeStore();
  render();
}
function setAgentPopoverValue(type, value) {
  const settings = agentImageSettings();
  if (type === 'agent-quality') settings.quality = value;
  if (type === 'agent-format') settings.output_format = value;
  if (type === 'agent-compression' && settings.output_format === 'png') settings.transparent_output = value === '是';
  else if (type === 'agent-compression') settings.output_compression = Number(value);
  state.agent.imageSettings = settings;
  state.popover = null;
  writeStore();
  render();
}
function toggleTheme() {
  const result = window.GptShellTheme?.toggleTheme?.({
    onChange: ({ mode }) => {
      if (state?.preferences) state.preferences.themeMode = mode;
      fetchJson('/api/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { themeMode: mode } })
      }).catch(() => {});
    }
  }) || (() => {
    const current = localStorage.getItem(THEME_KEY) || 'system';
    const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    localStorage.setItem(THEME_KEY, next);
    return applyTheme(next);
  })();
  if (state?.preferences) state.preferences.themeMode = result.mode;
  toast(result.mode === 'system' ? '主题跟随系统' : `主题已切换为 ${result.mode}`);
}
function applyTheme(mode = state?.preferences?.themeMode || 'light') {
  if (window.GptShellTheme?.applyTheme) {
    const applied = window.GptShellTheme.applyTheme(mode);
    if (state?.preferences) state.preferences.themeMode = applied.mode;
    return applied;
  }
  const value = localStorage.getItem(THEME_KEY) || mode || 'light';
  const resolved = value === 'system' ? systemTheme() : value;
  document.documentElement.dataset.themeMode = value;
  document.documentElement.setAttribute('data-theme', resolved);
  return { mode: value, resolved };
}
function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function watchSystemTheme() {
  if (window.GptShellTheme?.bind) {
    window.GptShellTheme.bind();
    nextRenderFrame(() => window.GptShellTheme?.syncButtons?.(document));
    return;
  }
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!media) return;
  const onChange = () => {
    if ((localStorage.getItem(THEME_KEY) || 'system') === 'system') applyTheme();
  };
  if (media.addEventListener) media.addEventListener('change', onChange);
  else media.addListener?.(onChange);
}
function toast(message) {
  const stack = $('#toastStack') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toast-stack', id: 'toastStack' }));
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  stack.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}
function notifyTaskComplete(task) {
  if (!state.preferences?.taskCompletionNotification) return;
  const title = task.status === 'success' ? '图片生成完成' : task.status === 'partial_success' ? '图片部分生成完成' : '图片生成失败';
  const body = task.status === 'success'
    ? `${task.model || '模型'} · ${task.images?.length || 0} 张`
    : (task.error || taskErrorSummary(task));
  try {
    if (!('Notification' in window)) return toast(`${title}：${body}`);
    if (Notification.permission === 'granted') new Notification(title, { body });
    else if (Notification.permission !== 'denied') Notification.requestPermission().then((permission) => {
      if (permission === 'granted') new Notification(title, { body });
      else toast(`${title}：${body}`);
    });
    else toast(`${title}：${body}`);
  } catch {
    toast(`${title}：${body}`);
  }
}
function hasActiveWork() {
  return state.tasks.some((task) => task.status === 'queued' || task.status === 'running') ||
    state.agent.logs.some((log) => log.pending) ||
    (state.agent.workflowRuns || []).some((run) => run.status === 'queued' || run.status === 'running');
}
function leavePage(url) {
  if (hasActiveWork()) window.open(url, '_blank', 'noopener');
  else location.href = url;
}

async function loadRuntime() {
  const [me, runtime] = await Promise.all([
    fetchJson('/api/auth/me').catch(() => null),
    fetchJson('/.well-known/img-runtime-config.json').catch(() => null)
  ]);
  state.user = me?.user || me || null;
  state.runtime = runtime || {};
  const runtimeHas = (key) => Object.prototype.hasOwnProperty.call(state.runtime || {}, key);
  state.preferences = {
    ...DEFAULT_PREFERENCES,
    ...state.preferences,
    themeMode: runtime?.themeMode || state.preferences?.themeMode || DEFAULT_PREFERENCES.themeMode,
    referenceImageEditAction: runtime?.referenceImageEditAction || runtime?.refEditAction || state.preferences?.referenceImageEditAction || DEFAULT_PREFERENCES.referenceImageEditAction,
    persistInputOnRestart: runtime?.persistInputOnRestart ?? runtime?.persistInput ?? state.preferences?.persistInputOnRestart ?? DEFAULT_PREFERENCES.persistInputOnRestart,
    clearInputAfterSubmit: runtime?.clearInputAfterSubmit ?? state.preferences?.clearInputAfterSubmit ?? DEFAULT_PREFERENCES.clearInputAfterSubmit,
    taskCompletionNotification: runtime?.taskCompletionNotification ?? runtime?.taskNotification ?? state.preferences?.taskCompletionNotification ?? DEFAULT_PREFERENCES.taskCompletionNotification,
    alwaysShowRetryButton: runtime?.alwaysShowRetryButton ?? runtime?.alwaysShowRetry ?? state.preferences?.alwaysShowRetryButton ?? DEFAULT_PREFERENCES.alwaysShowRetryButton,
    reuseTaskApiProfileTemporarily: runtime?.reuseTaskApiProfileTemporarily ?? runtime?.reuseProfile ?? state.preferences?.reuseTaskApiProfileTemporarily ?? DEFAULT_PREFERENCES.reuseTaskApiProfileTemporarily,
    allowPromptRewrite: runtime?.allowPromptRewrite ?? state.preferences?.allowPromptRewrite ?? DEFAULT_PREFERENCES.allowPromptRewrite,
    enterSubmit: runtime?.enterSubmit ?? state.preferences?.enterSubmit ?? DEFAULT_PREFERENCES.enterSubmit,
    zipDownloadRoutes: Array.isArray(runtime?.zipDownloadRoutes) ? runtime.zipDownloadRoutes : (state.preferences?.zipDownloadRoutes || DEFAULT_PREFERENCES.zipDownloadRoutes)
  };
  if (!localStorage.getItem(THEME_KEY)) localStorage.setItem(THEME_KEY, state.preferences.themeMode || 'light');
  applyTheme();
  applyPromptPersistencePreference();
  state.profiles = Array.isArray(runtime?.profiles) && runtime.profiles.length ? runtime.profiles : [{
    id: runtime?.activeProfileId || 'default-openai',
    name: 'OpenAI',
    provider: 'openai',
    model: runtime?.defaultModel || 'gpt-image-2',
    apiMode: runtime?.apiMode || 'images'
  }];
  state.activeProfileId = runtime?.activeProfileId || state.activeProfileId || state.profiles[0].id;
  state.activeImageProfileId = imageProfiles().find((p) => profileId(p) === runtime?.activeImageProfileId)?.id || imageProfiles().find((p) => profileId(p) === runtime?.activeProfileId)?.id || state.activeImageProfileId || imageProfiles()[0]?.id || state.activeProfileId;
  state.agentConfig = {
    mode: runtime?.agentApiConfigMode || 'off',
    textProfileId: runtime?.agentTextProfileId || null,
    imageProfileId: runtime?.agentImageProfileId || null,
    webSearchEnabled: !!runtime?.agentWebSearch,
    scrollAfterSubmit: runtime?.agentScrollToBottomAfterSubmit !== false
  };
  if (!state.agentConfig.webSearchEnabled) state.agent.webMode = 'off';
  const nextSettings = { ...state.settings };
  if (runtimeHas('quality')) nextSettings.quality = runtime.quality || 'high';
  if (runtimeHas('output_format')) nextSettings.output_format = runtime.output_format || 'png';
  if (runtimeHas('output_compression')) nextSettings.output_compression = runtime.output_compression === null ? null : runtime.output_compression ?? 90;
  if (runtimeHas('n')) nextSettings.n = Number(runtime.n) || 1;
  if (runtimeHas('transparent_output')) nextSettings.transparent_output = !!runtime.transparent_output;
  if (runtimeHas('moderation')) nextSettings.moderation = runtime.moderation || 'auto';
  Object.assign(state.settings, nextSettings);
  writeComposerSessionSettings();
}
async function fetchJson(url, options) {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
  if (String(res.headers?.get?.('Content-Type') || '').toLowerCase().includes('text/event-stream')) {
    return { __stream: true, response: res };
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const normalized = normalizeError(data || res.statusText, res.statusText || '请求失败');
    const err = new Error(normalized.summary);
    err.detail = normalized.detail;
    err.code = normalized.code || res.status;
    err.status = res.status;
    err.upstreamStatus = data?.upstreamStatus || data?.status || res.status;
    err.raw = data;
    throw err;
  }
  return data;
}
function responseStreamTextFromPayload(payload) {
  const type = String(payload?.type || '');
  const delta = firstDefined(
    type.includes('delta') ? payload?.delta : '',
    payload?.output_text_delta,
    payload?.outputTextDelta,
    payload?.text_delta,
    payload?.textDelta,
    payload?.content_delta,
    payload?.contentDelta
  );
  if (delta) return delta;
  if (/\.completed$|completed$|done|final/i.test(type)) {
    const completed = extractResponseText(payload, '');
    if (completed && !/^\{[\s\S]*\}$/.test(completed.trim())) return completed;
  }
  return firstDefined(
    payload?.output_text,
    payload?.outputText,
    payload?.text,
    payload?.delta,
    payload?.content,
    payload?.message
  ) || '';
}
function parseSseDataBlock(block) {
  const dataLines = [];
  for (const line of String(block || '').split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  const data = dataLines.join('\n').trim();
  if (!data || data === '[DONE]') return null;
  return data;
}
function streamEventErrorMessage(payload) {
  const type = String(payload?.type || '');
  const error = payload?.error;
  if (error && typeof error === 'object') return error.message || error.code || error.type || null;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (/\.failed$/i.test(type)) return payload?.message || 'Agent 流式请求失败';
  return null;
}
function responsePayloadFromStreamEvent(payload) {
  if (payload?.response && typeof payload.response === 'object') return payload.response;
  if (payload?.item && typeof payload.item === 'object') return { output: [payload.item] };
  if (Array.isArray(payload?.output)) return payload;
  return null;
}
function mergeOutputItems(current, items, indices = []) {
  const out = [...current];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const outputIndex = indices[i];
    let index = item?.id ? out.findIndex((existing) => existing?.id === item.id) : -1;
    if (index < 0 && typeof outputIndex === 'number' && outputIndex >= 0 && outputIndex < out.length && out[outputIndex]?.type === item?.type) index = outputIndex;
    if (index < 0 && item?.type) {
      const sameType = out.map((existing, idx) => existing?.type === item.type ? idx : -1).filter((idx) => idx >= 0);
      if (sameType.length === 1) index = sameType[0];
    }
    if (index >= 0) out[index] = item;
    else out.push(item);
  }
  return out;
}
async function consumeResponseTextStream(response, options = {}) {
  const reader = response?.body?.getReader?.();
  if (!reader) throw new Error('Agent 流式响应不可读取');
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];
  const chunks = [];
  let completedPayload = null;
  let outputItems = [];
  let hasDataLine = false;
  let shouldStop = false;
  const cancelReader = () => { try { reader.cancel(); } catch {} };
  options.signal?.addEventListener?.('abort', cancelReader, { once: true });
  const handleEvent = (chunk) => {
    if (String(chunk || '').split(/\r?\n/).some((line) => line.startsWith('data:'))) hasDataLine = true;
    let data = parseSseDataBlock(chunk);
    if (!data && String(chunk || '').trim().startsWith('{')) data = String(chunk).trim();
    if (!data) return;
    let payload = null;
    try { payload = JSON.parse(data); } catch { throw new Error(`Agent 流式响应不是有效 JSON：${String(data).slice(0, 240)}`); }
    events.push(payload);
    const errorMessage = streamEventErrorMessage(payload);
    if (errorMessage) throw new Error(errorMessage);
    const type = String(payload?.type || '');
    if (type === 'response.output_text.delta') {
      const delta = typeof payload.delta === 'string' ? payload.delta : '';
      if (delta) chunks.push(delta);
      return;
    }
    if (/response\.web_search_call\./.test(type)) return;
    const streamPayload = responsePayloadFromStreamEvent(payload);
    if (Array.isArray(streamPayload?.output)) {
      const indices = type === 'response.completed' ? streamPayload.output.map((_, idx) => idx) : streamPayload.output.map(() => Number(payload.output_index));
      outputItems = mergeOutputItems(outputItems, streamPayload.output, indices);
    }
    if (type === 'response.completed' || payload?.response) {
      completedPayload = streamPayload || payload.response || payload;
      const text = extractResponseText(completedPayload, '');
      if (text) shouldStop = true;
      return;
    }
    const text = responseStreamTextFromPayload(payload);
    if (text && !type.includes('delta')) chunks.push(chunks.length ? `\n${text}` : text);
  };
  try {
    while (true) {
      if (options.signal?.aborted) throw new DOMException('请求已停止', 'AbortError');
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.search(/\r?\n\r?\n/);
      while (separatorIndex >= 0) {
        const separator = buffer.match(/\r?\n\r?\n/)?.[0] || '\n\n';
        const part = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + separator.length);
        handleEvent(part);
        if (shouldStop) {
          cancelReader();
          break;
        }
        separatorIndex = buffer.search(/\r?\n\r?\n/);
      }
      if (shouldStop) break;
    }
    buffer += decoder.decode();
    if (!shouldStop && buffer.trim()) handleEvent(buffer);
  } finally {
    options.signal?.removeEventListener?.('abort', cancelReader);
  }
  if (!hasDataLine && !events.length) throw new Error('未从 Agent 流式响应中解析到有效 data 事件');
  const finalPayload = completedPayload || (outputItems.length ? { output: outputItems } : null);
  const finalText = finalPayload ? extractResponseText(finalPayload, '') : '';
  if (finalText) return { ...finalPayload, output_text: finalText, streamEvents: events };
  const outputText = chunks.join('').trim();
  if (outputText) return { output_text: outputText, streamEvents: events };
  const fallback = extractResponseText({ streamEvents: events }, '');
  if (fallback) return { output_text: fallback, streamEvents: events };
  throw new Error('Agent 流式响应结束但没有返回可解析文本');
}
async function resolveResponsePayload(data) {
  if (data?.__stream) return consumeResponseTextStream(data.response, data);
  return data;
}
async function saveActiveProfile() {
  writeComposerSessionSettings();
}

let galleryImageObserver = null;
async function hydrateBlobImage(img, blobId, remoteUrl = '') {
  if (!blobId && remoteUrl) { img.src = remoteUrl; return; }
  if (!blobId) return;
  if (!state.imageUrls.has(blobId)) {
    const blob = await getBlob(blobId).catch(() => null);
    if (blob) state.imageUrls.set(blobId, URL.createObjectURL(blob));
  }
  if (state.imageUrls.has(blobId)) img.src = state.imageUrls.get(blobId);
}
function observeGalleryImage(img) {
  if (typeof IntersectionObserver === 'undefined' || !img.closest('.gallery-scroll')) return false;
  const root = $('.gallery-scroll');
  if (!galleryImageObserver || galleryImageObserver.rootNode !== root) {
    if (galleryImageObserver) galleryImageObserver.disconnect();
    galleryImageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        galleryImageObserver.unobserve(entry.target);
        hydrateBlobImage(entry.target, entry.target.dataset.blobId, entry.target.dataset.remoteUrl);
      });
    }, { root, rootMargin: '360px 0px' });
    galleryImageObserver.rootNode = root;
  }
  galleryImageObserver.observe(img);
  return true;
}
async function hydrateImages() {
  for (const img of $$('img[data-blob-id]')) {
    const blobId = img.dataset.blobId;
    if (observeGalleryImage(img)) continue;
    await hydrateBlobImage(img, blobId, img.dataset.remoteUrl);
  }
  for (const img of $$('img[data-ref-id]')) {
    const ref = state.references.find((r) => r.id === img.dataset.refId);
    if (!ref) continue;
    if (!state.refUrls.has(ref.id)) {
      const blob = await getBlob(ref.blobId).catch(() => null);
      if (blob) state.refUrls.set(ref.id, URL.createObjectURL(blob));
    }
    if (state.refUrls.has(ref.id)) img.src = state.refUrls.get(ref.id);
  }
  for (const img of $$('img[data-pro-ref-id]')) {
    const ref = (state.pro.refs || []).find((r) => r.id === img.dataset.proRefId);
    if (!ref) continue;
    const key = `pro:${ref.id}`;
    if (!state.refUrls.has(key)) {
      const blob = await getBlob(ref.blobId).catch(() => null);
      if (blob) state.refUrls.set(key, URL.createObjectURL(blob));
    }
    if (state.refUrls.has(key)) img.src = state.refUrls.get(key);
  }
  for (const img of $$('img[data-workflow-ref-id]')) {
    const ref = (state.workflowInvoke?.references || []).find((r) => r.id === img.dataset.workflowRefId);
    if (!ref) continue;
    const key = `workflow:${ref.id}`;
    if (!state.refUrls.has(key)) {
      const blob = await getBlob(ref.blobId).catch(() => null);
      if (blob) state.refUrls.set(key, URL.createObjectURL(blob));
    }
    if (state.refUrls.has(key)) img.src = state.refUrls.get(key);
  }
  for (const img of $$('img[data-agent-attachment-id]')) {
    const attachment = (state.agent.attachments || []).find((item) => item.id === img.dataset.agentAttachmentId);
    if (!attachment?.blobId) continue;
    const key = `agent:${attachment.id}:${attachment.blobId}`;
    if (!state.refUrls.has(key)) {
      const blob = await getBlob(attachment.blobId).catch(() => null);
      if (blob) state.refUrls.set(key, URL.createObjectURL(blob));
    }
    if (state.refUrls.has(key)) img.src = state.refUrls.get(key);
  }
  for (const img of $$('img[data-task-ref-task-id]')) {
    const task = state.tasks.find((item) => item.id === img.dataset.taskRefTaskId);
    const refs = task ? taskReferenceSnapshots(task) : [];
    const ref = refs[Number(img.dataset.taskRefIndex) || 0];
    if (!ref) continue;
    const displayBlobId = taskReferenceDisplayBlobId(ref);
    const key = `taskref:${task.id}:${ref.id}:${displayBlobId}`;
    if (!state.refUrls.has(key)) {
      const blob = await getBlob(displayBlobId).catch(() => null);
      if (blob) state.refUrls.set(key, URL.createObjectURL(blob));
    }
    if (state.refUrls.has(key)) img.src = state.refUrls.get(key);
  }
}

async function addFilesAsReferences(files) {
  const limit = referenceLimit();
  const imageFiles = files.filter((file) => file && file.type.startsWith('image/'));
  if (!imageFiles.length) return;
  if (state.references.length + imageFiles.length > limit) {
    toast(`当前供应商最多允许 ${limit} 张参考图`);
    return;
  }
  for (const file of imageFiles) {
    const blobId = await putBlob(file);
    const size = await imageSizeFromBlob(file).catch(() => ({}));
    const ref = { id: uid('ref'), blobId, originalBlobId: blobId, name: file.name || 'reference.png', type: file.type, width: size.width, height: size.height };
    state.references.push(ref);
  }
  persistRender();
}
function clipboardImageFiles(clipboardData) {
  const byFiles = Array.from(clipboardData?.files || []).filter((file) => file?.type?.startsWith('image/'));
  if (byFiles.length) return byFiles;
  return Array.from(clipboardData?.items || [])
    .filter((item) => item?.kind === 'file' && String(item.type || '').startsWith('image/'))
    .map((item) => item.getAsFile?.())
    .filter((file) => file?.type?.startsWith('image/'));
}
async function handlePaste(event) {
  const files = clipboardImageFiles(event.clipboardData);
  if (!files.length) return;
  event.preventDefault?.();
  if (state.mode === 'agent') await addAgentAttachments(files);
  else await addFilesAsReferences(files);
}
async function removeReference(id) {
  const ref = state.references.find((r) => r.id === id);
  if (ref) {
    await deleteBlob(ref.blobId).catch(() => {});
    if (ref.originalBlobId && ref.originalBlobId !== ref.blobId) await deleteBlob(ref.originalBlobId).catch(() => {});
    if (ref.compositedBlobId && ref.compositedBlobId !== ref.blobId) await deleteBlob(ref.compositedBlobId).catch(() => {});
    if (ref.maskBlobId) await deleteBlob(ref.maskBlobId).catch(() => {});
  }
  state.references = state.references.filter((r) => r.id !== id);
  revokeMapEntry(state.refUrls, id);
  persistRender();
}
async function addTaskReferenceToComposer(taskId, index = 0) {
  const task = state.tasks.find((item) => item.id === taskId);
  const ref = taskReferenceSnapshots(task || {})[index];
  if (!ref) return toast('未找到该任务的参考图');
  const limit = referenceLimit();
  if (state.references.length >= limit) return toast(`当前供应商最多允许 ${limit} 张参考图`);
  const blob = await getBlob(ref.originalBlobId || ref.blobId).catch(() => null);
  if (!blob) return toast('参考图原图不在当前浏览器本地，无法加入');
  const blobId = await putBlob(blob);
  const size = await imageSizeFromBlob(blob).catch(() => ({}));
  state.references.push({
    id: uid('ref'),
    blobId,
    originalBlobId: blobId,
    name: ref.name || 'reference.png',
    type: blob.type || ref.type || 'image/png',
    width: size.width || ref.width,
    height: size.height || ref.height
  });
  state.modal = null;
  persistRender();
  toast('已加入对话栏参考图');
}
async function handleReferenceEditAction(refId) {
  const behavior = state.preferences?.referenceImageEditAction || 'ask';
  if (behavior === 'add-mask') {
    openMaskEditor(refId);
    return;
  }
  if (behavior === 'replace-reference') {
    $('#refFileInput')?.click();
    return;
  }
  state.confirmDialog = {
    kind: 'reference-action',
    payload: { refId },
    kicker: '参考图操作',
    title: '进入编辑遮罩？',
    message: '你可以在原图上涂抹限定修改区域；如果只是想重新上传，取消后删除这张参考图即可。',
    confirmText: '进入遮罩',
    cancelText: '取消'
  };
  render();
}
async function addFilesAsWorkflowReferences(files) {
  if (!state.workflowInvoke) return;
  const profile = imageProfile();
  const limit = referenceLimit(profile);
  const imageFiles = files.filter((file) => file && file.type.startsWith('image/'));
  if (!imageFiles.length) return;
  state.workflowInvoke.references = state.workflowInvoke.references || [];
  if (state.workflowInvoke.references.length + imageFiles.length > limit) {
    toast(`当前生图模型最多允许 ${limit} 张参考图`);
    return;
  }
  for (const file of imageFiles) {
    const blobId = await putBlob(file);
    const size = await imageSizeFromBlob(file).catch(() => ({}));
    state.workflowInvoke.references.push({ id: uid('wfref'), blobId, originalBlobId: blobId, name: file.name || 'workflow-reference.png', type: file.type, width: size.width, height: size.height });
  }
  persistRender();
}
async function removeWorkflowReference(id) {
  const ref = (state.workflowInvoke?.references || []).find((item) => item.id === id);
  if (ref) await deleteBlob(ref.blobId).catch(() => {});
  if (ref?.originalBlobId && ref.originalBlobId !== ref.blobId) await deleteBlob(ref.originalBlobId).catch(() => {});
  if (ref?.compositedBlobId && ref.compositedBlobId !== ref.blobId) await deleteBlob(ref.compositedBlobId).catch(() => {});
  if (ref?.maskBlobId) await deleteBlob(ref.maskBlobId).catch(() => {});
  if (state.workflowInvoke) state.workflowInvoke.references = (state.workflowInvoke.references || []).filter((item) => item.id !== id);
  revokeMapEntry(state.refUrls, `workflow:${id}`);
  persistRender();
}

function validateReferenceCountForProfile(profile, refs = []) {
  const count = (Array.isArray(refs) ? refs : []).filter((ref) => ref?.blobId).length;
  const limit = referenceLimit(profile);
  if (count <= limit) return true;
  toast(`当前模型最多允许 ${limit} 张参考图，请移除多余参考图后再生成。`);
  return false;
}

async function generateImageTask(seedTask = null) {
  const prompt = seedTask?.prompt || state.composerPrompt.trim();
  if (!prompt) { toast('请先输入提示词'); return; }
  const profile = seedTask ? resolveTaskProfile(seedTask) : imageProfile();
  if (!profile) {
    toast('原任务模型配置已不存在，请先复用并选择可用模型后再生成。');
    return null;
  }
  const references = Array.isArray(seedTask?.referenceSnapshots) ? seedTask.referenceSnapshots : Array.isArray(seedTask?.references) ? seedTask.references : state.references;
  if (!validateReferenceCountForProfile(profile, references)) return null;
  const referenceSnapshots = await cloneReferenceSnapshots(references);
  const params = seedTask?.requestedParams || requestedParams(profile);
  const transparentOutput = wantsTransparentOutput(params);
  const effectiveParams = transparentOutput ? getTransparentRequestParams(params) : params;
  if (providerKey(profile) === 'openai' && String(firstDefined(params.format, params.output_format, state.settings.output_format) || '').toLowerCase() === 'png' && firstDefined(params.transparent, params.transparent_background, state.settings.transparent_output, false) && !openAiTransparentBackgroundSupported(profile)) {
    toast(transparentBackgroundUnsupportedMessage(profile));
    return null;
  }
  const meta = seedTask?.workflowMeta || {};
  const task = {
    id: uid('task'),
    status: 'running',
    mode: 'gallery',
    prompt,
    profileId: profileId(profile),
    profileName: profile.name,
    model: profile.model,
    providerFamily: providerKey(profile),
    sizeLabel: params.size,
    quality: params.quality,
    count: params.count,
    referenceCount: referenceSnapshots.length,
    referenceSnapshots,
    requestedParams: params,
    transparentOutput,
    transparentSource: transparentOutput ? 'local-key-color' : '',
    transparentPrompt: transparentOutput ? buildTransparentKeyPrompt(prompt) : '',
    workflowId: meta.workflowId || seedTask?.workflowId || '',
    workflowRunId: meta.workflowRunId || seedTask?.workflowRunId || '',
    workflowNodeId: meta.workflowNodeId || seedTask?.workflowNodeId || '',
    batchRowId: meta.batchRowId || seedTask?.batchRowId || '',
    batchLabel: meta.batchLabel || seedTask?.batchLabel || '',
    workflowName: meta.workflowName || seedTask?.workflowName || '',
    agentMessageId: meta.agentMessageId || seedTask?.agentMessageId || '',
    agentOption: meta.agentOption || seedTask?.agentOption || '',
    agentOptionTitle: meta.agentOptionTitle || seedTask?.agentOptionTitle || '',
    editedFromOption: meta.editedFromOption || seedTask?.editedFromOption || '',
    returnedParams: {},
    createdAt: Date.now(),
    startedAt: Date.now(),
    images: [],
    error: ''
  };
  state.tasks.unshift(task);
  writeStore();
  render();
  if (meta.onCreated) meta.onCreated(task);
  try {
    const apiStartedAt = Date.now();
    const result = await collectGenerationResult(prompt, effectiveParams, {
      profile,
      references,
      entry: meta.entry || 'gallery',
      transparentOutput,
      onPartialImage: (url) => {
        task.streamPreviewUrl = url;
        renderGalleryListOnly();
      },
      onPersistedImages: (batch, snapshot) => {
        task.images = snapshot.images;
        task.expectedCount = snapshot.expectedCount;
        task.actualCount = snapshot.actualCount;
        task.failedCount = snapshot.failedCount;
        writeStore();
        renderGalleryListOnly();
      }
    });
    const apiFinishedAt = Date.now();
    const response = result.response;
    const images = result.images;
    task.finishedAt = Date.now();
    task.elapsedMs = task.finishedAt - task.startedAt;
    task.apiElapsedMs = result.apiElapsedMs || (apiFinishedAt - apiStartedAt);
    task.persistElapsedMs = result.persistElapsedMs || Math.max(0, task.elapsedMs - task.apiElapsedMs);
    task.images = images;
    task.expectedCount = result.expectedCount || params.count || images.length;
    task.actualCount = images.length;
    task.failedCount = result.failedCount || 0;
    task.partialErrors = result.partialErrors || [];
    task.rawResponse = summarizeResponse(response);
    task.returnedPrompt = returnedPromptFromResponse(response);
    task.returnedParams = extractReturnedParams(response, { ...params, transparent: transparentOutput || params.transparent }, images);
    if (transparentOutput) {
      task.returnedParams.transparent = true;
      task.returnedParams.transparentBackground = true;
      task.returnedParams.background = 'local-key-color';
      if (result.transparentPostProcessError) {
        task.transparentPostProcessError = result.transparentPostProcessError;
        task.errorDetail = [task.errorDetail, `透明背景后处理失败，已保留原图：${result.transparentPostProcessError}`].filter(Boolean).join('\n');
      }
    }
    task.error = task.failedCount ? `部分图片生成失败：${task.failedCount} 张未完成` : '';
    task.errorDetail = task.partialErrors.map((item, idx) => `${idx + 1}. ${item.detail || item.summary || item.error || item}`).join('\n');
    task.status = task.failedCount ? 'partial_success' : 'success';
    task.streamPreviewUrl = '';
    task.streamPreviewRemoteUrl = '';
    writeStore();
    if (!seedTask && state.preferences?.clearInputAfterSubmit) state.composerPrompt = '';
    notifyTaskComplete(task);
  } catch (err) {
    const normalized = normalizeError(err, '生成失败');
    task.finishedAt = Date.now();
    task.elapsedMs = task.finishedAt - task.startedAt;
    task.apiElapsedMs = task.apiElapsedMs || task.elapsedMs;
    if ((task.images || []).length) {
      const expected = Number(task.expectedCount || effectiveParams.count || task.images.length);
      task.actualCount = task.images.length;
      task.failedCount = Math.max(0, expected - task.images.length);
      task.error = task.failedCount ? `部分图片生成失败：${task.failedCount} 张未完成` : '';
      task.errorDetail = task.failedCount ? normalized.detail : '';
      task.status = task.failedCount ? 'partial_success' : 'success';
    } else {
      task.error = normalized.summary;
      task.errorDetail = normalized.detail;
      task.status = 'error';
    }
    task.streamPreviewUrl = '';
    task.streamPreviewRemoteUrl = '';
    if (task.status === 'error') toast(`生成失败：${task.error}`);
    else if (task.status === 'partial_success') toast(`部分图片已保存：${task.error}`);
    notifyTaskComplete(task);
  }
  writeStore();
  render();
  return task;
}
async function collectGenerationResult(prompt, params, options = {}) {
  const expected = Math.max(1, Number(params.count || state.settings.n) || 1);
  const profile = options.profile || imageProfile();
  const provider = providerKey(profile);
  const forceSingleRequests = provider === 'google';
  const responses = [];
  const images = [];
  const partialErrors = [];
  const maxAttempts = forceSingleRequests ? expected : 1;
  let lastError = null;
  let apiElapsedMs = 0;
  let persistElapsedMs = 0;
  let transparentPostProcessError = '';
  for (let attempt = 0; attempt < maxAttempts && images.length < expected; attempt++) {
    const remaining = Math.max(1, expected - images.length);
    const requestParams = forceSingleRequests ? { ...params, count: 1 } : (attempt === 0 ? params : { ...params, count: remaining });
    try {
      const apiStartedAt = Date.now();
      const response = await sendGenerationRequest(prompt, requestParams, { ...options, profile });
      apiElapsedMs += Date.now() - apiStartedAt;
      responses.push(response);
      const persistStartedAt = Date.now();
      let batch = await persistResponseImages(response);
      if (options.transparentOutput) {
        try {
          batch = await postProcessTransparentImages(batch);
        } catch (postErr) {
          transparentPostProcessError = normalizeError(postErr, '透明背景后处理失败').summary;
        }
      }
      persistElapsedMs += Date.now() - persistStartedAt;
      images.push(...batch);
      if (typeof options.onPersistedImages === 'function') {
        options.onPersistedImages(batch, {
          images: [...images],
          expectedCount: expected,
          actualCount: images.length,
          failedCount: Math.max(0, expected - images.length),
          responses: [...responses]
        });
      }
    } catch (err) {
      lastError = err;
      const normalized = normalizeError(err, '单张生成失败');
      partialErrors.push({ summary: normalized.summary, detail: normalized.detail, attempt: attempt + 1 });
      if (!forceSingleRequests) break;
      if (!images.length && attempt >= maxAttempts - 1) throw err;
      continue;
    }
    if (!forceSingleRequests) {
      break;
    }
    if (images.length >= expected) {
      break;
    }
  }
  if (!images.length && lastError) throw lastError;
  const response = responses.length === 1 ? responses[0] : {
    source: readDeepAlias(responses, ['source', 'provider', 'model']),
    responses,
    data: responses.flatMap((item) => Array.isArray(item?.data) ? item.data : []),
    images: responses.flatMap((item) => Array.isArray(item?.images) ? item.images : []),
    count: images.length
  };
  return { response, images, partialErrors, expectedCount: expected, actualCount: images.length, failedCount: Math.max(0, expected - images.length), apiElapsedMs, persistElapsedMs, transparentPostProcessError };
}
async function postProcessTransparentImages(images = []) {
  const processed = [];
  for (const image of images) {
    const originalBlob = await getBlob(image.blobId);
    if (!originalBlob) {
      processed.push(image);
      continue;
    }
    const transparentBlob = await removeKeyedBackgroundFromBlob(originalBlob);
    const blobId = await putBlob(transparentBlob);
    const info = await imageInfoFromBlob(transparentBlob).catch(async () => ({ ...(await imageSizeFromBlob(transparentBlob).catch(() => ({}))), type: transparentBlob.type, hasAlpha: true }));
    processed.push({
      ...image,
      blobId,
      originalBlobId: image.originalBlobId || image.blobId,
      width: info.width || image.width,
      height: info.height || image.height,
      type: info.type || 'image/png',
      transparent: true,
      transparentOutput: true,
      transparentSource: 'local-key-color'
    });
  }
  return processed;
}
async function sendGenerationRequest(prompt, params = {}, options = {}) {
  const profile = options.profile || imageProfile();
  const entry = options.entry || currentEntryKey();
  const requestParams = params && typeof params === 'object' ? params : {};
  const sourceRefs = Array.isArray(options.references) ? options.references : state.references;
  if (!validateReferenceCountForProfile(profile, sourceRefs)) throw new Error(`参考图数量超过当前模型限制：${referenceLimit(profile)}`);
  const refs = await Promise.all(sourceRefs.map(async (ref, index) => ({ ref, blob: await getBlob(ref.blobId), index })));
  const hasRefs = refs.some((item) => item.blob);
  const endpoint = hasRefs ? '/api-proxy/images/edits' : '/api-proxy/images/generations';
  const provider = providerKey(profile);
  const requestPrompt = promptWithCanvasConstraint(prompt, provider, requestParams);
  if (hasRefs) {
    const fd = new FormData();
    fd.append('model', profile.model || 'gpt-image-2');
    fd.append('prompt', requestPrompt);
    appendProviderParams(fd, provider, requestParams);
    appendImageOutputParams(fd, requestParams);
    appendNegativePromptParams(fd, requestParams);
    fd.append('n', String(provider === 'google' ? 1 : (requestParams.count || state.settings.n || 1)));
    const imageFieldName = provider === 'google' ? 'image[]' : 'image';
    refs.forEach(({ ref, blob }, idx) => { if (blob) fd.append(imageFieldName, blob, ref.name || `reference-${idx}.png`); });
    appendAdvancedToFormData(fd, entry, profile);
    const response = await fetchJson(endpoint, { method: 'POST', headers: appendAdvancedHeaders({}, entry, profile), body: fd });
    if (response?.__stream) return consumeImageStream(response.response, options.onPartialImage);
    return response;
  }
  const body = {
    model: profile.model || 'gpt-image-2',
    prompt: requestPrompt,
    n: provider === 'google' ? 1 : (Number(requestParams.count || state.settings.n) || 1)
  };
  appendImageOutputParams(body, requestParams);
  appendNegativePromptParams(body, requestParams);
  Object.assign(body, providerPayload(provider, requestParams));
  applyAdvancedToJsonBody(body, entry, profile);
  const headers = appendAdvancedHeaders({ 'Content-Type': 'application/json' }, entry, profile);
  let response;
  try {
    response = await fetchJson(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (err) {
    const message = `${err?.message || ''}\n${err?.detail || ''}`;
    const canLegacyRetry = provider === 'google' && body.response_format && typeof body.response_format === 'object' && /response_format|unmarshal|object|string/i.test(message);
    if (!canLegacyRetry) throw err;
    const legacyBody = {
      ...body,
      response_format: 'url',
      googleCompatResponseFormatFallback: true,
      googleResponseFormatFallbackReason: 'object-response-format-rejected'
    };
    response = await fetchJson(endpoint, { method: 'POST', headers, body: JSON.stringify(legacyBody) });
    if (response && typeof response === 'object') {
      response.googleCompatResponseFormatFallback = true;
      response.googleResponseFormatFallbackReason = 'object-response-format-rejected';
    }
  }
  if (response?.__stream) return consumeImageStream(response.response, options.onPartialImage);
  return response;
}
function providerPayload(provider, params = {}) {
  const requestParams = params && typeof params === 'object' ? params : {};
  if (provider === 'google') {
    const imageSize = requestParams.resolution || requestParams.size || state.settings.googleBaseResolution;
    const aspectRatio = requestParams.aspectRatio || requestParams.aspect_ratio || state.settings.googleAspectRatio;
    const officialSize = googleOfficialImageSize(imageSize, aspectRatio);
    const normalizedImageSize = String(imageSize || '').toUpperCase();
    return {
      resolution: imageSize,
      aspect_ratio: aspectRatio,
      image_size: imageSize,
      size: imageSize,
      target_size: officialSize || undefined,
      extra_body: {
        generationConfig: {
          response_modalities: ['IMAGE', 'TEXT'],
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: {
            imageSize: normalizedImageSize,
            aspectRatio,
            image_size: normalizedImageSize,
            aspect_ratio: aspectRatio
          }
        },
        generation_config: {
          response_modalities: ['IMAGE', 'TEXT'],
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: {
            imageSize: normalizedImageSize,
            aspectRatio,
            image_size: normalizedImageSize,
            aspect_ratio: aspectRatio
          }
        }
      },
      response_format: 'url'
    };
  }
  if (provider === 'xai') return {
    resolution: requestParams.resolution || requestParams.size || state.settings.xaiResolution,
    aspect_ratio: requestParams.aspectRatio || requestParams.aspect_ratio || state.settings.xaiAspectRatio
  };
  return { size: openAiSizePayload(requestParams) };
}
function appendProviderParams(fd, provider, params = {}) {
  const payload = providerPayload(provider, params);
  Object.entries(payload).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    fd.append(k, v && typeof v === 'object' ? JSON.stringify(v) : v);
  });
}
function imageOutputParams(params = {}) {
  const requestParams = params && typeof params === 'object' ? params : {};
  const format = String(firstDefined(requestParams.format, requestParams.output_format, state.settings.output_format) || 'png').toLowerCase();
  const out = {
    quality: firstDefined(requestParams.quality, state.settings.quality),
    output_format: format,
    moderation: firstDefined(requestParams.moderation, state.settings.moderation)
  };
  if (format === 'png') {
    const transparent = !!firstDefined(requestParams.transparent, requestParams.transparent_background, state.settings.transparent_output, false);
    out.transparent_background = transparent;
    out.background = transparent ? 'transparent' : 'auto';
  } else {
    out.output_compression = Number(firstDefined(requestParams.compression, requestParams.output_compression, state.settings.output_compression, 90)) || 90;
  }
  return out;
}
function appendImageOutputParams(target, params = {}) {
  const output = imageOutputParams(params);
  Object.entries(output).forEach(([key, value]) => {
    if (target instanceof FormData) target.append(key, String(value));
    else target[key] = value;
  });
}
function appendNegativePromptParams(target, params = {}) {
  const negativePrompt = String(firstDefined(params.negativePrompt, params.negative_prompt, params.negative) || '').trim();
  if (!negativePrompt) return;
  if (target instanceof FormData) {
    target.append('negative_prompt', negativePrompt);
    target.append('negativePrompt', negativePrompt);
  } else {
    target.negative_prompt = negativePrompt;
    target.negativePrompt = negativePrompt;
  }
}
async function persistResponseImages(response) {
  const candidates = collectImageCandidates(response);
  const unique = [];
  const seen = new Set();
  for (const item of candidates) {
    const b64 = firstDefined(item.b64_json, item.b64Json, item.base64, item.image_base64, item.imageBase64);
    let dataUrl = firstDefined(item.data_url, item.dataUrl, item.image_data_url, item.imageDataUrl);
    let remoteUrl = firstDefined(item.url, item.image_url, item.imageUrl, item.uri, item.src, item.href) || '';
    if (!dataUrl && /^data:image\//i.test(String(remoteUrl || ''))) {
      dataUrl = remoteUrl;
      remoteUrl = '';
    }
    const dedupeKey = dataUrl ? `data:${dataUrl}` : remoteUrl ? `url:${remoteUrl}` : b64 ? `b64:${String(b64)}` : '';
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    unique.push({ b64, dataUrl, remoteUrl });
  }
  const images = (await Promise.all(unique.map(async ({ b64, dataUrl, remoteUrl }) => {
    let blob = null;
    if (b64) blob = dataUrlToBlob(String(b64).startsWith('data:') ? b64 : `data:image/png;base64,${b64}`);
    else if (dataUrl) blob = dataUrlToBlob(dataUrl);
    else if (remoteUrl) blob = await fetch(remoteUrl).then((res) => res.blob()).catch(() => null);
    if (!blob) return null;
    const blobId = await putBlob(blob);
    const info = await imageInfoFromBlob(blob).catch(async () => ({ ...(await imageSizeFromBlob(blob).catch(() => ({}))), type: blob.type }));
    return { blobId, remoteUrl: /^data:/i.test(String(remoteUrl || '')) ? '' : remoteUrl, width: info.width, height: info.height, type: info.type || blob.type, transparent: info.hasAlpha === undefined ? undefined : !!info.hasAlpha };
  }))).filter(Boolean);
  if (!images.length) throw new Error('上游未返回可解析图片');
  return images;
}
function collectImageCandidates(response) {
  const out = [];
  for (const obj of collectObjectsDeep(response)) {
    const hasImageValue = firstDefined(
      obj.b64_json,
      obj.b64Json,
      obj.base64,
      obj.image_base64,
      obj.imageBase64,
      obj.data_url,
      obj.dataUrl,
      obj.image_data_url,
      obj.imageDataUrl,
      obj.url,
      obj.image_url,
      obj.imageUrl,
      obj.uri,
      obj.src
    );
    if (hasImageValue) out.push(obj);
  }
  return out;
}
async function consumeImageStream(response, onPartialImage) {
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error('流式响应不可读取');
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPayload = null;
  const events = [];
  const handleEvent = (chunk) => {
    const lines = String(chunk || '').split(/\r?\n/);
    const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim());
    for (const line of dataLines) {
      if (!line || line === '[DONE]') continue;
      let payload = null;
      try { payload = JSON.parse(line); } catch { continue; }
      events.push(payload);
      const partial = collectImageCandidates(payload).at(-1);
      const url = firstDefined(partial?.data_url, partial?.dataUrl, partial?.url, partial?.image_url, partial?.imageUrl);
      const b64 = firstDefined(partial?.b64_json, partial?.b64Json, partial?.base64, partial?.image_base64, partial?.imageBase64);
      if (url && onPartialImage) onPartialImage(url);
      else if (b64 && onPartialImage) onPartialImage(String(b64).startsWith('data:') ? b64 : `data:image/png;base64,${b64}`);
      if (collectImageCandidates(payload).length) finalPayload = payload;
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\n\n/);
    buffer = parts.pop() || '';
    parts.forEach(handleEvent);
  }
  if (buffer.trim()) handleEvent(buffer);
  if (finalPayload) return { ...finalPayload, streamEvents: events };
  throw new Error('流式响应结束但没有返回可解析图片');
}
function returnedPromptFromResponse(response) {
  return firstDefined(
    readDeepAlias(response, ['revised_prompt', 'revisedPrompt', 'returnedPrompt', 'prompt']),
    response?.revised_prompt,
    response?.revisedPrompt,
    response?.prompt,
    ''
  ) || '';
}
function extractReturnedParams(response, params, images = []) {
  const firstImage = images[0] || {};
  const returnedResolution = firstDefined(
    readDeepAlias(response, ['resolution', 'size', 'dimensions', 'output_size', 'outputSize']),
    firstImage.width && firstImage.height ? `${firstImage.width}x${firstImage.height}` : undefined
  );
  const returnedRatio = firstDefined(
    readDeepAlias(response, ['aspect_ratio', 'aspectRatio', 'ratio', 'image_ratio', 'imageRatio']),
    closestAspectRatio(firstImage.width, firstImage.height)
  );
  const returnedFormat = firstDefined(
    readDeepAlias(response, ['format', 'output_format', 'outputFormat', 'mimeType', 'mime_type']),
    firstImage.type
  );
  const returnedCompression = readDeepAlias(response, ['compression', 'output_compression', 'outputCompression', 'compressionQuality', 'compression_quality']);
  const returnedBackground = readDeepAlias(response, ['background']);
  const returnedTransparent = firstDefined(
    readDeepAlias(response, ['transparent', 'transparent_background', 'transparentBackground', 'transparent_output', 'transparentOutput']),
    returnedBackground === 'transparent' ? true : returnedBackground === 'opaque' ? false : undefined,
    firstImage.transparent
  );
  const responseCount = readDeepAlias(response, ['n', 'count', 'imageCount', 'image_count']);
  const normalized = {
    source: readDeepAlias(response, ['source', 'provider', 'model']) || response?.source,
    size: returnedResolution,
    resolution: returnedResolution,
    aspectRatio: returnedRatio,
    quality: readDeepAlias(response, ['quality', 'image_quality', 'imageQuality']),
    format: returnedFormat,
    outputFormat: returnedFormat,
    compression: returnedCompression,
    outputCompression: returnedCompression,
    transparent: returnedTransparent,
    transparentBackground: returnedTransparent,
    background: returnedBackground,
    moderation: readDeepAlias(response, ['moderation', 'moderation_level', 'moderationLevel', 'safety', 'safety_filter', 'safetyFilter']),
    count: images.length || Number(responseCount) || params.count
  };
  normalized.mismatch = computeParamMismatches(params, normalized, images);
  return normalized;
}
if (HOMEPAGE_V3_TEST_HOOKS) {
  Object.assign(HOMEPAGE_V3_TEST_HOOKS, {
    normalizeRestoredTask,
    collectGenerationResult,
    sendGenerationRequest,
    persistResponseImages,
    imageInfoFromBlob,
    detectImageMimeFromBytes,
    resolveTaskProfile,
    retryTask,
    collectImageCandidates,
    extractReturnedParams,
    renderDetailModal,
    renderViewer,
    captureGalleryScrollState,
    restoreGalleryScrollState,
    sanitizeReferenceSnapshots,
    cloneReferenceSnapshots,
    taskCountInfo,
    taskReferenceSnapshots,
    renderReferenceBadge,
    renderTaskReferenceStrip,
    captureAgentScrollAnchor,
    restoreAgentScrollAnchor,
    freezeAgentScrollForRender,
    releaseAgentScrollFreezeAfterRender,
    galleryVirtualWindow,
    maskCanvasHasPaint,
    shouldCloseModalFromClick,
    returnedPromptFromResponse,
    normalizeComparableValue,
    computeParamMismatches,
    providerPayload,
    promptWithCanvasConstraint,
    buildTransparentKeyPrompt,
    getTransparentRequestParams,
    wantsTransparentOutput,
    detectKeyColorFromPixels,
    removeKeyedBackgroundFromPixels,
    removeKeyedBackgroundFromBlob,
    postProcessTransparentImages,
    openAiSizePayload,
    imageOutputParams,
    openAiTransparentBackgroundSupported,
    googleOfficialImageSize,
    expectedProviderResolution,
    isTierResolutionMatch,
    taskReferenceDisplayBlobId,
    taskReferenceOriginalBlobId,
    cardParamSummary,
    renderImageContextMenu,
    summarizeResponse,
    responseStreamTextFromPayload,
    consumeResponseTextStream,
    resolveResponsePayload,
    extractResponseText,
    agentTextProfile,
    configuredAgentTextProfile,
    agentTextProfileInvalidReason,
    agentWebSearchSupported,
    agentRequestTimeoutSeconds,
    agentFailureDetail,
    activeAgentHasPending,
    buildAgentRequestPayload,
    renderSafeMarkdown,
    extractAgentPromptOptions,
    recommendedAgentPromptOption,
    parseAgentOptionSelection,
    renderAgentMessage,
    buildWorkflowAgentRequestPayload,
    postAgentResponsesRequest,
    workflowImageParams,
    extractImagePromptFromAgentText,
    extractAgentImagePrompts,
    cleanAgentImagePrompt,
    cleanNegativeAgentPrompt,
    migrateAgentThreads,
    createAgentThread,
    deleteAgentThread,
    clipboardImageFiles,
    handlePaste,
    branchAgentThreadFromMessage,
    clearAgentThreadMessages,
    agentImageSettings,
    agentImageParams,
    agentImageProfile,
    setAgentImageParam,
    renderSidebar,
    renderAgentStage,
    renderAgentComposer,
    renderWorkflowWorkspace,
    renderPopover,
    loadRuntime,
    writeStore,
    setTestTasks: (tasks) => { state.tasks = Array.isArray(tasks) ? tasks : []; },
    setTestState: (patch = {}) => {
      if (patch.profiles) state.profiles = patch.profiles;
      if (patch.activeProfileId !== undefined) state.activeProfileId = patch.activeProfileId;
      if (patch.activeImageProfileId !== undefined) state.activeImageProfileId = patch.activeImageProfileId;
      if (patch.agentConfig) state.agentConfig = { ...state.agentConfig, ...patch.agentConfig };
      if (patch.agent) state.agent = migrateAgentThreads({ ...state.agent, ...patch.agent });
      if (patch.preferences) state.preferences = { ...state.preferences, ...patch.preferences };
      if (patch.settings) state.settings = { ...state.settings, ...patch.settings };
      if (patch.confirmDialog !== undefined) state.confirmDialog = patch.confirmDialog;
      if (patch.mode !== undefined) state.mode = patch.mode;
      if (patch.references) state.references = patch.references;
      if (patch.galleryVirtual) state.galleryVirtual = { ...state.galleryVirtual, ...patch.galleryVirtual };
    },
    getTestState: () => JSON.parse(JSON.stringify({
      profiles: state.profiles,
      activeProfileId: state.activeProfileId,
      activeImageProfileId: state.activeImageProfileId,
      agentConfig: state.agentConfig,
      agent: state.agent,
      preferences: state.preferences,
      settings: state.settings,
      runtime: state.runtime,
      tasks: state.tasks,
      references: state.references,
      galleryVirtual: state.galleryVirtual,
      agentScrollLock: state.agentScrollLock,
      agentScrollState: state.agentScrollState,
      confirmDialog: state.confirmDialog,
      mode: state.mode
    }))
  });
}
function summarizeResponse(response) {
  const binaryKeys = new Set([
    'b64_json',
    'b64Json',
    'base64',
    'image_base64',
    'imageBase64',
    'data_url',
    'dataUrl',
    'image_data_url',
    'imageDataUrl'
  ]);
  const visit = (value, depth = 0) => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      if (value.startsWith('data:image/') || value.length > 2000) return `[text:${value.length}]`;
      return value;
    }
    if (typeof value !== 'object') return value;
    if (depth > 6) return '[depth-truncated]';
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => visit(item, depth + 1));
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (binaryKeys.has(key)) {
        out[key] = item ? '[image-data]' : item;
      } else {
        out[key] = visit(item, depth + 1);
      }
    }
    return out;
  };
  return visit(response);
}
async function retryTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  await generateImageTask(task);
}
async function topUpTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  const actual = Number(task.actualCount || task.images?.length || 0);
  const expected = Number(task.expectedCount || task.requestedParams?.count || task.count || actual);
  const missing = Math.max(1, expected - actual);
  await generateImageTask({
    ...task,
    requestedParams: { ...(task.requestedParams || requestedParams(imageProfile())), count: missing },
    count: missing
  });
}
function reuseTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  if (state.preferences?.reuseTaskApiProfileTemporarily && task.profileId) {
    const profile = imageProfiles().find((item) => profileId(item) === task.profileId);
    if (profile) {
      state.activeImageProfileId = profileId(profile);
      state.activeProfileId = profileId(profile);
      writeComposerSessionSettings();
    }
  }
  state.composerPrompt = task.prompt || '';
  if (task.requestedParams) {
    state.settings.quality = task.requestedParams.quality || state.settings.quality;
    state.settings.output_format = task.requestedParams.format || state.settings.output_format;
    state.settings.n = task.requestedParams.count || state.settings.n;
  }
  state.modal = null;
  state.mode = 'gallery';
  persistRender();
  toast('已复用提示词和参数');
}
async function deleteTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  state.confirmDialog = {
    kind: 'delete-task',
    payload: { id },
    kicker: '删除任务',
    title: '删除这个生图任务？',
    message: '任务卡片、生成图片和本地收藏状态都会从当前浏览器移除，此操作不可恢复。',
    confirmText: '删除任务'
  };
  render();
}
async function performDeleteTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  await Promise.all((task.images || []).map((img) => deleteBlob(img.blobId).catch(() => {})));
  for (const img of task.images || []) revokeMapEntry(state.imageUrls, img.blobId);
  await Promise.all(taskReferenceSnapshots(task).map(async (ref) => {
    await deleteBlob(ref.blobId).catch(() => {});
    if (ref.originalBlobId && ref.originalBlobId !== ref.blobId) await deleteBlob(ref.originalBlobId).catch(() => {});
    if (ref.compositedBlobId && ref.compositedBlobId !== ref.blobId) await deleteBlob(ref.compositedBlobId).catch(() => {});
    if (ref.maskBlobId) await deleteBlob(ref.maskBlobId).catch(() => {});
    for (const key of [...state.refUrls.keys()].filter((item) => item.includes(`:${id}:`) || item.includes(`:${ref.id}:`))) revokeMapEntry(state.refUrls, key);
  }));
  state.tasks = state.tasks.filter((t) => t.id !== id);
  delete state.favorites[id];
  state.selectedTaskIds = state.selectedTaskIds.filter((tid) => tid !== id);
  if (state.modal === id) state.modal = null;
  persistRender();
}
async function deleteSelected() {
  if (!state.selectedTaskIds.length) return toast('未选择任务');
  const ids = [...state.selectedTaskIds];
  state.confirmDialog = {
    kind: 'delete-selected',
    payload: { ids },
    kicker: '批量删除',
    title: `删除选中的 ${ids.length} 个任务？`,
    message: '选中任务和对应本地图片都会被移除，此操作不可恢复。',
    confirmText: '删除选中项'
  };
  render();
}
async function performDeleteSelected(ids = []) {
  const deleteIds = ids.length ? ids : [...state.selectedTaskIds];
  for (const id of deleteIds) {
    const task = state.tasks.find((t) => t.id === id);
    if (task) {
      await Promise.all((task.images || []).map((img) => deleteBlob(img.blobId).catch(() => {})));
      for (const img of task.images || []) revokeMapEntry(state.imageUrls, img.blobId);
      await Promise.all(taskReferenceSnapshots(task).map(async (ref) => {
        await deleteBlob(ref.blobId).catch(() => {});
        if (ref.originalBlobId && ref.originalBlobId !== ref.blobId) await deleteBlob(ref.originalBlobId).catch(() => {});
        if (ref.compositedBlobId && ref.compositedBlobId !== ref.blobId) await deleteBlob(ref.compositedBlobId).catch(() => {});
        if (ref.maskBlobId) await deleteBlob(ref.maskBlobId).catch(() => {});
        for (const key of [...state.refUrls.keys()].filter((item) => item.includes(`:${id}:`) || item.includes(`:${ref.id}:`))) revokeMapEntry(state.refUrls, key);
      }));
    }
  }
  state.tasks = state.tasks.filter((task) => !deleteIds.includes(task.id));
  state.selectedTaskIds = state.selectedTaskIds.filter((id) => !deleteIds.includes(id));
  if (deleteIds.includes(state.modal)) state.modal = null;
  persistRender();
}
async function runConfirmDialog() {
  const dialog = state.confirmDialog;
  if (!dialog) return;
  if (dialog.dialogType === 'text-input') {
    closeConfirmDialog(String(dialog.value || '').trim());
    return;
  }
  if (dialog.dialogType === 'copy-link') {
    closeConfirmDialog(null);
    return;
  }
  state.confirmDialog = null;
  if (dialog.kind === 'delete-task') {
    await performDeleteTask(dialog.payload?.id);
    return;
  }
  if (dialog.kind === 'delete-selected') {
    await performDeleteSelected(dialog.payload?.ids || []);
    return;
  }
  if (dialog.kind === 'delete-workflow') {
    performDeleteWorkflow(dialog.payload?.id);
    return;
  }
  if (dialog.kind === 'delete-project') {
    await performDeleteProject(dialog.payload?.id);
    return;
  }
  if (dialog.kind === 'clear-agent-thread') {
    const thread = activeAgentThread();
    if (!thread) return;
    state.agent = clearAgentThreadMessages(state.agent, thread.id);
    persistRender();
    return;
  }
  if (dialog.kind === 'delete-agent-thread') {
    state.agent = deleteAgentThread(state.agent, dialog.payload?.projectId, dialog.payload?.threadId);
    state.agentScrollIntent = 'force-bottom';
    persistRender();
    return;
  }
  if (dialog.kind === 'reference-action') {
    openMaskEditor(dialog.payload?.refId);
  }
}
async function downloadSelected() {
  if (!routeAllowed('task-selection')) return toast('后台习惯配置已禁用当前 ZIP 下载入口');
  const selected = state.tasks.filter((task) => state.selectedTaskIds.includes(task.id));
  if (!selected.length) return toast('未选择任务');
  const missing = selected.filter((task) => !(task.images || []).length);
  if (missing.length) return toast('选中项包含不可下载任务，批量下载已中止');
  const manifest = [];
  const entries = [];
  for (const task of selected) {
    const item = {
      id: task.id,
      prompt: task.prompt,
      params: task.requestedParams,
      workflow: task.workflowId ? {
        workflowId: task.workflowId,
        workflowRunId: task.workflowRunId,
        workflowNodeId: task.workflowNodeId,
        batchRowId: task.batchRowId,
        batchLabel: task.batchLabel,
        workflowName: task.workflowName
      } : null,
      images: []
    };
    for (let i = 0; i < task.images.length; i++) {
      const image = task.images[i];
      const blob = await getBlob(image.blobId).catch(() => null);
      if (!blob) return toast('选中项包含不可下载图片，批量下载已中止');
      const ext = (blob.type.split('/')[1] || image.type?.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const name = `${task.id}/image-${i + 1}.${ext}`;
      entries.push({ name, blob });
      item.images.push({ ...image, file: name });
    }
    manifest.push(item);
  }
  entries.push({ name: 'metadata.json', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json;charset=utf-8' }) });
  entries.push({ name: 'workflow-metadata.json', blob: new Blob([JSON.stringify(manifest.filter((item) => item.workflow), null, 2)], { type: 'application/json;charset=utf-8' }) });
  const zip = await createZip(entries);
  downloadBlob(zip, `gpt-image2-assets-${Date.now()}.zip`);
  toast(`已打包 ${selected.length} 个任务`);
}
function routeAllowed(route) {
  const routes = state.preferences?.zipDownloadRoutes;
  return !Array.isArray(routes) || !routes.length || routes.includes(route);
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function createZip(entries) {
  const encoder = new TextEncoder();
  const fileParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const bytes = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(bytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    fileParts.push(local, bytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const cview = new DataView(central.buffer);
    cview.setUint32(0, 0x02014b50, true);
    cview.setUint16(4, 20, true);
    cview.setUint16(6, 20, true);
    cview.setUint16(8, 0, true);
    cview.setUint16(10, 0, true);
    cview.setUint32(16, crc, true);
    cview.setUint32(20, bytes.length, true);
    cview.setUint32(24, bytes.length, true);
    cview.setUint16(28, nameBytes.length, true);
    cview.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + bytes.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const eview = new DataView(end.buffer);
  eview.setUint32(0, 0x06054b50, true);
  eview.setUint16(8, entries.length, true);
  eview.setUint16(10, entries.length, true);
  eview.setUint32(12, centralSize, true);
  eview.setUint32(16, offset, true);
  return new Blob([...fileParts, ...centralParts, end], { type: 'application/zip' });
}
function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
function toggleSelect(id) {
  state.selectedTaskIds = state.selectedTaskIds.includes(id) ? state.selectedTaskIds.filter((x) => x !== id) : [...state.selectedTaskIds, id];
  writeStore();
  const card = $(`.asset-card[data-task-id="${cssEscape(id)}"]`);
  if (card) card.classList.toggle('selected', state.selectedTaskIds.includes(id));
  updateBatchActionsDom();
}
function favoriteTask(id) {
  state.favorites[id] = !state.favorites[id];
  writeStore();
  const button = $(`.asset-card[data-task-id="${cssEscape(id)}"] [data-action="favorite-task"]`);
  if (button) {
    button.classList.toggle('active', !!state.favorites[id]);
    button.innerHTML = `<span aria-hidden="true">${state.favorites[id] ? '★' : '☆'}</span>`;
  }
  const detailButton = $(`.detail-actions [data-action="favorite-task"][data-id="${cssEscape(id)}"]`);
  if (detailButton) detailButton.classList.toggle('active', !!state.favorites[id]);
}
async function editOutput(id) {
  const task = state.tasks.find((t) => t.id === id);
  const image = task && (task.images || [])[0];
  if (!image) return toast('当前任务没有可编辑图片');
  const blob = await getBlob(image.blobId);
  if (!blob) return toast('原图不在当前浏览器本地，无法编辑');
  const blobId = await putBlob(blob);
  const ref = { id: uid('ref'), blobId, name: `edit-${task.id}.png`, type: blob.type, width: image.width, height: image.height };
  state.references = [ref, ...state.references].slice(0, referenceLimit());
  state.composerPrompt = task.prompt || state.composerPrompt;
  state.modal = null;
  persistRender();
  toast('已加入参考图，点击缩略图可进入编辑遮罩');
}

function formatElapsed(task) {
  const ms = task.apiElapsedMs || task.elapsedMs || ((task.status === 'running' || task.status === 'queued') ? Date.now() - (task.startedAt || task.createdAt || Date.now()) : 0);
  if (!ms) return '00:00';
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function formatTime(ts) {
  if (!ts) return '未知';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

let promptBootstrapCache = null;
let promptBootstrapPromise = null;
let promptPreviewCache = null;
let promptPreviewPromise = null;
let promptSearchCache = null;
let promptSearchPromise = null;
const promptCategoryPagePromises = new Map();
const promptDetailChunkPromises = new Map();
const promptPageCache = new Map();
function applyLoadedPromptBootstrap(data) {
  if (!data || !Array.isArray(data.categories)) throw new Error('invalid prompt bootstrap');
  promptBootstrapCache = data;
  if (data.categoryPreviewPages && !promptPreviewCache) {
    promptPreviewCache = {
      generatedAt: data.generatedAt,
      pageSize: data.pageSize || PROMPT_PAGE_SIZE,
      categoryPreviewPages: data.categoryPreviewPages
    };
  }
  primePromptBootstrapCache(data);
  return data;
}
function readInlinePromptBootstrap() {
  if (promptBootstrapCache) return promptBootstrapCache;
  const node = typeof document !== 'undefined' ? document.getElementById('promptFastBootstrap') : null;
  if (!node?.textContent) return null;
  try {
    return applyLoadedPromptBootstrap(JSON.parse(node.textContent));
  } catch (err) {
    console.warn('[home-v3] inline prompt bootstrap invalid', err);
    return null;
  }
}
function promptRepoPageCacheKey(page, overrides = {}) {
  return JSON.stringify({
    page: Number(page) || 1,
    limit: overrides.limit || PROMPT_PAGE_SIZE,
    category: overrides.category || state.promptRepo.category || 'all',
    query: overrides.query !== undefined ? overrides.query : (state.promptRepo.query || '')
  });
}
function rememberPromptPageCache(key, data) {
  if (!key || !data) return;
  promptPageCache.delete(key);
  promptPageCache.set(key, data);
  while (promptPageCache.size > PROMPT_REPO_CACHE_LIMIT) {
    const oldest = promptPageCache.keys().next().value;
    promptPageCache.delete(oldest);
  }
}
function applyPromptPageData(data, page) {
  const prompts = Array.isArray(data?.prompts) ? data.prompts : [];
  state.promptRepo.page = data?.page || page;
  state.promptRepo.pages = data?.pages || 1;
  state.promptRepo.total = data?.total || 0;
  if (page <= 1) state.promptRepo.items = prompts;
  else state.promptRepo.items.push(...prompts);
}
async function loadPromptBootstrap() {
  const inline = readInlinePromptBootstrap();
  if (inline) return inline;
  if (promptBootstrapCache) return promptBootstrapCache;
  if (!promptBootstrapPromise) {
    promptBootstrapPromise = fetch(PROMPT_FAST_BOOTSTRAP_URL, {
      credentials: 'same-origin',
      cache: 'force-cache'
    }).then(async (res) => {
      if (!res.ok) throw new Error(`prompt bootstrap ${res.status}`);
      const data = await res.json();
      return applyLoadedPromptBootstrap(data);
    }).catch((err) => {
      promptBootstrapPromise = null;
      throw err;
    });
  }
  return promptBootstrapPromise;
}
function warmPromptBootstrap() {
  loadPromptBootstrap()
    .then(() => warmPromptPreviewBundle())
    .catch((err) => console.warn('[home-v3] prompt bootstrap unavailable', err));
}
async function loadPromptPreviewBundle() {
  if (promptPreviewCache) return promptPreviewCache;
  if (!promptPreviewPromise) {
    promptPreviewPromise = fetch(PROMPT_FAST_PREVIEWS_URL, {
      credentials: 'same-origin',
      cache: 'force-cache'
    }).then(async (res) => {
      if (!res.ok) throw new Error(`prompt previews ${res.status}`);
      const data = await res.json();
      if (!data || !data.categoryPreviewPages) throw new Error('invalid prompt previews');
      promptPreviewCache = data;
      return data;
    }).catch((err) => {
      promptPreviewPromise = null;
      throw err;
    });
  }
  return promptPreviewPromise;
}
function warmPromptPreviewBundle() {
  loadPromptPreviewBundle().catch((err) => console.warn('[home-v3] prompt previews unavailable', err));
}
async function loadPromptSearchIndex() {
  if (promptSearchCache) return promptSearchCache;
  if (!promptSearchPromise) {
    promptSearchPromise = fetch(PROMPT_FAST_SEARCH_URL, {
      credentials: 'same-origin',
      cache: 'force-cache'
    }).then(async (res) => {
      if (!res.ok) throw new Error(`prompt search ${res.status}`);
      const data = await res.json();
      const prompts = Array.isArray(data?.prompts) ? data.prompts : [];
      if (!prompts.length) throw new Error('invalid prompt search index');
      promptSearchCache = { ...data, prompts };
      return promptSearchCache;
    }).catch((err) => {
      promptSearchPromise = null;
      throw err;
    });
  }
  return promptSearchPromise;
}
function warmPromptSearchIndex() {
  loadPromptSearchIndex().catch((err) => console.warn('[home-v3] prompt search unavailable', err));
}
function schedulePromptSearchWarmup(delay = 6000) {
  if (promptSearchCache || promptSearchPromise) return;
  setTimeout(() => {
    if (state.promptRepo?.open && state.promptRepo.loading) return;
    warmPromptSearchIndex();
  }, delay);
}
function normalizePromptSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
function promptSearchTokens(query) {
  const normalized = normalizePromptSearchText(query);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}
function promptSearchHaystack(item) {
  return normalizePromptSearchText(`${item?.q || ''} ${item?.p || ''}`);
}
function searchPromptIndex(query, category = 'all', limit = PROMPT_PAGE_SIZE) {
  const tokens = promptSearchTokens(query);
  if (!tokens.length || !promptSearchCache?.prompts?.length) return null;
  const cleanCategory = category || 'all';
  const ranked = [];
  promptSearchCache.prompts.forEach((item, index) => {
    if (cleanCategory !== 'all' && item.c !== cleanCategory) return;
    const haystack = promptSearchHaystack(item);
    if (!tokens.every((token) => haystack.includes(token))) return;
    const title = normalizePromptSearchText(item.t || '');
    const categoryText = normalizePromptSearchText(item.c || '');
    let score = 0;
    tokens.forEach((token) => {
      if (title.includes(token)) score += 8;
      if (categoryText.includes(token)) score += 3;
      if (haystack.startsWith(token)) score += 2;
    });
    ranked.push({ item: { ...item, partial: false }, index, score });
  });
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  const prompts = ranked.slice(0, limit).map((entry) => entry.item);
  return {
    prompts,
    total: ranked.length,
    page: 1,
    limit,
    pages: 1,
    source: 'prebuilt-search-index'
  };
}
function promptPreviewSearchPool() {
  const seen = new Set();
  const prompts = [];
  const addItems = (items) => {
    (Array.isArray(items) ? items : []).forEach((item) => {
      const key = String(item?.id || '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      prompts.push(item);
    });
  };
  addItems(promptBootstrapCache?.allFirstPage?.prompts);
  const pages = promptPreviewCache?.categoryPreviewPages || promptBootstrapCache?.categoryPreviewPages || {};
  Object.values(pages).forEach((page) => addItems(page?.prompts));
  return prompts;
}
function searchPromptPreviews(query, category = 'all', limit = PROMPT_PAGE_SIZE) {
  const tokens = promptSearchTokens(query);
  if (!tokens.length) return null;
  const cleanCategory = category || 'all';
  const ranked = [];
  promptPreviewSearchPool().forEach((item, index) => {
    if (cleanCategory !== 'all' && item.c !== cleanCategory) return;
    const haystack = promptSearchHaystack(item);
    if (!tokens.every((token) => haystack.includes(token))) return;
    const title = normalizePromptSearchText(item.t || '');
    let score = 0;
    tokens.forEach((token) => {
      if (title.includes(token)) score += 8;
      if (haystack.startsWith(token)) score += 2;
    });
    ranked.push({ item, index, score });
  });
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return {
    prompts: ranked.slice(0, limit).map((entry) => ({ ...entry.item, partial: true })),
    total: ranked.length,
    page: 1,
    limit,
    pages: 1,
    source: 'prebuilt-preview-search'
  };
}
function pageDataFromPromptBootstrap(category, limit = PROMPT_PAGE_SIZE) {
  const bootstrap = promptBootstrapCache;
  if (!bootstrap || (bootstrap.pageSize || PROMPT_PAGE_SIZE) < limit) return null;
  const cleanCategory = category || 'all';
  if (cleanCategory !== 'all') {
    const cached = promptPageCache.get(promptRepoPageCacheKey(1, { category: cleanCategory, query: '' }));
    if (cached) return cached;
  }
  const source = cleanCategory === 'all'
    ? bootstrap.allFirstPage
    : (promptPreviewCache?.categoryPreviewPages?.[cleanCategory] || bootstrap.categoryPreviewPages?.[cleanCategory]);
  if (!source || !Array.isArray(source.prompts)) return null;
  return {
    prompts: source.prompts.slice(0, limit),
    total: source.total || 0,
    page: 1,
    limit,
    pages: Math.ceil((source.total || 0) / limit),
    source: source.source || 'prebuilt-bootstrap'
  };
}
async function loadPromptCategoryPage(category) {
  const cleanCategory = category || 'all';
  const cached = pageDataFromPromptBootstrap(cleanCategory);
  if (cached) return cached;
  const bootstrap = await loadPromptBootstrap();
  const file = bootstrap?.categoryFiles?.[cleanCategory];
  if (!file || String(file).includes('..')) return null;
  if (!promptCategoryPagePromises.has(cleanCategory)) {
    promptCategoryPagePromises.set(cleanCategory, fetch(`/prompts_fast/${file}?v=${PROMPT_FAST_VERSION}`, {
      credentials: 'same-origin',
      cache: 'force-cache'
    }).then(async (res) => {
      if (!res.ok) throw new Error(`prompt category ${res.status}`);
      const data = await res.json();
      rememberPromptPageCache(promptRepoPageCacheKey(1, { category: cleanCategory, query: '' }), data);
      return data;
    }).catch((err) => {
      promptCategoryPagePromises.delete(cleanCategory);
      throw err;
    }));
  }
  return promptCategoryPagePromises.get(cleanCategory);
}
async function loadPromptDetailChunk(file) {
  const cleanFile = String(file || '');
  if (!cleanFile || cleanFile.includes('..') || !cleanFile.startsWith('details/')) return null;
  if (!promptDetailChunkPromises.has(cleanFile)) {
    promptDetailChunkPromises.set(cleanFile, fetch(`/prompts_fast/${cleanFile}?v=${PROMPT_FAST_VERSION}`, {
      credentials: 'same-origin',
      cache: 'force-cache'
    }).then(async (res) => {
      if (!res.ok) throw new Error(`prompt detail ${res.status}`);
      return res.json();
    }).catch((err) => {
      promptDetailChunkPromises.delete(cleanFile);
      throw err;
    }));
  }
  return promptDetailChunkPromises.get(cleanFile);
}
function primePromptBootstrapCache(data) {
  if (!data || !Array.isArray(data.categories)) return;
  const categories = data.categories.length ? data.categories : ['all'];
  const allData = data.allFirstPage;
  if (allData) rememberPromptPageCache(promptRepoPageCacheKey(1, { category: 'all', query: '' }), allData);
}
function applyPromptBootstrapToRepo(data, requestSeq) {
  if (!state.promptRepo.open) return false;
  promptBootstrapCache = data;
  primePromptBootstrapCache(data);
  state.promptRepo.categories = data.categories?.length ? data.categories : ['all'];
  state.promptRepo.categoriesLoading = false;
  if (String(state.promptRepo.query || '').trim()) return false;
  const pageData = pageDataFromPromptBootstrap(state.promptRepo.category || 'all');
  if (!pageData) return false;
  applyPromptPageData(pageData, 1);
  state.promptRepo.loading = false;
  state.promptRepo.loadingLabel = '';
  return true;
}
function restorePromptRepoScroll(scrollTop) {
  if (scrollTop === null || scrollTop === undefined) return;
  state.promptRepo.scrollLockUntil = Date.now() + 240;
  requestAnimationFrame(() => {
    const nextList = $('#promptList');
    if (!nextList) return;
    nextList.scrollTop = Math.min(scrollTop, Math.max(0, nextList.scrollHeight - nextList.clientHeight));
    state.promptRepo.scrollTop = nextList.scrollTop;
  });
}
function restorePromptCategoryScroll(scrollTop) {
  if (scrollTop === null || scrollTop === undefined) return;
  const restore = () => {
    const categories = $('#promptCategories');
    if (!categories) return;
    categories.scrollTop = Math.min(scrollTop, Math.max(0, categories.scrollHeight - categories.clientHeight));
    state.promptRepo.categoryScrollTop = categories.scrollTop;
  };
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 80);
  });
}
function capturePromptRepoViewportSnapshot() {
  const promptList = $('#promptList');
  const promptCategories = $('#promptCategories');
  const snapshot = {
    scrollTop: state.promptRepo.scrollTop || 0,
    categoryScrollTop: state.promptRepo.categoryScrollTop || 0,
    anchorIndex: '',
    anchorOffset: 0
  };
  if (promptList) {
    state.promptRepo.scrollTop = promptList.scrollTop;
    state.promptRepo.viewportHeight = promptList.clientHeight || state.promptRepo.viewportHeight || 620;
    snapshot.scrollTop = state.promptRepo.scrollTop || 0;
    const listTop = promptList.getBoundingClientRect().top;
    const cards = [...promptList.querySelectorAll('.prompt-card:not(.prompt-skeleton)')];
    const anchor = cards.find((card) => {
      const rect = card.getBoundingClientRect();
      return rect.bottom > listTop + 8;
    }) || cards[0];
    if (anchor) {
      snapshot.anchorIndex = anchor.dataset.index || '';
      snapshot.anchorOffset = anchor.getBoundingClientRect().top - listTop;
    }
  }
  if (promptCategories) {
    state.promptRepo.categoryScrollTop = promptCategories.scrollTop;
    snapshot.categoryScrollTop = promptCategories.scrollTop;
  }
  return snapshot;
}
function restorePromptRepoViewportSnapshot(snapshot) {
  if (!snapshot) return;
  state.promptRepo.scrollLockUntil = Date.now() + 240;
  requestAnimationFrame(() => {
    const nextList = $('#promptList');
    if (nextList) {
      const maxTop = Math.max(0, nextList.scrollHeight - nextList.clientHeight);
      nextList.scrollTop = Math.min(snapshot.scrollTop || 0, maxTop);
      if (snapshot.anchorIndex) {
        const anchor = nextList.querySelector(`.prompt-card[data-index="${snapshot.anchorIndex}"]`);
        if (anchor) {
          const listTop = nextList.getBoundingClientRect().top;
          const delta = (anchor.getBoundingClientRect().top - listTop) - (snapshot.anchorOffset || 0);
          if (Math.abs(delta) > 1) {
            nextList.scrollTop = Math.min(Math.max(0, nextList.scrollTop + delta), Math.max(0, nextList.scrollHeight - nextList.clientHeight));
          }
        }
      }
      state.promptRepo.scrollTop = nextList.scrollTop;
    }
    const categories = $('#promptCategories');
    if (categories) {
      categories.scrollTop = Math.min(snapshot.categoryScrollTop || 0, Math.max(0, categories.scrollHeight - categories.clientHeight));
      state.promptRepo.categoryScrollTop = categories.scrollTop;
    }
  });
}
function consumePromptRepoPointerSnapshot() {
  const snapshot = state.promptRepo?.pointerOpenSnapshot || null;
  delete state.promptRepo.pointerOpenSnapshot;
  return snapshot;
}
function stabilizePromptRepoViewport(snapshot) {
  if (!snapshot) return;
  restorePromptRepoViewportSnapshot(snapshot);
  nextRenderFrame(() => restorePromptRepoViewportSnapshot(snapshot));
  nextRenderFrame(() => nextRenderFrame(() => restorePromptRepoViewportSnapshot(snapshot)));
}
function closePromptRepoDetailOverlay() {
  const snapshot = state.promptRepo.detailReturnSnapshot || state.promptRepo.pointerOpenSnapshot || capturePromptRepoViewportSnapshot();
  delete state.promptRepo.pointerOpenSnapshot;
  delete state.promptRepo.detailReturnSnapshot;
  state.promptRepo.detail = null;
  if (!syncPromptRepoOverlays()) render();
  focusPromptRepoShell();
  stabilizePromptRepoViewport(snapshot);
}
function closePromptRepoImageViewerOverlay() {
  const snapshot = capturePromptRepoViewportSnapshot();
  state.promptRepo.imageViewer = null;
  if (!syncPromptRepoOverlays()) render();
  focusPromptRepoShell();
  stabilizePromptRepoViewport(snapshot);
}
function queuePromptRepoViewportRestore() {
  if (!state.promptRepo?.open) return;
  state.promptRepo.restoreAfterRender = capturePromptRepoViewportSnapshot();
}
function flushPromptRepoViewportRestore() {
  const snapshot = state.promptRepo?.restoreAfterRender;
  if (!snapshot) return;
  delete state.promptRepo.restoreAfterRender;
  restorePromptRepoViewportSnapshot(snapshot);
}
function openPromptRepo() {
  state.promptRepo = {
    open: true,
    page: 0,
    pages: 1,
    total: 0,
    loading: true,
    items: [],
    query: state.promptRepo.query || '',
    category: state.promptRepo.category || 'all',
    categories: state.promptRepo.categories || ['all'],
    categoriesLoading: !state.promptRepo.categories?.length || state.promptRepo.categories.length <= 1,
    loadingLabel: state.promptRepo.query ? '搜索索引加载中...' : '加载提示词中...',
    detail: null,
    imageViewer: null,
    composing: false,
    requestSeq: (state.promptRepo.requestSeq || 0) + 1,
    scrollTop: 0,
    categoryScrollTop: state.promptRepo.categoryScrollTop || 0,
    viewportHeight: state.promptRepo.viewportHeight || 620
  };
  render();
  const requestSeq = state.promptRepo.requestSeq;
  warmPromptPreviewBundle();
  setTimeout(() => {
    if (!state.promptRepo.open || state.promptRepo.requestSeq !== requestSeq || !state.promptRepo.loading || state.promptRepo.items.length) return;
    loadPromptCategories();
    loadPromptPage({ force: true });
  }, 4500);
  loadPromptBootstrap().then((data) => {
    warmPromptPreviewBundle();
    schedulePromptSearchWarmup(5000);
    if (applyPromptBootstrapToRepo(data, requestSeq)) {
      if (!syncPromptRepoView()) render();
      restorePromptCategoryScroll(state.promptRepo.categoryScrollTop || 0);
    } else if (state.promptRepo.query) {
      loadPromptSearchResults(requestSeq, state.promptRepo.categoryScrollTop || 0);
    } else if (!state.promptRepo.query && (state.promptRepo.category || 'all') !== 'all') {
      loadPromptPreviewBundle().then(() => {
        if (applyPromptCategoryPreview(state.promptRepo.category, requestSeq, state.promptRepo.categoryScrollTop || 0)) return;
        return loadPromptCategoryPage(state.promptRepo.category).then((pageData) => {
          if (!pageData || !state.promptRepo.open || state.promptRepo.requestSeq !== requestSeq) return;
          applyPromptPageData(pageData, 1);
          state.promptRepo.loading = false;
          state.promptRepo.loadingLabel = '';
          if (!syncPromptRepoView()) render();
          restorePromptCategoryScroll(state.promptRepo.categoryScrollTop || 0);
        });
      }).catch(() => loadPromptPage({ force: true }));
    } else if (state.promptRepo.open && state.promptRepo.requestSeq === requestSeq) {
      loadPromptPage({ force: true });
    }
  }).catch(() => {
    loadPromptCategories();
    if (state.promptRepo.query) loadPromptSearchResults(requestSeq, state.promptRepo.categoryScrollTop || 0);
    else loadPromptPage({ force: true });
  });
}
let promptSearchTimer = null;
function debouncedPromptSearch(delay = 260) {
  clearTimeout(promptSearchTimer);
  promptSearchTimer = setTimeout(() => {
    resetPromptRepoList();
  }, delay);
}
function applyPromptSearchResults(data, requestSeq, categoryScrollTop) {
  if (!data || !state.promptRepo.open || state.promptRepo.requestSeq !== requestSeq) return false;
  applyPromptPageData(data, 1);
  state.promptRepo.loading = false;
  state.promptRepo.loadingLabel = '';
  if (!syncPromptRepoView()) render();
  restorePromptCategoryScroll(categoryScrollTop);
  return true;
}
function loadPromptSearchResults(requestSeq, categoryScrollTop) {
  const runSearch = () => {
    const data = searchPromptIndex(state.promptRepo.query, state.promptRepo.category || 'all');
    if (data) {
      applyPromptSearchResults(data, requestSeq, categoryScrollTop);
      return;
    }
    if (!state.promptRepo.open || state.promptRepo.requestSeq !== requestSeq) return;
    state.promptRepo.loading = false;
    state.promptRepo.loadingLabel = '';
    applyPromptPageData({ prompts: [], total: 0, page: 1, limit: PROMPT_PAGE_SIZE, pages: 1, source: 'prebuilt-search-empty' }, 1);
    if (!syncPromptRepoView()) render();
    restorePromptCategoryScroll(categoryScrollTop);
  };
  if (promptSearchCache) {
    runSearch();
    return;
  }
  loadPromptSearchIndex()
    .then(runSearch)
    .catch(() => {
      if (!state.promptRepo.open || state.promptRepo.requestSeq !== requestSeq) return;
      state.promptRepo.loadingLabel = '搜索索引不可用，正在使用兼容接口...';
      if (!syncPromptRepoView()) render();
      restorePromptCategoryScroll(categoryScrollTop);
      loadPromptPage({ force: true, skipCache: true });
    });
}
function applyPromptCategoryPreview(category, requestSeq, categoryScrollTop) {
  const pageData = pageDataFromPromptBootstrap(category || 'all');
  if (!pageData || !state.promptRepo.open || state.promptRepo.requestSeq !== requestSeq) return false;
  applyPromptPageData(pageData, 1);
  state.promptRepo.loading = false;
  state.promptRepo.loadingLabel = '';
  if (!syncPromptRepoView()) render();
  restorePromptCategoryScroll(categoryScrollTop);
  return true;
}
function resetPromptRepoList(options = {}) {
  const categoryScrollTop = options.categoryScrollTop ?? state.promptRepo.categoryScrollTop ?? 0;
  const keepExistingUntilLoaded = !!options.keepExistingUntilLoaded && state.promptRepo.items.length > 0;
  state.promptRepo.page = 0;
  state.promptRepo.pages = 1;
  if (!keepExistingUntilLoaded) {
    state.promptRepo.total = 0;
    state.promptRepo.items = [];
  }
  state.promptRepo.requestSeq = (state.promptRepo.requestSeq || 0) + 1;
  state.promptRepo.scrollTop = 0;
  state.promptRepo.categoryScrollTop = categoryScrollTop;
  const requestSeq = state.promptRepo.requestSeq;
  if (state.promptRepo.query) {
    const searchData = promptSearchCache ? searchPromptIndex(state.promptRepo.query, state.promptRepo.category || 'all') : null;
    if (searchData) {
      applyPromptSearchResults(searchData, requestSeq, categoryScrollTop);
      return;
    }
    let previewSearchData = searchPromptPreviews(state.promptRepo.query, state.promptRepo.category || 'all');
    if (!previewSearchData?.prompts?.length && (state.promptRepo.category || 'all') !== 'all') {
      previewSearchData = searchPromptPreviews(state.promptRepo.query, 'all');
    }
    if (previewSearchData && previewSearchData.prompts.length) {
      applyPromptSearchResults(previewSearchData, requestSeq, categoryScrollTop);
      loadPromptSearchIndex().then(() => {
        if (!state.promptRepo.open || state.promptRepo.requestSeq !== requestSeq || !String(state.promptRepo.query || '').trim()) return;
        const fullSearchData = searchPromptIndex(state.promptRepo.query, state.promptRepo.category || 'all');
        if (fullSearchData) applyPromptSearchResults(fullSearchData, requestSeq, categoryScrollTop);
      }).catch((err) => console.warn('[home-v3] prompt search index unavailable', err));
      return;
    }
    state.promptRepo.loading = true;
    state.promptRepo.loadingLabel = promptSearchPromise || promptSearchCache ? '搜索提示词中...' : '搜索索引加载中...';
    if (!syncPromptRepoView()) render();
    restorePromptCategoryScroll(categoryScrollTop);
    loadPromptSearchResults(requestSeq, categoryScrollTop);
    return;
  }
  const prebuilt = !state.promptRepo.query ? pageDataFromPromptBootstrap(state.promptRepo.category || 'all') : null;
  if (prebuilt) {
    applyPromptPageData(prebuilt, 1);
    state.promptRepo.loading = false;
    state.promptRepo.loadingLabel = '';
    if (!syncPromptRepoView()) render();
    restorePromptCategoryScroll(categoryScrollTop);
    return;
  }
  state.promptRepo.loading = true;
  state.promptRepo.loadingLabel = (state.promptRepo.category || 'all') === 'all' ? '加载提示词中...' : `加载 ${state.promptRepo.category} 分类...`;
  if (!syncPromptRepoView()) render();
  restorePromptCategoryScroll(categoryScrollTop);
  if (!state.promptRepo.query) {
    loadPromptBootstrap().then((data) => {
      if (applyPromptBootstrapToRepo(data, requestSeq)) {
        if (!syncPromptRepoView()) render();
        restorePromptCategoryScroll(categoryScrollTop);
      } else if ((state.promptRepo.category || 'all') !== 'all') {
        loadPromptPreviewBundle().then(() => {
          if (applyPromptCategoryPreview(state.promptRepo.category, requestSeq, categoryScrollTop)) return;
          return loadPromptCategoryPage(state.promptRepo.category).then((pageData) => {
            if (!pageData || !state.promptRepo.open || state.promptRepo.requestSeq !== requestSeq) return;
            applyPromptPageData(pageData, 1);
            state.promptRepo.loading = false;
            state.promptRepo.loadingLabel = '';
            if (!syncPromptRepoView()) render();
            restorePromptCategoryScroll(categoryScrollTop);
          });
        }).catch(() => loadPromptPage({ force: true }));
      } else if (state.promptRepo.open && state.promptRepo.requestSeq === requestSeq) {
        loadPromptPage({ force: true });
      }
    }).catch(() => loadPromptPage({ force: true }));
    return;
  }
  loadPromptPage({ force: true });
}
function setPromptCategory(category) {
  const categoriesEl = $('#promptCategories');
  const pendingCategoryScrollTop = Number.isFinite(state.promptRepo.pendingCategoryScrollTop) ? state.promptRepo.pendingCategoryScrollTop : null;
  const categoryScrollTop = pendingCategoryScrollTop !== null ? pendingCategoryScrollTop : (categoriesEl ? categoriesEl.scrollTop : (state.promptRepo.categoryScrollTop || 0));
  delete state.promptRepo.pendingCategoryScrollTop;
  state.promptRepo.category = category || 'all';
  state.promptRepo.detail = null;
  resetPromptRepoList({ categoryScrollTop, keepExistingUntilLoaded: false });
}
async function loadPromptCategories() {
  state.promptRepo.categoriesLoading = true;
  try {
    const data = await fetchJson('/api/prompts?categories=1');
    if (!state.promptRepo.open) return;
    state.promptRepo.categories = data.categories?.length ? data.categories : ['all'];
    if ((state.promptRepo.category || 'all') === 'all') state.promptRepo.total = data.total || state.promptRepo.total || 0;
    state.promptRepo.categoriesLoading = false;
    if (!syncPromptRepoView()) render();
  } catch (err) {
    if (!state.promptRepo.categories?.length) state.promptRepo.categories = ['all'];
    state.promptRepo.categoriesLoading = false;
  }
}
async function loadPromptPage(options = {}) {
  const force = !!options.force;
  const background = !!options.background;
  if (!state.promptRepo.open || (!force && state.promptRepo.loading) || state.promptRepo.page >= state.promptRepo.pages) return;
  const requestSeq = state.promptRepo.requestSeq || 0;
  const promptList = $('#promptList');
  const restoreScrollTop = promptList ? promptList.scrollTop : null;
  const page = state.promptRepo.page + 1;
  const cacheKey = promptRepoPageCacheKey(page);
  const cached = promptPageCache.get(cacheKey);
  if (cached && !options.skipCache) {
    applyPromptPageData(cached, page);
    state.promptRepo.loading = false;
    state.promptRepo.loadingLabel = '';
    if (!syncPromptRepoView()) render();
    restorePromptRepoScroll(restoreScrollTop);
    restorePromptCategoryScroll(state.promptRepo.categoryScrollTop || 0);
    if (page > 1) return;
  } else {
    if (!background) {
      state.promptRepo.loading = true;
      state.promptRepo.loadingLabel = state.promptRepo.query ? '搜索提示词中...' : '加载提示词中...';
      if (!syncPromptRepoView()) render();
      restorePromptRepoScroll(restoreScrollTop);
      restorePromptCategoryScroll(state.promptRepo.categoryScrollTop || 0);
    }
  }
  let stale = false;
  try {
    const q = encodeURIComponent(state.promptRepo.query || '');
    const cat = state.promptRepo.category && state.promptRepo.category !== 'all' ? `&cat=${encodeURIComponent(state.promptRepo.category)}` : '';
    const data = await fetchJson(`/api/prompts?page=${page}&limit=${PROMPT_PAGE_SIZE}${cat}&q=${q}`);
    if ((state.promptRepo.requestSeq || 0) !== requestSeq) {
      stale = true;
      return;
    }
    rememberPromptPageCache(cacheKey, data);
    applyPromptPageData(data, page);
    state.promptRepo.loadingLabel = '';
  } catch (err) {
    if (!cached) toast('提示词仓库加载失败');
  } finally {
    if (stale || (state.promptRepo.requestSeq || 0) !== requestSeq) return;
    if (background) return;
    state.promptRepo.loading = false;
    state.promptRepo.loadingLabel = '';
    if (!syncPromptRepoView()) render();
    restorePromptRepoScroll(restoreScrollTop);
    restorePromptCategoryScroll(state.promptRepo.categoryScrollTop || 0);
  }
}
async function fullPromptItem(item) {
  if (!item?.partial) return item;
  if (item.d) {
    const chunkData = await loadPromptDetailChunk(item.d).catch(() => null);
    const full = chunkData?.prompts?.find((prompt) => String(prompt.id) === String(item.id));
    if (full) return { ...full, partial: false };
  }
  const pageData = await loadPromptCategoryPage(item.c || state.promptRepo.category || 'all').catch(() => null);
  const full = pageData?.prompts?.find((prompt) => String(prompt.id) === String(item.id));
  return full || item;
}
async function hydratePromptDetailItem(item) {
  const full = await fullPromptItem(item);
  if (!state.promptRepo.open || !state.promptRepo.detail || String(state.promptRepo.detail.id) !== String(item.id)) return;
  state.promptRepo.detail = full;
  state.promptRepo.items = state.promptRepo.items.map((prompt) => String(prompt.id) === String(full.id) ? full : prompt);
  if (!syncPromptRepoOverlays()) render();
}
async function usePrompt(id) {
  const item = state.promptRepo.items.find((p) => String(p.id) === String(id));
  if (!item) return;
  const full = await fullPromptItem(item);
  state.composerPrompt = full?.p || item.p || '';
  state.promptRepo.open = false;
  state.promptRepo.detail = null;
  persistRender();
}

function activeProject() {
  return state.agent.projects.find((p) => p.id === state.agent.activeProjectId) || state.agent.projects[0];
}
function buildAgentRequestPayload(input, options = {}) {
  const project = options.project || activeProject() || {};
  const textProfile = options.textProfile || agentTextProfile();
  const historyItems = Array.isArray(options.history) ? options.history : [];
  const currentBeijingTime = formatBeijingTimeLabel();
  const currentModelSlug = textProfile?.model || '';
  const webSearchEnabled = agentWebSearchEnabled(textProfile);
  const history = historyItems
    .filter((message) => !message.pending)
    .slice(-12)
    .map((message) => `${message.role === 'user' ? '用户' : 'Agent'}：${message.text}`)
    .join('\n');
  const attachmentSummary = options.attachmentSummary || '';
  const attachmentText = options.attachmentText || '';
  const userInputBlock = [
    `用户新消息：${input}`,
    attachmentSummary ? `本次附件：\n${attachmentSummary}` : '',
    attachmentText ? `本次文本附件内容：\n${attachmentText}` : ''
  ].filter(Boolean).join('\n\n');
  const inputText = [
    `当前项目：${project.name || '默认项目'}`,
    `项目专属提示词：${project.prompt || '无'}`,
    `当前文本模型 slug：${currentModelSlug || '未配置'}`,
    currentBeijingTime,
    `联网状态：${webSearchEnabled ? '已开启' : (!state.agentConfig?.webSearchEnabled ? '后台关闭' : agentWebSearchSupported(textProfile) ? '已关闭' : '当前模型不支持')}`,
    `对话历史：\n${history || '无'}`,
    userInputBlock
  ].join('\n');
  const imageParts = Array.isArray(options.attachmentImageParts) ? options.attachmentImageParts : [];
  const payload = {
    model: currentModelSlug,
    instructions: [
      '你是当前项目的 Agent，负责直接、清晰地回答用户问题。',
      '不要生成 workflow JSON，除非用户明确要求。',
      '普通问答保持简洁；只有生图、工作流、参数建议场景才必须方案化。',
      '遇到生图、图片修改、工作流或参数建议时，必须输出 5 个方案，固定字段为：方案 N、适合模型、推荐理由、正向 Prompt、负面 Prompt。',
      '只把可直接生图的内容写进正向 Prompt；说明、免责声明、选择建议不得混入 Prompt。',
      '负面 Prompt 必须单独给出；如果没有明确禁用项，也要给出简短的避免项。',
      '最终推荐方案请在标题中标记“（推荐）”；用户点击生成图片时只会使用该推荐方案的正向和负面 Prompt。',
      '高影响不确定项先问，最多 3 个问题；低影响不确定项直接采用合理默认，并用一句话注明假设。',
      '涉及版权角色或受保护风格时，先用一句话说明不可复刻，再直接给原创替代 Prompt，不要长篇免责声明。',
      'Prompt 以中文为主；如英文表达更稳定，可在正向 Prompt 内附英文原文。',
      `当前项目：${project.name || '默认项目'}`,
      `项目专属提示词：${project.prompt || '无'}`,
      `当前文本模型 slug：${currentModelSlug || '未配置'}`,
      currentBeijingTime,
      `联网状态：${webSearchEnabled ? '已开启' : (!state.agentConfig?.webSearchEnabled ? '后台关闭' : agentWebSearchSupported(textProfile) ? '已关闭' : '当前模型不支持')}`
    ].join('\n'),
    input: imageParts.length ? [{ role: 'user', content: [{ type: 'input_text', text: inputText }, ...imageParts] }] : inputText,
    currentBeijingTime,
    currentModelSlug,
    webSearchEnabled
  };
  if (webSearchEnabled) payload.tools = [{ type: 'web_search' }];
  return payload;
}
function buildWorkflowAgentRequestPayload(input, options = {}) {
  const project = options.project || activeProject() || {};
  const textProfile = options.textProfile || agentTextProfile();
  const mode = options.mode || 'planner';
  const currentBeijingTime = formatBeijingTimeLabel();
  const currentModelSlug = textProfile?.model || '';
  const webSearchEnabled = agentWebSearchEnabled(textProfile);
  const payload = {
    model: currentModelSlug,
    instructions: mode === 'rewrite'
      ? [
        '你是 NexGen 工作流的提示词改写器。只输出最终生图提示词，不要解释。',
        '不要输出 Markdown、标题、JSON 或额外说明；如果包含负面约束，用“负面提示词：...”另起一行。'
      ].join('\n')
      : [
        '你是 NexGen 工作流规划器。只返回合法 workflow JSON，不要解释。',
        'JSON 必须包含 name, description, nodes, edges, variables.columns, variables.rows, config.promptTemplate。',
        '如用户提出禁用项或避免项，把它们写入 config.negativePrompt。'
      ].join('\n'),
    input: mode === 'rewrite'
      ? [
        `项目提示词：${project.prompt || '无'}`,
        `工作流：${options.workflow?.name || '未命名工作流'} / ${options.workflow?.description || '无描述'}`,
        `变量：${JSON.stringify(options.rowValues || {})}`,
        `原始模板结果：${input}`,
        currentBeijingTime,
        `当前文本模型 slug：${currentModelSlug || '未配置'}`,
        '要求：保留变量含义，提升画面可执行性、主体清晰度、风格一致性和生成模型可理解度。'
      ].join('\n')
      : [
        `项目专属提示词：${project.prompt || '无'}`,
        `用户任务：${input}`,
        currentBeijingTime,
        `当前文本模型 slug：${currentModelSlug || '未配置'}`,
        `联网：${webSearchEnabled ? '已开启' : '未开启'}`,
        '请返回一个可复用批量生图 workflow JSON。只返回 JSON。'
      ].join('\n'),
    currentBeijingTime,
    currentModelSlug,
    webSearchEnabled
  };
  if (webSearchEnabled) payload.tools = [{ type: 'web_search' }];
  return payload;
}
async function postAgentResponsesRequest(payload, textProfile) {
  const controller = new AbortController();
  const timeoutSeconds = agentRequestTimeoutSeconds(textProfile);
  const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  try {
    const { currentBeijingTime, currentModelSlug, webSearchEnabled, ...requestBody } = payload || {};
    const responsePayload = await fetchJson('/api-proxy/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Profile-Id': profileId(textProfile) },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    return await resolveResponsePayload(responsePayload?.__stream ? { ...responsePayload, signal: controller.signal } : responsePayload);
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`Agent 请求超过 ${timeoutSeconds} 秒未返回`);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
async function handleAgentOptionSelectionInput(input, inputEl, project) {
  const optionIndex = parseAgentOptionSelection(input);
  if (!optionIndex) return false;
  const sourceMessage = latestAgentPromptOptionsMessage(project?.id);
  if (!sourceMessage) return false;
  state.agent.inputDraft = '';
  if (inputEl) inputEl.value = '';
  writeStore();
  await generateAgentImageFromMessage(sourceMessage.id, '', { optionIndex });
  return true;
}
async function sendAgentChat() {
  const inputEl = $('#agentInput');
  const input = inputEl?.value.trim();
  const attachments = Array.isArray(state.agent.attachments) ? state.agent.attachments.map((item) => ({ ...item })) : [];
  const effectiveInput = input || (attachments.length ? '请分析这些附件。' : '');
  if (!effectiveInput) return toast('请输入要发送给 Agent 的内容或上传附件');
  if (activeAgentHasPending()) return toast('当前对话仍在思考中，请等待返回后再发送');
  const project = activeProject();
  if (!project) return toast('请先创建或选择项目');
  if (!attachments.length && await handleAgentOptionSelectionInput(input, inputEl, project)) return;
  const textProfile = agentTextProfile();
  if (!textProfile || profileMode(textProfile) !== 'responses') return toast(agentTextProfileInvalidReason() || '当前 Agent 文本模型配置无效，请到后台 Agent 配置选择 Responses API 文本模型');
  const thread = ensureAgentProjectThread(project.id);
  const messages = agentMessages(project.id);
  const attachmentPayload = attachments.length ? await agentAttachmentParts(attachments) : { imageParts: [], textNote: '' };
  const userMessage = { id: uid('msg'), threadId: thread.id, projectId: project.id, role: 'user', text: effectiveInput, attachments, createdAt: Date.now() };
  const pendingId = uid('msg');
  messages.push(userMessage);
  messages.push({ id: pendingId, threadId: thread.id, projectId: project.id, role: 'assistant', text: '正在思考...', createdAt: Date.now(), pending: true, retryInput: effectiveInput });
  state.agent.messagesByThread[thread.id] = messages;
  state.agent.activeThreadIdByProject[project.id] = thread.id;
  state.agent.attachments = [];
  state.agent.inputDraft = state.preferences?.clearInputAfterSubmit ? '' : input;
  if (inputEl && state.preferences?.clearInputAfterSubmit) inputEl.value = '';
  state.agentScrollIntent = (state.agentConfig?.scrollAfterSubmit ?? true) ? 'force-bottom' : '';
  writeStore();
  render();
  const controller = new AbortController();
  const timeoutSeconds = agentRequestTimeoutSeconds(textProfile);
  const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  const requestStartedAt = Date.now();
  try {
    const payload = buildAgentRequestPayload(effectiveInput, {
      project,
      history: messages,
      textProfile,
      attachmentSummary: agentAttachmentSummary(attachments),
      attachmentText: attachmentPayload.textNote,
      attachmentImageParts: attachmentPayload.imageParts
    });
    const { currentBeijingTime, currentModelSlug, webSearchEnabled, ...requestBody } = payload;
    const responsePayload = await fetchJson('/api-proxy/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Profile-Id': profileId(textProfile) },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    const data = await resolveResponsePayload(responsePayload?.__stream ? { ...responsePayload, signal: controller.signal } : responsePayload);
    const text = extractResponseText(data, 'Agent 已返回，但没有可显示文本。');
    const promptOptions = extractAgentPromptOptions(text);
    const recommendedOption = recommendedAgentPromptOption(promptOptions);
    const imagePromptBundle = promptOptions.length ? { prompt: recommendedOption?.prompt || '', negativePrompt: recommendedOption?.negativePrompt || '' } : extractAgentImagePrompts(text);
    const imagePrompt = promptOptions.length ? imagePromptBundle.prompt : inferAgentImagePrompt(input, text);
    const negativePrompt = imagePromptBundle.negativePrompt || '';
    const currentMessages = Array.isArray(state.agent.messagesByThread?.[thread.id]) ? state.agent.messagesByThread[thread.id] : messages;
    let matchedPending = false;
    state.agent.messagesByThread[thread.id] = currentMessages.map((msg) => {
      if (msg.id !== pendingId) return msg;
      matchedPending = true;
      return { ...msg, pending: false, text, promptOptions, imagePrompt, negativePrompt, retryInput: '', profileId: profileId(textProfile), model: textProfile.model || '', requestMs: Date.now() - requestStartedAt };
    });
    if (!matchedPending) throw new Error('Agent 响应已返回，但当前会话 pending 消息未找到');
  } catch (err) {
    const normalized = normalizeError(err?.name === 'AbortError' ? `Agent 请求超过 ${timeoutSeconds} 秒未返回` : err, '对话失败');
    const detail = agentFailureDetail({
      normalized,
      textProfile,
      startedAt: requestStartedAt,
      timeoutSeconds,
      upstreamStatus: err?.upstreamStatus || err?.status || err?.raw?.upstreamStatus,
      code: err?.code || normalized.code
    });
    const currentMessages = Array.isArray(state.agent.messagesByThread?.[thread.id]) ? state.agent.messagesByThread[thread.id] : messages;
    state.agent.messagesByThread[thread.id] = currentMessages.map((msg) => msg.id === pendingId ? { ...msg, pending: false, text: `对话失败：${normalized.summary}`, errorDetail: detail, retryInput: effectiveInput, profileId: profileId(textProfile), model: textProfile.model || '', requestMs: Date.now() - requestStartedAt, upstreamStatus: err?.upstreamStatus || err?.status || err?.raw?.upstreamStatus } : msg);
  } finally {
    clearTimeout(timeoutId);
  }
  persistRender();
}
async function retryAgentMessage(messageId) {
  const messages = agentMessages();
  const message = messages.find((item) => item.id === messageId);
  const retryInput = String(message?.retryInput || '').trim();
  if (!retryInput) return toast('没有可重试的 Agent 输入');
  const inputEl = $('#agentInput');
  if (inputEl) inputEl.value = retryInput;
  state.agent.inputDraft = retryInput;
  await sendAgentChat();
}
function agentMessageImagePrompts(message, fallback = '', options = {}) {
  if (!message) return { prompt: cleanAgentImagePrompt(fallback), negativePrompt: '' };
  const option = agentPromptOptionForMessage(message, options.optionIndex);
  if (option) return { prompt: option.prompt, negativePrompt: option.negativePrompt || '', option };
  const extracted = extractAgentImagePrompts(message.text || '');
  return {
    prompt: extracted.prompt || cleanAgentImagePrompt(fallback || message.imagePrompt || ''),
    negativePrompt: extracted.negativePrompt || cleanNegativeAgentPrompt(message.negativePrompt || '')
  };
}
function agentMessageImagePrompt(message, fallback = '') {
  return agentMessageImagePrompts(message, fallback).prompt;
}
async function generateAgentImageFromMessage(messageId, prompt = '', options = {}) {
  const project = activeProject();
  const thread = activeAgentThread(project?.id);
  const threadId = thread?.id;
  const messages = Array.isArray(state.agent.messagesByThread?.[threadId]) ? state.agent.messagesByThread[threadId] : [];
  const sourceMessage = messages.find((message) => message.id === messageId);
  const promptBundle = agentMessageImagePrompts(sourceMessage, prompt, options);
  const cleanPrompt = promptBundle.prompt;
  const negativePrompt = promptBundle.negativePrompt;
  const option = promptBundle.option || null;
  if (!cleanPrompt) return toast('没有可用于生图的提示词');
  if (!threadId) return toast('当前 Agent 会话无效');
  const scrollAnchor = options.scrollAnchor || freezeAgentScrollForRender();
  const params = agentImageParams();
  if (negativePrompt) {
    params.negativePrompt = negativePrompt;
    params.negative_prompt = negativePrompt;
  }
  const task = await generateImageTask({
    prompt: cleanPrompt,
    requestedParams: params,
    referenceSnapshots: cloneReferenceSnapshotsForAgent(),
    agentMessageId: messageId,
    agentOption: option?.index || '',
    agentOptionTitle: option?.title || '',
    editedFromOption: options.editedFromOption || '',
    workflowMeta: {
      entry: 'agent',
      agentMessageId: messageId,
      agentOption: option?.index || '',
      agentOptionTitle: option?.title || '',
      editedFromOption: options.editedFromOption || '',
      onCreated: (createdTask) => {
        attachAgentTaskToMessage(threadId, messageId, createdTask.id, cleanPrompt, { renderNow: true, option });
        releaseAgentScrollFreezeAfterRender();
      }
    }
  });
  if (!task) {
    state.agentScrollLock = null;
    return;
  }
  attachAgentTaskToMessage(threadId, messageId, task.id, cleanPrompt, { option });
  if (scrollAnchor?.id) state.agentScrollState = { ...(state.agentScrollState || {}), nearBottom: false, anchor: scrollAnchor };
  persistRender();
}
function attachAgentTaskToMessage(threadId, messageId, taskId, imagePrompt, options = {}) {
  if (!threadId || !messageId || !taskId) return;
  const messages = Array.isArray(state.agent.messagesByThread?.[threadId]) ? state.agent.messagesByThread[threadId] : [];
  state.agent.messagesByThread[threadId] = messages.map((message) => {
    if (message.id !== messageId) return message;
    const taskIds = Array.from(new Set([...(Array.isArray(message.taskIds) ? message.taskIds : message.taskId ? [message.taskId] : []), taskId]));
    return {
      ...message,
      taskId,
      taskIds,
      imagePrompt: imagePrompt || message.imagePrompt || '',
      agentOption: options.option?.index || message.agentOption || '',
      agentOptionTitle: options.option?.title || message.agentOptionTitle || ''
    };
  });
  writeStore();
  if (options.renderNow) render();
}
function cloneReferenceSnapshotsForAgent() {
  return (state.references || []).map((ref) => ({
    id: ref.id,
    name: ref.name,
    type: ref.type,
    blobId: ref.compositedBlobId || ref.blobId,
    originalBlobId: ref.originalBlobId || ref.blobId,
    width: ref.width,
    height: ref.height
  }));
}
function inferAgentImagePrompt(userInput, assistantText) {
  const source = `${userInput}\n${assistantText}`;
  if (!/(生成|出图|生图|图片|海报|渲染|视觉|封面|主图|poster|image|render)/i.test(source)) return '';
  if (/(不要生成|不用生成|只聊天|只分析|不出图)/.test(source)) return '';
  const prompt = extractImagePromptFromAgentText(assistantText);
  return prompt.length > 1200 ? prompt.slice(0, 1200) : prompt;
}
function stripPromptMarkdown(text) {
  return String(text || '')
    .replace(/```(?:[\w-]+)?\n?([\s\S]*?)```/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^[\s>*\-•]+/gm, '')
    .replace(/[“”]/g, '"')
    .trim();
}
function cleanAgentImagePrompt(text) {
  let prompt = stripPromptMarkdown(text)
    .replace(/^(?:#{1,6}\s*)?(?:[^。\n]{0,80}?\bPrompt\b[^。\n]*|[^。\n]{0,80}?(?:中文版|中文提示词|出图提示词|图像提示词)[^。\n]*)\n+/i, '')
    .replace(/^(中文提示词|英文提示词|出图提示词|图像提示词|提示词|prompt)\s*[:：]\s*/i, '')
    .replace(/^(可以|当然|好的)[，,。\s]*/i, '')
    .replace(/^我不能直接[^，。；;]*[，。；;]\s*/i, '')
    .replace(/^但可以(?:立刻)?(?:给你|为你)?(?:一份|一个)?/i, '')
    .replace(/^(?:可直接出图的|表情包夸张风|原创|原创提示词|原创新提示词)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const stop = prompt.search(/(?:负面提示词|negative prompt|如果你想|如果你愿意|我还可以|以下任一种|适合图像模型|Midjourney|SD\s*\/\s*Flux|直接改成|可复制粘贴)/i);
  if (stop > 20) prompt = prompt.slice(0, stop).trim();
  return prompt.replace(/^[：:，,。.["'“”\s]+|[：:，,。.["'“”\s]+$/g, '').trim();
}
function extractImagePromptFromAgentText(text) {
  const source = stripPromptMarkdown(text);
  const markdownSection = extractMarkdownPromptSection(source);
  if (markdownSection) return markdownSection;
  const labelPattern = /(中文提示词|英文提示词|出图提示词|图像提示词|(?:可直接(?:出图|使用)的)?(?:原创)?提示词|prompt)\s*[:：]\s*/ig;
  let match;
  const candidates = [];
  while ((match = labelPattern.exec(source))) {
    const start = labelPattern.lastIndex;
    const rest = source.slice(start);
    const nextLabel = rest.search(/\n\s*(?:负面提示词|negative prompt|中文提示词|英文提示词|出图提示词|图像提示词|提示词|prompt)\s*[:：]/i);
    const nextOption = rest.search(/\n\s*(?:\d+[.、]|-|•)\s*(?:适合图像模型|Midjourney|SD\s*\/\s*Flux|直接改成)/i);
    const stops = [nextLabel, nextOption].filter((idx) => idx >= 0);
    const end = stops.length ? Math.min(...stops) : rest.length;
    const candidate = cleanAgentImagePrompt(rest.slice(0, end));
    if (looksLikeUsableImagePrompt(candidate)) candidates.push(candidate);
  }
  if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0];
  const compact = extractCompactQuotedVisualPrompt(source);
  if (compact) return compact;
  const quoted = source.match(/[「“"]([^「」“”"]{24,1200})[」”"]/);
  if (quoted) {
    const quotedPrompt = cleanAgentImagePrompt(quoted[1]);
    if (looksLikeUsableImagePrompt(quotedPrompt)) return quotedPrompt;
  }
  const sentencePrompt = extractPromptFromAgentSentences(source);
  if (sentencePrompt) return sentencePrompt;
  const lines = source.split(/\n+/).map(cleanAgentImagePrompt).filter(looksLikeUsableImagePrompt);
  return lines[0] || '';
}
function extractAgentImagePrompts(text) {
  const source = stripPromptMarkdown(text);
  return {
    prompt: extractImagePromptFromAgentText(source),
    negativePrompt: extractNegativePromptFromAgentText(source)
  };
}
function extractMarkdownPromptSection(source) {
  const text = String(source || '').replace(/\r\n?/g, '\n');
  const headingPattern = /(?:^|\n)\s*(?:-{3,}\s*)?#{1,6}\s*([^\n]{0,180}?(?:中文提示词|中文版|出图提示词|图像提示词|直接可用\s*Prompt|可直接(?:出图|使用)|Prompt)[^\n]*)\n/ig;
  const candidates = [];
  let match;
  while ((match = headingPattern.exec(text))) {
    const title = String(match[1] || '');
    if (/(负面提示词|negative prompt|英文版|English|超短版|Midjourney|SDXL|Flux|反向提示词)/i.test(title)) continue;
    const rest = text.slice(headingPattern.lastIndex);
    const stops = [
      rest.search(/\n\s*(?:-{3,}\s*)?#{1,6}\s+/),
      rest.search(/\n\s*(?:负面提示词|negative prompt|英文版|English|超短版)\s*[:：]?/i),
      rest.search(/\n\s*(?:-{3,}\s*)?(?:##|###)\s*(?:英文版|English|负面提示词|negative prompt|超短版)/i),
      rest.search(/\n\s*(?:如果你想|如果你要|如果你愿意|我可以继续|我还可以|以下任一种|你回复)\b/i)
    ].filter((idx) => idx >= 0);
    const end = stops.length ? Math.min(...stops) : rest.length;
    const candidate = cleanAgentImagePrompt(rest.slice(0, end));
    if (looksLikeUsableImagePrompt(candidate)) candidates.push(candidate);
  }
  return candidates.sort((a, b) => b.length - a.length)[0] || '';
}
function cleanNegativeAgentPrompt(text) {
  let prompt = stripPromptMarkdown(text)
    .replace(/^(?:#{1,6}\s*)?(?:负面提示词|negative prompt|反向提示词|negative)\s*[:：]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const stop = prompt.search(/(?:英文版|English|超短版|Midjourney|SDXL|Flux|如果你想|如果你要|如果你愿意|我可以继续|我还可以|以下任一种|你回复)/i);
  if (stop > 8) prompt = prompt.slice(0, stop).trim();
  return prompt.replace(/^[：:，,。.["'“”\s]+|[：:，,。.["'“”\s]+$/g, '').trim();
}
function looksLikeUsableNegativePrompt(prompt) {
  const value = String(prompt || '').trim();
  if (value.length < 8) return false;
  if (/我不能|说明一点|可以继续|你回复/.test(value.slice(0, 80))) return false;
  return /(不要|避免|无|禁止|not|no|without|avoid|exclude)/i.test(value);
}
function extractNegativePromptFromAgentText(source) {
  const text = String(source || '').replace(/\r\n?/g, '\n');
  const sectionPattern = /(?:^|\n)\s*(?:-{3,}\s*)?#{0,6}\s*(负面提示词|negative prompt|反向提示词|negative)\s*[:：]?\s*/ig;
  const candidates = [];
  let match;
  while ((match = sectionPattern.exec(text))) {
    const rest = text.slice(sectionPattern.lastIndex);
    const stops = [
      rest.search(/\n\s*(?:-{3,}\s*)?#{1,6}\s+/),
      rest.search(/\n\s*(?:英文版|English|超短版|Midjourney|SDXL|Flux)\s*[:：]?/i),
      rest.search(/\n\s*(?:如果你想|如果你要|如果你愿意|我可以继续|我还可以|以下任一种|你回复)\b/i)
    ].filter((idx) => idx >= 0);
    const end = stops.length ? Math.min(...stops) : rest.length;
    const candidate = cleanNegativeAgentPrompt(rest.slice(0, end));
    if (looksLikeUsableNegativePrompt(candidate)) candidates.push(candidate);
  }
  return candidates.sort((a, b) => b.length - a.length)[0] || '';
}
function extractCompactQuotedVisualPrompt(source) {
  const quoted = Array.from(String(source || '').matchAll(/[“"']([^“”"']{4,160})[”"']/g)).map((match) => cleanAgentImagePrompt(match[1]));
  const visuals = quoted.filter((item) => /(猫|男孩|女孩|人|角色|背景|透明|追|跑|表情|风格|构图|画面|机器人|机器猫)/.test(item));
  if (!visuals.length) return '';
  const unique = Array.from(new Set(visuals));
  const constraints = [];
  if (/后面追的是人，不是熊|后面追的是人不是熊|追的是人，不是熊/.test(source)) constraints.push('后面追赶者是人类男孩，不是熊，不是动物');
  if (/透明背景|透明底|PNG/i.test(source)) constraints.push('PNG 透明背景');
  const subject = unique.join('，');
  const prompt = cleanAgentImagePrompt([subject, ...constraints].join('，'));
  return looksLikeUsableImagePrompt(prompt) ? prompt : '';
}
function looksLikeUsableImagePrompt(prompt) {
  const value = String(prompt || '').trim();
  if (value.length < 24) return false;
  if (/我不能|不能直接|版权|受版权保护|但可以|你可以|如果你想|我还可以|以下|说明一点/.test(value.slice(0, 80))) return false;
  const hits = ['角色', '画面', '背景', '构图', '风格', '透明', 'PNG', '插画', '海报', '表情', '追', '全身', '色彩', '线条', 'portrait', 'background', 'style'].filter((word) => value.includes(word)).length;
  return hits >= 2;
}
function extractPromptFromAgentSentences(source) {
  const normalized = stripPromptMarkdown(source)
    .replace(/\s+/g, ' ')
    .replace(/效果会非常接近你要的[^，。；;]*[，。；;]?\s*/g, '')
    .replace(/同时保留你强调的[：:]\s*/g, '')
    .trim();
  const startPatterns = [
    /(?:可直接(?:出图|使用)的(?:原创)?提示词|(?:原创)?提示词|原创新提示词|直接用(?:这个|下面)?(?:提示词)?(?:生成)?|立刻给你一份)\s*[：:，,]?\s*/i,
    /(?:一份|一个)\s*(?:表情包夸张风|原创|可直接出图)[^，。；;]*[，。；;]\s*/i
  ];
  for (const pattern of startPatterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const raw = normalized.slice((match.index || 0) + match[0].length);
    const candidate = cleanAgentImagePrompt(raw);
    if (looksLikeUsableImagePrompt(candidate)) return candidate;
  }
  const segments = normalized.split(/[。；;]\s*/).map(cleanAgentImagePrompt).filter(looksLikeUsableImagePrompt);
  if (segments.length) return segments.slice(0, 4).join('；');
  return '';
}
function workflowPromptTemplate(workflow) {
  const imageNode = (workflow.nodes || []).find((node) => node.type === 'image') || {};
  return workflow.config?.promptTemplate || imageNode.promptTemplate || workflow.templateBindings?.imagePrompt || '{{subject}}，{{style}}，高质量商业生图';
}
function workflowImageParams(workflow, profile, countPerRow) {
  const config = workflow?.config || {};
  const params = { ...requestedParams(profile), count: Math.max(1, Number(countPerRow) || Number(config.count) || 1) };
  const quality = String(config.quality || '').trim();
  const outputFormat = String(config.outputFormat || config.output_format || '').trim().toLowerCase();
  const outputCompression = String(config.outputCompression || config.output_compression || '').trim();
  const negativePrompt = cleanNegativeAgentPrompt(config.negativePrompt || config.negative_prompt || config.negative || '');
  if (quality) params.quality = quality;
  if (outputFormat) {
    params.format = outputFormat;
    params.output_format = outputFormat;
  }
  if (outputCompression) {
    params.compression = outputCompression;
    params.outputCompression = outputCompression;
    params.output_compression = outputCompression;
  }
  if (negativePrompt) {
    Object.assign(params, { negativePrompt, negative_prompt: negativePrompt });
  }
  return params;
}
function newWorkflowDraft() {
  const project = activeProject();
  state.workflowDraft = makeFallbackWorkflowDraft('新的批量生图工作流', '按变量表批量生成商业图片。', project?.id);
  state.mode = 'workflow';
  state.agent.view = 'workflows';
  render();
}
async function generateWorkflowFromAgent() {
  const input = ($('#agentInput')?.value || '').trim() || String(await openTextInputDialog({
    kicker: 'AI 创建工作流',
    title: '描述你想创建的工作流',
    message: '例如“电商主图 8 张工作流”。这里只生成工作流草稿，不会直接消耗生图额度。',
    placeholder: '例如：电商主图 8 张工作流'
  }) || '').trim();
  if (!input) return toast('请输入要生成工作流的任务');
  const project = activeProject();
  const textProfile = agentTextProfile();
  if (!textProfile) return toast('暂无 Responses API 对话模型，请到后台 Agent 配置选择文本模型');
  state.mode = 'workflow';
  state.agent.view = 'workflows';
  const pendingId = uid('log');
  state.agent.logs.push({ id: uid('log'), projectId: project.id, role: 'user', text: input, createdAt: Date.now() });
  state.agent.logs.push({ id: pendingId, projectId: project.id, role: 'assistant', text: '正在生成可复用工作流草稿...', createdAt: Date.now(), pending: true });
  persistRender();
  try {
    const data = await postAgentResponsesRequest(buildWorkflowAgentRequestPayload(input, { project, textProfile, mode: 'planner' }), textProfile);
    const text = extractResponseText(data, JSON.stringify(data));
    state.workflowDraft = normalizeWorkflowDraft(parseWorkflowJson(text), input, project.id);
    state.agent.logs = state.agent.logs.map((log) => log.id === pendingId ? { ...log, pending: false, text: `已生成工作流草稿：${state.workflowDraft.name}` } : log);
  } catch (err) {
    const normalized = normalizeError(err, '接口规划失败');
    state.workflowDraft = makeFallbackWorkflowDraft(input, `接口规划失败，已生成本地可编辑草稿：${normalized.summary}`, project.id);
    state.agent.logs = state.agent.logs.map((log) => log.id === pendingId ? { ...log, pending: false, text: `接口规划失败，已生成本地草稿：${normalized.summary}`, errorDetail: normalized.detail } : log);
  }
  persistRender();
}
function parseWorkflowJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}
function normalizeWorkflowDraft(input, fallbackName, projectId) {
  const source = input?.workflow || input || {};
  const draft = makeFallbackWorkflowDraft(fallbackName, source.description || fallbackName, projectId);
  draft.name = source.name || draft.name;
  draft.category = source.category || draft.category;
  draft.description = source.description || draft.description;
  draft.scope = source.scope === 'public' ? 'public' : 'private';
  draft.mode = source.mode === 'multi_image_series' ? 'multi_image_series' : 'single_image';
  draft.nodes = Array.isArray(source.nodes) && source.nodes.length ? source.nodes.map((node, index) => ({
    id: node.id || uid(`node-${index}`),
    type: node.type || (index === 0 ? 'plan' : index === 1 ? 'rewrite' : 'image'),
    title: node.title || node.name || `步骤 ${index + 1}`,
    description: node.description || node.instruction || '',
    promptTemplate: node.promptTemplate || node.prompt || node.template || ''
  })) : draft.nodes;
  if (!draft.nodes.some((node) => node.type === 'image')) {
    draft.nodes.push({ id: uid('node-image'), type: 'image', title: '批量生图', promptTemplate: workflowPromptTemplate(draft) });
  }
  draft.edges = Array.isArray(source.edges) ? source.edges : draft.edges;
  const columns = source.variables?.columns || source.columns || draft.variables.columns;
  const rows = source.variables?.rows || source.rows || draft.variables.rows;
  draft.variables = {
    columns: columns.length ? columns.map(String) : draft.variables.columns,
    rows: (rows.length ? rows : draft.variables.rows).map((row, index) => ({
      id: row.id || uid(`row-${index}`),
      values: row.values || Object.fromEntries((columns.length ? columns : draft.variables.columns).map((column) => [column, row[column] || '']))
    }))
  };
  draft.config = { ...(draft.config || {}), ...(source.config || {}) };
  draft.seriesConfig = { ...(draft.seriesConfig || {}), ...(source.seriesConfig || {}) };
  draft.templateBindings = { imagePrompt: source.templateBindings?.imagePrompt || draft.config.promptTemplate || workflowPromptTemplate(draft) };
  const imageNode = draft.nodes.find((node) => node.type === 'image');
  if (imageNode && !imageNode.promptTemplate) imageNode.promptTemplate = draft.templateBindings.imagePrompt;
  return draft;
}
function makeFallbackWorkflowDraft(name, description, projectId = state.agent.activeProjectId) {
  const columns = ['subject', 'style', 'scene'];
  return {
    id: uid('workflow'),
    projectId,
    name: `${String(name || '批量生图工作流').slice(0, 28)}`,
    status: 'draft',
    scope: 'private',
    editable: true,
    mode: 'single_image',
    category: '批量生图',
    description: description || '按变量表批量生成商业图片。',
    nodes: [
      { id: 'plan', type: 'plan', title: '规划批量目标', description: description || '分析任务并确定批量变量。' },
      { id: 'rewrite', type: 'rewrite', title: '改写提示词', description: '将变量表合成为生图提示词。' },
      { id: 'image', type: 'image', title: '批量生图', promptTemplate: '为 {{subject}} 生成 {{style}} 风格图片，场景：{{scene}}。高质量、商业可用、细节清晰。' }
    ],
    edges: [{ from: 'plan', to: 'rewrite' }, { from: 'rewrite', to: 'image' }],
    variables: {
      columns,
      rows: [{ id: uid('row'), values: { subject: '示例产品', style: '高级商业摄影', scene: '干净浅色影棚' } }]
    },
    config: {
      quality: state.settings.quality,
      outputFormat: state.settings.output_format,
      outputCompression: String(state.settings.output_compression),
      count: '1',
      timeout: '600',
      systemPrompt: '',
      promptTemplate: '为 {{subject}} 生成 {{style}} 风格图片，场景：{{scene}}。高质量、商业可用、细节清晰。',
      negativePrompt: ''
    },
    seriesConfig: {
      targetCount: '4',
      concurrency: String(DEFAULT_AGENT_BUDGET.concurrency || 2),
      promptInstruction: '围绕同一主题拆分成封面图、核心信息图、场景图和总结图；每张图需要画面重点不同但视觉风格一致。'
    },
    templateBindings: { imagePrompt: '为 {{subject}} 生成 {{style}} 风格图片，场景：{{scene}}。高质量、商业可用、细节清晰。' },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
function newSeriesWorkflowDraft() {
  const project = activeProject();
  const draft = makeFallbackWorkflowDraft('多图系列生成', '根据主题生成一组连贯图片提示词，审核后批量生成图片。', project?.id);
  draft.mode = 'multi_image_series';
  draft.category = '多图创作';
  draft.variables = {
    columns: ['topic', 'style', 'platform'],
    rows: [{ id: uid('row'), values: { topic: '新品发布', style: '高级商业摄影', platform: '小红书' } }]
  };
  draft.config.promptTemplate = '围绕 {{topic}} 生成一组适合 {{platform}} 发布的连贯配图。统一风格：{{style}}。要求：主题一致、画面重点各不相同、适合连续发布。';
  draft.templateBindings.imagePrompt = draft.config.promptTemplate;
  const imageNode = draft.nodes.find((node) => node.type === 'image');
  if (imageNode) imageNode.promptTemplate = draft.config.promptTemplate;
  state.workflowDraft = draft;
  state.mode = 'workflow';
  state.agent.view = 'workflows';
  persistRender();
}
function saveWorkflowDraft() {
  if (!state.workflowDraft) return;
  const now = Date.now();
  const workflow = {
    ...state.workflowDraft,
    status: 'ready',
    updatedAt: now,
    createdAt: state.workflowDraft.createdAt || now,
    persisted: undefined
  };
  const index = state.agent.workflows.findIndex((item) => item.id === workflow.id);
  if (index >= 0) state.agent.workflows[index] = workflow;
  else state.agent.workflows.push(workflow);
  state.workflowDraft = null;
  state.agent.view = 'workflows';
  persistRender();
  toast('工作流已保存到工作流页');
}
function editWorkflow(id) {
  const workflow = state.agent.workflows.find((item) => item.id === id);
  if (!workflow) return;
  state.workflowDraft = JSON.parse(JSON.stringify({ ...workflow, persisted: true }));
  state.mode = 'workflow';
  render();
}
function duplicateWorkflow(id) {
  const workflow = state.agent.workflows.find((item) => item.id === id);
  if (!workflow) return;
  const copy = JSON.parse(JSON.stringify(workflow));
  copy.id = uid('workflow');
  copy.name = `${copy.name || '工作流'} 副本`;
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  copy.lastRunAt = null;
  state.agent.workflows.push(copy);
  persistRender();
}
function deleteWorkflow(id) {
  const workflow = state.agent.workflows.find((item) => item.id === id);
  if (!workflow) return;
  state.confirmDialog = {
    kind: 'delete-workflow',
    payload: { id },
    kicker: '删除工作流',
    title: `删除「${workflow.name || '未命名工作流'}」？`,
    message: '工作流定义会被删除，历史运行记录会继续保留快照。',
    confirmText: '删除工作流'
  };
  render();
}
function performDeleteWorkflow(id) {
  state.agent.workflows = state.agent.workflows.filter((item) => item.id !== id);
  if (state.workflowInvoke?.workflowId === id) state.workflowInvoke = null;
  persistRender();
}
function openWorkflowInvoke(id) {
  const workflow = state.agent.workflows.find((item) => item.id === id);
  if (!workflow) return;
  state.workflowInvoke = {
    workflowId: workflow.id,
    workflow: JSON.parse(JSON.stringify(workflow)),
    rows: JSON.parse(JSON.stringify(workflow.variables?.rows || [])),
    columns: [...(workflow.variables?.columns || [])],
    countPerRow: 1,
    concurrency: DEFAULT_AGENT_BUDGET.concurrency || 2,
    maxSteps: DEFAULT_AGENT_BUDGET.maxSteps || 5,
    maxImages: DEFAULT_AGENT_BUDGET.maxImages || 8,
    continueOnStepError: DEFAULT_AGENT_BUDGET.continueOnStepError !== false,
    references: []
  };
  render();
}
function workflowRowsTarget(scope) {
  if (scope === 'invoke') return state.workflowInvoke;
  return state.workflowDraft;
}
function addWorkflowRow(scope) {
  const target = workflowRowsTarget(scope);
  if (!target) return;
  const columns = target.columns || target.variables?.columns || [];
  const row = { id: uid('row'), values: Object.fromEntries(columns.map((column) => [column, ''])) };
  if (scope === 'invoke') target.rows.push(row);
  else target.variables.rows.push(row);
  persistRender();
}
function deleteWorkflowRow(scope, rowIndex) {
  const target = workflowRowsTarget(scope);
  if (!target) return;
  const rows = scope === 'invoke' ? target.rows : target.variables.rows;
  if (rows.length <= 1) return toast('至少保留一行变量');
  rows.splice(rowIndex, 1);
  persistRender();
}
function updateWorkflowRow(scope, rowIndex, column, value) {
  const target = workflowRowsTarget(scope);
  if (!target) return;
  const rows = scope === 'invoke' ? target.rows : target.variables.rows;
  rows[rowIndex] = rows[rowIndex] || { id: uid('row'), values: {} };
  rows[rowIndex].values = rows[rowIndex].values || {};
  rows[rowIndex].values[column] = value;
  writeStore();
}

async function newProject() {
  const value = await openTextInputDialog({
    kicker: '新建项目',
    title: '输入项目名称',
    message: '项目内会保存独立对话分支、工作流列表和运行记录。',
    placeholder: '例如：品牌海报项目'
  });
  if (!String(value || '').trim()) return;
  const project = { id: uid('project'), name: String(value).trim(), prompt: '', createdAt: Date.now(), updatedAt: Date.now() };
  state.agent.projects.push(project);
  state.agent.activeProjectId = project.id;
  ensureAgentProjectThread(project.id);
  saveAgentProjects();
  persistRender();
}
async function renameActiveProject() {
  const project = state.agent.projects.find((item) => item.id === state.agent.activeProjectId);
  if (!project) return toast('当前项目不存在');
  const value = await openTextInputDialog({
    kicker: '修改项目名称',
    title: '修改项目名称',
    message: '项目名称只影响本地 Agent/工作流分组显示。',
    value: project.name || '',
    placeholder: '项目名称'
  });
  const name = String(value || '').trim();
  if (!name) return;
  project.name = name;
  project.updatedAt = Date.now();
  await saveAgentProjects();
  persistRender();
}
async function editActiveProjectPrompt() {
  const project = state.agent.projects.find((item) => item.id === state.agent.activeProjectId);
  if (!project) return toast('当前项目不存在');
  const value = await openTextInputDialog({
    kicker: '修改项目提示词',
    title: '修改项目提示词',
    message: '这里会作为 Agent 对话和工作流规划的项目上下文，不会直接替换你的生图提示词。',
    value: project.prompt || '',
    multiline: true,
    placeholder: '项目专属提示词...'
  });
  if (value === null) return;
  project.prompt = String(value || '').trim();
  project.updatedAt = Date.now();
  await saveAgentProjects();
  persistRender();
}
function deleteProject() {
  if (state.agent.projects.length <= 1) return toast('至少保留一个项目');
  const id = state.agent.activeProjectId;
  const project = state.agent.projects.find((item) => item.id === id);
  state.confirmDialog = {
    kind: 'delete-project',
    payload: { id },
    kicker: '删除项目',
    title: `删除「${project?.name || '当前项目'}」？`,
    message: '项目会从当前工作区移除；运行中的任务不会被浏览器弹窗阻塞。',
    confirmText: '删除项目'
  };
  render();
}
async function performDeleteProject(id) {
  if (state.agent.projects.length <= 1) return toast('至少保留一个项目');
  const threadIds = projectThreads(id).map((thread) => thread.id);
  state.agent.projects = state.agent.projects.filter((p) => p.id !== id);
  delete state.agent.threadsByProject[id];
  delete state.agent.activeThreadIdByProject[id];
  for (const threadId of threadIds) delete state.agent.messagesByThread[threadId];
  state.agent.activeProjectId = state.agent.projects[0].id;
  ensureAgentProjectThread(state.agent.activeProjectId);
  await saveAgentProjects();
  persistRender();
}
async function saveAgentProjects() {
  await fetchJson('/api/settings/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentProjects: state.agent.projects.map(({ id, name, prompt, createdAt, updatedAt }) => ({ id, name, prompt, createdAt, updatedAt })) })
  }).catch(() => {});
}
let projectSaveTimer = null;
function debouncedProjectSave() {
  clearTimeout(projectSaveTimer);
  projectSaveTimer = setTimeout(saveAgentProjects, 700);
}
async function runAgent() {
  const input = $('#agentInput')?.value.trim();
  if (!input) return toast('请输入 Agent 任务');
  const textProfile = agentTextProfile();
  if (!textProfile) return toast('暂无 Responses API 对话模型，请到后台 Agent 配置选择文本模型');
  const projectId = state.agent.activeProjectId;
  state.agent.logs.push({ id: uid('log'), projectId, role: 'user', text: input, createdAt: Date.now() });
  state.agent.logs.push({ id: uid('log'), projectId, role: 'assistant', text: '已开始自动规划：将进行提示词改写与生图回填。', createdAt: Date.now(), pending: true });
  persistRender();
  try {
    const data = await resolveResponsePayload(await fetchJson('/api-proxy/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Profile-Id': profileId(textProfile) },
      body: JSON.stringify({
        input: `项目专属提示词：${(state.agent.projects.find((p) => p.id === projectId)?.prompt || '无')}\n请规划并改写适合生图的提示词。任务：${input}`,
        model: textProfile.model
      })
    }));
    const text = data.output_text || data.text || JSON.stringify(data).slice(0, 1200);
    state.agent.logs = state.agent.logs.map((log) => log.pending ? { ...log, pending: false, text } : log);
    state.composerPrompt = text;
    state.mode = 'gallery';
    writeStore();
    render();
    await generateImageTask();
  } catch (err) {
    const normalized = normalizeError(err, '执行失败');
    state.agent.logs = state.agent.logs.map((log) => log.pending ? { ...log, pending: false, text: `执行失败：${normalized.summary}`, errorDetail: normalized.detail } : log);
    persistRender();
  }
}

async function executeWorkflowInvoke() {
  const invoke = state.workflowInvoke;
  const workflow = state.agent.workflows.find((item) => item.id === invoke?.workflowId);
  if (!invoke || !workflow) return;
  const baseRows = (invoke.rows || []).filter((row) => row && row.values);
  const rows = expandWorkflowRowsForRun(workflow, baseRows);
  const columns = invoke.columns || workflow.variables?.columns || [];
  if (!columns.length) return toast('工作流缺少变量列');
  if (!baseRows.length) return toast('至少需要一行变量');
  const imageNode = (workflow.nodes || []).find((node) => node.type === 'image');
  if (!imageNode) return toast('工作流缺少生图节点');
  const countPerRow = Math.max(1, Number(invoke.countPerRow) || 1);
  const estimatedImages = rows.length * countPerRow;
  if (estimatedImages > Number(invoke.maxImages || DEFAULT_AGENT_BUDGET.maxImages)) return toast('预计图片数超过本次最大图片预算');
  const snapshot = JSON.parse(JSON.stringify(workflow));
  const runProfile = imageProfile();
  const run = {
    id: uid('workflow-run'),
    workflowId: workflow.id,
    projectId: workflow.projectId,
    workflowSnapshot: snapshot,
    profileSnapshot: {
      ...runProfile,
      id: profileId(runProfile),
      name: runProfile.name,
      provider: runProfile.provider,
      model: runProfile.model,
      apiMode: runProfile.apiMode || 'images'
    },
    status: 'running',
    concurrency: Math.max(1, Math.min(5, Number(invoke.concurrency) || 2)),
    budget: {
      maxSteps: Math.max(1, Number(invoke.maxSteps) || 5),
      maxImages: Math.max(1, Number(invoke.maxImages) || 8),
      countPerRow,
      continueOnStepError: invoke.continueOnStepError !== false,
      webMode: state.agent.webMode || 'task',
      reasoning: state.agent.reasoning || 'medium'
    },
    references: JSON.parse(JSON.stringify(invoke.references || [])),
    rows: JSON.parse(JSON.stringify(rows)),
    steps: [],
    imageTaskIds: [],
    createdAt: Date.now(),
    startedAt: Date.now(),
    finishedAt: null,
    elapsedMs: 0,
    error: ''
  };
  state.agent.workflowRuns.unshift(run);
  workflow.lastRunAt = Date.now();
  state.workflowInvoke = null;
  writeStore();
  render();
  await runWorkflowBatches(run);
}
function expandWorkflowRowsForRun(workflow, rows) {
  if (workflow.mode !== 'multi_image_series') return rows;
  const targetCount = Math.max(1, Math.min(24, Number(workflow.seriesConfig?.targetCount) || rows.length || 4));
  const expanded = [];
  rows.forEach((row) => {
    for (let i = 0; i < targetCount; i++) {
      expanded.push({
        ...JSON.parse(JSON.stringify(row)),
        id: `${row.id || uid('row')}-series-${i + 1}`,
        seriesIndex: i + 1,
        seriesTitle: `第 ${i + 1} 张`,
        values: {
          ...(row.values || {}),
          series_index: String(i + 1),
          series_title: `第 ${i + 1} 张`,
          series_instruction: workflow.seriesConfig?.promptInstruction || ''
        }
      });
    }
  });
  return expanded;
}

async function rewriteWorkflowPrompt(run, workflow, row, rawPrompt) {
  if (state.preferences?.allowPromptRewrite === false) return rawPrompt;
  const textProfile = agentTextProfile();
  if (!textProfile) throw new Error('未配置 Agent 文本模型');
  const project = state.agent.projects.find((item) => item.id === run.projectId) || activeProject();
  const data = await postAgentResponsesRequest(buildWorkflowAgentRequestPayload(rawPrompt, {
    project,
    textProfile,
    mode: 'rewrite',
    workflow,
    rowValues: row.values || {}
  }), textProfile);
  const text = extractResponseText(data, '');
  return String(text || rawPrompt).replace(/```[\s\S]*?```/g, '').trim() || rawPrompt;
}

async function runWorkflowBatches(run) {
  const queue = run.rows.map((row, index) => ({ row, index }));
  let active = 0;
  let failed = false;
  await new Promise((resolve) => {
    const pump = () => {
      if ((!queue.length && active === 0) || failed) return resolve();
      while (active < run.concurrency && queue.length && !failed) {
        const item = queue.shift();
        active++;
        executeWorkflowRow(run, item.row, item.index)
          .catch((err) => {
            if (!run.budget.continueOnStepError) {
              const normalized = normalizeError(err, '工作流执行失败');
              failed = true;
              run.status = 'error';
              run.error = normalized.summary;
              run.errorDetail = normalized.detail;
            }
          })
          .finally(() => {
            active--;
            writeStore();
            render();
            pump();
          });
      }
    };
    pump();
  });
  if (run.status === 'running') run.status = failed ? 'error' : 'success';
  run.finishedAt = Date.now();
  run.elapsedMs = run.finishedAt - run.startedAt;
  writeStore();
  render();
}

async function executeWorkflowRow(run, row, rowIndex) {
  const workflow = run.workflowSnapshot;
  const imageNode = (workflow.nodes || []).find((node) => node.type === 'image');
  const batchLabel = row.values?.subject || row.values?.product_name || row.values?.name || `第 ${rowIndex + 1} 行`;
  const seriesSuffix = row.seriesTitle || row.values?.series_title ? ` · ${row.seriesTitle || row.values.series_title}` : '';
  const planStep = createWorkflowStep(run, row, rowIndex, 'plan', '规划上下文', `变量行：${batchLabel}`);
  finishWorkflowStep(planStep, 'success', `已读取变量：${Object.entries(row.values || {}).map(([k, v]) => `${k}=${v}`).join('，')}`);
  const promptBase = fillTemplate(workflowPromptTemplate(workflow), row.values || {});
  const rawPrompt = row.values?.series_instruction ? `${promptBase}\n\n系列拆分要求：${row.values.series_instruction}\n当前图片：${row.values.series_title || `第 ${rowIndex + 1} 张`}` : promptBase;
  const rewriteStep = createWorkflowStep(run, row, rowIndex, 'rewrite', '改写提示词', rawPrompt);
  let prompt = rawPrompt;
  try {
    prompt = await rewriteWorkflowPrompt(run, workflow, row, rawPrompt);
    finishWorkflowStep(rewriteStep, 'success', prompt);
  } catch (err) {
    const normalized = normalizeError(err, '改写提示词失败');
    finishWorkflowStep(rewriteStep, 'success', rawPrompt, `Agent 改写失败，已使用原模板：${normalized.summary}`);
  }
  const imageStep = createWorkflowStep(run, row, rowIndex, 'image', imageNode?.title || '批量生图', prompt);
  try {
    const profile = run.profileSnapshot || imageProfile();
    const params = workflowImageParams(workflow, profile, run.budget.countPerRow);
    const taskSeed = {
      prompt,
      requestedParams: params,
      profile,
      references: run.references || [],
      workflowMeta: {
        entry: 'workflow',
        workflowId: run.workflowId,
        workflowRunId: run.id,
        workflowNodeId: imageNode?.id || 'image',
        batchRowId: row.id,
        batchLabel: `${batchLabel}${seriesSuffix}`,
        workflowName: workflow.name,
        onCreated: (task) => {
          run.imageTaskIds.push(task.id);
          imageStep.imageTaskIds = [...(imageStep.imageTaskIds || []), task.id];
        }
      }
    };
    const task = await generateImageTask(taskSeed);
    if (!task || task.status !== 'success') throw new Error(task?.error || '工作流生图失败');
    finishWorkflowStep(imageStep, 'success', `已生成 ${run.budget.countPerRow} 张：${batchLabel}`);
  } catch (err) {
    const normalized = normalizeError(err, '工作流生图失败');
    finishWorkflowStep(imageStep, 'error', '', normalized.summary);
    if (!run.budget.continueOnStepError) throw err;
  }
}

function createWorkflowStep(run, row, rowIndex, type, title, prompt) {
  const step = {
    id: uid('workflow-step'),
    index: run.steps.length + 1,
    rowIndex,
    rowId: row.id,
    type,
    title,
    status: 'running',
    prompt,
    resultText: '',
    imageTaskIds: [],
    startedAt: Date.now(),
    finishedAt: null,
    elapsedMs: 0,
    error: ''
  };
  run.steps.push(step);
  writeStore();
  render();
  return step;
}
function finishWorkflowStep(step, status, resultText = '', error = '') {
  step.status = status;
  step.resultText = resultText;
  step.error = error;
  step.finishedAt = Date.now();
  step.elapsedMs = step.finishedAt - step.startedAt;
}
function fillTemplate(template, values) {
  return String(template || '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => values[key] ?? '');
}

function openMaskEditor(refId) {
  if (!state.references.length) return;
  state.maskEditor = {
    activeRefId: refId || state.references[0].id,
    tool: 'brush',
    color: BRUSH_COLORS[0].value,
    brushSize: 64,
    history: {},
    redo: {}
  };
  render();
}
async function switchMaskRef(id) {
  await persistCanvasToRefDraft();
  state.maskEditor.activeRefId = id;
  render();
}
function setMaskTool(tool) {
  if (!state.maskEditor) return;
  state.maskEditor.tool = tool === 'eraser' ? 'eraser' : 'brush';
  updateMaskToolUi();
}
function setMaskColor(color) {
  if (!state.maskEditor || !BRUSH_COLORS.some((item) => item.value === color)) return;
  state.maskEditor.color = color;
  updateMaskToolUi();
}
function updateMaskToolUi() {
  const editor = state.maskEditor;
  if (!editor) return;
  const shell = $('.mask-canvas-shell');
  if (shell) {
    shell.classList.toggle('is-eraser', editor.tool === 'eraser');
    shell.classList.toggle('is-brush', editor.tool !== 'eraser');
    shell.style.setProperty('--mask-cursor-size', `${Number(editor.brushSize) || 64}px`);
    shell.style.setProperty('--mask-cursor-color', editor.color || BRUSH_COLORS[0].value);
  }
  $$('[data-action="mask-tool"]').forEach((button) => button.classList.toggle('active', button.dataset.tool === editor.tool));
  $$('.color-button[data-color]').forEach((button) => button.classList.toggle('active', button.dataset.color === editor.color));
}
async function setupMaskCanvas() {
  const baseCanvas = $('#maskBaseCanvas');
  const canvas = $('#maskCanvas');
  if (!baseCanvas || !canvas || !state.maskEditor) return;
  const ref = state.references.find((r) => r.id === state.maskEditor.activeRefId) || state.references[0];
  if (ref && !ref.originalBlobId) ref.originalBlobId = ref.blobId;
  const blob = await getBlob(ref?.originalBlobId || ref?.blobId).catch(() => null);
  if (!blob) return;
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
  const maxW = Math.min(img.naturalWidth, 1600);
  const scale = maxW / img.naturalWidth;
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  baseCanvas.width = width;
  baseCanvas.height = height;
  canvas.width = width;
  canvas.height = height;
  const baseCtx = baseCanvas.getContext('2d');
  const ctx = canvas.getContext('2d');
  baseCtx.drawImage(img, 0, 0, width, height);
  ctx.clearRect(0, 0, width, height);
  URL.revokeObjectURL(img.src);
  const maskBlob = ref?.maskBlobId ? await getBlob(ref.maskBlobId).catch(() => null) : null;
  if (maskBlob) {
    const maskImg = new Image();
    maskImg.src = URL.createObjectURL(maskBlob);
    await new Promise((resolve, reject) => { maskImg.onload = resolve; maskImg.onerror = reject; });
    ctx.drawImage(maskImg, 0, 0, width, height);
    URL.revokeObjectURL(maskImg.src);
  }
  installCanvasDrawing(canvas, ctx);
  updateMaskToolUi();
}
function installCanvasDrawing(canvas, ctx) {
  let drawing = false;
  let last = null;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches?.[0] || event.changedTouches?.[0] || event;
    return { x: (touch.clientX - rect.left) * (canvas.width / rect.width), y: (touch.clientY - rect.top) * (canvas.height / rect.height) };
  };
  const updateCursor = (event, visible = true) => {
    const cursor = $('#maskCursor');
    const shell = $('.mask-canvas-shell');
    if (!cursor || !shell) return;
    if (!visible) { cursor.classList.remove('visible'); return; }
    const rect = shell.getBoundingClientRect();
    cursor.style.left = `${event.clientX - rect.left}px`;
    cursor.style.top = `${event.clientY - rect.top}px`;
    cursor.classList.add('visible');
  };
  const drawSegment = (from, to) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Number(state.maskEditor.brushSize) || 64;
    if (state.maskEditor.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = state.maskEditor.color || BRUSH_COLORS[0].value;
      ctx.fillStyle = state.maskEditor.color || BRUSH_COLORS[0].value;
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  };
  const drawDot = (p) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const radius = (Number(state.maskEditor.brushSize) || 64) / 2;
    if (state.maskEditor.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = state.maskEditor.color || BRUSH_COLORS[0].value;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const start = (event) => {
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pushMaskHistory();
    drawing = true;
    last = point(event);
    drawDot(last);
    updateCursor(event);
  };
  const move = (event) => {
    updateCursor(event);
    if (!drawing) return;
    event.preventDefault();
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
    for (const item of events) {
      const p = point(item);
      drawSegment(last, p);
      last = p;
    }
  };
  const end = (event) => {
    drawing = false;
    last = null;
    if (event?.pointerId !== undefined) canvas.releasePointerCapture?.(event.pointerId);
  };
  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', (event) => { if (!drawing) updateCursor(event, false); });
}
function pushMaskHistory() {
  const canvas = $('#maskCanvas');
  const id = state.maskEditor.activeRefId;
  if (!canvas || !id) return;
  state.maskEditor.history[id] = state.maskEditor.history[id] || [];
  state.maskEditor.history[id].push(canvas.toDataURL('image/png'));
  state.maskEditor.history[id] = state.maskEditor.history[id].slice(-20);
  state.maskEditor.redo[id] = [];
}
function maskUndo() {
  const canvas = $('#maskCanvas');
  const id = state.maskEditor?.activeRefId;
  const stack = state.maskEditor?.history?.[id] || [];
  if (!canvas || !stack.length) return;
  state.maskEditor.redo[id] = state.maskEditor.redo[id] || [];
  state.maskEditor.redo[id].push(canvas.toDataURL('image/png'));
  restoreCanvasDataUrl(stack.pop());
}
function maskRedo() {
  const canvas = $('#maskCanvas');
  const id = state.maskEditor?.activeRefId;
  const stack = state.maskEditor?.redo?.[id] || [];
  if (!canvas || !stack.length) return;
  state.maskEditor.history[id].push(canvas.toDataURL('image/png'));
  restoreCanvasDataUrl(stack.pop());
}
function restoreCanvasDataUrl(url) {
  const canvas = $('#maskCanvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = url;
}
function maskCanvasHasPaint(canvas) {
  if (!canvas) return false;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) return true;
  }
  return false;
}
async function maskClear() {
  const ref = state.references.find((r) => r.id === state.maskEditor.activeRefId);
  if (!ref) return;
  const canvas = $('#maskCanvas');
  if (!canvas) return;
  pushMaskHistory();
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  if (ref.maskBlobId) await deleteBlob(ref.maskBlobId).catch(() => {});
  ref.maskBlobId = '';
  state.refUrls.delete(ref.id);
  toast('已清空当前遮罩');
}
async function persistCanvasToRefDraft() {
  const canvas = $('#maskCanvas');
  const ref = state.references.find((r) => r.id === state.maskEditor?.activeRefId);
  if (!canvas || !ref) return;
  if (!ref.originalBlobId) ref.originalBlobId = ref.blobId;
  if (!maskCanvasHasPaint(canvas)) {
    if (ref.maskBlobId) await deleteBlob(ref.maskBlobId).catch(() => {});
    ref.maskBlobId = '';
    return;
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  if (ref.maskBlobId) await deleteBlob(ref.maskBlobId).catch(() => {});
  ref.maskBlobId = await putBlob(blob);
  ref.type = ref.type || 'image/png';
  const size = await imageSizeFromBlob(blob).catch(() => ({}));
  ref.width = size.width;
  ref.height = size.height;
  state.refUrls.delete(ref.id);
}
async function composeReferenceWithMask(ref) {
  if (!ref?.originalBlobId) ref.originalBlobId = ref?.blobId;
  const originalBlob = await getBlob(ref.originalBlobId).catch(() => null);
  if (!originalBlob) return;
  if (!ref.maskBlobId) {
    if (ref.blobId !== ref.originalBlobId) await deleteBlob(ref.blobId).catch(() => {});
    ref.blobId = ref.originalBlobId;
    ref.type = originalBlob.type || ref.type || 'image/png';
    return;
  }
  const maskBlob = await getBlob(ref.maskBlobId).catch(() => null);
  if (!maskBlob) return;
  const baseImg = new Image();
  const maskImg = new Image();
  baseImg.src = URL.createObjectURL(originalBlob);
  maskImg.src = URL.createObjectURL(maskBlob);
  await Promise.all([
    new Promise((resolve, reject) => { baseImg.onload = resolve; baseImg.onerror = reject; }),
    new Promise((resolve, reject) => { maskImg.onload = resolve; maskImg.onerror = reject; })
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = baseImg.naturalWidth;
  canvas.height = baseImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = .42;
  ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  URL.revokeObjectURL(baseImg.src);
  URL.revokeObjectURL(maskImg.src);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  if (ref.blobId && ref.blobId !== ref.originalBlobId) await deleteBlob(ref.blobId).catch(() => {});
  ref.blobId = await putBlob(blob);
  ref.compositedBlobId = ref.blobId;
  ref.type = 'image/png';
  ref.width = canvas.width;
  ref.height = canvas.height;
  state.refUrls.delete(ref.id);
}
async function saveMaskEditor() {
  await persistCanvasToRefDraft();
  for (const ref of state.references) await composeReferenceWithMask(ref);
  state.maskEditor = null;
  persistRender();
  toast('遮罩编辑已保存并替换参考图');
}

function applyPromptFromUrl() {
  const pending = sessionStorage.getItem('prompt_to_use') || localStorage.getItem('gpt-image2-pending-prompt');
  if (pending) {
    state.composerPrompt = pending;
    sessionStorage.removeItem('prompt_to_use');
    localStorage.removeItem('gpt-image2-pending-prompt');
  }
}

function cleanMigrationUrl() {
  try {
    const url = new URL(location.href);
    url.searchParams.delete('nexgenExportGallery');
    url.searchParams.delete('nexgenImportGallery');
    url.searchParams.delete('target');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {}
}
async function runGalleryMigrationBridge() {
  const params = new URLSearchParams(location.search);
  if (params.get('nexgenExportGallery') === '1') {
    const target = params.get('target') || 'https://gpt-image2-bg5.pages.dev/?nexgenImportGallery=1';
    try {
      document.body.classList.add('is-migrating-gallery');
      const payload = await exportGalleryMigrationPayload();
      window.name = `NEXGEN_GALLERY_MIGRATION:${JSON.stringify(payload)}`;
      location.href = target.includes('nexgenImportGallery=1') ? target : `${target}${target.includes('?') ? '&' : '?'}nexgenImportGallery=1`;
      return true;
    } catch (err) {
      toast(`本地画廊导出失败：${err?.message || err}`);
      cleanMigrationUrl();
      return false;
    }
  }
  if (params.get('nexgenImportGallery') === '1') {
    const prefix = 'NEXGEN_GALLERY_MIGRATION:';
    try {
      if (!String(window.name || '').startsWith(prefix)) {
        toast('未收到本地画廊迁移数据，请从本地 8788 迁移入口重新打开。');
        cleanMigrationUrl();
        return false;
      }
      const payload = JSON.parse(String(window.name).slice(prefix.length));
      window.name = '';
      const result = await importGalleryMigrationPayload(payload);
      cleanMigrationUrl();
      toast(`画廊同步完成：新增 ${result.tasks} 个任务，图片缓存 ${result.blobs} 个`);
      return true;
    } catch (err) {
      toast(`线上画廊导入失败：${err?.message || err}`);
      cleanMigrationUrl();
      return false;
    }
  }
  return false;
}

async function init() {
  applyTheme();
  watchSystemTheme();
  applyPromptFromUrl();
  await loadRuntime().catch((err) => {
    console.warn('[home-v3] runtime unavailable', err);
    toast('未登录或配置未载入，部分功能需要登录后使用');
  });
  writeStore();
  render();
  setTimeout(warmPromptBootstrap, 300);
  schedulePromptSearchWarmup(12000);
  await runGalleryMigrationBridge();
  setTimeout(() => cleanupOrphanBlobs().catch((err) => console.warn('[home-v3] blob cleanup skipped', err)), 1200);
  setInterval(updateRunningTimers, 1000);
}

init();

function updateRunningTimers() {
  for (const task of state.tasks) {
    if (task.status !== 'running' && task.status !== 'queued') continue;
    const node = document.querySelector(`[data-elapsed-id="${CSS.escape(task.id)}"]`);
    if (node) node.textContent = formatElapsed(task);
  }
}
