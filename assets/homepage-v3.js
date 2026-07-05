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
async function fastImageSizeFromBlob(blob) {
  const head = new Uint8Array(await blob.slice(0, 131072).arrayBuffer());
  const size = parseImageSizeFromBytes(head);
  return size.width && size.height ? size : {};
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
      workflow: { ...DEFAULT_ENTRY_ADVANCED }
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
      workflow: { ...DEFAULT_ENTRY_ADVANCED, ...(readEntryAdvanced('workflow') || parsed.entryAdvanced?.workflow || {}) }
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
  if (cfg.mode === 'hybrid') return candidates.find((p) => profileId(p) === cfg.textProfileId) || null;
  return candidates.find((p) => profileId(p) === state.activeProfileId) || candidates[0] || null;
}
function agentWebSearchSupported(profile = agentTextProfile()) {
  if (!profile || profileMode(profile) !== 'responses') return false;
  if (providerKey(profile) !== 'openai') return false;
  const baseUrl = String(profile.baseUrl || '').trim();
  if (!baseUrl) return true;
  try {
    return /(^|\.)api\.openai\.com$/i.test(new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`).hostname);
  } catch {
    return false;
  }
}
function agentWebSearchEnabled(profile = agentTextProfile()) {
  if (!state.agentConfig?.webSearchEnabled) return false;
  if (!agentWebSearchSupported(profile)) return false;
  return state.agent.webMode !== 'off';
}
function agentImageProfile() {
  const cfg = state.agentConfig || {};
  const candidates = imageProfiles();
  if (cfg.mode === 'hybrid') return candidates.find((p) => profileId(p) === cfg.imageProfileId) || imageProfile();
  return imageProfile();
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
function sizeSummary(profile = activeProfile()) {
  const key = providerKey(profile);
  if (key === 'google') return `${state.settings.googleBaseResolution} · ${state.settings.googleAspectRatio}`;
  if (key === 'xai') return `${state.settings.xaiResolution} · ${state.settings.xaiAspectRatio}`;
  return `${state.settings.openaiSize || 'auto'} · ${state.settings.openaiAspectRatio || 'auto'}`;
}
function resolutionSummary(profile = activeProfile()) {
  const key = providerKey(profile);
  if (key === 'google') return state.settings.googleBaseResolution || '2K';
  if (key === 'xai') return state.settings.xaiResolution || '2k';
  return state.settings.openaiSize || 'auto';
}
function ratioSummary(profile = activeProfile()) {
  const key = providerKey(profile);
  if (key === 'google') return state.settings.googleAspectRatio || '1:1';
  if (key === 'xai') return state.settings.xaiAspectRatio || '1:1';
  return state.settings.openaiAspectRatio || 'auto';
}
function requestedParams(profile = activeProfile()) {
  return {
    source: `${PROVIDER[providerKey(profile)]?.name || profile.provider} · ${profile.name || profile.id} · ${profile.model || 'model'}`,
    provider: providerKey(profile),
    profileId: profile.id,
    profileName: profile.name,
    model: profile.model,
    size: sizeSummary(profile),
    resolution: providerKey(profile) === 'google' ? state.settings.googleBaseResolution : providerKey(profile) === 'xai' ? state.settings.xaiResolution : state.settings.openaiSize,
    aspectRatio: providerKey(profile) === 'google' ? state.settings.googleAspectRatio : providerKey(profile) === 'xai' ? state.settings.xaiAspectRatio : state.settings.openaiAspectRatio,
    quality: state.settings.quality,
    format: state.settings.output_format,
    compression: state.settings.output_compression,
    transparent: !!state.settings.transparent_output,
    moderation: state.settings.moderation,
    count: Number(state.settings.n) || 1
  };
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
    { key: 'transparent', type: 'bool', requested: firstDefined(requested.transparent, requested.transparent_background), actual: firstDefined(returned.transparent, returned.transparentBackground, returned.transparent_background) },
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
function promptWithCanvasConstraint(prompt, provider, params = {}) {
  const ratio = params.aspectRatio || params.aspect_ratio || 'auto';
  const resolution = params.resolution || params.size || '';
  if (!ratio || ratio === 'auto') return prompt;
  const [rw, rh] = String(ratio).split(':').map(Number);
  const orientation = rw && rh ? (rw > rh ? '横版' : rw < rh ? '竖版' : '正方形') : '';
  const googleTarget = provider === 'google' ? googleOfficialImageSize(resolution, ratio) : '';
  return [
    prompt,
    `画布约束：必须生成 ${ratio} ${orientation}构图，严格匹配所选比例，不要旋转为相反方向，不要自动改成 1:1。分辨率档位：${resolution || 'auto'}${googleTarget ? `，目标像素尺寸：${googleTarget}，禁止降级为其它尺寸` : ''}。`,
    provider === 'google' || provider === 'xai' ? `Canvas constraint: output aspect ratio must be ${ratio}; keep the ${orientation || 'selected'} orientation exactly.${googleTarget ? ` Target pixel size must be ${googleTarget}; do not downgrade to a lower resolution.` : ''}` : ''
  ].filter(Boolean).join('\n\n');
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
  const direct = firstDefined(data?.output_text, data?.text, data?.message, data?.content);
  if (typeof direct === 'string') return direct;
  const chunks = [];
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
    ${state.promptRepo.open ? renderPromptRepo() : ''}
    ${state.popover ? renderPopover(state.popover) : ''}
    ${state.workflowDraft ? renderWorkflowEditorModal(state.workflowDraft) : ''}
    ${state.workflowInvoke ? renderWorkflowInvokeModal() : ''}
    ${state.confirmDialog ? renderConfirmDialog() : ''}
    ${state.entryAdvancedModal ? renderEntryAdvancedModal(state.entryAdvancedModal) : ''}
    ${state.maskEditor ? renderMaskEditor() : ''}
    <input id="refFileInput" class="hidden" type="file" accept="image/*" multiple>
    <input id="proFileInput" class="hidden" type="file" accept="image/*" multiple>
    <input id="workflowRefInput" class="hidden" type="file" accept="image/*" multiple>
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
function captureAgentScrollState() {
  const log = $('.agent-log');
  if (!log) return;
  const offsetFromBottom = Math.max(0, log.scrollHeight - log.scrollTop - log.clientHeight);
  state.agentScrollState = {
    nearBottom: offsetFromBottom <= 56,
    offsetFromBottom
  };
}
function restoreAgentScrollState() {
  const log = $('.agent-log');
  if (!log) return;
  const snapshot = state.agentScrollState || { nearBottom: true, offsetFromBottom: 0 };
  const intent = state.agentScrollIntent || '';
  nextRenderFrame(() => {
    if (intent === 'force-bottom' || snapshot.nearBottom) log.scrollTop = log.scrollHeight;
    else log.scrollTop = Math.max(0, log.scrollHeight - log.clientHeight - snapshot.offsetFromBottom);
    state.agentScrollIntent = '';
  });
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
  const project = state.agent.projects.find((p) => p.id === state.agent.activeProjectId) || state.agent.projects[0];
  const username = state.user?.username || '未登录';
  const userInitial = (state.user?.username || '访').slice(0, 1);
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-logo">NG</div>
        <div><div class="brand-title">NexGen</div><div class="brand-subtitle">Nexus Generation</div></div>
      </div>
      <section class="sidebar-section">
        <button class="nav-button ${state.mode === 'gallery' ? 'active' : ''}" data-action="set-mode" data-mode="gallery" title="画廊生图"><span class="nav-icon">G</span><span>画廊</span></button>
        <button class="nav-button ${state.mode === 'pro' ? 'active' : ''}" data-action="set-mode" data-mode="pro" title="专业工作台"><span class="nav-icon">P</span><span>专业</span></button>
        <button class="nav-button ${state.mode === 'agent' ? 'active' : ''}" data-action="set-mode" data-mode="agent" title="Agent 项目"><span class="nav-icon">A</span><span>Agent</span></button>
        <button class="nav-button ${state.mode === 'workflow' ? 'active' : ''}" data-action="set-mode" data-mode="workflow" title="工作流"><span class="nav-icon">W</span><span>工作流</span></button>
      </section>
      ${state.mode === 'agent' || state.mode === 'workflow' ? `
        <section class="sidebar-section">
          <div class="section-label">Project</div>
          <div class="agent-project-card">
            <div class="project-name">${esc(project?.name || '默认项目')}</div>
            <div class="project-meta">项目内保存独立对话分支与工作流上下文</div>
            <select class="project-select" data-action="switch-project">
              ${state.agent.projects.map((p) => `<option value="${esc(p.id)}" ${p.id === state.agent.activeProjectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
            <button class="project-prompt-toggle" data-action="toggle-project-prompt">${state.agent.promptOpen ? '收起项目提示词' : '编辑项目提示词'}</button>
            ${state.agent.promptOpen ? `<textarea class="project-prompt" data-action="project-prompt-input" placeholder="项目专属提示词...">${esc(project?.prompt || '')}</textarea>` : `<div class="project-prompt-preview">${esc(project?.prompt || '未设置项目提示词')}</div>`}
          </div>
          <div class="mini-grid">
            <button class="mini-button" data-action="new-project">新建</button>
            <button class="mini-button" data-action="delete-project">删除</button>
          </div>
        </section>
        ${state.mode === 'agent' && agentConfigNotice() ? `<section class="sidebar-section"><div class="agent-config-note">${esc(agentConfigNotice())}</div></section>` : ''}` : ''}
      <section class="sidebar-section">
        <div class="account-card">
          <div class="account-line">
            <span class="account-avatar">${esc(userInitial)}</span>
            <div><div class="account-name">${esc(username)}</div><div class="account-role">${esc(state.user?.role || 'guest')}</div></div>
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
        <label class="search-box">搜索
          <input value="${esc(state.promptQuery || '')}" placeholder="按提示词、模型、尺寸、标签搜索..." data-action="search-gallery">
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
          ${(state.preferences?.alwaysShowRetryButton !== false || task.status !== 'success') ? iconButtonHtml('retry-task', task.id, '↻', '重试') : ''}
          ${iconButtonHtml('favorite-task', task.id, state.favorites[task.id] ? '★' : '☆', '收藏', state.favorites[task.id] ? 'active' : '')}
          ${iconButtonHtml('reuse-task', task.id, '↩', '复用配置')}
          ${iconButtonHtml('edit-output', task.id, '✎', '编辑输出')}
          ${iconButtonHtml('delete-task', task.id, '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h8m-7 3v6m3-6v6m3-6v6M6.5 8l.7 11.2A2 2 0 0 0 9.2 21h5.6a2 2 0 0 0 2-1.8L17.5 8M10 5h4l.8 2H19M5 7h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>', '删除', 'danger')}
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
  const profile = entry === 'pro' ? proImageProfile() : imageProfile();
  const advanced = effectiveAdvanced(entry, profile);
  const title = entry === 'gallery' ? '画廊高级配置' : entry === 'workflow' ? '工作流高级配置' : '专业工作台高级配置';
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
  const messages = agentMessages(project?.id);
  const textProfile = agentTextProfile();
  const searchState = !state.agentConfig?.webSearchEnabled ? '后台已关闭联网' : agentWebSearchSupported(textProfile) ? (state.agent.webMode === 'off' ? '联网关闭' : '联网开启') : '当前模型不支持联网';
  return `
    <section class="agent-stage">
      <div class="agent-head">
        <div class="agent-head-copy">
          <div class="agent-title">${esc(project?.name || '默认项目')}</div>
          <div class="project-meta">${esc(project?.prompt || '未设置项目提示词')}</div>
          <div class="agent-status-line">
            <span class="status-pill">${esc(textProfile?.model || '未配置文本模型')}</span>
            <span class="status-pill">${esc(searchState)}</span>
          </div>
        </div>
        <div class="agent-head-actions">
          <label class="agent-thread-select">
            <span>会话</span>
            <select data-action="switch-agent-thread">
              ${threads.map((thread) => `<option value="${esc(thread.id)}" ${thread.id === threadId ? 'selected' : ''}>${esc(thread.title || '主对话')}</option>`).join('')}
            </select>
          </label>
          <button class="toolbar-button" data-action="clear-agent-thread">清空对话</button>
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
function renderAgentComposer() {
  const textProfile = agentTextProfile();
  const webDisabled = !state.agentConfig?.webSearchEnabled || !agentWebSearchSupported(textProfile);
  const webLabel = !state.agentConfig?.webSearchEnabled ? '后台关闭' : webDisabled ? '不支持' : state.agent.webMode === 'off' ? '关闭' : '开启';
  const pending = activeAgentHasPending();
  return `
    <section class="composer agent-composer">
      <div class="composer-text-wrap">
        <textarea id="agentInput" placeholder="和当前项目 Agent 对话；批量生图请进入左侧工作流分页..." data-action="agent-input">${esc(state.agent.inputDraft || '')}</textarea>
      </div>
      <div class="composer-controls">
        <button class="control-chip ${!webDisabled && state.agent.webMode !== 'off' ? 'active-chip' : ''}" data-action="agent-web" ${webDisabled ? 'disabled aria-disabled="true"' : ''}><small>联网</small>${esc(webLabel)}</button>
        <button class="control-chip active-chip" data-action="agent-reason"><small>推理</small>${esc(state.agent.reasoning || 'medium')}</button>
        <button class="generate-button" data-action="agent-chat" ${pending ? 'disabled aria-disabled="true"' : ''}>${pending ? '正在思考' : '发送对话'}</button>
      </div>
    </section>
  `;
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
function renderAgentMessage(message) {
  const canRetry = message.role !== 'user' && message.errorDetail && message.retryInput;
  return `<div class="agent-message ${message.role === 'user' ? 'user' : ''} ${message.pending ? 'pending' : ''}">
    <div class="agent-message-head">
      <span>${esc(message.role === 'user' ? '你' : 'Agent')}</span>
      <button class="agent-message-menu-button" data-action="open-agent-message-menu" data-id="${esc(message.id)}" aria-label="消息操作">···</button>
    </div>
    <div>${esc(message.text || '')}</div>
    ${canRetry ? `<button class="toolbar-button agent-retry-button" data-action="retry-agent-message" data-id="${esc(message.id)}">重试</button>` : ''}
    ${message.imagePrompt ? `<button class="toolbar-button" data-action="confirm-agent-image" data-prompt="${esc(message.imagePrompt)}">生成图片</button>` : ''}
    ${message.errorDetail ? `<details class="agent-error-detail"><summary>查看详情</summary><pre>${esc(message.errorDetail)}</pre></details>` : ''}
    <time>${esc(formatTime(message.createdAt || Date.now()))}</time>
  </div>`;
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
          ${isTransparentPng && image ? `<button class="detail-download original" data-action="download-image" data-task-id="${esc(task.id)}" data-index="${esc(imageIndex)}">下载原图</button><button class="detail-download orig" data-action="download-image" data-task-id="${esc(task.id)}" data-index="${esc(imageIndex)}">ORIG</button>` : ''}
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
    source = { blobId: image.blobId, remoteUrl: image.url || image.remoteUrl, name: `${task?.id || 'image'}-${index + 1}.png` };
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
  if (pop.type === 'size') return renderSizeModal();
  if (pop.type === 'resolution') return renderSizeModal();
  if (pop.type === 'agent-message-menu') return renderAgentMessageMenu(pop);
  const options = {
    quality: ['auto', 'low', 'medium', 'high'],
    format: ['png', 'jpeg', 'webp'],
    compression: state.settings.output_format === 'png' ? ['是', '否'] : ['100', '95', '90', '80', '70']
  }[pop.type] || [];
  const rect = pop.rect || { left: 40, top: 40, bottom: 100 };
  return `
    <div class="popover up-popover" style="${popoverStyle(rect, 250, Math.min(320, 48 + options.length * 38))}">
      ${options.map((value) => `<button class="${isPopoverValueActive(pop.type, value) ? 'active' : ''}" data-action="set-popover-value" data-type="${esc(pop.type)}" data-value="${esc(value)}">${esc(value)}</button>`).join('')}
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
  const categories = state.promptRepo.categories?.length ? state.promptRepo.categories : ['all'];
  const activeCategory = state.promptRepo.category || 'all';
  const promptWindow = promptRepoVirtualWindow(state.promptRepo.items.length);
  const promptItems = state.promptRepo.items.slice(promptWindow.startIndex, promptWindow.endIndex);
  return `
    <div class="modal-layer prompt-repo-layer">
      <div class="prompt-modal" role="dialog" aria-modal="true" aria-label="提示词仓库" tabindex="-1" data-stop>
        <div class="prompt-head">
          <div><strong>提示词仓库</strong><span>${esc(state.promptRepo.total || 0)} 条 · ${esc(activeCategory === 'all' ? '全部分类' : activeCategory)}</span></div>
          <input id="promptRepoSearch" value="${esc(state.promptRepo.query || '')}" placeholder="搜索中文关键词、标题或提示词..." data-action="prompt-search" autocomplete="off" spellcheck="false">
          <button class="toolbar-button" data-action="close-prompt-repo">关闭</button>
        </div>
        <div class="prompt-repo-body">
          <aside class="prompt-categories" aria-label="提示词分类">
            ${categories.map((cat) => `<button class="${cat === activeCategory ? 'active' : ''}" data-action="prompt-category" data-cat="${esc(cat)}">${esc(cat === 'all' ? '全部' : cat)}</button>`).join('')}
            ${state.promptRepo.categoriesLoading ? '<div class="prompt-category-loading">分类加载中...</div>' : ''}
          </aside>
          <div class="prompt-list ${promptWindow.shouldVirtualize ? 'is-virtual' : ''}" id="promptList" data-virtual="${promptWindow.shouldVirtualize ? '1' : '0'}">
            ${promptWindow.topPad ? `<div class="prompt-spacer" style="height:${esc(promptWindow.topPad)}px"></div>` : ''}
            ${promptItems.map(renderPromptCard).join('')}
            ${state.promptRepo.loading ? '<div class="prompt-card prompt-loading">加载中...</div>' : ''}
            ${(!state.promptRepo.loading && !state.promptRepo.items.length) ? '<div class="prompt-empty">没有匹配的提示词</div>' : ''}
            ${promptWindow.bottomPad ? `<div class="prompt-spacer" style="height:${esc(promptWindow.bottomPad)}px"></div>` : ''}
          </div>
        </div>
      </div>
      ${state.promptRepo.detail ? renderPromptDetail(state.promptRepo.detail) : ''}
      ${state.promptRepo.imageViewer ? `<div class="viewer-layer" role="dialog" aria-modal="true" aria-label="提示词大图" data-action="prompt-image-close"><button class="viewer-close" aria-label="关闭" data-action="prompt-image-close">×</button><img class="viewer-image" src="${esc(state.promptRepo.imageViewer)}" alt=""></div>` : ''}
    </div>
  `;
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
function renderPromptCard(item) {
  return `
    <button class="prompt-card" data-action="prompt-detail" data-id="${esc(item.id)}">
      ${item.i ? `<img src="${esc(item.i)}" alt="">` : ''}
      <strong>${esc(item.t || '未命名提示词')}</strong>
      <p>${esc(item.p || '')}</p>
    </button>
  `;
}
function renderPromptDetail(item) {
  return `
    <div class="modal-layer" style="background:rgba(0,0,0,.18)" data-action="prompt-detail-close">
      <div class="size-modal" role="dialog" aria-modal="true" aria-label="提示词详情" tabindex="-1" data-stop>
        <button class="modal-close" aria-label="关闭" data-action="prompt-detail-close">×</button>
        <h2>${esc(item.t || '提示词详情')}</h2>
        ${item.i ? `<img src="${esc(item.i)}" data-action="prompt-image-view" style="width:100%;max-height:320px;object-fit:contain;border-radius:18px;background:rgba(0,0,0,.05)" alt="">` : ''}
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
  const promptList = $('#promptList');
  if (promptList) {
    promptList.addEventListener('scroll', () => {
      state.promptRepo.scrollTop = promptList.scrollTop;
      state.promptRepo.viewportHeight = promptList.clientHeight || state.promptRepo.viewportHeight || 620;
      if (Date.now() < (state.promptRepo.scrollLockUntil || 0)) return;
      if (promptList.scrollTop + promptList.clientHeight > promptList.scrollHeight - 320) loadPromptPage();
    }, { passive: true });
  }
  const promptRepoSearch = $('#promptRepoSearch');
  if (promptRepoSearch) {
    promptRepoSearch.addEventListener('compositionstart', () => {
      state.promptRepo.composing = true;
    });
    promptRepoSearch.addEventListener('compositionend', (event) => {
      state.promptRepo.composing = false;
      state.promptRepo.query = event.target.value;
      debouncedPromptSearch(360);
    });
  }
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
    agentInput.addEventListener('input', (event) => autoGrow(event.target));
    agentInput.addEventListener('keydown', (event) => {
      const submit = state.preferences?.enterSubmit ? event.key === 'Enter' && !event.shiftKey : event.key === 'Enter' && (event.ctrlKey || event.metaKey);
      if (!submit) return;
      event.preventDefault();
      sendAgentChat();
    });
  }
  const agentLog = $('.agent-log');
  if (agentLog) agentLog.addEventListener('scroll', captureAgentScrollState, { passive: true });
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
  if (action === 'open-size-modal') { state.popover = { type: 'size', rect: target.getBoundingClientRect() }; render(); return; }
  if (action === 'open-resolution-modal') { state.popover = { type: 'resolution', rect: target.getBoundingClientRect() }; render(); return; }
  if (action === 'close-popover') { state.popover = null; render(); return; }
  if (action === 'set-size') { state.settings.openaiSize = target.dataset.value; state.popover = null; writeComposerSessionSettings(); persistRender(); return; }
  if (action === 'set-openai-ratio') { state.settings.openaiAspectRatio = target.dataset.value; state.popover = null; writeComposerSessionSettings(); persistRender(); return; }
  if (action === 'set-google-base') { state.settings.googleBaseResolution = target.dataset.value; state.popover = null; writeComposerSessionSettings(); persistRender(); return; }
  if (action === 'set-google-ratio') { state.settings.googleAspectRatio = target.dataset.value; state.popover = null; writeComposerSessionSettings(); persistRender(); return; }
  if (action === 'set-xai-resolution') { state.settings.xaiResolution = target.dataset.value; state.popover = null; writeComposerSessionSettings(); persistRender(); return; }
  if (action === 'set-xai-ratio') { state.settings.xaiAspectRatio = target.dataset.value; state.popover = null; writeComposerSessionSettings(); persistRender(); return; }
  if (action === 'open-model-config') { state.popover = { type: 'model-config', rect: target.getBoundingClientRect() }; render(); return; }
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
  if (action === 'prompt-detail') { state.promptRepo.detail = state.promptRepo.items.find((p) => String(p.id) === String(target.dataset.id)); render(); return; }
  if (action === 'prompt-detail-close') { state.promptRepo.detail = null; render(); return; }
  if (action === 'use-prompt') { usePrompt(target.dataset.id); return; }
  if (action === 'prompt-image-view') { state.promptRepo.imageViewer = target.src; render(); return; }
  if (action === 'prompt-image-close') { state.promptRepo.imageViewer = null; render(); return; }
  if (action === 'agent-chat') { await sendAgentChat(); return; }
  if (action === 'confirm-agent-image') {
    state.composerPrompt = target.dataset.prompt || '';
    state.mode = 'gallery';
    persistRender();
    await generateImageTask();
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
    if (state.viewer) { state.viewer = null; render(); return; }
    if (state.promptRepo.imageViewer) { state.promptRepo.imageViewer = null; render(); return; }
    if (state.promptRepo.detail) { state.promptRepo.detail = null; render(); return; }
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
function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'system';
  const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
  localStorage.setItem(THEME_KEY, next);
  applyTheme();
  toast(next === 'system' ? '主题跟随系统' : `主题已切换为 ${next}`);
}
function applyTheme() {
  const value = localStorage.getItem(THEME_KEY) || state?.preferences?.themeMode || 'light';
  const resolved = value === 'system' ? systemTheme() : value;
  document.documentElement.dataset.themeMode = value;
  document.documentElement.setAttribute('data-theme', resolved);
}
function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function watchSystemTheme() {
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
  state.activeProfileId = state.activeProfileId || runtime?.activeProfileId || state.profiles[0].id;
  state.activeImageProfileId = state.activeImageProfileId || imageProfiles().find((p) => profileId(p) === runtime?.activeProfileId)?.id || imageProfiles()[0]?.id || state.activeProfileId;
  state.agentConfig = {
    mode: runtime?.agentApiConfigMode || 'off',
    textProfileId: runtime?.agentTextProfileId || null,
    imageProfileId: runtime?.agentImageProfileId || null,
    webSearchEnabled: !!runtime?.agentWebSearch,
    scrollAfterSubmit: runtime?.agentScrollToBottomAfterSubmit !== false
  };
  if (!state.agentConfig.webSearchEnabled) state.agent.webMode = 'off';
  Object.assign(state.settings, {
    quality: state.settings.quality || runtime?.quality || 'high',
    output_format: state.settings.output_format || runtime?.output_format || 'png',
    output_compression: state.settings.output_compression ?? runtime?.output_compression ?? 90,
    n: state.settings.n || runtime?.n || 1,
    transparent_output: state.settings.transparent_output ?? !!runtime?.transparent_output,
    moderation: state.settings.moderation || runtime?.moderation || 'auto'
  });
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
async function handlePaste(event) {
  const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith('image/'));
  if (files.length) await addFilesAsReferences(files);
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
    workflowId: meta.workflowId || seedTask?.workflowId || '',
    workflowRunId: meta.workflowRunId || seedTask?.workflowRunId || '',
    workflowNodeId: meta.workflowNodeId || seedTask?.workflowNodeId || '',
    batchRowId: meta.batchRowId || seedTask?.batchRowId || '',
    batchLabel: meta.batchLabel || seedTask?.batchLabel || '',
    workflowName: meta.workflowName || seedTask?.workflowName || '',
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
    const result = await collectGenerationResult(prompt, params, {
      profile,
      references,
      entry: meta.entry || 'gallery',
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
    task.returnedParams = extractReturnedParams(response, params, images);
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
      const expected = Number(task.expectedCount || params.count || task.images.length);
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
  for (let attempt = 0; attempt < maxAttempts && images.length < expected; attempt++) {
    const remaining = Math.max(1, expected - images.length);
    const requestParams = forceSingleRequests ? { ...params, count: 1 } : (attempt === 0 ? params : { ...params, count: remaining });
    try {
      const apiStartedAt = Date.now();
      const response = await sendGenerationRequest(prompt, requestParams, { ...options, profile });
      apiElapsedMs += Date.now() - apiStartedAt;
      responses.push(response);
      const persistStartedAt = Date.now();
      const batch = await persistResponseImages(response);
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
  return { response, images, partialErrors, expectedCount: expected, actualCount: images.length, failedCount: Math.max(0, expected - images.length), apiElapsedMs, persistElapsedMs };
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
    out.transparent_background = !!firstDefined(requestParams.transparent, requestParams.transparent_background, state.settings.transparent_output, false);
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
    const size = await imageSizeFromBlob(blob).catch(() => ({}));
    return { blobId, remoteUrl: /^data:/i.test(String(remoteUrl || '')) ? '' : remoteUrl, width: size.width, height: size.height, type: blob.type };
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
  const returnedTransparent = readDeepAlias(response, ['transparent', 'transparent_background', 'transparentBackground', 'transparent_output', 'transparentOutput']);
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
    galleryVirtualWindow,
    maskCanvasHasPaint,
    shouldCloseModalFromClick,
    returnedPromptFromResponse,
    normalizeComparableValue,
    computeParamMismatches,
    providerPayload,
    openAiSizePayload,
    googleOfficialImageSize,
    expectedProviderResolution,
    isTierResolutionMatch,
    taskReferenceDisplayBlobId,
    taskReferenceOriginalBlobId,
    cardParamSummary,
    renderImageContextMenu,
    summarizeResponse,
    agentTextProfile,
    agentWebSearchSupported,
    agentRequestTimeoutSeconds,
    agentFailureDetail,
    activeAgentHasPending,
    buildAgentRequestPayload,
    migrateAgentThreads,
    branchAgentThreadFromMessage,
    clearAgentThreadMessages,
    renderAgentStage,
    renderAgentComposer,
    writeStore,
    setTestTasks: (tasks) => { state.tasks = Array.isArray(tasks) ? tasks : []; },
    setTestState: (patch = {}) => {
      if (patch.profiles) state.profiles = patch.profiles;
      if (patch.activeProfileId !== undefined) state.activeProfileId = patch.activeProfileId;
      if (patch.activeImageProfileId !== undefined) state.activeImageProfileId = patch.activeImageProfileId;
      if (patch.agentConfig) state.agentConfig = { ...state.agentConfig, ...patch.agentConfig };
      if (patch.agent) state.agent = migrateAgentThreads({ ...state.agent, ...patch.agent });
      if (patch.preferences) state.preferences = { ...state.preferences, ...patch.preferences };
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
      tasks: state.tasks,
      references: state.references,
      galleryVirtual: state.galleryVirtual,
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

function openPromptRepo() {
  state.promptRepo = {
    open: true,
    page: 0,
    pages: 1,
    total: 0,
    loading: false,
    items: [],
    query: state.promptRepo.query || '',
    category: state.promptRepo.category || 'all',
    categories: state.promptRepo.categories || ['all'],
    categoriesLoading: !state.promptRepo.categories?.length || state.promptRepo.categories.length <= 1,
    detail: null,
    imageViewer: null,
    composing: false,
    requestSeq: state.promptRepo.requestSeq || 0
  };
  render();
  loadPromptCategories().then(() => loadPromptPage());
}
let promptSearchTimer = null;
function debouncedPromptSearch(delay = 260) {
  clearTimeout(promptSearchTimer);
  promptSearchTimer = setTimeout(() => {
    resetPromptRepoList();
  }, delay);
}
function resetPromptRepoList() {
  state.promptRepo.page = 0;
  state.promptRepo.pages = 1;
  state.promptRepo.total = 0;
  state.promptRepo.items = [];
  state.promptRepo.requestSeq = (state.promptRepo.requestSeq || 0) + 1;
  render();
  loadPromptPage();
}
function setPromptCategory(category) {
  state.promptRepo.category = category || 'all';
  state.promptRepo.detail = null;
  resetPromptRepoList();
}
async function loadPromptCategories() {
  state.promptRepo.categoriesLoading = true;
  try {
    const data = await fetchJson('/api/prompts?categories=1');
    if (!state.promptRepo.open) return;
    state.promptRepo.categories = data.categories?.length ? data.categories : ['all'];
    state.promptRepo.total = data.total || state.promptRepo.total || 0;
    state.promptRepo.categoriesLoading = false;
    render();
  } catch (err) {
    if (!state.promptRepo.categories?.length) state.promptRepo.categories = ['all'];
    state.promptRepo.categoriesLoading = false;
  }
}
async function loadPromptPage() {
  if (!state.promptRepo.open || state.promptRepo.loading || state.promptRepo.page >= state.promptRepo.pages) return;
  const requestSeq = state.promptRepo.requestSeq || 0;
  const promptList = $('#promptList');
  const restoreScrollTop = promptList ? promptList.scrollTop : null;
  state.promptRepo.loading = true;
  try {
    const page = state.promptRepo.page + 1;
    const q = encodeURIComponent(state.promptRepo.query || '');
    const cat = state.promptRepo.category && state.promptRepo.category !== 'all' ? `&cat=${encodeURIComponent(state.promptRepo.category)}` : '';
    const data = await fetchJson(`/api/prompts?page=${page}&limit=${PROMPT_PAGE_SIZE}${cat}&q=${q}`);
    if ((state.promptRepo.requestSeq || 0) !== requestSeq) return;
    state.promptRepo.page = data.page || page;
    state.promptRepo.pages = data.pages || 1;
    state.promptRepo.total = data.total || 0;
    state.promptRepo.items.push(...(data.prompts || []));
  } catch (err) {
    toast('提示词仓库加载失败');
  } finally {
    state.promptRepo.loading = false;
    render();
    if (restoreScrollTop !== null) {
      state.promptRepo.scrollLockUntil = Date.now() + 240;
      requestAnimationFrame(() => {
        const nextList = $('#promptList');
        if (nextList) {
          nextList.scrollTop = Math.min(restoreScrollTop, Math.max(0, nextList.scrollHeight - nextList.clientHeight));
          state.promptRepo.scrollTop = nextList.scrollTop;
        }
      });
    }
  }
}
function usePrompt(id) {
  const item = state.promptRepo.items.find((p) => String(p.id) === String(id));
  if (!item) return;
  state.composerPrompt = item.p || '';
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
  const payload = {
    model: currentModelSlug,
    reasoning: { effort: state.agent.reasoning || 'medium' },
    input: [
      `当前项目：${project.name || '默认项目'}`,
      `项目专属提示词：${project.prompt || '无'}`,
      `当前文本模型 slug：${currentModelSlug || '未配置'}`,
      currentBeijingTime,
      `联网状态：${webSearchEnabled ? '已开启' : (!state.agentConfig?.webSearchEnabled ? '后台关闭' : agentWebSearchSupported(textProfile) ? '已关闭' : '当前模型不支持')}`,
      `对话历史：\n${history || '无'}`,
      `用户新消息：${input}`,
      '请作为项目 Agent 正常对话，直接回答用户问题。若用户询问当前模型或时间，优先使用上面的运行时上下文。不要生成 workflow JSON，除非用户明确要求。'
    ].join('\n'),
    currentBeijingTime,
    currentModelSlug,
    webSearchEnabled
  };
  if (webSearchEnabled) payload.tools = [{ type: 'web_search' }];
  return payload;
}
async function sendAgentChat() {
  const inputEl = $('#agentInput');
  const input = inputEl?.value.trim();
  if (!input) return toast('请输入要发送给 Agent 的内容');
  if (activeAgentHasPending()) return toast('当前对话仍在思考中，请等待返回后再发送');
  const project = activeProject();
  if (!project) return toast('请先创建或选择项目');
  const textProfile = agentTextProfile();
  if (!textProfile || profileMode(textProfile) !== 'responses') return toast('当前 Agent 文本模型配置无效，请到后台 Agent 配置选择 Responses API 文本模型');
  const thread = ensureAgentProjectThread(project.id);
  const messages = agentMessages(project.id);
  const userMessage = { id: uid('msg'), threadId: thread.id, projectId: project.id, role: 'user', text: input, createdAt: Date.now() };
  const pendingId = uid('msg');
  messages.push(userMessage);
  messages.push({ id: pendingId, threadId: thread.id, projectId: project.id, role: 'assistant', text: '正在思考...', createdAt: Date.now(), pending: true, retryInput: input });
  state.agent.messagesByThread[thread.id] = messages;
  state.agent.activeThreadIdByProject[project.id] = thread.id;
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
    const payload = buildAgentRequestPayload(input, { project, history: messages, textProfile });
    const { currentBeijingTime, currentModelSlug, webSearchEnabled, ...requestBody } = payload;
    const data = await fetchJson('/api-proxy/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Profile-Id': profileId(textProfile) },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    const text = extractResponseText(data, 'Agent 已返回，但没有可显示文本。');
    const imagePrompt = inferAgentImagePrompt(input, text);
    state.agent.messagesByThread[thread.id] = agentMessages(project.id).map((msg) => msg.id === pendingId ? { ...msg, pending: false, text, imagePrompt, retryInput: '', profileId: profileId(textProfile), model: textProfile.model || '', requestMs: Date.now() - requestStartedAt } : msg);
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
    state.agent.messagesByThread[thread.id] = agentMessages(project.id).map((msg) => msg.id === pendingId ? { ...msg, pending: false, text: `对话失败：${normalized.summary}`, errorDetail: detail, retryInput: input, profileId: profileId(textProfile), model: textProfile.model || '', requestMs: Date.now() - requestStartedAt, upstreamStatus: err?.upstreamStatus || err?.status || err?.raw?.upstreamStatus } : msg);
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
function inferAgentImagePrompt(userInput, assistantText) {
  const source = `${userInput}\n${assistantText}`;
  if (!/(生成|出图|生图|图片|海报|渲染|视觉|封面|主图|poster|image|render)/i.test(source)) return '';
  if (/(不要生成|不用生成|只聊天|只分析|不出图)/.test(source)) return '';
  const prompt = String(assistantText || userInput || '').replace(/```[\s\S]*?```/g, '').trim();
  return prompt.length > 900 ? prompt.slice(0, 900) : prompt;
}
function workflowPromptTemplate(workflow) {
  const imageNode = (workflow.nodes || []).find((node) => node.type === 'image') || {};
  return workflow.config?.promptTemplate || imageNode.promptTemplate || workflow.templateBindings?.imagePrompt || '{{subject}}，{{style}}，高质量商业生图';
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
    const data = await fetchJson('/api-proxy/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Profile-Id': profileId(textProfile) },
      body: JSON.stringify({
        model: textProfile.model,
        reasoning: { effort: state.agent.reasoning || 'medium' },
        input: [
          `项目专属提示词：${project?.prompt || '无'}`,
          `用户任务：${input}`,
          formatBeijingTimeLabel(),
          `当前文本模型 slug：${textProfile.model || '未配置'}`,
          `联网：${agentWebSearchEnabled(textProfile) ? '已开启' : '未开启'}；推理：${state.agent.reasoning || 'medium'}`,
          '请返回一个可复用批量生图 workflow JSON，包含 name, nodes, edges, variables.columns, variables.rows, image promptTemplate。只返回 JSON。'
        ].join('\n')
      })
    });
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
    const data = await fetchJson('/api-proxy/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Profile-Id': profileId(textProfile) },
      body: JSON.stringify({
        input: `项目专属提示词：${(state.agent.projects.find((p) => p.id === projectId)?.prompt || '无')}\n请规划并改写适合生图的提示词。任务：${input}`,
        model: textProfile.model
      })
    });
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
  const data = await fetchJson('/api-proxy/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Profile-Id': profileId(textProfile) },
    body: JSON.stringify({
      model: textProfile.model,
      reasoning: run.budget?.reasoning || state.agent.reasoning || 'medium',
      webMode: run.budget?.webMode || state.agent.webMode || 'task',
      input: [
        '你是 NexGen 工作流的提示词改写器。只输出最终生图提示词，不要解释。',
        `项目提示词：${project?.prompt || '无'}`,
        `工作流：${workflow.name || '未命名工作流'} / ${workflow.description || '无描述'}`,
        `变量：${JSON.stringify(row.values || {})}`,
        `原始模板结果：${rawPrompt}`,
        '要求：保留变量含义，提升画面可执行性、主体清晰度、风格一致性和生成模型可理解度。'
      ].join('\n')
    })
  });
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
    const params = { ...requestedParams(profile), count: run.budget.countPerRow };
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
