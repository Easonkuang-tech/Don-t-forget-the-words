@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist node_modules (
  echo 首次运行，正在安装依赖...
  call npm install
  if errorlevel 1 goto error
)

call npm run local
exit /b %errorlevel%

:error
echo.
echo 启动失败。请确认已安装 Node.js 20 或更高版本。
pause
exit /b 1
