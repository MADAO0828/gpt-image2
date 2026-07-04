# NexGen AI 工作台

基于 Cloudflare Pages Functions + D1 的 AI 图像生成、专业工作台、Agent 对话和提示词仓库系统。

## 当前入口

- `/`：NexGen v3 原生主页，加载 `assets/homepage-v3.js` 与 `assets/homepage-v3.css`。
- `/admin`：后台配置、API profile、习惯配置与用户管理。
- `/prompts`：全量提示词仓库，数据源为 `prompts_data.json`。
- `/login`：登录与注册页。

## 运行

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local-preview.ps1
```

本地验收入口固定为 `http://127.0.0.1:8788/`。启动脚本会把 Wrangler 日志写入 `.wrangler/local-preview/`，根目录不保留临时日志。

## 核验

```powershell
node --check assets/homepage-v3.js
node tests/homepage-task-regression.js
node tests/provider-size-branching.js
node scripts/stability-checks.js
node scripts/verify-quality-static.cjs
node scripts/verify-toolbar-params.js
node scripts/final-deliverable-audit.cjs
node scripts/backup-security.test.mjs
```

Playwright 端到端质量门禁需要提供测试账号密码：

```powershell
$env:BASE_URL='http://127.0.0.1:8788'
$env:TEST_USER='<test-user>'
$env:TEST_PASS='<test-password>'
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
