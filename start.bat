@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 没有找到 node。请先安装 Node.js 18 以上版本，或直接用 pnpm/npm 跑：
  echo   pnpm install ^& pnpm dev
  pause
  exit /b 1
)

start "" http://127.0.0.1:5178/
node server.mjs
pause
