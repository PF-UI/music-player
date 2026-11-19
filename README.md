# 音乐库播放器

一个跑在自己电脑上的本地音乐播放器：Node 服务负责扫描曲库、解析标签、按需推流，浏览器负责界面与播放。没有账号、没有云端、没有广告，音乐文件始终待在本地硬盘上。

手机连同一个 Wi-Fi 扫码就能当遥控器和播放器用。

## 功能特性

**曲库**

- 递归扫描音乐目录，支持 MP3 / FLAC / M4A / AAC / OGG / OPUS / WAV / WMA / APE / AIFF 等格式
- 用 `mtime + size` 做增量缓存，只解析新增和改动的文件，万首曲库二次扫描秒级完成
- 标签缺失或乱码时自动回退到文件名解析（`01 - 歌手 - 歌名` 之类的常见命名）
- 封面：内嵌标签图 → 同目录 `cover/folder/front.*` 等多级回退，没封面时用专辑名生成渐变占位图
- 专辑、歌手、收藏、播放队列多视图，曲目列表虚拟滚动，上万首也不卡

**播放**

- 列表循环 / 单曲循环 / 随机播放，随机模式不会打乱你手动排好的队列（切走会原样恢复）
- 播放队列支持拖拽排序、插队播放、批量加入
- 断点续播：刷新页面后恢复上次的曲目和进度（不自动播放，避免被浏览器拦截）
- 支持 HTTP Range 请求，拖动进度条不用重新下载整个文件
- 支持系统媒体控制（MediaSession）：键盘媒体键、Windows 音量浮层、锁屏控件都能用
- 桌面 / 手机响应式布局，深色与浅色主题

**歌词**

- 自动加载音频同名的 `.lrc` 或 `.txt` 文件
- 支持标准 LRC 与增强 LRC 的逐字时间轴 `<mm:ss.xx>`
- 支持 `[offset:]` 偏移、原文与翻译双行合并、前奏留白行
- 逐字高亮动画、点击任意行或任意字跳转播放位置

**其他**

- 手机扫码访问（启动时终端直接打印二维码）
- 浏览器内上传歌曲 / 歌词 / 封面到指定子目录，带上传进度
- 单曲下载，中文文件名自动按 RFC 5987 编码
- 全键盘操作

## 环境要求

- **Node.js >= 22.18**（或 23.6+），推荐 Node 24
  服务端直接运行 TypeScript 源码，依赖 Node 内置的类型剥离能力，不需要额外编译步骤
- npm 10+

## 快速开始

```bash
# 1. 安装依赖（根目录执行，workspaces 会一并装好 server 和 web）
npm install

# 2. 把你的音乐放进来（默认读取项目根目录，也可以改配置指向别处）
#    例如把歌曲放到 d:\Music\music\ 下

# 3. 开发模式：同时启动 API 与前端
npm run dev
```

- 前端开发服务器：http://localhost:5173 （`/api` 已代理到服务端）
- API 服务：http://localhost:3001

**生产模式**（前后端同源，只有一个端口）：

```bash
npm run build   # 构建前端到 web/dist
npm start       # 启动服务，访问 http://localhost:3001
```

服务启动时终端会打印本机地址和局域网地址，并生成一张二维码；手机扫码即可访问（需在同一个 Wi-Fi 下）。

## 配置

编辑根目录的 `music.config.json`：

```json
{
  "musicDir": ".",
  "importDir": "music",
  "port": 3001,
  "host": "0.0.0.0",
  "extensions": [".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".wma", ".ape", ".aiff", ".aif", ".alac", ".mp4", ".m4b"],
  "excludeDirs": ["node_modules", ".git", ".cache", "dist", ".vite", "server", "web"]
}
```

| 字段 | 说明 |
| --- | --- |
| `musicDir` | 音乐根目录，相对项目根目录或绝对路径。默认 `.` 即项目根目录 |
| `importDir` | 网页导入歌曲的存放目录（相对项目根目录）。不在 `musicDir` 内时会被自动改回音乐根目录 |
| `port` | 服务端口，默认 `3001`；前端开发代理也读这个值 |
| `host` | 监听地址，`0.0.0.0` 允许局域网访问，只想本机用可改成 `127.0.0.1` |
| `extensions` | 认定为音频的扩展名列表（小写、带点） |
| `excludeDirs` | 扫描时跳过的目录名 |

音乐目录里的隐藏文件（`.` 开头）和空文件会被忽略。扫描结果缓存在 `.cache/library.json`，缓存版本升级或删除该文件都会触发重新解析。

## 使用说明

### 歌词与封面怎么被识别

| 资源 | 查找规则 |
| --- | --- |
| 歌词 | 音频同目录下的同名 `.lrc`，找不到再找同名 `.txt`，大小写不敏感，例如 `晴天.flac` → `晴天.lrc` |
| 封面 | 先读音频内嵌的图片；没有则找同目录的 `cover` / `folder` / `front` / `albumart` / `artwork` 等命名图片（jpg / png / webp / bmp / gif / avif） |

导入或删除歌词、封面文件后，点击侧边栏的「重新扫描」即可生效（目录修改时间变化会自动让对应缓存失效）。

### 键盘快捷键

| 按键 | 作用 |
| --- | --- |
| `空格` | 播放 / 暂停 |
| `←` `→` | 后退 / 前进 5 秒（按住 `Shift` 为 30 秒） |
| `↑` `↓` | 音量 ±5% |
| `N` / `P` | 下一首 / 上一首 |
| `S` 或 `R` | 切换播放模式（顺序 → 单曲 → 随机） |
| `L` | 打开 / 关闭歌词面板 |
| `F` | 收藏 / 取消收藏当前歌曲 |
| `M` | 静音 / 取消静音 |
| `/` | 聚焦搜索框 |
| `Esc` | 清空搜索 |

## API

服务端接口都在 `/api` 下：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 服务信息：音乐目录、导入前缀、端口等 |
| GET | `/api/status` | 扫描状态与进度（前端轮询用） |
| GET | `/api/library` | 完整曲库快照，带 `ETag`，未变化返回 `304` |
| POST | `/api/rescan` | 触发重新扫描（已在扫描时返回 `alreadyRunning: true`） |
| GET | `/api/albums/:id/tracks` | 某张专辑的曲目 |
| GET | `/api/stream/:id` | 音频流，支持 `Range` 请求 |
| GET | `/api/cover/:id` | 封面图片，带 `ETag` 与 7 天缓存 |
| GET | `/api/lyrics/:id` | 解析后的歌词结构 |
| GET | `/api/download/:id` | 下载原始音频文件 |
| POST | `/api/import?dir=&name=` | 上传单个文件（音频 / `.lrc` / `.txt` / 图片），请求体为二进制，上限 4GB |

错误统一返回 `{ "error": { "code": "...", "message": "..." } }`。

## 项目结构

```
.
├─ server/                 Node + Express 服务
│  └─ src/
│     ├─ index.ts          路由、流式传输、静态资源、启动日志
│     ├─ scanner.ts        目录遍历、标签解析、缓存
│     ├─ library.ts        由曲目构建专辑 / 歌手 / 统计
│     ├─ lyrics.ts         LRC 解析（含增强逐字格式）
│     ├─ cover.ts          封面提取与缓存
│     ├─ import.ts         上传落盘、路径与文件名校验
│     ├─ config.ts         读取 music.config.json
│     └─ state.ts          扫描状态与曲库快照
├─ web/                    React 前端
│  └─ src/
│     ├─ App.tsx           视图路由（无 router，用 store 里的 view）
│     ├─ store/            zustand 状态与播放逻辑
│     ├─ audio/engine.ts   全局唯一的 <audio> 实例
│     ├─ components/       侧栏、列表、播放条、歌词面板等
│     ├─ hooks/            全局快捷键
│     └─ lib/              格式化、持久化
├─ shared/types.ts         前后端共享的类型契约
├─ music.config.json       配置
└─ .cache/library.json     扫描缓存（自动生成）
```

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 同时启动 API（watch 模式）与前端开发服务器 |
| `npm run dev:api` | 只启动 API |
| `npm run dev:web` | 只启动前端 |
| `npm run build` | 构建前端到 `web/dist` |
| `npm start` | 启动生产服务（需先 build） |
| `npm run typecheck` | 对 server 与 web 做类型检查 |

## 已知限制

- **格式支持取决于浏览器**：服务端能扫描 `.ape`、`.wma`、`.alac` 等格式，但 Chrome / Edge 无法直接解码部分编码，这些文件可能能显示却播不出声。建议转成 FLAC / MP3 / M4A。
- 曲库快照随曲目数增长，万首量级约几 MB，已用 gzip 压缩并配合 `ETag` 缓存；更大规模建议后续做分页或虚拟化查询。
- 没有内置登录鉴权，`host` 设为 `0.0.0.0` 时同一网络内的人都能访问，请只在可信网络使用。
- 播放进度每 10 秒存一次 localStorage，异常关闭可能丢失最多 10 秒进度。

## 说明

本项目只包含播放器的代码，不包含任何音乐文件。请使用你自己合法拥有的音乐。仓库中的 `.gitignore` 已排除 `music/` 目录，音频不会被提交。
