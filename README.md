# Mutuara — 更新分发与公告站点

面向 App 的纯静态更新分发站点：GitHub 推送触发 Cloudflare Pages 部署，Android 安装包托管在 GitHub Releases，iOS 只做 App Store / TestFlight 跳转。无后端、无数据库、无构建步骤。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 页面 | 原生 HTML + CSS + JS，多页结构（MPA），保证 SEO |
| 动效 | 手写 CSS 动画 + 原生 JS 打字机，支持 `prefers-reduced-motion` 降级 |
| 过渡 | View Transitions API（浏览器不支持时自动退化为普通跳转） |
| 数据 | 静态 JSON 清单，统一放在 `/updates/` 下 |
| 部署 | Cloudflare Pages，推送 `main` 自动部署 |
| 安装包 | GitHub Releases（站点不托管 APK / IPA） |

## 目录结构

```
.
├── index.html                  # 主页（启动序列 + 字符 logo + 命令终端）
├── download.html               # 下载页（树形软件库）
├── announcements.html          # 更新公告
├── beta.html                   # 内测隐藏页（口令校验）
├── assets/
│   ├── css/style.css           # 全局样式与双主题变量
│   └── js/
│       ├── head.js             # 首屏前置：no-js 切换、主题预应用
│       └── main.js             # 运行时：字符画 / 打字机 / 主题 / 树形库 / 命令
├── updates/                    # 固定清单目录，路径不可变更
│   ├── public/                 # 公测通道：对外公开
│   │   ├── index.json          # 公测软件索引（驱动下载页树形库）
│   │   └── mutuara/
│   │       ├── android.json
│   │       └── ios.json
│   ├── internal/               # 内测通道：仅 beta 页可见
│   │   ├── index.json          # 内测软件索引
│   │   ├── mutuara/
│   │   │   ├── update.json
│   │   │   └── *.apk
│   │   └── Navi-IME-android/
│   │       ├── update.json
│   │       └── Navi-IME-android.apk
│   └── announcements.json      # 公告数据（公私共用）
├── robots.txt
├── sitemap.xml
├── _headers                   # Cloudflare Pages 响应头（安全头 / 缓存 / CORS）
└── _redirects                 # Cloudflare Pages 重定向与短链
```

## 本地预览

清单使用 `/updates/...` 这类以根路径开头的地址，因此**必须从仓库根目录起一个静态服务**，直接双击 `index.html` 会读不到 JSON。

```bash
python -m http.server 8080
# 或
npx serve .
```

然后访问 `http://127.0.0.1:8080/`。

## 部署到 Cloudflare Pages

1. Cloudflare Dashboard → Pages → 连接本仓库。
2. 构建配置：
   - 框架预设：`None`
   - 构建命令：**留空**
   - 输出目录：`/`
3. 生产分支设为 `main`，之后每次 push 自动部署。
4. `_headers` / `_redirects` 会被 Pages 自动识别，无需额外配置。

`_headers` 当前包含：

- 全局安全头（`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`、`Content-Security-Policy`）；
- `/assets/*` 缓存 1 小时；
- `/updates/*` 缓存 5 分钟 + `Access-Control-Allow-Origin: *`，供 App 客户端跨域拉取；
- HTML 页面 `must-revalidate`，`/beta.html` 额外 `no-store` + `noindex`。

## 更新清单规范

### `/updates/public/index.json` — 公测软件索引

下载页的树形库完全由这个文件驱动，新增软件只需在此追加一项，页面无需改动。

```json
{
  "updated_at": "2026-11-10T00:00:00Z",
  "apps": [
    {
      "id": "mutuara",
      "name": "mutuara",
      "tagline": "terminal-native update channel",
      "entries": [
        { "platform": "android", "channel": "public", "manifest": "/updates/public/mutuara/android.json" },
        { "platform": "ios", "channel": "public", "manifest": "/updates/public/mutuara/ios.json" }
      ]
    }
  ]
}
```

### `/updates/internal/index.json` — 内测软件索引

结构与公测索引一致，但清单全部指向 `/updates/internal/`。beta 页解锁后按此文件逐个渲染内测应用。

```json
{
  "updated_at": "2026-11-10T00:00:00Z",
  "apps": [
    {
      "id": "Navi-IME-android",
      "name": "Navi-IME-android",
      "tagline": "internal build · android",
      "entries": [
        { "platform": "android", "channel": "internal", "manifest": "/updates/internal/Navi-IME-android/update.json" }
      ]
    }
  ]
}
```

- `hidden: true` 可让某个软件或条目不在页面上展示（清单文件仍然可访问，供 App 使用）。
- `manifest` 必须是以 `/updates/` 开头的绝对路径。
- 公测与内测索引互不交叉：下载页只读公测索引，beta 页只读内测索引。

### `/updates/public/<app>/android.json` — 公测 Android 清单

```json
{
  "platform": "android",
  "version_code": 130,
  "version_name": "1.3.0",
  "published_at": "2026-11-10T00:00:00Z",
  "changelog": [
    { "type": "feature", "text": "新增暗色模式与终端风格界面" },
    { "type": "fix", "text": "修复启动时偶发崩溃的问题" }
  ],
  "packages": [
    {
      "arch": "arm64-v8a",
      "variant": "default",
      "download_url": "https://github.com/OWNER/REPO/releases/download/v1.3.0/mutuara-arm64-v1.3.0.apk",
      "size": 12845056,
      "checksum": "sha256:..."
    }
  ]
}
```

- `packages` 为数组，同一版本可挂多个架构 / 变体；页面只把第一个作为主下载按钮。
- `changelog` 的 `type` 支持 `feature` / `fix` / `improve`，用于渲染不同颜色的标签。
- 是否强制更新、如何比较版本，全部由 App 客户端自行判断，站点只提供数据。

### `/updates/public/<app>/ios.json`

```json
{
  "platform": "ios",
  "version_code": 130,
  "version_name": "1.3.0",
  "published_at": "2026-11-10T00:00:00Z",
  "changelog": [{ "type": "feature", "text": "..." }],
  "app_store_url": "https://apps.apple.com/app/id0000000000",
  "testflight_url": "https://testflight.apple.com/join/XXXXXXXX"
}
```

站点不托管 IPA，只提供跳转。

### `/updates/announcements.json` — 公告

```json
{
  "updated_at": "2026-11-10T00:00:00Z",
  "items": [
    {
      "id": "2026-11-10-v1.3.0",
      "title": "v1.3.0 正式发布",
      "date": "2026-11-10",
      "channel": "public",
      "platforms": ["android", "ios"],
      "summary": "暗色模式与终端风格界面正式上线。",
      "body": ["本次更新带来……", "Android 可直接下载 APK……"]
    }
  ]
}
```

`body` 为字符串数组，每项渲染为一段。列表按 `date` 倒序排列。

## 发版流程（公测 Android）

1. 打包 APK。
2. 在 GitHub 建 Release（建议 tag 与版本一致，如 `v1.3.1`），把 APK 作为附件上传。
3. 计算校验值：`certutil -hashfile mutuara-arm64-v1.3.1.apk SHA256`（Windows）。
4. 更新 `/updates/public/mutuara/android.json`：`version_code`、`version_name`、`published_at`、`changelog`、`packages[].download_url / size / checksum`。
5. 需要对外通知时，在 `/updates/announcements.json` 顶部追加一条公告。
6. 提交并推送，Pages 自动发布。

## 发版流程（内测 Android）

内测包直接放在对应应用目录，不占用 GitHub Releases：

1. 把 APK 放进 `/updates/internal/<app-id>/`（Navi-IME-android 的固定文件名是 `Navi-IME-android.apk`）。
2. 修改同目录的 `update.json`：`version_code`、`version_name`、`published_at`、`changelog`、`packages[].download_url / size / checksum`。
3. `download_url` 使用站点内绝对路径，例如 `/updates/internal/Navi-IME-android/Navi-IME-android.apk`。
4. 推送后在 `/beta.html` 输入口令即可看到更新后的条目。

> 注意：内测包放在公开仓库里，任何拿到路径的人都能下载；beta 页的口令只是「隐藏入口」，不是真正的权限控制。

## 新增一个软件

公测：

1. 新建 `/updates/public/<app-id>/`，放入该软件的平台清单。
2. 在 `/updates/public/index.json` 的 `apps` 数组追加一项，`entries` 指向刚放好的清单。
3. 推送后下载页树形库会自动多出一个分支，无需改 HTML / JS。

内测：

1. 新建 `/updates/internal/<app-id>/`，放入 `update.json` 与 APK。
2. 在 `/updates/internal/index.json` 的 `apps` 数组追加一项。
3. 推送后 beta 页解锁即会多出一块该应用的详情。

## 页面与交互说明

- **字符 logo**：`ART_BANNER` 是固定的 8 行 ASCII 大字常量，`artMeasure()` 统计最长行得到列数，`fitArt()` 按容器宽度换算字号并二次校正，任何宽度下都精确铺满且不换行、不错位；无任何图片依赖。渐变与发光由 `--art-1/2/3`、`--art-glow` 四个变量控制。
- **打字机**：`typeInto()` 逐字写入 DOM，启动序列（含 `system -version`）、树形库逐行载入都走同一套；`prefers-reduced-motion` 时自动近乎瞬时完成，也可点击跳过。
- **主题**：暗色 / 亮色由 `html[data-theme]` 切换 CSS 变量，选择写入 `localStorage`；`head.js` 在首屏渲染前预应用，避免刷新回退或闪白。
- **光标**：全局 `.caret` 类，`blink` 无限 `steps` 动画；命令输入框获得焦点时自动隐藏原生光标位。
- **下载页**：读取 `/updates/public/index.json` 并逐行打字机渲染树形结构，点击条目在下方展开该清单的版本、更新日志与安装包。
- **内测页**：口令通过后读取 `/updates/internal/index.json`，逐个应用渲染内测清单与下载入口。

## 内测页

`/beta.html` 为口令门禁页，口令以 SHA-256 摘要比对（`main.js` 中的 `INTERNAL_KEY_HASH`），不做真实鉴权，仅用于隐藏入口。

更换口令：

```bash
# 生成新口令的 sha256（小写十六进制）
python -c "import hashlib; print(hashlib.sha256('新口令'.encode()).hexdigest())"
```

把结果替换掉 `INTERNAL_KEY_HASH` 即可。注意 `crypto.subtle` 仅在 HTTPS 或 `localhost` 下可用。

## 上线前需要替换的占位符

| 位置 | 占位值 |
| --- | --- |
| `index.html` / `download.html` / `announcements.html` 的 canonical、OG 标签 | `https://mutuara.example.com` |
| `robots.txt` 的 Sitemap 地址 | `https://mutuara.example.com/sitemap.xml` |
| `sitemap.xml` 的 `<loc>` | `https://mutuara.example.com` |
| 各清单的 `download_url` | `github.com/OWNER/REPO`（公测）、`/updates/internal/...`（内测） |
| `ios.json` | `apps.apple.com/app/id0000000000`、`testflight.apple.com/join/XXXXXXXX` |
| 各清单的 `checksum` | `sha256:REPLACE_WITH_ACTUAL_SHA256` |
| `Navi-IME-android` 的清单与 APK | 占位版本 `0.0.0`，等待首次内测包 |

## 仓库约定

- 清单根目录固定为 `/updates/`，公测在 `public/`、内测在 `internal/`，两者内部都按应用名分目录；不要移动或改名，否则 App 与页面会同时失效。
- 内测目录中的 APK 按应用固定命名（如 `Navi-IME-android.apk`），升级时直接覆盖同名文件即可，清单里的 `download_url` 无需改动。
- 内部笔记文档不进仓库：`.gitignore` 排除 `docs/` 与所有 `*.md`，仅保留本 README。
- 提交前确认没有遗留调试产物（截图、日志等，`/_*.png`、`/_*.txt` 等已被忽略）。
- `_headers` 与 `_redirects` 是 Cloudflare Pages 的正式配置，必须提交，不要加入忽略规则。
- 文本文件统一 LF 换行，由 `.gitattributes` 约束。