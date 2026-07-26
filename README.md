# NexGen AI 工作台

基于 Cloudflare Pages Functions + D1 的 AI 图像生成、专业工作台、Agent 对话和提示词仓库系统。

## 当前入口

- `/`：NexGen v3 原生主页，加载 `assets/homepage-v3.js` 与 `assets/homepage-v3.css`。
- `/admin`：后台配置、API profile、习惯配置与用户管理。
- `/prompts`：全量提示词仓库，数据源为 `prompts_data.json`。
- `/login`：登录与注册页。

## 本地首次运行

全新 clone 需要三步。仓库没有构建步骤，也没有运行时依赖。

```powershell
# 1. 本地密钥。JWT_SECRET 必填，否则会回退到本脚本内硬编码的开发密钥。
copy .dev.vars.example .dev.vars
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"   # 填进 JWT_SECRET

# 2. 建立本地 D1（全新 clone 没有 .wrangler/，预览服务器会因此启动失败）
npm run bootstrap
#    需要一个管理员账号时：
#    $env:SEED_ADMIN_USER='localadmin'; $env:SEED_ADMIN_PASS='<password>'; npm run bootstrap -- --seed-admin

# 3. 启动
npm start
```

`npm run db:status` 随时查看本地 D1 状态（用户数、迁移是否齐全、是否还有账号在用已公开的 bootstrap 口令）。

## 运行

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local-preview.ps1
```

本地验收入口固定为 `http://127.0.0.1:8788/`。启动脚本会把预览日志写入 `.wrangler/local-preview/`，根目录不保留临时日志。
桌面快捷方式默认使用仓库自带的 Node 预览服务器，不依赖 npm 网络；需要验证 Wrangler 时可显式传入 `-Engine Wrangler`。最近一次启动状态和诊断分别写入 `.wrangler/local-preview/status.json` 与 `.wrangler/local-preview/launcher-latest.log`。

启动脚本会读取 `.dev.vars` 并注入子进程，因此 Node 与 Wrangler 两种引擎拿到的是同一份配置。优先级：shell 中已导出的环境变量 > `.dev.vars` > 脚本内置默认值。

### 离线模式（不产生费用）

默认情况下本地生图会打到真实上游并计费。加 `-MockUpstream` 可让 `scripts/local-mock-upstream.mjs` 离线应答，用于验证 composer → 代理 → 流式 → 画廊的完整链路：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local-preview.ps1 -NoBrowser -MockUpstream
```

返回的是确定性的合成渐变图（按请求的 `size` 生成），并支持 `stream` + `partial_images` 的 SSE 事件。它只用来验证我们这边的管道，不模拟供应商行为。启动日志会明确打印当前处于哪种模式。

## 核验

一条命令跑完全部本地检查（静态语法 + Node 回归 + 运行时 + 浏览器）：

```powershell
npm run check          # static + node（70 项，不需要服务器）
npm run check:all      # 追加 runtime + browser（73 项，需要预览在跑）
npm run check:list     # 列出所有检查项
```

`runtime` 与 `browser` 层需要本地预览已启动，且提供测试账号：

```powershell
$env:TEST_USER='<test-user>'
$env:TEST_PASS='<test-password>'
npm run check:all
```

缺服务器或缺凭据时这些检查会被**跳过并计入 skipped**，不会伪装成通过。

单独执行时的等价命令：

```powershell
node --check assets/homepage-v3.js
node tests/homepage-task-regression.js
node tests/provider-size-branching.js
node scripts/stability-checks.js
node scripts/verify-quality-static.cjs
node scripts/verify-toolbar-params.js
node scripts/final-deliverable-audit.cjs
node scripts/backup-security.test.mjs
node tests/mask-editor-browser-smoke.cjs
node tests/e2e-quality.js
node scripts/api-smoke.mjs
```

## 部署

```powershell
$env:TEST_USER='<test-user>'
$env:TEST_PASS='<test-password>'
powershell -ExecutionPolicy Bypass -File scripts/deploy-quality.ps1 -BaseUrl 'https://<production-domain>'
```

该脚本会先执行本地静态/回归/安全/最终交付审计，再部署 preview 并运行 Playwright e2e 与 API smoke；生产部署后会重复同一套线上验收。

注意：即使传 `-SkipProductionDeploy`，该脚本仍会部署一个 Cloudflare Preview，并且工作区不干净时会直接中止。它是**发布**门禁，不是日常开发用的检查——日常请用上面的 `npm run check:all`。
