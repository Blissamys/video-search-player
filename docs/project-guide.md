# 聚合视频搜索播放器项目详细文档

## 文档信息

| 项目 | 内容 |
| --- | --- |
| 项目名称 | 聚合视频搜索播放器 |
| 项目仓库 | `https://github.com/fr47cwp6kj-dotcom/video-search-player` |
| 公网首页 | `http://shaochenyue.asia/` |
| 独立网址播放器 | `http://shaochenyue.asia/player/` |
| 当前 API 配置 | `https://scy-video-search.cpolar.top` |
| 文档整理日期 | 2026-10-19 |
| 功能基线提交 | `2a40304 Clarify Bilibili page links in URL player` |

> 本文档记录项目截至整理时的实际状态、已经做过的设计决策、部署方法和后续可扩展方向。后续修改功能时，应同步更新本文档。

> **2026-10-19 本地测试更新**：本轮用户明确要求实时解析，并确认采用“视频流＋现有播放器控制”。现已新增本机限定的解析与 MP4 流式转发；此前“不解析、不转发”的决定仅代表旧版本，已被本轮需求在本地测试范围内替代。本次代码以功能分支提交，主分支合并后会按原流程发布静态页面；远端 Node API 需要单独更新。完整设计及验证范围见 `superpowers/specs/2026-10-19-bilibili-resolver-design.md` 和项目根目录 README。

## 1. 项目定位

这是一个以网页为中心的视频搜索与播放项目，当前包含两个主要页面：

1. **聚合搜索首页**
   - 搜索 B 站公开视频元数据；
   - 展示热门视频快照；
   - 搜索本地样片库；
   - B 站内容通过官方嵌入播放器播放；
   - 样片通过站内 `<video>` 播放器播放。

2. **独立网址播放器**
   - 输入真正的 `mp4`、`webm` 等视频直链播放；
   - 通过 URL 参数直接打开指定视频；
   - 选择本机视频文件播放；
   - 提供倍速、逐帧、帧率、分辨率、循环、静音、全屏等控制。

项目支持搜索公开视频元数据、官方嵌入、直链与本机文件播放；本地 Node 模式新增 B 站普通公开视频实时解析和内存流式转发，不提供文件下载或磁盘缓存。

## 2. 当前已实现成果

### 2.1 聚合搜索首页

首页地址：

```text
http://shaochenyue.asia/
```

主要能力：

- 输入关键词搜索 B 站视频；
- 首次进入显示热门视频；
- 首页始终显示 B 站当前热门，标题筛选后去重随机取 9 个；搜索记录只用于用户主动重搜；
- 保存最近 10 条搜索记录，可点击重搜，可清空；
- 搜索结果展示封面、标题、作者、播放量、日期、时长、来源标签；
- B 站结果通过 `player.bilibili.com` 官方嵌入播放器播放；
- 样片库结果直接在站内播放器播放；
- 支持加载更多 B 站搜索结果；
- 支持配置外部播放页链接；
- 支持复制当前视频原链接。

### 2.2 独立网址播放器

播放器地址：

```text
http://shaochenyue.asia/player/
```

原有两种输入方式（B 站解析输入见下文）：

1. 视频直链

```text
https://example.com/video.mp4
https://example.com/video.webm
```

2. URL 参数

```text
http://shaochenyue.asia/player/?url=https%3A%2F%2Fexample.com%2Fvideo.mp4&title=%E6%A0%87%E9%A2%98
```

参数说明：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `url` | 是 | 视频直链，需要 URL 编码 |
| `title` | 否 | 页面显示的视频标题 |

本地 Node 模式还接受 B 站 BV/AV 视频页、编号和 b23.tv 短链（包括分享文案），支持分 P 选择、实际画质与作者显示、源站入口、手动重新解析，以及播放失败后最多一次自动刷新。无需登录即可获取的 MP4 才能在此模式播放；付费、登录、试看或格式限制会显示原因。

播放器能力：

- 播放、暂停；
- 进度条拖动；
- 前进、后退 5 秒；
- 0.25x 到 4x 倍速；
- 上一帧、下一帧；
- 帧率选择：自动、24、25、30、50、60；
- 实测帧率显示；
- 分辨率显示；
- 当前倍速显示；
- 循环、静音、音量、全屏；
- 复制当前播放页链接；
- 选择本机视频文件，本地生成 `blob:` 地址播放，不上传。

### 2.3 样片库

项目内置 5 个测试片，用于验证帧率和逐帧能力：

| 样片 | 帧率 | 用途 |
| --- | --- | --- |
| `frame24.mp4` | 24fps | 电影常见帧率 |
| `frame25.mp4` | 25fps | PAL 常见帧率 |
| `frame30.mp4` | 30fps | 常见网络视频帧率 |
| `frame50.mp4` | 50fps | 高帧率验证 |
| `frame60.mp4` | 60fps | 高帧率验证 |

样片文件位于：

```text
public/samples/
```

### 2.4 外部播放页配置

首页播放面板支持保存一个外部播放页地址。保存后，如果有当前视频原链接，可以拼接参数后打开外部页面。

支持两种占位方式：

```text
https://example.com/player?url={url}
```

或：

```text
https://example.com/player
```

后者会自动追加 `url=` 参数。

该配置保存在浏览器 `localStorage`，键名：

```text
videoSearchExternalPlayerUrl
```

## 3. 项目演进记录

| 阶段 | 目标 | 实际结果 |
| --- | --- | --- |
| 初始版本 | 做一个多来源视频搜索播放网页 | 建立静态首页、搜索 UI、结果卡片、B 站嵌入播放和本地样片播放 |
| 界面调整 | 删除抖音等来源，界面保持简洁 | 当前只保留 B 站和样片库，删除顶部“全部 / 哔哩哔哩 / 样片库”筛选选项 |
| 推荐调整 | 搜索框下不显示固定推荐词 | 改为显示搜索记录；无记录时显示空状态 |
| 首页策略 | 第一次显示热门，之后按历史推荐 | 首次显示热门快照，有历史时按最近关键词推荐 |
| 本地打开 | 不依赖服务器也能打开图形界面 | 支持 `public/index.html` 直接打开，使用热门快照和样片库 |
| 公网部署 | 希望任何设备都能打开 | 接入 GitHub Pages，绑定 `shaochenyue.asia` |
| 后端部署 | 静态页无法实时搜索 | 增加 Node 服务、Docker、Windows 启动脚本和 API 配置 |
| 外部播放页 | 用户已有能通过网址播放视频的页面 | 增加外部播放页配置和跳转按钮 |
| 独立播放器 | 单独播放视频直链，保留完整控制 | 新增 `/player/` 页面和 `public/player.js` |
| B 站链接提示 | 用户粘贴 B 站网页地址后误报“无法播放” | 识别 `bilibili.com/video/...` 和 `b23.tv`，明确提示这是网页链接而非视频直链 |

## 4. 运行模式

项目有三种常见运行模式。

### 4.1 纯静态模式

适用：

- 直接双击 `public/index.html`；
- GitHub Pages 静态站点；
- API 不可用时的自动回退。

可用功能：

- 热门快照；
- 本地样片；
- 搜索记录；
- B 站结果的封面、标题、简介等快照数据；
- 独立播放器的直链和本机文件播放。

限制：

- B 站实时搜索依赖 API；
- 热门数据是最近一次快照，不一定实时；
- B 站播放仍依赖浏览器能访问官方嵌入播放器。

### 4.2 本地 Node 完整模式

启动：

```bash
node server.js
```

默认地址：

```text
http://localhost:3000/
```

可用功能：

- `/api/health` 健康检查；
- `/api/search` 实时搜索；
- `/api/video` B 站视频详情；
- 静态首页；
- `/player/` 独立播放器；
- 样片服务。

说明：

- `server.js` 会自动为目录请求寻找 `index.html`，因此 `/player/` 可以直接访问；
- 如果 3000 端口被占用，会自动尝试后续端口；
- localhost / 127.0.0.1 页面默认调用同源 API，无需修改配置。其他部署仍使用 `public/api-config.js` 中的远端地址；显式设置的空字符串会被保留。B 站解析必须本机同源，远程前端不能调用此新增功能。

### 4.3 NAS / VPS / Windows 后端模式

核心思路：

- GitHub Pages 继续托管前端；
- NAS、VPS 或 Windows 主机运行 Node API；
- 前端通过 `public/api-config.js` 指向 API 域名。

Docker 启动：

```bash
docker compose up -d --build
```

健康检查：

```text
http://NAS_IP:3000/api/health
```

期望返回：

```json
{"ok":true,"mode":"node"}
```

Windows 启动：

```text
start-windows.bat
```

Windows 需要允许 Node.js 监听端口，局域网设备才能访问。

## 5. 系统架构

```text
                    +----------------------+
                    | shaochenyue.asia    |
                    | GitHub Pages 静态站 |
                    +----------+-----------+
                               |
             public/api-config.js 指定 API 地址
                               |
                               v
+----------------------+     +----------------------+     +----------------------+
| Node / Docker API    | --> | Bilibili public API  | --> | 搜索 / 热门 / 详情   |
+----------+-----------+     +----------------------+     +----------------------+
           |
           v
+----------------------+
| public/ 静态资源      |
| index.html           |
| player/index.html    |
| app.js               |
| player.js            |
+----------------------+
```

### 5.1 前端

主要文件：

| 文件 | 职责 |
| --- | --- |
| `public/index.html` | 聚合搜索首页结构 |
| `public/app.js` | 首页状态、搜索、渲染、首页播放器、外部播放页、历史记录 |
| `public/player/index.html` | 独立网址播放器页面 |
| `public/player.js` | 独立播放器状态、直链加载、本机文件、帧率统计、控制逻辑 |
| `public/style.css` | 全站样式 |
| `public/hot-data.js` | 热门视频快照 |
| `public/api-config.js` | API 地址配置 |
| `public/samples/` | 本地样片 |

### 5.2 后端

主要文件：

| 文件 | 职责 |
| --- | --- |
| `server.js` | Node HTTP 服务、静态资源、API 路由、CORS |
| `lib/search-core.js` | B 站搜索、热门、详情、样片搜索、缓存 |
| `lib/bilibili-resolver.js` | BV/AV、分享文案、短链、分 P、实时 MP4 解析与上游错误映射 |
| `lib/media-relay.js` | 有界内存令牌、CDN 白名单、Range、超时、背压与断连取消 |
| `api/health.js` | Serverless 健康检查 |
| `api/search.js` | Serverless 搜索入口 |

当前 Vercel 目录中没有 `api/video.js`，因此 Serverless 部署主要保证健康检查和搜索；视频详情接口主要由 Node 服务提供。

### 5.3 自动化

| 文件 | 职责 |
| --- | --- |
| `.github/workflows/deploy.yml` | `master` 分支推送后，把 `public/` 发布到 GitHub Pages |
| `.github/workflows/update-hot.yml` | 每日刷新 B 站热门快照并提交 `public/hot-data.js` |
| `scripts/update-hot.mjs` | 拉取热门数据并生成静态快照 |

## 6. API 说明

### 6.1 健康检查

```text
GET /api/health
```

Node 服务返回：

```json
{
  "ok": true,
  "mode": "node"
}
```

Vercel 函数返回：

```json
{
  "ok": true,
  "mode": "serverless"
}
```

### 6.2 搜索

```text
GET /api/search?keyword=关键词&source=all&page=1
```

参数：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `keyword` | 空 | 搜索关键词，最多 100 字符 |
| `source` | `all` | `all`、`bilibili`、`sample` |
| `page` | `1` | 页码，服务端限制 1 到 5 |

返回结构：

```json
{
  "ok": true,
  "results": [
    {
      "id": "BV...",
      "source": "bilibili",
      "title": "视频标题",
      "author": "作者",
      "duration": "12:34",
      "cover": "https://...",
      "description": "简介",
      "plays": 123456,
      "date": "2026-01-01",
      "url": "https://www.bilibili.com/video/BV...",
      "embed": "https://player.bilibili.com/player.html?..."
    }
  ],
  "notices": [],
  "hasMore": true,
  "source": "all",
  "keyword": "关键词"
}
```

### 6.3 视频详情

```text
GET /api/video?source=bilibili&id=BV...
```

当前仅支持：

```text
source=bilibili
```

返回 `ok` 和 `video` 对象，包含标题、作者、封面、简介、播放量、日期和原链接。

## 7. 核心前端行为

### 7.1 API 探测

首页会请求：

```text
/api/health
```

如果失败，进入本地模式；如果成功，继续请求 `/api/search`。

这使页面在以下场景都能工作：

- GitHub Pages + 远端 API；
- 本地 Node 服务；
- 完全离线或 API 失效时回退静态数据。

### 7.2 首页推荐逻辑

1. 进入/返回首页时清空当前搜索条件，请求 B 站当前热门，搜索历史不参与推荐；
2. 从当前热门池 50 个候选中按标题词表筛选、去重，再随机抽取 9 个；合格数量不足时按实显示；
3. 标题显示“今日热门推荐”，数量显示“9 个热门随机推荐”；点击小房子、从播放器返回及浏览器后退均恢复此模式；
4. 搜索记录仍在搜索框下方展示，仅在用户点击或主动搜索时使用；
5. 当前热门池缓存最长 5 分钟，缓存键含北京时间日期。当前热门榜可能包含以前发布的视频，并非只筛选当天发布的作品；
6. `public/recommendation-policy.js` 是 Node API、浏览器和快照生成共用的标题规则，覆盖色情/成人、暴力血腥、赌博、毒品、惊悚等。词中插入空白、零宽字符或标点仍会筛选；带尖括号的可见字词与格式标签内的字词都会检查；
7. 服务不可用时明确显示“热门快照”和其更新时间，仍应用同一筛选规则；没有可用热门时显示空状态，不用样片或搜索历史冒充；
8. 顶部显示回到首页的小房子、北京时间日期/星期和每秒更新的时间、指定两行提示语、循环像素火柴人推门动画。

用户已澄清，“未成年人”三个字不是禁词；目标是过滤不适宜未成年人观看的标题用词。2026-10-19 同日后续要求已把规则扩展到实时搜索、分页追加与离线搜索，标题中的“成人”也作为明确禁词。API 与前端共用 `filterSearchResults`，只去掉不合格标题，保留上游排序和样片，不把搜索结果限制为 9 个。整页过滤后仍允许请求后续页，第 5 页结束。标题筛选不能替代对视频画面、声音和整体内容的审核。

当前首页名称为“入门款”，页脚按用户批注显示“免责声明：本站非盈利性质 · 测试结束随时关门”。

### 7.3 播放决策

首页打开视频时：

| 条件 | 播放方式 |
| --- | --- |
| `source=bilibili` 且有 `embed` | 创建 iframe，加载 B 站官方嵌入播放器 |
| 有 `playUrl` | 创建站内 `<video>` |
| 其他 | 显示空状态 |

独立播放器打开来源时（更新后的本地版本）：

| 输入 | 行为 |
| --- | --- |
| `mp4/webm` 等直链 | 设置为 `<video src>` |
| 本机文件 | `URL.createObjectURL(file)` |
| B 站视频页、BV/AV 编号 | 本机实时解析后通过站内 video 播放 |
| `b23.tv` 短链及分享文案 | 逐跳验证并展开链接，再解析播放 |

### 7.4 帧率测量

如果浏览器支持：

```js
video.requestVideoFrameCallback
```

播放器会用视频媒体时间统计单位时间内的呈现帧数，并在“实测帧率”中显示。

如果浏览器不支持该 API：

- 仍可播放；
- 倍速控制可用；
- 逐帧控制会按所选帧率或默认 30fps 推算；
- 实测帧率显示 `--`。

## 8. 部署与域名

### 8.1 GitHub Pages

部署流程：

1. 推送到 `master`;
2. GitHub Actions 执行 `deploy.yml`;
3. 上传 `public/` 目录；
4. GitHub Pages 发布；
5. `shaochenyue.asia` 通过 `public/CNAME` 绑定。

GitHub Pages DNS 参考配置：

```text
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
CNAME www   <GitHub用户名>.github.io
```

部署后验证：

```text
http://shaochenyue.asia/
http://shaochenyue.asia/player/
```

### 8.2 API 配置

编辑：

```text
public/api-config.js
```

例如：

```js
window.VIDEO_API_BASE = 'https://api.shaochenyue.asia';
```

如果前端和 API 同源部署，可以设为空字符串：

```js
window.VIDEO_API_BASE = '';
```

修改后需要提交并推送，GitHub Pages 才会更新。

### 8.3 cpolar / 内网穿透

当前配置使用：

```text
https://scy-video-search.cpolar.top
```

注意事项：

- 免费或临时隧道可能过期；
- 隧道重启后域名可能变化；
- 如果 API 健康检查失败，前端会回退本地模式；
- 更稳定方案是使用 NAS 反向代理 + 固定域名 + HTTPS。

### 8.4 NAS 推荐架构

推荐长期结构：

```text
Internet
   |
   | HTTPS 443
   v
路由器 / NAT
   |
   v
NAS 反向代理
   |
   +--> Node 视频搜索 API :3000
   |
   +--> 后续可扩展 NAS 视频库服务
```

建议：

- 使用独立 API 子域名，例如 `api.shaochenyue.asia`;
- 配置 HTTPS 证书；
- 不要把数据库或管理后台直接暴露公网；
- 如果只是家庭自用，可增加访问密码或 VPN。

## 9. 常用操作

### 9.1 本地运行

```bash
node server.js
```

### 9.2 指定端口

```bash
PORT=8080 node server.js
```

### 9.3 Docker 启动

```bash
docker compose up -d --build
```

### 9.4 手动刷新热门快照

```bash
node scripts/update-hot.mjs
```

### 9.5 检查 API

```bash
curl http://localhost:3000/api/health
curl "http://localhost:3000/api/search?keyword=test&page=1"
```

### 9.6 GitHub Actions 状态

```bash
gh run list --repo fr47cwp6kj-dotcom/video-search-player --limit 5
```

## 10. 测试记录

截至 2026-10-19，已做过以下验证：

| 测试项 | 结果 |
| --- | --- |
| `node --check public/app.js` | 通过 |
| `node --check public/player.js` | 通过 |
| `node --check server.js` | 通过 |
| `git diff --check` | 通过 |
| `/player/` 静态路由 | 返回 200 |
| `/player.js` | 返回 200 |
| `/samples/frame60.mp4` | 返回 `video/mp4` |
| 线上独立播放器 | 页面打开正常 |
| 60fps 样片播放 | 正常 |
| 分辨率识别 | `480x270` |
| 实测帧率 | 约 `58.0 fps` |
| GitHub Pages 部署 | Actions 成功 |
| B 站网页链接提示 | 已识别并显示专门提示 |

独立播放器测试地址：

```text
http://shaochenyue.asia/player/?url=http%3A%2F%2Fshaochenyue.asia%2Fsamples%2Fframe60.mp4&title=60fps%20%E9%AB%98%E5%B8%A7%E7%8E%87%E6%B5%8B%E8%AF%95%E7%89%87
```

## 11. 已知限制

1. **B 站网页链接需要本机解析服务**

   例如：

   ```text
   https://www.bilibili.com/video/BV1cTp66gEi7
   ```

   这是视频网页地址。本机 Node 模式会先获取当前 MP4 地址并转发播放；纯静态、远程访问或直接 file:// 打开不能运行此解析服务。

2. **B 站播放依赖官方嵌入域名**

   如果当前设备无法访问 `bilibili.com` 或 `player.bilibili.com`，首页中的官方嵌入播放器也无法显示。

3. **B 站接口可能触发风控**

   例如返回 `-412`。后端会抛出错误并提示稍后重试或更换关键词。

4. **新增解析的格式与访问范围**

   本次仅支持本机访问的普通公开视频 MP4。没有账号登录功能，不处理付费或试看；非 MP4、多个分段、仅返回 P2P 地址等情况会提示失败。不会自动切换成嵌入播放冒充解析成功，用户可自行打开源站。新增接口不支持 NAS、Docker 网桥、反向代理或公网访问。

5. **独立播放器不支持普通网页**

   输入 `https://example.com/video-page.html` 无法播放，必须是浏览器可以直接播放的视频文件地址。

6. **HLS 暂未接入**

   当前独立播放器主要支持浏览器原生可播的 `mp4/webm` 等直链，`m3u8` 需要后续引入 HLS 播放库。

7. **HTTPS 页面加载 HTTP 视频可能被浏览器阻止**

   如果页面使用 HTTPS，视频直链也建议使用 HTTPS。

8. **图标依赖 CDN**

   页面使用 Lucide CDN。如果当前网络无法访问 CDN，按钮功能仍在，但图标可能显示异常。

## 12. 数据与状态

当前主要浏览器本地存储：

| 键 | 内容 |
| --- | --- |
| `vs_history` | 最近搜索记录 |
| `vs_rate` | 首页播放器倍速 |
| `vp_rate` | 独立播放器倍速 |
| `videoSearchExternalPlayerUrl` | 外部播放页地址 |

本机文件播放只生成临时 `blob:` 地址，不会上传文件。

## 13. 故障排查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 页面显示本地模式 | API 不可达、隧道过期、CORS 或 HTTPS 混用问题 | 打开 `/api/health`，检查 `api-config.js` |
| B 站搜索失败或 `-412` | B 站风控 | 稍后重试、更换关键词或降低请求频率 |
| B 站封面不显示 | CDN、Referer 或网络限制 | 项目已使用 `referrerpolicy="no-referrer"`，仍失败则受网络影响 |
| B 站播放器空白 | 设备无法访问官方嵌入域名 | 在允许访问的设备或网络中播放 |
| `/player/` 404 | 服务未映射目录索引 | 已在 `server.js` 修复；确认使用最新代码 |
| 视频无法播放 | 缺少本机解析服务、上游限制/风控/格式不支持、普通网页不是视频文件、编码不支持 | 本机打开 localhost 后重试；按错误原因处理，或使用源站/视频直链/本机文件 |
| 实测帧率显示 `--` | 浏览器不支持 `requestVideoFrameCallback` | 手动选择已知帧率 |
| 公网页面仍旧 | CDN 或浏览器缓存 | 强制刷新，或临时加查询参数 |

## 14. 后续规划建议

优先级从高到低：

1. **自有视频库**
   - 上传自有或授权视频到 NAS;
   - 保存标题、封面、简介、标签、文件地址；
   - 首页统一搜索；
   - 独立播放器播放。

2. **HLS 支持**
   - 引入合法 HLS 播放能力；
   - 支持 `m3u8` 直链；
   - 增强直播流或分段视频支持。

3. **收藏夹**
   - 保存视频元数据；
   - 分组管理；
   - 支持导出 JSON。

4. **访问控制**
   - 家庭自用可加简单密码；
   - 公网部署建议使用反向代理认证或 VPN。

5. **插件式授权源**
   - 每个插件只接入自己控制的 API;
   - 返回统一字段：标题、封面、简介、播放地址；
   - 本轮已增加本机 B 站 MP4 解析；未来其他来源须单独设计。

6. **移动端体验**
   - 更紧凑的播放控制布局；
   - 手势控制；
   - 横屏优化。

## 15. 关键决策记录

| 决策 | 结论 | 原因 |
| --- | --- | --- |
| 是否保留抖音 | 不保留 | 当前项目聚焦 B 站公开搜索和本地样片，避免扩展不可控来源 |
| 是否显示来源筛选 | 不显示 | 简化界面，搜索默认合并可用来源 |
| 推荐区显示什么 | 搜索记录 | 比固定推荐词更符合实际使用 |
| 进入或返回首页显示什么 | 始终显示当前热门随机 9 个，先做标题筛选 | 2026-10-19 用户纠正：搜索历史不应影响推荐 |
| 静态页如何热门 | 每日快照 | 无后端时也有数据 |
| B 站播放方式 | 首页保留官方 iframe；独立播放器本机实时解析 MP4 | 本轮用户确认新方案，保留既有使用方式 |
| 流提取与转发 | 本机测试范围新增普通公开视频 MP4 解析、内存转发 | 不处理登录/付费/试看，不保存视频文件；替代旧版“不解析”决定 |
| 独立播放器输入 | B 站页面、BV/AV、短链、直链或本机文件 | 按来源解析后使用原生 video 控制 |

## 16. 维护要求

后续开发时建议遵守：

1. 保持首页和独立播放器职责分离；
2. 所有用户输入显示前进行转义或使用 `textContent`;
3. 新增 API 后同步更新本文档；
4. 修改部署地址后同步更新 `public/api-config.js`;
5. 涉及目录路由的修改必须测试 `/player/`;
6. 每次部署后至少验证：
   - 首页可打开；
   - API 健康检查；
   - 一个样片可播；
   - 独立播放器可播；
   - 本机 B 站链接能真实解析、播放和拖动；受限来源显示具体原因。

## 17. 本地解析 API（2026-10-19 新增）

`GET /api/resolve?url=编码后的输入` 返回 `{ok:true, video, playUrl, expiresAt}`。video 含 `id/title/author/cover/page/pages/quality/url`；`quality` 是上游实际允许的画质。playUrl 是本机 `/api/stream?token=...`，最多有效 30 分钟，且不晚于 CDN 地址的 deadline。客户端仅把 video.url 写入分享地址。

`GET/HEAD /api/stream?token=...` 转发 MP4 和单段字节 Range，保留 206/416 与 Content-Range；断开时取消上游。令牌只存于当前进程内，重启后失效；无任意 URL 代理参数。媒体仅使用 bilivideo.com / bilivideo.cn 的 HTTPS 标准 CDN，重定向每跳重新验证，P2P 地址丢弃。

这两个接口检查本机回环连接、Host 和浏览器 Origin。错误返回 `{ok:false,error}`，常见状态为 400 无效输入或分 P、403 非本机或内容限制、404 不可见视频、410 令牌过期、429 上游风控、502 上游连接或格式问题、504 超时。

`/api/health` 在原字段上新增 `capabilities.bilibiliResolve`。该值仅在本机允许的请求下为 true。现有 Serverless 入口没有此能力。

另修复：本地 MP4/WebM 静态资源支持 Range/HEAD；拖动时重置独立播放器帧率采样窗口，避免跨越跳转时间后错误降低帧率并放大自动逐帧步长。
