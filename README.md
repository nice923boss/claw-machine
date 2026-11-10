# 3D 夾娃娃機

用瀏覽器就能玩的 3D 夾娃娃機。場景是一間台灣娃娃機店，玩家站在中間那台機台前面：投幣、推搖桿、下爪，也可以繞著機台走到側面看準位置。

代幣全是免費的虛擬代幣，沒有任何金流、登入或後端。

**線上試玩：<https://nice923boss.github.io/claw-machine/>**

## 玩法

1. **投幣**：點機台右前方亮綠燈的「投幣」口（桌機也可以按 <kbd>C</kbd>）。一次投 1 枚，可以一直投，可玩次數會累加。錢包一開始有 20 枚，用完按「兌換代幣」免費補 10 枚。
2. **開局**：有次數時按「開始」，或直接推搖桿。每局扣 1 次，倒數 30 秒，時間到自動下爪。
3. **移動爪子**：搖桿方向以機台正面為準，跟真的機台一樣。走到側面時，畫面上方會提示搖桿方向在畫面上變成哪個方向。
4. **下爪**：爪子下降、合爪、上升，自動回到出貨口上方放開。玩偶掉進出貨口就算夾中，會加進「戰利品」。

### 進階技巧

| 技巧 | 做法 |
|------|------|
| 甩夾 | 爪子吊在繩子上，輕推搖桿就會大幅晃動。趁晃動時下爪，可以把爪子甩到旁邊，或撞動玩偶。想停穩瞄準，就放開搖桿等它慢慢停下。 |
| 半空收爪 | 下爪途中再按一次「下爪」（空白鍵），爪子會在當下高度立刻合起，適合夾高處的玩偶或勾吊牌。 |
| 勾吊牌 | 部分玩偶頭上掛金色吊牌環，讓爪尖穿進環裡就能吊起來。 |
| 推洞 | 靠近出貨口的玩偶，可以用爪子推、壓，或用回程的甩動把它撞進洞。 |

### 玩偶

小熊、兔子、貓咪、小雞、企鵝、恐龍、小豬、章魚，共 8 種，各有多種配色。稀有度分普通（約 70%）、稀有（約 25%）、限定（約 5%，金色閃亮）。體型大的比較難夾，每局爪力也不一樣。

開店時機台內有 20 隻，最多 30 隻。每 40～120 秒不定時補貨，剩不到 8 隻時立刻補，一次補 3～6 隻，從機台頂部投入；爪子作業中會等這一局結束再補。

## 操作

| 動作 | 桌機 | 手機 |
|------|------|------|
| 投幣 | 點投幣口，或按 <kbd>C</kbd> | 點投幣口 |
| 移動爪子 | 方向鍵／<kbd>WASD</kbd> | 畫面上的方向搖桿 |
| 下爪、半空收爪 | 空白鍵 | 「下爪」按鈕 |
| 繞著機台走 | 滑鼠拖曳 | 單指拖曳 |
| 走近、退後 | 滾輪 | 雙指縮放 |
| 快速視角（正面、左側、右側、俯視） | <kbd>1</kbd>～<kbd>4</kbd> | 視角按鈕 |
| 關閉面板 | <kbd>Esc</kbd> | 「關閉」按鈕 |

「俯視」是走到正面踮腳，貼著玻璃往下看。

## 本機預覽

遊戲用 ES module 載入程式，**不能直接雙擊 `index.html` 開啟**（瀏覽器會擋 `file://` 的模組），要用本機 http 伺服器。

有安裝 Python 的話，在這個資料夾開啟終端機，執行：

```bash
python -m http.server 8000
```

再用瀏覽器開 `http://localhost:8000/`。

3D 與物理函式庫從 jsDelivr 下載，第一次開啟需要網路。

## 部署到 GitHub Pages

### 要上傳哪些檔案

先建立一個乾淨的資料夾，只放下面這些：

```
index.html
.nojekyll
css/
js/
README.md   （可選）
GAPS.md     （可選）
```

這些不用上傳：`新對話提示詞_3D夾娃娃機.md`、`.claude/`、`dev/`（抓取測試用的實驗頁）。

所有路徑都是相對路徑，放在 `https://<帳號>.github.io/<repo 名稱>/` 子路徑下可以正常運作。

### 方法一：用 GitHub 網頁上傳

1. 登入 GitHub，右上角「＋」→「New repository」。
2. Repository name 填英文名稱，例如 `claw-machine`；選「Public」；按「Create repository」。
3. 在新 repo 頁面點「uploading an existing file」。
4. 把乾淨資料夾裡的**所有內容**（不是資料夾本身）拖進網頁，等檔案列表出現 `index.html`、`css/…`、`js/…`。
5. 下方按「Commit changes」。
6. 確認檔案列表有 `.nojekyll`。如果沒有：「Add file」→「Create new file」，檔名輸入 `.nojekyll`，內容留空，按「Commit changes」。
7. 到 repo 的「Settings」→ 左側「Pages」→「Build and deployment」：Source 選「Deploy from a branch」，Branch 選 `main`、資料夾選 `/ (root)`，按「Save」。
8. 等 1～2 分鐘，重新整理 Pages 設定頁，上方會出現網址 `https://<帳號>.github.io/claw-machine/`。

### 方法二：用 GitHub Desktop

1. 安裝並登入 [GitHub Desktop](https://desktop.github.com/)。
2. 「File」→「Add local repository」，選乾淨資料夾。出現「This directory does not appear to be a Git repository」時，點「create a repository」。
3. Name 填英文名稱（例如 `claw-machine`），按「Create repository」。GitHub Desktop 會把資料夾裡的檔案做成第一個 commit。
4. 按上方「Publish repository」，**取消勾選「Keep this code private」**（免費帳號的私人 repo 不能開 Pages），按「Publish repository」。
5. 到 GitHub 網頁上的這個 repo，照方法一的第 7、8 步開啟 Pages。

之後修改檔案：在 GitHub Desktop 左下填說明、按「Commit to main」，再按「Push origin」。

### 更新後玩家看到舊版

GitHub Pages 會讓瀏覽器快取檔案約 10 分鐘。剛更新完，玩家可能載到新舊混雜的檔案而出現錯誤畫面。等 10 分鐘，或請玩家按 <kbd>Ctrl</kbd>＋<kbd>F5</kbd>（Mac 是 <kbd>Cmd</kbd>＋<kbd>Shift</kbd>＋<kbd>R</kbd>）強制重新整理。

## 檔案結構

| 檔案 | 內容 |
|------|------|
| `index.html` | 頁面、HUD、載入失敗提示 |
| `css/style.css` | HUD 版面（桌機、手機直向、手機橫向） |
| `js/main.js` | 啟動、畫面迴圈、debug 參數 |
| `js/config.js` | **所有手感參數**：爪力、滑落機率、甩夾、吊牌、補貨間隔、稀有度權重 |
| `js/game.js` | 錢包、投幣、一局流程、戰利品存檔 |
| `js/claw.js`、`js/claw-shape.js`、`js/swing.js`、`js/hook.js` | 爪子動作、抓取判定、甩夾鐘擺、吊牌勾取 |
| `js/physics.js` | cannon-es 物理世界、固定步長 |
| `js/plush.js`、`js/plush-models.js` | 玩偶生成與 8 種外型 |
| `js/machine.js`、`js/venue.js`、`js/textures.js`、`js/geo.js` | 機台與娃娃機店場景 |
| `js/walker.js` | 人眼高度的走路鏡頭 |
| `js/restock.js` | 不定時補貨 |
| `js/audio.js` | ZzFX 音效與靜音 |
| `js/ui.js` | 鍵盤、搖桿、按鈕、提示、戰利品面板 |
| `js/autotest.js` | debug 自動夾取測試 |

使用的函式庫（jsDelivr，版本固定）：three@0.186.1、cannon-es@0.20.0、zzfx@1.4.0、canvas-confetti@1.9.4。

## 調整難度

手感參數都在 `js/config.js`。調整後用自動測試量夾中率，目前預設值的實測結果寫在 `GAPS.md`。

| 網址參數 | 作用 |
|----------|------|
| `?debug=1` | 顯示 FPS 與玩偶數；補貨間隔縮短為 8～15 秒 |
| `?debug=1&auto=1&fast=1&runs=30` | 自動夾 30 次並快轉，結束後畫面顯示夾中率 |
| `&seed=7` | 固定亂數種子，結果可重現 |
| `&n=20` | 自動測試時機台內的玩偶數 |
| `&mode=uniform` | 改成在隨機位置下爪（預設是瞄準某隻玩偶，誤差 `err=0.7`） |
| `&wait=0` | 不等爪子停穩就下爪 |
| `&set=grab.slipBase:0.065` | 暫時覆寫 `config.js` 裡的參數 |

自動測試在一般模式下不會執行，玩家不帶參數開啟時看不到 debug 資訊。

## 已知限制

沒有驗證到的部分（Safari、實體手機觸控、音效試聽等）與設計取捨，整理在 [GAPS.md](GAPS.md)。

## 授權

[MIT License](LICENSE)。歡迎 fork、修改、拿去教學或做成自己的版本，保留授權聲明即可。

使用的第三方函式庫各自採用原本的授權：three.js（MIT）、cannon-es（MIT）、ZzFX（MIT）、canvas-confetti（ISC）。
