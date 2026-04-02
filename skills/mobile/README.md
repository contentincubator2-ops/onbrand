# @sowork/mobile

此目錄為 SoWork React Native Mobile 應用的獨立 package。

## 狀態

🚧 **原型階段** — 尚未進入開發

## 背景

- P1-C (QUAL): Mobile 程式碼已從 `client/src/mobile/` 遷移至此獨立 package
- 原 `client/tsconfig.json` 將 `src/mobile` 排除在外，因為 React Native 需要獨立的 tsconfig 與工具鏈
- 此 package 使用獨立的 `tsconfig.json`，不依賴 web client 的 Vite/React DOM 設定

## 開發指南

未來 React Native 開發時：
1. 在此目錄下執行 `npm install`
2. 使用 `npx expo` 或 `npx react-native` 啟動開發環境
3. 共用的業務邏輯放在 `../../shared/` 目錄

## 目錄結構（規劃中）

```
skills/mobile/
├── src/
│   ├── screens/       # 畫面元件
│   ├── components/    # 共用 UI 元件
│   ├── navigation/    # React Navigation 設定
│   ├── hooks/         # React hooks
│   └── index.ts       # 入口
├── package.json
├── tsconfig.json
└── README.md
```
