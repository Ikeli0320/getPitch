# getPitch — Chrome Extension 設計文件

**日期：** 2026-04-02  
**狀態：** 已審核通過

---

## 目標

為歌手製作一個 Chrome Extension，在 YouTube 播放歌曲時：
1. 偵測原曲調號
2. 持續追蹤最高音
3. 推薦適合演唱的調號（以最高音不超過 D5 為基準，限制升降記號 ≤ 3）

---

## 技術方案

**方案 C：Chromagram + Tonal.js**

- Web Audio API 的 FFT 負責「聽」音訊
- Chromagram 演算法將頻譜轉為 12 音高類別能量
- Krumhansl-Schmuckler 輪廓相關性計算調號
- Tonal.js 負責所有音樂理論計算（調號篩選、半音換算、音符命名）

---

## 整體架構

```
YouTube <video> 元素
    │
    ▼
Content Script (content.js)
    ├── chromagram.js  — FFT → 12音高能量累積
    └── key-detector.js — Krumhansl-Schmuckler 相關性
    │
    ▼ chrome.runtime.sendMessage
Background Service Worker (background.js)
    └── chrome.storage.session — 儲存最新結果
    │
    ▼
Popup (popup.js / popup.html)
    └── 顯示結果 + 開始/停止分析按鈕
```

---

## 分析邏輯

### 兩階段偵測

| 階段 | 說明 |
|------|------|
| 調號偵測 | 分析開始後 15 秒鎖定，不再更新 |
| 最高音追蹤 | 持續追蹤整首歌，只記錄「目前為止的最高音」 |
| 推薦調號 | 每次最高音更新時重新計算 |

### 音訊分析流程

```
AudioContext.createMediaElementSource(<video>)
    │
    ▼
AnalyserNode (FFT size: 4096, 每 200ms 取樣)
    │
    ▼
頻率陣列 → Chromagram（12音高類別能量累加）
    │
    ├─→ [前15秒] Krumhansl-Schmuckler 相關性 → 原曲調號（鎖定）
    │
    └─→ [持續] FFT 頻率峰值 → 最高音（Tonal.js 轉音符名稱）
```

### 推薦調號計算

1. 計算原曲最高音到 D5 的半音差距（正數=需降調，負數=需升調）
2. 將差距套用到原曲調號，得到目標調號
3. 過濾：只保留升降記號 ≤ 3 的調號（共 7 個大調：C, G, D, A, F, Bb, Eb 及其關係小調）
4. 若目標調號不符合，選取半音距離最近且符合條件的調號；距離相同時，優先選升調（半音往上）方向

**範例：**
- 原曲最高音 = F5，原曲調 = G 大調
- F5 → D5 需降 3 個半音
- G 大調降 3 個半音 = E 大調（4個#，不符合）
- 選最近符合的 Eb 大調（3個b）✅

---

## 檔案結構

```
getPitch/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/
│   ├── content.js        # 分析生命週期管理
│   ├── chromagram.js     # FFT → 12音高能量
│   └── key-detector.js   # 調號相關性計算
├── background/
│   └── background.js     # 訊息中繼 + 結果儲存
└── lib/
    └── tonal.min.js       # 音樂理論計算
```

---

## Popup UI

### 精簡版（預設）

- 原曲調號（15秒後鎖定）
- 最高音（持續更新）
- 推薦調號（跟隨最高音更新）
- 「開始分析」按鈕
- 「詳細 ▼」展開按鈕

### 詳細版（展開後額外顯示）

- 調號偵測狀態（鎖定中 / 已鎖定）
- 最高音追蹤狀態
- 需調整半音數
- 所有符合條件的調號列表（≤3 升降記號）

### 狀態訊息

| 狀態 | 顯示訊息 |
|------|----------|
| 不在 YouTube | 請前往 YouTube 頁面使用 |
| 未播放 | 請先播放歌曲後再開始分析 |
| 調號鎖定中 | 調號偵測中（進度條） |
| 追蹤中 | 最高音追蹤中... |

---

## 技術規格

| 項目 | 規格 |
|------|------|
| Manifest 版本 | V3 |
| 權限 | `activeTab`, `scripting`, `storage` |
| 音訊擷取方式 | `createMediaElementSource(<video>)` |
| FFT size | 4096 |
| 取樣間隔 | 200ms |
| 調號鎖定時間 | 15 秒 |
| 最高音上限 | D5 |
| 允許升降記號數 | ≤ 3 |
| 介面語言 | 中文 |
| 外部函式庫 | Tonal.js（音樂理論）|

---

## 允許的調號清單（升降記號 ≤ 3）

| 調號 | 升降記號 |
|------|----------|
| C 大調 / A 小調 | 0 |
| G 大調 / E 小調 | 1# |
| D 大調 / B 小調 | 2# |
| A 大調 / F# 小調 | 3# |
| F 大調 / D 小調 | 1b |
| Bb 大調 / G 小調 | 2b |
| Eb 大調 / C 小調 | 3b |
