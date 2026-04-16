# Diet Agent Shanghai

一个基于 Next.js App Router 和 OpenRouter SDK 的买菜截图识别与菜谱推荐 agent。

## 功能

- 支持 Clerk 登录 / 注册
- 上传买菜 app 订单截图，或直接粘贴订单文字，并识别已购食材
- 根据用户目标、偏好、疾病和日常节奏动态推荐菜谱
- 输出识别到的食材、菜谱建议、执行提示和风险提醒
- 支持更多营养目标，例如高蛋白、低蛋白、低脂、低盐、低碳水、高纤维
- 每道推荐菜谱都可以一键复制
- 使用 OpenRouter SDK 的多模态能力，而不是前端写死推荐内容
- 接入 Langfuse 记录 LLM trace，接入 GlitchTip 收集前后端错误

## 启动

1. 安装依赖
2. 复制 `.env.example` 为 `.env.local`
3. 配置 Clerk、OpenRouter、Langfuse 和 GlitchTip 环境变量
4. 运行 `npm run dev`

## Dokploy / Docker Compose 部署

1. 在 Dokploy 中选择 Docker Compose 部署
2. 指向本仓库根目录的 `docker-compose.yml`
3. 在 Dokploy 环境变量中配置 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`、`CLERK_SECRET_KEY`、`OPENROUTER_API_KEY`、`LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY` 和 `GLITCHTIP_DSN`
4. 把 `OPENROUTER_APP_URL` 设置为你的线上访问地址，例如 `https://diet.example.com`
5. 把 `CLERK_AUTHORIZED_PARTIES` 设置为允许访问这个应用的来源，例如 `https://diet.example.com`
6. 如果宿主机端口冲突，可以把 `APP_PORT` 改成其他空闲端口，例如 `13001`

本地也可以直接运行：

```bash
cp .env.example .env
docker compose up -d --build
```

## 说明

- 模型默认使用 `OPENROUTER_MODEL=openrouter/auto`
- 如果你想切换模型，可以在 `.env.local` 中覆盖 `OPENROUTER_MODEL`
- 如果你想单独给截图识别指定模型，可以在 `.env.local` 里设置 `OPENROUTER_VISION_MODEL`
- Langfuse 至少需要 `LANGFUSE_PUBLIC_KEY` 和 `LANGFUSE_SECRET_KEY`
- 如果你用的是 Langfuse 自托管或美国区，请配置 `LANGFUSE_BASE_URL`
- GlitchTip 建议同时配置 `GLITCHTIP_DSN` 和 `NEXT_PUBLIC_GLITCHTIP_DSN`，这样服务端和浏览器错误都能收集
- `GLITCHTIP_SAMPLE_RATE` 控制错误采样，`GLITCHTIP_TRACES_SAMPLE_RATE` 控制性能链路采样
- Clerk 至少需要配置 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 和 `CLERK_SECRET_KEY`
- 生产环境请使用 Clerk 的 `pk_live_...` 和 `sk_live_...`，不要继续使用开发 key
- `CLERK_AUTHORIZED_PARTIES` 支持多个域名，使用英文逗号分隔，例如 `https://diet.example.com,https://admin.example.com`

## Observability

- Langfuse 会为订单识别、菜谱生成和 JSON 修复创建 trace，方便查看输入、输出、失败原因和多阶段耗时
- GlitchTip 会收集浏览器端提交失败、复制失败、文件读取失败，以及服务端 API / agent 运行错误
- 如果没有配置 Langfuse 或 GlitchTip，应用仍可正常运行，只是不会上报对应观测数据

## Clerk 生产部署检查

1. 在 Clerk Dashboard 创建 production instance
2. 把部署环境变量换成 production instance 的 `pk_live_...` 和 `sk_live_...`
3. 在 Clerk Dashboard 配置你的生产域名和 DNS
4. 如果启用 Google、微信等第三方登录，记得换成你自己的生产 OAuth 凭证
5. 在 Dokploy 中重新部署应用，让新的 Clerk 环境变量生效
