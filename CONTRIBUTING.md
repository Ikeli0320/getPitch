# 貢獻指南 — getPitch

**語言：** [繁體中文](CONTRIBUTING.md)（本頁）· [English](CONTRIBUTING.en.md)

感謝你有意願一起改善本專案。

## 環境設定

無需建置步驟，直接以原始碼載入擴充功能即可。

```bash
git clone https://github.com/Ikeli0320/getPitch.git
cd getPitch
```

在 Chrome 中載入：

1. 開啟 `chrome://extensions/`
2. 啟用**開發人員模式**
3. 點**載入未封裝項目** → 選取 `getPitch/` 資料夾

## 執行測試

```bash
npm test
```

chromagram 與 key-detector 兩組測試皆以 Node.js 直接執行，無需額外測試框架。

提交前請確認版本號一致：

```bash
npm run version-check
```

## 專案結構

| 路徑 | 用途 |
|---|---|
| `content/` | 注入 YouTube 頁面的內容腳本 |
| `background/` | Manifest V3 service worker |
| `popup/` | 擴充功能彈出視窗介面 |
| `tests/` | Node.js 單元測試 |
| `scripts/` | 開發用工具（圖示產生、上架 ZIP 打包等） |
| `screenshots/` | 商店截圖與產圖腳本 |

完整架構與常數說明見 `CLAUDE.md`。

## 修改流程建議

1. 完成你的變更
2. 執行 `npm run version-check` — 若有釋出需求，請同步遞增 `manifest.json` 與 `package.json` 的 `version`
3. 執行 `npm test` — 須全部通過
4. 執行 `npm run build:zip` — 確認上架 ZIP 可正常產生
5. 提交訊息建議遵循 [Conventional Commits](https://www.conventionalcommits.org/)：`fix:` / `feat:` / `chore:` / `docs:` 等
6. 開啟 Pull Request

## 重新產生圖示

```bash
node scripts/generate-icons.js
```

## 重新產生商店截圖

```bash
cd screenshots
npm install   # 僅第一次需要，會安裝 puppeteer
node take-screenshots.js
```

會從 HTML mockup 輸出 1280×800 的 `screenshot1-3.png`。

## 程式風格

- 縮排 2 空格、LF 行尾（由 `.editorconfig` 規範）
- 除約定的模組層級變數外，避免任意修改共享狀態
- 單一函式建議維持在 50 行以內
- 不使用額外打包工具 — 僅使用 Chrome 116+ 原生支援的 ES2017 語法
