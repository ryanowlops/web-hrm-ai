@echo off
chcp 65001 >nul
title Web HRM AI - chay full du an
cd /d %~dp0

echo ==========================================
echo   WEB HRM AI - tu tai code va chay du an
echo ==========================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Git. Hay cai Git roi chay lai file nay.
  pause
  exit /b 1
)

if exist "web-hrm-ai\.git" (
  echo Da co code - cap nhat ban moi nhat...
  cd /d web-hrm-ai
  git pull --ff-only
) else (
  echo Dang tai code du an tu GitHub...
  git clone https://github.com/ryanowlops/web-hrm-ai.git
  if errorlevel 1 (
    echo [LOI] Tai code that bai. Kiem tra mang roi thu lai.
    pause
    exit /b 1
  )
  cd /d web-hrm-ai
)

call run.bat
