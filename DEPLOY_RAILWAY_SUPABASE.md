# RepLoop 部署：GitHub + Railway + Supabase

## 架构

```text
GitHub
  → Railway
      - React 静态页面
      - Express 词典和翻译 API
      - ECDICT SQLite
  → Supabase
      - Auth 账号
      - PostgreSQL 业务数据
      - Realtime 多设备同步
      - RLS 数据隔离
```

## 1. 创建 Supabase 项目

1. 在 Supabase 创建项目。
2. 打开 SQL Editor。
3. 执行：

```text
supabase/migrations/0001_reploop_cloud.sql
```

也可以使用 Supabase CLI：

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

4. Authentication → Providers → Email：

```text
Enable Email provider: 开启
Confirm email: 建议开启
```

5. Authentication → URL Configuration：

```text
Site URL:
https://你的 Railway 域名

Redirect URLs:
https://你的 Railway 域名/**
http://localhost:5173/**
http://127.0.0.1:4173/**
```

## 2. GitHub

把项目提交到私有仓库：

```bash
git init
git add .
git commit -m "feat: add Supabase sync and Railway deployment"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY
git push -u origin main
```

不要提交：

```text
node_modules/
dist/
.artifacts/
data/ecdict.sqlite
data/ecdict.csv
.env
RepLoop-cloudstudio.zip
```

## 3. Railway

1. New Project → Deploy from GitHub repo。
2. 选择 RepLoop 仓库。
3. Railway 会读取 `railway.json` 和 `Dockerfile`，镜像使用 Node 24。
4. 添加 Volume：

```text
Mount Path: /data
```

5. 设置变量：

```text
HOST=0.0.0.0
DATA_DIR=/data
SEED_DIR=/app/build-data
NODE_ENV=production
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

`VITE_SUPABASE_*` 会在构建时写入前端，修改后需要重新构建。

6. 部署完成后验证：

```text
https://你的域名/api/health
```

## 4. 数据同步规则

- 未配置 Supabase：继续使用浏览器 IndexedDB。
- 配置 Supabase：登录后从 Supabase 加载数据，并保持 IndexedDB 本地缓存。
- 任意一台设备增删改数据：先写 Supabase，再同步本地缓存。
- Realtime 收到其他设备变化后，重新拉取该账号的快照。
- 复习记录通过 `apply_review_log` RPC，在同一事务里更新卡片和复习历史。
- 无序版仍传入 `affects_schedule=false`，不会修改正式计划。

## 5. 当前浏览器数据迁移

首次在同一个浏览器登录空云端账号时：

1. 系统检测浏览器是否已有本地项目或卡片。
2. 如果有，自动调用 `import_reploop_snapshot` 上传到当前账号。
3. 如果没有，云端创建“阅读 / 默认卡组”。

如果登录的是另一个账号，浏览器缓存会先清除，再加载对应账号数据。

## 6. 安全

- Supabase 匿名 Key 可以进入浏览器，但必须有 RLS。
- 不要把 Service Role Key 放进前端或 GitHub。
- 所有业务表都使用 `user_id = auth.uid()`。
- Railway Volume 只保存只读 ECDICT，不保存用户账号数据。

## 7. 日常更新

```bash
git add .
git commit -m "feat: xxx"
git push
```

Railway 连接 GitHub 后会自动重新构建和部署。

## 8. 验收清单

- 邮箱注册和登录成功
- 登录后能看到当前账号数据
- 电脑创建卡片，手机同一账号能看到
- 手机完成复习，电脑能看到等级和时间变化
- 无序版不修改正式复习计划
- 用户 A 无法读取用户 B 的数据
- 退出后不能继续读取云端数据
- 词典 `/api/health` 返回 ECDICT 状态
- 手机端和桌面端布局正常
