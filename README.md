# AI工作台 - AI Image Generator
一个基于 Cloudflare Pages + D1 的 AI 图像生成平台，支持 OpenAI GPT-Image API 和 fal.ai。

## 功能特点
- 🎨 AI 图像生成（支持 OpenAI Images API / Responses API）
- 👥 用户登录与管理
- 🔧 管理员后台（用户管理、API 配置）
- 📚 提示词仓库（9812 条提示词，来自 LeaderAI）
- ☁️ 云端设置存储
- 📱 移动端适配

## 快速部署

### 前置要求
- Node.js 18+
- Cloudflare 账号
- Wrangler CLI

### 部署步骤

1. **克隆仓库并安装依赖**
```bash
git clone <your-repo-url>
cd gpt-image2
```

2. **创建 D1 数据库**
```bash
npx wrangler d1 create gpt-image2-db
```

3. **更新 wrangler.jsonc**
将 D1 数据库 ID 填入 `wrangler.jsonc` 中的 `database_id` 字段。

4. **初始化数据库**
```bash
npx wrangler d1 execute gpt-image2-db --file=init_db.sql
```

5. **部署到 Cloudflare Pages**
```bash
npx wrangler pages deploy . --project-name your-project-name --branch main
```

### 默认管理员账号
- 用户名: `admin`
- 密码: `123456`

> ⚠️ 部署后请立即修改默认密码！

## 技术栈
- Cloudflare Pages (部署)
- Cloudflare D1 (数据库)
- Cloudflare Workers Functions (后端 API)
- Vanilla JavaScript (前端)
- OpenAI GPT-Image API (图像生成)

## 项目结构
```
├── index.html              # AI 工作台主页面
├── admin.html              # 管理员后台
├── login.html              # 登录页面
├── prompts.html            # 提示词仓库
├── prompts_data.json       # 提示词数据 (9812 条)
├── init_db.sql             # 数据库初始化脚本
├── wrangler.jsonc          # Cloudflare 配置
├── _redirects              # URL 重定向规则
├── functions/              # Cloudflare Functions
│   ├── api/
│   │   ├── auth/           # 登录/登出/验证
│   │   ├── admin/users/    # 用户管理
│   │   └── settings/       # 设置存储
│   └── api-proxy/          # API 代理
└── assets/                 # 前端编译资源
```
