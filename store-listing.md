# Chrome 線上應用程式商店 — getPitch 上架文案

本檔以**繁體中文**為預設說明。Chrome 商店可上架**兩支擴充功能**（繁中版與英文版各一）；英文區塊請複製到英文列表專用套件。

GitHub 文件語言切換：[繁體中文 README](README.md) · [English README](README.en.md)

---

## 繁體中文列表（主要）

### 顯示名稱
getPitch — YouTube 調性偵測

### 簡短說明（≤132 字元）
一鍵分析 YouTube 歌曲的調號、最高音、拍速與伴唱建議調，全程在電腦本機完成。

### 完整說明

**為什麼要安裝 getPitch**

練唱、教唱、自彈自唱或選 K 歌調性時，常要猜調、找譜或開別的網站。getPitch 讓你**在正在看的 YouTube 音樂影片上**，直接得到 **調號**、旋律 **最高音**、**拍速**，以及 **實際好唱的建議調**；不必另開分頁，音訊也不會上傳到任何伺服器。

**值得安裝的理由**

• **省時間** — 不用另找調性 App 或轉站；在當前影片按一下擴充功能即可開始。  
• **唱得更安心** — 推薦調以「最高音不超過 D5」為目標，並限制在升降記號不多、K 歌與實務常用的調性組合內。  
• **資訊透明** — 顯示調性信心分數；信心不足時有提示；長時間無音訊會停止並給出明確說明，避免誤判卡住。  
• **隱私優先** — 所有音訊分析都在瀏覽器本機完成，無上傳、無遙測。

**核心功能**

• **調號** — 約 15 秒後鎖定，採用 Bellman-Budge 色譜與相關分析；以五線譜升降記號呈現，閱讀方式與樂譜一致。  
• **最高音** — 即時追蹤音名（如 D5）與口語標示（如 高音Re），一眼判斷旋律對歌手的負擔。  
• **拍速** — 約 5 秒後穩定顯示，方便練習節奏或挑選伴唱速度。  
• **推薦伴唱調** — 在 14 個實用調性（升降記號 ≤ 3）中給出建議，並附 **±3 半音** 微調滑桿。  
• **其他** — 調性信心 0–100、低信心警示、靜音／無音訊偵測與友善錯誤提示。

**使用方式**

1. 開啟任意 YouTube 音樂影片。  
2. 點擊 getPitch 工具列圖示（或快捷鍵 **Alt+P**／Mac 為 **⌘⇧P**）。  
3. 按下 ▶ 開始分析。  
4. 隨播放進度，調號、最高音、拍速與推薦調會即時更新。

---

## English listing（供英文版 Chrome 上架複製用）

### Name
getPitch - YouTube Key Detector

### Short description (≤132 characters)
Detects the key, highest note, and recommended singing key of any YouTube song in real-time.

### Detailed description

**Why install getPitch**

If you sing, teach vocals, jam along, or pick karaoke keys, you usually guess the key or hunt for transcriptions. getPitch turns any YouTube music video into instant musical context: you see the **key**, how **high** the melody goes, the **tempo**, and a **practical key to sing in** — without leaving the tab or sending audio to a server.

**Reasons to install**

• **Save time** — No manual tuning apps or separate sites; open the popup on the video you are already watching.  
• **Sing smarter** — Recommended key keeps the peak note in a comfortable range (≤ D5) while staying in common, readable keys.  
• **Stay informed** — Key confidence and a warning when the detection is ambiguous, plus a silence guard so you are not stuck on stale results.  
• **Privacy by design** — All DSP runs locally in Chrome; no uploads, no telemetry.

**What it does**

• **Key signature** — Locks after ~15 s using a Bellman-Budge chromagram + correlation. Accidentals match how you read staff notation.  
• **Highest note** — Live note name (e.g. D5) plus a friendly label (e.g. 高音Re) so you see how demanding the line is.  
• **BPM** — Spectral-flux onset autocorrelation; stabilises after ~5 s for tempo-aware practice or karaoke prep.  
• **Recommended singing key** — Chooses among 14 practical keys (≤ 3 sharps/flats) with a **±3 semitone** transpose slider for fine-tuning.  
• **Extras** — Key confidence (0–100), low-confidence badge, and silent-audio handling with a clear message.

**How to use**

1. Open any YouTube music video.  
2. Click the getPitch icon (or **Alt+P** / **⌘⇧P** on Mac).  
3. Press ▶ 開始分析 (Start Analysis).  
4. Watch key, highest note, BPM, and recommended key update as the track plays.

---

## 共用欄位

### 類別
音樂

### 隱私權政策網址
https://ikeli0320.github.io/getPitch/privacy-policy.html

### 定價
免費

### 螢幕截圖建議（1280×800 或 640×400）

1. 已鎖定調號（例如 G 大調、一個升記號）、最高音、拍速、推薦調  
2. 詳細區塊展開（可用調號列表、半音位移說明）  
3. 微調滑桿使用中  

---

## 提交檢查清單

- [x] 圖示：`icon16.png` … `icon128.png`（`node scripts/generate-icons.js`）  
- [x] 隱私頁：上述 GitHub Pages URL  
- [x] 截圖：`screenshots/screenshot1-3.png`（1280×800）  
- [ ] 開發者帳戶驗證（Chrome Web Store 一次性費用）  
- [ ] 上傳對應語系的 ZIP 並送審（繁中版與英文版各一，manifest 文案需與列表一致）

## 重建 ZIP（PowerShell 範例）

```powershell
# 版本號讀取自 manifest.json
$ver = (Get-Content manifest.json | ConvertFrom-Json).version
Remove-Item -Force "getPitch-$ver.zip" -ErrorAction SilentlyContinue
Compress-Archive -Path manifest.json,background,content,popup,icons,privacy-policy.html -DestinationPath "getPitch-$ver.zip" -Force
Write-Host "Built getPitch-$ver.zip"
```

> 英文版上架請在打包前將 `manifest.json` 的 `name`、`description`、`action.default_title`、快捷鍵說明等改為英文後再 `build:zip`，與本 repo 預設繁中版分流維護。
