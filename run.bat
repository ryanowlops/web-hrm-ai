@echo off
chcp 65001 >nul
cd /d %~dp0
where python >nul 2>nul && (python start.py) || (py start.py)
pause
