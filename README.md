# getPitch — YouTube 調性偵測

**語言：** [繁體中文](README.md)（本頁）· [English](README.en.md)

[![CI](https://github.com/Ikeli0320/getPitch/actions/workflows/ci.yml/badge.svg)](https://github.com/Ikeli0320/getPitch/actions/workflows/ci.yml)
[![Changelog](https://img.shields.io/badge/changelog-CHANGELOG.md-blue)](CHANGELOG.md)

Chrome 擴充功能：在瀏覽器本機即時分析 YouTube 歌曲的**調號**、**最高音**、**拍速（BPM）**與**建議演唱調**，無需上傳音訊。

### 為什麼要安裝？

- **不離開 YouTube** — 不用另開 App 或網站，在當前影片上按一下就能分析。
- **為練唱與教學設計** — 掌握旋律有多高，並取得以舒適音域（最高音 ≤ D5）與實用調性為目標的**建議調**，附 **±3 半音**微調滑桿。
- **資訊誠實** — 顯示調性**信心度**，不確定時會提示；**靜音／無音訊**時會停止並說明，避免誤判。
- **隱私優先** — 分析全在您的電腦上完成，音訊處理**不發出網路請求**。

## 功能說明

- **調號** — 約 15 秒後鎖定，採 Bellman-Budge（1962）色譜與 Pearson 相關；以五線譜升降記號顯示。
- **最高音** — 持續追蹤音名（如 `D5`）與階名標示（如 `高音Re`）；以最近 3 幀中至少 2 幀一致才採信，降低暫態雜訊。
- **拍速** — 以頻譜通量節拍起點做自相關；約 5 秒後趨於穩定。
- **建議演唱調** — 在最高音不超過 **D5**、升降記號 ≤ 3（14 個實用伴唱調）的條件下建議調性，並附 **±3 半音**滑桿微調。
- **調性信心** — 0–100 分；低於 40 顯示 ⚠。
- **靜音守護** — 長時間近乎無音訊時約 20 秒後停止並顯示提示。
- **隱私** — 資料不離開瀏覽器；無分析、無遙測、無對外連線（分析用途）。

## 畫面預覽

| 主畫面 | 詳細資訊 | 微調滑桿 |
|--------|----------|----------|
| ![Main](screenshots/screenshot1.png) | ![Detail](screenshots/screenshot2.png) | ![Slider](screenshots/screenshot3.png) |

## 安裝方式

### Chrome 線上應用程式商店

上架後可搜尋繁中／英文各一支列表（套件包內文案以該語系為主）。詳見 [`store-listing.md`](store-listing.md)。

### 開發者模式（本機載入）

1. 複製或下載本儲存庫。
2. 開啟 `chrome://extensions/` 並啟用**開發人員模式**。
3. 點**載入未封裝項目**，選取 `getPitch/` 資料夾。
4. 開啟 YouTube 音樂影片，點工具列上的 getPitch 圖示（或快捷鍵 **Alt+P**／Mac **⌘⇧P**）。

## 使用方式

1. 開啟 YouTube 音樂影片（支援 `/watch` 與 Shorts）。
2. 點擊 **getPitch** 圖示開啟彈出視窗。
3. 按 **▶ 開始分析**。
4. 播放過程中可看到調號、最高音、拍速與建議調即時更新。

## 開發說明

無需建置步驟，直接載入原始碼即可。

```bash
# 執行單元測試
npm test

# 產生圖示
node scripts/generate-icons.js

# 打包上架用 ZIP（跨平台、無額外依賴）
npm run build:zip
```

### 架構概要

```
內容腳本（YouTube 頁面）              background.js        popup.js
  chromagram.js                       ─────────────        ────────
    buildChromagram()                 startAnalysis    →   getState（session）
    accumulateChroma()    content.js  stopAnalysis     →   storage.onChanged →
  key-detector.js         ────────── updateResults    →     _updateUI()
    detectKey()           _tick()     resetState       →     _renderKeySigSVG()
    recommendKey()        200 ms      getState         ←     _getAdjustedKey()
```

內容腳本為宣告式注入（未使用 `scripting` 權限）。狀態存於 `chrome.storage.session`，MV3 service worker 被回收後會從 storage 還原。

### 主要常數（`content/content.js`）

| 常數 | 預設值 | 說明 |
|---|---|---|
| `KEY_LOCK_MS` | 15 000 | 鎖定調號前需累積的音訊時間（毫秒） |
| `TICK_MS` | 200 | 主分析迴圈間隔（毫秒） |
| `SILENT_TIMEOUT_MS` | 20 000 | 色譜能量過低時觸發「無音訊」錯誤的等待時間 |
| `NOISE_FLOOR_DB` | −55 | 最高音峰值偵測的 dB 門檻 |
| `FREQ_MIN_HZ` / `FREQ_MAX_HZ` | 130 / 1 175 | 最高音追蹤頻段（約 C3–D6） |
| `BPM_MIN` / `BPM_MAX` | 60 / 180 | BPM 自相關搜尋範圍 |
| `NOTE_WINDOW` / `NOTE_MIN_HITS` | 3 / 2 | 最高音幀確認視窗 |

（其餘常數見 `content/chromagram.js` 與 `CLAUDE.md`。）

## 疑難排解

| 現象 | 可能原因 | 處理方式 |
|------|----------|----------|
| 「找不到影片元素」 | 載入時機早于影片就緒 | 重新整理頁面後再試 |
| 「請先播放影片」 | 影片暫停 | 先播放，再按開始分析 |
| 約 20 秒後「未偵測到音訊」 | 影片靜音、系統無聲等 | 確認未靜音且系統音量開啟 |
| 調號一直「偵測中...」 | 尚未滿 15 秒有效音訊 | 持續播放等候鎖定 |
| 拍速顯示「—」 | onset 資料仍不足 | 開始分析後約 5 秒再看 |
| 擴充功能無反應 | 未載入或 worker 休眠 | 至 `chrome://extensions` 確認已啟用 |
| 數值像別首歌 | 多個 YouTube 分頁 | 先停止其他分頁的分析 |
| 調號旁 ⚠ | 信心度 < 40 | 多播放一段主歌／副歌 |

## 隱私權政策

音訊分析僅在您的瀏覽器本機執行，不蒐集或傳輸音訊與個資。全文見 [`privacy-policy.html`](privacy-policy.html)。

## 貢獻指南

請參閱 [CONTRIBUTING.md](CONTRIBUTING.md)（繁體中文）或 [CONTRIBUTING.en.md](CONTRIBUTING.en.md)（English）。

## 授權

[MIT](LICENSE)
