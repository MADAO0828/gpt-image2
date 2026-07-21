const STORE_KEY = 'gpt-image2.home.v3';
const TASK_DELETE_TOMBSTONE_KEY = `${STORE_KEY}.task-deletions`;
const TASK_DELETE_TOMBSTONE_LIMIT = 256;
const THEME_KEY = 'gpt-image2.theme';
const COMPOSER_SESSION_KEY = 'gpt-image2.home.v3.composer-session';
const ENTRY_ADVANCED_PREFIX = 'nexgen-entry-advanced.';
const PERSISTED_PROMPT_KEY = 'gpt-image2.home.v3.persisted-prompt';
const DB_NAME = 'gpt-image2-home-v3';
const DB_STORE = 'blobs';
const DB_AGENT_STORE = 'agentThreads';
const DB_TASK_STORE = 'tasks';
const TASK_TOMBSTONE_PREFIX = '__task-delete__:';
const TASK_TOMBSTONE_KIND = 'task-delete';
const BLOB_RESERVATION_KEY = 'gpt-image2.home.v3.blob-reservations';
const BLOB_RESERVATION_PREFIX = `${BLOB_RESERVATION_KEY}.`;
const BLOB_RESERVATION_TTL_MS = 90 * 1000;
const BLOB_RELEASE_RETRY_DELAY_MS = 5000;
const BLOB_REFERENCE_LOCK_NAME = 'gpt-image2-blob-reference';
const PROMPT_PAGE_SIZE = 36;
const PROMPT_VIRTUAL_THRESHOLD = 108;
const PROMPT_VIRTUAL_BUFFER_ROWS = 5;
const PROMPT_REPO_CACHE_LIMIT = 24;
const PROMPT_FAST_VERSION = 'home-v3-20260721-controls-r194';
const PROMPT_FAST_BOOTSTRAP_URL = `/prompts_fast/bootstrap.json?v=${PROMPT_FAST_VERSION}`;
const PROMPT_FAST_PREVIEWS_URL = `/prompts_fast/category_previews.json?v=${PROMPT_FAST_VERSION}`;
const PROMPT_FAST_SEARCH_URL = `/prompts_fast/search_index.json?v=${PROMPT_FAST_VERSION}`;
const GALLERY_VIRTUAL_BUFFER_ROWS = 6;
const GALLERY_VIRTUAL_THRESHOLD = 42;
const GALLERY_VIRTUAL_WINDOW_STEP_ROWS = 8;
const PROMPT_VIRTUAL_WINDOW_STEP_ROWS = 5;
const VIRTUAL_SCROLL_IDLE_DELAY = 220;
const SCROLL_END_FALLBACK_DELAY = 360;
const IMAGE_OBJECT_URL_CACHE_LIMIT = 72;
const GALLERY_PREVIEW_URL_CACHE_LIMIT = 48;
const GALLERY_PREVIEW_MAX_EDGE = 1280;
const GALLERY_PREVIEW_CONCURRENCY = 2;
const GALLERY_POST_SCROLL_HYDRATION_DELAY = 360;
const LEGACY_IMAGE_URL_MAX_LENGTH = 8 * 1024 * 1024;
const REFERENCE_OBJECT_URL_CACHE_LIMIT = 48;
const STREAM_IMAGE_LIMIT = 8;
const IMAGE_STREAM_EVENT_LIMIT = 32 * 1024 * 1024;
const IMAGE_BINARY_RESPONSE_LIMIT = 128 * 1024 * 1024;
const STREAM_EVENT_METADATA_LIMIT = 24;
const AGENT_STREAM_TEXT_LIMIT = 4 * 1024 * 1024;
const AGENT_STREAM_EVENT_LIMIT = 8 * 1024 * 1024;
const transientObjectUrls = new Set();
const deferredObjectUrlReleases = new Set();
const localBlobReservations = new Map();
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
const IMAGE_STREAM_RUNTIME = typeof globalThis !== 'undefined' ? globalThis.NexGenImageStream : null;
const STREAM_PARTIAL_PER_OUTPUT_LIMIT = 2;
const STREAM_PARTIAL_TASK_LIMIT = 8;
const STREAM_PARTIAL_PERSIST_DELAY_MS = 180;
const STREAM_INPUT_FILE_LIMIT = 50 * 1024 * 1024;
const STREAM_INPUT_TOTAL_LIMIT = 512 * 1024 * 1024;
const streamPartialPersistChains = new Map();
const streamPartialPersistPending = new Map();
const taskGenerationVersions = new Map();
const taskGenerationControllers = new Map();
const pendingBlobReleases = new Set();
const pendingBlobReservationReleases = new Set();
let pendingBlobReleaseFlushTimer = 0;

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
const BLOB_RESERVATION_OWNER = uid('blob-owner');

function beginTaskGeneration(task) {
  if (!task?.id) return { version: 0, signal: undefined };
  taskGenerationControllers.get(task.id)?.abort?.();
  const version = Number(taskGenerationVersions.get(task.id) || 0) + 1;
  taskGenerationVersions.set(task.id, version);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  if (controller) taskGenerationControllers.set(task.id, controller);
  return { version, signal: controller?.signal };
}

function isTaskGenerationActive(task, version) {
  return !!task?.id
    && Number(taskGenerationVersions.get(task.id) || 0) === Number(version || 0)
    && state.tasks.some((item) => item === task || item?.id === task.id);
}

function invalidateTaskGeneration(taskId) {
  if (!taskId) return;
  const version = Number(taskGenerationVersions.get(taskId) || 0) + 1;
  taskGenerationVersions.set(taskId, version);
  taskGenerationControllers.get(taskId)?.abort?.();
  taskGenerationControllers.delete(taskId);
  const pending = streamPartialPersistPending.get(taskId);
  pending?.pending?.clear?.();
}

function finishTaskGeneration(taskId, version) {
  if (!taskId || Number(taskGenerationVersions.get(taskId) || 0) !== Number(version || 0)) return;
  taskGenerationVersions.delete(taskId);
  taskGenerationControllers.delete(taskId);
}
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const cssEscape = (value) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(value ?? '')) : String(value ?? '').replace(/["\\]/g, '\\$&'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MODAL_FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const modalOpenerSnapshots = new Map();
let imageContextMenuOpener = null;
const AGENT_DEFAULT_TIMEOUT_SECONDS = 60;
const AGENT_RENDER_MESSAGE_LIMIT = 80;
const AGENT_THREAD_MESSAGE_LIMIT = 240;
const AGENT_THREAD_STORAGE_CHAR_LIMIT = 512 * 1024;
const AGENT_TOTAL_STORAGE_CHAR_LIMIT = 1536 * 1024;
const GALLERY_CARD_BODY_HEIGHT = 156;
const GALLERY_CARD_HEIGHT_SAFETY = 8;
let storeWriteTimer = 0;
let agentHistoryWriteTimer = 0;
let agentHistoryPersistChain = Promise.resolve();
let promptRepoResizeObserver = null;
let galleryResizeObserver = null;
let galleryScrollIdleTimer = 0;
let promptRepoScrollIdleTimer = 0;
let galleryVirtualRenderTimer = 0;
let promptRepoVirtualRenderTimer = 0;
let galleryVirtualRenderFrame = 0;
let promptRepoVirtualRenderFrame = 0;
let galleryScrollLastAt = 0;
let taskDetailOverlayGeneration = 0;
let promptRepoScrollLastAt = 0;
let galleryScrollDelta = 0;
let promptRepoScrollDelta = 0;
let galleryScrollNode = null;
let promptRepoScrollNode = null;
let galleryScrollGeneration = 0;
let promptRepoScrollGeneration = 0;
let galleryScrollIdleNode = null;
let promptRepoScrollIdleNode = null;
let galleryScrollIdleGeneration = 0;
let promptRepoScrollIdleGeneration = 0;
let agentScrollLastAt = 0;
let galleryVirtualRenderToken = 0;
let promptRepoVirtualRenderToken = 0;
let galleryVirtualHydratePending = false;
let agentScrollIdleTimer = 0;
let deferredRenderFrame = 0;
let deferredRenderPending = false;
let agentScrollRestoreToken = 0;
let lastRenderedAgentScrollKey = '';
let galleryScrollRestoreToken = 0;
let promptRepoScrollRestoreToken = 0;
let workflowScrollRestoreToken = 0;
let workflowScrollIdleTimer = 0;
let workflowScrollLastAt = 0;
let agentScrollActivity = false;
let galleryScrollActivity = false;
let promptRepoScrollActivity = false;
let workflowScrollActivity = false;
let promptRepoEdgeCheckFrame = 0;
let promptRepoEdgeCheckTimer = 0;
let promptRepoEdgeCheckLastAt = 0;
let promptRepoEdgeCheckToken = 0;
let agentTaskCardSyncFrame = 0;
let galleryTaskCardSyncFrame = 0;
const agentTaskCardSyncQueue = new Map();
const galleryTaskCardSyncQueue = new Map();
const galleryPreviewPromises = new Map();
const galleryDeferredHydrations = new Map();
const galleryPreviewQueue = [];
let galleryPreviewActive = 0;
const galleryPreviewConsumers = new WeakMap();
let filteredTasksCache = null;
let persistedStoreBaseline = null;
let promptRepoSyncPending = false;
let galleryHydrationFlushScheduled = false;
let galleryHydrationFlushRunning = false;
let galleryHydrationDeferUntil = 0;
let userInteractionRenderAllowed = false;

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
function normalizeAgentMessage(message, threadId, projectId, options = {}) {
  const createdAt = message?.createdAt || Date.now();
  const pending = !!message?.pending;
  if (pending && options.interruptPending) {
    return {
      ...message,
      id: message?.id || uid('msg'),
      threadId: message?.threadId || threadId,
      projectId: message?.projectId || projectId,
      role: message?.role || 'assistant',
      text: '对话已中断，可重试。',
      createdAt,
      pending: false,
      status: 'interrupted',
      error: true,
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
function migrateAgentThreads(agent = {}, options = { interruptPending: true }) {
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
      messagesByThread[thread.id] = legacyMessages.map((message) => normalizeAgentMessage(message, thread.id, projectId, options));
    }
    for (const thread of threads) {
      const current = Array.isArray(messagesByThread[thread.id]) ? messagesByThread[thread.id] : [];
      messagesByThread[thread.id] = current.map((message) => normalizeAgentMessage(message, thread.id, projectId, options));
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

function normalizeImageQuality(value, fallback = 'high') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['auto', 'low', 'medium', 'high'].includes(normalized)) return normalized;
  if (normalized === 'hd') return 'high';
  if (normalized === 'standard') return 'medium';
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return ['auto', 'low', 'medium', 'high'].includes(normalizedFallback) ? normalizedFallback : 'high';
}

function outputQualityPercent(value, fallback = 90) {
  const number = value === undefined || value === null || value === '' ? Number.NaN : Number(value);
  const fallbackNumber = Number(fallback);
  const normalized = Number.isFinite(number) ? number : (Number.isFinite(fallbackNumber) ? fallbackNumber : 90);
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function outputCompressionFromQuality(value, fallback = 90) {
  return 100 - outputQualityPercent(value, fallback);
}

function outputQualityFromCompression(value, fallback = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  return 100 - outputQualityPercent(value, 0);
}

function collectObjectsDeep(value, options = {}) {
  const maxDepthRaw = Number(options.maxDepth ?? 6);
  const maxDepth = Number.isFinite(maxDepthRaw) ? Math.max(0, Math.floor(maxDepthRaw)) : 6;
  const maxNodesRaw = Number(options.maxNodes ?? 4096);
  const maxNodes = Number.isFinite(maxNodesRaw) ? Math.max(1, Math.floor(maxNodesRaw)) : 4096;
  const seen = new Set();
  const out = [];
  const stack = [{ value, depth: 0 }];
  let scannedNodes = 0;
  while (stack.length && scannedNodes < maxNodes) {
    const entry = stack.pop();
    const item = entry?.value;
    const depth = Number(entry?.depth) || 0;
    if (item === null || item === undefined || depth > maxDepth) continue;
    if (typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    scannedNodes += 1;
    if (Array.isArray(item)) {
      for (let index = item.length - 1; index >= 0; index -= 1) {
        stack.push({ value: item[index], depth: depth + 1 });
      }
      continue;
    }
    out.push(item);
    const children = Object.values(item);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ value: children[index], depth: depth + 1 });
    }
  }
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
function objectUrlUsedByDocument(url) {
  if (!url || typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return false;
  return Array.from(document.querySelectorAll('img')).some((img) => img?.currentSrc === url || img?.src === url);
}
function releaseDeferredObjectUrls() {
  for (const url of [...deferredObjectUrlReleases]) {
    if (objectUrlUsedByDocument(url)) continue;
    deferredObjectUrlReleases.delete(url);
    revokeObjectUrl(url);
  }
}
function compactAgentMessageForStorage(message) {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments.map(({ url, file, dataUrl, image_url, imageUrl, ...attachment }) => attachment)
    : message?.attachments;
  const promptOptions = Array.isArray(message?.promptOptions)
    ? message.promptOptions.map((option) => ({
      ...option,
      prompt: String(option?.prompt || '').slice(0, 48 * 1024),
      negativePrompt: String(option?.negativePrompt || '').slice(0, 24 * 1024),
      reason: String(option?.reason || '').slice(0, 8 * 1024)
    }))
    : message?.promptOptions;
  return {
    ...message,
    text: String(message?.text || '').slice(0, 128 * 1024),
    errorDetail: String(message?.errorDetail || '').slice(0, 32 * 1024),
    retryInput: String(message?.retryInput || '').slice(0, 32 * 1024),
    promptOptions,
    attachments
  };
}
function compactAgentThreadMessages(messages = [], charLimit = AGENT_THREAD_STORAGE_CHAR_LIMIT) {
  const compacted = [];
  let chars = 0;
  const source = Array.isArray(messages) ? messages.slice(-AGENT_THREAD_MESSAGE_LIMIT) : [];
  for (let index = source.length - 1; index >= 0; index -= 1) {
    let message = compactAgentMessageForStorage(source[index]);
    let size = JSON.stringify(message).length;
    if (size > charLimit) {
      message = {
        id: message.id,
        threadId: message.threadId,
        projectId: message.projectId,
        role: message.role,
        text: String(message.text || '').slice(0, Math.max(1024, charLimit - 4096)),
        createdAt: message.createdAt,
        pending: false,
        storageTruncated: true
      };
      size = JSON.stringify(message).length;
    }
    if (chars + size > charLimit) break;
    compacted.unshift(message);
    chars += size;
  }
  return compacted;
}
function compactAgentMessagesByThreadForStorage(messagesByThread = {}) {
  const entries = Object.entries(messagesByThread)
    .map(([threadId, messages]) => [threadId, compactAgentThreadMessages(messages)])
    .sort((a, b) => {
      const aTime = Number(a[1].at(-1)?.createdAt || 0);
      const bTime = Number(b[1].at(-1)?.createdAt || 0);
      return bTime - aTime;
    });
  const output = {};
  let totalChars = 0;
  for (const [threadId, messages] of entries) {
    const remaining = AGENT_TOTAL_STORAGE_CHAR_LIMIT - totalChars;
    if (remaining <= 0) {
      output[threadId] = [];
      continue;
    }
    const bounded = compactAgentThreadMessages(messages, Math.min(AGENT_THREAD_STORAGE_CHAR_LIMIT, remaining));
    const size = JSON.stringify(bounded).length;
    output[threadId] = bounded;
    totalChars += size;
  }
  return output;
}
function archiveAgentMessage(message) {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments.map(({ url, file, dataUrl, image_url, imageUrl, ...attachment }) => attachment)
    : message?.attachments;
  return { ...message, attachments };
}
function trackTransientObjectUrl(url) {
  if (url) transientObjectUrls.add(url);
  return url;
}
function revokeTransientObjectUrl(url) {
  transientObjectUrls.delete(url);
  revokeObjectUrl(url);
}
function rememberObjectUrl(map, key, url, limit) {
  if (!map || !key || !url) return url;
  const previous = map.get(key);
  if (previous && previous !== url) {
    if (objectUrlUsedByDocument(previous)) deferredObjectUrlReleases.add(previous);
    else revokeObjectUrl(previous);
  }
  map.delete(key);
  map.set(key, url);
  while (map.size > limit) {
    const candidate = [...map.entries()].find(([, candidateUrl]) => !objectUrlUsedByDocument(candidateUrl));
    if (!candidate) break;
    revokeMapEntry(map, candidate[0]);
  }
  return url;
}
function touchObjectUrl(map, key) {
  if (!map?.has(key)) return '';
  const url = map.get(key);
  map.delete(key);
  map.set(key, url);
  return url;
}
function revokeAllObjectUrls(options = {}) {
  const preserveUrls = options.preserveUrls instanceof Set ? options.preserveUrls : new Set();
  for (const map of [state?.imageUrls, state?.galleryPreviewUrls, state?.refUrls]) {
    if (!map) continue;
    for (const [key, url] of [...map.entries()]) {
      if (preserveUrls.has(url)) continue;
      revokeObjectUrl(url);
      map.delete(key);
    }
  }
  for (const url of [...transientObjectUrls]) {
    if (preserveUrls.has(url)) continue;
    revokeObjectUrl(url);
    transientObjectUrls.delete(url);
  }
  for (const url of [...deferredObjectUrlReleases]) {
    if (preserveUrls.has(url)) continue;
    revokeObjectUrl(url);
    deferredObjectUrlReleases.delete(url);
  }
}
function resetManagedImageSourcesForHydration() {
  const preserveStreamUrls = new Set();
  for (const task of state.tasks || []) {
    for (const slot of Object.values(task?.streamPreviewSlots || {})) {
      if (slot?.temporary && slot.url) preserveStreamUrls.add(slot.url);
    }
  }
  revokeAllObjectUrls({ preserveUrls: preserveStreamUrls });
  const selector = 'img[data-image-kind], img[data-blob-id], img[data-remote-url], img[data-ref-id], img[data-pro-ref-id], img[data-workflow-ref-id], img[data-agent-attachment-id], img[data-task-ref-task-id]';
  for (const img of $$(selector)) {
    if (img?.dataset?.imageKind === 'stream-preview') continue;
    img.removeAttribute?.('src');
    clearImageCacheMissing(img);
  }
}
function scheduleStoreWrite(delay = 260) {
  if (scrollInteractionActive()) {
    if (storeWriteTimer) clearTimeout(storeWriteTimer);
    storeWriteTimer = setTimeout(() => {
      storeWriteTimer = 0;
      if (scrollInteractionActive()) {
        if (scrollInteractionActive()) scheduleStoreWrite(delay);
        return;
      }
      writeStore();
    }, Math.max(delay, VIRTUAL_SCROLL_IDLE_DELAY));
    return;
  }
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
let taskPersistenceChain = Promise.resolve();
let pendingTaskPersistence = null;
let taskPersistenceDrain = null;
let taskPersistenceActive = false;
let taskPersistenceRevisionClock = Date.now();
const agentArchiveBaselines = new Map();
const knownAgentArchiveThreadIds = new Set();
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    let settled = false;
    let blockedTimer = 0;
    const rejectOpen = (error) => {
      if (settled) return;
      settled = true;
      if (blockedTimer) clearTimeout(blockedTimer);
      dbPromise = null;
      reject(error);
    };
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames?.contains?.(DB_STORE)) database.createObjectStore(DB_STORE);
      if (!database.objectStoreNames?.contains?.(DB_AGENT_STORE)) database.createObjectStore(DB_AGENT_STORE);
      if (!database.objectStoreNames?.contains?.(DB_TASK_STORE)) database.createObjectStore(DB_TASK_STORE);
    };
    req.onblocked = () => {
      console.warn('[home-v3] IndexedDB upgrade is waiting for an older tab to close');
      blockedTimer = setTimeout(() => {
        rejectOpen(new Error('本地数据库升级被旧标签页阻塞，请关闭其他 NexGen 页面后重试'));
      }, 1800);
    };
    req.onsuccess = () => {
      const database = req.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      if (blockedTimer) clearTimeout(blockedTimer);
      database.onversionchange = () => {
        database.close();
        if (dbPromise) dbPromise = null;
      };
      resolve(database);
    };
    req.onerror = () => rejectOpen(req.error);
  });
  return dbPromise;
}
function parseBlobReservation(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      expiresAt: Number(value.expiresAt || value.expires_at || 0),
      owner: String(value.owner || '')
    };
  }
  try {
    const parsed = JSON.parse(String(value || ''));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        expiresAt: Number(parsed.expiresAt || parsed.expires_at || 0),
        owner: String(parsed.owner || '')
      };
    }
  } catch {}
  return { expiresAt: Number(value || 0), owner: '' };
}
function readStoredBlobReservation(id) {
  if (!id) return { expiresAt: 0, owner: '' };
  try { return parseBlobReservation(localStorage.getItem(`${BLOB_RESERVATION_PREFIX}${id}`)); } catch { return { expiresAt: 0, owner: '' }; }
}
function readBlobReservationRecords() {
  const now = Date.now();
  const records = new Map();
  for (const [id, expiresAt] of localBlobReservations) {
    if (Number(expiresAt || 0) > now) records.set(id, { expiresAt: Number(expiresAt), owner: BLOB_RESERVATION_OWNER });
    else localBlobReservations.delete(id);
  }
  try {
    const legacy = JSON.parse(localStorage.getItem(BLOB_RESERVATION_KEY) || '{}');
    for (const [id, value] of Object.entries(legacy).slice(-256)) {
      const record = parseBlobReservation(value);
      if (record.expiresAt > now && !records.has(id)) records.set(id, record);
    }
    for (let index = 0; index < Number(localStorage.length || 0); index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(BLOB_RESERVATION_PREFIX)) continue;
      const id = key.slice(BLOB_RESERVATION_PREFIX.length);
      const record = parseBlobReservation(localStorage.getItem(key));
      if (record.expiresAt > now && !records.has(id)) records.set(id, record);
    }
  } catch {}
  return records;
}
function readBlobReservations() {
  return Object.fromEntries([...readBlobReservationRecords()].map(([id, record]) => [id, record.expiresAt]));
}
function reserveBlobId(id) {
  if (!id) return;
  const expiresAt = Date.now() + BLOB_RESERVATION_TTL_MS;
  localBlobReservations.set(id, expiresAt);
  try {
    localStorage.setItem(`${BLOB_RESERVATION_PREFIX}${id}`, JSON.stringify({ version: 1, owner: BLOB_RESERVATION_OWNER, expiresAt }));
  } catch {}
}
function reserveReferencedBlobIds(source = state) {
  const referenced = collectReferencedBlobIds(source);
  for (const id of referenced) {
    if (blobReservationExpiry(id) <= Date.now()) reserveBlobId(id);
  }
}
function blobReservationExpiry(id) {
  if (!id) return 0;
  const local = Number(localBlobReservations.get(id) || 0);
  if (local > 0) return local;
  return Number(readStoredBlobReservation(id).expiresAt || 0);
}
function readCandidateBlobReservation(id) {
  if (!id) return [];
  const now = Date.now();
  const records = new Map();
  const add = (owner, expiresAt) => {
    const normalizedExpiresAt = Number(expiresAt || 0);
    if (!owner || normalizedExpiresAt <= now) return;
    const previous = records.get(owner) || 0;
    if (normalizedExpiresAt > previous) records.set(owner, normalizedExpiresAt);
  };
  add(BLOB_RESERVATION_OWNER, localBlobReservations.get(id));
  const stored = readStoredBlobReservation(id);
  add(stored.owner || `storage:${id}`, stored.expiresAt);
  return [...records].map(([owner, expiresAt]) => ({ owner, expiresAt }));
}
function snapshotCandidateBlobReservations(ids = []) {
  return new Map([...new Set((Array.isArray(ids) ? ids : [...(ids || [])]).filter(Boolean))]
    .map((id) => [String(id), readCandidateBlobReservation(String(id))]));
}
function candidateBlobReservationChanged(before = [], after = []) {
  const beforeByOwner = new Map((Array.isArray(before) ? before : []).map((record) => [String(record?.owner || ''), Number(record?.expiresAt || 0)]));
  for (const record of Array.isArray(after) ? after : []) {
    const owner = String(record?.owner || '');
    const expiresAt = Number(record?.expiresAt || 0);
    if (!beforeByOwner.has(owner) || beforeByOwner.get(owner) !== expiresAt) return true;
  }
  return false;
}
function changedCandidateBlobReservations(ids = [], snapshot = new Map()) {
  const changed = new Set();
  for (const id of ids) {
    const key = String(id);
    if (candidateBlobReservationChanged(snapshot.get(key) || [], readCandidateBlobReservation(key))) changed.add(key);
  }
  return changed;
}
function releaseBlobReservation(id, expectedExpiresAt = null) {
  if (!id) return false;
  const localExpiresAt = Number(localBlobReservations.get(id) || 0);
  const stored = readStoredBlobReservation(id);
  const currentExpiresAt = localExpiresAt || Number(stored.expiresAt || 0);
  if (expectedExpiresAt !== null && currentExpiresAt !== Number(expectedExpiresAt)) return false;
  localBlobReservations.delete(id);
  if (localExpiresAt > 0 && stored.owner !== BLOB_RESERVATION_OWNER && stored.expiresAt !== localExpiresAt) return true;
  if (stored.owner === BLOB_RESERVATION_OWNER || (localExpiresAt > 0 && !stored.owner && stored.expiresAt === localExpiresAt)) {
    try { localStorage.removeItem(`${BLOB_RESERVATION_PREFIX}${id}`); } catch {}
  }
  return true;
}
async function putBlobUnlocked(blob, id = uid('blob')) {
  reserveBlobId(id);
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(blob, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    releaseBlobReservation(id);
    throw error;
  }
  return id;
}
async function putBlob(blob, id = uid('blob')) {
  const locks = blobReferenceLockApi();
  if (!locks) return putBlobUnlocked(blob, id);
  return locks.request(BLOB_REFERENCE_LOCK_NAME, { mode: 'exclusive' }, () => putBlobUnlocked(blob, id));
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
async function deleteBlob(id, options = {}) {
  if (!id) return false;
  const reservationBeforeDelete = blobReservationExpiry(id);
  const db = await openDb();
  if (options.reservationSnapshot instanceof Map) {
    const currentReservation = readCandidateBlobReservation(id);
    if (candidateBlobReservationChanged(options.reservationSnapshot.get(String(id)) || [], currentReservation)) return false;
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  releaseBlobReservation(id, reservationBeforeDelete);
  return true;
}

function nextTaskPersistenceRevision() {
  taskPersistenceRevisionClock = Math.max(taskPersistenceRevisionClock + 1, Date.now());
  return taskPersistenceRevisionClock;
}

function ensureTaskPersistenceRevision(task) {
  if (!task?.id) return 0;
  const current = Number(task.persistenceRevision || 0);
  if (Number.isFinite(current) && current > 0) {
    taskPersistenceRevisionClock = Math.max(taskPersistenceRevisionClock, current);
    return current;
  }
  taskPersistenceRevisionClock = Math.max(
    taskPersistenceRevisionClock,
    Number(task.updatedAt || 0),
    Number(task.finishedAt || 0),
    Number(task.startedAt || 0),
    Number(task.createdAt || 0)
  );
  task.persistenceRevision = nextTaskPersistenceRevision();
  return task.persistenceRevision;
}

function touchTaskPersistence(task) {
  if (!task?.id) return 0;
  task.persistenceRevision = nextTaskPersistenceRevision();
  return task.persistenceRevision;
}

function taskPersistenceVersion(task) {
  const revision = Number(task?.persistenceRevision || 0);
  if (Number.isFinite(revision) && revision > 0) return revision;
  return Math.max(
    Number(task?.updatedAt || 0),
    Number(task?.finishedAt || 0),
    Number(task?.startedAt || 0),
    Number(task?.createdAt || 0)
  );
}

function taskTombstoneKey(id) {
  return `${TASK_TOMBSTONE_PREFIX}${String(id || '')}`;
}

function isTaskTombstone(record) {
  return record?.kind === TASK_TOMBSTONE_KIND && String(record?.taskId || '').trim() !== '';
}

function taskTombstoneId(record) {
  return isTaskTombstone(record) ? String(record.taskId) : '';
}

function taskStatusRank(status) {
  return { queued: 1, running: 2, interrupted: 3, error: 4, partial_success: 5, success: 6 }[status] || 0;
}

function preferTaskRecord(first, second) {
  if (!first) return second;
  if (!second) return first;
  const firstVersion = taskPersistenceVersion(first);
  const secondVersion = taskPersistenceVersion(second);
  if (firstVersion !== secondVersion) return secondVersion > firstVersion ? second : first;
  const firstRank = taskStatusRank(first.status);
  const secondRank = taskStatusRank(second.status);
  if (firstRank !== secondRank) return secondRank > firstRank ? second : first;
  const firstImages = Array.isArray(first.images) ? first.images.length : 0;
  const secondImages = Array.isArray(second.images) ? second.images.length : 0;
  if (firstImages !== secondImages) return secondImages > firstImages ? second : first;
  return first;
}

function mergeTaskRecords(firstTasks = [], secondTasks = []) {
  const merged = new Map();
  for (const task of [...(Array.isArray(firstTasks) ? firstTasks : []), ...(Array.isArray(secondTasks) ? secondTasks : [])]) {
    if (!task?.id) continue;
    const id = String(task.id);
    merged.set(id, preferTaskRecord(merged.get(id), task));
  }
  return [...merged.values()].sort((a, b) => {
    const versionDelta = taskPersistenceVersion(b) - taskPersistenceVersion(a);
    if (versionDelta) return versionDelta;
    return Number(b?.createdAt || 0) - Number(a?.createdAt || 0);
  });
}

async function replaceTaskRecordsUnlocked(tasks = [], options = {}) {
  const snapshot = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task?.id)
    .map((task) => compactTaskForStorage(task, 'normal'));
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_TASK_STORE, 'readwrite');
    const store = tx.objectStore(DB_TASK_STORE);
    const requestedDeletedIds = new Set((Array.isArray(options.deletedTaskIds) ? options.deletedTaskIds : [])
      .filter(Boolean)
      .map(String));
    let transactionComplete = false;
    let readComplete = false;
    let settled = false;
    const resolveIfComplete = () => {
      if (!settled && transactionComplete && readComplete) {
        settled = true;
        resolve();
      }
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const putAll = () => {
      const request = store.getAll?.();
      if (!request) {
        for (const task of snapshot) {
          if (!requestedDeletedIds.has(String(task.id))) store.put(task, task.id);
        }
        for (const id of requestedDeletedIds) {
          const key = taskTombstoneKey(id);
          store.put({ id: key, taskId: id, kind: TASK_TOMBSTONE_KIND, deletedAt: Date.now() }, key);
        }
        readComplete = true;
        resolveIfComplete();
        return;
      }
      request.onsuccess = () => {
        const existing = Array.isArray(request.result) ? request.result : [];
        const existingTombstones = existing.filter(isTaskTombstone);
        const deletedIds = new Set([
          ...existingTombstones.map(taskTombstoneId),
          ...requestedDeletedIds
        ]);
        const desired = new Map(mergeTaskRecords(existing.filter((task) => !isTaskTombstone(task)), snapshot)
          .map((task) => [String(task.id), task]));
        for (const id of deletedIds) desired.delete(id);
        for (const [id, task] of desired) store.put(task, id);
        const tombstoneRecords = new Map(existingTombstones.map((record) => [taskTombstoneKey(record.taskId), record]));
        const deletedAt = Date.now();
        for (const id of requestedDeletedIds) {
          const key = taskTombstoneKey(id);
          const previous = tombstoneRecords.get(key);
          tombstoneRecords.set(key, {
            id: key,
            taskId: id,
            kind: TASK_TOMBSTONE_KIND,
            deletedAt: Math.max(Number(previous?.deletedAt || 0), deletedAt)
          });
        }
        for (const [key, record] of tombstoneRecords) store.put(record, key);
        if (typeof store.getAllKeys !== 'function') {
          readComplete = true;
          resolveIfComplete();
          return;
        }
        const keyRequest = store.getAllKeys();
        keyRequest.onsuccess = () => {
          const tombstoneKeys = new Set(tombstoneRecords.keys());
          for (const key of keyRequest.result || []) {
            const keyText = String(key);
            if (deletedIds.has(keyText) || (keyText.startsWith(TASK_TOMBSTONE_PREFIX) && !tombstoneKeys.has(keyText))) store.delete(key);
          }
          readComplete = true;
          resolveIfComplete();
        };
        keyRequest.onerror = () => rejectOnce(keyRequest.error);
      };
      request.onerror = () => rejectOnce(request.error);
    };
    tx.oncomplete = () => {
      transactionComplete = true;
      resolveIfComplete();
    };
    tx.onerror = () => rejectOnce(tx.error || new Error('IndexedDB 任务写入失败'));
    tx.onabort = () => rejectOnce(tx.error || new Error('IndexedDB 任务写入已中止'));
    putAll();
  });
}

async function replaceTaskRecords(tasks = [], options = {}) {
  if (options?.lockHeld === true) return replaceTaskRecordsUnlocked(tasks, options);
  const locks = blobReferenceLockApi();
  if (!locks) return replaceTaskRecordsUnlocked(tasks, options);
  return locks.request(BLOB_REFERENCE_LOCK_NAME, { mode: 'exclusive' }, () => replaceTaskRecordsUnlocked(tasks, { ...options, lockHeld: true }));
}

async function readTaskRecords() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_TASK_STORE, 'readonly');
    const store = tx.objectStore(DB_TASK_STORE);
    if (typeof store.getAll !== 'function') {
      reject(new Error('IndexedDB 任务仓库不支持批量读取'));
      return;
    }
    const request = store.getAll();
    request.onsuccess = () => resolve((Array.isArray(request.result) ? request.result : []).filter((task) => !isTaskTombstone(task)));
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB 任务读取失败'));
  });
}

async function readTaskDeletionIds() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_TASK_STORE, 'readonly');
    const store = tx.objectStore(DB_TASK_STORE);
    const request = store.getAll?.();
    if (!request) {
      resolve(new Set());
      return;
    }
    request.onsuccess = () => resolve(new Set(
      (Array.isArray(request.result) ? request.result : []).map(taskTombstoneId).filter(Boolean)
    ));
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB 任务删除记录读取失败'));
  });
}

function taskSnapshotRevision(tasks = []) {
  return (Array.isArray(tasks) ? tasks : []).reduce((revision, task) => Math.max(revision, taskPersistenceVersion(task)), 0);
}
function taskStoreMarkerVersion(marker) {
  return [Number(marker?.snapshotRevision || 0), Number(marker?.updatedAt || 0)];
}
function isOlderTaskStoreMarker(candidate, current) {
  const [candidateRevision, candidateUpdatedAt] = taskStoreMarkerVersion(candidate);
  const [currentRevision, currentUpdatedAt] = taskStoreMarkerVersion(current);
  return candidateRevision < currentRevision
    || (candidateRevision === currentRevision && candidateUpdatedAt < currentUpdatedAt);
}
function taskStoreMarker(tasks = [], status = 'ready', error = '', snapshotRevision = null) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  return {
    version: 2,
    count: safeTasks.length,
    ids: safeTasks.map((task) => task?.id).filter(Boolean),
    status,
    error: String(error || '').slice(0, 180),
    snapshotRevision: Math.max(Number(snapshotRevision || 0), taskSnapshotRevision(safeTasks)),
    updatedAt: Date.now()
  };
}
function persistTaskStoreMarker(marker) {
  try {
    const current = readPersistedStoreSnapshot() || {};
    if (current.taskStore && isOlderTaskStoreMarker(marker, current.taskStore)) return false;
    const next = { ...current, tasks: [], taskStore: marker };
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    persistedStoreBaseline = next;
    return true;
  } catch {
    return false;
  }
}
function markTaskPersistenceFailure(snapshot, error) {
  const detail = String(error?.message || error || 'IndexedDB 任务写入失败').trim().slice(0, 180);
  const taskSnapshot = snapshot && typeof snapshot === 'object' && Array.isArray(snapshot.tasks)
    ? snapshot
    : { tasks: Array.isArray(snapshot) ? snapshot : [] };
  const marker = taskStoreMarker(taskSnapshot.tasks, 'error', detail, taskSnapshot.snapshotRevision);
  state.taskStore = marker;
  state.taskRecovery = {
    status: 'error',
    retrying: false,
    error: '本地任务保存失败，请点击“重试恢复”。',
    detail
  };
  persistTaskStoreMarker(marker);
}
function scheduleOwnedBlobReservationRelease(clean, persisted) {
  if (persisted === false) return;
  const referenced = collectReferencedBlobIds(clean);
  const candidates = [...localBlobReservations.entries()]
    .filter(([id]) => !referenced.has(id))
    .map(([id, expiresAt]) => ({ id, expiresAt: Number(expiresAt) }));
  if (!candidates.length) return;
  void (async () => {
    if (await flushTaskPersistence() !== true) return;
    const current = collectReferencedBlobIds(state);
    const persistedSnapshot = collectPersistedReferencedBlobSnapshot();
    const taskStoreSnapshot = await collectTaskStoreReferencedBlobIds();
    const archived = await collectArchivedAgentReferencedBlobIds();
    if (!persistedSnapshot.available || !taskStoreSnapshot.available || !archived.available) return;
    const keep = new Set([...current, ...persistedSnapshot.ids, ...taskStoreSnapshot.ids, ...archived.ids]);
    for (const { id, expiresAt } of candidates) {
      if (!keep.has(id)) releaseBlobReservation(id, expiresAt);
    }
  })().catch(() => {});
}

function scheduleTaskPersistence(tasks = [], options = {}) {
  const deletedTaskIds = (Array.isArray(options.deletedTaskIds) ? options.deletedTaskIds : [...(options.deletedTaskIds || [])])
    .filter(Boolean)
    .map(String);
  const next = {
    tasks: Array.isArray(tasks) ? tasks : [],
    deletedTaskIds,
    snapshotRevision: taskSnapshotRevision(tasks)
  };
  if (pendingTaskPersistence) {
    pendingTaskPersistence = {
      tasks: next.tasks,
      deletedTaskIds: [...new Set([
        ...(pendingTaskPersistence.deletedTaskIds || []),
        ...next.deletedTaskIds
      ])],
      snapshotRevision: Math.max(
        Number(pendingTaskPersistence.snapshotRevision || 0),
        Number(next.snapshotRevision || 0)
      )
    };
  } else {
    pendingTaskPersistence = next;
  }
  if (taskPersistenceActive) return taskPersistenceDrain || taskPersistenceChain;
  taskPersistenceActive = true;
  const drain = (async () => {
    while (pendingTaskPersistence) {
      const current = pendingTaskPersistence;
      pendingTaskPersistence = null;
      try {
        await replaceTaskRecords(current.tasks, { deletedTaskIds: current.deletedTaskIds });
      } catch (error) {
        const queued = pendingTaskPersistence
          ? {
            tasks: pendingTaskPersistence.tasks,
            deletedTaskIds: [...new Set([
              ...(current.deletedTaskIds || []),
              ...(pendingTaskPersistence.deletedTaskIds || [])
            ])],
            snapshotRevision: Math.max(
              Number(current.snapshotRevision || 0),
              Number(pendingTaskPersistence.snapshotRevision || 0)
            )
          }
          : current;
        pendingTaskPersistence = queued;
        markTaskPersistenceFailure(queued, error);
        taskPersistenceActive = false;
        if (taskPersistenceDrain === drain) taskPersistenceDrain = null;
        return false;
      }
      for (const id of pendingBlobReservationReleases) releaseBlobReservation(id);
      pendingBlobReservationReleases.clear();
      schedulePendingBlobReleaseFlush();
    }
    taskPersistenceActive = false;
    if (taskPersistenceDrain === drain) taskPersistenceDrain = null;
    return true;
  })();
  taskPersistenceDrain = drain;
  taskPersistenceChain = drain;
  return taskPersistenceChain;
}

function flushTaskPersistence() {
  return (async () => {
    while (true) {
      const chain = taskPersistenceChain;
      const result = await chain.catch(() => false);
      if (result === false) return false;
      if (taskPersistenceActive) continue;
      if (!pendingTaskPersistence) return true;
      const queued = pendingTaskPersistence;
      pendingTaskPersistence = null;
      scheduleTaskPersistence(queued.tasks, { deletedTaskIds: queued.deletedTaskIds });
    }
  })();
}

async function hydrateTasksFromDb() {
  const records = await readTaskRecords();
  const idbTombstones = await readTaskDeletionIds();
  const tombstones = new Set([
    ...readTaskDeleteTombstones().keys(),
    ...idbTombstones
  ]);
  const markerTaskCount = Number(state.taskStore?.count || 0);
  const hasTaskStoreIds = !!state.taskStore && Object.prototype.hasOwnProperty.call(state.taskStore, 'ids');
  if (state.taskStore?.status === 'error' && !state.taskRecovery?.retrying) {
    throw new Error(state.taskStore.error || '上次本地任务写入失败，请重试恢复。');
  }
  if (hasTaskStoreIds && !Array.isArray(state.taskStore.ids)) {
    throw new Error('本地任务索引损坏，无法恢复历史任务。');
  }
  const rawExpectedTaskIds = hasTaskStoreIds
    ? [...new Set(state.taskStore.ids.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  if (hasTaskStoreIds && markerTaskCount > 0 && !rawExpectedTaskIds.length) {
    throw new Error(`本地任务索引不完整（预期 ${markerTaskCount} 条，但没有有效任务 ID）`);
  }
  if (hasTaskStoreIds && markerTaskCount !== rawExpectedTaskIds.length) {
    throw new Error(`本地任务索引不一致（预期 ${markerTaskCount} 条，索引包含 ${rawExpectedTaskIds.length} 条）`);
  }
  const expectedTaskIds = rawExpectedTaskIds.filter((id) => !tombstones.has(id));
  const expectedTaskCount = hasTaskStoreIds ? expectedTaskIds.length : markerTaskCount;
  if (expectedTaskCount > records.length) {
    throw new Error(`本地任务数据库恢复不完整（预期 ${expectedTaskCount} 条，实际 ${records.length} 条）`);
  }
  if (expectedTaskIds.length) {
    const actualTaskIds = new Set(records.map((task) => String(task?.id || '').trim()).filter(Boolean));
    const missingTaskIds = expectedTaskIds.filter((id) => !actualTaskIds.has(id));
    if (missingTaskIds.length) {
      throw new Error(`本地任务数据库恢复不完整（缺少 ${missingTaskIds.slice(0, 3).join('、')}${missingTaskIds.length > 3 ? ' 等任务' : ''}）`);
    }
  }
  if (!records.length) {
    const previous = JSON.stringify(state.tasks || []);
    state.tasks = (state.tasks || []).filter((task) => task?.id && !tombstones.has(String(task.id)));
    filteredTasksCache = null;
    return previous !== JSON.stringify(state.tasks);
  }
  const merged = mergeTaskRecords(state.tasks, records)
    .filter((task) => task?.id && !tombstones.has(String(task.id)))
    .map(normalizeRestoredTask);
  const previous = JSON.stringify(state.tasks || []);
  state.tasks = merged;
  filteredTasksCache = null;
  return previous !== JSON.stringify(merged);
}
function setTaskRecoveryError(error) {
  const detail = String(error?.message || error || '').trim().slice(0, 180);
  state.taskRecovery = {
    status: 'error',
    retrying: false,
    error: '本地历史任务暂时无法恢复，请点击“重试恢复”。',
    detail
  };
}
function renderTaskRecoveryNotice() {
  const recovery = state.taskRecovery;
  if (!recovery?.error) return '';
  return `<div class="returned-prompt stream-warning task-recovery-notice" role="alert">
    <strong>历史任务恢复失败</strong>
    <span>${esc(recovery.error)}${recovery.detail ? `（${esc(recovery.detail)}）` : ''}</span>
    <button class="mini-button" data-action="retry-task-history" ${recovery.retrying ? 'disabled' : ''}>${recovery.retrying ? '恢复中...' : '重试恢复'}</button>
  </div>`;
}
async function retryTaskHistory() {
  if (state.taskRecovery?.retrying) return false;
  state.taskRecovery = { status: 'retrying', retrying: true, error: '', detail: '' };
  render({ allowDuringScroll: true });
  let taskStoreErrorSnapshot = null;
  try {
    const taskStoreHadError = state.taskStore?.status === 'error';
    taskStoreErrorSnapshot = taskStoreHadError ? { ...state.taskStore } : null;
    if (taskStoreHadError) state.taskStore = taskStoreMarker(state.tasks, 'ready', '');
    const changed = await hydrateTasksFromDb();
    if (changed || taskStoreHadError) {
      const readyMarker = taskStoreMarker(state.tasks, 'ready', '');
      state.taskStore = readyMarker;
      const persisted = writeStore({ forceTaskPersistence: true });
      const committed = persisted === false ? false : await flushTaskPersistence();
      if (committed !== true) throw new Error('本地任务恢复后的写入仍未完成，请稍后重试。');
      persistTaskStoreMarker(readyMarker);
      state.taskRecovery = { status: 'ready', retrying: false, error: '', detail: '' };
      render({ allowDuringScroll: true });
      void hydrateImages();
    } else {
      state.taskRecovery = { status: 'ready', retrying: false, error: '', detail: '' };
      render({ allowDuringScroll: true });
    }
    return true;
  } catch (error) {
    if (taskStoreErrorSnapshot) {
      state.taskStore = taskStoreErrorSnapshot;
      persistTaskStoreMarker(taskStoreErrorSnapshot);
    }
    setTaskRecoveryError(error);
    render({ allowDuringScroll: true });
    return false;
  }
}
function addAgentMessageBlobIds(message, add) {
  for (const attachment of message?.attachments || []) add(attachment?.blobId);
}
function collectReferencedBlobIds(source = state) {
  const store = source && typeof source === 'object' ? source : {};
  const ids = new Set();
  const add = (id) => { if (id) ids.add(id); };
  const addImage = (image) => {
    if (!image) return;
    add(image.blobId);
    add(image.originalBlobId);
    add(image.compositedBlobId);
    add(image.maskBlobId);
  };
  for (const task of store.tasks || []) {
    for (const img of task.images || []) addImage(img);
    for (const partial of task.streamPartialImages || []) add(partial.blobId);
    for (const ref of taskReferenceSnapshots(task)) {
      add(ref.blobId);
      add(ref.originalBlobId);
      add(ref.compositedBlobId);
      add(ref.maskBlobId);
    }
  }
  for (const group of [store.references || [], store.pro?.refs || [], store.workflowInvoke?.references || []]) {
    for (const ref of group) {
      add(ref.blobId);
      add(ref.originalBlobId);
      add(ref.compositedBlobId);
      add(ref.maskBlobId);
    }
  }
  for (const run of store.agent?.workflowRuns || []) {
    if (!['queued', 'running'].includes(run?.status)) continue;
    for (const ref of run.references || []) {
      add(ref.blobId);
      add(ref.originalBlobId);
      add(ref.compositedBlobId);
      add(ref.maskBlobId);
    }
  }
  for (const attachment of store.agent?.attachments || []) add(attachment.blobId);
  for (const messages of Object.values(store.agent?.messagesByThread || {})) {
    for (const message of Array.isArray(messages) ? messages : []) {
      addAgentMessageBlobIds(message, add);
    }
  }
  return ids;
}

async function collectTaskStoreReferencedBlobIds() {
  try {
    const records = await readTaskRecords();
    return { ids: collectReferencedBlobIds({ tasks: records }), available: true };
  } catch (error) {
    console.warn('[home-v3] 任务仓库引用读取失败，跳过 Blob 回收', error);
    return { ids: new Set(), available: false };
  }
}

async function collectArchivedAgentReferencedBlobIds() {
  const ids = new Set();
  try {
    const database = await openDb();
    const snapshots = await new Promise((resolve, reject) => {
      const tx = database.transaction(DB_AGENT_STORE, 'readonly');
      const store = tx.objectStore(DB_AGENT_STORE);
      if (typeof store.getAll !== 'function') {
        reject(new Error('IndexedDB Agent 归档不支持批量读取'));
        return;
      }
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB Agent 归档读取已中止'));
    });
    for (const snapshot of snapshots) {
      for (const message of Array.isArray(snapshot?.messages) ? snapshot.messages : []) {
        addAgentMessageBlobIds(message, (id) => { if (id) ids.add(id); });
      }
    }
    return { ids, available: true };
  } catch (error) {
    console.warn('[home-v3] Agent 归档引用读取失败，跳过 Blob 回收', error);
    return { ids, available: false };
  }
}

function readTaskDeleteTombstones() {
  const tombstones = new Map();
  try {
    const raw = localStorage.getItem(TASK_DELETE_TOMBSTONE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    for (const [id, deletedAt] of Object.entries(parsed && typeof parsed === 'object' ? parsed : {})) {
      if (id && Number(deletedAt) > 0) tombstones.set(id, Number(deletedAt));
    }
  } catch {}
  return tombstones;
}

function rememberTaskDeleteTombstones(ids = []) {
  const tombstones = readTaskDeleteTombstones();
  const now = Date.now();
  for (const id of Array.isArray(ids) ? ids : [...(ids || [])]) {
    if (id) tombstones.set(String(id), now);
  }
  const entries = [...tombstones.entries()].sort((a, b) => a[1] - b[1]).slice(-TASK_DELETE_TOMBSTONE_LIMIT);
  try { localStorage.setItem(TASK_DELETE_TOMBSTONE_KEY, JSON.stringify(Object.fromEntries(entries))); } catch {}
  return new Map(entries);
}

function mergeCrossTabTasks(clean, deletedTaskIds = []) {
  if (!clean || typeof clean !== 'object') return;
  const deletedIds = (Array.isArray(deletedTaskIds) ? deletedTaskIds : [...(deletedTaskIds || [])]).filter(Boolean).map(String);
  if (deletedIds.length) rememberTaskDeleteTombstones(deletedIds);
  const tombstones = readTaskDeleteTombstones();
  let remoteTasks = [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const remote = raw ? JSON.parse(raw) : null;
    remoteTasks = Array.isArray(remote?.tasks) ? remote.tasks : [];
  } catch {}
  clean.tasks = mergeTaskRecords(clean.tasks, remoteTasks)
    .filter((task) => task?.id && !tombstones.has(String(task.id)));
}
const CROSS_TAB_STORE_DOMAINS = [
  'mode',
  'settings',
  'preferences',
  'entryAdvanced',
  'agent',
  'pro',
  'references',
  'favorites',
  'selectedTaskIds',
  'composerPrompt',
  'promptQuery',
  'agentScrollStateByThread'
];
function readPersistedStoreSnapshot() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function comparableStoreDomain(value) {
  try { return JSON.stringify(value === undefined ? null : value); } catch { return ''; }
}
function storeArrayItemId(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return String(value.id || value.key || value.name || '').trim();
}
function mergeCrossTabStoreValue(local, remote, baseline) {
  const localChanged = comparableStoreDomain(local) !== comparableStoreDomain(baseline);
  const remoteChanged = comparableStoreDomain(remote) !== comparableStoreDomain(baseline);
  if (Array.isArray(local) && Array.isArray(remote)) {
    const localIds = local.map(storeArrayItemId);
    const remoteIds = remote.map(storeArrayItemId);
    if (local.every((item) => storeArrayItemId(item)) && remote.every((item) => storeArrayItemId(item))) {
      const localMap = new Map(local.map((item) => [storeArrayItemId(item), item]));
      const remoteMap = new Map(remote.map((item) => [storeArrayItemId(item), item]));
      const baselineMap = new Map((Array.isArray(baseline) ? baseline : []).map((item) => [storeArrayItemId(item), item]));
      const order = [...localIds, ...remoteIds.filter((id) => !localMap.has(id))];
      const merged = [];
      for (const id of order) {
        const localItem = localMap.get(id);
        const remoteItem = remoteMap.get(id);
        const baselineItem = baselineMap.get(id);
        if (!localItem && remoteItem) {
          merged.push(remoteItem);
        } else if (localItem && !remoteItem) {
          merged.push(localItem);
        } else if (localItem && remoteItem) {
          merged.push(mergeCrossTabStoreValue(localItem, remoteItem, baselineItem));
        }
      }
      return merged;
    }
    if (!localChanged) return remote;
    if (!remoteChanged) return local;
    return local;
  }
  if (local && remote && typeof local === 'object' && typeof remote === 'object' && !Array.isArray(local) && !Array.isArray(remote)) {
    const baselineObject = baseline && typeof baseline === 'object' && !Array.isArray(baseline) ? baseline : {};
    const merged = {};
    for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const hasLocal = Object.prototype.hasOwnProperty.call(local, key);
      const hasRemote = Object.prototype.hasOwnProperty.call(remote, key);
      const hasBaseline = Object.prototype.hasOwnProperty.call(baselineObject, key);
      if (hasLocal && hasRemote) {
        merged[key] = mergeCrossTabStoreValue(local[key], remote[key], hasBaseline ? baselineObject[key] : undefined);
      } else if (hasLocal) {
        merged[key] = local[key];
      } else if (hasRemote) {
        merged[key] = remote[key];
      }
    }
    return merged;
  }
  if (!localChanged) return remote;
  if (!remoteChanged) return local;
  return local;
}
function mergeCrossTabStoreDomains(clean) {
  if (!clean || typeof clean !== 'object' || !persistedStoreBaseline) return;
  const remote = readPersistedStoreSnapshot();
  if (!remote) return;
  for (const key of CROSS_TAB_STORE_DOMAINS) {
    if (Object.prototype.hasOwnProperty.call(remote, key)) {
      clean[key] = mergeCrossTabStoreValue(clean[key], remote[key], persistedStoreBaseline[key]);
    }
  }
}

function collectPersistedReferencedBlobSnapshot() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ids: new Set(), available: true };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ids: new Set(), available: false };
    return { ids: collectReferencedBlobIds(parsed), available: true };
  } catch {
    return { ids: new Set(), available: false };
  }
}
function blobReferenceLockApi() {
  return typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function'
    ? navigator.locks
    : null;
}
async function deleteUnreferencedBlobIds(ids = [], options = {}) {
  const candidates = [...new Set((Array.isArray(ids) ? ids : [...(ids || [])]).filter(Boolean))];
  if (!candidates.length) return { deleted: 0, retry: [] };
  const reservationSnapshot = options.reservationSnapshot instanceof Map
    ? options.reservationSnapshot
    : snapshotCandidateBlobReservations(candidates);
  if (options.lockHeld === true) return deleteUnreferencedBlobIdsUnlocked(candidates, { ...options, reservationSnapshot });
  const locks = blobReferenceLockApi();
  if (!locks) return { deleted: 0, retry: candidates, skipped: true, reason: 'blob-reference-lock-unavailable' };
  return locks.request(BLOB_REFERENCE_LOCK_NAME, { mode: 'exclusive' }, () => deleteUnreferencedBlobIdsUnlocked(candidates, { ...options, lockHeld: true, reservationSnapshot }));
}
async function deleteUnreferencedBlobIdsUnlocked(ids = [], options = {}) {
  const candidates = [...new Set((Array.isArray(ids) ? ids : [...(ids || [])]).filter(Boolean))];
  if (!candidates.length) return { deleted: 0, retry: [] };
  const reservationSnapshot = options.reservationSnapshot instanceof Map
    ? options.reservationSnapshot
    : snapshotCandidateBlobReservations(candidates);
  const currentKeep = collectReferencedBlobIds();
  const persistedSnapshot = options.includePersisted === false
    ? { ids: new Set(), available: true }
    : collectPersistedReferencedBlobSnapshot();
  if (!persistedSnapshot.available) return { deleted: 0, retry: candidates, skipped: true, reason: 'persisted-store-unavailable' };
  const persistedKeep = persistedSnapshot.ids;
  const taskStoreSnapshot = await collectTaskStoreReferencedBlobIds();
  if (!taskStoreSnapshot.available) return { deleted: 0, retry: candidates, skipped: true, reason: 'task-store-unavailable' };
  const archived = await collectArchivedAgentReferencedBlobIds();
  if (!archived.available) return { deleted: 0, retry: candidates, skipped: true, reason: 'agent-archive-unavailable' };
  const keep = new Set([...currentKeep, ...persistedKeep, ...taskStoreSnapshot.ids, ...archived.ids]);
  // 候选 Blob 已经离开当前删除流程；是否仍被引用由两轮快照决定，旧租约不能阻止最后引用释放。
  const candidateSet = new Set(candidates);
  const protectedIds = new Set(Object.keys(readBlobReservations()).filter((id) => !candidateSet.has(id)));
  const firstChangedReservations = changedCandidateBlobReservations(candidates, reservationSnapshot);
  const firstRetry = candidates.filter((id) => !currentKeep.has(id) && (firstChangedReservations.has(String(id)) || persistedKeep.has(id) || archived.ids.has(id) || protectedIds.has(id)));
  const firstDeletable = candidates.filter((id) => !keep.has(id) && !protectedIds.has(id) && !firstChangedReservations.has(String(id)));
  // Blob 引用可能在首次扫描等待归档读取期间由另一标签页写入，删除前必须二次确认。
  const latestCurrentKeep = collectReferencedBlobIds();
  const latestPersisted = options.includePersisted === false
    ? { ids: new Set(), available: true }
    : collectPersistedReferencedBlobSnapshot();
  const latestTaskStore = await collectTaskStoreReferencedBlobIds();
  const latestArchived = await collectArchivedAgentReferencedBlobIds();
  if (!latestPersisted.available || !latestTaskStore.available || !latestArchived.available) {
    return { deleted: 0, retry: candidates, skipped: true, reason: 'reference-snapshot-unavailable' };
  }
  const latestKeep = new Set([...latestCurrentKeep, ...latestPersisted.ids, ...latestTaskStore.ids, ...latestArchived.ids]);
  const latestProtectedIds = new Set(Object.keys(readBlobReservations()).filter((id) => !candidateSet.has(id)));
  const retry = [...new Set([
    ...firstRetry,
    ...candidates.filter((id) => !latestCurrentKeep.has(id) && (changedCandidateBlobReservations([id], reservationSnapshot).has(String(id)) || latestKeep.has(id) || latestProtectedIds.has(id)))
  ])];
  const latestChangedReservations = changedCandidateBlobReservations(candidates, reservationSnapshot);
  const deletable = firstDeletable.filter((id) => !latestKeep.has(id) && !latestProtectedIds.has(id) && !latestChangedReservations.has(String(id)));
  const deletedResults = await Promise.all(deletable.map(async (id) => {
    try {
      return await deleteBlob(id, { reservationSnapshot }) ? id : '';
    } catch {
      return '';
    }
  }));
  const deletedIds = deletedResults.filter(Boolean);
  for (const id of deletedIds) {
    revokeMapEntry(state.imageUrls, id);
    revokeMapEntry(state.galleryPreviewUrls, id);
  }
  return { deleted: deletedIds.length, deletedIds, retry: [...new Set([...retry, ...deletable.filter((id) => !deletedIds.includes(id))])] };
}
async function releaseBlobIdsSafely(ids = []) {
  const candidates = [...new Set((Array.isArray(ids) ? ids : [...(ids || [])]).filter(Boolean))];
  if (!candidates.length) return { deleted: 0, retry: [] };
  const result = await deleteUnreferencedBlobIds(candidates).catch(() => ({ deleted: 0, retry: candidates, skipped: true }));
  if (result.retry?.length) queuePendingBlobRelease(result.retry, false);
  return result;
}

function queuePendingBlobRelease(ids = [], flushNow = false) {
  for (const id of Array.isArray(ids) ? ids : [...(ids || [])]) if (id) pendingBlobReleases.add(id);
  if (flushNow) schedulePendingBlobReleaseFlush();
}

function schedulePendingBlobReleaseFlush() {
  if (pendingBlobReleaseFlushTimer || !pendingBlobReleases.size) return;
  pendingBlobReleaseFlushTimer = setTimeout(async () => {
    pendingBlobReleaseFlushTimer = 0;
    const ids = [...pendingBlobReleases];
    pendingBlobReleases.clear();
    const result = await deleteUnreferencedBlobIds(ids).catch(() => ({ deleted: 0, retry: ids, skipped: true }));
    if (result.skipped) {
      queuePendingBlobRelease(result.retry || ids, false);
      pendingBlobReleaseFlushTimer = setTimeout(() => {
        pendingBlobReleaseFlushTimer = 0;
        schedulePendingBlobReleaseFlush();
      }, BLOB_RELEASE_RETRY_DELAY_MS);
      return;
    }
    queuePendingBlobRelease(result.retry || [], false);
    if (!pendingBlobReleases.size) return;
    if (result.retry?.length) {
      pendingBlobReleaseFlushTimer = setTimeout(() => {
        pendingBlobReleaseFlushTimer = 0;
        schedulePendingBlobReleaseFlush();
      }, BLOB_RELEASE_RETRY_DELAY_MS);
      return;
    }
    schedulePendingBlobReleaseFlush();
  }, 0);
}
function deleteStoreKeysNotIn(store, keep, normalizeKey = (key) => key, isProtected = () => false) {
  if (typeof store.openKeyCursor === 'function') {
    const cursorRequest = store.openKeyCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      if (!keep.has(normalizeKey(cursor.key)) && !isProtected(cursor.key)) {
        if (typeof cursor.delete === 'function') cursor.delete();
        else store.delete(cursor.key);
      }
      cursor.continue();
    };
    return;
  }
  if (typeof store.getAllKeys === 'function') {
    const keysRequest = store.getAllKeys();
    keysRequest.onsuccess = () => {
      for (const key of keysRequest.result || []) {
        if (!keep.has(normalizeKey(key)) && !isProtected(key)) store.delete(key);
      }
    };
  }
}
function agentArchiveMessageKey(message, index = 0) {
  return String(message?.id || `${message?.createdAt || 0}:${message?.role || ''}:${index}`);
}
function agentArchiveSnapshot(threadId, messages, options = {}) {
  const archivedMessages = (Array.isArray(messages) ? messages : []).map(archiveAgentMessage);
  return {
    threadId: String(threadId),
    messages: archivedMessages,
    deleted: options.deleted === true,
    updatedAt: Number(options.updatedAt || archivedMessages.at(-1)?.createdAt || Date.now()),
    revision: Number(options.revision || 0)
  };
}
function agentArchiveFingerprint(snapshot) {
  return JSON.stringify({
    deleted: snapshot?.deleted === true,
    messages: snapshot?.messages || []
  });
}
function agentArchiveMessageFingerprint(message) {
  if (!message) return 'null';
  const normalized = { ...message };
  if (normalized.pending !== true) delete normalized.pending;
  return JSON.stringify(normalized);
}
function rememberAgentArchiveBaseline(snapshot) {
  const threadId = String(snapshot?.threadId || '');
  if (!threadId) return;
  knownAgentArchiveThreadIds.add(threadId);
  agentArchiveBaselines.set(threadId, {
    fingerprint: agentArchiveFingerprint(snapshot),
    messageKeys: new Set((snapshot.messages || []).map(agentArchiveMessageKey)),
    messageFingerprints: new Map((snapshot.messages || []).map((message, index) => [
      agentArchiveMessageKey(message, index),
      agentArchiveMessageFingerprint(message)
    ])),
    revision: Number(snapshot.revision || 0),
    deleted: snapshot.deleted === true
  });
}
function mergeAgentArchiveMessages(remoteMessages, localMessages) {
  const merged = new Map();
  (Array.isArray(remoteMessages) ? remoteMessages : []).forEach((message, index) => merged.set(agentArchiveMessageKey(message, index), message));
  (Array.isArray(localMessages) ? localMessages : []).forEach((message, index) => merged.set(agentArchiveMessageKey(message, index), message));
  return [...merged.values()].sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
}
function mergeAgentArchiveChanges(remoteMessages, localMessages, baseline) {
  const merged = new Map();
  (Array.isArray(remoteMessages) ? remoteMessages : []).forEach((message, index) => merged.set(agentArchiveMessageKey(message, index), message));
  (Array.isArray(localMessages) ? localMessages : []).forEach((message, index) => {
    const key = agentArchiveMessageKey(message, index);
    const baselineFingerprint = baseline?.messageFingerprints?.get(key);
    const localChanged = baselineFingerprint
      ? agentArchiveMessageFingerprint(message) !== baselineFingerprint
      : !merged.has(key);
    if (localChanged || !merged.has(key)) merged.set(key, message);
  });
  return [...merged.values()].sort((a, b) => Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
}
function agentArchiveLocalChanges(messages, baseline, since = 0) {
  return (Array.isArray(messages) ? messages : []).filter((message, index) => {
    const key = agentArchiveMessageKey(message, index);
    const baselineFingerprint = baseline?.messageFingerprints?.get(key);
    if (baselineFingerprint) return agentArchiveMessageFingerprint(message) !== baselineFingerprint;
    if (baseline?.messageKeys?.has(key)) return false;
    return !since || Math.max(Number(message?.updatedAt || 0), Number(message?.createdAt || 0)) > since;
  });
}
function recoveredAgentThread(threadId, messages) {
  const projectEntry = Object.entries(state.agent?.threadsByProject || {}).find(([, threads]) =>
    (Array.isArray(threads) ? threads : []).some((thread) => thread.id === threadId));
  if (!projectEntry) return null;
  const [projectId, threads] = projectEntry;
  const sourceThread = threads.find((thread) => thread.id === threadId);
  const recovered = makeAgentThread(projectId, {
    title: `${sourceThread?.title || '对话'}（恢复）`,
    sourceThreadId: threadId,
    createdAt: Date.now(),
    updatedAt: Math.max(Date.now(), Number(messages.at(-1)?.createdAt || 0))
  });
  const recoveredMessages = messages.map((message) => ({
    ...message,
    threadId: recovered.id,
    projectId
  }));
  return { projectId, sourceThread, thread: recovered, messages: recoveredMessages };
}
function applyRecoveredAgentThread(recovery) {
  if (!recovery?.thread?.id || !recovery?.projectId) return;
  const { projectId, sourceThread, thread, messages } = recovery;
  const threads = Array.isArray(state.agent.threadsByProject?.[projectId])
    ? state.agent.threadsByProject[projectId]
    : [];
  const sourceIndex = threads.findIndex((item) => item.id === sourceThread?.id);
  const nextThreads = threads.filter((item) => item.id !== sourceThread?.id && item.id !== thread.id);
  nextThreads.splice(sourceIndex >= 0 ? sourceIndex : nextThreads.length, 0, thread);
  state.agent.threadsByProject[projectId] = nextThreads;
  delete state.agent.messagesByThread[sourceThread?.id];
  state.agent.messagesByThread[thread.id] = messages;
  if (state.agent.activeThreadIdByProject?.[projectId] === sourceThread?.id) {
    state.agent.activeThreadIdByProject[projectId] = thread.id;
  }
}
function removeArchivedAgentThread(threadId) {
  delete state.agent.messagesByThread[threadId];
  for (const [projectId, threads] of Object.entries(state.agent.threadsByProject || {})) {
    const filtered = (Array.isArray(threads) ? threads : []).filter((thread) => thread.id !== threadId);
    if (filtered.length === threads.length) continue;
    if (!filtered.length) {
      const replacement = makeAgentThread(projectId, { title: newAgentThreadTitle() });
      filtered.push(replacement);
      state.agent.messagesByThread[replacement.id] = [];
    }
    state.agent.threadsByProject[projectId] = filtered;
    if (!filtered.some((thread) => thread.id === state.agent.activeThreadIdByProject?.[projectId])) {
      state.agent.activeThreadIdByProject[projectId] = filtered[0].id;
    }
  }
}
async function performAgentHistoryPersistUnlocked() {
  const database = await openDb();
  const snapshots = Object.entries(state.agent?.messagesByThread || {}).map(([threadId, messages]) => agentArchiveSnapshot(threadId, messages));
  const activeIds = new Set(snapshots.map((item) => item.threadId));
  const changedSnapshots = snapshots.filter((snapshot) => agentArchiveBaselines.get(snapshot.threadId)?.fingerprint !== agentArchiveFingerprint(snapshot));
  const deletedIds = [...knownAgentArchiveThreadIds].filter((threadId) => !activeIds.has(threadId) && !agentArchiveBaselines.get(threadId)?.deleted);
  if (!changedSnapshots.length && !deletedIds.length) return;
  const committed = new Map();
  const recoveries = [];
  await new Promise((resolve, reject) => {
    const tx = database.transaction(DB_AGENT_STORE, 'readwrite');
    const store = tx.objectStore(DB_AGENT_STORE);
    for (const snapshot of changedSnapshots) {
      const baseline = agentArchiveBaselines.get(snapshot.threadId);
      const localFingerprint = agentArchiveFingerprint(snapshot);
      const localKeys = new Set(snapshot.messages.map(agentArchiveMessageKey));
      const request = store.get(snapshot.threadId);
      request.onsuccess = () => {
        const remote = request.result;
        if (remote?.deleted === true) {
          const localChanges = agentArchiveLocalChanges(snapshot.messages, baseline, Number(remote.updatedAt || 0));
          const recovery = localChanges.length ? recoveredAgentThread(snapshot.threadId, localChanges) : null;
          if (recovery) {
            const recoveredSnapshot = agentArchiveSnapshot(recovery.thread.id, recovery.messages, {
              updatedAt: recovery.thread.updatedAt,
              revision: 1
            });
            store.put(recoveredSnapshot, recovery.thread.id);
            recoveries.push(recovery);
            committed.set(recovery.thread.id, { snapshot: recoveredSnapshot, localFingerprint: agentArchiveFingerprint(recoveredSnapshot) });
          }
          committed.set(snapshot.threadId, { snapshot: remote, localFingerprint });
          return;
        }
        const localIsAdditive = !baseline || (!baseline.deleted && [...baseline.messageKeys].every((key) => localKeys.has(key)));
        const remoteHasDestructiveChange = baseline
          && Number(remote?.revision || 0) > Number(baseline.revision || 0)
          && [...baseline.messageKeys].some((key) => !(remote?.messages || []).some((message, index) => agentArchiveMessageKey(message, index) === key));
        const localAdditions = remoteHasDestructiveChange
          ? snapshot.messages.filter((message, index) => {
            if (baseline.messageKeys.has(agentArchiveMessageKey(message, index))) return false;
            const messageTime = Math.max(Number(message?.updatedAt || 0), Number(message?.createdAt || 0));
            return messageTime > Number(remote?.updatedAt || 0);
          })
          : snapshot.messages;
        const messages = localIsAdditive && remote && !remote.deleted
          ? mergeAgentArchiveChanges(remote.messages, localAdditions, remoteHasDestructiveChange ? null : baseline)
          : snapshot.messages;
        const next = {
          ...snapshot,
          messages,
          deleted: false,
          updatedAt: Math.max(Number(snapshot.updatedAt || 0), Number(remote?.updatedAt || 0), Date.now()),
          revision: Math.max(Number(remote?.revision || 0), Number(baseline?.revision || 0)) + 1
        };
        store.put(next, snapshot.threadId);
        committed.set(snapshot.threadId, { snapshot: next, localFingerprint });
      };
    }
    for (const threadId of deletedIds) {
      const request = store.get(threadId);
      request.onsuccess = () => {
        const remote = request.result;
        const tombstone = agentArchiveSnapshot(threadId, [], {
          deleted: true,
          updatedAt: Date.now(),
          revision: Math.max(Number(remote?.revision || 0), Number(agentArchiveBaselines.get(threadId)?.revision || 0)) + 1
        });
        store.put(tombstone, threadId);
        committed.set(threadId, { snapshot: tombstone, localFingerprint: '' });
      };
    }
    tx.oncomplete = () => {
      const recoveredSourceIds = new Set(recoveries.map((recovery) => recovery.sourceThread?.id).filter(Boolean));
      for (const [threadId, result] of committed) {
        const snapshot = result.snapshot;
        if (snapshot.deleted) {
          if (!recoveredSourceIds.has(threadId)) removeArchivedAgentThread(threadId);
        } else {
          const currentMessages = state.agent?.messagesByThread?.[threadId];
          const currentSnapshot = agentArchiveSnapshot(threadId, currentMessages);
          if (agentArchiveFingerprint(currentSnapshot) === result.localFingerprint) {
            state.agent.messagesByThread[threadId] = snapshot.messages;
          }
        }
        rememberAgentArchiveBaseline(snapshot);
      }
      recoveries.forEach(applyRecoveredAgentThread);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
async function performAgentHistoryPersist() {
  const locks = blobReferenceLockApi();
  if (!locks) return performAgentHistoryPersistUnlocked();
  return locks.request(BLOB_REFERENCE_LOCK_NAME, { mode: 'exclusive' }, () => performAgentHistoryPersistUnlocked());
}
function persistAgentHistorySnapshots() {
  const run = agentHistoryPersistChain
    .catch(() => {})
    .then(() => performAgentHistoryPersist());
  agentHistoryPersistChain = run;
  return run;
}
function scheduleAgentHistoryPersist() {
  clearTimeout(agentHistoryWriteTimer);
  agentHistoryWriteTimer = setTimeout(() => {
    persistAgentHistorySnapshots().catch((err) => console.warn('[home-v3] Agent history archive skipped', err));
  }, 350);
}
async function hydrateAgentHistoryFromDb() {
  const database = await openDb();
  const snapshots = await new Promise((resolve, reject) => {
    const tx = database.transaction(DB_AGENT_STORE, 'readonly');
    const store = tx.objectStore(DB_AGENT_STORE);
    if (typeof store.getAll !== 'function') {
      resolve([]);
      return;
    }
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  for (const snapshot of snapshots) {
    const threadId = String(snapshot?.threadId || '');
    if (!threadId) continue;
    knownAgentArchiveThreadIds.add(threadId);
    const local = Array.isArray(state.agent?.messagesByThread?.[threadId]) ? state.agent.messagesByThread[threadId] : [];
    if (snapshot.deleted === true) {
      const localChanges = agentArchiveLocalChanges(local, null, Number(snapshot.updatedAt || 0));
      const recovery = localChanges.length ? recoveredAgentThread(threadId, localChanges) : null;
      if (recovery) applyRecoveredAgentThread(recovery);
      else removeArchivedAgentThread(threadId);
      rememberAgentArchiveBaseline(snapshot);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(state.agent?.messagesByThread || {}, threadId)) {
      rememberAgentArchiveBaseline(snapshot);
      continue;
    }
    const archived = Array.isArray(snapshot.messages) ? snapshot.messages : [];
    state.agent.messagesByThread[threadId] = mergeAgentArchiveMessages(archived, local);
    rememberAgentArchiveBaseline({ ...snapshot, messages: state.agent.messagesByThread[threadId] });
  }
}
async function cleanupOrphanBlobs(options = {}) {
  if (options?.confirm !== true) return { deleted: 0, skipped: true, reason: 'explicit-confirmation-required' };
  if (options.lockHeld !== true) {
    const locks = blobReferenceLockApi();
    if (!locks) return { deleted: 0, skipped: true, reason: 'blob-reference-lock-unavailable' };
    return locks.request(BLOB_REFERENCE_LOCK_NAME, { mode: 'exclusive' }, () => cleanupOrphanBlobs({ ...options, lockHeld: true }));
  }
  reserveReferencedBlobIds(state);
  const archived = await collectArchivedAgentReferencedBlobIds();
  if (!archived.available) return { deleted: 0, skipped: true, reason: 'agent-archive-unavailable' };
  const db = await openDb();
  const keep = collectReferencedBlobIds();
  const persistedSnapshot = collectPersistedReferencedBlobSnapshot();
  if (!persistedSnapshot.available) return { deleted: 0, skipped: true, reason: 'persisted-store-unavailable' };
  const taskStoreSnapshot = await collectTaskStoreReferencedBlobIds();
  if (!taskStoreSnapshot.available) return { deleted: 0, skipped: true, reason: 'task-store-unavailable' };
  for (const id of persistedSnapshot.ids) keep.add(id);
  for (const id of taskStoreSnapshot.ids) keep.add(id);
  for (const id of archived.ids) keep.add(id);
  const hasStoredTaskImages = (state.tasks || []).some((task) => (task.images || []).some((image) => image?.blobId));
  if (hasStoredTaskImages && !keep.size) {
    console.warn('[home-v3] skipped blob cleanup because task references were not ready');
    return { deleted: 0, skipped: true, reason: 'references-not-ready' };
  }
  const protectedIds = new Set(Object.keys(readBlobReservations()));
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    deleteStoreKeysNotIn(store, keep, (key) => key, (key) => {
      if (protectedIds.has(String(key))) return true;
      return Object.prototype.hasOwnProperty.call(readBlobReservations(), String(key));
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return { deleted: 0, skipped: false };
}
function taskBlobIds(task) {
  const ids = new Set();
  const add = (id) => { if (id) ids.add(id); };
  for (const image of task?.images || []) {
    add(image?.blobId);
    add(image?.originalBlobId);
    add(image?.compositedBlobId);
    add(image?.maskBlobId);
  }
  for (const partial of task?.streamPartialImages || []) add(partial?.blobId);
  for (const ref of taskReferenceSnapshots(task)) {
    add(ref?.blobId);
    add(ref?.originalBlobId);
    add(ref?.compositedBlobId);
    add(ref?.maskBlobId);
  }
  return ids;
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
  const normalizedBody = String(body || '').replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalizedBody.length % 4;
  const paddedBody = padding ? `${normalizedBody}${'='.repeat(4 - padding)}` : normalizedBody;
  const bin = atob(paddedBody);
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
function normalizeImageMime(value) {
  const raw = String(value || '').trim().toLowerCase().split(';')[0];
  if (raw === 'png' || raw === 'image/png') return 'image/png';
  if (raw === 'jpg' || raw === 'jpeg' || raw === 'image/jpg' || raw === 'image/jpeg') return 'image/jpeg';
  if (raw === 'webp' || raw === 'image/webp') return 'image/webp';
  if (raw === 'gif' || raw === 'image/gif') return 'image/gif';
  return /^image\/[a-z0-9.+-]+$/.test(raw) ? raw : '';
}
function imageFormatFromMime(value) {
  const mime = normalizeImageMime(value);
  if (mime === 'image/jpeg') return 'jpeg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return mime === 'image/png' ? 'png' : '';
}
function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
function bytesToImageDataUrl(bytes, fallbackMime = 'image/png') {
  const mime = detectImageMimeFromBytes(bytes) || normalizeImageMime(fallbackMime);
  if (!mime) return '';
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}
function detectImageMimeFromBytes(bytes) {
  if (!bytes || bytes.length < 4) return '';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return 'image/gif';
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
  const detectedType = detectImageMimeFromBytes(head) || normalizeImageMime(blob.type) || '';
  return {
    width: size.width,
    height: size.height,
    type: detectedType,
    hasAlpha: detectedType === 'image/png' ? pngMayHaveAlpha(head) : undefined
  };
}
async function normalizeImageBlobType(blob, fallbackMime = '') {
  if (!blob?.size) return { blob: null, info: {} };
  const info = await imageInfoFromBlob(blob).catch(() => ({ type: normalizeImageMime(fallbackMime) || blob.type || '' }));
  const detectedType = normalizeImageMime(info.type || fallbackMime);
  if (!detectedType || detectedType === normalizeImageMime(blob.type)) {
    return { blob, info: { ...info, type: detectedType || normalizeImageMime(blob.type) || blob.type || '' } };
  }
  const normalizedBlob = new Blob([await blob.arrayBuffer()], { type: detectedType });
  return { blob: normalizedBlob, info: { ...info, type: detectedType } };
}
function imageFormatMime(value) {
  const normalized = normalizeImageMime(value);
  if (normalized) return normalized;
  const format = String(value || '').trim().toLowerCase();
  return normalizeImageMime(format ? `image/${format}` : '');
}
async function transcodeImageBlob(blob, targetMime, quality = 0.92) {
  const mime = imageFormatMime(targetMime);
  if (!blob?.size || !mime || mime === normalizeImageMime(blob.type)) return blob;
  const boundedQuality = Math.max(0.1, Math.min(1, Number(quality) || 0.92));
  let bitmap = null;
  let objectUrl = '';
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(blob);
    } else if (typeof Image !== 'undefined' && typeof document !== 'undefined') {
      objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = objectUrl;
      });
      bitmap = image;
    } else {
      throw new Error('当前浏览器不支持图片格式转换');
    }
    const width = Number(bitmap.width || bitmap.naturalWidth || 0);
    const height = Number(bitmap.height || bitmap.naturalHeight || 0);
    if (!width || !height) throw new Error('无法读取上游图片尺寸');
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : typeof document !== 'undefined'
        ? Object.assign(document.createElement('canvas'), { width, height })
        : null;
    if (!canvas) throw new Error('当前浏览器不支持图片格式转换画布');
    const context = canvas.getContext('2d', { alpha: mime !== 'image/jpeg' });
    if (!context) throw new Error('无法创建图片格式转换画布');
    if (mime === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0, width, height);
    if (typeof canvas.convertToBlob === 'function') {
      return await canvas.convertToBlob({ type: mime, quality: boundedQuality });
    }
    return await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('图片格式转换失败')), mime, boundedQuality);
    });
  } finally {
    bitmap?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
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
    galleryVirtual: { scrollTop: 0, viewportHeight: 720, viewportWidth: 0, cardHeight: 0, columns: 0 },
    agentScrollStateByThread: {},
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
    merged.settings.quality = normalizeImageQuality(merged.settings.quality);
    merged.preferences = { ...DEFAULT_PREFERENCES, ...(parsed.preferences || {}) };
    merged.entryAdvanced = {
      gallery: { ...DEFAULT_ENTRY_ADVANCED, ...(readEntryAdvanced('gallery') || parsed.entryAdvanced?.gallery || {}) },
      pro: { ...DEFAULT_ENTRY_ADVANCED, ...(readEntryAdvanced('pro') || parsed.entryAdvanced?.pro || {}) },
      workflow: { ...DEFAULT_ENTRY_ADVANCED, ...(readEntryAdvanced('workflow') || parsed.entryAdvanced?.workflow || {}) },
      agent: { ...DEFAULT_ENTRY_ADVANCED, ...(readEntryAdvanced('agent') || parsed.entryAdvanced?.agent || {}) }
    };
    if (typeof sessionStorage !== 'undefined') {
      let sessionSettings = null;
      let sessionSettingsReadable = false;
      try {
        const rawSession = sessionStorage.getItem(COMPOSER_SESSION_KEY);
        if (!rawSession) {
          sessionSettingsReadable = true;
        } else {
          const parsedSession = JSON.parse(rawSession);
          if (parsedSession && typeof parsedSession === 'object' && !Array.isArray(parsedSession)) {
            sessionSettings = parsedSession;
            sessionSettingsReadable = true;
          }
        }
      } catch {
        sessionSettings = null;
      }
      if (sessionSettingsReadable) {
        for (const key of COMPOSER_SETTING_KEYS) merged.settings[key] = sessionSettings && Object.prototype.hasOwnProperty.call(sessionSettings, key) ? sessionSettings[key] : base.settings[key];
        merged.settings.quality = normalizeImageQuality(merged.settings.quality);
        for (const key of COMPOSER_SESSION_FIELDS) {
          if (sessionSettings && Object.prototype.hasOwnProperty.call(sessionSettings, key)) merged[key] = sessionSettings[key];
          else merged[key] = null;
        }
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
    merged.tasks = merged.tasks.map((task) => ({
      ...task,
      images: (Array.isArray(task.images) ? task.images : []).map((image) => {
        const sourceUrl = String(image?.remoteUrl || image?.url || '').trim();
        if (!sourceUrl || sourceUrl.length > LEGACY_IMAGE_URL_MAX_LENGTH) return image;
        if (/^data:image\//i.test(sourceUrl) || /^blob:/i.test(sourceUrl)) {
          return { ...image, remoteUrl: sourceUrl, url: sourceUrl };
        }
        return image;
      })
    }));
    merged.tasks = merged.tasks.map(normalizeRestoredTask);
    return merged;
  } catch (err) {
    console.warn('[home-v3] failed to read store', err);
    return defaultStore();
  }
}
function normalizeRestoredTask(task) {
  const images = Array.isArray(task.images) ? task.images : [];
  const streamPartialImages = Array.isArray(task.streamPartialImages)
    ? task.streamPartialImages.filter((item) => item?.blobId).slice(-STREAM_PARTIAL_TASK_LIMIT)
    : [];
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
  const hasTransparentFailure = Number(task.transparentFailedCount || 0) > 0
    || !!String(task.transparentPostProcessError || '').trim()
    || (Array.isArray(task.partialErrors) && task.partialErrors.some((item) => item?.stage === 'transparent-postprocess'));
  if (!hasImages && streamPartialImages.length && (task.status === 'queued' || task.status === 'running' || task.status === 'interrupted' || task.streamState === 'interrupted')) {
    return {
      ...task,
      images,
      streamPartialImages,
      streamState: 'interrupted',
      status: 'partial_success',
      error: task.error || '流式连接已中断，已保留预览图；该图片不是最终输出。',
      finishedAt: task.finishedAt || Date.now()
    };
  }
  if (hasImages && expected > 0) {
    const partial = task.status === 'partial_success' || images.length < expected || hasTransparentFailure;
    return { ...task, images, streamPartialImages, status: partial ? 'partial_success' : 'success', error: partial ? task.error || '' : '', errorDetail: partial ? task.errorDetail || '' : '' };
  }
  if ((hasCompletionEvidence && (!hasError || isRefreshInterruptionError)) || (isRefreshInterruptionError && hasRecoverableSuccessEvidence)) {
    const partial = task.status === 'partial_success' || hasTransparentFailure || (expected > 0 && images.length > 0 && images.length < expected);
    return { ...task, images, streamPartialImages, status: partial ? 'partial_success' : 'success', error: partial ? task.error || '' : '', errorDetail: partial ? task.errorDetail || '' : '' };
  }
  if (hasError && !hasImages && task.status !== 'queued' && task.status !== 'running') return { ...task, images, streamPartialImages, status: 'error' };
  if (task.status === 'queued' || task.status === 'running') {
    return { ...task, images, streamPartialImages, status: 'interrupted', error: task.error || '页面刷新导致请求中断，可重试。', finishedAt: task.finishedAt || Date.now() };
  }
  return { ...task, images, streamPartialImages };
}
function sanitizeStoredImages(images = []) {
  return (Array.isArray(images) ? images : []).map((img) => {
    const remoteUrl = /^(?:data|blob):/i.test(String(img.remoteUrl || img.url || '')) ? '' : (img.remoteUrl || img.url || '');
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
    streamPreviewSlots: {},
    images: sanitizeStoredImages(task.images),
    referenceSnapshots: taskReferenceSnapshots(task)
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
    persistenceRevision: base.persistenceRevision,
    finishedAt: base.finishedAt,
    elapsedMs: base.elapsedMs,
    apiElapsedMs: base.apiElapsedMs,
    persistElapsedMs: base.persistElapsedMs,
    timing: base.timing,
    responseMode: base.responseMode,
    completionReason: base.completionReason,
    streamState: base.streamState,
    streamPartialImages: Array.isArray(base.streamPartialImages) ? base.streamPartialImages : [],
    streamEventCount: base.streamEventCount,
    streamPartialCount: base.streamPartialCount,
    lastStreamEventType: base.lastStreamEventType,
    errorStage: base.errorStage,
    errorCode: base.errorCode,
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
function writeStore(options = {}) {
  if (options?.deletedTaskIds) rememberTaskDeleteTombstones(options.deletedTaskIds);
  if (scrollInteractionActive() && options.forceTaskPersistence !== true) {
    scheduleStoreWrite();
    return;
  }
  let persisted = false;
  let persistedSnapshot = null;
  filteredTasksCache = null;
  const agentForStorage = {
    ...state.agent,
    messagesByThread: compactAgentMessagesByThreadForStorage(state.agent?.messagesByThread)
  };
  const clean = JSON.parse(JSON.stringify({
    ...state,
    agent: agentForStorage,
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
    taskRecovery: undefined,
    proFileTarget: '',
    promptRepo: { ...state.promptRepo, detail: null, imageViewer: null }
  }));
  const baseSettings = defaultStore().settings;
  for (const key of COMPOSER_SETTING_KEYS) clean.settings[key] = baseSettings[key];
  for (const key of COMPOSER_SESSION_FIELDS) clean[key] = null;
  state.tasks.forEach(ensureTaskPersistenceRevision);
  clean.references = clean.references.map((ref) => ({ ...ref, url: undefined, file: undefined }));
  clean.pro.refs = (clean.pro.refs || []).map((ref) => ({ ...ref, url: undefined, file: undefined }));
  clean.entryAdvanced = clean.entryAdvanced || {};
  clean.tasks = state.tasks.map((task) => compactTaskForStorage(task, 'normal'));
  mergeCrossTabTasks(clean, options.deletedTaskIds);
  mergeCrossTabStoreDomains(clean);
  reserveReferencedBlobIds(clean);
  const directDeletedIds = (Array.isArray(options.deletedTaskIds) ? options.deletedTaskIds : [...(options.deletedTaskIds || [])])
    .filter(Boolean)
    .map(String);
  const persistedDeletedIds = new Set([
    ...readTaskDeleteTombstones().keys(),
    ...directDeletedIds
  ]);
  scheduleTaskPersistence(clean.tasks, { deletedTaskIds: [...persistedDeletedIds] });
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(clean));
    persisted = true;
    persistedSnapshot = clean;
  } catch (err) {
    try {
      const compact = {
        ...clean,
        tasks: [],
        taskStore: {
          version: 2,
          count: state.tasks.length,
          ids: state.tasks.map((task) => task?.id).filter(Boolean),
          snapshotRevision: taskSnapshotRevision(state.tasks),
          updatedAt: Date.now()
        }
      };
      localStorage.setItem(STORE_KEY, JSON.stringify(compact));
      persisted = 'idb';
      persistedSnapshot = compact;
      console.warn('[home-v3] localStorage 配额不足，完整任务已转存 IndexedDB', err);
    } catch (compactErr) {
      try {
        const emergency = {
          ...clean,
          modal: null,
          viewer: null,
          promptRepo: { ...clean.promptRepo, items: [], detail: null, imageViewer: null },
          tasks: [],
          taskStore: {
            version: 2,
            count: state.tasks.length,
            ids: state.tasks.map((task) => task?.id).filter(Boolean),
            snapshotRevision: taskSnapshotRevision(state.tasks),
            updatedAt: Date.now()
          }
        };
        localStorage.setItem(STORE_KEY, JSON.stringify(emergency));
        persisted = 'idb';
        persistedSnapshot = emergency;
        console.warn('[home-v3] localStorage 仍受限，已写入最小状态并保留 IndexedDB 任务', compactErr);
      } catch (emergencyErr) {
        persisted = false;
        console.warn('[home-v3] localStorage 状态写入失败，完整任务仍已排队 IndexedDB', emergencyErr);
      }
    }
  }
  if (persistedSnapshot) persistedStoreBaseline = persistedSnapshot;
  scheduleOwnedBlobReservationRelease(clean, persisted);
  if (persisted === true && pendingBlobReservationReleases.size) {
    for (const id of pendingBlobReservationReleases) releaseBlobReservation(id);
    pendingBlobReservationReleases.clear();
  }
  writePersistedPrompt();
  scheduleAgentHistoryPersist();
  return persisted;
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
  const partialImages = Number(profile.streamPartialImages);
  return {
    responseFormatB64Json: !!profile.responseFormatB64Json,
    streamImages: !!profile.streamImages,
    streamPartialImages: Number.isFinite(partialImages) ? Math.max(0, Math.min(3, partialImages)) : 1,
    timeout: Number(profile.timeout) || Number(state.runtime?.timeout) || 600
  };
}
function normalizeStreamPartialImages(value, fallback = 1) {
  const number = Number(value);
  const fallbackNumber = Number(fallback);
  const normalized = Number.isFinite(number) ? number : (Number.isFinite(fallbackNumber) ? fallbackNumber : 1);
  return Math.max(0, Math.min(3, Math.floor(normalized)));
}
function effectiveAdvanced(entry = currentEntryKey(), profile = imageProfile(), override = null) {
  const safeOverride = override && typeof override === 'object' ? override : null;
  const defaults = profileDefaultAdvanced(profile);
  const overrides = { ...entryAdvanced(entry) };
  if (safeOverride) {
    for (const [key, value] of Object.entries(safeOverride)) {
      if (value !== undefined) overrides[key] = value;
    }
  }
  return {
    responseFormatB64Json: overrides.responseFormatB64Json === null || overrides.responseFormatB64Json === undefined ? defaults.responseFormatB64Json : !!overrides.responseFormatB64Json,
    streamImages: overrides.streamImages === null || overrides.streamImages === undefined ? defaults.streamImages : !!overrides.streamImages,
    streamPartialImages: overrides.streamPartialImages === null || overrides.streamPartialImages === undefined ? defaults.streamPartialImages : normalizeStreamPartialImages(overrides.streamPartialImages, defaults.streamPartialImages),
    timeout: overrides.timeout === null || overrides.timeout === undefined ? defaults.timeout : Math.max(1, Number(overrides.timeout) || defaults.timeout),
    open: !!overrides.open
  };
}
function streamSupported(profile = imageProfile()) {
  const key = providerKey(profile);
  return key === 'openai' && profileMode(profile) === 'images';
}
function agentResponsesStreamEnabled(profile = agentTextProfile()) {
  if (!profile || profileMode(profile) !== 'responses') return false;
  return profile.streamResponses === true || profile.responsesStream === true || profile.agentStream === true;
}
function openAiTransparentBackgroundSupported(profile = imageProfile()) {
  return providerKey(profile) === 'openai' && profile?.supportsNativeTransparency === true;
}
function transparentBackgroundUnsupportedMessage(profile = imageProfile()) {
  return `当前模型 ${profile?.name || profile?.id || profile?.model || '未命名模型'} / ${profile?.model || 'model'} 不能确认支持透明背景。请切换 OpenAI 图片模型，或关闭透明背景后重试。`;
}
function appendAdvancedHeaders(headers = {}, entry = currentEntryKey(), profile = imageProfile(), advancedOverride = null) {
  const advanced = effectiveAdvanced(entry, profile, advancedOverride);
  const out = { ...headers };
  out['X-GPT-Image-Profile-Id'] = profileSelectionKey(profile);
  if (advanced.timeout) out['X-GPT-Image-Timeout-Seconds'] = String(advanced.timeout);
  out['X-GPT-Image-Response-B64'] = advanced.responseFormatB64Json ? 'true' : 'false';
  out['X-GPT-Image-Stream'] = advanced.streamImages && streamSupported(profile) ? 'true' : 'false';
  out['X-GPT-Image-Partial-Images'] = String(Math.max(0, Math.min(3, Number(advanced.streamPartialImages) || 0)));
  out['X-GPT-Image-Entry'] = entry;
  return out;
}
function applyAdvancedToJsonBody(body, entry = currentEntryKey(), profile = imageProfile(), advancedOverride = null) {
  const advanced = effectiveAdvanced(entry, profile, advancedOverride);
  const provider = providerKey(profile);
  if (advanced.responseFormatB64Json && provider !== 'google' && provider !== 'xai') body.response_format = 'b64_json';
  if (advanced.streamImages && streamSupported(profile)) {
    body.stream = true;
    body.partial_images = normalizeStreamPartialImages(advanced.streamPartialImages, 1);
  }
  return body;
}
function appendAdvancedToFormData(form, entry = currentEntryKey(), profile = imageProfile(), advancedOverride = null) {
  const advanced = effectiveAdvanced(entry, profile, advancedOverride);
  const provider = providerKey(profile);
  if (advanced.responseFormatB64Json && provider !== 'google' && provider !== 'xai') form.append('response_format', 'b64_json');
  if (advanced.streamImages && streamSupported(profile)) {
    form.append('stream', 'true');
    form.append('partial_images', String(normalizeStreamPartialImages(advanced.streamPartialImages, 1)));
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
  taskRecovery: { status: 'idle', retrying: false, error: '', detail: '' },
  imageUrls: new Map(),
  galleryPreviewUrls: new Map(),
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
  agentScrollStateByThread: initialStore.agentScrollStateByThread || {},
  agentScrollIntent: '',
  toastSeq: 0
};
persistedStoreBaseline = readPersistedStoreSnapshot();

function activeProfile() {
  return imageProfile();
}
function profileId(profile) {
  return profile?.id || profile?.name || '';
}
function profileSelectionKey(profile, profiles = state.profiles) {
  const id = String(profileId(profile) || '').trim();
  if (!id) return '';
  const candidates = Array.isArray(profiles) ? profiles.filter(Boolean) : [];
  if (candidates.filter((item) => String(profileId(item) || '').trim() === id).length <= 1) return id;
  const name = String(profile?.name || '').trim();
  if (!name) return id;
  const collisions = candidates.filter((item) => {
    return String(profileId(item) || '').trim() === name || String(item?.name || '').trim() === name;
  });
  return collisions.length === 1 ? name : id;
}
function findProfileBySelectionKey(profiles, value) {
  const key = String(value || '').trim();
  if (!key) return null;
  const candidates = Array.isArray(profiles) ? profiles.filter(Boolean) : [];
  const idMatches = candidates.filter((profile) => String(profileId(profile) || '').trim() === key);
  if (idMatches.length === 1) return idMatches[0];
  if (idMatches.length > 1) {
    return idMatches.find((profile) => String(profile.name || '').trim() === key) || idMatches[0];
  }
  return candidates.find((profile) => String(profile.name || '').trim() === key) || null;
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
  return findProfileBySelectionKey(candidates, state.activeImageProfileId) ||
    findProfileBySelectionKey(candidates, state.activeProfileId) ||
    candidates[0] ||
    fallbackImageProfile();
}
function findImageProfileById(id) {
  return findProfileBySelectionKey(imageProfiles(), id);
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
  return findImageProfileById(state.pro?.profileId) || imageProfile();
}
function agentTextProfile() {
  const cfg = state.agentConfig || {};
  const candidates = responseProfiles();
  const usable = candidates.filter(isAgentTextProfileUsable);
  if (cfg.mode === 'hybrid') return findProfileBySelectionKey(usable, cfg.textProfileId);
  return findProfileBySelectionKey(usable, state.activeProfileId) || usable[0] || null;
}
function configuredAgentTextProfile() {
  const cfg = state.agentConfig || {};
  const candidates = responseProfiles();
  if (cfg.mode === 'hybrid') return findProfileBySelectionKey(candidates, cfg.textProfileId);
  return findProfileBySelectionKey(candidates, state.activeProfileId) || candidates[0] || null;
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
  state.agent = migrateAgentThreads(state.agent, { interruptPending: false });
  const threads = projectThreads(projectId);
  if (threads.length) return activeAgentThread(projectId) || threads[0];
  const thread = makeAgentThread(projectId, { title: '主对话' });
  state.agent.threadsByProject[projectId] = [thread];
  state.agent.messagesByThread[thread.id] = [];
  state.agent.activeThreadIdByProject[projectId] = thread.id;
  return thread;
}
function isActiveAgentContext(projectId, threadId) {
  if (!projectId || !threadId) return false;
  return state.mode === 'agent'
    && state.agent.activeProjectId === projectId
    && activeAgentThreadId(projectId) === threadId;
}
function setActiveAgentThread(projectId, threadId) {
  if (!projectId || !threadId) return;
  if (state.mode === 'agent' && activeAgentThreadId(projectId) !== threadId) captureAgentScrollState();
  state.agent = migrateAgentThreads(state.agent, { interruptPending: false });
  if (!projectThreads(projectId).some((thread) => thread.id === threadId)) return;
  state.agent.activeThreadIdByProject[projectId] = threadId;
  state.agentScrollState = readActiveAgentScrollState();
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
    quality: normalizeImageQuality(settings?.quality),
    output_format: settings?.output_format || 'png',
    // Keep the legacy storage key, but treat its value as user-facing output quality.
    output_compression: outputQualityPercent(settings?.output_compression, 90),
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
    profileId: profileSelectionKey(profile),
    profileName: profile.name,
    model: profile.model,
    size: sizeSummary(profile, source),
    resolution: key === 'google' ? source.googleBaseResolution : key === 'xai' ? source.xaiResolution : source.openaiSize,
    aspectRatio: key === 'google' ? source.googleAspectRatio : key === 'xai' ? source.xaiAspectRatio : source.openaiAspectRatio,
    quality: source.quality,
    format: source.output_format,
    compression: source.output_compression,
    outputQuality: source.output_compression,
    outputCompression: outputCompressionFromQuality(source.output_compression),
    transparent: !!source.transparent_output,
    moderation: source.moderation,
    count: Number(source.n) || 1
  };
}
function normalizeRequestedParamsToComposerSettings(params = {}, baseSettings = state.settings) {
  const next = { ...settingsForSummary(baseSettings) };
  const provider = String(params.provider || providerKey(activeProfile()) || 'openai').toLowerCase();
  if (params.quality !== undefined && params.quality !== null && params.quality !== '') next.quality = normalizeImageQuality(params.quality);
  if (params.format !== undefined && params.format !== null && params.format !== '') next.output_format = params.format;
  if (params.compression !== undefined && params.compression !== null && params.compression !== '') next.output_compression = params.compression;
  if (params.transparent !== undefined) next.transparent_output = !!params.transparent;
  if (params.moderation !== undefined && params.moderation !== null && params.moderation !== '') next.moderation = params.moderation;
  if (params.count !== undefined && params.count !== null && params.count !== '') next.n = Math.max(1, Math.min(8, Number(params.count) || 1));
  if (provider === 'google') {
    if (params.resolution) next.googleBaseResolution = params.resolution;
    if (params.aspectRatio) next.googleAspectRatio = params.aspectRatio;
  } else if (provider === 'xai') {
    if (params.resolution) next.xaiResolution = params.resolution;
    if (params.aspectRatio) next.xaiAspectRatio = params.aspectRatio;
  } else {
    if (params.resolution) next.openaiSize = params.resolution;
    if (params.aspectRatio) next.openaiAspectRatio = params.aspectRatio;
  }
  return next;
}
async function restoreTaskToComposer(task, options = {}) {
  if (!task) return false;
  const mode = options.mode || 'reuse';
  const requested = task.requestedParams && typeof task.requestedParams === 'object' ? task.requestedParams : {};
  const profile = resolveTaskProfile(task);
  if (state.preferences?.reuseTaskApiProfileTemporarily && profile) {
    const id = profileSelectionKey(profile);
    state.activeImageProfileId = id;
    state.activeProfileId = id;
  }
  state.settings = normalizeRequestedParamsToComposerSettings(requested, state.settings);
  state.composerPrompt = task.prompt || '';
  state.references = await cloneReferenceSnapshots(taskReferenceSnapshots(task));
  state.mode = 'gallery';
  state.modal = null;
  writeComposerSessionSettings();
  if (mode === 'edit' && state.references.length) {
    openMaskEditor(state.references[0].id);
    persistRender();
    toast('已恢复原任务配置，并进入参考图编辑状态');
    return true;
  }
  persistRender();
  toast('已复用提示词和参数');
  return true;
}
function requestedParams(profile = activeProfile()) {
  return requestedParamsFromSettings(profile, state.settings);
}
function cloneGalleryImageSettingsForAgent() {
  return {
    ...settingsForSummary(state.settings),
    profileId: profileSelectionKey(imageProfile()),
    initializedFromGallery: true,
    initializedAt: Date.now()
  };
}
function initialAgentImageSettings() {
  const configuredProfile = state.agentConfig?.mode === 'hybrid'
    ? findImageProfileById(state.agentConfig?.imageProfileId)
    : null;
  if (!configuredProfile) return cloneGalleryImageSettingsForAgent();
  return {
    ...settingsForSummary(state.settings),
    profileId: profileSelectionKey(configuredProfile),
    initializedFromGallery: false,
    initializedFromAgentConfig: true,
    initializedAt: Date.now()
  };
}
function agentImageSettings() {
  state.agent = state.agent || {};
  const existing = state.agent.imageSettings && typeof state.agent.imageSettings === 'object' ? state.agent.imageSettings : null;
  if (!existing) {
    state.agent.imageSettings = initialAgentImageSettings();
    return state.agent.imageSettings;
  }
  state.agent.imageSettings = {
    ...settingsForSummary(existing),
    profileId: existing.profileId || state.agentConfig?.imageProfileId || profileSelectionKey(imageProfile()),
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
    { key: 'outputQuality', type: 'number', requested: firstDefined(requested.outputQuality, requested.output_quality, requested.compression, requested.output_compression), actual: firstDefined(returned.outputQuality, returned.output_quality, returned.compression) },
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
function mergeGenerationPartialErrors(partialErrors = [], transparentPostProcessError = '') {
  const merged = [...(Array.isArray(partialErrors) ? partialErrors : [])];
  if (transparentPostProcessError) {
    merged.push({
      summary: '透明背景后处理失败，已保留原图',
      detail: transparentPostProcessError,
      stage: 'transparent-postprocess'
    });
  }
  return merged;
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
    const stack = [{ value: obj, depth: 0 }];
    const seen = new Set();
    let scannedNodes = 0;
    while (stack.length && scannedNodes < 4096) {
      const entry = stack.pop();
      const current = entry?.value;
      const depth = Number(entry?.depth) || 0;
      if (!current || typeof current !== 'object' || depth > 12 || seen.has(current)) continue;
      seen.add(current);
      scannedNodes += 1;
      code = code || current.code || current.type || current.status || '';
      const message = current.message || current.error_description || current.error || current.detail || current.msg;
      if (typeof message === 'string' && message.trim() && message !== '[object Object]') return message;
      const values = Object.values(current);
      for (let index = values.length - 1; index >= 0; index -= 1) {
        const value = values[index];
        if (typeof value === 'string' && value.trim() && value !== '[object Object]') return value;
        if (value && typeof value === 'object') stack.push({ value, depth: depth + 1 });
      }
      if (message && typeof message === 'object') {
        stack.push({ value: message, depth: depth + 1 });
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
    else if (raw instanceof Error) {
      detail = JSON.stringify({
        name: raw.name,
        message: raw.message,
        code: raw.code,
        stage: raw.stage,
        status: raw.status,
        responseMode: raw.responseMode,
        detail: typeof raw.detail === 'string' ? raw.detail.slice(0, 4000) : undefined
      }, null, 2);
    } else {
      detail = JSON.stringify(summarizeResponse(raw), null, 2);
    }
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

function render(options = {}) {
  const scrolling = scrollInteractionActive();
  const galleryScroll = $('.gallery-scroll');
  const galleryVirtualBoundaryChanged = galleryScroll
    && ((galleryScroll.dataset.virtual === '1') !== (filteredTasks().length > GALLERY_VIRTUAL_THRESHOLD));
  if (scrolling && options.allowDuringScroll !== true && !userInteractionRenderAllowed && !galleryVirtualBoundaryChanged) {
    deferredRenderPending = true;
    scheduleDeferredRender();
    return false;
  }
  deferredRenderPending = false;
  const app = $('#app');
  if (!app) return;
  disconnectGalleryImageObservers();
  const galleryWasScrolling = galleryScrollActivity || galleryScroll?.classList?.contains('is-scrolling') === true;
  const promptRepoList = $('#promptList');
  const promptRepoWasScrolling = promptRepoScrollActivity || promptRepoList?.classList?.contains('is-scrolling') === true;
  const promptRepoScrollSnapshot = state.promptRepo?.open ? capturePromptRepoViewportSnapshot() : null;
  const workflowScrollSnapshot = captureWorkflowScrollState();
  cancelGalleryVirtualRender({ preserveActivity: galleryWasScrolling && state.mode === 'gallery' });
  cancelPromptRepoVirtualRender({ preserveActivity: promptRepoWasScrolling && state.promptRepo?.open === true });
  const previousModalKeys = visibleModalKeys();
  const nextModalKeys = stateModalKeys();
  const focusState = captureFocusState();
  const openingKey = nextModalKeys.find((key) => !previousModalKeys.includes(key));
  const closingKey = [...previousModalKeys].reverse().find((key) => !nextModalKeys.includes(key));
  if (openingKey && focusState) modalOpenerSnapshots.set(openingKey, focusState);
  const galleryScrollState = captureGalleryScrollState(document, { positionOnly: galleryWasScrolling });
  const existingAgentLog = $('.agent-log');
  if (existingAgentLog && state.mode === 'agent') {
    const nextAgentScrollKey = activeAgentScrollKey();
    if (lastRenderedAgentScrollKey === nextAgentScrollKey) {
      if (agentScrollActivity) captureAgentScrollState({ positionOnly: true });
      else captureAgentScrollState();
    } else {
      state.agentScrollState = readActiveAgentScrollState();
    }
    lastRenderedAgentScrollKey = nextAgentScrollKey;
  }
  const workspaceMode = state.mode === 'agent' ? 'is-agent' : state.mode === 'pro' ? 'is-pro' : state.mode === 'workflow' ? 'is-workflow' : 'is-gallery';
  app.innerHTML = `
    <div class="workspace ${workspaceMode}">
      ${renderSidebar()}
      <main class="main">
        ${state.mode === 'agent' ? renderAgentStage() : state.mode === 'pro' ? renderProWorkbench() : state.mode === 'workflow' ? renderWorkflowWorkspace(activeProject(), currentProjectWorkflowRuns()) : renderGalleryStage()}
        ${state.mode === 'agent' ? renderAgentComposer() : state.mode === 'gallery' ? renderGalleryComposer() : ''}
      </main>
    </div>
    <div class="toast-stack" id="toastStack" aria-live="polite" aria-atomic="false"></div>
    <div id="taskDetailMount">${state.modal ? renderDetailModal(state.modal) : ''}</div>
    ${state.viewer ? renderViewer(state.viewer) : ''}
    <div id="imageMenuMount" data-modal-inert-exempt></div>
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
  syncImageContextMenu();
  hydrateImages();
  warmTaskDetailImages();
  bindTransientEvents();
  syncModalAccessibility();
  const topDialog = topVisibleModal();
  if (topDialog) {
    if (!restoreFocusState(focusState, topDialog)) focusTopModal(topDialog);
  } else if (closingKey) {
    restoreModalOpener(closingKey);
  } else {
    restoreFocusState(focusState);
  }
  restoreGalleryScrollState(galleryScrollState, document, { exact: galleryWasScrolling });
  restoreAgentScrollState();
  const nextGalleryScroll = $('.gallery-scroll');
  if (galleryWasScrolling && state.mode === 'gallery' && nextGalleryScroll && isCurrentGalleryScroll(nextGalleryScroll)) {
    setGalleryScrollActivity(true);
    scheduleGalleryScrollRender();
  }
  const nextPromptRepoList = $('#promptList');
  if (promptRepoWasScrolling && state.promptRepo.open && nextPromptRepoList && isCurrentPromptRepoScroll(nextPromptRepoList)) {
    setPromptRepoScrollActivity(true);
    schedulePromptRepoScrollRender();
  }
  restorePromptRepoViewportSnapshot(promptRepoScrollSnapshot);
  restoreWorkflowScrollState(workflowScrollSnapshot);
  syncWorkspaceScrollActivity();
  releaseDeferredObjectUrls();
}
function nextRenderFrame(fn) {
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => setTimeout(callback, 0);
  raf(fn);
}
function requestRenderFrame(fn) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(fn);
  }
  return setTimeout(() => fn(Date.now()), 16);
}
function cancelRenderFrame(frameId) {
  if (!frameId) return;
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(frameId);
    return;
  }
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
    return;
  }
  clearTimeout(frameId);
}
function isScrollNodeConnected(node) {
  return !!node && node.isConnected !== false;
}
function isCurrentGalleryScroll(node, generation = galleryScrollGeneration) {
  return isScrollNodeConnected(node)
    && node === galleryScrollNode
    && Number(generation) === galleryScrollGeneration;
}
function isCurrentPromptRepoScroll(node, generation = promptRepoScrollGeneration) {
  return isScrollNodeConnected(node)
    && node === promptRepoScrollNode
    && Number(generation) === promptRepoScrollGeneration;
}
function adoptGalleryScrollNode(node) {
  if (!node) return 0;
  if (galleryScrollNode && galleryScrollNode !== node) cancelGalleryVirtualRender();
  if (galleryScrollNode !== node) {
    galleryScrollNode = node;
    galleryScrollGeneration += 1;
    galleryScrollActivity = false;
  }
  return galleryScrollGeneration;
}
function adoptPromptRepoScrollNode(node) {
  if (!node) return 0;
  if (promptRepoScrollNode && promptRepoScrollNode !== node) cancelPromptRepoVirtualRender();
  if (promptRepoScrollNode !== node) {
    promptRepoScrollNode = node;
    promptRepoScrollGeneration += 1;
    promptRepoScrollActivity = false;
  }
  return promptRepoScrollGeneration;
}
function scrollInteractionActive() {
  return galleryScrollActivity || promptRepoScrollActivity || agentScrollActivity || workflowScrollActivity;
}
function supportsNativeScrollEnd(node) {
  return !!node && ('onscrollend' in node || (typeof window !== 'undefined' && 'onscrollend' in window));
}
function bindScrollActivityPrimers(node, callback) {
  if (!node || typeof callback !== 'function' || node.dataset.scrollActivityPrimed === '1') return;
  node.dataset.scrollActivityPrimed = '1';
  node.addEventListener('wheel', callback, { passive: true });
  node.addEventListener('touchmove', callback, { passive: true });
  node.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) callback();
  }, { passive: true });
}
function scheduleDeferredRender() {
  if (!deferredRenderPending || deferredRenderFrame) return;
  deferredRenderFrame = requestRenderFrame(() => {
    deferredRenderFrame = 0;
    if (!deferredRenderPending || scrollInteractionActive()) return;
    render({ allowDuringScroll: true });
  });
}
function syncWorkspaceScrollActivity() {
  // 滚动状态只保留在实际滚动容器，避免工作区整树触发样式失效计算。
}
function markUserInteractionRender() {
  userInteractionRenderAllowed = true;
  queueMicrotask(() => { userInteractionRenderAllowed = false; });
}
function setScrollTopIfNeeded(node, value) {
  if (!node) return;
  const nextTop = Math.max(0, Number(value) || 0);
  if (Math.abs((Number(node.scrollTop) || 0) - nextTop) > 1) node.scrollTop = nextTop;
}
function captureFocusState() {
  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement) return null;
  const action = active.dataset?.action || '';
  const modalKey = active.closest?.('[data-modal-key]')?.dataset?.modalKey || '';
  const stableDataset = {};
  for (const key of ['id', 'index', 'field', 'scope', 'entry', 'type', 'value', 'mode', 'cat']) {
    if (active.dataset?.[key] !== undefined) stableDataset[key] = active.dataset[key];
  }
  const selector = focusStateSelector(active, action, stableDataset);
  const scope = modalKey ? document.querySelector(`[data-modal-key="${cssEscape(modalKey)}"]`) : document;
  const matches = selector ? $$(selector, scope || document) : [];
  const ordinal = matches.indexOf(active);
  return {
    id: active.id || '',
    tag: active.tagName || '',
    action,
    modalKey,
    selector,
    ordinal: ordinal >= 0 ? ordinal : 0,
    ariaLabel: active.getAttribute?.('aria-label') || '',
    value: typeof active.value === 'string' ? active.value : undefined,
    start: active.selectionStart,
    end: active.selectionEnd,
    scrollTop: active.scrollTop || 0
  };
}
function focusStateSelector(active, action, stableDataset = {}) {
  if (active.id) return `#${cssEscape(active.id)}`;
  if (action) {
    let selector = `[data-action="${cssEscape(action)}"]`;
    for (const [key, value] of Object.entries(stableDataset)) {
      selector += `[data-${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}="${cssEscape(value)}"]`;
    }
    return selector;
  }
  const modalKey = active.dataset?.modalKey;
  if (modalKey) return `[data-modal-key="${cssEscape(modalKey)}"]`;
  const ariaLabel = active.getAttribute?.('aria-label');
  if (ariaLabel && /^(BUTTON|A)$/.test(active.tagName || '')) return `${active.tagName.toLowerCase()}[aria-label="${cssEscape(ariaLabel)}"]`;
  return '';
}
function resolveFocusState(focusState, scope = document) {
  if (!focusState) return null;
  if (focusState.id) {
    const byId = document.getElementById(focusState.id);
    if (byId && (!scope || scope === document || scope.contains(byId) || scope === byId)) return byId;
  }
  if (!focusState.selector) return null;
  const matches = $$(focusState.selector, scope || document);
  return matches[focusState.ordinal] || matches[0] || null;
}
function restoreFocusState(focusState, scope = document) {
  const node = resolveFocusState(focusState, scope);
  if (!node) return false;
  node.focus({ preventScroll: true });
  if (typeof node.value === 'string') {
    const length = node.value.length;
    const start = Math.min(focusState.start ?? length, length);
    const end = Math.min(focusState.end ?? start, length);
    try { node.setSelectionRange(start, end); } catch {}
  }
  if (focusState.scrollTop) node.scrollTop = focusState.scrollTop;
  return document.activeElement === node;
}
function stateModalKeys() {
  const keys = [];
  if (state.modal) keys.push('task-detail');
  if (state.viewer) keys.push('gallery-viewer');
  if (state.promptRepo?.open) keys.push('prompt-repo');
  if (state.promptRepo?.detail) keys.push('prompt-detail');
  if (state.promptRepo?.imageViewer) keys.push('prompt-viewer');
  if (state.workflowDraft) keys.push('workflow-editor');
  if (state.workflowInvoke) keys.push('workflow-invoke');
  if (state.confirmDialog) keys.push('confirm-dialog');
  if (state.entryAdvancedModal) keys.push('entry-advanced');
  if (state.maskEditor) keys.push('mask-editor');
  return keys;
}
function visibleModalKeys() {
  return $$('[data-modal-key][role="dialog"][aria-modal="true"]')
    .filter((node) => node.getClientRects?.().length || node.offsetParent !== null)
    .map((node) => node.dataset.modalKey)
    .filter(Boolean);
}
function topVisibleModal() {
  const dialogs = $$('[role="dialog"][aria-modal="true"]')
    .filter((node) => (node.getClientRects?.().length || node.offsetParent !== null) && !node.hidden);
  return dialogs[dialogs.length - 1] || null;
}
function modalFocusableNodes(dialog = topVisibleModal()) {
  if (!dialog) return [];
  return $$(MODAL_FOCUSABLE_SELECTOR, dialog)
    .filter((node) => !node.disabled && !node.closest('[inert]') && (node.getClientRects?.().length || node.offsetParent !== null));
}
function focusTopModal(dialog = topVisibleModal()) {
  if (!dialog) return false;
  const target = $('[data-modal-autofocus]', dialog) || modalFocusableNodes(dialog)[0] || dialog;
  if (!target?.focus) return false;
  try { target.focus({ preventScroll: true }); } catch { target.focus(); }
  return dialog.contains(document.activeElement) || dialog === document.activeElement;
}
function setManagedInert(node) {
  if (!node || node.dataset.modalManagedInert === '1' || node.inert) return;
  node.dataset.modalManagedInert = '1';
  node.dataset.modalPreviousAriaHidden = node.getAttribute('aria-hidden') ?? '';
  node.inert = true;
  node.setAttribute('aria-hidden', 'true');
}
function clearManagedInert() {
  $$('[data-modal-managed-inert="1"]').forEach((node) => {
    node.inert = false;
    if (node.dataset.modalPreviousAriaHidden) node.setAttribute('aria-hidden', node.dataset.modalPreviousAriaHidden);
    else node.removeAttribute('aria-hidden');
    delete node.dataset.modalManagedInert;
    delete node.dataset.modalPreviousAriaHidden;
  });
}
function syncModalAccessibility() {
  clearManagedInert();
  const topDialog = topVisibleModal();
  if (!topDialog) return null;
  const app = $('#app');
  if (app) {
    [...app.children].forEach((child) => {
      if (child.matches?.('[data-modal-inert-exempt]')) return;
      if (child !== topDialog && !child.contains(topDialog)) setManagedInert(child);
    });
  }
  $$('[role="dialog"][aria-modal="true"]').forEach((dialog) => {
    if (dialog !== topDialog && !dialog.contains(topDialog)) setManagedInert(dialog);
  });
  if (!topDialog.contains(document.activeElement)) focusTopModal(topDialog);
  return topDialog;
}
function rememberModalOpener(key, node = document.activeElement) {
  const snapshot = captureFocusStateForNode(node);
  if (key && snapshot) modalOpenerSnapshots.set(key, snapshot);
}
function captureFocusStateForNode(node) {
  if (!node || node === document.body || node === document.documentElement) return null;
  const previous = document.activeElement;
  if (node !== previous && node.focus) {
    try { node.focus({ preventScroll: true }); } catch {}
  }
  const snapshot = captureFocusState();
  if (previous && previous !== node && previous.focus) {
    try { previous.focus({ preventScroll: true }); } catch {}
  }
  return snapshot;
}
function restoreModalOpener(key) {
  const snapshot = modalOpenerSnapshots.get(key);
  modalOpenerSnapshots.delete(key);
  const topDialog = syncModalAccessibility();
  if (topDialog) {
    if (!restoreFocusState(snapshot, topDialog)) focusTopModal(topDialog);
    return;
  }
  restoreFocusState(snapshot);
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
function activeAgentScrollKey(projectId = state.agent.activeProjectId, threadId = activeAgentThreadId(projectId)) {
  return projectId && threadId ? `${projectId}:${threadId}` : '';
}
function readActiveAgentScrollState() {
  const key = activeAgentScrollKey();
  const states = state.agentScrollStateByThread && typeof state.agentScrollStateByThread === 'object'
    ? state.agentScrollStateByThread
    : {};
  return states[key] || state.agentScrollState || { nearBottom: true, offsetFromBottom: 0 };
}
function writeActiveAgentScrollState(snapshot, key = activeAgentScrollKey()) {
  const next = snapshot && typeof snapshot === 'object' ? { ...snapshot } : { nearBottom: true, offsetFromBottom: 0 };
  state.agentScrollState = next;
  state.agentScrollStateByThread = state.agentScrollStateByThread && typeof state.agentScrollStateByThread === 'object'
    ? state.agentScrollStateByThread
    : {};
  if (key) state.agentScrollStateByThread[key] = next;
}
function captureAgentScrollState(options = {}) {
  const log = $('.agent-log');
  if (!log) return;
  if (options.positionOnly === true || agentScrollActivity) {
    const snapshot = { ...readActiveAgentScrollState(), scrollTop: Number(log.scrollTop) || 0 };
    writeActiveAgentScrollState(snapshot);
    return;
  }
  if (state.agentScrollLock?.anchor) {
    writeActiveAgentScrollState({
      nearBottom: false,
      offsetFromBottom: Math.max(0, log.scrollHeight - log.scrollTop - log.clientHeight),
      scrollTop: Number(log.scrollTop) || 0,
      anchor: state.agentScrollLock.anchor
    });
    return;
  }
  const offsetFromBottom = Math.max(0, log.scrollHeight - log.scrollTop - log.clientHeight);
  writeActiveAgentScrollState({
    nearBottom: offsetFromBottom <= 56,
    offsetFromBottom,
    scrollTop: log.scrollTop,
    anchor: captureAgentScrollAnchor(log)
  });
}
function finishAgentScroll(force = false) {
  clearTimeout(agentScrollIdleTimer);
  agentScrollIdleTimer = 0;
  const remaining = SCROLL_END_FALLBACK_DELAY - (Date.now() - agentScrollLastAt);
  if (!force && remaining > 0) {
    agentScrollIdleTimer = setTimeout(finishAgentScroll, remaining);
    return;
  }
  setAgentScrollActivity(false);
  captureAgentScrollState();
  if (deferredRenderPending) {
    scheduleDeferredRender();
    return;
  }
  scheduleAgentTaskCardSyncFrame();
  scheduleGalleryHydrationFlush();
  scheduleDeferredRender();
}
function scheduleAgentScrollStateCapture() {
  agentScrollLastAt = Date.now();
  setAgentScrollActivity(true);
  if (!agentScrollIdleTimer) agentScrollIdleTimer = setTimeout(finishAgentScroll, SCROLL_END_FALLBACK_DELAY);
}
function setAgentScrollActivity(active) {
  const next = !!active;
  const log = $('.agent-log');
  const classMismatch = log?.classList?.contains('is-scrolling') !== next;
  if (agentScrollActivity === next && !classMismatch) return;
  agentScrollActivity = next;
  if (log?.classList && log.classList.contains('is-scrolling') !== next) log.classList.toggle('is-scrolling', next);
  syncWorkspaceScrollActivity();
}
function restoreAgentScrollState() {
  const log = $('.agent-log');
  if (!log) return;
  const snapshot = readActiveAgentScrollState();
  const intent = state.agentScrollIntent || '';
  const restoreToken = ++agentScrollRestoreToken;
  const wasScrolling = agentScrollActivity;
  nextRenderFrame(() => {
    if (restoreToken !== agentScrollRestoreToken) return;
    if (wasScrolling) setScrollTopIfNeeded(log, Number(snapshot.scrollTop) || 0);
    else if (intent === 'force-bottom' || snapshot.nearBottom) setScrollTopIfNeeded(log, log.scrollHeight);
    else if (!restoreAgentScrollAnchor(log, snapshot.anchor)) setScrollTopIfNeeded(log, Math.max(0, log.scrollHeight - log.clientHeight - snapshot.offsetFromBottom));
    state.agentScrollIntent = '';
    if (state.agentScrollLock && !state.agentScrollLock.keep) state.agentScrollLock = null;
  });
}
function freezeAgentScrollForRender(anchor = captureAgentScrollAnchor()) {
  if (!anchor?.id) return null;
  state.agentScrollLock = { anchor, keep: true };
  writeActiveAgentScrollState({
    nearBottom: false,
    offsetFromBottom: 0,
    scrollTop: Number(anchor.scrollTop) || 0,
    anchor
  });
  return anchor;
}
function releaseAgentScrollFreezeAfterRender() {
  if (state.agentScrollLock) state.agentScrollLock.keep = false;
}
function preserveAgentScrollForRender(anchor = captureAgentScrollAnchor()) {
  const frozen = anchor?.id ? freezeAgentScrollForRender(anchor) : null;
  return () => {
    if (frozen?.id) releaseAgentScrollFreezeAfterRender();
  };
}
function renderPreservingAgentScroll(anchor = captureAgentScrollAnchor()) {
  const release = preserveAgentScrollForRender(anchor);
  render();
  release();
}
function shouldPreserveAgentScrollForTask(task) {
  const hasAgentContext = !!task?.agentProjectId || !!task?.agentThreadId;
  if (hasAgentContext && !isActiveAgentContext(task.agentProjectId, task.agentThreadId)) return false;
  return state.mode === 'agent' || !!task?.agentMessageId || String(task?.workflowMeta?.entry || '') === 'agent';
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
  setScrollTopIfNeeded(log, Math.max(0, (Number(log.scrollTop) || 0) + delta));
  return true;
}
function captureGalleryScrollState(root = document, options = {}) {
  const scroll = $('.gallery-scroll', root);
  if (!scroll) return null;
  if (options.positionOnly === true) {
    return {
      scrollTop: Number(scroll.scrollTop) || 0,
      scrollLeft: Number(scroll.scrollLeft) || 0
    };
  }
  return {
    scrollTop: Number(scroll.scrollTop) || 0,
    scrollLeft: Number(scroll.scrollLeft) || 0,
    scrollHeight: Number(scroll.scrollHeight) || 0,
    scrollWidth: Number(scroll.scrollWidth) || 0,
    clientHeight: Number(scroll.clientHeight) || 0,
    clientWidth: Number(scroll.clientWidth) || 0
  };
}
function restoreGalleryScrollState(snapshot, root = document, options = {}) {
  if (!snapshot) return;
  const restoreToken = ++galleryScrollRestoreToken;
  nextRenderFrame(() => {
    if (restoreToken !== galleryScrollRestoreToken) return;
    const scroll = $('.gallery-scroll', root);
    if (!scroll) return;
    if (options.exact === true) {
      setScrollTopIfNeeded(scroll, Number(snapshot.scrollTop) || 0);
      if (Math.abs((Number(scroll.scrollLeft) || 0) - Math.max(0, Number(snapshot.scrollLeft) || 0)) > 1) {
        scroll.scrollLeft = Math.max(0, Number(snapshot.scrollLeft) || 0);
      }
      return;
    }
    const maxTop = Math.max(0, (Number(scroll.scrollHeight) || 0) - (Number(scroll.clientHeight) || 0));
    const maxLeft = Math.max(0, (Number(scroll.scrollWidth) || 0) - (Number(scroll.clientWidth) || 0));
    setScrollTopIfNeeded(scroll, Math.min(Number(snapshot.scrollTop) || 0, maxTop));
    if (Math.abs((Number(scroll.scrollLeft) || 0) - Math.min(Number(snapshot.scrollLeft) || 0, maxLeft)) > 1) {
      scroll.scrollLeft = Math.min(Number(snapshot.scrollLeft) || 0, maxLeft);
    }
  });
}
function captureWorkflowScrollState(root = document) {
  const scroll = $('.workflow-manager-scroll', root);
  if (!scroll) return null;
  return {
    scrollTop: Number(scroll.scrollTop) || 0,
    scrollLeft: Number(scroll.scrollLeft) || 0
  };
}
function restoreWorkflowScrollState(snapshot, root = document) {
  if (!snapshot) return;
  const restoreToken = ++workflowScrollRestoreToken;
  nextRenderFrame(() => {
    if (restoreToken !== workflowScrollRestoreToken) return;
    const scroll = $('.workflow-manager-scroll', root);
    if (!scroll) return;
    const maxTop = Math.max(0, Number(scroll.scrollHeight) - Number(scroll.clientHeight));
    const maxLeft = Math.max(0, Number(scroll.scrollWidth) - Number(scroll.clientWidth));
    setScrollTopIfNeeded(scroll, Math.min(Number(snapshot.scrollTop) || 0, maxTop));
    if (Math.abs((Number(scroll.scrollLeft) || 0) - Math.min(Number(snapshot.scrollLeft) || 0, maxLeft)) > 1) {
      scroll.scrollLeft = Math.min(Number(snapshot.scrollLeft) || 0, maxLeft);
    }
  });
}
function setWorkflowScrollActivity(active) {
  const next = !!active;
  const scroll = $('.workflow-manager-scroll');
  const classMismatch = scroll?.classList?.contains('is-scrolling') !== next;
  if (workflowScrollActivity === next && !classMismatch) return;
  workflowScrollActivity = next;
  if (scroll?.classList && scroll.classList.contains('is-scrolling') !== next) scroll.classList.toggle('is-scrolling', next);
  syncWorkspaceScrollActivity();
}
function finishWorkflowScroll(force = false) {
  clearTimeout(workflowScrollIdleTimer);
  workflowScrollIdleTimer = 0;
  const remaining = SCROLL_END_FALLBACK_DELAY - (Date.now() - workflowScrollLastAt);
  if (!force && remaining > 0) {
    workflowScrollIdleTimer = setTimeout(finishWorkflowScroll, remaining);
    return;
  }
  setWorkflowScrollActivity(false);
  if (deferredRenderPending) {
    scheduleDeferredRender();
    return;
  }
  scheduleDeferredRender();
}
function scheduleWorkflowScrollCapture() {
  workflowScrollLastAt = Date.now();
  setWorkflowScrollActivity(true);
  if (!workflowScrollIdleTimer) workflowScrollIdleTimer = setTimeout(finishWorkflowScroll, SCROLL_END_FALLBACK_DELAY);
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
  const snapshots = Array.isArray(task?.referenceSnapshots) ? task.referenceSnapshots : [];
  const legacy = Array.isArray(task?.references) ? task.references : [];
  return sanitizeReferenceSnapshots(snapshots.length ? snapshots : legacy);
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
    : `质量${displayParamValue(firstDefined(req.outputQuality, req.output_quality, req.compression, req.output_compression, task.compression), '')}`;
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
function galleryColumnMetrics(width) {
  if (width <= 760) return { columns: 1, gap: 10 };
  if (width <= 1180) return { columns: 2, gap: 8 };
  return { columns: 3, gap: 8 };
}
function estimateGalleryCardHeight(viewportWidth, columns, gap) {
  const width = Math.max(320, Number(viewportWidth) || 1280);
  const columnCount = Math.max(1, Number(columns) || 1);
  const columnGap = Math.max(0, Number(gap) || 0);
  const contentWidth = Math.max(280, width - 16);
  const cardWidth = Math.max(180, (contentWidth - columnGap * (columnCount - 1)) / columnCount);
  const mediaHeight = cardWidth / 2;
  return Math.ceil(mediaHeight + GALLERY_CARD_BODY_HEIGHT + GALLERY_CARD_HEIGHT_SAFETY);
}
function measureGalleryMetrics(scroll = null) {
  const viewportWidth = Math.max(
    320,
    Number(scroll?.clientWidth)
      || Number(state.galleryVirtual?.viewportWidth)
      || (typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280)
  );
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth || viewportWidth : viewportWidth;
  const { columns, gap } = galleryColumnMetrics(screenWidth);
  return {
    viewportWidth,
    columns,
    gap,
    cardHeight: estimateGalleryCardHeight(viewportWidth, columns, gap)
  };
}
function galleryMetrics() {
  const mountedScroll = typeof document !== 'undefined' ? $('.gallery-scroll') : null;
  const cached = state.galleryVirtual || {};
  if ((galleryScrollActivity || mountedScroll?.classList?.contains('is-scrolling'))
    && Number(cached.viewportWidth) > 0
    && Number(cached.cardHeight) > 0
    && Number(cached.columns) > 0) {
    return {
      viewportWidth: Number(cached.viewportWidth),
      columns: Number(cached.columns),
      gap: Number(cached.gap) || 0,
      cardHeight: Number(cached.cardHeight)
    };
  }
  return measureGalleryMetrics(mountedScroll);
}
function galleryVirtualTuning(totalItems) {
  return Number(totalItems) > 60
    ? { bufferRows: 3, windowStepRows: 6 }
    : { bufferRows: 2, windowStepRows: 6 };
}
function syncGalleryLayoutMetrics(options = {}) {
  const scroll = $('.gallery-scroll');
  if (!scroll) return false;
  const next = measureGalleryMetrics(scroll);
  const previous = state.galleryVirtual || {};
  const changed = previous.viewportWidth !== next.viewportWidth
    || previous.cardHeight !== next.cardHeight
    || previous.columns !== next.columns
    || previous.gap !== next.gap;
  state.galleryVirtual = {
    ...previous,
    viewportWidth: next.viewportWidth,
    cardHeight: next.cardHeight,
    columns: next.columns,
    gap: next.gap
  };
  if (changed && options.render !== false && scroll.dataset.virtual === '1') {
    renderGalleryListOnly({ virtualScroll: true, layoutChanged: true, forceHydrate: true });
  }
  return changed;
}
function scheduleGalleryLayoutSync() {
  if (state.galleryVirtual?.layoutScheduled) return;
  state.galleryVirtual = { ...(state.galleryVirtual || {}), layoutScheduled: true };
  nextRenderFrame(() => {
    state.galleryVirtual = { ...(state.galleryVirtual || {}), layoutScheduled: false };
    syncGalleryLayoutMetrics();
  });
}
function galleryVirtualWindow(totalItems) {
  const metrics = galleryMetrics();
  const totalRows = Math.ceil(totalItems / metrics.columns);
  const pitch = metrics.cardHeight + metrics.gap;
  const viewportHeight = Math.max(320, Number(state.galleryVirtual?.viewportHeight) || 720);
  const rawScrollTop = Math.max(0, Number(state.galleryVirtual?.scrollTop) || 0);
  const shouldVirtualize = totalItems > GALLERY_VIRTUAL_THRESHOLD;
  if (!shouldVirtualize) {
    return { ...metrics, shouldVirtualize, startIndex: 0, endIndex: totalItems, topPad: 0, bottomPad: 0, totalRows };
  }
  const maxScrollTop = Math.max(0, totalRows * pitch - viewportHeight);
  const scrollTop = Math.min(rawScrollTop, maxScrollTop);
  const tuning = galleryVirtualTuning(totalItems);
  const bufferedRow = Math.max(0, Math.floor(scrollTop / pitch) - tuning.bufferRows);
  const startRow = Math.floor(bufferedRow / tuning.windowStepRows) * tuning.windowStepRows;
  const visibleRows = Math.ceil(viewportHeight / pitch) + tuning.bufferRows * 2;
  const endRow = Math.min(totalRows, startRow + visibleRows + tuning.bufferRows);
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
function galleryVirtualRangeChanged(windowState, virtualState = state.galleryVirtual) {
  return virtualState?.renderedStartIndex !== windowState.startIndex
    || virtualState?.renderedEndIndex !== windowState.endIndex;
}
function galleryFilteredTaskCount() {
  const cached = Number(state.galleryVirtual?.filteredTaskCount);
  return Number.isFinite(cached) && cached >= 0 ? cached : filteredTasks().length;
}
function galleryVirtualWindowRefreshMode(totalItems = galleryFilteredTaskCount()) {
  const virtualState = state.galleryVirtual || {};
  if (totalItems <= GALLERY_VIRTUAL_THRESHOLD) return { needed: false, immediate: false };
  const metrics = galleryMetrics();
  const pitch = Math.max(1, metrics.cardHeight + metrics.gap);
  const columns = Math.max(1, metrics.columns);
  const totalRows = Math.ceil(totalItems / columns);
  const startRow = Math.max(0, Math.floor(Number(virtualState.renderedStartIndex || 0) / columns));
  const endRow = Math.min(totalRows, Math.ceil(Number(virtualState.renderedEndIndex || 0) / columns));
  const scrollTop = Math.max(0, Number(virtualState.scrollTop) || 0);
  const viewportHeight = Math.max(320, Number(virtualState.viewportHeight) || 720);
  const tuning = galleryVirtualTuning(totalItems);
  const safetyRows = Math.max(2, Math.floor(tuning.bufferRows / 2));
  const topDistance = Math.max(0, startRow * pitch - scrollTop);
  const bottomDistance = Math.max(0, scrollTop + viewportHeight - endRow * pitch);
  const outside = topDistance > 0 || bottomDistance > 0;
  const nearStart = startRow > 0 && scrollTop < (startRow + safetyRows) * pitch;
  const nearEnd = endRow < totalRows && scrollTop + viewportHeight > Math.max(0, endRow - safetyRows) * pitch;
  const largeJump = galleryScrollDelta > viewportHeight * 1.5;
  const immediate = largeJump || outside;
  return { needed: outside || nearStart || nearEnd, immediate };
}
function galleryVirtualWindowNeedsRefresh(totalItems = galleryFilteredTaskCount()) {
  return galleryVirtualWindowRefreshMode(totalItems).needed;
}
function galleryVirtualWindowNeedsImmediateRefresh(totalItems = galleryFilteredTaskCount()) {
  return galleryVirtualWindowRefreshMode(totalItems).immediate;
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

function galleryVirtualClass(windowState) {
  if (!windowState?.shouldVirtualize) return '';
  return 'is-virtual';
}

function renderGalleryStage() {
  const tasks = filteredTasks();
  const hasSelection = state.selectedTaskIds.length > 0;
  const windowState = galleryVirtualWindow(tasks.length);
  const visibleTasks = tasks.slice(windowState.startIndex, windowState.endIndex);
  state.galleryVirtual = {
    ...(state.galleryVirtual || {}),
    filteredTaskCount: tasks.length,
    renderedStartIndex: windowState.startIndex,
    renderedEndIndex: windowState.endIndex
  };
  return `
    <section class="gallery-stage">
      <div class="asset-toolbar">
        <label class="search-box" aria-label="搜索画廊">
          <span class="search-box-prefix" aria-hidden="true">搜索</span>
          <input value="${esc(state.promptQuery || '')}" placeholder="按提示词、模型、尺寸、标签搜索..." data-action="search-gallery" autocomplete="off" spellcheck="false">
        </label>
        ${renderBatchActions(hasSelection)}
      </div>
      ${renderTaskRecoveryNotice()}
      <div class="gallery-scroll" data-virtual="${windowState.shouldVirtualize ? '1' : '0'}">
        ${tasks.length ? `
          <div class="gallery-spacer" style="height:${esc(windowState.topPad)}px"></div>
          <div class="gallery-grid ${galleryVirtualClass(windowState)}" style="--gallery-card-height:${esc(windowState.cardHeight)}px">${visibleTasks.map(renderAssetCard).join('')}</div>
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
function renderGalleryListOnly(options = {}) {
  const scroll = $('.gallery-scroll');
  if (!scroll) return render();
  if (!state.galleryVirtual) state.galleryVirtual = {};
  const isScrolling = scroll.classList.contains('is-scrolling');
  const forceHydrate = options.allowDuringScroll !== true
    && (galleryVirtualHydratePending || options.forceHydrate === true);
  if (isScrolling || galleryScrollActivity) galleryVirtualHydratePending = true;
  const galleryScrollState = isScrolling || options.virtualScroll
    ? { scrollTop: Number(scroll.scrollTop) || 0, scrollLeft: Number(scroll.scrollLeft) || 0 }
    : captureGalleryScrollState();
  state.galleryVirtual = {
    ...(state.galleryVirtual || {}),
    scrollTop: galleryScrollState?.scrollTop ?? state.galleryVirtual?.scrollTop ?? 0,
    viewportHeight: scroll.clientHeight || state.galleryVirtual?.viewportHeight || 720,
    viewportWidth: scroll.clientWidth || state.galleryVirtual?.viewportWidth || 0
  };
  if ((galleryScrollActivity || isScrolling) && options.virtualScroll === true && options.allowDuringScroll !== true) {
    galleryVirtualHydratePending = true;
    return false;
  }
  const tasks = filteredTasks();
  state.galleryVirtual.filteredTaskCount = tasks.length;
  if (options.virtualScroll === true && isScrolling && !galleryVirtualWindowNeedsRefresh(tasks.length)) {
    return false;
  }
  const windowState = galleryVirtualWindow(tasks.length);
  const isVirtualUpdate = options.virtualScroll === true
    || options.layoutChanged === true
    || (scroll.dataset.virtual === '1' && windowState.shouldVirtualize);
  if ((options.virtualScroll === true || options.layoutChanged === true) && !galleryVirtualRangeChanged(windowState)) {
    if (options.forceHydrate) void hydrateImages({ galleryOnly: true });
    if (options.layoutChanged !== true) return false;
  }
  const visibleTasks = tasks.slice(windowState.startIndex, windowState.endIndex);
  state.galleryVirtual = {
    ...(state.galleryVirtual || {}),
    renderedStartIndex: windowState.startIndex,
    renderedEndIndex: windowState.endIndex
  };
  scroll.dataset.virtual = windowState.shouldVirtualize ? '1' : '0';
  const patched = windowState.shouldVirtualize
    && isVirtualUpdate
    ? patchGalleryVirtualDom(scroll, visibleTasks, windowState)
    : false;
  if (!patched) {
    $$('.asset-card', scroll).forEach((card) => releaseGalleryImageWork(card));
    disconnectGalleryImageObservers();
    scroll.innerHTML = tasks.length
      ? `<div class="gallery-spacer" style="height:${esc(windowState.topPad)}px"></div><div class="gallery-grid ${galleryVirtualClass(windowState)}" style="--gallery-card-height:${esc(windowState.cardHeight)}px">${visibleTasks.map(renderAssetCard).join('')}</div><div class="gallery-spacer" style="height:${esc(windowState.bottomPad)}px"></div>`
      : `<div class="empty-state"><div><strong>没有匹配的任务</strong><span>换一个关键词，或清空搜索查看全部画廊资产。</span></div></div>`;
  }
  void hydrateImages({
    galleryOnly: true,
    skipReferenceImages: (options.virtualScroll === true || options.layoutChanged === true || scroll.classList.contains('is-scrolling'))
      && !forceHydrate
  });
  if (!isVirtualUpdate) {
    restoreGalleryScrollState(galleryScrollState);
  }
  return true;
}
function createElementFromHtml(html) {
  if (typeof document === 'undefined') return null;
  const template = document.createElement('template');
  template.innerHTML = String(html || '').trim();
  return template.content.firstElementChild;
}
function patchGalleryVirtualDom(scroll, visibleTasks, windowState) {
  const grid = $('.gallery-grid', scroll);
  const spacers = $$('.gallery-spacer', scroll);
  if (!grid || spacers.length < 2) return false;
  const currentCards = new Map($$('.asset-card', grid).map((card) => [String(card.dataset.taskId || ''), card]));
  const desiredCards = [];
  for (const task of visibleTasks) {
    const id = String(task.id);
    let card = currentCards.get(id);
    const signature = assetCardSignature(task);
    if (card && card.dataset.cardSignature !== signature) {
      const nextCard = createElementFromHtml(renderAssetCard(task));
      if (nextCard) {
        releaseGalleryImageWork(card);
        $$('.asset-media img', card).forEach(unobserveGalleryImage);
        card.replaceWith(nextCard);
        card = nextCard;
      }
    }
    if (!card) card = createElementFromHtml(renderAssetCard(task));
    if (!card) continue;
    card.classList.toggle('selected', state.selectedTaskIds.includes(task.id));
    desiredCards.push(card);
  }
  const desiredSet = new Set(desiredCards);
  for (const card of currentCards.values()) {
    if (desiredSet.has(card)) continue;
    releaseGalleryImageWork(card);
    $$('.asset-media img', card).forEach(unobserveGalleryImage);
    card.remove();
  }
  const currentOrder = [...grid.children];
  const needsReorder = desiredCards.length !== currentOrder.length
    || desiredCards.some((card, index) => card !== currentOrder[index]);
  if (needsReorder) {
    const fragment = grid.ownerDocument?.createDocumentFragment?.();
    if (fragment) {
      desiredCards.forEach((card) => fragment.appendChild(card));
      grid.appendChild(fragment);
    } else {
      let cursor = grid.firstElementChild;
      for (const card of desiredCards) {
        if (card !== cursor) grid.insertBefore(card, cursor);
        cursor = card.nextElementSibling;
      }
    }
  }
  spacers[0].style.height = `${windowState.topPad}px`;
  spacers[1].style.height = `${windowState.bottomPad}px`;
  grid.className = `gallery-grid ${galleryVirtualClass(windowState)}`;
  grid.style.setProperty('--gallery-card-height', `${windowState.cardHeight}px`);
  return true;
}
function cancelGalleryVirtualRender(options = {}) {
  const preservePending = options.preserveActivity === true;
  const scroll = galleryScrollNode || $('.gallery-scroll');
  cancelRenderFrame(galleryTaskCardSyncFrame);
  galleryTaskCardSyncFrame = 0;
  galleryTaskCardSyncQueue.clear();
  galleryVirtualRenderToken += 1;
  clearTimeout(galleryVirtualRenderTimer);
  cancelRenderFrame(galleryVirtualRenderFrame);
  clearTimeout(galleryScrollIdleTimer);
  galleryVirtualRenderTimer = 0;
  galleryVirtualRenderFrame = 0;
  galleryScrollIdleTimer = 0;
  galleryScrollIdleNode = null;
  galleryScrollIdleGeneration = 0;
  galleryScrollDelta = 0;
  if (!preservePending) galleryVirtualHydratePending = false;
  galleryScrollGeneration += 1;
  galleryScrollNode = null;
  galleryScrollActivity = false;
  scroll?.classList?.remove('is-scrolling');
  syncWorkspaceScrollActivity();
  state.galleryVirtual = { ...(state.galleryVirtual || {}), scheduled: false };
}
function scheduleGalleryVirtualRender(options = {}) {
  if (options.forceHydrate === true) galleryVirtualHydratePending = true;
  const delay = Math.max(0, Number(options.delay) || 0);
  if (state.galleryVirtual?.scheduled) {
    if (delay > 0 || !galleryVirtualRenderTimer) return;
    clearTimeout(galleryVirtualRenderTimer);
    galleryVirtualRenderTimer = 0;
    galleryVirtualRenderToken += 1;
    state.galleryVirtual = { ...(state.galleryVirtual || {}), scheduled: false };
  }
  state.galleryVirtual = { ...(state.galleryVirtual || {}), scheduled: true };
  const token = ++galleryVirtualRenderToken;
  const allowDuringScroll = options.allowDuringScroll === true || options.lightweightDuringScroll === true;
  const scrollNode = options.node || (options.allowDuringScroll === true ? galleryScrollNode : null);
  const scrollGeneration = options.generation === undefined
    ? (scrollNode ? galleryScrollGeneration : null)
    : Number(options.generation);
  const isValidScrollRun = () => !scrollNode || isCurrentGalleryScroll(scrollNode, scrollGeneration);
  const run = () => {
    if (token !== galleryVirtualRenderToken || !isValidScrollRun()) return;
    galleryVirtualRenderTimer = 0;
    galleryVirtualRenderFrame = 0;
    state.galleryVirtual = { ...(state.galleryVirtual || {}), scheduled: false };
    const forceHydrate = galleryVirtualHydratePending || options.forceHydrate === true;
    galleryVirtualHydratePending = false;
    if (forceHydrate) renderGalleryListOnly({ virtualScroll: true, forceHydrate, allowDuringScroll });
    else renderGalleryListOnly({ virtualScroll: true, allowDuringScroll });
  };
  const enqueue = () => {
    if (token !== galleryVirtualRenderToken || !isValidScrollRun()) return;
    galleryVirtualRenderFrame = requestRenderFrame(run);
  };
  if (delay > 0) {
    galleryVirtualRenderTimer = setTimeout(() => {
      galleryVirtualRenderTimer = 0;
      enqueue();
    }, delay);
  } else {
    enqueue();
  }
}
function setGalleryScrollActivity(active, node = $('.gallery-scroll'), generation = galleryScrollGeneration) {
  if (!state.galleryVirtual) state.galleryVirtual = {};
  const scroll = node;
  const next = !!active;
  if (next && scroll && !isCurrentGalleryScroll(scroll, generation)) return false;
  const classMismatch = scroll?.classList?.contains('is-scrolling') !== next;
  if (galleryScrollActivity === next && !classMismatch) return true;
  galleryScrollActivity = next;
  if (scroll?.classList && scroll.classList.contains('is-scrolling') !== next) scroll.classList.toggle('is-scrolling', next);
  syncWorkspaceScrollActivity();
  return true;
}
function syncGalleryScrollPosition() {
  const scroll = $('.gallery-scroll');
  if (!scroll || !state.galleryVirtual) return;
  const nextScrollTop = Number(scroll.scrollTop) || 0;
  galleryScrollDelta = Math.abs(nextScrollTop - (Number(state.galleryVirtual.scrollTop) || 0));
  state.galleryVirtual.scrollTop = nextScrollTop;
  state.galleryVirtual.viewportHeight = scroll.clientHeight || state.galleryVirtual.viewportHeight || 720;
  state.galleryVirtual.viewportWidth = scroll.clientWidth || state.galleryVirtual.viewportWidth || 0;
}
function inspectGalleryScrollPosition() {
  const currentScroll = $('.gallery-scroll');
  if (!isCurrentGalleryScroll(currentScroll)) return { needed: false, immediate: false };
  if (currentScroll.dataset.virtual !== '1') return { needed: false, immediate: false };
  const refreshMode = galleryVirtualWindowRefreshMode();
  if (!refreshMode.needed) return refreshMode;
  galleryVirtualHydratePending = true;
  scheduleGalleryVirtualRender({ allowDuringScroll: true, immediate: refreshMode.immediate });
  return refreshMode;
}
function finishGalleryScroll(force = false, node = galleryScrollIdleNode || galleryScrollNode, generation = galleryScrollIdleGeneration || galleryScrollGeneration) {
  if (!isCurrentGalleryScroll(node, generation)) return;
  clearTimeout(galleryScrollIdleTimer);
  galleryScrollIdleTimer = 0;
  const remaining = SCROLL_END_FALLBACK_DELAY - (Date.now() - galleryScrollLastAt);
  if (!force && remaining > 0) {
    galleryScrollIdleNode = node;
    galleryScrollIdleGeneration = generation;
    galleryScrollIdleTimer = setTimeout(finishGalleryScroll, remaining);
    return;
  }
  syncGalleryScrollPosition();
  inspectGalleryScrollPosition();
  galleryHydrationDeferUntil = Date.now();
  setGalleryScrollActivity(false);
  galleryScrollIdleNode = null;
  galleryScrollIdleGeneration = 0;
  if (deferredRenderPending) {
    scheduleDeferredRender();
    galleryScrollDelta = 0;
    return;
  }
  const currentScroll = $('.gallery-scroll');
  if (currentScroll?.dataset.virtual === '1') {
    scheduleGalleryVirtualRender({ forceHydrate: true, node, generation });
  }
  galleryScrollDelta = 0;
  scheduleGalleryHydrationFlush();
  scheduleGalleryTaskCardSyncFrame();
  scheduleDeferredRender();
}
function finishGalleryScrollForNode(force, node, generation) {
  return finishGalleryScroll(force, node, generation);
}
function scheduleGalleryScrollRender() {
  const options = arguments[0] || {};
  galleryScrollLastAt = Date.now();
  const scroll = options.node || $('.gallery-scroll');
  const generation = options.generation === undefined ? galleryScrollGeneration : Number(options.generation);
  if (!isCurrentGalleryScroll(scroll, generation)) return;
  syncGalleryScrollPosition();
  setGalleryScrollActivity(true);
  inspectGalleryScrollPosition();
  galleryScrollIdleNode = scroll;
  galleryScrollIdleGeneration = generation;
  if (!galleryScrollIdleTimer) galleryScrollIdleTimer = setTimeout(finishGalleryScroll, SCROLL_END_FALLBACK_DELAY);
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
        ${image ? `<img data-blob-id="${esc(image.blobId || '')}" data-remote-url="${esc(storedImageSource(image))}" alt="">` : '<div class="progress-ring"></div>'}
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
  const signature = `${state.tasks.length}:${state.tasks[0]?.id || ''}:${state.tasks[0]?.status || ''}:${state.tasks.at(-1)?.id || ''}`;
  if (filteredTasksCache?.source === state.tasks && filteredTasksCache.query === q && filteredTasksCache.signature === signature) {
    return filteredTasksCache.items;
  }
  const tasks = [...state.tasks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const items = !q ? tasks : tasks.filter((task) => {
    const hay = [task.prompt, task.returnedPrompt, task.model, task.profileName, task.status, task.sizeLabel, task.quality, task.tags, task.note, task.workflowName, task.batchLabel, task.workflowId, task.workflowRunId].join(' ').toLowerCase();
    return hay.includes(q);
  });
  filteredTasksCache = { source: state.tasks, query: q, signature, items };
  return items;
}
function renderTaskStreamPreviewImage(task, outputIndex = 0, extra = '') {
  const preview = taskStreamPreviewRecord(task, outputIndex);
  if (!preview) return '';
  const common = `data-image-kind="stream-preview" data-task-id="${esc(task.id)}" data-stream-output-index="${esc(outputIndex)}"`;
  if (preview.url) return `<img ${common} src="${esc(preview.url)}" class="${esc(extra)}" alt="流式预览" decoding="async">`;
  return `<img ${common} data-blob-id="${esc(preview.blobId || '')}" class="${esc(extra)}" alt="流式预览" decoding="async">`;
}
function cachedTaskImageSource(image, preference = 'preview') {
  const blobId = String(image?.blobId || '');
  if (!blobId) return '';
  const sources = preference === 'full'
    ? [state.imageUrls, state.galleryPreviewUrls]
    : [state.galleryPreviewUrls, state.imageUrls];
  for (const source of sources) {
    const url = touchObjectUrl(source, blobId);
    if (url) return url;
  }
  return '';
}
function cachedTaskImageSrcAttribute(image, preference = 'preview') {
  const source = cachedTaskImageSource(image, preference);
  return source ? ` src="${esc(source)}"` : '';
}
function renderAssetCard(task) {
  const image = (task.images || [])[0];
  const streamPreviewHtml = renderTaskStreamPreviewImage(task, 0);
  const selected = state.selectedTaskIds.includes(task.id);
  const countInfo = taskCountInfo(task);
  const summary = cardParamSummary(task);
  const insights = cardInsightSummary(task, countInfo);
  const failed = task.status === 'error' || task.status === 'interrupted';
  const placeholder = failed
    ? `<div class="asset-placeholder asset-failed"><strong>${task.status === 'interrupted' ? '已中断' : '生成失败'}</strong><span>${esc(taskErrorSummary(task))}</span><button data-action="retry-task" data-id="${esc(task.id)}">重试</button></div>`
    : `<div class="asset-placeholder"><div class="progress-ring"></div></div>`;
  return `
    <article class="asset-card ${selected ? 'selected' : ''}" data-task-id="${esc(task.id)}" data-card-signature="${esc(assetCardSignature(task))}">
      <button class="asset-check" title="选择" data-action="toggle-select" data-id="${esc(task.id)}"></button>
      <div class="asset-media" data-action="open-detail" data-id="${esc(task.id)}">
        ${image ? `<img data-image-kind="task-image" data-gallery-preview="1" data-task-id="${esc(task.id)}" data-index="0" data-blob-id="${esc(image.blobId || '')}" data-remote-url="${esc(storedImageSource(image))}"${cachedTaskImageSrcAttribute(image)} loading="lazy" decoding="async" fetchpriority="low" alt="">` : streamPreviewHtml || placeholder}
        ${!image && streamPreviewHtml ? '<span class="stream-preview-badge">预览</span>' : ''}
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
function assetCardSignature(task) {
  const images = (task?.images || [])
    .map((image) => `${image?.blobId || ''}:${image?.url || image?.remoteUrl || ''}`)
    .join(',');
  const preview = taskStreamPreviewRecord(task, 0);
  const countInfo = taskCountInfo(task);
  return [
    task?.prompt || '',
    task?.status || '',
    task?.error || '',
    task?.finishedAt || '',
    task?.actualCount || '',
    task?.expectedCount || '',
    task?.failedCount || '',
    task?.streamState || '',
    task?.lastStreamEventType || '',
    preview?.blobId || '',
    preview?.url || '',
    preview?.partialIndex || '',
    images,
    countInfo.label,
    cardParamSummary(task).join('|'),
    cardInsightSummary(task, countInfo).join('|'),
    state.favorites[task?.id] ? 'favorite' : ''
  ].join('|');
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
          <button class="control-chip" data-action="open-popover" data-popover="compression" title="${state.settings.output_format === 'png' ? '透明背景' : '100 为最高质量、最低压缩'}"><small>${state.settings.output_format === 'png' ? '透明背景' : '输出质量'}</small>${esc(state.settings.output_format === 'png' ? (state.settings.transparent_output ? '是' : '否') : state.settings.output_compression)}</button>
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
  const current = findProfileBySelectionKey(profiles, activeId) || profiles[0] || null;
  return `<label class="profile-select-pill"><small>渲染模型</small><select data-action="entry-profile-select" data-entry="${esc(entry)}">${profiles.map((profile) => `<option value="${esc(profileSelectionKey(profile))}" ${profile === current ? 'selected' : ''}>${esc(profile.name || profileId(profile))}</option>`).join('')}</select></label>`;
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
      <div class="entry-advanced-modal" role="dialog" aria-modal="true" aria-labelledby="entryAdvancedTitle" tabindex="-1" data-modal-key="entry-advanced" data-stop>
        <button class="modal-close" aria-label="关闭高级配置" data-modal-autofocus data-action="close-entry-advanced">×</button>
        <div class="entry-advanced-head">
          <div>
            <h2 id="entryAdvancedTitle">${esc(title)}</h2>
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
      <button class="control-chip" data-action="open-popover" data-popover="compression" title="${state.settings.output_format === 'png' ? '透明背景' : '100 为最高质量、最低压缩'}"><small>${state.settings.output_format === 'png' ? '透明背景' : '输出质量'}</small>${esc(state.settings.output_format === 'png' ? (state.settings.transparent_output ? '是' : '否') : state.settings.output_compression)}</button>
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
  const visibleLimit = Math.max(AGENT_RENDER_MESSAGE_LIMIT, Number(state.agent.visibleMessageLimitByThread?.[threadId]) || AGENT_RENDER_MESSAGE_LIMIT);
  const visibleMessages = messages.slice(-visibleLimit);
  const hiddenMessageCount = Math.max(0, messages.length - visibleMessages.length);
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
        ${messages.length ? `<div class="agent-conversation">${hiddenMessageCount ? `<button class="agent-history-window-note" data-action="agent-load-earlier" data-thread-id="${esc(threadId)}">加载更早 ${Math.min(AGENT_RENDER_MESSAGE_LIMIT, hiddenMessageCount)} 条 · 尚有 ${hiddenMessageCount} 条</button>` : ''}${visibleMessages.map(renderAgentMessage).join('')}</div>` : ''}
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
  const workflowProfile = imageProfile();
  const workflowAdvanced = effectiveAdvanced('workflow', workflowProfile);
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
          <button class="control-icon control-advanced workflow-advanced-trigger" data-action="open-entry-advanced" data-entry="workflow" title="工作流高级配置" aria-label="工作流高级配置">⚙</button>
          <button class="toolbar-button" data-action="agent-workflow">AI 创建</button>
          <button class="toolbar-button" data-action="new-series-workflow">新建多图</button>
          <button class="generate-button compact" data-action="new-workflow-draft">新建工作流</button>
        </div>
      </div>
      <div class="workflow-advanced-summary">高级 · b64 ${workflowAdvanced.responseFormatB64Json ? '开' : '关'} · 流式 ${workflowAdvanced.streamImages && streamSupported(workflowProfile) ? '开' : '关'} · ${esc(workflowAdvanced.timeout)}s</div>
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
    <button class="control-chip" data-action="open-agent-popover" data-popover="agent-compression" title="${format === 'png' ? '透明背景' : '100 为最高质量、最低压缩'}"><small>${format === 'png' ? '透明' : '输出质量'}</small>${esc(format === 'png' ? transparent : settings.output_compression)}</button>
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
  const persisted = persistRender();
  if (item?.blobId) {
    if (persisted === true) await deleteUnreferencedBlobIds([item.blobId]);
    else queuePendingBlobRelease([item.blobId], false);
  }
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
  ensureAgentProjectThread(projectId);
  const thread = activeAgentThread(projectId);
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
  const configSource = (state.agentConfig?.mode || 'off') === 'hybrid'
    ? `hybrid.agentTextProfileId (${state.agentConfig?.textProfileId || '未设置'})`
    : `activeProfileId (${state.activeProfileId || '未设置'})`;
  const profileLabel = textProfile ? (textProfile.name || profileId(textProfile) || '未命名') : '未选择';
  const rows = [
    `文本模型配置：${profileLabel} / ${profileId(textProfile) || '未选择'}`,
    `模型 slug：${textProfile?.model || '未知'}`,
    `配置来源：${configSource}`,
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
  const nextAgent = migrateAgentThreads(JSON.parse(JSON.stringify(agentState || {})), { interruptPending: false });
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
  nextAgent.messagesByThread[branch.id] = compactAgentThreadMessages(
    sourceMessages.slice(0, pivotIndex + 1).map((message) => normalizeAgentMessage({ ...message }, branch.id, projectId))
  );
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
  if (useGlobal && state.mode === 'agent') captureAgentScrollState();
  const agentState = useGlobal ? state.agent : agentStateOrProjectId;
  const projectId = useGlobal ? agentStateOrProjectId : projectIdOrTitle;
  const title = useGlobal ? projectIdOrTitle : maybeTitle;
  const nextAgent = migrateAgentThreads(JSON.parse(JSON.stringify(agentState || {})), { interruptPending: false });
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
  const nextAgent = migrateAgentThreads(JSON.parse(JSON.stringify(agentState || {})), { interruptPending: false });
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
  const nextAgent = migrateAgentThreads(JSON.parse(JSON.stringify(agentState || {})), { interruptPending: false });
  nextAgent.messagesByThread[threadId] = [];
  for (const projectThreads of Object.values(nextAgent.threadsByProject || {})) {
    const thread = (projectThreads || []).find((item) => item.id === threadId);
    if (thread) thread.updatedAt = Date.now();
  }
  return nextAgent;
}
function loadEarlierAgentMessages(threadId = activeAgentThreadId()) {
  const messages = Array.isArray(state.agent?.messagesByThread?.[threadId]) ? state.agent.messagesByThread[threadId] : [];
  if (!messages.length) return;
  const currentLimit = Math.max(AGENT_RENDER_MESSAGE_LIMIT, Number(state.agent.visibleMessageLimitByThread?.[threadId]) || AGENT_RENDER_MESSAGE_LIMIT);
  const oldFirst = messages.slice(-currentLimit)[0];
  const oldNode = oldFirst ? $(`.agent-message[data-agent-message-id="${cssEscape(oldFirst.id)}"]`) : null;
  const oldTop = oldNode?.getBoundingClientRect?.().top;
  state.agent.visibleMessageLimitByThread = {
    ...(state.agent.visibleMessageLimitByThread || {}),
    [threadId]: Math.min(messages.length, currentLimit + AGENT_RENDER_MESSAGE_LIMIT)
  };
  render();
  if (oldFirst && Number.isFinite(oldTop)) {
    const newNode = $(`.agent-message[data-agent-message-id="${cssEscape(oldFirst.id)}"]`);
    const log = $('.agent-log');
    if (newNode && log) log.scrollTop += newNode.getBoundingClientRect().top - oldTop;
  }
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
  const match = normalized.match(/^(适合模型|推荐理由|(?:正向|正面)\s*(?:Prompt|提示词)|中文提示词|英文提示词|出图提示词|图像提示词|Prompt|负面\s*(?:Prompt|提示词)?|反向\s*(?:Prompt|提示词)?|Negative(?:\s*Prompt)?)(?:\s*[（(][^()（）\n]{0,48}[)）])?\s*[:：]?\s*(.*)$/i);
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
    if (/^\s*(?:#{1,6}\s*)?(?:\*\*)?方案\s*[1-5]\b/i.test(line)) break;
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
  const pattern = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?方案\s*([1-5])\s*(?:\*\*)?\s*[：:、.\-—]?\s*([^\n]*)/gi;
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
  const firstOption = text.search(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?方案\s*[1-5]\b/i);
  return firstOption > 0 ? text.slice(0, firstOption).trim() : '';
}
function renderAgentPromptOptionCard(message, option, recommended) {
  const messageId = esc(message.id);
  const optionIndex = esc(option.index);
  const isRecommended = recommended?.index === option.index;
  const optionCount = agentPromptOptionsForMessage(message).length;
  const generateLabel = optionCount <= 1 ? '生成该 Prompt' : (isRecommended ? '生成推荐方案' : '生成该方案');
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
    <button class="toolbar-button agent-option-generate" data-action="confirm-agent-image" data-message-id="${messageId}" data-option-index="${optionIndex}">${generateLabel}</button>
  </article>`;
}
function renderAgentPromptOptions(message, options) {
  if (!options.length) return '';
  const recommended = recommendedAgentPromptOption(options);
  const multiOption = options.length > 1;
  const primaryLabel = multiOption ? '生成推荐方案' : '生成图片';
  return `<div class="agent-prompt-options">
    <div class="agent-recommended-action">
      <button class="generate-button" data-action="confirm-agent-image" data-message-id="${esc(message.id)}" data-option-index="${esc(recommended?.index || options[0].index)}">${primaryLabel}</button>
    </div>
    <div class="agent-option-grid">${options.map((option) => renderAgentPromptOptionCard(message, option, recommended)).join('')}</div>
    ${multiOption ? `<div class="agent-option-shortcuts" aria-label="快捷选择方案">
      ${options.map((option) => `<button type="button" data-action="agent-option-shortcut" data-message-id="${esc(message.id)}" data-option-index="${esc(option.index)}">${esc(option.index)}</button>`).join('')}
    </div>` : ''}
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
  const streamPreviewHtml = renderTaskStreamPreviewImage(task, 0);
  const count = taskCountInfo(task);
  const status = count.label || (task.status === 'running' ? '生成中' : task.status === 'success' ? '完成' : task.status === 'partial_success' ? '部分完成' : '失败');
  const expected = Math.max(1, Number(count.expected || task.expectedCount || task.count || 1));
  const actual = Math.max(0, Number(count.actual || task.actualCount || task.images?.length || 0));
  const percent = task.status === 'success' ? 100 : Math.max(0, Math.min(100, Math.round((actual / expected) * 100)));
  const statusClass = task.status === 'running' || task.status === 'queued' ? 'running' : task.status === 'success' ? 'success' : task.status === 'partial_success' ? 'partial' : 'error';
  const progressText = `${actual}/${expected}`;
  return `<button class="agent-task-card ${esc(statusClass)}" data-action="open-detail" data-id="${esc(task.id)}" title="点击查看完整生图详情">
    <div class="agent-task-preview">
      ${image ? `<img data-image-kind="task-image" data-gallery-preview="1" data-task-id="${esc(task.id)}" data-index="0" data-blob-id="${esc(image.blobId || '')}" data-remote-url="${esc(storedImageSource(image))}"${cachedTaskImageSrcAttribute(image)} loading="lazy" decoding="async" fetchpriority="low" alt="">` : streamPreviewHtml || '<span class="spinner"></span>'}
      ${!image && streamPreviewHtml ? '<span class="stream-preview-badge compact">预览</span>' : ''}
    </div>
    <div class="agent-task-meta">
      <strong>${esc(status)}</strong>
      <span class="agent-task-process">${esc(progressText)} · ${esc(formatElapsed(task))}</span>
      <span class="agent-task-progress" aria-hidden="true"><i style="width:${esc(percent)}%"></i></span>
    </div>
  </button>`;
}
function scheduleGalleryTaskCardSyncFrame() {
  if (galleryScrollActivity || $('.gallery-scroll')?.classList?.contains('is-scrolling')) return;
  if (galleryTaskCardSyncFrame || !galleryTaskCardSyncQueue.size) return;
  galleryTaskCardSyncFrame = requestRenderFrame(() => {
    galleryTaskCardSyncFrame = 0;
    const pending = [...galleryTaskCardSyncQueue.values()];
    galleryTaskCardSyncQueue.clear();
    pending.forEach(syncGalleryTaskCardDom);
  });
}
function syncGalleryTaskCardDom(task) {
  if (!task?.id) return false;
  const cards = $$(`.asset-card[data-task-id="${cssEscape(task.id)}"]`);
  if (!cards.length) return false;
  if (galleryScrollActivity || $('.gallery-scroll')?.classList?.contains('is-scrolling')) {
    galleryTaskCardSyncQueue.set(String(task.id), task);
    return true;
  }
  for (const card of cards) {
    const nextCard = createElementFromHtml(renderAssetCard(task));
    if (!nextCard) continue;
    releaseGalleryImageWork(card);
    $$('.asset-media img', card).forEach(unobserveGalleryImage);
    card.replaceWith(nextCard);
    const image = nextCard.querySelector('img[data-blob-id]');
    if (image) void hydrateGalleryPreviewImage(image, image.dataset.blobId, image.dataset.remoteUrl);
  }
  return true;
}
function scheduleGalleryTaskCardSync(task) {
  if (!task?.id || !$$(`.asset-card[data-task-id="${cssEscape(task.id)}"]`).length) return false;
  galleryTaskCardSyncQueue.set(String(task.id), task);
  scheduleGalleryTaskCardSyncFrame();
  return true;
}
function scheduleAgentTaskCardSyncFrame() {
  if (agentScrollActivity || $('.agent-log')?.classList?.contains('is-scrolling')) return;
  if (agentTaskCardSyncFrame || !agentTaskCardSyncQueue.size) return;
  agentTaskCardSyncFrame = requestRenderFrame(() => {
    agentTaskCardSyncFrame = 0;
    const pending = [...agentTaskCardSyncQueue.values()];
    agentTaskCardSyncQueue.clear();
    pending.forEach(syncAgentTaskCardDom);
  });
}
function syncAgentTaskCardDom(task) {
  if (!task?.id) return false;
  const selector = `.agent-task-card[data-id="${cssEscape(task.id)}"]`;
  const cards = $$(selector);
  if (!cards.length) return false;
  if (agentScrollActivity || $('.agent-log')?.classList?.contains('is-scrolling')) {
    agentTaskCardSyncQueue.set(String(task.id), task);
    return true;
  }
  for (const card of cards) {
    const nextCard = createElementFromHtml(renderAgentTaskCard(task));
    if (!nextCard) continue;
    releaseGalleryImageWork(card);
    card.replaceWith(nextCard);
    const image = nextCard.querySelector('img[data-blob-id]');
    if (image) {
      galleryDeferredHydrations.set(image, hydrateGalleryPreviewImage);
      scheduleGalleryHydrationFlush();
    }
  }
  return true;
}
function scheduleAgentTaskCardSync(task) {
  if (!task?.id || !$$(`.agent-task-card[data-id="${cssEscape(task.id)}"]`).length) return false;
  agentTaskCardSyncQueue.set(String(task.id), task);
  scheduleAgentTaskCardSyncFrame();
  return true;
}

function renderWorkflowEditorModal(workflow) {
  return `
    <div class="modal-layer" data-action="cancel-workflow-draft">
      <div class="workflow-editor-modal" role="dialog" aria-modal="true" aria-labelledby="workflowEditorTitle" tabindex="-1" data-modal-key="workflow-editor" data-stop>
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
      <div class="confirm-modal ${type !== 'confirm' ? 'dialog-modal' : ''}" role="dialog" aria-modal="true" aria-labelledby="confirmDialogTitle" tabindex="-1" data-modal-key="confirm-dialog" data-stop>
        <div class="confirm-glow"></div>
        <div class="confirm-head">
          <div class="confirm-icon" aria-hidden="true">
            <span></span>
          </div>
          <div class="confirm-copy">
            <div class="detail-section-label">${esc(dialog.kicker || (type === 'copy-link' ? '复制链接' : type === 'text-input' ? '输入内容' : '确认操作'))}</div>
            <h2 id="confirmDialogTitle">${esc(dialog.title || '确认删除？')}</h2>
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
          <button class="confirm-secondary" data-modal-autofocus data-action="cancel-confirm">${esc(dialog.cancelText || '取消')}</button>
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
          <div class="detail-section-label" id="workflowEditorTitle">${workflow.persisted ? '编辑工作流' : '工作流草稿'}</div>
          <input class="workflow-title-input" data-action="workflow-name-input" data-modal-autofocus value="${esc(workflow.name || '')}" placeholder="工作流名称">
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
  const mediaCount = images.length || taskStreamMediaCount(task);
  const imageIndex = Math.max(0, Math.min(Number(task.detailImageIndex) || 0, Math.max(0, mediaCount - 1)));
  const image = images[imageIndex];
  const streamPreview = image ? null : taskStreamPreviewRecord(task, imageIndex);
  const streamPreviewHtml = image ? '' : renderTaskStreamPreviewImage(task, imageIndex, 'detail-stream-preview');
  const returnedPrompt = task.returnedPrompt && task.returnedPrompt !== task.prompt ? task.returnedPrompt : '';
  const requested = task.requestedParams || {};
  const returned = task.returnedParams || {};
  const requestedFormat = firstDefined(requested.format, requested.output_format, state.settings.output_format);
  const requestedNegativePrompt = String(firstDefined(requested.negative_prompt, requested.negativePrompt, requested.negative) || '').trim();
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
    : param('输出质量', 'outputQuality', firstDefined(requested.outputQuality, requested.output_quality, requested.compression), { type: 'number', aliases: ['output_quality', 'compression'] });
  const timing = task.timing && typeof task.timing === 'object' ? task.timing : {};
  const timingValue = (value) => Number(value) > 0 ? `${(Number(value) / 1000).toFixed(Number(value) < 10000 ? 2 : 1)}s` : '';
  const timingParts = [
    timingValue(timing.responseHeaderMs) ? `响应头 ${timingValue(timing.responseHeaderMs)}` : '',
    timingValue(timing.streamReadMs) ? `流读取 ${timingValue(timing.streamReadMs)}` : '',
    timingValue(timing.persistMs || task.persistElapsedMs) ? `本地入库 ${timingValue(timing.persistMs || task.persistElapsedMs)}` : '',
    timingValue(timing.postProcessMs) ? `后处理 ${timingValue(timing.postProcessMs)}` : '',
    timingValue(timing.totalMs || task.elapsedMs) ? `总计 ${timingValue(timing.totalMs || task.elapsedMs)}` : '',
    timingValue(timing.upstreamHeaderMs) ? `上游响应头 ${timingValue(timing.upstreamHeaderMs)}` : ''
  ].filter(Boolean);
  const responseDiagnostics = [
    task.responseMode ? `响应模式 ${task.responseMode}` : '',
    task.completionReason ? `完成原因 ${task.completionReason}` : ''
  ].filter(Boolean);
  return `
    <div class="modal-layer" data-action="close-modal-bg">
      <div class="detail-modal" role="dialog" aria-modal="true" aria-label="生图任务详情" tabindex="-1" data-modal-key="task-detail" data-stop>
        <div class="detail-media ${mediaCount > 1 ? 'has-thumbs' : ''}">
          <div class="detail-media-stage">
            <div class="detail-media-badges">
              <span>${esc(imageRatioLabel || requested.aspectRatio || 'auto')}</span>
              <span>${esc(imageSizeLabel || requested.resolution || 'auto')}</span>
            </div>
            ${image ? `<img data-action="open-viewer" role="button" tabindex="0" aria-label="查看生成图片大图" data-image-kind="task-image" data-detail-task-image="1" data-task-id="${esc(task.id)}" data-index="${esc(imageIndex)}" data-blob-id="${esc(image.blobId || '')}" data-remote-url="${esc(storedImageSource(image))}"${cachedTaskImageSrcAttribute(image, 'full')} alt="">` : streamPreviewHtml || '<div class="asset-placeholder"><div class="progress-ring"></div></div>'}
            ${streamPreview ? '<span class="stream-preview-badge detail">流式预览</span>' : ''}
            ${streamPreview?.blobId ? `<button class="detail-download preview" data-action="download-stream-preview" data-task-id="${esc(task.id)}" data-index="${esc(imageIndex)}">下载预览</button>` : ''}
            ${isTransparentPng && image ? `<button class="detail-download original" data-action="download-image" data-task-id="${esc(task.id)}" data-index="${esc(imageIndex)}">下载原图</button><button class="detail-download orig" data-action="download-image" data-task-id="${esc(task.id)}" data-index="${esc(imageIndex)}" data-original="true">ORIG</button>` : ''}
            ${renderReferenceBadge(task, 'detail')}
            ${mediaCount > 1 ? `
              <button class="detail-image-nav prev" data-action="detail-image-prev" data-id="${esc(task.id)}" aria-label="上一张">‹</button>
              <button class="detail-image-nav next" data-action="detail-image-next" data-id="${esc(task.id)}" aria-label="下一张">›</button>
              <div class="detail-image-count">${esc(imageIndex + 1)} / ${esc(mediaCount)}</div>
            ` : ''}
          </div>
          ${mediaCount > 1 ? `<div class="detail-thumbs">${Array.from({ length: mediaCount }, (_, idx) => {
            const img = images[idx];
            return `<button class="${idx === imageIndex ? 'active' : ''}" data-action="detail-image-select" data-id="${esc(task.id)}" data-index="${esc(idx)}">${img ? `<img data-image-kind="task-image" data-task-id="${esc(task.id)}" data-index="${esc(idx)}" data-blob-id="${esc(img.blobId || '')}" data-remote-url="${esc(storedImageSource(img))}"${cachedTaskImageSrcAttribute(img)} alt="">` : renderTaskStreamPreviewImage(task, idx)}</button>`;
          }).join('')}</div>` : ''}
        </div>
        <div class="detail-info">
          <button class="modal-close" aria-label="关闭" data-action="close-modal">×</button>
          <div class="detail-section-label">输入提示词</div>
          <div class="prompt-block">${esc(task.prompt || '未填写')}</div>
          ${requestedNegativePrompt ? `<div class="detail-section-label">负面 Prompt（已提交请求参数）</div><div class="prompt-block">${esc(requestedNegativePrompt)}</div>` : ''}
          ${renderTaskReferenceStrip(task)}
          ${returnedPrompt ? `<div class="detail-section-label">返回提示词</div><div class="returned-prompt">${esc(returnedPrompt)}</div>` : ''}
          ${task.error || task.partialErrors?.length ? `<div class="detail-section-label">${task.status === 'partial_success' ? '部分失败信息' : '错误信息'}</div><div class="returned-prompt error-prompt">${esc(task.error || '部分图片生成失败')}${task.errorDetail && task.errorDetail !== task.error ? `\n\n${esc(task.errorDetail)}` : ''}${task.partialErrors?.length ? `\n\n${esc(task.partialErrors.map((item, idx) => `${idx + 1}. ${item.summary || item.error || item}`).join('\n'))}` : ''}</div>` : ''}
          <div class="detail-section-label">参数配置</div>
          ${param('来源', 'source', requested.source)}
          ${param('分辨率', 'resolution', requested.resolution || requested.size || task.sizeLabel, { aliases: ['size', 'dimensions', 'output_size', 'outputSize'], actualFallback: imageSizeLabel })}
          ${param('比例', 'aspectRatio', requested.aspectRatio || 'auto', { type: 'ratio', aliases: ['aspect_ratio', 'ratio'], actualFallback: imageRatioLabel })}
          ${param('请求质量', 'quality', requested.quality || task.quality)}
          ${param('格式', 'format', requestedFormat, { type: 'format', aliases: ['outputFormat', 'output_format', 'mimeType'] })}
          ${compressionParam}
          ${param('审核', 'moderation', requested.moderation, { aliases: ['moderation_level', 'moderationLevel', 'safety', 'safety_filter', 'safetyFilter'] })}
          ${param('数量', 'count', requested.count || task.count, { type: 'number', aliases: ['n', 'imageCount', 'image_count'], actualFallback: images.length || undefined })}
          ${timingParts.length || responseDiagnostics.length || task.streamPartialCount ? `<div class="detail-section-label">耗时与响应诊断</div><div class="param-card"><div class="param-value"><span>${esc([...timingParts, ...responseDiagnostics, task.streamPartialCount ? `预览帧 ${task.streamPartialCount}` : '', task.lastStreamEventType ? `最后事件 ${task.lastStreamEventType}` : ''].filter(Boolean).join(' · '))}</span></div></div>` : ''}
          ${task.streamPartialImages?.length ? `<div class="detail-section-label">流式中间帧</div><div class="returned-prompt stream-warning">已保留 ${esc(task.streamPartialImages.length)} 张中间帧。它们仅用于预览和故障恢复，不代表最终输出。</div>` : ''}
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
      <div class="viewer-layer" role="dialog" aria-modal="true" aria-label="参考图原图" tabindex="-1" data-modal-key="gallery-viewer" data-action="close-viewer">
        <button class="viewer-close" aria-label="关闭大图" data-modal-autofocus data-action="close-viewer">×</button>
        <div class="viewer-index">${esc(viewer.name || '参考图原图')}</div>
        <div class="viewer-stage" data-action="viewer-stage">
          <img class="viewer-image" data-action="viewer-image" data-image-kind="task-reference-original" data-task-ref-task-id="${esc(viewer.taskId || '')}" data-task-ref-index="${esc(viewer.refIndex || 0)}" data-blob-id="${esc(viewer.blobId || '')}" alt="${esc(viewer.name || '参考图原图')}">
        </div>
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
    <div class="viewer-layer" role="dialog" aria-modal="true" aria-label="生成图片大图" tabindex="-1" data-modal-key="gallery-viewer" data-action="close-viewer">
      <button class="viewer-close" aria-label="关闭大图" data-modal-autofocus data-action="close-viewer">×</button>
      <div class="viewer-stage" data-action="viewer-stage">
        ${images.length > 1 ? `<button class="viewer-nav prev" data-action="viewer-prev" aria-label="上一张">‹</button><button class="viewer-nav next" data-action="viewer-next" aria-label="下一张">›</button>` : ''}
        <img class="viewer-image" data-action="viewer-image" data-image-kind="task-image" data-task-id="${esc(task.id)}" data-index="${esc(safeIndex)}" data-blob-id="${esc(image.blobId || '')}" data-remote-url="${esc(storedImageSource(image))}"${cachedTaskImageSrcAttribute(image, 'full')} alt="生成图片 ${esc(safeIndex + 1)}">
        ${images.length > 1 ? `<div class="viewer-index">${esc(safeIndex + 1)} / ${esc(images.length)}</div>` : ''}
      </div>
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
async function ensureTaskImageFullSource(blobId) {
  const key = String(blobId || '');
  if (!key) return '';
  const cached = touchObjectUrl(state.imageUrls, key);
  if (cached) return cached;
  const blob = await getBlob(key).catch(() => null);
  if (!blob) return '';
  return rememberObjectUrl(state.imageUrls, key, URL.createObjectURL(blob), IMAGE_OBJECT_URL_CACHE_LIMIT);
}
async function decodeTaskImageSource(source) {
  if (!source || typeof Image === 'undefined') return;
  const preload = new Image();
  preload.decoding = 'async';
  preload.src = source;
  try {
    await preload.decode();
  } catch {
    if (preload.complete) return;
    await new Promise((resolve) => {
      preload.addEventListener('load', resolve, { once: true });
      preload.addEventListener('error', resolve, { once: true });
    });
  }
}
async function hydrateTaskDetailImage(img, generation = taskDetailOverlayGeneration) {
  const blobId = String(img?.dataset?.blobId || '');
  if (!blobId || img?.isConnected === false) return;
  const source = await ensureTaskImageFullSource(blobId);
  if (!source || generation !== taskDetailOverlayGeneration || img?.isConnected === false || String(img.dataset.blobId || '') !== blobId) return;
  if (String(img.currentSrc || img.src || '') === source) return;
  await decodeTaskImageSource(source);
  if (generation !== taskDetailOverlayGeneration || img?.isConnected === false || String(img.dataset.blobId || '') !== blobId) return;
  img.src = source;
}
function warmTaskDetailImages(mount = $('#taskDetailMount')) {
  const generation = ++taskDetailOverlayGeneration;
  if (!mount || !state.modal) return generation;
  $$('img[data-detail-task-image="1"]', mount).forEach((img) => {
    void hydrateTaskDetailImage(img, generation);
  });
  return generation;
}
function syncTaskDetailOverlay(options = {}) {
  const mount = $('#taskDetailMount');
  if (!mount) return false;
  const focusState = options.focusState || captureFocusState();
  mount.innerHTML = state.modal ? renderDetailModal(state.modal) : '';
  warmTaskDetailImages(mount);
  const topDialog = syncModalAccessibility();
  if (state.modal && topDialog) {
    if (!restoreFocusState(focusState, topDialog)) focusTopModal(topDialog);
  }
  return true;
}
function openTaskDetail(taskId, opener) {
  if (!state.tasks.some((task) => task.id === taskId)) return;
  rememberModalOpener('task-detail', opener);
  state.modal = taskId;
  if (!syncTaskDetailOverlay()) render();
}
function closeTaskDetail() {
  if (!state.modal) return;
  state.modal = null;
  if (!syncTaskDetailOverlay()) {
    render();
    return;
  }
  restoreModalOpener('task-detail');
}
function setDetailImage(taskId, value, isDelta = false) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const total = (task.images || []).length || taskStreamMediaCount(task);
  if (!total) return;
  const current = Number(task.detailImageIndex) || 0;
  task.detailImageIndex = isDelta ? (current + Number(value) + total) % total : Math.max(0, Math.min(Number(value) || 0, total - 1));
  if (!syncTaskDetailOverlay()) render();
}

function renderImageContextMenu(menu) {
  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 720;
  const menuWidth = 190;
  const canEdit = !menu.kind || ['task-image', 'task-reference', 'task-reference-original'].includes(menu.kind);
  const menuHeight = canEdit ? 154 : 108;
  let x = Math.max(12, Math.min(Number(menu.x) || 12, viewportWidth - menuWidth));
  let y = Math.max(12, Math.min(Number(menu.y) || 12, viewportHeight - menuHeight));
  if (state.viewer) {
    const closeRect = { left: viewportWidth - 46, right: viewportWidth - 18, top: 16, bottom: 44 };
    const overlapsClose = x < closeRect.right
      && x + menuWidth > closeRect.left
      && y < closeRect.bottom
      && y + menuHeight > closeRect.top;
    if (overlapsClose) {
      const belowClose = closeRect.bottom + 8;
      const aboveClose = closeRect.top - menuHeight - 8;
      if (belowClose + menuHeight <= viewportHeight - 12) y = belowClose;
      else if (aboveClose >= 12) y = aboveClose;
      else x = Math.max(12, closeRect.left - menuWidth - 8);
    }
  }
  const copyDisabled = menu.copyState === 'loading';
  return `
    <div class="image-menu-layer" data-action="close-image-menu">
      <div class="image-context-menu" role="menu" aria-label="图片操作" tabindex="-1" style="left:${esc(x)}px;top:${esc(y)}px" data-stop>
        <button role="menuitem" tabindex="${copyDisabled ? '-1' : '0'}" data-modal-autofocus data-action="copy-image" ${copyDisabled ? 'disabled' : ''}>${copyDisabled ? '准备复制...' : '复制'}</button>
        <button role="menuitem" tabindex="${copyDisabled ? '0' : '-1'}" data-action="download-image">下载</button>
        ${canEdit ? '<button role="menuitem" tabindex="-1" data-action="edit-image-source">编辑</button>' : ''}
      </div>
    </div>
  `;
}
function syncImageContextMenu() {
  const mount = $('#imageMenuMount');
  if (!mount) return;
  const activeAction = mount.querySelector?.('.image-context-menu')?.contains(document.activeElement)
    ? document.activeElement?.dataset?.action
    : '';
  const hadMenu = !!mount.querySelector?.('.image-context-menu');
  mount.innerHTML = state.imageContextMenu ? renderImageContextMenu(state.imageContextMenu) : '';
  if (state.imageContextMenu) {
    const focusFirst = () => {
      const preferred = activeAction && mount.querySelector?.(`.image-context-menu [data-action="${activeAction}"]:not([disabled])`);
      (preferred || mount.querySelector?.('.image-context-menu [role="menuitem"]:not([disabled])'))?.focus?.({ preventScroll: true });
    };
    if (!hadMenu || activeAction) {
    if (typeof queueMicrotask === 'function') queueMicrotask(focusFirst);
    else setTimeout(focusFirst, 0);
    }
  }
}
function moveImageContextMenuFocus(key) {
  const items = $$('.image-context-menu [role="menuitem"]:not([disabled])');
  if (!items.length) return false;
  const currentIndex = items.indexOf(document.activeElement);
  const nextIndex = key === 'Home'
    ? 0
    : key === 'End'
      ? items.length - 1
      : currentIndex < 0
        ? (key === 'ArrowUp' ? items.length - 1 : 0)
        : (currentIndex + (key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
  items.forEach((item, index) => { item.tabIndex = index === nextIndex ? 0 : -1; });
  items[nextIndex].focus?.({ preventScroll: true });
  return true;
}
function closeImageContextMenu() {
  if (!state.imageContextMenu && !$('.image-menu-layer')) return;
  const opener = imageContextMenuOpener;
  imageContextMenuOpener = null;
  state.imageContextMenu = null;
  syncImageContextMenu();
  if (opener?.isConnected && opener.matches?.('button, [href], [tabindex]:not([tabindex="-1"])')) {
    try { opener.focus({ preventScroll: true }); } catch {}
  }
}
function closeImageContextMenuIfCurrent(menu) {
  if (!menu || state.imageContextMenu?.copyRequestId !== menu.copyRequestId) return;
  closeImageContextMenu();
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
function currentImageMenuSource(menu = state.imageContextMenu) {
  if (!menu) return {};
  if (menu.kind === 'task-reference' || menu.kind === 'task-reference-original') {
    const task = state.tasks.find((item) => item.id === menu.taskId);
    const ref = taskReferenceSnapshots(task || {})[menu.index];
    if (!ref && menu.blobId) return { blobId: menu.blobId, remoteUrl: menu.remoteUrl || '', name: menu.name || 'reference.png' };
    if (!ref) return {};
    return {
      blobId: menu.blobId || taskReferenceOriginalBlobId(ref),
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
function taskImageSourceFromTarget(target, wantsOriginal = false) {
  const task = state.tasks.find((item) => item.id === target?.dataset?.taskId);
  const index = Number(target?.dataset?.index) || 0;
  const image = task?.images?.[index] || {};
  return {
    blobId: wantsOriginal ? (image.originalBlobId || image.blobId) : image.blobId,
    remoteUrl: image.url || image.remoteUrl,
    name: `${task?.id || 'image'}-${index + 1}${wantsOriginal ? '-orig' : ''}.png`,
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
async function imageCopyFallbackText(source) {
  const candidates = [source?.remoteUrl, state.imageUrls.get(source?.blobId) || ''];
  return candidates.find((value) => value && !/^blob:/i.test(String(value))) || '';
}
async function detectImageBlobType(blob) {
  if (!(blob instanceof Blob) || !blob.size) return '';
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(String.fromCharCode(...bytes.slice(0, 6)))) return 'image/gif';
  return String(blob.type || '').toLowerCase();
}
async function clipboardPngBlob(blob) {
  if (!(blob instanceof Blob)) throw new Error('没有可复制的图片数据');
  const detectedType = await detectImageBlobType(blob);
  if (detectedType === 'image/png') {
    return String(blob.type || '').toLowerCase() === 'image/png'
      ? blob
      : blob.slice(0, blob.size, 'image/png');
  }
  const decodeBlob = detectedType && detectedType !== String(blob.type || '').toLowerCase()
    ? blob.slice(0, blob.size, detectedType)
    : blob;
  let image = null;
  let bitmap = null;
  try {
    if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(decodeBlob);
    else image = await blobToImageElement(decodeBlob);
    const width = Number(bitmap?.width || image?.naturalWidth || image?.width || 0);
    const height = Number(bitmap?.height || image?.naturalHeight || image?.height || 0);
    if (!width || !height) throw new Error('无法读取待复制图片尺寸');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建图片复制画布');
    context.drawImage(bitmap || image, 0, 0, width, height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((png) => png ? resolve(png) : reject(new Error('图片转换为 PNG 失败')), 'image/png');
    });
  } finally {
    bitmap?.close?.();
  }
}
async function prepareImageContextMenuCopy(menu) {
  if (!menu?.copyRequestId) return;
  try {
    const source = currentImageMenuSource(menu);
    const blob = await blobFromImageSource(source);
    if (!blob) throw new Error('当前图片无法读取');
    const pngBlob = await clipboardPngBlob(blob);
    if (state.imageContextMenu?.copyRequestId !== menu.copyRequestId) return;
    state.imageContextMenu.copyBlob = pngBlob;
    state.imageContextMenu.copyState = 'ready';
    syncImageContextMenu();
  } catch (error) {
    if (state.imageContextMenu?.copyRequestId !== menu.copyRequestId) return;
    state.imageContextMenu.copyState = 'error';
    state.imageContextMenu.copyError = error?.message || '图片准备失败';
    syncImageContextMenu();
  }
}
async function copyImageFromMenu(target = null) {
  const source = target?.dataset?.taskId ? taskImageSourceFromTarget(target) : currentImageMenuSource();
  let supportsImageClipboard = !!navigator.clipboard?.write && !!window.ClipboardItem && window.isSecureContext !== false;
  if (supportsImageClipboard && typeof window.ClipboardItem.supports === 'function') {
    try { supportsImageClipboard = window.ClipboardItem.supports('image/png') !== false; } catch { supportsImageClipboard = false; }
  }
  if (!supportsImageClipboard) {
    const fallbackText = await imageCopyFallbackText(source).catch(() => '');
    if (fallbackText && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(fallbackText);
        toast('图片链接已复制');
        return;
      } catch {}
    }
    toast('当前浏览器不支持直接复制图片，请使用下载功能');
    return;
  }
  try {
    const preparedBlob = !target && state.imageContextMenu?.copyBlob;
    if (!preparedBlob && !target && state.imageContextMenu?.copyState === 'error') {
      throw new Error(state.imageContextMenu.copyError || '图片准备失败');
    }
    if (preparedBlob) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': preparedBlob })]);
    } else {
      const pngPromise = blobFromImageSource(source).then((blob) => {
        if (!blob) throw new Error('当前图片无法读取');
        return clipboardPngBlob(blob);
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngPromise })]);
    }
    toast('图片已复制');
  } catch (error) {
    console.warn('[home-v3] image clipboard write failed', error);
    const fallbackText = await imageCopyFallbackText(source).catch(() => '');
    if (fallbackText && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(fallbackText);
        toast('图片复制受浏览器限制，已复制图片链接');
        return;
      } catch {}
    }
    toast(fallbackText ? `复制失败：${error?.message || '浏览器拒绝写入剪贴板'}` : '当前浏览器不支持直接复制图片，请使用下载功能');
  }
}
async function downloadImageFromMenuOrTarget(target = null) {
  const activeMenu = state.imageContextMenu;
  let source;
  if (target?.dataset?.taskId) {
    const wantsOriginal = target.dataset.original === 'true';
    source = taskImageSourceFromTarget(target, wantsOriginal);
  } else {
    source = currentImageMenuSource();
  }
  const blob = await blobFromImageSource(source);
  if (!blob) return toast('当前图片无法下载');
  const ext = (blob.type?.split('/')[1] || 'png').replace('jpeg', 'jpg');
  closeImageContextMenuIfCurrent(activeMenu);
  downloadBlob(blob, String(source.name || `image-${Date.now()}.${ext}`).replace(/\.[a-z0-9]+$/i, `.${ext}`));
}
async function downloadStreamPreview(taskId, outputIndex = 0) {
  const task = state.tasks.find((item) => item.id === taskId);
  const preview = taskStreamPreviewRecord(task, outputIndex);
  if (!preview?.blobId) return toast('预览图仍在写入本地，请稍后重试');
  const blob = await getBlob(preview.blobId).catch(() => null);
  if (!blob) return toast('预览图已不存在');
  const ext = (blob.type?.split('/')[1] || 'png').replace('jpeg', 'jpg');
  downloadBlob(blob, `stream-preview-${taskId}-${Number(outputIndex) + 1}.${ext}`);
}
async function editImageFromMenu() {
  const activeMenu = state.imageContextMenu;
  const source = currentImageMenuSource();
  if (source.task?.id && state.imageContextMenu?.kind === 'task-image') {
    const index = state.imageContextMenu.index;
    closeImageContextMenuIfCurrent(activeMenu);
    await editOutput(source.task.id, {
      index,
      blobId: source.blobId
    });
    return;
  }
  if (source.ref) {
    const blob = await blobFromImageSource(source);
    if (!blob) return toast('参考图原图不在当前浏览器本地，无法编辑');
    const blobId = await putBlob(blob);
    const ref = { id: uid('ref'), blobId, originalBlobId: blobId, name: source.name, type: blob.type || 'image/png' };
    state.references = [ref, ...state.references].slice(0, referenceLimit());
    closeImageContextMenuIfCurrent(activeMenu);
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
  const replacingBlobIds = replacing.flatMap((ref) => [ref.blobId, ref.originalBlobId, ref.compositedBlobId, ref.maskBlobId]);
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
  const persisted = persistRender();
  if (persisted === true) await deleteUnreferencedBlobIds(replacingBlobIds);
  else queuePendingBlobRelease(replacingBlobIds, false);
}
async function removeProReference(id) {
  const ref = (state.pro.refs || []).find((item) => item.id === id);
  if (!ref) return;
  const blobIds = [ref.blobId, ref.originalBlobId, ref.compositedBlobId, ref.maskBlobId];
  revokeMapEntry(state.refUrls, `pro:${id}`);
  state.pro.refs = (state.pro.refs || []).filter((item) => item.id !== id);
  state.pro.analysis = null;
  const persisted = persistRender();
  if (persisted === true) await deleteUnreferencedBlobIds(blobIds);
  else queuePendingBlobRelease(blobIds, false);
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
        profileId: profileSelectionKey(profile),
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
    profileId: profileSelectionKey(activeProfile()),
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
      profileId: profileSelectionKey(activeProfile()),
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
      ${options.map((value) => `<button class="${isPopoverValueActive(pop.type, value) ? 'active' : ''}" data-action="${String(pop.type || '').startsWith('agent-') ? 'set-agent-popover-value' : 'set-popover-value'}" data-type="${esc(pop.type)}" data-value="${esc(value)}">${esc(popoverOptionLabel(pop.type, value))}</button>`).join('')}
    </div>
  `;
}
function popoverOptionLabel(type, value) {
  if ((type === 'compression' || type === 'agent-compression') && /^\d+$/.test(String(value))) {
    return {
      100: '100 · 最高质量',
      95: '95 · 极高质量',
      90: '90 · 高质量',
      80: '80 · 均衡',
      70: '70 · 较小文件'
    }[Number(value)] || String(value);
  }
  return String(value);
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
  const current = imageProfile();
  const rect = pop.rect || { left: 40, top: window.innerHeight - 160 };
  const height = Math.min(340, 52 + Math.max(1, profiles.length) * 42);
  return `
    <div class="popover up-popover model-menu" style="${popoverStyle(rect, 300, height)}">
      <div class="popover-title">模型配置</div>
      ${profiles.length ? profiles.map((profile) => `
        <button class="${profile === current ? 'active' : ''}" role="menuitemradio" aria-checked="${profile === current ? 'true' : 'false'}" data-action="switch-profile" data-value="${esc(profileSelectionKey(profile))}">
          <strong>${esc(profile.name || profileId(profile))}</strong>
        </button>
      `).join('') : `<div class="popover-empty">暂无生图模型，请到后台添加 Images API 配置。</div>`}
    </div>
  `;
}
function renderAgentModelConfigMenu(pop) {
  const profiles = imageProfiles();
  const current = agentImageProfile();
  const rect = pop.rect || { left: 40, top: window.innerHeight - 160 };
  const height = Math.min(340, 52 + Math.max(1, profiles.length) * 42);
  return `
    <div class="popover up-popover model-menu" style="${popoverStyle(rect, 300, height)}">
      <div class="popover-title">Agent 生图模型</div>
      ${profiles.length ? profiles.map((profile) => `
        <button class="${profile === current ? 'active' : ''}" role="menuitemradio" aria-checked="${profile === current ? 'true' : 'false'}" data-action="set-agent-image-param" data-field="profileId" data-value="${esc(profileSelectionKey(profile))}">
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
      <div class="prompt-modal" role="dialog" aria-modal="true" aria-labelledby="promptRepoTitle" tabindex="-1" data-modal-key="prompt-repo" data-stop>
        <div class="prompt-head">
          <div><strong id="promptRepoTitle">提示词仓库</strong><span>${esc(state.promptRepo.total || 0)} 条 · ${esc(activeCategory === 'all' ? '全部分类' : activeCategory)}</span></div>
          <input id="promptRepoSearch" value="${esc(state.promptRepo.query || '')}" placeholder="搜索中文关键词、标题或提示词..." data-action="prompt-search" data-modal-autofocus autocomplete="off" spellcheck="false">
          <button class="toolbar-button" data-action="close-prompt-repo">关闭</button>
        </div>
        <div class="prompt-repo-body">
          <aside class="prompt-categories" id="promptCategories" aria-label="提示词分类">
            ${categories.map((cat) => `<button class="${cat === activeCategory ? 'active' : ''}" data-action="prompt-category" data-cat="${esc(cat)}">${esc(cat === 'all' ? '全部' : cat)}</button>`).join('')}
            ${state.promptRepo.categoriesLoading ? '<div class="prompt-category-loading">分类加载中...</div>' : ''}
          </aside>
          <div class="prompt-list ${promptWindow.shouldVirtualize ? 'is-virtual' : ''}" id="promptList" data-virtual="${promptWindow.shouldVirtualize ? '1' : '0'}">${renderPromptRepoListContents(promptWindow, promptItems, { isInitialLoading, isAppending, loadingLabel })}</div>
        </div>
      </div>
      <div id="promptRepoOverlays">${renderPromptRepoOverlays()}</div>
    </div>
  `;
}
function renderPromptRepoListContents(promptWindow, promptItems, options = {}) {
  state.promptRepo.renderedStartIndex = promptWindow.startIndex;
  state.promptRepo.renderedEndIndex = promptWindow.endIndex;
  return `
    <div class="prompt-spacer" data-prompt-spacer="top" style="height:${esc(promptWindow.topPad || 0)}px"></div>
    ${options.isInitialLoading ? `<div class="prompt-status-row">${esc(options.loadingLabel || '')}</div>${renderPromptSkeletonCards()}` : promptItems.map((item, index) => renderPromptCard(item, promptWindow.startIndex + index)).join('')}
    ${options.isAppending ? '<div class="prompt-loading-row">继续加载提示词...</div>' : ''}
    ${(!state.promptRepo.loading && !state.promptRepo.items.length) ? '<div class="prompt-empty">没有匹配的提示词</div>' : ''}
    <div class="prompt-spacer" data-prompt-spacer="bottom" style="height:${esc(promptWindow.bottomPad || 0)}px"></div>
  `;
}
function renderPromptRepoOverlays() {
  return `
    ${state.promptRepo.detail ? renderPromptDetail(state.promptRepo.detail) : ''}
    ${state.promptRepo.imageViewer ? `<div class="viewer-layer" role="dialog" aria-modal="true" aria-label="提示词大图" tabindex="-1" data-modal-key="prompt-viewer" data-action="prompt-image-close"><button class="viewer-close" aria-label="关闭提示词大图" data-modal-autofocus data-action="prompt-image-close">×</button><img class="viewer-image" data-action="prompt-image-viewer-image" src="${esc(state.promptRepo.imageViewer)}" alt=""></div>` : ''}
  `;
}
function syncPromptRepoView() {
  if (!state.promptRepo?.open) return false;
  if (promptRepoScrollIsActive()) {
    deferredRenderPending = true;
    scheduleDeferredRender();
    return false;
  }
  const mount = $('#promptRepoMount');
  if (!mount) return false;
  const focusState = captureFocusState();
  const viewportSnapshot = capturePromptRepoViewportSnapshot();
  cancelPromptRepoVirtualRender({ preserveActivity: true });
  mount.innerHTML = renderPromptRepo();
  bindPromptRepoTransientEvents();
  syncModalAccessibility();
  const topDialog = topVisibleModal();
  if (!restoreFocusState(focusState, topDialog || document) && topDialog) focusTopModal(topDialog);
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
  const focusState = captureFocusState();
  host.innerHTML = renderPromptRepoOverlays();
  syncModalAccessibility();
  const topDialog = topVisibleModal();
  if (!restoreFocusState(focusState, topDialog || document) && topDialog) focusTopModal(topDialog);
  return true;
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
  const measured = state.promptRepo.virtualLayout;
  const hasReliableMeasurement = !!(measured
    && Number(measured.columns) > 0
    && Number(measured.rowPitch) > 0
    && Math.abs(Number(measured.viewportWidth || width) - width) < 80);
  const fallbackColumns = width <= 760 ? 1 : 3;
  const columns = hasReliableMeasurement ? Number(measured.columns) : fallbackColumns;
  const rowHeight = hasReliableMeasurement ? Number(measured.rowPitch) : 370;
  const rowGap = hasReliableMeasurement ? Math.max(0, Number(measured.rowGap) || 0) : 10;
  const scrollTop = Math.max(0, Number(state.promptRepo.scrollTop) || 0);
  const viewportHeight = Math.max(320, Number(state.promptRepo.viewportHeight) || 620);
  const shouldVirtualize = totalItems > PROMPT_VIRTUAL_THRESHOLD;
  if (!shouldVirtualize) return { shouldVirtualize, startIndex: 0, endIndex: totalItems, topPad: 0, bottomPad: 0 };
  const totalRows = Math.ceil(totalItems / columns);
  const bufferedRow = Math.max(0, Math.floor(scrollTop / rowHeight) - PROMPT_VIRTUAL_BUFFER_ROWS);
  const startRow = Math.floor(bufferedRow / PROMPT_VIRTUAL_WINDOW_STEP_ROWS) * PROMPT_VIRTUAL_WINDOW_STEP_ROWS;
  const visibleRows = Math.ceil(viewportHeight / rowHeight) + PROMPT_VIRTUAL_BUFFER_ROWS * 2;
  const endRow = Math.min(totalRows, startRow + visibleRows + PROMPT_VIRTUAL_WINDOW_STEP_ROWS);
  return {
    shouldVirtualize,
    startIndex: startRow * columns,
    endIndex: Math.min(totalItems, endRow * columns),
    topPad: startRow > 0 ? Math.max(0, startRow * rowHeight - rowGap) : 0,
    bottomPad: endRow < totalRows ? Math.max(0, (totalRows - endRow) * rowHeight - rowGap) : 0
  };
}
function promptRepoVirtualRangeChanged(windowState) {
  return state.promptRepo.renderedStartIndex !== windowState.startIndex
    || state.promptRepo.renderedEndIndex !== windowState.endIndex;
}
function syncPromptRepoListOnly(options = {}) {
  const promptList = $('#promptList');
  if (!promptList || !state.promptRepo?.open) return false;
  if (promptRepoScrollIsActive() && options.allowDuringScroll !== true) {
    promptRepoSyncPending = true;
    return false;
  }
  const promptWindow = promptRepoVirtualWindow(state.promptRepo.items.length);
  if (options.virtualScroll && !promptRepoVirtualRangeChanged(promptWindow)) return false;
  const scrollTop = promptList.scrollTop;
  if (options.virtualScroll && !promptRepoVirtualWindowNeedsRefresh(state.promptRepo.items.length)) return false;
  const focusedCardKey = document.activeElement?.closest?.('.prompt-card')?.dataset?.promptKey || '';
  const promptItems = state.promptRepo.items.slice(promptWindow.startIndex, promptWindow.endIndex);
  promptList.dataset.virtual = promptWindow.shouldVirtualize ? '1' : '0';
  promptList.classList.toggle('is-virtual', promptWindow.shouldVirtualize);
  const patched = options.virtualScroll
    && promptWindow.shouldVirtualize
    && !state.promptRepo.loading
    && patchPromptRepoVirtualDom(promptList, promptWindow, promptItems);
  if (!patched) {
    promptList.innerHTML = renderPromptRepoListContents(promptWindow, promptItems, {
      isInitialLoading: !!state.promptRepo.loading && !state.promptRepo.items.length,
      isAppending: !!state.promptRepo.loading && !!state.promptRepo.items.length,
      loadingLabel: state.promptRepo.loadingLabel || (state.promptRepo.query ? '搜索提示词中...' : '加载提示词中...')
    });
  }
  setScrollTopIfNeeded(promptList, scrollTop);
  if (focusedCardKey) {
    const restoredCard = promptList.querySelector(`.prompt-card[data-prompt-key="${cssEscape(focusedCardKey)}"]`);
    if (restoredCard) {
      try { restoredCard.focus({ preventScroll: true }); } catch { restoredCard.focus(); }
    }
  }
  if (promptRepoSyncPending) nextRenderFrame(() => {
    if (promptRepoScrollIsActive()) return;
    promptRepoSyncPending = false;
    syncPromptRepoListOnly({ virtualScroll: true, allowDuringScroll: true });
  });
  return true;
}
function patchPromptRepoVirtualDom(promptList, promptWindow, promptItems) {
  const currentCards = new Map($$('.prompt-card', promptList).map((card) => [String(card.dataset.promptKey || ''), card]));
  const existingSpacers = $$('.prompt-spacer', promptList);
  let topSpacer = promptList.querySelector('[data-prompt-spacer="top"]') || existingSpacers[0];
  let bottomSpacer = promptList.querySelector('[data-prompt-spacer="bottom"]') || existingSpacers[existingSpacers.length - 1];
  if (!topSpacer) topSpacer = createElementFromHtml('<div class="prompt-spacer" data-prompt-spacer="top"></div>');
  if (!bottomSpacer || bottomSpacer === topSpacer) bottomSpacer = createElementFromHtml('<div class="prompt-spacer" data-prompt-spacer="bottom"></div>');
  if (!topSpacer || !bottomSpacer) return false;
  topSpacer.dataset.promptSpacer = 'top';
  bottomSpacer.dataset.promptSpacer = 'bottom';
  const desiredNodes = [];
  const topHeight = Number(promptWindow.topPad) || 0;
  const bottomHeight = Number(promptWindow.bottomPad) || 0;
  topSpacer.style.height = `${topHeight}px`;
  bottomSpacer.style.height = `${bottomHeight}px`;
  topSpacer.style.display = topHeight > 0 ? '' : 'none';
  bottomSpacer.style.display = bottomHeight > 0 ? '' : 'none';
  desiredNodes.push(topSpacer);
  for (const [index, item] of promptItems.entries()) {
    const itemIndex = promptWindow.startIndex + index;
    const key = promptItemStableKey(item, itemIndex);
    let card = currentCards.get(key);
    if (!card) card = createElementFromHtml(renderPromptCard(item, itemIndex));
    if (!card) continue;
    card.dataset.index = String(itemIndex);
    card.dataset.promptKey = key;
    desiredNodes.push(card);
  }
  desiredNodes.push(bottomSpacer);
  const desiredSet = new Set(desiredNodes);
  for (const child of [...promptList.children]) {
    if (!desiredSet.has(child)) child.remove();
  }
  const currentOrder = [...promptList.children];
  const needsReorder = desiredNodes.length !== currentOrder.length
    || desiredNodes.some((node, index) => node !== currentOrder[index]);
  if (needsReorder) {
    const fragment = promptList.ownerDocument?.createDocumentFragment?.();
    if (fragment) {
      desiredNodes.forEach((node) => fragment.appendChild(node));
      promptList.appendChild(fragment);
    } else {
      let cursor = promptList.firstElementChild;
      for (const node of desiredNodes) {
        if (node !== cursor) promptList.insertBefore(node, cursor);
        cursor = node.nextElementSibling;
      }
    }
  }
  state.promptRepo.renderedStartIndex = promptWindow.startIndex;
  state.promptRepo.renderedEndIndex = promptWindow.endIndex;
  return true;
}
function promptRepoVirtualWindowRefreshMode(totalItems = state.promptRepo.items.length) {
  const virtualState = state.promptRepo || {};
  const layout = virtualState.virtualLayout;
  if (totalItems <= PROMPT_VIRTUAL_THRESHOLD || !layout) return { needed: false, immediate: false };
  const columns = Math.max(1, Number(layout.columns) || 1);
  const rowPitch = Math.max(1, Number(layout.rowPitch) || 370);
  const totalRows = Math.ceil(totalItems / columns);
  const startRow = Math.max(0, Math.floor(Number(virtualState.renderedStartIndex || 0) / columns));
  const endRow = Math.min(totalRows, Math.ceil(Number(virtualState.renderedEndIndex || 0) / columns));
  const scrollTop = Math.max(0, Number(virtualState.scrollTop) || 0);
  const viewportHeight = Math.max(320, Number(virtualState.viewportHeight) || 620);
  const safetyRows = Math.max(2, Math.floor(PROMPT_VIRTUAL_BUFFER_ROWS / 2));
  const topDistance = Math.max(0, startRow * rowPitch - scrollTop);
  const bottomDistance = Math.max(0, scrollTop + viewportHeight - endRow * rowPitch);
  const outside = topDistance > 0 || bottomDistance > 0;
  const nearStart = startRow > 0 && scrollTop < (startRow + safetyRows) * rowPitch;
  const nearEnd = endRow < totalRows && scrollTop + viewportHeight > Math.max(0, endRow - safetyRows) * rowPitch;
  const largeJump = promptRepoScrollDelta > viewportHeight * 1.5;
  const immediate = largeJump || outside;
  return { needed: outside || nearStart || nearEnd, immediate };
}
function promptRepoVirtualWindowNeedsRefresh(totalItems = state.promptRepo.items.length) {
  return promptRepoVirtualWindowRefreshMode(totalItems).needed;
}
function promptRepoVirtualWindowNeedsImmediateRefresh(totalItems = state.promptRepo.items.length) {
  return promptRepoVirtualWindowRefreshMode(totalItems).immediate;
}
function cancelPromptRepoVirtualRender(options = {}) {
  const preservePending = options.preserveActivity === true;
  const promptList = promptRepoScrollNode || $('#promptList');
  promptRepoVirtualRenderToken += 1;
  promptRepoEdgeCheckToken += 1;
  promptRepoScrollRestoreToken += 1;
  clearTimeout(promptRepoVirtualRenderTimer);
  cancelRenderFrame(promptRepoVirtualRenderFrame);
  cancelRenderFrame(promptRepoEdgeCheckFrame);
  clearTimeout(promptRepoEdgeCheckTimer);
  clearTimeout(promptRepoScrollIdleTimer);
  promptRepoVirtualRenderTimer = 0;
  promptRepoVirtualRenderFrame = 0;
  promptRepoEdgeCheckFrame = 0;
  promptRepoEdgeCheckTimer = 0;
  promptRepoEdgeCheckLastAt = 0;
  promptRepoScrollIdleTimer = 0;
  promptRepoScrollIdleNode = null;
  promptRepoScrollIdleGeneration = 0;
  promptRepoScrollDelta = 0;
  if (!preservePending) promptRepoSyncPending = false;
  promptRepoScrollGeneration += 1;
  promptRepoScrollNode = null;
  promptRepoScrollActivity = false;
  promptList?.classList?.remove('is-scrolling');
  syncWorkspaceScrollActivity();
  state.promptRepo.virtualRenderScheduled = false;
}
function schedulePromptRepoVirtualRender(options = {}) {
  const delay = Math.max(0, Number(options.delay) || 0);
  if (state.promptRepo.virtualRenderScheduled) {
    if (delay > 0 || !promptRepoVirtualRenderTimer) return;
    clearTimeout(promptRepoVirtualRenderTimer);
    promptRepoVirtualRenderTimer = 0;
    promptRepoVirtualRenderToken += 1;
    state.promptRepo.virtualRenderScheduled = false;
  }
  state.promptRepo.virtualRenderScheduled = true;
  const token = ++promptRepoVirtualRenderToken;
  const allowDuringScroll = options.allowDuringScroll === true || options.lightweightDuringScroll === true;
  const scrollNode = options.node || (options.lightweightDuringScroll === true ? promptRepoScrollNode : null);
  const scrollGeneration = options.generation === undefined
    ? (scrollNode ? promptRepoScrollGeneration : null)
    : Number(options.generation);
  const isValidScrollRun = () => !scrollNode || isCurrentPromptRepoScroll(scrollNode, scrollGeneration);
  const run = () => {
    if (token !== promptRepoVirtualRenderToken || !isValidScrollRun()) return;
    promptRepoVirtualRenderTimer = 0;
    promptRepoVirtualRenderFrame = 0;
    state.promptRepo.virtualRenderScheduled = false;
    syncPromptRepoListOnly({ virtualScroll: true, allowDuringScroll });
  };
  const enqueue = () => {
    if (token !== promptRepoVirtualRenderToken || !isValidScrollRun()) return;
    promptRepoVirtualRenderFrame = requestRenderFrame(run);
  };
  if (delay > 0) {
    promptRepoVirtualRenderTimer = setTimeout(() => {
      promptRepoVirtualRenderTimer = 0;
      enqueue();
    }, delay);
  } else {
    enqueue();
  }
}
function promptRepoScrollIsActive() {
  return promptRepoScrollActivity || $('#promptList')?.classList?.contains('is-scrolling') === true;
}
function setPromptRepoScrollActivity(active, node = $('#promptList'), generation = promptRepoScrollGeneration) {
  const list = node;
  const next = !!active;
  if (next && list && !isCurrentPromptRepoScroll(list, generation)) return false;
  const classMismatch = list?.classList?.contains('is-scrolling') !== next;
  if (promptRepoScrollActivity === next && !classMismatch) return true;
  promptRepoScrollActivity = next;
  if (list?.classList && list.classList.contains('is-scrolling') !== next) list.classList.toggle('is-scrolling', next);
  syncWorkspaceScrollActivity();
  return true;
}
function syncPromptRepoScrollPosition() {
  const list = $('#promptList');
  if (!list) return;
  const nextScrollTop = Number(list.scrollTop) || 0;
  promptRepoScrollDelta = Math.abs(nextScrollTop - (Number(state.promptRepo.scrollTop) || 0));
  state.promptRepo.scrollTop = nextScrollTop;
  state.promptRepo.viewportHeight = list.clientHeight || state.promptRepo.viewportHeight || 620;
}
function inspectPromptRepoScrollPosition() {
  const currentList = $('#promptList');
  if (!isCurrentPromptRepoScroll(currentList)) return;
  if (!currentList || currentList.dataset.virtual !== '1') return;
  if (!promptRepoVirtualWindowNeedsRefresh()) return;
  promptRepoSyncPending = true;
  const refreshMode = promptRepoVirtualWindowRefreshMode();
  if (refreshMode.immediate) {
    schedulePromptRepoVirtualRender({
      lightweightDuringScroll: true,
      node: currentList,
      generation: promptRepoScrollGeneration
    });
  }
}
function finishPromptRepoScroll(force = false, node = promptRepoScrollIdleNode || promptRepoScrollNode, generation = promptRepoScrollIdleGeneration || promptRepoScrollGeneration) {
  if (!isCurrentPromptRepoScroll(node, generation)) return;
  clearTimeout(promptRepoScrollIdleTimer);
  promptRepoScrollIdleTimer = 0;
  const remaining = SCROLL_END_FALLBACK_DELAY - (Date.now() - promptRepoScrollLastAt);
  if (!force && remaining > 0) {
    promptRepoScrollIdleNode = node;
    promptRepoScrollIdleGeneration = generation;
    promptRepoScrollIdleTimer = setTimeout(finishPromptRepoScroll, remaining);
    return;
  }
  syncPromptRepoScrollPosition();
  inspectPromptRepoScrollPosition();
  setPromptRepoScrollActivity(false);
  promptRepoScrollIdleNode = null;
  promptRepoScrollIdleGeneration = 0;
  if (deferredRenderPending) {
    scheduleDeferredRender();
    promptRepoScrollDelta = 0;
    return;
  }
  const currentList = $('#promptList');
  if (currentList?.dataset.virtual === '1') {
    promptRepoSyncPending = false;
    schedulePromptRepoVirtualRender();
  }
  promptRepoScrollDelta = 0;
  if (currentList) schedulePromptRepoEdgeCheck(currentList, generation);
  scheduleDeferredRender();
}
function finishPromptRepoScrollForNode(force, node, generation) {
  return finishPromptRepoScroll(force, node, generation);
}
function schedulePromptRepoScrollRender() {
  const options = arguments[0] || {};
  promptRepoScrollLastAt = Date.now();
  const promptList = options.node || $('#promptList');
  const generation = options.generation === undefined ? promptRepoScrollGeneration : Number(options.generation);
  if (!isCurrentPromptRepoScroll(promptList, generation)) return;
  setPromptRepoScrollActivity(true);
  syncPromptRepoScrollPosition();
  inspectPromptRepoScrollPosition();
  promptRepoScrollIdleNode = promptList;
  promptRepoScrollIdleGeneration = generation;
  if (!promptRepoScrollIdleTimer) promptRepoScrollIdleTimer = setTimeout(finishPromptRepoScroll, SCROLL_END_FALLBACK_DELAY);
}
function schedulePromptRepoEdgeCheck(promptList) {
  const generation = arguments[1] === undefined ? promptRepoScrollGeneration : Number(arguments[1]);
  if (!isCurrentPromptRepoScroll(promptList, generation) || promptRepoEdgeCheckFrame || promptRepoEdgeCheckTimer) return;
  const elapsed = Date.now() - promptRepoEdgeCheckLastAt;
  if (elapsed < 120) {
    promptRepoEdgeCheckTimer = setTimeout(() => {
      promptRepoEdgeCheckTimer = 0;
      schedulePromptRepoEdgeCheck(promptList, generation);
    }, 120 - elapsed);
    return;
  }
  const token = ++promptRepoEdgeCheckToken;
  promptRepoEdgeCheckFrame = requestRenderFrame(() => {
    promptRepoEdgeCheckFrame = 0;
    if (token !== promptRepoEdgeCheckToken || !isCurrentPromptRepoScroll(promptList, generation)) return;
    const remaining = Number(state.promptRepo.scrollLockUntil || 0) - Date.now();
    if (remaining > 0) {
      promptRepoEdgeCheckTimer = setTimeout(() => {
        promptRepoEdgeCheckTimer = 0;
        schedulePromptRepoEdgeCheck(promptList, generation);
      }, remaining);
      return;
    }
    promptRepoEdgeCheckLastAt = Date.now();
    const bottom = Number(promptList.scrollTop) + Number(promptList.clientHeight);
    if (bottom > Number(promptList.scrollHeight) - 320) void loadPromptPage();
  });
}
function measurePromptRepoVirtualLayout(promptList = $('#promptList')) {
  if (!promptList) return null;
  const cards = [...promptList.querySelectorAll('.prompt-card:not(.prompt-skeleton)')].slice(0, 12);
  if (!cards.length) return null;
  const rects = cards.map((card) => card.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;
  const firstTop = rects[0].top;
  const columns = Math.max(1, rects.filter((rect) => Math.abs(rect.top - firstTop) < 2).length);
  const nextRow = rects.find((rect) => rect.top - firstTop > 2);
  const styles = typeof getComputedStyle === 'function' ? getComputedStyle(promptList) : null;
  const rowGap = Number.parseFloat(styles?.rowGap || styles?.gap || '') || 0;
  const rowPitch = nextRow ? nextRow.top - firstTop : rects[0].height + rowGap;
  if (!Number.isFinite(rowPitch) || rowPitch <= 0) return null;
  state.promptRepo.virtualLayout = {
    columns,
    rowPitch,
    rowGap,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth || promptList.clientWidth : promptList.clientWidth,
    containerWidth: promptList.clientWidth
  };
  return state.promptRepo.virtualLayout;
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
function promptItemStableKey(item, index = 0) {
  const category = String(firstDefined(item?.c, item?.category) || '');
  const source = normalizePromptImageUrl(promptItemImageSource(item));
  return JSON.stringify([category, source, String(item?.id || ''), Math.max(0, Number(index) || 0)]);
}
function renderPromptCard(item, index = 0) {
  const originalUrl = normalizePromptImageUrl(promptItemImageSource(item));
  const imageUrl = promptThumbUrl(originalUrl);
  const fetchPriority = index < 12 ? 'high' : 'low';
  const promptKey = promptItemStableKey(item, index);
  return `
    <button class="prompt-card" data-action="prompt-detail" data-id="${esc(item.id)}" data-index="${esc(index)}" data-prompt-key="${esc(promptKey)}">
      ${imageUrl ? `
        <span class="prompt-card-media">
          <img src="${esc(imageUrl)}" data-original-src="${esc(originalUrl)}" referrerpolicy="no-referrer" loading="${index < 12 ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${fetchPriority}" width="420" height="263" alt="" onerror="var f=this.dataset.originalSrc;if(f&&this.src!==f){this.src=f;this.dataset.originalSrc='';return;}var c=this.closest('.prompt-card');if(c)c.classList.add('image-failed');this.remove();">
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
  const configuredIndex = Number(state.promptRepo.detailIndex);
  const itemIndex = Number.isInteger(configuredIndex) && state.promptRepo.items[configuredIndex]
    ? configuredIndex
    : state.promptRepo.items.indexOf(item);
  return `
    <div class="modal-layer" style="background:rgba(0,0,0,.18)" data-action="prompt-detail-close">
      <div class="size-modal prompt-full-modal" role="dialog" aria-modal="true" aria-labelledby="promptDetailTitle" tabindex="-1" data-modal-key="prompt-detail" data-stop>
        <button class="modal-close" aria-label="关闭提示词详情" data-modal-autofocus data-action="prompt-detail-close">×</button>
        <h2 id="promptDetailTitle">${esc(item.t || '提示词详情')}</h2>
        ${imageUrl ? `<button type="button" class="prompt-detail-image-button" data-action="prompt-image-view" aria-label="查看提示词原图"><img src="${esc(imageUrl)}" referrerpolicy="no-referrer" loading="eager" decoding="async" alt=""></button>` : ''}
        <div class="prompt-detail-text-label">完整提示词</div>
        <div class="prompt-detail-text">${esc(item.p || '')}</div>
        <div class="detail-actions"><button class="reuse" data-action="use-prompt" data-id="${esc(item.id)}" data-index="${esc(itemIndex)}">使用提示词</button></div>
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
      <div class="workflow-invoke-modal" role="dialog" aria-modal="true" aria-labelledby="workflowInvokeTitle" tabindex="-1" data-modal-key="workflow-invoke" data-stop>
        <button class="modal-close" aria-label="关闭工作流调用" data-action="close-workflow-invoke">×</button>
        <div class="workflow-editor-head">
          <div>
            <div class="detail-section-label">调用工作流</div>
            <h2 id="workflowInvokeTitle">${esc(workflow?.name || '未命名工作流')}</h2>
            <p class="project-meta">像 skill 一样复用当前项目工作流。确认变量、预算和并发后才会开始批量生图。</p>
          </div>
          <div class="workflow-estimate">预计 ${esc(totalImages)} 张</div>
        </div>
        <div class="workflow-settings-grid">
          <label class="control-chip"><small>每行数量</small><input type="number" min="1" max="8" value="${esc(invoke.countPerRow || 1)}" data-action="workflow-invoke-number" data-field="countPerRow" data-modal-autofocus></label>
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
    <section class="mask-layer" role="dialog" aria-modal="true" aria-label="编辑遮罩" tabindex="-1" data-modal-key="mask-editor">
      <div class="mask-topbar">
        <button class="mask-close" aria-label="关闭遮罩编辑器" data-modal-autofocus data-action="close-mask-editor" style="position:static">×</button>
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
  $$('[data-action="open-viewer"][role="button"]').forEach((node) => {
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      node.click();
    });
  });
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
    const galleryGeneration = adoptGalleryScrollNode(galleryScroll);
    galleryResizeObserver?.disconnect();
    state.galleryVirtual = {
      ...(state.galleryVirtual || {}),
      scrollTop: galleryScroll.scrollTop || state.galleryVirtual?.scrollTop || 0,
      viewportHeight: galleryScroll.clientHeight || state.galleryVirtual?.viewportHeight || 720,
      viewportWidth: galleryScroll.clientWidth || state.galleryVirtual?.viewportWidth || 0
    };
    const galleryLayoutChanged = syncGalleryLayoutMetrics({ render: false });
    if (galleryLayoutChanged && galleryScroll.dataset.virtual === '1') {
      renderGalleryListOnly({ layoutChanged: true });
    }
    if (typeof ResizeObserver === 'function') {
      galleryResizeObserver = new ResizeObserver(() => scheduleGalleryLayoutSync());
      galleryResizeObserver.observe(galleryScroll);
    }
    galleryScroll.addEventListener('scroll', () => {
      if (!isCurrentGalleryScroll(galleryScroll, galleryGeneration)) return;
      if (state.imageContextMenu) {
        closeImageContextMenu();
      }
      galleryScrollRestoreToken += 1;
      scheduleGalleryScrollRender({ node: galleryScroll, generation: galleryGeneration });
    }, { passive: true });
    bindScrollActivityPrimers(galleryScroll, () => scheduleGalleryScrollRender({ node: galleryScroll, generation: galleryGeneration }));
    if (supportsNativeScrollEnd(galleryScroll)) {
      const finishGalleryScroll = () => {
        if (!isCurrentGalleryScroll(galleryScroll, galleryGeneration)) return;
        finishGalleryScrollForNode(false, galleryScroll, galleryGeneration);
      };
      galleryScroll.addEventListener('scrollend', () => finishGalleryScroll(), { passive: true });
    }
  }
  const workflowScroll = $('.workflow-manager-scroll');
  if (workflowScroll) {
    workflowScroll.addEventListener('scroll', () => {
      workflowScrollRestoreToken += 1;
      setWorkflowScrollActivity(true);
      scheduleWorkflowScrollCapture();
    }, { passive: true });
    bindScrollActivityPrimers(workflowScroll, scheduleWorkflowScrollCapture);
    if (supportsNativeScrollEnd(workflowScroll)) {
      workflowScroll.addEventListener('scrollend', () => finishWorkflowScroll(), { passive: true });
    }
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
  if (agentLog) {
    agentLog.addEventListener('scroll', () => {
      agentScrollRestoreToken += 1;
      state.agentScrollIntent = '';
      scheduleAgentScrollStateCapture();
    }, { passive: true });
    bindScrollActivityPrimers(agentLog, scheduleAgentScrollStateCapture);
    if (supportsNativeScrollEnd(agentLog)) {
      agentLog.addEventListener('scrollend', () => finishAgentScroll(), { passive: true });
    }
  }
}
function bindPromptRepoTransientEvents() {
  const promptList = $('#promptList');
  const promptGeneration = promptList ? adoptPromptRepoScrollNode(promptList) : promptRepoScrollGeneration;
  if (promptList && !promptList.dataset.boundPromptRepo) {
    measurePromptRepoVirtualLayout(promptList);
    if (typeof ResizeObserver === 'function') {
      promptRepoResizeObserver?.disconnect();
      promptRepoResizeObserver = new ResizeObserver((entries) => {
        const width = Number(entries[0]?.contentRect?.width || promptList.clientWidth || 0);
        const measuredWidth = Number(state.promptRepo.virtualLayout?.containerWidth || 0);
        const viewportWidth = Number(window.innerWidth || width);
        const measuredViewportWidth = Number(state.promptRepo.virtualLayout?.viewportWidth || viewportWidth);
        const crossedMobileBreakpoint = (viewportWidth <= 760) !== (measuredViewportWidth <= 760);
        if (!width || !measuredWidth || (!crossedMobileBreakpoint && Math.abs(width - measuredWidth) < 40)) return;
        const updatedLayout = measurePromptRepoVirtualLayout(promptList);
        if (updatedLayout) schedulePromptRepoVirtualRender();
      });
      promptRepoResizeObserver.observe(promptList);
    }
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
      if (!isCurrentPromptRepoScroll(promptList, promptGeneration)) return;
      promptRepoScrollRestoreToken += 1;
      schedulePromptRepoScrollRender({ node: promptList, generation: promptGeneration });
    }, { passive: true });
    bindScrollActivityPrimers(promptList, () => schedulePromptRepoScrollRender({ node: promptList, generation: promptGeneration }));
    if (supportsNativeScrollEnd(promptList)) {
      const finishPromptRepoScroll = () => {
        if (!isCurrentPromptRepoScroll(promptList, promptGeneration)) return;
        finishPromptRepoScrollForNode(false, promptList, promptGeneration);
      };
      promptList.addEventListener('scrollend', () => finishPromptRepoScroll(), { passive: true });
    }
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
        promptRepoScrollRestoreToken += 1;
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
  if (state.imageContextMenu || state.viewer || img) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (!img) {
    if (state.imageContextMenu) {
      closeImageContextMenu();
    }
    return;
  }
  const menu = imageContextFromElement(img, event);
  if (!menu) return;
  event.preventDefault();
  imageContextMenuOpener = img;
  state.imageContextMenu = { ...menu, copyRequestId: uid('copy'), copyState: 'loading' };
  syncImageContextMenu();
  prepareImageContextMenuCopy(state.imageContextMenu);
});
document.addEventListener('click', (event) => {
  if (!state.imageContextMenu) return;
  if (event.target.closest?.('.image-context-menu')) return;
  const actionTarget = event.target.closest?.('[data-action]');
  const keepsViewerClick = event.target.closest?.('.viewer-close')
    || ['close-viewer', 'close-modal', 'close-modal-bg'].includes(actionTarget?.dataset?.action);
  closeImageContextMenu();
  if (keepsViewerClick) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
document.addEventListener('error', handleManagedImageLoadError, true);
document.addEventListener('load', handleManagedImageLoad, true);
if (typeof window !== 'undefined' && window.addEventListener) {
  document.addEventListener('scroll', () => {
    if (!state.imageContextMenu) return;
    closeImageContextMenu();
  }, { passive: true, capture: true });
  window.addEventListener('resize', () => {
    if (!state.imageContextMenu) return;
    closeImageContextMenu();
  }, { passive: true });
}

document.addEventListener('click', async (event) => {
  markUserInteractionRender();
  const target = event.target.closest('[data-action]');
  if (!target) {
    if (state.imageContextMenu && !event.target.closest('.image-context-menu')) closeImageContextMenu();
    if (state.popover && !event.target.closest('.popover')) { state.popover = null; render(); }
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
    if (action !== 'close-viewer') {
      closeImageContextMenu();
      event.preventDefault();
      return;
    }
    closeImageContextMenu();
  }
  if (action === 'close-image-menu') { event.preventDefault(); closeImageContextMenu(); return; }
  if (action === 'copy-image') { event.preventDefault(); const menu = state.imageContextMenu; await copyImageFromMenu(); closeImageContextMenuIfCurrent(menu); return; }
  if (action === 'download-image') { event.preventDefault(); const menu = state.imageContextMenu; await downloadImageFromMenuOrTarget(target); closeImageContextMenuIfCurrent(menu); return; }
  if (action === 'edit-image-source') { event.preventDefault(); await editImageFromMenu(); return; }
  if (action === 'set-mode') { state.mode = target.dataset.mode; if (state.mode === 'workflow') state.agent.view = 'workflows'; persistRender(); return; }
  if (action === 'agent-view') { state.agent.view = target.dataset.view || 'chat'; persistRender(); return; }
  if (action === 'toggle-project-prompt') { state.agent.promptOpen = !state.agent.promptOpen; persistRender(); return; }
  if (action === 'open-agent-project-menu') {
    state.popover = { type: 'agent-project-menu', rect: target.getBoundingClientRect() };
    render();
    return;
  }
  if (action === 'agent-project-switch') {
    captureAgentScrollState();
    state.agent.activeProjectId = target.dataset.id;
    ensureAgentProjectThread(target.dataset.id);
    state.popover = null;
    state.agentScrollIntent = '';
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
    state.agentScrollIntent = '';
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
    state.agentScrollIntent = '';
    persistRender();
    return;
  }
  if (action === 'clear-agent-thread') { await clearActiveAgentThread(); return; }
  if (action === 'agent-load-earlier') { loadEarlierAgentMessages(target.dataset.threadId); return; }
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
    captureAgentScrollState();
    state.agent.activeProjectId = target.value;
    ensureAgentProjectThread(target.value);
    state.agentScrollIntent = '';
    persistRender();
    return;
  }
  if (action === 'new-project') { await newProject(); return; }
  if (action === 'delete-project') { deleteProject(); return; }
  if (action === 'new-workflow-draft') { rememberModalOpener('workflow-editor', target); newWorkflowDraft(); return; }
  if (action === 'save-workflow-draft') { saveWorkflowDraft(); return; }
  if (action === 'cancel-workflow-draft') { state.workflowDraft = null; render(); return; }
  if (action === 'invoke-workflow') { rememberModalOpener('workflow-invoke', target); openWorkflowInvoke(target.dataset.id); return; }
  if (action === 'edit-workflow') { rememberModalOpener('workflow-editor', target); editWorkflow(target.dataset.id); return; }
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
  if (action === 'retry-task-history') { await retryTaskHistory(); return; }
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
  if (action === 'download-stream-preview') { await downloadStreamPreview(target.dataset.taskId, Number(target.dataset.index) || 0); return; }
  if (action === 'open-detail') { openTaskDetail(target.dataset.id, target); return; }
  if (action === 'close-modal' || action === 'close-modal-bg') { closeTaskDetail(); return; }
  if (action === 'detail-image-prev' || action === 'detail-image-next' || action === 'detail-image-select') { setDetailImage(target.dataset.id, action === 'detail-image-select' ? Number(target.dataset.index) : action === 'detail-image-next' ? 1 : -1, action !== 'detail-image-select'); return; }
  if (action === 'open-task-reference-viewer') { event.preventDefault(); event.stopPropagation(); openTaskReferenceViewer(target.dataset.taskId, Number(target.dataset.refIndex) || 0); return; }
  if (action === 'open-viewer') { state.viewer = { taskId: target.dataset.taskId, index: Number(target.dataset.index) || 0 }; render(); return; }
  if (action === 'viewer-image' || action === 'viewer-stage') { return; }
  if (action === 'viewer-prev' || action === 'viewer-next') { setViewerImage(action === 'viewer-next' ? 1 : -1); return; }
  if (action === 'close-viewer') { closeImageContextMenu(); state.viewer = null; render(); return; }
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
  if (action === 'open-prompt-repo') { rememberModalOpener('prompt-repo', target); openPromptRepo(); return; }
  if (action === 'close-prompt-repo') {
    state.promptRepo.open = false;
    state.promptRepo.detail = null;
    delete state.promptRepo.detailIndex;
    delete state.promptRepo.detailKey;
    render();
    return;
  }
  if (action === 'prompt-category') { setPromptCategory(target.dataset.cat || 'all'); return; }
  if (action === 'prompt-detail') {
    const requestedIndex = Number(target.dataset.index);
    const index = Number.isInteger(requestedIndex) && state.promptRepo.items[requestedIndex]
      ? requestedIndex
      : state.promptRepo.items.findIndex((p) => String(p.id) === String(target.dataset.id));
    const item = index >= 0 ? state.promptRepo.items[index] : null;
    if (!item) return;
    const snapshot = consumePromptRepoPointerSnapshot() || capturePromptRepoViewportSnapshot();
    rememberModalOpener('prompt-detail', target);
    state.promptRepo.detailReturnSnapshot = snapshot;
    state.promptRepo.detailIndex = index;
    state.promptRepo.detailKey = promptItemStableKey(item, index);
    state.promptRepo.detail = item;
    if (!syncPromptRepoOverlays()) render();
    stabilizePromptRepoViewport(snapshot);
    if (promptItemNeedsHydration(item)) hydratePromptDetailItem(item);
    return;
  }
  if (action === 'prompt-detail-close') { closePromptRepoDetailOverlay(); return; }
  if (action === 'use-prompt') { await usePrompt(target.dataset.id, target.dataset.index); return; }
  if (action === 'prompt-image-view') {
    rememberModalOpener('prompt-viewer', target);
    const image = target.matches?.('img') ? target : $('img', target);
    state.promptRepo.imageViewer = image?.currentSrc || image?.src || '';
    if (!state.promptRepo.imageViewer) return;
    if (!syncPromptRepoOverlays()) render();
    return;
  }
  if (action === 'prompt-image-viewer-image') return;
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
  if (action === 'agent-workflow' || action === 'agent-run') { rememberModalOpener('workflow-editor', target); await generateWorkflowFromAgent(); return; }
  if (action === 'new-series-workflow') { rememberModalOpener('workflow-editor', target); newSeriesWorkflowDraft(); return; }
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
      touchTaskPersistence(task);
      writeStore();
    }
  }
  if (action === 'mask-size' && state.maskEditor) {
    state.maskEditor.brushSize = Math.max(4, Math.min(160, Number(event.target.value) || 64));
    updateMaskToolUi();
  }
});
document.addEventListener('focusin', (event) => {
  if (event.target.closest?.('.image-context-menu')) return;
  const topDialog = topVisibleModal();
  if (!topDialog || topDialog.contains(event.target)) return;
  focusTopModal(topDialog);
});
document.addEventListener('keydown', (event) => {
  markUserInteractionRender();
  if (event.key === 'Escape') {
    event.preventDefault();
    if (state.imageContextMenu) { closeImageContextMenu(); return; }
    if (state.viewer) { state.viewer = null; render(); return; }
    if (state.popover) { state.popover = null; render(); return; }
    if (state.promptRepo.imageViewer) { closePromptRepoImageViewerOverlay(); return; }
    if (state.promptRepo.detail) { closePromptRepoDetailOverlay(); return; }
    if (state.modal) { closeTaskDetail(); return; }
    if (state.workflowInvoke) { state.workflowInvoke = null; render(); return; }
    if (state.workflowDraft) { state.workflowDraft = null; render(); return; }
    if (state.entryAdvancedModal) { state.entryAdvancedModal = null; render(); return; }
    if (state.maskEditor) { state.maskEditor = null; render(); return; }
    if (state.promptRepo.open) { state.promptRepo.open = false; render(); return; }
  }
  if (state.imageContextMenu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    moveImageContextMenuFocus(event.key);
    return;
  }
  const keyboardScope = state.imageContextMenu ? $('.image-context-menu') : topVisibleModal();
  if (event.key === 'Tab' && keyboardScope) {
    const focusable = modalFocusableNodes(keyboardScope);
    const first = focusable[0] || keyboardScope;
    const last = focusable[focusable.length - 1] || keyboardScope;
    const activeInside = keyboardScope.contains(document.activeElement);
    if (!activeInside || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }
  if (!state.viewer) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    setViewerImage(event.key === 'ArrowRight' ? 1 : -1);
  }
});

function persistRender() {
  const persisted = writeStore();
  render();
  return persisted;
}
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * .48)}px`;
}
function setPopoverValue(type, value) {
  if (type === 'quality') state.settings.quality = normalizeImageQuality(value);
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
    const current = findImageProfileById(settings.profileId) || profile;
    const idx = profiles.indexOf(current);
    const next = specified || (profiles.length ? profiles[(idx + 1 + profiles.length) % profiles.length] : null);
    if (next) settings.profileId = profileSelectionKey(next);
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
    settings.quality = normalizeImageQuality(value || nextFromList(['auto', 'low', 'medium', 'high'], normalizeImageQuality(settings.quality)));
  } else if (field === 'output_format') {
    settings.output_format = value || nextFromList(['png', 'jpeg', 'webp'], settings.output_format || 'png');
  } else if (field === 'transparent_output') {
    settings.transparent_output = value === undefined ? !settings.transparent_output : value === 'true' || value === '是';
    settings.output_format = 'png';
  } else if (field === 'n') {
    settings.n = value ? Math.max(1, Math.min(8, Number(value) || 1)) : ((Number(settings.n) || 1) % 8) + 1;
  }
  state.agent.imageSettings = settings;
  state.popover = null;
  writeStore();
  render();
}
function setAgentPopoverValue(type, value) {
  const settings = agentImageSettings();
  if (type === 'agent-quality') settings.quality = normalizeImageQuality(value);
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
  const stack = $('#toastStack') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toast-stack', id: 'toastStack', ariaLive: 'polite' }));
  stack.setAttribute?.('aria-live', 'polite');
  stack.setAttribute?.('aria-atomic', 'false');
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

async function loadRuntime(options = {}) {
  const preserveComposerSession = !!options.preserveComposerSession;
  const previousSignature = runtimeRenderSignature();
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
  const previousActiveProfileId = state.activeProfileId;
  const previousImageProfileId = state.activeImageProfileId;
  state.profiles = Array.isArray(runtime?.profiles) && runtime.profiles.length ? runtime.profiles : [{
    id: runtime?.activeProfileId || 'default-openai',
    name: 'OpenAI',
    provider: 'openai',
    model: runtime?.defaultModel || 'gpt-image-2',
    apiMode: runtime?.apiMode || 'images'
  }];
  const retainedActiveProfile = preserveComposerSession ? findProfileBySelectionKey(state.profiles, previousActiveProfileId) : null;
  const runtimeActiveProfile = findProfileBySelectionKey(state.profiles, runtime?.activeProfileId);
  state.activeProfileId = profileSelectionKey(retainedActiveProfile || runtimeActiveProfile || state.profiles[0]);
  const retainedImageProfile = preserveComposerSession ? findImageProfileById(previousImageProfileId) : null;
  const runtimeImageProfile = findImageProfileById(runtime?.activeImageProfileId) || findImageProfileById(runtime?.activeProfileId);
  state.activeImageProfileId = profileSelectionKey(retainedImageProfile || runtimeImageProfile || imageProfiles()[0] || imageProfile());
  state.agentConfig = {
    mode: runtime?.agentApiConfigMode || 'off',
    textProfileId: runtime?.agentTextProfileId || null,
    imageProfileId: runtime?.agentImageProfileId || null,
    webSearchEnabled: !!runtime?.agentWebSearch,
    scrollAfterSubmit: runtime?.agentScrollToBottomAfterSubmit !== false
  };
  if (!state.agentConfig.webSearchEnabled) state.agent.webMode = 'off';
  if (!preserveComposerSession) {
    const nextSettings = { ...state.settings };
    if (runtimeHas('quality')) nextSettings.quality = normalizeImageQuality(runtime.quality);
    if (runtimeHas('output_format')) nextSettings.output_format = runtime.output_format || 'png';
    if (runtimeHas('output_compression')) nextSettings.output_compression = runtime.output_compression === null ? null : runtime.output_compression ?? 90;
    if (runtimeHas('n')) nextSettings.n = Number(runtime.n) || 1;
    if (runtimeHas('transparent_output')) nextSettings.transparent_output = !!runtime.transparent_output;
    if (runtimeHas('moderation')) nextSettings.moderation = runtime.moderation || 'auto';
    Object.assign(state.settings, nextSettings);
  }
  writeComposerSessionSettings();
  return previousSignature !== runtimeRenderSignature();
}
function runtimeRenderSignature() {
  return JSON.stringify({
    user: state.user ? { id: state.user.id, username: state.user.username, role: state.user.role } : null,
    preferences: state.preferences,
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
    activeImageProfileId: state.activeImageProfileId,
    agentConfig: state.agentConfig
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
function imageResponseError(message, code, stage, detail = '') {
  const error = new Error(message);
  error.code = code;
  error.stage = stage;
  error.detail = detail || message;
  return error;
}
function classifyImageResponse(contentType, firstChunk = '') {
  const normalizedType = String(contentType || '').toLowerCase();
  const prefix = String(firstChunk || '').replace(/^\uFEFF/, '').trimStart();
  if (/^(?:data|event|id|retry)\s*:/i.test(prefix) || prefix.startsWith(':')) return 'sse-sniffed';
  if (prefix.startsWith('{') || prefix.startsWith('[')) return 'json';
  if (normalizedType.includes('text/event-stream')) return 'sse';
  const lowerPrefix = prefix.toLowerCase();
  if (!lowerPrefix || ['data:', 'event:'].some((marker) => marker.startsWith(lowerPrefix))) return 'undetermined';
  return 'json';
}
function imageResponseTiming(response, startedAt, responseHeaderMs = 0) {
  return {
    responseHeaderMs: Math.max(0, Number(responseHeaderMs) || 0),
    streamReadMs: Math.max(0, Date.now() - startedAt),
    upstreamHeaderMs: Math.max(0, Number(response?.headers?.get?.('X-GPT-Image-Upstream-Ms')) || 0),
    proxyHeaderMs: Math.max(0, Number(response?.headers?.get?.('X-GPT-Image-Proxy-Ms')) || 0)
  };
}
function attachImageResponseMetadata(payload, metadata = {}) {
  const target = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : { data: Array.isArray(payload) ? payload : [] };
  target.responseMode = metadata.responseMode || target.responseMode || 'json';
  target.completionReason = target.completionReason || metadata.completionReason || (target.responseMode === 'json' ? 'json-response' : '');
  target.timing = { ...(target.timing || {}), ...(metadata.timing || {}) };
  return target;
}
async function readableBodyText(body) {
  const reader = body?.getReader?.();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
function isImageContentType(value) {
  return normalizeImageMime(value).startsWith('image/');
}
async function readableBodyBytes(body, maxBytes = IMAGE_BINARY_RESPONSE_LIMIT) {
  const reader = body?.getReader?.();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel?.().catch?.(() => {});
      throw imageResponseError('图片响应超过本地安全上限', 'IMAGE_RESPONSE_TOO_LARGE', 'response-read');
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
function imageResponseWithBody(response, body) {
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    body,
    text: () => readableBodyText(body)
  };
}
function imageTextStreamResponse(text, response) {
  const bytes = new TextEncoder().encode(text);
  let sent = false;
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { value: undefined, done: true };
          sent = true;
          return { value: bytes, done: false };
        },
        cancel: async () => { sent = true; }
      })
    }
  };
}
async function consumeImageHttpResponse(response, options = {}) {
  const startedAt = Date.now();
  let readableResponse = response;
  const contentType = response?.headers?.get?.('Content-Type') || '';
  const proxyProbed = response?.headers?.get?.('X-GPT-Image-Proxy-Probed') === '1';
  let responseMode = classifyImageResponse(contentType);
  if (isImageContentType(contentType)) responseMode = 'binary';
  if (proxyProbed && responseMode === 'undetermined') responseMode = 'json';
  if (!proxyProbed && responseMode !== 'binary' && response?.body?.tee) {
    const [probeBody, replayBody] = response.body.tee();
    const probeReader = probeBody.getReader();
    const decoder = new TextDecoder();
    let prefix = '';
    const probeBytes = [];
    let sniffedMime = '';
    try {
      while (prefix.length < 8192) {
        const { value, done } = await probeReader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
        if (probeBytes.length < 64) probeBytes.push(...chunk.subarray(0, 64 - probeBytes.length));
        prefix += decoder.decode(value, { stream: true });
        sniffedMime = detectImageMimeFromBytes(new Uint8Array(probeBytes));
        if (sniffedMime || classifyImageResponse(contentType, prefix) !== 'undetermined') break;
      }
    } finally {
      probeReader.cancel().catch(() => {});
    }
    responseMode = sniffedMime ? 'binary' : classifyImageResponse(contentType, prefix);
    if (responseMode === 'undetermined') responseMode = 'json';
    readableResponse = imageResponseWithBody(response, replayBody);
  }
  if (responseMode === 'undetermined') responseMode = 'json';
  if (responseMode === 'binary') {
    if (!response.ok) {
      const text = await readableResponse.text().catch(() => '');
      throw imageResponseError(response.statusText || '图片响应失败', 'IMAGE_RESPONSE_HTTP_ERROR', 'response-headers', text);
    }
    const bytes = await readableBodyBytes(readableResponse.body);
    const mime = detectImageMimeFromBytes(bytes);
    if (!bytes.length || !mime) {
      throw imageResponseError('图片响应包含无法识别的图片数据', 'IMAGE_RESPONSE_IMAGE_DATA_INVALID', 'response-parse');
    }
    return attachImageResponseMetadata({
      data: [{
        data_url: bytesToImageDataUrl(bytes, mime),
        mime_type: mime,
        output_format: imageFormatFromMime(mime)
      }]
    }, {
      responseMode: 'binary',
      completionReason: 'binary-response',
      timing: imageResponseTiming(response, startedAt, options.responseHeaderMs)
    });
  }
  if (responseMode === 'sse' || responseMode === 'sse-sniffed') {
    if (!response.ok) {
      const text = await readableResponse.text().catch(() => '');
      throw imageResponseError(response.statusText || '图片流请求失败', 'IMAGE_STREAM_HTTP_ERROR', 'response-headers', text);
    }
    try {
      const payload = await consumeImageStream(readableResponse, options.onPartialImage);
      return attachImageResponseMetadata(payload, {
        responseMode,
        timing: imageResponseTiming(response, startedAt, options.responseHeaderMs)
      });
    } catch (error) {
      error.responseMode = responseMode;
      error.timing = imageResponseTiming(response, startedAt, options.responseHeaderMs);
      throw error;
    }
  }
  const text = await readableResponse.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
     if (/^\s*(?:data|event|id|retry)\s*:/i.test(text) || /^\s*:/i.test(text)) {
      const streamResponse = imageTextStreamResponse(text, response);
      const payload = await consumeImageStream(streamResponse, options.onPartialImage);
      return attachImageResponseMetadata(payload, {
        responseMode: 'sse-sniffed',
        timing: imageResponseTiming(response, startedAt, options.responseHeaderMs)
      });
    }
    const error = imageResponseError('图片接口返回了无法解析的响应', 'IMAGE_RESPONSE_INVALID_JSON', 'response-parse', text.slice(0, 2000));
    error.responseMode = responseMode;
    error.timing = imageResponseTiming(response, startedAt, options.responseHeaderMs);
    throw error;
  }
  if (!response.ok) {
    const normalized = normalizeError(data || response.statusText, response.statusText || '图片请求失败');
    const error = imageResponseError(normalized.summary, normalized.code || response.status, 'response-status', normalized.detail);
    error.status = response.status;
    error.raw = data;
    error.responseMode = responseMode;
    error.timing = imageResponseTiming(response, startedAt, options.responseHeaderMs);
    throw error;
  }
  return attachImageResponseMetadata(data, {
    responseMode: 'json',
    timing: imageResponseTiming(response, startedAt, options.responseHeaderMs)
  });
}
async function fetchImageHttpResponse(url, fetchOptions = {}, responseOptions = {}) {
  const requestStartedAt = Date.now();
  const controller = new AbortController();
  const timeoutSeconds = Math.max(1, Math.min(Number(responseOptions.timeoutSeconds) || 600, 6000));
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutSeconds * 1000);
  timeoutId.unref?.();
  const externalSignal = fetchOptions.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true });
  try {
    if (externalSignal?.aborted) {
      throw imageResponseError('图片请求已取消', 'IMAGE_REQUEST_ABORTED', 'request-cancelled');
    }
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...fetchOptions, signal: controller.signal });
    return await consumeImageHttpResponse(response, {
      ...responseOptions,
      responseHeaderMs: Date.now() - requestStartedAt
    });
  } catch (error) {
    if (timedOut) {
      const timeoutError = imageResponseError(`本站等待图片响应超过 ${timeoutSeconds} 秒`, 'IMAGE_CLIENT_TIMEOUT', 'client-total-timeout');
      timeoutError.timing = { responseHeaderMs: Date.now() - requestStartedAt, totalMs: Date.now() - requestStartedAt };
      throw timeoutError;
    }
    if (externalSignal?.aborted || error?.name === 'AbortError') {
      const abortError = imageResponseError('图片请求已取消', 'IMAGE_REQUEST_ABORTED', 'request-cancelled');
      abortError.timing = { responseHeaderMs: Date.now() - requestStartedAt, totalMs: Date.now() - requestStartedAt };
      throw abortError;
    }
    if (!error.stage) {
      const message = String(error?.message || error || '');
      if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)) {
        error.code = error.code || 'IMAGE_REQUEST_NETWORK_ERROR';
        error.stage = 'request-network';
      } else {
        error.code = error.code || 'IMAGE_REQUEST_TRANSPORT_FAILED';
        error.stage = 'request-transport';
      }
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener?.('abort', abortFromExternal);
  }
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
  const response = payload?.response && typeof payload.response === 'object' ? payload.response : payload;
  const status = String(firstDefined(response?.status, payload?.status, '') || '').toLowerCase();
  const terminalType = type.match(/response\.(incomplete|failed|cancelled|canceled)$/i)?.[1]?.toLowerCase() || '';
  const failedStatus = ['incomplete', 'failed', 'cancelled', 'canceled'].includes(status) ? status : terminalType;
  if (failedStatus) {
    return firstDefined(
      response?.error?.message,
      response?.incomplete_details?.reason,
      response?.incompleteDetails?.reason,
      payload?.message,
      `Agent Responses 请求终态为 ${failedStatus}`
    );
  }
  return null;
}
function assertSuccessfulResponseTerminal(payload) {
  const errorMessage = streamEventErrorMessage(payload);
  if (errorMessage) throw new Error(errorMessage);
  return payload;
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
  const encoder = new TextEncoder();
  let buffer = '';
  let pendingEventBytes = 0;
  const events = [];
  let eventCount = 0;
  let outputTextBuffer = '';
  let completedPayload = null;
  let outputItems = [];
  let hasDataLine = false;
  let shouldStop = false;
  const cancelReader = () => { try { reader.cancel(); } catch {} };
  const ensureEventWithinLimit = (text, byteLength = null) => {
    const size = byteLength == null ? encoder.encode(String(text || '')).byteLength : byteLength;
    if (size > AGENT_STREAM_EVENT_LIMIT) {
      throw new Error(`Agent 流式响应单个事件超过 ${Math.round(AGENT_STREAM_EVENT_LIMIT / 1024 / 1024)}MB 安全上限`);
    }
  };
  const ensureTextWithinLimit = (text) => {
    if (String(text || '').length > AGENT_STREAM_TEXT_LIMIT) {
      throw new Error(`Agent 流式响应文本超过 ${Math.round(AGENT_STREAM_TEXT_LIMIT / 1024 / 1024)}MB 安全上限`);
    }
    return text;
  };
  const appendOutputText = (text, prefix = '') => {
    if (!text) return;
    if (outputTextBuffer.length + prefix.length + text.length > AGENT_STREAM_TEXT_LIMIT) {
      throw new Error(`Agent 流式响应文本超过 ${Math.round(AGENT_STREAM_TEXT_LIMIT / 1024 / 1024)}MB 安全上限`);
    }
    outputTextBuffer += `${prefix}${text}`;
  };
  const compactEventMetadata = (payload) => ({
    type: String(payload?.type || payload?.event || '').slice(0, 80),
    status: String(firstDefined(payload?.response?.status, payload?.status, '') || '').slice(0, 40),
    id: String(firstDefined(payload?.id, payload?.response?.id, '') || '').slice(0, 120),
    outputIndex: firstDefined(payload?.output_index, payload?.outputIndex, null)
  });
  options.signal?.addEventListener?.('abort', cancelReader, { once: true });
  const handleEvent = (chunk) => {
    if (String(chunk || '').split(/\r?\n/).some((line) => line.startsWith('data:'))) hasDataLine = true;
    let data = parseSseDataBlock(chunk);
    if (!data && String(chunk || '').trim().startsWith('{')) data = String(chunk).trim();
    if (!data) return;
    let payload = null;
    try { payload = JSON.parse(data); } catch { throw new Error(`Agent 流式响应不是有效 JSON：${String(data).slice(0, 240)}`); }
    eventCount += 1;
    events.push(compactEventMetadata(payload));
    if (events.length > STREAM_EVENT_METADATA_LIMIT) events.shift();
    const errorMessage = streamEventErrorMessage(payload);
    if (errorMessage) throw new Error(errorMessage);
    const type = String(payload?.type || '');
    if (type === 'response.output_text.delta') {
      const delta = typeof payload.delta === 'string' ? payload.delta : '';
      appendOutputText(delta);
      return;
    }
    if (/response\.web_search_call\./.test(type)) return;
    const streamPayload = responsePayloadFromStreamEvent(payload);
    if (Array.isArray(streamPayload?.output) && type !== 'response.completed') {
      const indices = type === 'response.completed' ? streamPayload.output.map((_, idx) => idx) : streamPayload.output.map(() => Number(payload.output_index));
      const safeItems = streamPayload.output.map((item) => {
        const text = ensureTextWithinLimit(extractResponseText({ output: [item] }, ''));
        return text ? { type: 'message', content: [{ type: 'output_text', text }] } : null;
      }).filter(Boolean);
      outputItems = mergeOutputItems(outputItems, safeItems, indices);
    }
    const responseStatus = String(firstDefined(streamPayload?.status, payload?.status, '') || '').toLowerCase();
    if (type === 'response.completed' || responseStatus === 'completed') {
      const sourcePayload = streamPayload || payload.response || payload;
      const text = ensureTextWithinLimit(extractResponseText(sourcePayload, ''));
      completedPayload = {
        id: firstDefined(sourcePayload?.id, payload?.id),
        status: 'completed',
        output_text: text
      };
      if (text) shouldStop = true;
      return;
    }
    const text = responseStreamTextFromPayload(payload);
    if (text && !type.includes('delta')) appendOutputText(text, outputTextBuffer ? '\n' : '');
  };
  try {
    while (true) {
      if (options.signal?.aborted) throw new DOMException('请求已停止', 'AbortError');
      const { value, done } = await reader.read();
      if (done) break;
      ensureEventWithinLimit('', Number(value?.byteLength || 0));
      pendingEventBytes += Number(value?.byteLength || 0);
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.search(/\r?\n\r?\n/);
      let processedEvent = false;
      while (separatorIndex >= 0) {
        const separator = buffer.match(/\r?\n\r?\n/)?.[0] || '\n\n';
        const part = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + separator.length);
        ensureEventWithinLimit(part);
        handleEvent(part);
        processedEvent = true;
        if (shouldStop) {
          cancelReader();
          break;
        }
        separatorIndex = buffer.search(/\r?\n\r?\n/);
      }
      if (processedEvent) pendingEventBytes = encoder.encode(buffer).byteLength;
      ensureEventWithinLimit('', pendingEventBytes);
      if (shouldStop) break;
    }
    buffer += decoder.decode();
    if (!shouldStop && buffer.trim()) {
      ensureEventWithinLimit(buffer);
      handleEvent(buffer);
    }
  } catch (err) {
    cancelReader();
    throw err;
  } finally {
    options.signal?.removeEventListener?.('abort', cancelReader);
  }
  if (!hasDataLine && !eventCount) throw new Error('未从 Agent 流式响应中解析到有效 data 事件');
  const finalPayload = completedPayload || (outputItems.length ? { output: outputItems } : null);
  const finalText = finalPayload ? ensureTextWithinLimit(extractResponseText(finalPayload, '')) : '';
  if (finalText) return { ...finalPayload, output_text: finalText, streamEvents: events, streamEventCount: eventCount };
  const outputText = outputTextBuffer.trim();
  if (outputText) return { output_text: outputText, streamEvents: events, streamEventCount: eventCount };
  const fallback = extractResponseText({ streamEvents: events }, '');
  if (fallback) return { output_text: fallback, streamEvents: events, streamEventCount: eventCount };
  throw new Error('Agent 流式响应结束但没有返回可解析文本');
}
async function resolveResponsePayload(data) {
  if (data?.__stream) return consumeResponseTextStream(data.response, data);
  return assertSuccessfulResponseTerminal(data);
}
async function saveActiveProfile() {
  writeComposerSessionSettings();
}

let galleryImageObserver = null;
const galleryImageObservers = new Map();
function usableImageSource(value) {
  const source = String(value || '').trim();
  return /^(?:https?:\/\/|blob:|data:image\/)/i.test(source) ? source : '';
}
function storedImageSource(image) {
  return usableImageSource(image?.url || image?.remoteUrl || image?.dataUrl || image?.imageUrl || '');
}
function markImageCacheMissing(img, blobId, reason = 'cache') {
  if (!img) return;
  img.dataset.imageMissing = '1';
  img.dataset.imageMissingReason = reason === 'load' ? 'load' : 'cache';
  if (blobId) img.dataset.missingBlobId = String(blobId);
  img.alt = reason === 'load' ? '图片加载失败，请重试或重新生成' : '本地图片缓存已丢失，请重新生成';
}
function clearImageCacheMissing(img) {
  if (!img) return;
  delete img.dataset.imageMissing;
  delete img.dataset.imageMissingReason;
  delete img.dataset.missingBlobId;
  delete img.dataset.imageFallbackTried;
}
function isManagedImageElement(img) {
  return img?.tagName === 'IMG' && !!(
    img.dataset?.imageKind
    || img.dataset?.blobId
    || img.dataset?.remoteUrl
    || img.dataset?.refId
    || img.dataset?.proRefId
    || img.dataset?.workflowRefId
    || img.dataset?.agentAttachmentId
  );
}
function handleManagedImageLoadError(event) {
  const img = event?.target;
  if (!isManagedImageElement(img)) return;
  const fallbackUrl = usableImageSource(img.dataset.remoteUrl);
  const currentUrl = String(img.currentSrc || img.src || '');
  if (fallbackUrl && img.dataset.imageFallbackTried !== '1' && currentUrl !== fallbackUrl) {
    clearImageCacheMissing(img);
    img.dataset.imageFallbackTried = '1';
    img.src = fallbackUrl;
    return;
  }
  markImageCacheMissing(img, img.dataset.blobId || '', 'load');
}
function handleManagedImageLoad(event) {
  const img = event?.target;
  if (!isManagedImageElement(img)) return;
  clearImageCacheMissing(img);
}
async function hydrateBlobImage(img, blobId, remoteUrl = '') {
  const fallbackUrl = usableImageSource(remoteUrl);
  if (!blobId) {
    if (fallbackUrl && img?.isConnected !== false) img.src = fallbackUrl;
    else if (img?.isConnected !== false) markImageCacheMissing(img, '');
    return;
  }
  const targetMatches = () => img?.isConnected !== false && String(img?.dataset?.blobId || '') === String(blobId);
  let cachedUrl = touchObjectUrl(state.imageUrls, blobId);
  if (!cachedUrl) {
    const blob = await getBlob(blobId).catch(() => null);
    if (!targetMatches()) return;
    cachedUrl = touchObjectUrl(state.imageUrls, blobId);
    if (!cachedUrl && blob) {
      cachedUrl = rememberObjectUrl(state.imageUrls, blobId, URL.createObjectURL(blob), IMAGE_OBJECT_URL_CACHE_LIMIT);
    }
  }
  if (cachedUrl && targetMatches()) {
    clearImageCacheMissing(img);
    img.src = cachedUrl;
  } else if (!cachedUrl && fallbackUrl && targetMatches()) {
    clearImageCacheMissing(img);
    img.src = fallbackUrl;
  } else if (!cachedUrl && targetMatches()) {
    markImageCacheMissing(img, blobId);
  }
}
async function buildGalleryPreviewBlob(blob) {
  if (!blob?.size) return null;
  const info = await fastImageSizeFromBlob(blob).catch(() => ({}));
  const sourceWidth = Number(info.width || 0);
  const sourceHeight = Number(info.height || 0);
  const sourceEdge = Math.max(sourceWidth, sourceHeight);
  if (!sourceEdge || sourceEdge <= GALLERY_PREVIEW_MAX_EDGE || typeof createImageBitmap !== 'function') return blob;
  const scale = GALLERY_PREVIEW_MAX_EDGE / sourceEdge;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : typeof document !== 'undefined'
        ? Object.assign(document.createElement('canvas'), { width, height })
        : null;
    const context = canvas?.getContext?.('2d', { alpha: true });
    if (!canvas || !context) return blob;
    context.drawImage(bitmap, 0, 0, width, height);
    const preview = typeof canvas.convertToBlob === 'function'
      ? await canvas.convertToBlob({ type: 'image/webp', quality: .82 })
      : await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', .82));
    return preview?.size && preview.size < blob.size ? preview : blob;
  } catch {
    return blob;
  } finally {
    bitmap?.close?.();
  }
}
function acquireGalleryPreviewSlot() {
  if (galleryPreviewActive < GALLERY_PREVIEW_CONCURRENCY) {
    galleryPreviewActive += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => galleryPreviewQueue.push(resolve));
}
function releaseGalleryPreviewSlot() {
  const next = galleryPreviewQueue.shift();
  if (next) {
    next();
    return;
  }
  galleryPreviewActive = Math.max(0, galleryPreviewActive - 1);
}
function pruneGalleryPreviewConsumers(job) {
  if (!job?.consumers?.size && !job?.settled) {
    job.cancelled = true;
    if (galleryPreviewPromises.get(job.key) === job) galleryPreviewPromises.delete(job.key);
  }
}
function releaseGalleryImageWork(card) {
  if (!card) return;
  const job = galleryPreviewConsumers.get(card);
  if (job) {
    job.consumers.delete(card);
    galleryPreviewConsumers.delete(card);
    pruneGalleryPreviewConsumers(job);
  }
  for (const img of $$('img[data-gallery-preview="1"]', card)) galleryDeferredHydrations.delete(img);
}
async function hydrateGalleryPreviewImage(img, blobId, remoteUrl = '', options = {}) {
  if (!img || !blobId) return hydrateBlobImage(img, blobId, remoteUrl);
  if (imageHydrationScrollActive(img) && options.allowDuringScroll !== true) {
    galleryDeferredHydrations.set(img, hydrateGalleryPreviewImage);
    scheduleGalleryHydrationFlush();
    return;
  }
  const key = String(blobId);
  const targetMatches = () => img?.isConnected !== false && String(img?.dataset?.blobId || '') === key;
  const fallbackUrl = usableImageSource(remoteUrl);
  const cachedUrl = touchObjectUrl(state.galleryPreviewUrls, key);
  if (cachedUrl) {
    if (targetMatches()) {
      clearImageCacheMissing(img);
      img.src = cachedUrl;
    }
    return;
  }
  if (options.allowDuringScroll === true && imageHydrationScrollActive(img)) {
    let fullSource = touchObjectUrl(state.imageUrls, key);
    if (!fullSource) {
      const blob = await getBlob(blobId).catch(() => null);
      if (blob) fullSource = rememberObjectUrl(state.imageUrls, key, URL.createObjectURL(blob), IMAGE_OBJECT_URL_CACHE_LIMIT);
    }
    if (fullSource && targetMatches()) {
      clearImageCacheMissing(img);
      img.src = fullSource;
    } else if (fallbackUrl && targetMatches()) {
      clearImageCacheMissing(img);
      img.src = fallbackUrl;
    } else if (targetMatches()) {
      markImageCacheMissing(img, blobId);
    }
    return;
  }
  const consumer = img.closest?.('.asset-card, .agent-task-card') || img;
  let job = galleryPreviewPromises.get(key);
  if (job?.cancelled) {
    if (galleryPreviewPromises.get(key) === job) galleryPreviewPromises.delete(key);
    job = null;
  }
  if (!job) {
    job = {
      key,
      consumers: new Set(),
      cancelled: false,
      settled: false,
      promise: null
    };
    job.promise = (async () => {
      await acquireGalleryPreviewSlot();
      try {
        if (job.cancelled) return '';
        const blob = await getBlob(blobId).catch(() => null);
        if (job.cancelled || !blob) return '';
        const previewBlob = await buildGalleryPreviewBlob(blob);
        if (job.cancelled || !previewBlob) return '';
        return rememberObjectUrl(
          state.galleryPreviewUrls,
          key,
          URL.createObjectURL(previewBlob),
          GALLERY_PREVIEW_URL_CACHE_LIMIT
        );
      } finally {
        releaseGalleryPreviewSlot();
        job.settled = true;
        if (galleryPreviewPromises.get(key) === job) galleryPreviewPromises.delete(key);
      }
    })();
    galleryPreviewPromises.set(key, job);
  }
  const previousJob = galleryPreviewConsumers.get(consumer);
  if (previousJob && previousJob !== job) {
    previousJob.consumers.delete(consumer);
    pruneGalleryPreviewConsumers(previousJob);
  }
  job.consumers.add(consumer);
  galleryPreviewConsumers.set(consumer, job);
  const previewUrl = await job.promise;
  if (previewUrl && targetMatches()) {
    clearImageCacheMissing(img);
    img.src = previewUrl;
  } else if (!previewUrl && fallbackUrl && targetMatches()) {
    clearImageCacheMissing(img);
    img.src = fallbackUrl;
  } else if (!previewUrl && targetMatches()) {
    markImageCacheMissing(img, blobId);
  }
}
function imageHydrationScrollActive(img = null) {
  const root = img?.closest?.('.gallery-scroll, .agent-log');
  return galleryScrollActivity
    || agentScrollActivity
    || root?.classList?.contains('is-scrolling') === true
    || galleryHydrationDeferUntil > Date.now();
}
function imageNearScrollViewport(img, margin = 160) {
  const root = img?.closest?.('.gallery-scroll, .agent-log');
  if (!root || typeof img.getBoundingClientRect !== 'function' || typeof root.getBoundingClientRect !== 'function') return true;
  const imageRect = img.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const safeMargin = Math.max(0, Number(margin) || 0);
  return imageRect.bottom >= rootRect.top - safeMargin && imageRect.top <= rootRect.bottom + safeMargin;
}
async function flushDeferredGalleryHydrations(limit = 1) {
  if (galleryScrollActivity || agentScrollActivity || galleryHydrationFlushRunning || !galleryDeferredHydrations.size) return;
  galleryHydrationFlushRunning = true;
  let processed = 0;
  try {
    for (const [img, hydrate] of galleryDeferredHydrations) {
      galleryDeferredHydrations.delete(img);
      if (img?.isConnected === false || !img?.closest?.('.gallery-scroll, .agent-log')) continue;
      if (!imageNearScrollViewport(img) && typeof IntersectionObserver === 'function') {
        observeGalleryImage(img);
        continue;
      }
      try {
        await hydrate(img, img.dataset.blobId, img.dataset.remoteUrl);
      } catch {
        // 单张图片恢复失败时跳过当前项，不能阻塞后续空闲队列。
      }
      processed += 1;
      if (processed >= Math.max(1, Number(limit) || 1) || galleryScrollActivity || agentScrollActivity) break;
    }
  } finally {
    galleryHydrationFlushRunning = false;
  }
  if (!galleryScrollActivity && !agentScrollActivity && galleryDeferredHydrations.size) scheduleGalleryHydrationFlush();
}
function deferredGalleryHydrationLimit() {
  for (const img of galleryDeferredHydrations.keys()) {
    if (img?.closest?.('.agent-log')) return 4;
  }
  return 4;
}
function scheduleGalleryHydrationFlush() {
  if (galleryScrollActivity || agentScrollActivity || galleryHydrationFlushScheduled || galleryHydrationFlushRunning || !galleryDeferredHydrations.size) return;
  galleryHydrationFlushScheduled = true;
  const run = () => {
    galleryHydrationFlushScheduled = false;
    if (galleryScrollActivity || agentScrollActivity) return;
    void flushDeferredGalleryHydrations(deferredGalleryHydrationLimit());
  };
  const delay = Math.max(0, galleryHydrationDeferUntil - Date.now());
  if (delay > 0) setTimeout(run, delay);
  else if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 250 });
  else setTimeout(run, 0);
}
function unobserveGalleryImage(img) {
  const root = img?.closest?.('.gallery-scroll, .agent-log');
  galleryImageObservers.get(root)?.unobserve?.(img);
}
function disconnectGalleryImageObservers() {
  for (const observer of galleryImageObservers.values()) observer.disconnect?.();
  galleryImageObservers.clear();
  galleryImageObserver = null;
}
function observeGalleryImage(img) {
  const root = img.closest?.('.gallery-scroll, .agent-log');
  if (typeof IntersectionObserver === 'undefined' || !root) return false;
  let observer = galleryImageObservers.get(root);
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        const hydrate = entry.target.dataset.galleryPreview === '1' ? hydrateGalleryPreviewImage : hydrateBlobImage;
        if (imageHydrationScrollActive(entry.target)) {
          if (entry.target.dataset.galleryPreview === '1' && imageNearScrollViewport(entry.target)) {
            void hydrateGalleryPreviewImage(entry.target, entry.target.dataset.blobId, entry.target.dataset.remoteUrl, { allowDuringScroll: true });
            return;
          }
          galleryDeferredHydrations.set(entry.target, hydrate);
          scheduleGalleryHydrationFlush();
          return;
        }
        void hydrate(entry.target, entry.target.dataset.blobId, entry.target.dataset.remoteUrl);
      });
    }, { root, rootMargin: '160px 0px' });
    observer.rootNode = root;
    galleryImageObservers.set(root, observer);
  }
  galleryImageObserver = observer;
  observer.observe(img);
  return true;
}
async function hydrateAgentAttachmentImage(img) {
  const attachment = (state.agent.attachments || []).find((item) => item.id === img?.dataset?.agentAttachmentId);
  if (!attachment?.blobId) return;
  const key = `agent:${attachment.id}:${attachment.blobId}`;
  if (!state.refUrls.has(key)) {
    const blob = await getBlob(attachment.blobId).catch(() => null);
    if (blob) rememberObjectUrl(state.refUrls, key, URL.createObjectURL(blob), REFERENCE_OBJECT_URL_CACHE_LIMIT);
  }
  if (state.refUrls.has(key) && img?.isConnected !== false) img.src = touchObjectUrl(state.refUrls, key);
}
async function hydrateImages(options = {}) {
  const galleryOnly = options.galleryOnly === true;
  const skipReferenceImages = options.skipReferenceImages === true;
  const immediateHydrations = [];
  for (const img of $$('img[data-blob-id], img[data-remote-url]')) {
    if (galleryOnly && !img.closest('.gallery-scroll')) continue;
    if (img.complete && img.naturalWidth > 0) continue;
    if (img.complete && img.getAttribute('src')) img.removeAttribute('src');
    const blobId = img.dataset.blobId;
    if (img.closest?.('.agent-log') && options.deferAgentHydration !== false) {
      galleryDeferredHydrations.set(img, img.dataset.galleryPreview === '1' ? hydrateGalleryPreviewImage : hydrateBlobImage);
      scheduleGalleryHydrationFlush();
      continue;
    }
    const shouldObserve = !imageNearScrollViewport(img) && observeGalleryImage(img);
    if (shouldObserve) continue;
    unobserveGalleryImage(img);
    if (imageHydrationScrollActive(img)) {
      if (img.dataset.galleryPreview === '1' && imageNearScrollViewport(img)) {
        immediateHydrations.push(hydrateGalleryPreviewImage(img, blobId, img.dataset.remoteUrl, { allowDuringScroll: true }));
        continue;
      }
      galleryDeferredHydrations.set(img, img.dataset.galleryPreview === '1' ? hydrateGalleryPreviewImage : hydrateBlobImage);
      scheduleGalleryHydrationFlush();
      continue;
    }
    immediateHydrations.push((img.dataset.galleryPreview === '1' ? hydrateGalleryPreviewImage : hydrateBlobImage)(img, blobId, img.dataset.remoteUrl));
  }
  if (immediateHydrations.length) await Promise.all(immediateHydrations);
  if (galleryOnly && skipReferenceImages) return;
  if (galleryOnly) {
    for (const img of $$('img[data-task-ref-task-id]:not([src])')) {
      const task = state.tasks.find((item) => item.id === img.dataset.taskRefTaskId);
      const refs = task ? taskReferenceSnapshots(task) : [];
      const ref = refs[Number(img.dataset.taskRefIndex) || 0];
      if (!ref) continue;
      const displayBlobId = taskReferenceDisplayBlobId(ref);
      const key = `taskref:${task.id}:${ref.id}:${displayBlobId}`;
      if (!state.refUrls.has(key)) {
        const blob = await getBlob(displayBlobId).catch(() => null);
        if (blob) rememberObjectUrl(state.refUrls, key, URL.createObjectURL(blob), REFERENCE_OBJECT_URL_CACHE_LIMIT);
      }
      if (state.refUrls.has(key)) img.src = touchObjectUrl(state.refUrls, key);
    }
    return;
  }
  for (const img of $$('img[data-ref-id]:not([src])')) {
    const ref = state.references.find((r) => r.id === img.dataset.refId);
    if (!ref) continue;
    if (!state.refUrls.has(ref.id)) {
      const blob = await getBlob(ref.blobId).catch(() => null);
      if (blob) rememberObjectUrl(state.refUrls, ref.id, URL.createObjectURL(blob), REFERENCE_OBJECT_URL_CACHE_LIMIT);
    }
    if (state.refUrls.has(ref.id)) img.src = touchObjectUrl(state.refUrls, ref.id);
  }
  for (const img of $$('img[data-pro-ref-id]:not([src])')) {
    const ref = (state.pro.refs || []).find((r) => r.id === img.dataset.proRefId);
    if (!ref) continue;
    const key = `pro:${ref.id}`;
    if (!state.refUrls.has(key)) {
      const blob = await getBlob(ref.blobId).catch(() => null);
      if (blob) rememberObjectUrl(state.refUrls, key, URL.createObjectURL(blob), REFERENCE_OBJECT_URL_CACHE_LIMIT);
    }
    if (state.refUrls.has(key)) img.src = touchObjectUrl(state.refUrls, key);
  }
  for (const img of $$('img[data-workflow-ref-id]:not([src])')) {
    const ref = (state.workflowInvoke?.references || []).find((r) => r.id === img.dataset.workflowRefId);
    if (!ref) continue;
    const key = `workflow:${ref.id}`;
    if (!state.refUrls.has(key)) {
      const blob = await getBlob(ref.blobId).catch(() => null);
      if (blob) rememberObjectUrl(state.refUrls, key, URL.createObjectURL(blob), REFERENCE_OBJECT_URL_CACHE_LIMIT);
    }
    if (state.refUrls.has(key)) img.src = touchObjectUrl(state.refUrls, key);
  }
  for (const img of $$('img[data-agent-attachment-id]:not([src])')) {
    if (options.deferAgentHydration !== false) {
      galleryDeferredHydrations.set(img, hydrateAgentAttachmentImage);
      continue;
    }
    await hydrateAgentAttachmentImage(img);
  }
  if (galleryDeferredHydrations.size) scheduleGalleryHydrationFlush();
  for (const img of $$('img[data-task-ref-task-id]:not([src])')) {
    const task = state.tasks.find((item) => item.id === img.dataset.taskRefTaskId);
    const refs = task ? taskReferenceSnapshots(task) : [];
    const ref = refs[Number(img.dataset.taskRefIndex) || 0];
    if (!ref) continue;
    const displayBlobId = taskReferenceDisplayBlobId(ref);
    const key = `taskref:${task.id}:${ref.id}:${displayBlobId}`;
    if (!state.refUrls.has(key)) {
      const blob = await getBlob(displayBlobId).catch(() => null);
      if (blob) rememberObjectUrl(state.refUrls, key, URL.createObjectURL(blob), REFERENCE_OBJECT_URL_CACHE_LIMIT);
    }
    if (state.refUrls.has(key)) img.src = touchObjectUrl(state.refUrls, key);
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
  const blobIds = ref ? [ref.blobId, ref.originalBlobId, ref.compositedBlobId, ref.maskBlobId] : [];
  state.references = state.references.filter((r) => r.id !== id);
  revokeMapEntry(state.refUrls, id);
  const persisted = persistRender();
  if (persisted === true) await deleteUnreferencedBlobIds(blobIds);
  else queuePendingBlobRelease(blobIds, false);
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
  const blobIds = ref ? [ref.blobId, ref.originalBlobId, ref.compositedBlobId, ref.maskBlobId] : [];
  if (state.workflowInvoke) state.workflowInvoke.references = (state.workflowInvoke.references || []).filter((item) => item.id !== id);
  revokeMapEntry(state.refUrls, `workflow:${id}`);
  const persisted = persistRender();
  if (persisted === true) await deleteUnreferencedBlobIds(blobIds);
  else queuePendingBlobRelease(blobIds, false);
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
  const transparentRequested = wantsTransparentOutput(params);
  const effectiveParams = transparentRequested ? getTransparentRequestParams(params) : params;
  const meta = seedTask?.workflowMeta || {};
  const task = {
    id: uid('task'),
    status: 'running',
    mode: 'gallery',
    prompt,
    profileId: profileSelectionKey(profile),
    profileName: profile.name,
    model: profile.model,
    providerFamily: providerKey(profile),
    sizeLabel: params.size,
    quality: params.quality,
    count: params.count,
    referenceCount: referenceSnapshots.length,
    referenceSnapshots,
    requestedParams: params,
    transparentRequested,
    transparentOutput: false,
    transparentSource: '',
    transparentPrompt: transparentRequested ? buildTransparentKeyPrompt(prompt) : '',
    workflowId: meta.workflowId || seedTask?.workflowId || '',
    workflowRunId: meta.workflowRunId || seedTask?.workflowRunId || '',
    workflowNodeId: meta.workflowNodeId || seedTask?.workflowNodeId || '',
    batchRowId: meta.batchRowId || seedTask?.batchRowId || '',
    batchLabel: meta.batchLabel || seedTask?.batchLabel || '',
    workflowName: meta.workflowName || seedTask?.workflowName || '',
    agentMessageId: meta.agentMessageId || seedTask?.agentMessageId || '',
    agentProjectId: meta.agentProjectId || seedTask?.agentProjectId || '',
    agentThreadId: meta.agentThreadId || seedTask?.agentThreadId || '',
    agentOption: meta.agentOption || seedTask?.agentOption || '',
    agentOptionTitle: meta.agentOptionTitle || seedTask?.agentOptionTitle || '',
    editedFromOption: meta.editedFromOption || seedTask?.editedFromOption || '',
    returnedParams: {},
    createdAt: Date.now(),
    startedAt: Date.now(),
    images: [],
    streamState: 'idle',
    streamPreviewSlots: {},
    streamPartialImages: [],
    streamEventCount: 0,
    streamPartialCount: 0,
    lastStreamEventType: '',
    error: ''
  };
  state.tasks.unshift(task);
  const taskGeneration = beginTaskGeneration(task);
  const taskGenerationActive = () => isTaskGenerationActive(task, taskGeneration.version);
  writeStore();
  const preserveAgentScroll = () => shouldPreserveAgentScrollForTask(task);
  if (preserveAgentScroll()) renderPreservingAgentScroll();
  else render();
  if (meta.onCreated) meta.onCreated(task);
  try {
    const apiStartedAt = Date.now();
    const result = await collectGenerationResult(prompt, effectiveParams, {
      profile,
      references,
      signal: taskGeneration.signal,
      isActive: taskGenerationActive,
      entry: meta.entry || 'gallery',
      advanced: seedTask?.advanced || meta.advanced,
      transparentOutput: transparentRequested,
      onPartialImage: (candidate) => {
        if (!taskGenerationActive()) return;
        const resolved = streamCandidateObjectUrl(candidate);
        if (!resolved) return;
        const outputIndex = Number(candidate.outputIndex || candidate.output_index || 0);
        const key = String(outputIndex);
        const previous = task.streamPreviewSlots?.[key];
        if (previous?.temporary && previous.url) revokeTransientObjectUrl(previous.url);
        task.streamState = 'receiving';
        task.streamPartialCount = Number(task.streamPartialCount || 0) + 1;
        task.lastStreamEventType = candidate.eventType || '';
        task.streamPreviewSlots = {
          ...(task.streamPreviewSlots || {}),
          [key]: {
            url: resolved.url,
            temporary: resolved.temporary,
            outputIndex,
            partialIndex: candidate.partialIndex,
            eventType: candidate.eventType || '',
            receivedAt: candidate.receivedAt || Date.now()
          }
        };
        if (outputIndex === 0) task.streamPreviewUrl = resolved.url;
        touchTaskPersistence(task);
        queueTaskStreamPartialPersist(task, candidate, taskGeneration.version);
        if (!scheduleAgentTaskCardSync(task) && state.mode !== 'agent' && !galleryScrollActivity) renderGalleryListOnly();
      },
      onPersistedImages: (batch, snapshot) => {
        if (!taskGenerationActive()) return;
        task.images = snapshot.images;
        task.expectedCount = snapshot.expectedCount;
        task.actualCount = snapshot.actualCount;
        task.failedCount = snapshot.failedCount;
        touchTaskPersistence(task);
        scheduleStoreWrite();
        if (!scheduleAgentTaskCardSync(task) && state.mode !== 'agent' && !galleryScrollActivity) renderGalleryListOnly();
      }
    });
    if (!taskGenerationActive()) return task;
    const apiFinishedAt = Date.now();
    const response = result.response;
    const images = result.images;
    task.finishedAt = Date.now();
    task.elapsedMs = task.finishedAt - task.startedAt;
    task.apiElapsedMs = result.apiElapsedMs || (apiFinishedAt - apiStartedAt);
    task.persistElapsedMs = result.persistElapsedMs || Math.max(0, task.elapsedMs - task.apiElapsedMs);
    task.timing = {
      ...(result.timing || {}),
      persistMs: result.persistElapsedMs || result.timing?.persistMs || 0,
      postProcessMs: result.postProcessElapsedMs || result.timing?.postProcessMs || 0,
      totalMs: task.elapsedMs
    };
    task.responseMode = result.responseMode || response?.responseMode || '';
    task.completionReason = result.completionReason || response?.completionReason || '';
    task.streamEventCount = Number(response?.streamEventCount || task.streamEventCount || 0);
    task.streamPartialCount = Number(response?.partialCount || task.streamPartialCount || 0);
    task.lastStreamEventType = response?.lastStreamEventType || task.lastStreamEventType || '';
    task.images = images;
    task.expectedCount = result.expectedCount || params.count || images.length;
    task.actualCount = images.length;
    task.failedCount = result.failedCount || 0;
    task.partialErrors = mergeGenerationPartialErrors(result.partialErrors, transparentRequested ? result.transparentPostProcessError : '');
    task.rawResponse = summarizeResponse(response);
    task.returnedPrompt = returnedPromptFromResponse(response);
    task.returnedParams = extractReturnedParams(response, { ...params, transparent: transparentRequested || params.transparent }, images);
    task.transparentOutput = transparentRequested && result.transparentFailedCount === 0 && result.transparentProcessedCount === images.length && images.length > 0;
    task.transparentSource = task.transparentOutput ? 'local-key-color' : '';
    if (transparentRequested) {
      task.returnedParams.transparent = task.transparentOutput;
      task.returnedParams.transparentBackground = task.transparentOutput;
      task.returnedParams.background = task.transparentOutput ? 'local-key-color' : 'opaque';
      task.transparentProcessedCount = result.transparentProcessedCount || 0;
      task.transparentFailedCount = result.transparentFailedCount || 0;
      if (result.transparentPostProcessError) task.transparentPostProcessError = result.transparentPostProcessError;
    }
    const generationError = task.failedCount ? `部分图片生成失败：${task.failedCount} 张未完成` : '';
    const transparencyError = result.transparentFailedCount
      ? `透明背景后处理失败：${result.transparentFailedCount} 张已保留上游原图`
      : '';
    task.error = [generationError, transparencyError].filter(Boolean).join('；');
    task.errorDetail = task.partialErrors.map((item, idx) => `${idx + 1}. ${item.detail || item.summary || item.error || item}`).join('\n');
    task.status = task.failedCount || result.transparentFailedCount ? 'partial_success' : 'success';
    task.streamState = 'completed';
    clearTaskStreamPreviewUrls(task);
    await waitForTaskStreamPartialPersistence(task.id);
    if (!taskGenerationActive()) return task;
    const previousPartialImages = Array.isArray(task.streamPartialImages) ? [...task.streamPartialImages] : [];
    const completedPartialIds = await clearTaskStreamPartialImages(task);
    const persisted = writeStore();
    if (persisted === false) {
      task.streamPartialImages = previousPartialImages;
      task.streamPersistError = '任务状态写入失败，中间帧暂不清理';
    } else {
      queuePendingBlobRelease(completedPartialIds, persisted === true);
    }
    if (!seedTask && state.preferences?.clearInputAfterSubmit) state.composerPrompt = '';
    notifyTaskComplete(task);
  } catch (err) {
    if (!taskGenerationActive()) return task;
    const normalized = normalizeError(err, '生成失败');
    task.finishedAt = Date.now();
    task.elapsedMs = task.finishedAt - task.startedAt;
    task.apiElapsedMs = task.apiElapsedMs || task.elapsedMs;
    task.timing = {
      ...(task.timing || {}),
      ...(err?.timing || {}),
      totalMs: task.elapsedMs
    };
    task.errorStage = err?.stage || '';
    task.errorCode = normalized.code || err?.code || '';
    task.streamEventCount = Number(err?.streamEventCount || task.streamEventCount || 0);
    task.streamPartialCount = Number(err?.partialCount || task.streamPartialCount || 0);
    task.lastStreamEventType = err?.lastStreamEventType || task.lastStreamEventType || '';
    if (!(task.streamPartialImages || []).length && Array.isArray(err?.partialCandidates)) {
      for (const candidate of err.partialCandidates) queueTaskStreamPartialPersist(task, candidate, taskGeneration.version);
    }
    await waitForTaskStreamPartialPersistence(task.id);
    if (!taskGenerationActive()) return task;
    if ((task.images || []).length) {
      const expected = Number(task.expectedCount || effectiveParams.count || task.images.length);
      task.actualCount = task.images.length;
      task.failedCount = Math.max(0, expected - task.images.length);
      task.error = task.failedCount ? `部分图片生成失败：${task.failedCount} 张未完成` : '';
      task.errorDetail = task.failedCount ? normalized.detail : '';
      task.status = task.failedCount ? 'partial_success' : 'success';
    } else if (['IMAGE_STREAM_TRANSPORT_INTERRUPTED', 'IMAGE_STREAM_PARTIAL_ONLY'].includes(err?.code) && (task.streamPartialImages || []).length) {
      task.actualCount = 0;
      task.failedCount = Number(task.expectedCount || effectiveParams.count || 1);
      task.error = err?.code === 'IMAGE_STREAM_PARTIAL_ONLY'
        ? '流式响应只返回预览图，未收到最终输出。'
        : '流式连接已中断，已保留预览图；该图片不是最终输出。';
      task.errorDetail = normalized.detail;
      task.status = 'partial_success';
      task.streamState = 'interrupted';
      task.completionReason = err?.code === 'IMAGE_STREAM_PARTIAL_ONLY' ? 'last-partial-fallback' : 'stream-transport-interrupted';
    } else {
      task.error = normalized.summary;
      task.errorDetail = normalized.detail;
      task.status = 'error';
      task.streamState = err?.code === 'IMAGE_STREAM_UPSTREAM_FAILED' ? 'failed' : 'interrupted';
    }
    if ((task.images || []).length) {
      const previousPartialImages = Array.isArray(task.streamPartialImages) ? [...task.streamPartialImages] : [];
      const completedPartialIds = await clearTaskStreamPartialImages(task);
      const persisted = writeStore();
      if (persisted === false) task.streamPartialImages = previousPartialImages;
      else queuePendingBlobRelease(completedPartialIds, persisted === true);
    }
    clearTaskStreamPreviewUrls(task);
    if (task.status === 'error') toast(`生成失败：${task.error}`);
    else if (task.status === 'partial_success') toast(`部分图片已保存：${task.error}`);
    notifyTaskComplete(task);
  }
  if (!taskGenerationActive()) return task;
  finishTaskGeneration(task.id, taskGeneration.version);
  touchTaskPersistence(task);
  writeStore();
  if (preserveAgentScroll()) {
    if (!syncAgentTaskCardDom(task)) renderPreservingAgentScroll();
  } else if (state.mode === 'gallery' && syncGalleryTaskCardDom(task)) {
    updateRunningTimers();
  } else {
    render();
  }
  return task;
}
async function collectGenerationResult(prompt, params, options = {}) {
  const expected = Math.max(1, Number(params.count || state.settings.n) || 1);
  const profile = options.profile || imageProfile();
  const provider = providerKey(profile);
  const advanced = effectiveAdvanced(options.entry || currentEntryKey(), profile, options.advanced);
  const splitRequests = expected > 1 && (
    profile.codexCli === true
    || provider === 'google'
    || (advanced.streamImages && streamSupported(profile))
  );
  const responses = [];
  const images = [];
  const partialErrors = [];
  let apiElapsedMs = 0;
  let persistElapsedMs = 0;
  let postProcessElapsedMs = 0;
  let responseHeaderMs = 0;
  let streamReadMs = 0;
  let upstreamHeaderMs = 0;
  let proxyHeaderMs = 0;
  let transparentProcessedCount = 0;
  let transparentFailedCount = 0;
  const transparentPostProcessErrors = [];
  const requestCount = splitRequests ? expected : 1;
  const discardImageBatchBlobs = async (batch = []) => {
    const ids = new Set();
    for (const image of Array.isArray(batch) ? batch : []) {
      [image?.blobId, image?.originalBlobId, image?.compositedBlobId, image?.maskBlobId]
        .filter(Boolean)
        .forEach((id) => ids.add(id));
    }
    await releaseBlobIdsSafely([...ids]);
  };
  const runRequest = async (requestIndex) => {
    const requestParams = splitRequests ? { ...params, count: 1 } : params;
    const apiStartedAt = Date.now();
    const response = await sendGenerationRequest(prompt, requestParams, {
      ...options,
      profile,
      advanced: options.advanced,
      onPartialImage: typeof options.onPartialImage === 'function'
        ? (candidate) => {
          const sourceOutputIndex = Number(candidate?.outputIndex ?? candidate?.output_index ?? 0);
          const outputIndex = splitRequests ? requestIndex : sourceOutputIndex;
          options.onPartialImage({
            ...candidate,
            sourceOutputIndex,
            outputIndex,
            output_index: outputIndex,
            requestIndex: splitRequests ? requestIndex : candidate?.requestIndex
          });
        }
        : undefined
    });
    if (response?.completionReason === 'last-partial-fallback') {
      const partialError = imageResponseError(
        '流式响应只包含预览图，没有收到最终图片；已保留预览供查看和下载。',
        'IMAGE_STREAM_PARTIAL_ONLY',
        'stream-complete'
      );
      Object.assign(partialError, {
        partialCandidates: response.partialCandidates || response.data || [],
        streamEvents: response.streamEvents,
        streamEventCount: response.streamEventCount,
        partialCount: response.partialCount,
        lastStreamEventType: response.lastStreamEventType,
        responseMode: response.responseMode,
        timing: response.timing
      });
      throw partialError;
    }
    const apiElapsed = Date.now() - apiStartedAt;
    const persistStartedAt = Date.now();
    let batch = await persistResponseImages(response, {
      requestedFormat: params.format || params.output_format,
      outputQuality: firstDefined(params.outputQuality, params.output_quality),
      outputCompression: firstDefined(params.output_compression, params.outputCompression)
    });
    if (typeof options.isActive === 'function' && !options.isActive()) {
      await discardImageBatchBlobs(batch);
      throw imageResponseError('图片任务已删除，已丢弃未挂载的结果', 'IMAGE_REQUEST_ABORTED', 'request-cancelled');
    }
    const persistElapsed = Date.now() - persistStartedAt;
    let postProcessElapsed = 0;
    let processedCount = 0;
    let failedCount = 0;
    const postProcessErrors = [];
    if (options.transparentOutput) {
      const postProcessStartedAt = Date.now();
      const transparentResult = await postProcessTransparentImages(batch);
      postProcessElapsed = Date.now() - postProcessStartedAt;
      batch = transparentResult.images;
      processedCount = transparentResult.processedCount;
      failedCount = transparentResult.failedCount;
      postProcessErrors.push(...transparentResult.errors);
    }
    if (typeof options.isActive === 'function' && !options.isActive()) {
      await discardImageBatchBlobs(batch);
      throw imageResponseError('图片任务已删除，已丢弃未挂载的结果', 'IMAGE_REQUEST_ABORTED', 'request-cancelled');
    }
    return {
      requestIndex,
      response,
      batch,
      apiElapsed,
      persistElapsed,
      postProcessElapsed,
      processedCount,
      failedCount,
      postProcessErrors
    };
  };
  const settled = splitRequests
    ? await Promise.allSettled(Array.from({ length: requestCount }, (_, requestIndex) => runRequest(requestIndex)))
    : await Promise.allSettled([runRequest(0)]);
  const successful = settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .sort((a, b) => a.requestIndex - b.requestIndex);
  const failed = settled
    .map((result, requestIndex) => ({ result, requestIndex }))
    .filter(({ result }) => result.status === 'rejected')
    .map(({ result, requestIndex }) => ({ requestIndex, error: result.reason }));
  if (!successful.length) {
    const firstError = failed[0]?.error;
    if (firstError) throw firstError;
    throw imageResponseError('没有收到可保存的图片结果', 'IMAGE_RESPONSE_NO_IMAGE', 'image-persist');
  }
  for (const result of successful) {
    const response = result.response;
    responses.push(response);
    apiElapsedMs += result.apiElapsed;
    persistElapsedMs += result.persistElapsed;
    postProcessElapsedMs += result.postProcessElapsed;
    responseHeaderMs += Number(response?.timing?.responseHeaderMs) || 0;
    streamReadMs += Number(response?.timing?.streamReadMs) || 0;
    upstreamHeaderMs += Number(response?.timing?.upstreamHeaderMs) || 0;
    proxyHeaderMs += Number(response?.timing?.proxyHeaderMs) || 0;
    transparentProcessedCount += result.processedCount;
    transparentFailedCount += result.failedCount;
    transparentPostProcessErrors.push(...result.postProcessErrors);
    images.push(...result.batch);
    if (typeof options.onPersistedImages === 'function') {
      options.onPersistedImages(result.batch, {
        images: [...images],
        expectedCount: expected,
        actualCount: images.length,
        failedCount: Math.max(0, expected - images.length),
        responses: [...responses],
        requestIndex: result.requestIndex
      });
    }
  }
  for (const item of failed) {
    const normalized = normalizeError(item.error, '单张生成失败');
    partialErrors.push({
      summary: normalized.summary,
      detail: normalized.detail,
      attempt: item.requestIndex + 1,
      requestIndex: item.requestIndex
    });
  }
  if (!images.length) {
    const firstError = failed[0]?.error;
    if (firstError) throw firstError;
    throw imageResponseError('图片响应中没有可保存的图片数据', 'IMAGE_RESPONSE_NO_IMAGE', 'image-persist');
  }
  const response = responses.length === 1 ? responses[0] : {
    source: readDeepAlias(responses, ['source', 'provider', 'model']),
    responses,
    data: responses.flatMap((item) => Array.isArray(item?.data) ? item.data : []),
    images: responses.flatMap((item) => Array.isArray(item?.images) ? item.images : []),
    count: images.length,
    streamEventCount: responses.reduce((sum, item) => sum + Number(item?.streamEventCount || 0), 0),
    partialCount: responses.reduce((sum, item) => sum + Number(item?.partialCount || 0), 0),
    lastStreamEventType: responses.at(-1)?.lastStreamEventType || ''
  };
  const transparentPostProcessError = transparentPostProcessErrors
    .map((item) => item.detail || item.summary || item.error || item)
    .filter(Boolean)
    .join('\n');
  return {
    response,
    images,
    partialErrors,
    expectedCount: expected,
    actualCount: images.length,
    failedCount: Math.max(0, expected - images.length),
    apiElapsedMs,
    persistElapsedMs,
    postProcessElapsedMs,
    timing: {
      responseHeaderMs,
      streamReadMs,
      persistMs: persistElapsedMs,
      postProcessMs: postProcessElapsedMs,
      upstreamHeaderMs,
      proxyHeaderMs
    },
    responseMode: responses.length === 1 ? responses[0]?.responseMode || '' : 'multi-response',
    completionReason: responses.length === 1 ? responses[0]?.completionReason || '' : 'multi-response',
    transparentProcessedCount,
    transparentFailedCount,
    transparentPostProcessErrors,
    transparentPostProcessError
  };
}
async function postProcessTransparentImages(images = []) {
  const processed = [];
  const errors = [];
  let processedCount = 0;
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    try {
      const originalBlob = await getBlob(image.blobId);
      if (!originalBlob) throw new Error('找不到待处理的原始图片数据');
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
      processedCount += 1;
    } catch (err) {
      const normalized = normalizeError(err, '透明背景后处理失败');
      processed.push({
        ...image,
        transparent: false,
        transparentOutput: false,
        transparentSource: ''
      });
      errors.push({
        index,
        blobId: image?.blobId || '',
        summary: normalized.summary,
        detail: normalized.detail
      });
    }
  }
  return {
    images: processed,
    processedCount,
    failedCount: errors.length,
    errors
  };
}
async function sendGenerationRequest(prompt, params = {}, options = {}) {
  const profile = options.profile || imageProfile();
  const entry = options.entry || currentEntryKey();
  const requestParams = params && typeof params === 'object' ? params : {};
  const sourceRefs = Array.isArray(options.references) ? options.references : state.references;
  if (!validateReferenceCountForProfile(profile, sourceRefs)) throw new Error(`参考图数量超过当前模型限制：${referenceLimit(profile)}`);
  const refs = await Promise.all(sourceRefs.map(async (ref, index) => ({ ref, blob: await getBlob(ref.blobId), index })));
  if (sourceRefs.length && refs.some((item) => !item.blob)) {
    throw imageResponseError('参考图文件已丢失，请重新上传后再生成', 'IMAGE_EDIT_INPUT_MISSING', 'request-validation');
  }
  const hasRefs = refs.some((item) => item.blob);
  const endpoint = hasRefs ? '/api-proxy/images/edits' : '/api-proxy/images/generations';
  const provider = providerKey(profile);
  const advanced = effectiveAdvanced(entry, profile, options.advanced);
  const responseOptions = {
    streamRequested: advanced.streamImages && streamSupported(profile),
    onPartialImage: options.onPartialImage,
    timeoutSeconds: advanced.timeout
  };
  const requestPrompt = promptWithCanvasConstraint(prompt, provider, requestParams);
  if (hasRefs) {
    const validRefs = refs.filter((item) => item.blob);
    if (!validRefs.length) throw imageResponseError('参考图文件不存在或为空', 'IMAGE_EDIT_INPUT_EMPTY', 'request-validation');
    if (validRefs.some((item) => !item.blob?.size)) throw imageResponseError('参考图包含空文件', 'IMAGE_EDIT_INPUT_EMPTY_FILE', 'request-validation');
    if (validRefs.some((item) => !String(item.blob?.type || '').toLowerCase().startsWith('image/'))) throw imageResponseError('参考图包含不支持的文件类型', 'IMAGE_EDIT_INPUT_TYPE', 'request-validation');
    const prepared = await prepareEditReferenceFiles(validRefs);
    const totalBytes = prepared.refs.reduce((sum, item) => sum + Number(item.blob?.size || 0), 0) + Number(prepared.mask?.size || 0);
    if (prepared.refs.some((item) => Number(item.blob?.size || 0) > STREAM_INPUT_FILE_LIMIT)
      || Number(prepared.mask?.size || 0) > STREAM_INPUT_FILE_LIMIT) {
      throw imageResponseError('单张参考图或遮罩超过 50MB 安全上限', 'IMAGE_EDIT_INPUT_TOO_LARGE', 'request-validation');
    }
    if (totalBytes > STREAM_INPUT_TOTAL_LIMIT) throw imageResponseError('参考图与遮罩总大小超过 512MB 安全上限', 'IMAGE_EDIT_INPUT_TOTAL_TOO_LARGE', 'request-validation');
    const defaultEditImageField = (currentProvider) => IMAGE_STREAM_RUNTIME?.defaultEditImageField?.(currentProvider) || 'image[]';
    const shouldRetryEditImageField = (error) => IMAGE_STREAM_RUNTIME?.shouldRetryEditImageField?.({
      status: error?.status,
      message: `${error?.message || ''}\n${error?.detail || ''}`,
      streamEventCount: error?.streamEventCount,
      partialCount: error?.partialCount
    }) === true;
    const sendEditRequest = (imageFieldName) => {
      const fd = new FormData();
      fd.append('model', profile.model || 'gpt-image-2');
      fd.append('prompt', requestPrompt);
      if (provider === 'openai') {
        const output = imageOutputParams(requestParams, profile);
        fd.append('size', openAiSizePayload(requestParams));
        fd.append('output_format', String(output.output_format || 'png'));
        if (output.moderation !== undefined && output.moderation !== null && output.moderation !== '') {
          fd.append('moderation', String(output.moderation));
        }
        if (!profile.codexCli && output.quality !== undefined && output.quality !== null && output.quality !== '') {
          fd.append('quality', String(output.quality));
        }
        if (output.output_format !== 'png' && output.output_compression !== undefined && output.output_compression !== null) {
          fd.append('output_compression', String(output.output_compression));
        }
        const count = Number(requestParams.count || state.settings.n) || 1;
        if (count > 1) fd.append('n', String(count));
        appendAdvancedToFormData(fd, entry, profile, options.advanced);
        appendNegativePromptParams(fd, requestParams);
      } else {
        appendProviderParams(fd, provider, requestParams);
        appendImageOutputParams(fd, requestParams, profile);
        appendNegativePromptParams(fd, requestParams);
        fd.append('n', String(provider === 'google' ? 1 : (requestParams.count || state.settings.n || 1)));
      }
      prepared.refs.forEach(({ ref, blob }, idx) => fd.append(imageFieldName, blob, ref.name || `reference-${idx + 1}.png`));
      if (prepared.mask) fd.append('mask', prepared.mask, 'mask.png');
      if (provider !== 'openai') appendAdvancedToFormData(fd, entry, profile, options.advanced);
      return fetchImageHttpResponse(endpoint, {
        method: 'POST',
        headers: appendAdvancedHeaders({}, entry, profile, options.advanced),
        body: fd,
        signal: options.signal
      }, responseOptions);
    };
    const imageFieldName = defaultEditImageField(provider);
    try {
      return await sendEditRequest(imageFieldName);
    } catch (error) {
      if (imageFieldName === 'image' || !shouldRetryEditImageField(error)) throw error;
      return sendEditRequest('image');
    }
  }
  const body = {
    model: profile.model || 'gpt-image-2',
    prompt: requestPrompt,
    n: provider === 'google' ? 1 : undefined
  };
  appendImageOutputParams(body, requestParams, profile);
  appendNegativePromptParams(body, requestParams);
  Object.assign(body, providerPayload(provider, requestParams));
  const count = Number(requestParams.count || state.settings.n) || 1;
  if (provider !== 'google' && count > 1) body.n = count;
  applyAdvancedToJsonBody(body, entry, profile, options.advanced);
  const headers = appendAdvancedHeaders({ 'Content-Type': 'application/json' }, entry, profile, options.advanced);
  let response;
  try {
    response = await fetchImageHttpResponse(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: options.signal }, responseOptions);
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
    response = await fetchImageHttpResponse(endpoint, { method: 'POST', headers, body: JSON.stringify(legacyBody), signal: options.signal }, responseOptions);
    if (response && typeof response === 'object') {
      response.googleCompatResponseFormatFallback = true;
      response.googleResponseFormatFallbackReason = 'object-response-format-rejected';
    }
  }
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
function imageOutputParams(params = {}, profile = imageProfile()) {
  const requestParams = params && typeof params === 'object' ? params : {};
  const format = String(firstDefined(requestParams.format, requestParams.output_format, state.settings.output_format) || 'png').toLowerCase();
  const out = {
    output_format: format,
    moderation: firstDefined(requestParams.moderation, state.settings.moderation)
  };
  if (!profile?.codexCli) {
    out.quality = normalizeImageQuality(firstDefined(requestParams.quality, state.settings.quality));
  }
  if (format === 'png') {
    const transparent = !!firstDefined(requestParams.transparent, requestParams.transparent_background, state.settings.transparent_output, false);
    if (providerKey(profile) !== 'openai' || openAiTransparentBackgroundSupported(profile)) {
      out.transparent_background = transparent;
      out.background = transparent ? 'transparent' : 'auto';
    }
  } else {
    const outputQuality = firstDefined(
      requestParams.outputQuality,
      requestParams.output_quality,
      requestParams.compressionQuality,
      requestParams.compression,
      requestParams.output_compression,
      state.settings.output_compression,
      90
    );
    out.output_compression = outputCompressionFromQuality(outputQuality, 90);
  }
  return out;
}
function appendImageOutputParams(target, params = {}, profile = imageProfile()) {
  const output = imageOutputParams(params, profile);
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
  } else {
    target.negative_prompt = negativePrompt;
  }
}
async function normalizeEditImageBlob(blob, label = '图片') {
  if (!blob?.size) throw imageResponseError(`${label}文件不存在或为空`, 'IMAGE_EDIT_INPUT_EMPTY_FILE', 'request-validation');
  const normalized = await normalizeImageBlobType(blob, blob.type || 'image/png');
  if (!normalized.blob || !String(normalized.info?.type || '').startsWith('image/')) {
    throw imageResponseError(`${label}无法识别为图片`, 'IMAGE_EDIT_INPUT_TYPE', 'request-validation');
  }
  let output = normalized.blob;
  if (normalized.info.type !== 'image/png') {
    try {
      output = await transcodeImageBlob(normalized.blob, 'image/png', 1);
    } catch (error) {
      throw imageResponseError(
        `${label}无法规范化为 PNG`,
        'IMAGE_EDIT_INPUT_DECODE_FAILED',
        'request-validation',
        error?.message || '浏览器图片解码失败'
      );
    }
  }
  const info = await imageInfoFromBlob(output).catch(() => normalized.info || {});
  if (!info.width || !info.height) {
    throw imageResponseError(`${label}尺寸无法读取`, 'IMAGE_EDIT_INPUT_DIMENSIONS', 'request-validation');
  }
  return { blob: output, info: { ...info, type: 'image/png' } };
}
function maskWorkingSize(width, height) {
  const maxEdge = 1920;
  const multiple = 16;
  const longestEdge = Math.max(Number(width) || 0, Number(height) || 0);
  if (!longestEdge || longestEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longestEdge;
  const floorToMultiple = (value) => Math.max(multiple, Math.floor(value / multiple) * multiple);
  return { width: floorToMultiple(width * scale), height: floorToMultiple(height * scale) };
}
async function resizeMaskImageBlobToPng(blob, width, height, label) {
  if (!blob?.size || !width || !height) {
    throw imageResponseError(`${label}无法读取工作尺寸`, 'IMAGE_EDIT_INPUT_DIMENSIONS', 'request-validation');
  }
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器不支持 Canvas');
    context.drawImage(image, 0, 0, width, height);
    const output = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!output) throw new Error('图片导出失败');
    return output;
  } catch (error) {
    throw imageResponseError(`${label}无法缩放为遮罩工作尺寸`, 'IMAGE_EDIT_INPUT_DECODE_FAILED', 'request-validation', error?.message || '图片解码失败');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
async function prepareEditReferenceFiles(validRefs = []) {
  const refs = Array.isArray(validRefs) ? validRefs : [];
  const maskIndexes = refs
    .map(({ ref }, index) => ref?.maskBlobId ? index : -1)
    .filter((index) => index >= 0);
  if (maskIndexes.length > 1 || (maskIndexes.length && maskIndexes[0] !== 0)) {
    throw imageResponseError(
      '遮罩只能绑定第一张主参考图',
      'IMAGE_EDIT_MASK_PRIMARY_REQUIRED',
      'request-validation'
    );
  }
  const first = refs[0];
  const prepared = [];
  let mask = null;
  for (let index = 0; index < refs.length; index += 1) {
    const item = refs[index];
    let blob = item.blob;
    if (index === 0 && first?.ref?.maskBlobId) {
      const original = await getBlob(first.ref.originalBlobId || first.ref.blobId).catch(() => null);
      const normalizedOriginal = await normalizeEditImageBlob(original, '遮罩主图');
      blob = normalizedOriginal.blob;
      const maskBlob = await getBlob(first.ref.maskBlobId).catch(() => null);
      const normalizedMask = await normalizeEditImageBlob(maskBlob, '遮罩');
      if (normalizedOriginal.info.width !== normalizedMask.info.width || normalizedOriginal.info.height !== normalizedMask.info.height) {
        throw imageResponseError(
          '遮罩尺寸与遮罩主图不一致，请重新绘制遮罩',
          'IMAGE_EDIT_MASK_DIMENSIONS_MISMATCH',
          'request-validation',
          `主图：${normalizedOriginal.info.width}x${normalizedOriginal.info.height}；遮罩：${normalizedMask.info.width}x${normalizedMask.info.height}。`
        );
      }
      const workingSize = maskWorkingSize(normalizedOriginal.info.width, normalizedOriginal.info.height);
      if (workingSize.width !== normalizedOriginal.info.width || workingSize.height !== normalizedOriginal.info.height) {
        const [workingOriginal, workingMask] = await Promise.all([
          resizeMaskImageBlobToPng(normalizedOriginal.blob, workingSize.width, workingSize.height, '遮罩主图'),
          resizeMaskImageBlobToPng(normalizedMask.blob, workingSize.width, workingSize.height, '遮罩')
        ]);
        blob = workingOriginal;
        mask = workingMask;
      } else {
        mask = normalizedMask.blob;
      }
    }
    prepared.push({ ...item, blob });
  }
  return { refs: prepared, mask };
}
async function fetchRemoteImageBlob(url, options = {}) {
  const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || 120000, 600000));
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const externalSignal = options.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true });
  const diagnostics = Array.isArray(options.diagnostics) ? options.diagnostics : null;
  const remoteHost = (() => {
    const baseUrl = typeof window !== 'undefined' && window.location?.href ? window.location.href : 'https://localhost/';
    try { return new URL(String(url || ''), baseUrl).hostname.toLowerCase(); } catch { return ''; }
  })();
  const recordAttempt = (attempt) => {
    if (!diagnostics || diagnostics.length >= 8) return;
    diagnostics.push({
      transport: attempt.transport || '',
      host: remoteHost,
      status: Number(attempt.status) || 0,
      code: String(attempt.code || '').replace(/[^A-Z0-9_.-]/gi, '').slice(0, 96),
      contentType: String(attempt.contentType || '').split(';')[0].toLowerCase().slice(0, 80)
    });
  };
  const readFailureCode = async (response, fallback) => {
    const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase();
    if (!/json/.test(contentType)) return { code: fallback, contentType };
    try {
      const text = await response.clone().text();
      const payload = JSON.parse(text.slice(0, 8192));
      const code = firstDefined(payload?.error?.code, payload?.code, fallback);
      return { code, contentType };
    } catch {
      return { code: fallback, contentType };
    }
  };
  try {
    if (externalSignal?.aborted) throw new DOMException('请求已停止', 'AbortError');
    const sources = [String(url || '')];
    if (options.useProxy !== false && sources[0] && !sources[0].startsWith('/api-proxy/image-download')) {
      sources.push(`/api-proxy/image-download?url=${encodeURIComponent(sources[0])}`);
    }
    let lastError = null;
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      const transport = index === 0 ? 'browser-direct' : 'site-proxy';
      try {
        const response = await fetch(source, {
          credentials: index === 0 ? 'omit' : 'same-origin',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal
        });
        if (!response?.ok) {
          const failure = await readFailureCode(response, `HTTP_${response?.status || 0}`);
          recordAttempt({ transport, status: response?.status, code: failure.code, contentType: failure.contentType });
          lastError = new Error(`远程图片下载失败：HTTP ${response?.status || 0}`);
          continue;
        }
        const contentType = normalizeImageMime(response?.headers?.get?.('content-type'));
        const blob = await response.blob();
        const normalized = await normalizeImageBlobType(blob, contentType);
        if (normalized.blob && String(normalized.info?.type || '').startsWith('image/')) return normalized.blob;
        recordAttempt({ transport, status: response?.status, code: 'REMOTE_IMAGE_NOT_IMAGE', contentType });
        lastError = new Error('远程响应不是可识别的图片');
      } catch (error) {
        if (error?.name === 'AbortError' || externalSignal?.aborted) throw error;
        recordAttempt({
          transport,
          code: error?.code || (index === 0 ? 'BROWSER_NETWORK_OR_CORS' : 'REMOTE_IMAGE_FETCH_FAILED')
        });
        lastError = error;
      }
    }
    if (lastError && options.throwOnFailure) throw lastError;
    return null;
  } catch (error) {
    if (timedOut) {
      throw imageResponseError(
        `远程图片下载超过 ${Math.round(timeoutMs / 1000)} 秒`,
        'IMAGE_RESPONSE_REMOTE_TIMEOUT',
        'image-fetch',
        `图片地址：${String(url || '').slice(0, 240)}`
      );
    }
    if (error?.name === 'AbortError' || externalSignal?.aborted) {
      throw imageResponseError('远程图片下载已取消', 'IMAGE_RESPONSE_REMOTE_ABORTED', 'image-fetch');
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener?.('abort', abortFromExternal);
  }
}
function remoteImageFetchFailureSummary(attempts = []) {
  const list = Array.isArray(attempts) ? attempts : [];
  const codes = list.map((attempt) => String(attempt?.code || '').toUpperCase());
  if (codes.some((code) => code.includes('DNS'))) return '远程图片域名解析失败';
  if (codes.some((code) => code.includes('REDIRECT'))) return '远程图片重定向被安全策略拒绝';
  if (codes.some((code) => code.includes('TIMEOUT'))) return '远程图片下载超时';
  if (codes.includes('REMOTE_IMAGE_NOT_IMAGE')) return '远程图片响应不是可识别的图片';
  if (list.some((attempt) => Number(attempt?.status) >= 400)) return '远程图片地址返回上游错误状态';
  if (codes.includes('BROWSER_NETWORK_OR_CORS')) return '浏览器无法跨域读取远程图片，本站代理也未返回可用图片';
  return '远程图片下载失败';
}
function imageCandidateMime(candidate, fallback = 'image/png') {
  const dataUrl = String(firstDefined(candidate?.data_url, candidate?.dataUrl) || '');
  const dataUrlMime = normalizeImageMime((dataUrl.match(/^data:([^;,]+)/i) || [])[1]);
  const hintedMime = normalizeImageMime(firstDefined(
    candidate?.mime_type,
    candidate?.mimeType,
    candidate?.content_type,
    candidate?.contentType,
    candidate?.type
  ));
  const hintedFormat = normalizeImageMime(firstDefined(
    candidate?.output_format,
    candidate?.outputFormat,
    candidate?.format
  ));
  return dataUrlMime || hintedMime || hintedFormat || normalizeImageMime(fallback) || 'image/png';
}
async function strictImageMimeFromBlob(blob) {
  if (!blob?.size) return '';
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  return detectImageMimeFromBytes(head);
}
async function persistResponseImages(response, options = {}) {
  const candidates = collectImageCandidates(response);
  const requestedMime = imageFormatMime(firstDefined(
    options.requestedFormat,
    options.outputFormat,
    response?.requestedOutputFormat
  ));
  const requestedQuality = Number(options.outputQuality);
  const requestedCompression = Number(options.outputCompression);
  const transcodeQuality = Number.isFinite(requestedQuality)
    ? Math.max(0.1, Math.min(1, requestedQuality / 100))
    : Number.isFinite(requestedCompression)
      ? Math.max(0.1, Math.min(1, (100 - requestedCompression) / 100))
    : 0.92;
  const unique = [];
  for (const item of candidates) {
    const rawImage = firstDefined(item.image, item.image_data, item.imageData, item.image_bytes, item.imageBytes);
    let b64 = firstDefined(item.b64_json, item.b64Json, item.base64, item.base64_image, item.base64Image, item.image_base64, item.imageBase64);
    let dataUrl = firstDefined(item.data_url, item.dataUrl, item.image_data_url, item.imageDataUrl);
    let remoteUrl = firstDefined(item.url, item.image_url, item.imageUrl, item.uri, item.src, item.href, item.download_url, item.downloadUrl) || '';
    if (!b64 && !dataUrl && !remoteUrl && typeof rawImage === 'string') {
      if (/^data:image\//i.test(rawImage)) dataUrl = rawImage;
      else if (/^https?:\/\//i.test(rawImage)) remoteUrl = rawImage;
      else b64 = rawImage;
    }
    if (!dataUrl && /^data:image\//i.test(String(remoteUrl || ''))) {
      dataUrl = remoteUrl;
      remoteUrl = '';
    }
    if (!dataUrl && !remoteUrl && !b64) continue;
    unique.push({ ...item, b64, dataUrl, remoteUrl });
  }
  let remoteFetchFailures = 0;
  let invalidImageCandidates = 0;
  const remoteImageAttempts = [];
  try {
    const images = (await Promise.all(unique.map(async ({ b64, dataUrl, remoteUrl, ...candidate }) => {
      try {
        let blob = null;
        const candidateMime = imageCandidateMime({ ...candidate, b64_json: b64, data_url: dataUrl }, 'image/png');
        if (b64) blob = dataUrlToBlob(String(b64).startsWith('data:') ? b64 : `data:${candidateMime};base64,${b64}`);
        else if (dataUrl) blob = dataUrlToBlob(dataUrl);
        else if (remoteUrl) blob = await fetchRemoteImageBlob(remoteUrl, {
          signal: options.signal,
          timeoutMs: options.remoteTimeoutMs,
          diagnostics: remoteImageAttempts
        });
         const normalized = await normalizeImageBlobType(blob, candidateMime);
         if (!normalized.blob) {
           if (remoteUrl) remoteFetchFailures += 1;
           else invalidImageCandidates += 1;
           return null;
         }
          const strictSourceMime = await strictImageMimeFromBlob(normalized.blob);
          if (!strictSourceMime) {
            if (remoteUrl) remoteFetchFailures += 1;
            else invalidImageCandidates += 1;
            return null;
          }
          const sourceInfo = { ...normalized.info, type: strictSourceMime };
         const shouldTranscode = requestedMime && sourceInfo.type !== requestedMime;
         let outputBlob = normalized.blob;
         if (shouldTranscode) {
           try {
             outputBlob = await transcodeImageBlob(normalized.blob, requestedMime, transcodeQuality);
           } catch (error) {
             throw imageResponseError(
               `上游返回的图片无法转换为 ${requestedMime}`,
               'IMAGE_RESPONSE_TRANSCODE_FAILED',
               'image-transcode',
               error?.message || '浏览器图片格式转换失败'
             );
           }
         }
         const output = await normalizeImageBlobType(outputBlob, requestedMime || sourceInfo.type);
         if (!output.blob || (requestedMime && output.info.type !== requestedMime)) {
           throw imageResponseError(
             `上游返回的图片格式无法转换为 ${requestedMime || '目标格式'}`,
             'IMAGE_RESPONSE_TRANSCODE_FAILED',
             'image-transcode',
             `上游格式：${sourceInfo.type || '未知'}；目标格式：${requestedMime || '未知'}。`
           );
         }
         const blobId = await putBlob(output.blob);
         const info = output.info;
         return {
           blobId,
           remoteUrl: /^blob:|^data:/i.test(String(remoteUrl || '')) ? '' : remoteUrl,
           width: info.width,
           height: info.height,
           type: info.type || output.blob.type,
           sourceType: sourceInfo.type || normalized.blob.type || '',
           requestedType: requestedMime || '',
           transcoded: shouldTranscode,
           transparent: info.hasAlpha === undefined ? undefined : !!info.hasAlpha
         };
        } catch (error) {
          if (error?.code === 'IMAGE_RESPONSE_TRANSCODE_FAILED'
            || error?.code === 'IMAGE_RESPONSE_REMOTE_TIMEOUT'
            || error?.code === 'IMAGE_RESPONSE_REMOTE_ABORTED') throw error;
          if (remoteUrl) remoteFetchFailures += 1;
          else invalidImageCandidates += 1;
          return null;
      }
    }))).filter(Boolean);
    if (!images.length) {
      if (remoteFetchFailures && remoteFetchFailures === unique.length) {
        const detail = remoteImageAttempts.slice(0, 8)
          .map((attempt) => `${attempt.transport || 'remote'} ${attempt.host || '未知主机'} ${attempt.code || 'FAILED'}${attempt.status ? ` HTTP ${attempt.status}` : ''}`)
          .join('；');
        const error = imageResponseError(
          `${remoteImageFetchFailureSummary(remoteImageAttempts)}：图片响应包含 ${remoteFetchFailures} 个图片地址，但本站无法下载`,
          'IMAGE_RESPONSE_REMOTE_FETCH_FAILED',
          'image-fetch',
          `图片候选数：${unique.length}；远程图片下载失败：${remoteFetchFailures}。${detail || '未获得可用的远程图片响应。'}`
        );
        error.remoteImageAttempts = remoteImageAttempts.slice(0, 8);
        throw error;
      }
      if (invalidImageCandidates && invalidImageCandidates === unique.length) {
        throw imageResponseError(
          '图片响应包含图片字段，但图片数据无法解码',
          'IMAGE_RESPONSE_IMAGE_DATA_INVALID',
          'image-decode',
          `图片候选数：${unique.length}；无法解码：${invalidImageCandidates}。请检查中转站返回的 Base64 或 data URL 是否完整。`
        );
      }
      throw imageResponseError('图片响应中没有可保存的图片数据', 'IMAGE_RESPONSE_NO_IMAGE', 'image-persist');
    }
    return images;
  } finally {
    for (const url of response?.streamObjectUrls || []) revokeTransientObjectUrl(url);
  }
}
function collectImageCandidates(response) {
  const out = [];
  const seenObjects = new Set();
  const stack = [{ value: response, key: '', depth: 0 }];
  const maxDepth = 12;
  const maxNodes = 20000;
  let scannedNodes = 0;
  const imageValueKeys = new Set([
    'b64_json', 'b64json', 'base64', 'base64_image', 'base64image',
    'image_base64', 'imagebase64', 'image_data', 'imagedata',
    'image_bytes', 'imagebytes', 'image', 'images', 'data', 'output',
    'outputs', 'result', 'results', 'data_url', 'dataurl',
    'image_data_url', 'imagedataurl', 'url', 'image_url', 'imageurl',
    'uri', 'src', 'href'
  ]);
  const addStringCandidate = (value, key) => {
    const text = String(value || '').trim();
    if (!text) return;
    const normalizedKey = String(key || '').replace(/[-\s]/g, '_').toLowerCase();
    const dataUrl = /^data:image\//i.test(text);
    const remoteUrl = /^https?:\/\//i.test(text);
    const base64 = imageValueKeys.has(normalizedKey)
      && !['data', 'output', 'outputs', 'result', 'results'].includes(normalizedKey)
      && /^[A-Za-z0-9+/_=-]{16,}$/.test(text);
    if (!dataUrl && !remoteUrl && !base64) return;
    const outputFormat = firstDefined(response?.output_format, response?.outputFormat, response?.format, response?.response_format?.output_format);
    if (dataUrl) out.push({ data_url: text, output_format: outputFormat });
    else if (remoteUrl) out.push({ url: text });
    else out.push({ b64_json: text, output_format: outputFormat });
  };
  while (stack.length && scannedNodes < maxNodes) {
    const entry = stack.pop();
    const value = entry?.value;
    const key = entry?.key || '';
    const depth = Number(entry?.depth) || 0;
    if (value === null || value === undefined || depth > maxDepth) continue;
    if (typeof value === 'string') {
      addStringCandidate(value, key);
      continue;
    }
    if (typeof value !== 'object' || seenObjects.has(value)) continue;
    seenObjects.add(value);
    scannedNodes += 1;
    if (!Array.isArray(value)) {
      const directImageValue = firstDefined(
        value.b64_json,
        value.b64Json,
        value.base64,
        value.base64_image,
        value.base64Image,
        value.image_base64,
        value.imageBase64,
        value.image_data,
        value.imageData,
        value.image_bytes,
        value.imageBytes,
        value.image,
        value.data_url,
        value.dataUrl,
        value.image_data_url,
        value.imageDataUrl,
        value.url,
        value.image_url,
        value.imageUrl,
        value.uri,
        value.src,
        value.href,
        value.download_url,
        value.downloadUrl
      );
      if (typeof directImageValue === 'string' && directImageValue.trim()) {
        const candidate = { ...value };
        const directB64 = firstDefined(
          value.b64_json,
          value.b64Json,
          value.base64,
          value.base64_image,
          value.base64Image,
          value.image_base64,
          value.imageBase64
        );
        const directDataUrl = firstDefined(value.data_url, value.dataUrl, value.image_data_url, value.imageDataUrl);
        const directUrl = firstDefined(value.url, value.image_url, value.imageUrl, value.uri, value.src, value.href, value.download_url, value.downloadUrl);
        if (!candidate.b64_json && directB64) candidate.b64_json = directB64;
        if (!candidate.data_url && directDataUrl) candidate.data_url = directDataUrl;
        if (!candidate.url && directUrl) candidate.url = directUrl;
        if (!candidate.data_url && !candidate.url && /^data:image\//i.test(directImageValue)) candidate.data_url = directImageValue;
        if (!candidate.url && /^https?:\/\//i.test(directImageValue)) candidate.url = directImageValue;
        out.push(candidate);
        continue;
      }
    }
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: value[index], key, depth: depth + 1 });
      }
    } else {
      const entries = Object.entries(value);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [childKey, child] = entries[index];
        stack.push({ value: child, key: childKey, depth: depth + 1 });
      }
    }
  }
  return out;
}
function streamCandidateSource(candidate) {
  const dataUrl = firstDefined(candidate?.data_url, candidate?.dataUrl);
  const b64 = firstDefined(candidate?.b64_json, candidate?.b64Json);
  const remoteUrl = firstDefined(candidate?.url, candidate?.remoteUrl);
  if (dataUrl) return String(dataUrl);
  if (b64) {
    const mime = imageCandidateMime(candidate, 'image/png');
    return String(b64).startsWith('data:') ? String(b64) : `data:${mime};base64,${b64}`;
  }
  return remoteUrl ? String(remoteUrl) : '';
}
function streamCandidateObjectUrl(candidate) {
  const source = streamCandidateSource(candidate);
  if (!source) return null;
  if (!/^data:/i.test(source)) return { url: source, temporary: false };
  return { url: trackTransientObjectUrl(URL.createObjectURL(dataUrlToBlob(source))), temporary: true };
}
function taskStreamPreviewRecord(task, outputIndex = 0) {
  const live = task?.streamPreviewSlots?.[String(outputIndex)];
  if (live?.url) return { ...live, live: true };
  const persisted = (task?.streamPartialImages || [])
    .filter((item) => Number(item.outputIndex || 0) === Number(outputIndex))
    .sort((a, b) => Number(b.receivedAt || 0) - Number(a.receivedAt || 0))[0];
  return persisted?.blobId ? { ...persisted, live: false } : null;
}
function taskStreamMediaCount(task) {
  const indexes = [
    ...Object.keys(task?.streamPreviewSlots || {}).map(Number),
    ...(task?.streamPartialImages || []).map((item) => Number(item.outputIndex || 0))
  ].filter(Number.isFinite);
  return indexes.length ? Math.max(...indexes) + 1 : 0;
}
function clearTaskStreamPreviewUrls(task, options = {}) {
  if (options.revoke !== false) {
    for (const slot of Object.values(task?.streamPreviewSlots || {})) {
      if (slot?.temporary && slot.url) revokeTransientObjectUrl(slot.url);
    }
  }
  task.streamPreviewSlots = {};
  task.streamPreviewUrl = '';
  task.streamPreviewRemoteUrl = '';
}
function resetTaskStreamPreviewSlotsForHydration(task) {
  if (!task?.streamPreviewSlots || typeof task.streamPreviewSlots !== 'object') return false;
  const entries = Object.entries(task.streamPreviewSlots);
  if (!entries.length) return false;
  const retained = {};
  let changed = false;
  for (const [key, slot] of entries) {
    if (slot?.temporary) {
      const hasPersistedPartial = (task.streamPartialImages || [])
        .some((item) => Number(item?.outputIndex || 0) === Number(slot?.outputIndex ?? key));
      if (hasPersistedPartial) {
        if (slot.url) revokeTransientObjectUrl(slot.url);
        changed = true;
      } else {
        retained[key] = slot;
      }
      continue;
    }
    retained[key] = slot;
  }
  task.streamPreviewSlots = retained;
  const first = retained['0'];
  task.streamPreviewUrl = first?.url || '';
  task.streamPreviewRemoteUrl = first?.url && !first.temporary ? first.url : '';
  return changed;
}
async function restoreStreamPreviewsAfterBfcache() {
  const tasks = (state.tasks || []).filter((task) => Object.keys(task?.streamPreviewSlots || {}).length);
  await Promise.all(tasks.map((task) => waitForTaskStreamPartialPersistence(task.id)));
  let rerender = false;
  for (const task of tasks) {
    if (!state.tasks.some((item) => item === task || item?.id === task?.id)) continue;
    rerender = resetTaskStreamPreviewSlotsForHydration(task) || rerender;
    if (Object.keys(task.streamPreviewSlots || {}).length) rerender = true;
  }
  if (rerender) render({ allowDuringScroll: true });
  await hydrateImages();
  return rerender;
}
async function candidateToBlob(candidate) {
  const source = streamCandidateSource(candidate);
  if (!source) return null;
  if (/^data:/i.test(source)) return dataUrlToBlob(source);
  return fetchRemoteImageBlob(source);
}
async function persistTaskStreamPartialCandidate(task, candidate, generation = taskGenerationVersions.get(task?.id)) {
  if (!task || !candidate || !isTaskGenerationActive(task, generation)) return false;
  const blob = await candidateToBlob(candidate);
  if (!blob?.size || !isTaskGenerationActive(task, generation)) return false;
  const blobId = await putBlob(blob);
  if (!isTaskGenerationActive(task, generation)) {
    await releaseBlobIdsSafely([blobId]);
    return false;
  }
  const outputIndex = Number(candidate.outputIndex || candidate.output_index || 0);
  const receivedAt = Number(candidate.receivedAt || Date.now());
  const previous = Array.isArray(task.streamPartialImages) ? [...task.streamPartialImages] : [];
  const current = [...previous];
  const sameOutput = current
    .filter((item) => Number(item.outputIndex || 0) === outputIndex)
    .sort((a, b) => Number(a.receivedAt || 0) - Number(b.receivedAt || 0));
  let kind = 'first';
  const removeIds = [];
  if (sameOutput.length) {
    kind = 'latest';
    const oldLatest = sameOutput.find((item) => item.kind === 'latest')
      || (sameOutput.length >= STREAM_PARTIAL_PER_OUTPUT_LIMIT ? sameOutput.at(-1) : null);
    if (oldLatest) {
      removeIds.push(oldLatest.blobId);
      const oldIndex = current.indexOf(oldLatest);
      if (oldIndex >= 0) current.splice(oldIndex, 1);
    }
  }
  current.push({
    blobId,
    outputIndex,
    partialIndex: candidate.partialIndex,
    kind,
    eventType: candidate.eventType || '',
    receivedAt,
    type: blob.type || 'image/png'
  });
  while (current.length > STREAM_PARTIAL_TASK_LIMIT) {
    const evicted = current.shift();
    if (evicted?.blobId) removeIds.push(evicted.blobId);
  }
  task.streamPartialImages = current;
  touchTaskPersistence(task);
  const persisted = writeStore();
  const taskPersistenceCommitted = persisted === 'idb' ? await flushTaskPersistence() : persisted;
  if (taskPersistenceCommitted === false) {
    task.streamPartialImages = previous;
    // 回滚快照必须拥有更高版本，避免 IDB 合并逻辑继续保留失败写入的 partial 引用。
    touchTaskPersistence(task);
    await scheduleTaskPersistence(state.tasks).catch(() => {});
    await flushTaskPersistence().catch(() => {});
    await releaseBlobIdsSafely([blobId]);
    return false;
  }
  queuePendingBlobRelease(removeIds.filter((id) => id && id !== blobId), persisted === true);
  if (persisted === true) releaseBlobReservation(blobId);
  else if (persisted === undefined) pendingBlobReservationReleases.add(blobId);
  return true;
}
function queueTaskStreamPartialPersist(task, candidate, generation = taskGenerationVersions.get(task?.id)) {
  if (!task || !candidate || !isTaskGenerationActive(task, generation)) return Promise.resolve();
  const taskId = task.id;
  const outputIndex = Number(candidate.outputIndex || candidate.output_index || 0);
  let pendingState = streamPartialPersistPending.get(taskId);
  if (!pendingState) {
    pendingState = { pending: new Map() };
    streamPartialPersistPending.set(taskId, pendingState);
  }
  const outputKey = String(outputIndex);
  const queued = pendingState.pending.get(outputKey) || { first: null, latest: null };
  const persistedFirst = (task.streamPartialImages || []).some((item) =>
    Number(item.outputIndex || 0) === outputIndex && item.kind === 'first'
  );
  if (!queued.first && !persistedFirst) queued.first = candidate;
  queued.latest = candidate;
  pendingState.pending.set(outputKey, queued);
  if (!streamPartialPersistChains.has(taskId)) {
    const next = (async () => {
      try {
        while (pendingState.pending.size) {
          await new Promise((resolve) => setTimeout(resolve, STREAM_PARTIAL_PERSIST_DELAY_MS));
          const batch = [...pendingState.pending.values()];
          pendingState.pending.clear();
          for (const item of batch) {
            if (!isTaskGenerationActive(task, generation)) continue;
            if (item.first) await persistTaskStreamPartialCandidate(task, item.first, generation);
            if (item.latest && item.latest !== item.first) {
              await persistTaskStreamPartialCandidate(task, item.latest, generation);
            }
          }
        }
      } catch (error) {
        console.warn('[home-v3] failed to persist stream preview', error);
        task.streamPersistError = error?.message || String(error);
      } finally {
        if (streamPartialPersistChains.get(taskId) === next) streamPartialPersistChains.delete(taskId);
        if (streamPartialPersistPending.get(taskId) === pendingState) streamPartialPersistPending.delete(taskId);
      }
    })();
    streamPartialPersistChains.set(taskId, next);
  }
  return streamPartialPersistChains.get(taskId) || Promise.resolve();
}
async function waitForTaskStreamPartialPersistence(taskId) {
  await streamPartialPersistChains.get(taskId)?.catch?.(() => {});
}
async function clearTaskStreamPartialImages(task) {
  const ids = (task?.streamPartialImages || []).map((item) => item.blobId).filter(Boolean);
  task.streamPartialImages = [];
  return ids;
}
function enrichProxyStreamError(error) {
  const message = String(error?.message || '');
  const code = message.match(/\b(?:PROXY|PRO_WORKBENCH)_[A-Z0-9_]+\b/i)?.[0];
  const stage = message.match(/阶段：([a-z0-9-]+)/i)?.[1];
  if (code) error.code = code.toUpperCase();
  if (stage) error.stage = stage;
  return error;
}
async function consumeImageStream(response, onPartialImage) {
  if (!IMAGE_STREAM_RUNTIME?.consumeImageStream) {
    throw imageResponseError('图片流运行时未加载', 'IMAGE_STREAM_RUNTIME_MISSING', 'stream-open');
  }
  let payload;
  try {
    payload = await IMAGE_STREAM_RUNTIME.consumeImageStream(response, { onPartialImage });
  } catch (error) {
    throw enrichProxyStreamError(error);
  }
  const streamObjectUrls = [];
  const data = (payload.data || []).map((candidate) => {
    const resolved = streamCandidateObjectUrl(candidate);
    if (!resolved) return candidate;
    if (resolved.temporary) streamObjectUrls.push(resolved.url);
    return { ...candidate, url: resolved.url, b64_json: undefined, data_url: undefined };
  });
  return { ...payload, data, streamObjectUrls };
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
  const returnedCompression = readDeepAlias(response, ['compression', 'output_compression', 'outputCompression']);
  const returnedOutputQuality = firstDefined(
    readDeepAlias(response, ['outputQuality', 'output_quality', 'compressionQuality', 'compression_quality']),
    outputQualityFromCompression(returnedCompression)
  );
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
    compression: returnedOutputQuality,
    outputQuality: returnedOutputQuality,
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
    normalizeError,
    collectObjectsDeep,
    imageInfoFromBlob,
    detectImageMimeFromBytes,
    imageProfile,
    profileSelectionKey,
    findImageProfileById,
    appendAdvancedHeaders,
    resolveTaskProfile,
    retryTask,
    collectImageCandidates,
    taskStreamPreviewRecord,
    taskStreamMediaCount,
    renderTaskStreamPreviewImage,
    resetTaskStreamPreviewSlotsForHydration,
    restoreStreamPreviewsAfterBfcache,
    renderTaskRecoveryNotice,
    renderGalleryStage,
    retryTaskHistory,
    persistTaskStreamPartialCandidate,
    queueTaskStreamPartialPersist,
    waitForTaskStreamPartialPersistence,
    clearTaskStreamPartialImages,
    downloadStreamPreview,
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
    clipboardPngBlob,
    editOutput,
    captureAgentScrollAnchor,
    restoreAgentScrollAnchor,
    freezeAgentScrollForRender,
    releaseAgentScrollFreezeAfterRender,
    preserveAgentScrollForRender,
    renderPreservingAgentScroll,
    shouldPreserveAgentScrollForTask,
    galleryVirtualWindow,
    measureGalleryMetrics,
    estimateGalleryCardHeight,
    galleryVirtualRangeChanged,
    galleryVirtualWindowNeedsRefresh,
    promptRepoVirtualWindowNeedsRefresh,
    promptItemStableKey,
    renderGalleryListOnly,
    promptRepoVirtualWindow,
    measurePromptRepoVirtualLayout,
    maskCanvasHasPaint,
    shouldCloseModalFromClick,
    returnedPromptFromResponse,
    normalizeComparableValue,
    normalizeImageQuality,
    outputQualityPercent,
    outputCompressionFromQuality,
    outputQualityFromCompression,
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
    putBlob,
    readStore,
    collectReferencedBlobIds,
    deleteUnreferencedBlobIds,
    performDeleteTask,
    cleanupOrphanBlobs,
    persistAgentHistorySnapshots,
    hydrateAgentHistoryFromDb,
    flushTaskPersistence,
    hydrateTasksFromDb,
    compactAgentThreadMessages,
    compactAgentMessagesByThreadForStorage,
    mergeGenerationPartialErrors,
    consumeImageStream,
    consumeImageHttpResponse,
    classifyImageResponse,
    fetchRemoteImageBlob,
    remoteImageFetchFailureSummary,
    rememberObjectUrl,
    revokeAllObjectUrls,
    hydrateBlobImage,
    buildGalleryPreviewBlob,
    hydrateGalleryPreviewImage,
    readBlobReservations,
    reserveBlobId,
    releaseBlobReservation,
    agentArchiveLocalChanges,
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
    assertSuccessfulResponseTerminal,
    extractResponseText,
    agentTextProfile,
    configuredAgentTextProfile,
    agentTextProfileInvalidReason,
    agentWebSearchSupported,
    agentRequestTimeoutSeconds,
    agentResponsesStreamEnabled,
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
    workflowAdvancedSettings,
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
    initialAgentImageSettings,
    agentImageParams,
    agentImageProfile,
    setAgentImageParam,
    renderSidebar,
    renderAgentStage,
    renderAgentComposer,
    renderWorkflowWorkspace,
    renderPopover,
    renderEntryAdvancedModal,
    render,
    captureFocusState,
    restoreFocusState,
    topVisibleModal,
    syncModalAccessibility,
    loadRuntime,
    runtimeRenderSignature,
    updateRunningTimers,
    writeStore,
    mergeCrossTabStoreDomains,
    setGalleryScrollActivity,
    setTestTasks: (tasks) => { state.tasks = Array.isArray(tasks) ? tasks : []; filteredTasksCache = null; },
    setTestPersistedStoreBaseline: (snapshot) => {
      persistedStoreBaseline = snapshot && typeof snapshot === 'object' ? JSON.parse(JSON.stringify(snapshot)) : null;
    },
    setTestState: (patch = {}) => {
      if (patch.profiles) state.profiles = patch.profiles;
      if (patch.activeProfileId !== undefined) state.activeProfileId = patch.activeProfileId;
      if (patch.activeImageProfileId !== undefined) state.activeImageProfileId = patch.activeImageProfileId;
      if (patch.agentConfig) state.agentConfig = { ...state.agentConfig, ...patch.agentConfig };
      if (patch.agent) state.agent = migrateAgentThreads({ ...state.agent, ...patch.agent }, { interruptPending: false });
      if (patch.preferences) state.preferences = { ...state.preferences, ...patch.preferences };
      if (patch.settings) state.settings = { ...state.settings, ...patch.settings };
      if (patch.confirmDialog !== undefined) state.confirmDialog = patch.confirmDialog;
      if (patch.workflowDraft !== undefined) state.workflowDraft = patch.workflowDraft;
      if (patch.workflowInvoke !== undefined) state.workflowInvoke = patch.workflowInvoke;
      if (patch.mode !== undefined) state.mode = patch.mode;
      if (patch.references) state.references = patch.references;
      if (patch.taskStore !== undefined) state.taskStore = patch.taskStore;
      if (patch.taskRecovery !== undefined) state.taskRecovery = patch.taskRecovery;
      if (patch.composerPrompt !== undefined) state.composerPrompt = patch.composerPrompt;
      if (patch.galleryVirtual) state.galleryVirtual = { ...state.galleryVirtual, ...patch.galleryVirtual };
      if (patch.promptRepo) state.promptRepo = { ...state.promptRepo, ...patch.promptRepo };
      if (patch.popover !== undefined) state.popover = patch.popover;
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
      taskStore: state.taskStore,
      taskRecovery: state.taskRecovery,
      references: state.references,
      composerPrompt: state.composerPrompt,
      galleryVirtual: state.galleryVirtual,
      promptRepo: state.promptRepo,
      popover: state.popover,
      agentScrollLock: state.agentScrollLock,
      agentScrollState: state.agentScrollState,
      confirmDialog: state.confirmDialog,
      workflowDraft: state.workflowDraft,
      workflowInvoke: state.workflowInvoke,
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
  const holder = { value: undefined };
  const stack = [{ value: response, parent: holder, key: 'value', depth: 0 }];
  const seen = new Set();
  const maxDepth = 6;
  const maxNodes = 4096;
  let scannedNodes = 0;
  while (stack.length) {
    const entry = stack.pop();
    const value = entry?.value;
    const parent = entry?.parent;
    const key = entry?.key;
    const depth = Number(entry?.depth) || 0;
    if (!parent) continue;
    if (value === null || value === undefined) {
      parent[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      parent[key] = /^(?:blob:|data:image\/)/i.test(value) || value.length > 2000 ? `[text:${value.length}]` : value;
      continue;
    }
    if (typeof value !== 'object') {
      parent[key] = value;
      continue;
    }
    if (depth > maxDepth) {
      parent[key] = '[depth-truncated]';
      continue;
    }
    if (seen.has(value)) {
      parent[key] = '[circular]';
      continue;
    }
    if (scannedNodes >= maxNodes) {
      parent[key] = '[node-limit]';
      continue;
    }
    seen.add(value);
    scannedNodes += 1;
    if (Array.isArray(value)) {
      const out = [];
      parent[key] = out;
      const limit = Math.min(value.length, 20);
      for (let index = limit - 1; index >= 0; index -= 1) {
        stack.push({ value: value[index], parent: out, key: index, depth: depth + 1 });
      }
      continue;
    }
    const out = {};
    parent[key] = out;
    const entries = Object.entries(value);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [childKey, child] = entries[index];
      if (binaryKeys.has(childKey)) {
        out[childKey] = child ? '[image-data]' : child;
      } else {
        stack.push({ value: child, parent: out, key: childKey, depth: depth + 1 });
      }
    }
  }
  return holder.value;
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
  restoreTaskToComposer(task, { mode: 'reuse' }).catch(() => toast('复用配置失败'));
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
  const taskBlobIdsToDelete = taskBlobIds(task);
  const taskReferences = taskReferenceSnapshots(task);
  clearTaskStreamPreviewUrls(task);
  invalidateTaskGeneration(task.id);
  state.tasks = state.tasks.filter((t) => t.id !== id);
  delete state.favorites[id];
  state.selectedTaskIds = state.selectedTaskIds.filter((tid) => tid !== id);
  if (state.modal === id) state.modal = null;
  const persisted = writeStore({ deletedTaskIds: [id], forceTaskPersistence: true });
  await waitForTaskStreamPartialPersistence(task.id);
  const partialIds = await clearTaskStreamPartialImages(task);
  const candidates = [...new Set([...taskBlobIdsToDelete, ...partialIds])];
  const taskPersistenceCommitted = await flushTaskPersistence();
  if (taskPersistenceCommitted === true) await deleteUnreferencedBlobIds(candidates);
  else queuePendingBlobRelease(candidates, false);
  await Promise.all(taskReferences.map(async (ref) => {
    for (const key of [...state.refUrls.keys()].filter((item) => item.includes(`:${id}:`) || item.includes(`:${ref.id}:`))) revokeMapEntry(state.refUrls, key);
  }));
  render();
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
  const records = deleteIds
    .map((id) => state.tasks.find((task) => task.id === id))
    .filter(Boolean)
    .map((task) => ({ task, references: taskReferenceSnapshots(task), blobIds: taskBlobIds(task) }));
  const candidates = new Set();
  records.forEach(({ task, blobIds }) => {
    clearTaskStreamPreviewUrls(task);
    invalidateTaskGeneration(task.id);
    blobIds.forEach((id) => candidates.add(id));
  });
  state.tasks = state.tasks.filter((task) => !deleteIds.includes(task.id));
  state.selectedTaskIds = state.selectedTaskIds.filter((id) => !deleteIds.includes(id));
  if (deleteIds.includes(state.modal)) state.modal = null;
  const persisted = writeStore({ deletedTaskIds: deleteIds, forceTaskPersistence: true });
  await Promise.all(records.map(async ({ task, references }) => {
    await waitForTaskStreamPartialPersistence(task.id);
    const partialIds = await clearTaskStreamPartialImages(task);
    partialIds.forEach((id) => candidates.add(id));
    await Promise.all(references.map(async (ref) => {
      for (const key of [...state.refUrls.keys()].filter((item) => item.includes(`:${task.id}:`) || item.includes(`:${ref.id}:`))) revokeMapEntry(state.refUrls, key);
    }));
  }));
  const taskPersistenceCommitted = await flushTaskPersistence();
  if (taskPersistenceCommitted === true) await deleteUnreferencedBlobIds([...candidates]);
  else queuePendingBlobRelease([...candidates], false);
  render();
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
async function editOutput(id, options = {}) {
  const task = state.tasks.find((t) => t.id === id);
  const images = task?.images || [];
  const index = Math.max(0, Math.min(Number(options.index) || 0, Math.max(0, images.length - 1)));
  const image = task && images[index];
  if (!image) return toast('当前任务没有可编辑图片');
  const blob = await getBlob(options.blobId || image.blobId);
  if (!blob) return toast('原图不在当前浏览器本地，无法编辑');
  const blobId = await putBlob(blob);
  const ref = {
    id: uid('ref'),
    blobId,
    originalBlobId: blobId,
    compositedBlobId: blobId,
    name: `edit-${task.id}-${index + 1}.png`,
    type: blob.type,
    width: image.width,
    height: image.height
  };
  state.references = [ref, ...state.references].slice(0, referenceLimit());
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
const promptDetailChunkCache = new Map();
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
function promptItemNeedsHydration(item) {
  if (!item) return false;
  if (item.partial || item.d) return true;
  const text = String(item.p || '');
  return /\.\.\.$|…$/.test(text.trim());
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
    ranked.push({ item: { ...item, partial: promptItemNeedsHydration(item) }, index, score });
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
  return loadPromptCategoryFullPage(cleanCategory);
}
async function loadPromptCategoryFullPage(category) {
  const cleanCategory = category || 'all';
  if (cleanCategory === 'all') return pageDataFromPromptBootstrap('all');
  const cacheKey = promptRepoPageCacheKey(1, { category: cleanCategory, query: '' });
  const cached = promptPageCache.get(cacheKey);
  if (cached) return cached;
  const bootstrap = await loadPromptBootstrap();
  const file = bootstrap?.categoryFiles?.[cleanCategory];
  if (!file || String(file).includes('..')) return null;
  if (!promptCategoryPagePromises.has(cleanCategory)) {
    const request = fetch(`/prompts_fast/${file}?v=${PROMPT_FAST_VERSION}`, {
      credentials: 'same-origin',
      cache: 'force-cache'
    }).then(async (res) => {
      if (!res.ok) throw new Error(`prompt category ${res.status}`);
      const data = await res.json();
      rememberPromptPageCache(cacheKey, data);
      return data;
    }).finally(() => {
      promptCategoryPagePromises.delete(cleanCategory);
    });
    promptCategoryPagePromises.set(cleanCategory, request);
  }
  return promptCategoryPagePromises.get(cleanCategory);
}
async function loadPromptDetailChunk(file) {
  const cleanFile = String(file || '');
  if (!cleanFile || cleanFile.includes('..') || !cleanFile.startsWith('details/')) return null;
  if (promptDetailChunkCache.has(cleanFile)) {
    const cached = promptDetailChunkCache.get(cleanFile);
    promptDetailChunkCache.delete(cleanFile);
    promptDetailChunkCache.set(cleanFile, cached);
    return cached;
  }
  if (!promptDetailChunkPromises.has(cleanFile)) {
    const request = fetch(`/prompts_fast/${cleanFile}?v=${PROMPT_FAST_VERSION}`, {
      credentials: 'same-origin',
      cache: 'force-cache'
    }).then(async (res) => {
      if (!res.ok) throw new Error(`prompt detail ${res.status}`);
      const data = await res.json();
      promptDetailChunkCache.set(cleanFile, data);
      while (promptDetailChunkCache.size > 12) promptDetailChunkCache.delete(promptDetailChunkCache.keys().next().value);
      return data;
    }).finally(() => {
      promptDetailChunkPromises.delete(cleanFile);
    });
    promptDetailChunkPromises.set(cleanFile, request);
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
  if (promptRepoScrollIsActive()) return;
  const restoreToken = ++promptRepoScrollRestoreToken;
  state.promptRepo.scrollLockUntil = Date.now() + 240;
  requestAnimationFrame(() => {
    if (restoreToken !== promptRepoScrollRestoreToken || promptRepoScrollIsActive()) return;
    const nextList = $('#promptList');
    if (!nextList) return;
    setScrollTopIfNeeded(nextList, Math.min(scrollTop, Math.max(0, nextList.scrollHeight - nextList.clientHeight)));
    state.promptRepo.scrollTop = nextList.scrollTop;
  });
}
function restorePromptCategoryScroll(scrollTop) {
  if (scrollTop === null || scrollTop === undefined) return;
  const restoreToken = ++promptRepoScrollRestoreToken;
  const restore = () => {
    if (restoreToken !== promptRepoScrollRestoreToken) return;
    const categories = $('#promptCategories');
    if (!categories) return;
    setScrollTopIfNeeded(categories, Math.min(scrollTop, Math.max(0, categories.scrollHeight - categories.clientHeight)));
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
  const restoreToken = ++promptRepoScrollRestoreToken;
  state.promptRepo.scrollLockUntil = Date.now() + 240;
  requestAnimationFrame(() => {
    if (restoreToken !== promptRepoScrollRestoreToken || promptRepoScrollIsActive()) return;
    const nextList = $('#promptList');
    if (nextList) {
      const maxTop = Math.max(0, nextList.scrollHeight - nextList.clientHeight);
      setScrollTopIfNeeded(nextList, Math.min(snapshot.scrollTop || 0, maxTop));
      if (snapshot.anchorIndex) {
        const anchor = nextList.querySelector(`.prompt-card[data-index="${snapshot.anchorIndex}"]`);
        if (anchor) {
          const listTop = nextList.getBoundingClientRect().top;
          const delta = (anchor.getBoundingClientRect().top - listTop) - (snapshot.anchorOffset || 0);
          if (Math.abs(delta) > 1) {
            setScrollTopIfNeeded(nextList, Math.min(Math.max(0, nextList.scrollTop + delta), Math.max(0, nextList.scrollHeight - nextList.clientHeight)));
          }
        }
      }
      state.promptRepo.scrollTop = nextList.scrollTop;
    }
    const categories = $('#promptCategories');
    if (categories) {
      setScrollTopIfNeeded(categories, Math.min(snapshot.categoryScrollTop || 0, Math.max(0, categories.scrollHeight - categories.clientHeight)));
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
  delete state.promptRepo.detailIndex;
  delete state.promptRepo.detailKey;
  state.promptRepo.detail = null;
  if (!syncPromptRepoOverlays()) render();
  restoreModalOpener('prompt-detail');
  stabilizePromptRepoViewport(snapshot);
}
function closePromptRepoImageViewerOverlay() {
  const snapshot = capturePromptRepoViewportSnapshot();
  state.promptRepo.imageViewer = null;
  if (!syncPromptRepoOverlays()) render();
  restoreModalOpener('prompt-viewer');
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
  rememberModalOpener('prompt-repo');
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
  if (!promptItemNeedsHydration(item)) return item;
  if (item.d) {
    const chunkData = await loadPromptDetailChunk(item.d).catch(() => null);
    const full = chunkData?.prompts?.find((prompt) => String(prompt.id) === String(item.id));
    if (full) return { ...full, partial: false, d: item.d || full.d || '' };
  }
  const pageData = await loadPromptCategoryFullPage(item.c || state.promptRepo.category || 'all').catch(() => null);
  const full = pageData?.prompts?.find((prompt) => String(prompt.id) === String(item.id));
  return full ? { ...full, partial: false, d: item.d || full.d || '' } : item;
}
async function hydratePromptDetailItem(item) {
  const itemIndex = Number(state.promptRepo.detailIndex);
  const detailKey = String(state.promptRepo.detailKey || '');
  if (!Number.isInteger(itemIndex) || !state.promptRepo.items[itemIndex]) return;
  if (detailKey && promptItemStableKey(state.promptRepo.items[itemIndex], itemIndex) !== detailKey) return;
  const full = await fullPromptItem(item);
  if (!state.promptRepo.open || !state.promptRepo.detail || !state.promptRepo.items[itemIndex]) return;
  if (detailKey && promptItemStableKey(state.promptRepo.items[itemIndex], itemIndex) !== detailKey) return;
  if (state.promptRepo.detailIndex !== itemIndex) return;
  state.promptRepo.detail = full;
  state.promptRepo.detailKey = promptItemStableKey(full, itemIndex);
  state.promptRepo.items = state.promptRepo.items.map((prompt, index) => index === itemIndex ? full : prompt);
  if (!syncPromptRepoOverlays()) render();
}
async function usePrompt(id, index = '') {
  const itemIndex = Number(index);
  const item = Number.isInteger(itemIndex) && state.promptRepo.items[itemIndex]
    ? state.promptRepo.items[itemIndex]
    : state.promptRepo.items.find((p) => String(p.id) === String(id));
  if (!item) return;
  const full = await fullPromptItem(item);
  state.composerPrompt = full?.p || item.p || '';
  state.promptRepo.open = false;
  state.promptRepo.detail = null;
  delete state.promptRepo.detailIndex;
  delete state.promptRepo.detailKey;
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
    stream: agentResponsesStreamEnabled(textProfile),
    instructions: [
      '你是当前项目的 Agent，负责直接、清晰地回答用户问题。',
      '不要生成 workflow JSON，除非用户明确要求。',
      '普通问答保持简洁；不要为了生图而强行输出多个方案。',
      '遇到生图、图片修改、工作流或参数建议时，先判断用户需求是否足够明确；缺少会显著影响结果的关键信息时，先追问，最多 3 个问题。',
      '需求简单且明确时，默认只输出 1 个可直接使用的推荐 Prompt；用户明确要求多方案、风格对比、模型对比，或需求存在多个合理方向时，再输出 2-5 个方案。',
      '输出方案时使用固定字段：方案 N、适合模型、推荐理由、正向 Prompt、负面 Prompt；只有 1 个方案也可以使用“方案 1（推荐）”。',
      '只把可直接生图的内容写进正向 Prompt；说明、免责声明、选择建议不得混入 Prompt。',
      '负面 Prompt 必须单独给出；如果没有明确禁用项，也要给出简短的避免项。',
      '多方案时请在最终推荐方案标题中标记“（推荐）”；用户点击生成图片时只会使用推荐方案或第一个方案的正向和负面 Prompt。',
      '高影响不确定项先问，最多 3 个问题；低影响不确定项直接采用合理默认，并用一句话注明假设。',
      '保留用户输入中的品牌、角色、作品名、原创等原词；不要添加免责声明、原创替代词或自行改写这些名称。',
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
    stream: agentResponsesStreamEnabled(textProfile),
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
    const requestBodyWithStream = agentResponsesStreamEnabled(textProfile)
      ? { ...requestBody, stream: true }
      : { ...requestBody, stream: false };
    const responsePayload = await fetchJson('/api-proxy/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Profile-Id': profileSelectionKey(textProfile) },
      body: JSON.stringify(requestBodyWithStream),
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
  const scrollAnchor = freezeAgentScrollForRender();
  await generateAgentImageFromMessage(sourceMessage.id, '', { optionIndex, scrollAnchor });
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
  const timeoutSeconds = agentRequestTimeoutSeconds(textProfile);
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
    const data = await postAgentResponsesRequest(payload, textProfile);
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
  }
  if (isActiveAgentContext(project.id, thread.id)) persistRender();
  else writeStore();
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
  const projectId = project?.id || '';
  const thread = activeAgentThread(project?.id);
  const threadId = thread?.id;
  const messages = Array.isArray(state.agent.messagesByThread?.[threadId]) ? state.agent.messagesByThread[threadId] : [];
  const sourceMessage = messages.find((message) => message.id === messageId);
  const promptBundle = agentMessageImagePrompts(sourceMessage, prompt, options);
  const cleanPrompt = promptBundle.prompt;
  const negativePrompt = cleanNegativeAgentPrompt(promptBundle.negativePrompt);
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
      agentProjectId: projectId,
      agentThreadId: threadId,
      agentMessageId: messageId,
      agentOption: option?.index || '',
      agentOptionTitle: option?.title || '',
      editedFromOption: options.editedFromOption || '',
      onCreated: (createdTask) => {
        if (!isActiveAgentContext(projectId, threadId)) {
          state.agentScrollLock = null;
          return;
        }
        attachAgentTaskToMessage(threadId, messageId, createdTask.id, cleanPrompt, { renderNow: true, option });
        releaseAgentScrollFreezeAfterRender();
      }
    }
  });
  if (!task) {
    state.agentScrollLock = null;
    return;
  }
  if (isActiveAgentContext(projectId, threadId)) {
    attachAgentTaskToMessage(threadId, messageId, task.id, cleanPrompt, { option });
    if (scrollAnchor?.id) state.agentScrollState = { ...(state.agentScrollState || {}), nearBottom: false, anchor: scrollAnchor };
  }
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
  if (options.renderNow) renderPreservingAgentScroll();
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
    .replace(/^(?:#{1,6}\s*)?(?:负面\s*(?:Prompt|提示词)?|反向\s*(?:Prompt|提示词)?|negative(?:\s*prompt)?)(?:\s*[（(][^()（）\n]{0,48}[)）])?\s*[:：]?\s*/i, '')
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
  const sectionPattern = /(?:^|\n)\s*(?:-{3,}\s*)?(?:#{0,6}\s*)?(?:\*\*)?(负面\s*(?:Prompt|提示词)?|反向\s*(?:Prompt|提示词)?|negative(?:\s*prompt)?)(?:\s*[（(][^()（）\n]{0,48}[)）])?(?:\*\*)?\s*[:：]?\s*/ig;
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
  if (/我不能|不能直接|但可以|你可以|如果你想|我还可以|以下|说明一点/.test(value.slice(0, 80))) return false;
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
  const outputCompression = String(firstDefined(config.outputCompression, config.output_compression) ?? '').trim();
  const negativePrompt = cleanNegativeAgentPrompt(config.negativePrompt || config.negative_prompt || config.negative || '');
  if (quality) params.quality = normalizeImageQuality(quality);
  if (outputFormat) {
    params.format = outputFormat;
    params.output_format = outputFormat;
  }
  if (outputCompression) {
    params.compression = outputCompression;
    params.outputCompression = outputCompression;
    params.output_compression = outputCompression;
  }
  const transparent = config.transparent ?? config.transparentOutput ?? config.transparent_output;
  if (transparent !== undefined) {
    params.transparent = !!transparent;
    params.transparent_background = !!transparent;
  }
  const moderation = String(config.moderation || '').trim();
  if (moderation) params.moderation = moderation;
  if (negativePrompt) {
    Object.assign(params, { negativePrompt, negative_prompt: negativePrompt });
  }
  return params;
}
function workflowAdvancedSettings(workflow, profile) {
  const config = workflow?.config || {};
  return {
    responseFormatB64Json: config.responseFormatB64Json ?? config.response_format_b64_json,
    streamImages: config.streamImages ?? config.stream,
    streamPartialImages: config.streamPartialImages ?? config.partialImages ?? config.partial_images,
    timeout: config.timeout
  };
}
function newWorkflowDraft() {
  rememberModalOpener('workflow-editor');
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
  rememberModalOpener('workflow-invoke');
  state.workflowInvoke = {
    workflowId: workflow.id,
    workflow: JSON.parse(JSON.stringify(workflow)),
    rows: JSON.parse(JSON.stringify(workflow.variables?.rows || [])),
    columns: [...(workflow.variables?.columns || [])],
    countPerRow: Math.max(1, Number(workflow.config?.count) || 1),
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
    const data = await postAgentResponsesRequest({
      input: `项目专属提示词：${(state.agent.projects.find((p) => p.id === projectId)?.prompt || '无')}\n请规划并改写适合生图的提示词。任务：${input}`,
      model: textProfile.model,
      stream: agentResponsesStreamEnabled(textProfile)
    }, textProfile);
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
    error: '',
    errorDetail: '',
    failedRowCount: 0
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
  let hasRowFailures = false;
  const recordFailure = (failure, item) => {
    hasRowFailures = true;
    run.failedRowCount = Number(run.failedRowCount || 0) + 1;
    const rowIndex = Number.isFinite(Number(failure?.rowIndex)) ? Number(failure.rowIndex) : Number(item?.index || 0);
    const label = failure?.batchLabel || item?.row?.values?.subject || item?.row?.values?.product_name || item?.row?.values?.name || `第 ${rowIndex + 1} 行`;
    const summary = failure?.summary || '工作流行执行失败';
    const detail = failure?.detail && failure.detail !== summary ? `：${failure.detail}` : '';
    run.error = run.error || '部分工作流行执行失败';
    run.errorDetail = [run.errorDetail, `第 ${rowIndex + 1} 行（${label}）：${summary}${detail}`].filter(Boolean).join('\n');
  };
  await new Promise((resolve) => {
    const pump = () => {
      if (failed) {
        if (active === 0) resolve();
        return;
      }
      if (!queue.length && active === 0) return resolve();
      while (active < run.concurrency && queue.length && !failed) {
        const item = queue.shift();
        active++;
        executeWorkflowRow(run, item.row, item.index)
          .then((result) => {
            if (result?.failed) recordFailure(result, item);
          })
          .catch((err) => {
            const normalized = normalizeError(err, '工作流执行失败');
            if (!run.budget.continueOnStepError) {
              failed = true;
              run.status = 'error';
              run.error = normalized.summary;
              run.errorDetail = normalized.detail;
              run.failedRowCount = Number(run.failedRowCount || 0) + 1;
            } else {
              recordFailure({ summary: normalized.summary, detail: normalized.detail, rowIndex: item.index }, item);
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
  if (run.status === 'running') run.status = failed ? 'error' : hasRowFailures ? 'partial_success' : 'success';
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
    const advanced = workflowAdvancedSettings(workflow, profile);
    const taskSeed = {
      prompt,
      requestedParams: params,
      advanced,
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
    return { failed: true, rowIndex, batchLabel, summary: normalized.summary, detail: normalized.detail };
  }
  return { failed: false, rowIndex, batchLabel };
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
  const oldMaskBlobId = ref.maskBlobId;
  ref.maskBlobId = '';
  revokeMapEntry(state.refUrls, ref.id);
  if (oldMaskBlobId) await deleteUnreferencedBlobIds([oldMaskBlobId]);
  toast('已清空当前遮罩');
}
async function persistCanvasToRefDraft() {
  const canvas = $('#maskCanvas');
  const ref = state.references.find((r) => r.id === state.maskEditor?.activeRefId);
  if (!canvas || !ref) return;
  if (!ref.originalBlobId) ref.originalBlobId = ref.blobId;
  if (!maskCanvasHasPaint(canvas)) {
    const oldMaskBlobId = ref.maskBlobId;
    ref.maskBlobId = '';
    if (oldMaskBlobId) await deleteUnreferencedBlobIds([oldMaskBlobId]);
    return;
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const oldMaskBlobId = ref.maskBlobId;
  const nextMaskBlobId = await putBlob(blob);
  ref.maskBlobId = nextMaskBlobId;
  ref.type = ref.type || 'image/png';
  const size = await imageSizeFromBlob(blob).catch(() => ({}));
  ref.width = size.width;
  ref.height = size.height;
  revokeMapEntry(state.refUrls, ref.id);
  if (oldMaskBlobId) await deleteUnreferencedBlobIds([oldMaskBlobId]);
}
async function composeReferenceWithMask(ref) {
  if (!ref?.originalBlobId) ref.originalBlobId = ref?.blobId;
  const originalBlob = await getBlob(ref.originalBlobId).catch(() => null);
  if (!originalBlob) return;
  if (!ref.maskBlobId) {
    const oldBlobId = ref.blobId;
    ref.blobId = ref.originalBlobId;
    ref.compositedBlobId = ref.originalBlobId;
    ref.type = originalBlob.type || ref.type || 'image/png';
    if (oldBlobId && oldBlobId !== ref.originalBlobId) await deleteUnreferencedBlobIds([oldBlobId]);
    return;
  }
  const maskBlob = await getBlob(ref.maskBlobId).catch(() => null);
  if (!maskBlob) return;
  const baseImg = new Image();
  const maskImg = new Image();
  const baseObjectUrl = URL.createObjectURL(originalBlob);
  const maskObjectUrl = URL.createObjectURL(maskBlob);
  baseImg.src = baseObjectUrl;
  maskImg.src = maskObjectUrl;
  try {
    await Promise.all([
      new Promise((resolve, reject) => { baseImg.onload = resolve; baseImg.onerror = reject; }),
      new Promise((resolve, reject) => { maskImg.onload = resolve; maskImg.onerror = reject; })
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = baseImg.naturalWidth;
    canvas.height = baseImg.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.width || !canvas.height) return;
    ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = .42;
    ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const oldBlobId = ref.blobId;
    const nextBlobId = await putBlob(blob);
    ref.blobId = nextBlobId;
    ref.compositedBlobId = nextBlobId;
    ref.type = 'image/png';
    ref.width = canvas.width;
    ref.height = canvas.height;
    revokeMapEntry(state.refUrls, ref.id);
    if (oldBlobId && oldBlobId !== ref.originalBlobId) await deleteUnreferencedBlobIds([oldBlobId]);
  } finally {
    URL.revokeObjectURL(baseObjectUrl);
    URL.revokeObjectURL(maskObjectUrl);
  }
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
let runtimeRefreshTimer = 0;
function scheduleRuntimeRefresh() {
  clearTimeout(runtimeRefreshTimer);
  runtimeRefreshTimer = setTimeout(async () => {
    if (document.hidden) return;
    try {
      const changed = await loadRuntime({ preserveComposerSession: true });
      if (changed) render();
    } catch (err) {
      console.warn('[home-v3] runtime refresh skipped', err);
    }
  }, 120);
}
let runningTimerInterval = 0;
function syncRunningTimerInterval() {
  if (document.hidden) {
    if (runningTimerInterval) clearInterval(runningTimerInterval);
    runningTimerInterval = 0;
    return;
  }
  if (!runningTimerInterval) runningTimerInterval = setInterval(updateRunningTimers, 1000);
}

async function init() {
  applyTheme();
  watchSystemTheme();
  applyPromptFromUrl();
  await loadRuntime().catch((err) => {
    console.warn('[home-v3] runtime unavailable', err);
    toast('未登录或配置未载入，部分功能需要登录后使用');
  });
  render();
  hydrateAgentHistoryFromDb()
    .then(() => {
      writeStore();
      render();
    })
    .catch((err) => console.warn('[home-v3] Agent history restore skipped', err));
  hydrateTasksFromDb()
    .then((changed) => {
      if (!changed) return;
      writeStore();
      render();
      void hydrateImages();
    })
    .catch((err) => {
      console.warn('[home-v3] Task history restore skipped', err);
      setTaskRecoveryError(err);
      render({ allowDuringScroll: true });
    });
  setTimeout(warmPromptBootstrap, 300);
  await runGalleryMigrationBridge();
  window.addEventListener('focus', scheduleRuntimeRefresh);
  window.addEventListener('pageshow', (event) => {
    scheduleRuntimeRefresh();
    if (!event.persisted) return;
    resetManagedImageSourcesForHydration();
    void restoreStreamPreviewsAfterBfcache().catch((error) => {
      console.warn('[home-v3] bfcache 流式预览恢复失败', error);
      void hydrateImages();
    });
  });
  document.addEventListener('visibilitychange', () => {
    syncRunningTimerInterval();
    if (!document.hidden) scheduleRuntimeRefresh();
  });
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) revokeAllObjectUrls();
  });
  syncRunningTimerInterval();
}

init();

function updateRunningTimers() {
  if (document.hidden) return;
  for (const task of state.tasks) {
    if (task.status !== 'running' && task.status !== 'queued') continue;
    const node = document.querySelector(`[data-elapsed-id="${CSS.escape(task.id)}"]`);
    if (node) node.textContent = formatElapsed(task);
  }
}
