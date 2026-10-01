# 部署到 Render

本项目后端是 Node + Express + `node:sqlite`，已经自带 `Dockerfile` 和 `render.yaml`，
可以直接在 Render 上**一键部署**，包含前端 + 后端 API + 词典数据。

部署地址示例：`https://reloop-cloud.onrender.com`

---

## 一次性准备

### 1. 把代码推到 GitHub

```bash
git init                                # 如果还没初始化
git add .
git commit -m "feat: 支持 Render 部署"
git branch -M main
git remote add origin git@github.com:你的用户名/你的仓库名.git
git push -u origin main
```

> 仓库可以是 **私有** 的，Render 也支持。

### 2. 在 Render 创建服务

二选一：

**A. 用 render.yaml 一键创建（推荐）**

1. 打开 https://dashboard.render.com/blueprints
2. New Blueprint Instance → 选你刚推的仓库
3. Render 会读 `render.yaml` 自动创建 Web Service + 1 GB 磁盘
4. 等首次构建完成（约 3-5 分钟，主要在下载 ECDICT 词典）

**B. 手动创建**

1. New → Web Service → 选仓库
2. Runtime 选 **Docker**，Region 选 **Singapore**（国内访问快一点）
3. Health Check Path 填 `/api/health`
4. Environment 加上：
   - `DATA_DIR=/app/data`
   - `SEED_DIR=/app/build-data`
   - `NODE_ENV=production`
5. Disks → Add Disk → Name=`reloop-data`, Mount Path=`/app/data`, Size=`1 GB`
6. 点 Create

部署成功后会自动得到一个 `https://xxx.onrender.com` 链接。

### 3. 验证

```bash
curl https://xxx.onrender.com/api/health
# → {"ok":true,"dictionary":{"source":"ecdict","entryCount":...}}
```

打开浏览器访问 `https://xxx.onrender.com`，创建几张卡片，查个单词，能命中翻译就 OK。

---

## 日常更新

部署好以后，更新代码非常轻量：

### 改完代码后推上去

```bash
git add .
git commit -m "fix: xxx"
git push
```

Render 默认开启了 **Auto-Deploy**（`render.yaml` 里 `autoDeploy: true`），
推上去就自动触发一次新构建，约 2-3 分钟生效。

### 看部署日志 / 手动触发

- Render Dashboard → 你的服务 → Logs（看实时日志）
- 顶部 Manual Deploy → Deploy latest commit（强制重新部署）
- 或者 Deploy a specific commit → 输入 commit hash 回滚

### 不需要重新构建就能改的设置

- 环境变量：Dashboard → Environment → 改完点 Save（会触发自动重启）
- 磁盘大小：Disks → 改 Size（**只能改大**，改小需要重建服务）

### 注意事项

- **免费 plan 15 分钟无访问会休眠**，第一次打开会等 10-20 秒"冷启动"。
- **磁盘数据在每次重启都保留**，但免费 plan 不能换区域；想换区域就要重建。
- **不要把 ECDICT 的 CSV（~30 MB）提交到仓库**，已经在 `.gitignore` 里，构建时会自动下载。

---

## 升级路径

按使用量从小到大：

### 升级 1：付费 plan（仍用 Render）

适合每天访问量几十次的个人使用。

- Render Dashboard → 你的服务 → Plan → 选 **Starter ($7/月)**
- 升级后不再休眠，国内访问速度也明显提升（Render 会给分配更近的 CDN）
- 数据完全保留

### 升级 2：换到 Railway

适合想要更好的开发体验 / 国内可访问性。

迁移步骤：
1. 在 Railway 用同一个 Dockerfile 起一个新服务
2. 把 Render 的磁盘数据导出（参考下面的"备份数据"）
3. 在 Railway 上挂 Volume，挂到 `/app/data`，导入数据
4. 切换 DNS 或访问地址
5. 关掉 Render 服务

### 升级 3：自建服务器（VPS）

适合长期使用、需要国内访问速度、要自己掌控全链路。

推荐用 `docker-compose`：
```yaml
services:
  app:
    build: .
    ports: ["4173:4173"]
    volumes: ["./data:/app/data"]
    restart: unless-stopped
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
volumes:
  caddy_data:
```

Caddyfile 自动申请 HTTPS 证书，省心。

---

## 备份与恢复

### 备份词典数据

词典本身是静态的（来自 ECDICT），不需要备份。需要备份的只有**可能后续写入的运行时数据**（目前词典是只读，没有用户数据上传，所以暂时是空的）。

如果你以后加了用户同步功能，备份方法：

```bash
# 从 Render 服务下载整个 data 目录
render shell  # 进入容器
tar czf /tmp/data-backup.tgz /app/data
exit
# 然后在 Dashboard → Shell 里把 /tmp/data-backup.tgz 下载下来
```

### 备份代码

代码在 GitHub，已经是天然备份。

---

## 回滚

两种方式：

1. **代码回滚**：在 Render Dashboard → Manual Deploy → Deploy a specific commit
2. **整服务回滚**：先在 Render 上 Disable Auto-Deploy，避免新 push 自动部署，然后上面那一步

---

## 监控与告警（可选）

免费 plan 自带基础日志，但不会发通知。需要的话：

- Render Pro → 集成 Slack / Webhook 通知
- 外接：UptimeRobot（免费）→ 监控 `/api/health`，挂了就发邮件/微信

---

## 常见问题

**Q：部署失败，提示 `Cannot find module 'express'`？**
A：`node_modules` 没装全。检查 Render 构建日志，确认 `npm ci` 步骤成功。
   删掉 Render 服务重建一次通常就好了。

**Q：词典查询超时？**
A：免费 plan 冷启动时 MyMemory API 第一次调用会慢几秒，让用户重试即可。
   想彻底消除冷启动 → 升级付费 plan 或换 Railway。

**Q：磁盘满了怎么办？**
A：当前词典只占约 50 MB，1 GB 绑绑有余。如果未来装了大语料库：
   - Disks → 调大 Size（必须保持同一区域，不能缩小）
   - 或者迁移到 Railway / 自建。

**Q：能在国内直接访问 onrender.com 吗？**
A：能访问但偶尔慢。追求稳定国内访问 → 升级到 Starter 计划（用 Render CDN）
   或迁移到 Railway / 自建国内 VPS。