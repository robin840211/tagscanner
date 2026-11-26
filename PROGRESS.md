# Progress

詳細開發紀錄保留在 git 歷史；此檔只記錄目前狀態與待辦。

## Current objective

可直接發布到 GitHub Pages 的跨裝置 TagScanner：QR、一般條碼、ArUco 與 tag36h11 AprilTag，全部在瀏覽器本機辨識。

### Printed tag dictionary extension

- 使用者授權：辨識六張照片並擴充網頁所需字典；本階段本機實作、驗證與 commit。
- OpenCV 4.11 零位元修正比對：照片 5283 為 4×4 ID 0–16；5284 為 5×5 ID 0–26；5285 為 AprilTag 36h11 ID 0–19；5286 為 36h11 ID 0；5287 為 5×5 ID 3；5288 為 4×4 ID 0–34。4×4/5×5 的 50/100/250/1000 字典共享這些 ID，照片無法唯一反推容量。
- 分工：Codex 負責字典引擎、UI 整合與六張照片測試；Claude Fable 負責方案確認、Opus 負責獨立審查（皆唯讀）。
- Claude 工作包 94e547f9c97a37c8fa11ab9ecdbdae3a：OAuth session expired，未觀測到回答模型，gate INCOMPLETE；已請使用者重新登入。證據：D:/AgentData/claude-bridge/state/jobs/94e547f9c97a37c8fa11ab9ecdbdae3a/。
- 現有 aruco-rs 0.1.0 實測拒絕 4×4/5×5 字典；新增本機 OpenCV.js worker 處理這兩組字典，保留 Original/MIP 與 AprilTag 既有辨識路徑。照片只作本機驗證，不加入公開 repo。
- 使用者追加：畫面 Tag 數量 1–3 時框邊顯示 ID，超過 3 個僅畫框。
- Fable 方案確認 1bb7a7851000607522154c65ec3254f3，session d77956fd-9c1a-4fca-8153-3e75f2945521，實際 claude-fable-5-2，gate PASS。額度官方觀測 2026-11-26 08:31 UTC 七日 16%，overage disabled。
- Opus 分析 c7e9a30c4cd95d4e5251465aae3b3485，session ef668c35-df19-43d8-95cf-8f93e3ac1fb6，最後回答 claude-opus-5-5（另觀測 haiku 子工作），因未執行而 INCOMPLETE；主控另實測其判位差異假設。OpenCV 5 預設 validBitIdThreshold 0.49 時照片 6 漏 ID 8；同像素、原尺寸設 0.5 可完整 35 個。最終採單次、多數判位，移除放大取樣實驗；不提高 Hamming 容錯。
- Next 16.4.3 建置因已公告漏洞中止，更新 Next/eslint-config-next 至 16.4.6，lint、typecheck、相關 18 項測試及 /tagscanner 靜態建置通過。audit 尚有 7 個 moderate 開發工具相依告警，與新增 OpenCV 無關。
- 照片實測與六張 ID 00/01 參考 PNG、漏讀位置截圖保留於 outputs/tag-photo-verification.json、outputs/tag-reference/、outputs/missing-tag-id08.jpg；照片與產物均不加入公開 Git。
- Claude Opus 獨立審查負責最終 diff，Codex 同時完成瀏覽器操作驗證；審查期間凍結來源檔。
- Fable 補審 0d2f5d7aa9f9ca0e793054619c77cce2（同 session、實際 claude-fable-5-2）PASS，接受 0.5 判位相容修正與因果說明邊界。
- 初次 review 803595d5a6ef3cababf90d7c5c737dcf 因快照超過 200000 bytes 未啟動模型；縮小快照後 6ffdb80c9832838f9a68a3b196410862，session bd7b09f3-4de3-4ce7-96c0-a3f030dccc5a，實際 claude-opus-5-5 提出換行、字典切換重載與離線資產問題。已恢復原始 LF、共用 OpenCV worker、補齊 OpenCV 預快取，並維持 Original/MIP 960 邊長；新增共用 worker 字典切換測試通過。
- 瀏覽器：六張原尺寸照片分別精確解出 17/27/20/1/1/35 個；3 個標記顯示 ID、4 個只畫框；實拍 ID3 框邊標字正常；AprilTag 00/01 參考圖以實際 AprilTag worker 解出正確 ID；1280×720 無頁面溢出、console 無錯誤。這是照片／瀏覽器證據，尚未重新測實機相機。
- 最終 Opus 複審 8db12e8fc9c51d77bdb13b259f62ad88（同 review session、實際 claude-opus-5-5）gate PASS、無 findings。最終 lint、typecheck、19 項相關測試及 Next 16.4.6 靜態建置通過；本階段提交本機，不 push。

### UI redesign（branch feat/ui-redesign，worktree D:/GitProject/tagscanner-ui）

- 使用者確認整體方向：模式改為「掃碼／定位標記」兩類、依內容類型的結果卡、標記即時清單、暫停畫面、拖放／貼上圖片、手機底部抽屜、用語統一。相機維持「使用者按下才開」，不自動開啟。
- 標記 ID 標籤：即時畫面手機上限 3、桌面 12，太小（短邊 < 28px）不標；暫停畫面與圖片顯示全部。全部 ID 另列於右側／抽屜清單，可點選高亮。
- 分工：Sonnet 子代理實作 `app/payload-parser.ts`（30 項測試，cherry-pick 979807c）；Opus 唯讀評估解碼穩定度；主 session 實作介面、整合與瀏覽器驗證；Opus 獨立審查最終 diff。
- 解碼評估（僅評估，本輪不改）：彩色／反相／傾斜處理穩定、無正確性問題。建議小修：ITF/Codabar/Code39 也要求連續 2 次才記錄、一般影格交替跑反相與通道 pass 降低閒置成本、疊圖過期改為依解碼時間、減少每影格 ImageData 複製；實機耗時與發票 Big5 編碼待驗證。
- 本機測試：`scripts/serve-local.ps1`（預設 0.0.0.0:4173，`-Https` 產生含區網 IP 的自簽憑證供手機相機使用）。本機預設 Node 為 v20 可建置；vitest 需 Node 24。
- Opus 獨立審查：無高嚴重度問題，10 項中低問題全數修正——失敗鏡頭改回預設避免無法重試、相機錯誤保留 live region 朗讀、手機單欄改純 media query（hydration 前不擠壓）、本機伺服器讀檔錯誤不崩潰與憑證到期自動重建、復原紀錄合併期間新掃描、`tel:` 的 `#` 編碼、WPA2-EAP 加密顯示、PowerShell 啟動腳本還原目錄與環境變數、停止相機後焦點移至開啟按鈕。
- 驗證：lint、typecheck、110 項測試、靜態建置通過；啟動腳本實測 HTTPS（含區網 IP 憑證）、重建期間伺服器不中斷；瀏覽器以合成圖片與模擬相機串流驗證 1280×800 與 375×812 的掃碼、選取、標記清單、暫停與標籤上限。尚未在實機相機測試。

## Status

- 網站：https://robin840211.github.io/tagscanner/ ；單一 repo `robin840211/tagscanner`，推送 `main` 會由 Deploy GitHub Pages workflow 驗證（lint、typecheck、test、build）並發布。
- 舊發布 repo 已改名 `tagscanner-publisher-old` 並封存，舊網址 `/AnyTagScanner/` 已失效。
- 本次驗證：lint、typecheck、19 項相關測試及靜態建置；`npm audit` 尚有 7 個 moderate 開發工具相依告警。
- 解碼：zxing-wasm（Web Worker）處理 QR／條碼，OpenCV.js（Web Worker）處理 ArUco 4×4/5×5，aruco-rs（WASM）處理 Original/MIP，AprilTag 使用固定上游 commit 的 WASM；皆為本機資產。
- 即時掃描：共用相機串流切換模式不重開鏡頭、350ms 疊圖過期、持續出現的同一標記只保留一筆歷史、停止／背景／卸載時釋放相機。
- PWA：manifest、正式圖示（any／maskable）、apple-touch-icon、favicon、社群預覽圖（`og.png`）與離線 Service Worker。
- 依賴策略：Dependabot 每週檢查；刻意保留 eslint 9、TypeScript 6.0、@types/node 24，升級前需確認相容性。
- GitHub 設定：Dependabot 安全更新、secret scanning 與 push protection、Private vulnerability reporting 已啟用。

## Next

- 後續可評估 6×6/7×7 ArUco 與其他 AprilTag 字典。
- 建立真實手機（Android／iPhone）、列印標記、透視與低光測試集；實機相機權限、背景返回與 FPS 尚待驗證。
- 在 GitHub Settings → General 手動上傳社群預覽圖（可使用 `public/og.png`，API 無法設定）。
- Service Worker 對 `public/vendor/*` 等非雜湊資產採 cache-first，更新後需遞增 `CACHE_NAME`；可改為 stale-while-revalidate。

## Acceptance direction

- GitHub Pages 專案子路徑下所有靜態資產正確載入。
- 相機在停止、離開前景與元件卸載時釋放。
- 不自動上傳或持久保存影像與掃描內容。
- 清晰 QR 與常見條碼可在手機及桌面瀏覽器完成辨識。
- 合成 ArUco 與 tag36h11 AprilTag 可由 WASM 引擎解碼，且不連線第三方 CDN。

## Version footer and dependency PRs

- User requests: inspect/handle Dependabot PRs; add automatic seven-character Git hash and source date plus repository/Issues links in a small footer. Latest steering prioritizes UI; leave PRs alone only if they already merge automatically.
- Baseline main/origin/main 0e631c4, clean tree. PRs 12 (Tailwind 4.3.5), 15 (zxing-wasm 3.1.7), 16 (Vitest 5.1.1) have successful CI and no autoMergeRequest.
- Ownership: Codex implements footer/build metadata and integrates PRs; Claude Fable read-only plan confirmation 549ae34390a3359cafcb1d19d8595c02, Opus independent final review. No concurrent source writers.
- Claude usage observed 2026-11-26 08:46 UTC seven-day 16%, stale; fresh availability to be confirmed by bounded call.

- Fable plan 549ae34390a3359cafcb1d19d8595c02 PASS; session e8f5659d-ab50-4505-9040-f6fdf5e0269c, actual claude-fable-5-2. Fresh usage 2026-11-26 13:13 UTC seven-day 16%, overage disabled.
- Implemented build-time Git metadata (exact first 7 characters, full commit link, commit date in Asia/Taipei; Git-less builds show build date), responsive footer with GitHub/Issues links. No client-side metadata request or workflow secret needed.
- Independent Opus review 6d412e4994ed3af6b8e244d72b7bcfbf PASS, no findings; session 8b3db3f0-1b27-42f1-be07-905a7428f1a9, actual claude-opus-5-5. Five metadata tests, targeted lint, typecheck and static build passed. Browser 1920x1080 and 390x844 have matching document dimensions, visible footer and correct hrefs; console clean.
- GitHub connector merge lacked integration permission (403); existing authenticated gh merged PR12 as 774e864. Pages run 45827516789 succeeded. Local main fast-forwarded, npm ci succeeded (existing 7 moderate advisories).
- PR16 remains open: lockfile conflicts after Tailwind merge; optional test-runner update deferred under latest user priority. PR15 remains open: decoder update should accompany service-worker cache revision to refresh fixed asset URLs. No auto-merge settings changed.
- Footer changes are local-only until a later authorized push; each build automatically reads its checked-out commit. Current browser screenshots are local preview evidence.
