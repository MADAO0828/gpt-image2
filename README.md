# GPT Image2 - AI 图像生成工作台

基于 Cloudflare Pages + D1 构建的 AI 图像生成应用

## 架构

- 前端: Vite/React SPA（编译产物）
- 后端: Cloudflare Pages Functions (API Route)
- 数据库: Cloudflare D1 (SQLite)
- 认证: JWT (HttpOnly Cookie)

## 配置源架构

系统使用 **单一数据源** 架构：

```
管理员后台 → D1 数据库 → /.well-known/img-runtime-config.json → 前端 SPA
```

所有设置由管理员在后台保存，前端只读云配置，不允许本地覆盖。

## 开发

```bash
npm install -g wrangler
wrangler pages dev ./
```

## 部署

```bash
wrangler pages deploy ./ --branch main
```
