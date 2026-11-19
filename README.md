# 微光協定

一款把程式指令融入機器人冒險的網頁遊戲原型。在四個關卡中安排前進、循環和條件指令，收集物品並帶小光抵達出口。

## 本機遊玩

直接用瀏覽器開啟 `index.html`，或在專案資料夾啟動任何靜態檔案伺服器。

## 線上遊玩

[在 GitHub Pages 開始遊玩](https://timcsy.github.io/glimmer-protocol-game/)

## 開發知識

- [計畫與路線圖](knowledge/plan.md)
- [開發經驗](knowledge/experience.md)
- [初學者試玩指南](knowledge/playtest-guide.md)
- [待外部支援事項與推薦](knowledge/decision.md)

## 自動檢查

需要 Node.js 內建測試執行器：

```powershell
node --test tests/game.test.js
```

## 發布到 GitHub Pages

專案已包含 GitHub Actions 工作流程 `.github/workflows/pages.yml`。將 `main` 分支推送到 GitHub 後，在儲存庫的 **Settings → Pages → Build and deployment** 將來源設為 **GitHub Actions**。之後每次更新 `main` 都會自動部署。
