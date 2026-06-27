# ONLINETRIGGER — LINE 每日成功心態圖文自動推播

每天早上 **07:00（台北時間）** 由 GitHub Actions 在雲端自動執行：
產生當日成功心態文案 → 用 OpenAI 生成圖片 → 推播到指定 LINE 群組。

**完全雲端、免電腦開機、免 ngrok、免費。**

---

## 運作流程

```
GitHub Actions (cron 23:00 UTC = 07:00 台北)
  │
  ├─ 1. generate.mjs  讀取 data/daily-topic-plan.json 找今日主題
  │                   → OpenAI 生成文案 + 圖片，存到 images/
  │                   → 輸出 out/message.json（含圖片公開網址）
  │
  ├─ 2. git commit & push images/  （讓圖片有公開的 raw 網址）
  │
  └─ 3. send.mjs      輪詢圖片網址直到可讀 → 推播到 LINE
```

圖片透過 `https://raw.githubusercontent.com/<owner>/<repo>/main/images/<檔名>` 對外提供，LINE 直接讀取。

---

## 一次性設定

### 1. 設定 Secrets（機密，存在 GitHub 加密保管）

到 **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**，新增三個：

| Secret 名稱 | 內容 |
|------------|------|
| `OPENAI_API_KEY` | OpenAI API 金鑰 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE 官方帳號 Channel access token |
| `ALLOWED_LINE_TARGET_IDS` | 要推播的群組/使用者 ID（多個用逗號分隔）|

> 這三個值都在本機專案的 `.env.local` 裡，請從那裡複製貼上。**切勿**把 `.env.local` 或金鑰提交到 repo。

### 2.（選用）設定 Variables 調整模型

到同頁面的 **Variables** 分頁，可選擇性覆寫預設值：
`OPENAI_MODEL`、`OPENAI_IMAGE_MODEL`、`OPENAI_IMAGE_QUALITY`、`OPENAI_IMAGE_SIZE`。
不設定就用程式內建預設（`gpt-4.1-mini` / `gpt-image-2` / `medium` / `1024x1024`）。

---

## 每日主題維護

編輯 [`data/daily-topic-plan.json`](data/daily-topic-plan.json)，每個主題用 `date`（`YYYY-MM-DD`）對應當天。
- 當天有對應 `date` → 用該主題
- 沒有對應 → 自動用 Google News 搜尋成功相關新聞當主題
- 都失敗 → 用內建 fallback 文案

改完直接 commit 推上去即可，下次排程就會生效。

---

## 手動補發 / 測試

GitHub repo → **Actions → Daily LINE Push → Run workflow**，
即可立即執行一次（適合當天排程沒跑到、或想臨時測試）。

---

## 排程時間說明

GitHub Actions 的 cron 使用 **UTC**。
本專案設定 `0 23 * * *`（UTC）= **台北時間隔天 07:00**。
> 註：GitHub 排程在尖峰時段可能延遲數分鐘到數十分鐘，屬正常現象；
> 若需精準時間，可改用手動觸發或外部排程呼叫 workflow_dispatch。

---

## 本機測試（選用）

```bash
npm install
# 設定環境變數後
OPENAI_API_KEY=... LINE_CHANNEL_ACCESS_TOKEN=... ALLOWED_LINE_TARGET_IDS=... \
  npm run generate    # 只產生圖片與 out/message.json，不會推播
```

---

## 檔案結構

```
.
├─ .github/workflows/daily-push.yml   # 每日排程
├─ lib/core.mjs                       # 主題解析 + OpenAI 文案/圖片生成
├─ scripts/generate.mjs              # 步驟一：生成
├─ scripts/send.mjs                  # 步驟三：推播
├─ data/daily-topic-plan.json        # 每日主題計畫（人工維護）
├─ images/                           # 自動生成的圖片（自動 commit）
└─ package.json
```
