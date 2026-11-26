# TagScanner

[開啟網站](https://robin840211.github.io/tagscanner/)

TagScanner 使用瀏覽器相機或圖片辨識常用條碼與定位標記（ArUco、AprilTag）。辨識在目前裝置內執行，不需要上傳影像。

## 目前功能

- 兩種模式：「掃碼」（QR 與各式條碼）與「定位標記」（ArUco、AprilTag）
- 手機與電腦相機即時掃描；後鏡頭優先，前後鏡頭以單一按鈕切換（依瀏覽器回報的 `facingMode`），電腦鏡頭可從清單選擇
- 支援時顯示手電筒控制
- 圖片辨識：選擇檔案、拖放或直接貼上（Ctrl+V）
- QR Code、Data Matrix、Aztec、PDF417；Micro QR／rMQR 可於「進階 → 包含少見格式」開啟
- EAN-8、EAN-13、UPC-A、UPC-E
- Code 39、Code 93、Code 128、Codabar、ITF；DataBar（RSS）可於「進階」開啟
- 格式範圍可選全部、僅 QR 或僅一維條碼；掃描中切換模式相機保持開啟
- 支援旋轉、反相與具足夠色彩對比的條碼
- 依內容類型顯示結果：網址、Wi‑Fi（密碼預設遮蔽）、電話、Email、簡訊、地點、聯絡人、商品條碼，並提供對應的開啟或複製動作
- 畫面有多個條碼或標記時，點選框線即可查看該項
- 暫停畫面：凍結目前影格重新完整辨識，並顯示所有標記 ID
- 定位標記即時清單，可複製四角座標（JSON）或 OpenCV Python 偵測範例
- 即時畫面的 ID 標籤：手機最多 3 個、桌面最多 12 個，過小的標記只畫框；暫停畫面與圖片顯示全部
- 四角辨識邊界疊圖；標記離開畫面後框線自動消失；選取中的項目以橘色標示
- 工作階段最近 100 筆掃描紀錄，可匯出 CSV 或 JSON，清除後可復原；持續出現的同一標記保留一筆
- 響應式版面；手機直向時結果與紀錄位於可展開的底部面板

定位標記模式可開啟工具列的「標示方向」，以箭頭標出標記上方。AprilTag 以官方 apriltag-imgs 的方向為準，與 OpenCV 產生圖的方向相差 180°。

ArUco 支援 `DICT_4X4_50/100/250/1000`、`DICT_5X5_50/100/250/1000`、`DICT_ARUCO_ORIGINAL` 與 `DICT_ARUCO_MIP_36h12`。AprilTag 支援 `DICT_APRILTAG_36h11`。

辨識 ChArUco 棋盤時，選擇「定位標記」與棋盤使用的字典，即可讀取各標記的 ID 和四角位置。4×4、5×5 表示標記內部的資料格數；50、100、250、1000 表示字典容量。相同格數的這四組字典共用前段 ID，已知產生設定時選用相同容量。

## 隱私

- 相機串流只提供給目前瀏覽器分頁。
- 選擇的圖片使用裝置內部暫存網址處理。
- 掃描內容預設只保留在目前工作階段。
- 不包含分析追蹤、帳號系統或遠端資料庫。
- 掃描到網址時不會自動開啟，且只允許明確開啟 HTTP／HTTPS 網址。

## 瀏覽器需求

- GitHub Pages 或其他 HTTPS 靜態網站
- 支援 MediaDevices.getUserMedia() 的瀏覽器
- 本機開發可使用 localhost

相機、手電筒、鏡頭標籤與安裝功能會依瀏覽器和裝置有所差異。沒有相機或相機權限時，仍可使用圖片辨識。

ArUco 標記需要完整黑色外框與足夠留白；列印、反光、傾斜和低光會影響辨識結果。

AprilTag 需使用 tag36h11 家族；其他家族即使外觀相近也不會得到正確結果。

## 本機使用

需要 Node.js 24 以上版本。

    npm ci
    npm run dev

開啟 http://localhost:3000。

### 區網與手機測試

    .\scripts\serve-local.ps1           # 建置後以 http://127.0.0.1:4173/ 啟動，允許區網連入
    .\scripts\serve-local.ps1 -Https    # 自簽 HTTPS，區網手機才能使用相機

瀏覽器只在 HTTPS 或 localhost 下提供相機。`-Https` 會以 openssl（Git for Windows 內附）產生含本機區網 IP 的自簽憑證，首次開啟需手動接受警告。其他選項：`-NoBuild`、`-LocalOnly`、`-Port`。也可直接執行 `npm start` 提供現有的 out。

## 驗證

    npm run lint
    npm run typecheck
    npm test
    npm run build

靜態輸出位於 out。

## GitHub Pages

正式網站為 https://robin840211.github.io/tagscanner/。推送 `main` 後，Deploy GitHub Pages workflow 會驗證、建置並自動發布；也可在 Actions 頁面手動執行（Run workflow）。

### 在自己的 repo 發布

1. 將 repository 建立為公開 repository。
2. 推送 main 分支。
3. 在 repository 的 **Settings → Pages** 將 Source 設為 **GitHub Actions**。
4. Deploy GitHub Pages workflow 會驗證、建置並發布 out。
5. Repository Pages 會使用 https://&lt;owner&gt;.github.io/&lt;repository&gt;/。
6. &lt;owner&gt;.github.io repository 會自動改用網站根路徑。

如使用自訂網域，在 repository 的 Actions variable 新增 SITE_URL，值為完整 HTTPS 網址；例如 https://scanner.example.com/。

## 授權

TagScanner 使用 [MIT License](LICENSE)。第三方套件授權列於 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
