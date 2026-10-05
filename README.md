# RepLoop

RepLoop 是一个本地优先的英语搜索与间隔重复记忆网站。搜索单词、词伙或句子后，可以直接加入自己的卡组，再通过挖空默写、中文回忆和四选一进行复习。

## 主要功能

- 本地 ECDICT 离线查词
- 在线整句英译中
- 搜索后一键加入项目或卡组
- 模板批量录入
- 项目、卡组和卡片管理
- 挖空默写、中文回忆、四选一
- 三种题型混合训练
- 专项训练和无序版
- 客观答题表现与主观评级共同调度
- 学习统计、日历和未来复习预测
- JSON 数据备份与恢复
- 本地浏览器提醒
- 本地访问登录与退出
- Supabase 邮箱账号与跨设备同步

## 运行环境

- Node.js 24 或更高版本
- Windows、macOS 或 Linux
- Chrome、Edge 或其他现代浏览器

## 安装

```bash
npm install
```

## 启动

Windows 可以直接双击：

```text
启动本地版.bat
```

也可以在终端运行：

```bash
npm run local
```

启动后访问：

```text
http://127.0.0.1:4173
```

如果端口被占用，服务会自动寻找后续可用端口。

只部署静态前端时，词典和翻译会自动改用支持 CORS 的公共翻译服务；完整 ECDICT 离线查词仍需要 Node 服务。

配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 后，登录页会自动切换为云端邮箱登录。同一账号在手机和电脑上共享项目、卡片、复习等级与统计数据。

## 开发

```bash
npm run dev
```

开发服务默认使用：

```text
http://127.0.0.1:5173
```

## Cloud Studio

仓库已经包含 Cloud Studio / Dev Container 配置。登录 Cloud Studio 后：

1. 导入或克隆本项目。
2. 使用默认 Node 环境打开工作区。
3. 在终端运行：

```bash
npm run cloudstudio
```

4. 打开 Cloud Studio 的 `4173` 端口预览，生成公开访问地址。

`npm run cloudstudio` 会自动：

- 检查并生成 ECDICT 离线词典。
- 构建前端生产文件。
- 在 `0.0.0.0:4173` 启动服务。

也可以使用仓库中的 Dockerfile 构建镜像。

## Railway + Supabase

完整部署步骤见 [DEPLOY_RAILWAY_SUPABASE.md](DEPLOY_RAILWAY_SUPABASE.md)。

## Microsoft Edge Extension

构建与发布说明见 [extension/README.md](extension/README.md)。

## 测试

```bash
npm test
```

完整词典默认已经安装到 `data/ecdict.sqlite`。如需重新生成：

```bash
npm run dictionary:setup
```

## 数据说明

- 用户项目、卡组、卡片和复习记录保存在浏览器 IndexedDB。
- 登录仅保存本地昵称和会话，不保存口令。
- 离线词典保存在 `data/ecdict.sqlite`。
- 可以在“我的”页面导出 JSON 备份。
- 无序版练习不会修改正式复习计划。

## 当前状态

本地 MVP 已完成构建、21 项单元测试、离线词典查询和 Chrome 浏览器回归。Supabase 云端同步与 Railway 配置已写入，等待真实账号和部署授权后联调。
