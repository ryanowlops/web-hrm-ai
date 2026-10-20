@echo off
chcp 65001 >nul
title Web HRM AI - chay du an + mo link cong khai
cd /d %~dp0

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo Chua co cloudflared - dang cai dat bang winget...
  winget install -e --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements
)

echo Dang khoi dong du an (backend + frontend) o cua so rieng...
where python >nul 2>nul && (start "HRM Server" /min python start.py) || (start "HRM Server" /min py start.py)

echo Cho server san sang (25 giay)...
timeout /t 25 /nobreak >nul

echo.
echo ==========================================================
echo  Link cong khai se hien o dong "trycloudflare.com" ben duoi.
echo  Giu nguyen cua so nay khi dang xem web. Dong cua so = tat link.
echo ==========================================================
echo.
cloudflared tunnel --url http://localhost:5173
pause
