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

项目当前解决的是“搜索公开视频元数据 + 播放官方嵌入或合法直链”的需求，不做第三方平台视频流解析、下载、缓存或代理。

## 2. 当前已实现成果

### 2.1 聚合搜索首页

首页地址：

```text
http://shaochenyue.asia/
```

主要能力：

- 输入关键词搜索 B 站视频；
- 首次进入显示热门视频；
- 有搜索记录后，首页按最近一次搜索关键词生成推荐标题；
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

支持两种输入方式：

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
- 前端当前默认读取 `public/api-config.js` 中的远端 API 地址。如果希望本地页面调用本地 API，需要把该文件中的 `VIDEO_API_BASE` 改为空字符串或 `http://localhost:3000`。

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

1. 首次进入且无搜索历史：显示热门视频；
2. 有搜索历史：取最近一次关键词；
3. 标题显示“根据关键词推荐”；
4. 搜索记录仍在搜索框下方展示；
5. 用户主动搜索后，进入普通搜索结果模式。

### 7.3 播放决策

首页打开视频时：

| 条件 | 播放方式 |
| --- | --- |
| `source=bilibili` 且有 `embed` | 创建 iframe，加载 B 站官方嵌入播放器 |
| 有 `playUrl` | 创建站内 `<video>` |
| 其他 | 显示空状态 |

独立播放器打开来源时：

| 输入 | 行为 |
| --- | --- |
| `mp4/webm` 等直链 | 设置为 `<video src>` |
| 本机文件 | `URL.createObjectURL(file)` |
| B 站视频页链接 | 不加载，提示不是视频直链 |
| `b23.tv` 短链 | 不加载，提示不是视频直链 |

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

1. **B 站网页链接不能作为视频直链播放**

   例如：

   ```text
   https://www.bilibili.com/video/BV1cTp66gEi7
   ```

   这是视频网页地址，不是 `mp4/webm` 文件地址。独立播放器会明确提示。

2. **B 站播放依赖官方嵌入域名**

   如果当前设备无法访问 `bilibili.com` 或 `player.bilibili.com`，首页中的官方嵌入播放器也无法显示。

3. **B 站接口可能触发风控**

   例如返回 `-412`。后端会抛出错误并提示稍后重试或更换关键词。

4. **当前不解析、不下载、不代理平台视频流**

   项目不做类似 SnapAny 的平台视频提取功能，也不通过 NAS 转发平台视频流。

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
| 视频无法播放 | 输入的是网页而不是直链、浏览器不支持编码、HTTP/HTTPS 混用、来源禁止访问 | 改用可播放的 `mp4/webm` 直链或本机文件 |
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
   - 不做第三方平台视频流解析。

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
| 第一次首页显示什么 | 热门视频 | 无历史时有真实内容可看 |
| 静态页如何热门 | 每日快照 | 无后端时也有数据 |
| B 站播放方式 | 官方 iframe | 使用官方公开嵌入能力，不解析视频流 |
| 是否做 SnapAny 类功能 | 不做 | 不实现平台视频流提取、下载、缓存或代理 |
| 独立播放器输入 | 直链或本机文件 | 符合浏览器原生播放能力，行为清晰 |

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
   - B 站网页链接提示正确。
