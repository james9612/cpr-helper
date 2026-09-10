# CPR Helper (NFC 急救小助手)

專為急救訓練課程（CPR+AED、BLS、EMT）量身打造的 **NFC 感應急救輔助紀念品** 專案。受贈學員平時可將 NFC 紀念品（如滴膠鑰匙圈、急救卡、防潑水貼紙）掛在隨身包或鑰匙上，突遇緊急狀況時，手機碰觸感應即在 **1 秒內喚醒** 110 BPM CPR 節拍器與 AED 圖解指引！

---

## 🌟 核心特色

1. **NFC 掃描即響急救語音廣播（叫叫CD 關鍵第一動）**：
   - 碰觸感應開啟瞬間自動廣播播報：「**意外狀況！請立即撥打 119 求救，並請旁人協助拿取 AED！**」
   - 雙軌語音保障（32KB 離線快取高音質播報檔 + Web Speech API 離線備援），完全無網路依然能正常開口。
   - 頂部一鍵直撥 119 救護車（`tel:119`）與「重播語音」功能，指引身旁民眾分工合作。
2. **極速秒開 (< 1秒)**：
   - 純靜態高質量原生前端架構（Vanilla HTML5 + CSS3 + ES6），無肥大框架負擔。
3. **100% 離線可用 (PWA)**：
   - 內建 Service Worker 與 Web Manifest，在地下室、捷運、車廂、偏遠山區等「完全無訊號」環境下，NFC 依然能正常秒開運作與播報語音。
4. **Web Audio API 毫秒級聲光震動**：
   - 使用瀏覽器內建音訊合成器發出清脆 110 BPM 節拍，零延遲且無漂移誤差。
   - 同步觸覺震動 (Vibration API) 與心跳動態脈衝光環。
5. **螢幕常亮防止休眠 (Screen Wake Lock API)**：
   - 節奏啟動時自動鎖定手機螢幕不息屏，避免施救過程中斷。
6. **AED 4 步驟速查手冊**：
   - 「開、貼、插、電」超大字體圖解、貼片右上左下全人型對照圖、電擊後接續 CPR 核心提醒。

---

## 📁 專案檔案架構

```
d:\NFC節拍器\
├── index.html              # 主頁面結構（緊急廣播橫幅、一鍵119、110 BPM 節拍、AED 4步驟）
├── css/
│   └── style.css           # 現代高對比急救暗色系風格、動態脈衝、玻璃擬態
├── js/
│   ├── metronome.js        # Web Audio API 節拍合成引擎、定時排程演算法
│   ├── app.js              # UI 互動、緊急語音廣播控制、Autoplay 相容處理
│   └── sw-register.js      # Service Worker 註冊與離線網路狀態監控
├── audio/
│   └── alert_119_aed.mp3   # 高音質台灣急救播報語音檔（32KB 離線快取）
├── sw.js                   # 離線快取 Service Worker (v9)
├── manifest.webmanifest    # PWA 應用設定檔（支援加入主畫面）
├── icons/
│   └── icon.svg            # 向量心臟脈動與急救閃電高解析圖標
└── README.md               # 專案說明與實體製作指南
```
└── README.md               # 專案說明與實體製作指南
```

---

## 🚀 本地啟動與預覽測試

你可以使用任何本機靜態伺服器進行測試，例如 Node.js 或 Python：

### 方法 A: 使用 npx serve
```bash
npx -y serve .
```

### 方法 B: 使用 Python
```bash
python -m http.server 8080
```
在瀏覽器開啟 `http://localhost:8080` 即可預覽。

---

## 🌐 免費一鍵託管上線指南

本專案為純靜態網站，推薦使用以下完全免費、具備全球 CDN 與 HTTPS 的平台：

### 推薦：Cloudflare Pages (最快最簡單，推薦)
1. 前往 [Cloudflare 官網](https://pages.cloudflare.com/) 登入或免費註冊。
2. 進入「Workers & Pages」➔「Create application」➔ 選擇「Pages」➔「Upload assets」。
3. 將本專案資料夾的所有檔案直接**拖曳丟入**網頁中。
4. 點擊「Deploy site」，約 5 秒內即可獲得一組專屬 HTTPS 網址（例如 `https://cpr-aed-helper.pages.dev`）。

### 備選：GitHub Pages
1. 在 GitHub 建立一個公開儲存庫（Repository），例如 `nfc-cpr-metronome`。
2. 將本專案檔案 push 到該儲存庫。
3. 進入儲存庫的 **Settings** ➔ **Pages** ➔ Build and deployment 來源選擇 `Deploy from a branch` (main / root)。
4. 幾分鐘後即可取得 `https://<your-username>.github.io/nfc-cpr-metronome` 網址。

---

## 🏷️ 實體 NFC 紀念品製作與燒錄指引

### 1. 挑選 NFC 晶片硬體
* **晶片型號推薦**：市售標準 **NTAG213**（容量 144 bytes，足夠寫入短網址）或 **NTAG215 / NTAG216**。
* **紀念品載體**：
  - **滴膠防水鑰匙圈**（可印製機構 Logo 或急救圖案，掛在學員鑰匙上最常隨身攜帶）。
  - **PVC 急救小卡**（名片大小，放在學員皮夾中）。
  - **抗金屬 NFC 標籤貼紙**（可貼在保溫杯、手機殼背面）。

### 2. 手機燒錄步驟（免費 App）
1. 在 iPhone (App Store) 或 Android (Google Play) 下載免費 App：**「NFC Tools」**。
2. 開啟 App，點選 **「寫入 (Write)」**。
3. 點選 **「新增紀錄 (Add a record)」** ➔ 選擇 **「網址 / URL」**。
4. 貼上部署好的專屬 HTTPS 網址（例如 `https://your-domain.pages.dev`）。
5. 點選 **「寫入 (Write)」**，將手機頂部靠近 NFC 標籤，聽到「嗶」聲即完成燒錄！

### 3. 貼心防呆設計 (Pro Tips)
* **設定為唯讀 (Lock)**：批量燒錄給學員前，建議透過 NFC Tools 的「其他 / Other」選單將晶片鎖定為 **Read-Only**，避免被學員或其他手機覆蓋洗掉。
* **雙軌備用 QR Code**：在實體紀念品背面同時印製網址 QR Code，遇到無 NFC 功能的舊手機也能掃碼開啟。
