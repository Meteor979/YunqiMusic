# 云栖音乐

一个深色、沉浸式的 Windows 桌面音乐播放器。界面与播放器为独立实现，歌曲和账号数据通过本地运行的网易云 API 服务获取。

## 功能

- 每日推荐、搜索、歌单详情、最近播放和个人收藏
- 首页即私人漫游，待播队列持续从账号偏好补充
- 通过网易云官方网页扫码登录，登录凭据保存在本机
- 全屏歌词、逐行跟随和点击跳转
- 自动音质：超清母带 → Hi-Res → 无损 → 极高 → 标准
- 曲目响度平衡与 10 段均衡器
- GitHub Releases 自动更新，仅替换应用包并保留本机登录状态
- 播放队列、随机播放、循环模式、系统媒体键
- 根据专辑封面生成强调色与环境光

## 开发

```powershell
pnpm install
pnpm start
```

## 构建

```powershell
pnpm run pack:dir
```

可运行目录生成在 `dist/win-unpacked`。直接生成单文件安装器需要 Electron Builder 的 Windows 打包工具。

## 发布更新

先更新 `package.json` 的版本号，再推送匹配的 Git 标签。GitHub Actions 会自动构建 `app.asar` 和 `update.json`，并发布到 GitHub Releases。

```powershell
git tag v0.1.4
git push origin main --tags
```

## 说明

- 本项目依赖非官方接口，接口可能随时变化。
- 登录 Cookie 只保存在当前电脑，并用 Electron `safeStorage` 加密。
- VIP 音源由网易云服务器按账号权益返回。
- 项目仅供个人学习与自用，请遵守网易云音乐服务条款及音乐版权要求。
