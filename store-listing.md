# Chrome Web Store Listing — getPitch

## Name
getPitch - YouTube Key Detector

## Short Description (≤132 characters)
Detects the key, highest note, and recommended singing key of any YouTube song in real-time.

## Detailed Description (English)

getPitch listens to any YouTube song and tells you:

• **Key signature** — automatically detected after 15 seconds using the Bellman-Budge (1962) chromagram algorithm. Shown with the actual staff accidentals (sharps/flats) so you can read it like sheet music.

• **Highest note** — continuously tracked with both the note name (e.g. D5) and a colloquial label (e.g. 高音Re / "High Re"), so you know at a glance how demanding the song is for a singer.

• **BPM** — estimated from the beat onset after ~5 seconds. Useful for selecting karaoke tempo.

• **Recommended singing key** — calculated so that the highest note lands at or below D5, using only keys with ≤ 3 sharps or flats (the 14 most practical karaoke keys). Includes a transpose slider (±3 semitones) if you want to fine-tune further.

All analysis runs entirely in your browser — no audio data is ever uploaded anywhere.

**How to use:**
1. Open any YouTube music video.
2. Click the getPitch icon.
3. Press ▶ 開始分析 (Start Analysis).
4. Watch the key, highest note, BPM, and recommended key fill in as the song plays.

---

## Detailed Description (繁體中文)

getPitch 能即時分析任何 YouTube 歌曲，告訴你：

• **調號** — 使用 Bellman-Budge 色譜分析演算法，播放 15 秒後自動鎖定。以五線譜升降記號顯示，一眼即可辨認。

• **最高音** — 持續追蹤，同時顯示音名（如 D5）與口語名稱（如 高音Re），讓你立刻判斷這首歌對歌手的難度。

• **拍速（BPM）** — 約 5 秒後從節拍起始點估算，方便選擇伴唱速度。

• **推薦調號** — 計算出讓最高音落在 D5 以下、且升降記號不超過 3 個（共 14 個最實用的伴唱調）的建議調號。附帶微調滑條（±3 個半音）供進一步調整。

所有分析皆在瀏覽器本機執行，音訊資料絕不上傳。

**使用方式：**
1. 開啟任意 YouTube 音樂影片。
2. 點擊 getPitch 圖示。
3. 按下 ▶ 開始分析。
4. 隨著歌曲播放，調號、最高音、拍速與推薦調號將陸續顯示。

---

## Category
Music

## Language
- zh-TW (Traditional Chinese) — primary
- en (English) — secondary

## Screenshots needed (1280×800 or 640×400)
1. Popup showing a locked key (e.g. G 大調 with 1 sharp), highest note, BPM, and recommended key
2. Popup showing the detail section expanded (allowed keys list, semitone shift)
3. Popup showing the transpose slider in use

## Privacy Policy URL
https://ikeli0320.github.io/getPitch/privacy-policy.html

## Pricing
Free

## Submission checklist
- [x] Icons: icon16.png, icon32.png, icon48.png, icon128.png — generated via `node scripts/generate-icons.js`
- [x] ZIP built: `getPitch-1.0.17.zip` — run PowerShell command below to rebuild
- [x] **Privacy policy hosted** — https://ikeli0320.github.io/getPitch/privacy-policy.html
      → Enter that URL in Chrome Web Store Developer Dashboard → Store listing → Privacy practices
- [x] 3 screenshots ready in `screenshots/`: screenshot1.png, screenshot2.png, screenshot3.png (1280×800)
- [ ] Developer account verified ($5 one-time fee at Chrome Web Store Developer Dashboard)
- [ ] Upload `getPitch-1.0.17.zip` and submit for review

## Rebuild ZIP (PowerShell)
```powershell
# Auto-reads version from manifest.json
$ver = (Get-Content manifest.json | ConvertFrom-Json).version
Remove-Item -Force "getPitch-$ver.zip" -ErrorAction SilentlyContinue
Compress-Archive -Path manifest.json,background,content,popup,icons,privacy-policy.html -DestinationPath "getPitch-$ver.zip" -Force
Write-Host "Built getPitch-$ver.zip"
```
