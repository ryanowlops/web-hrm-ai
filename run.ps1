# Web HRM AI - tai code va chay full du an bang 1 lenh tren Windows.
# Cach dung: mo PowerShell, dan lenh:
#   irm https://raw.githubusercontent.com/ryanowlops/web-hrm-ai/main/run.ps1 | iex
# Script tu: kiem tra Git/Python/Node -> clone (hoac git pull neu da co) -> chay start.py

function Start-HrmAi {
    $repoUrl = "https://github.com/ryanowlops/web-hrm-ai.git"
    $dir = Join-Path (Get-Location) "web-hrm-ai"

    foreach ($tool in @("git", "node")) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            Write-Host "Chua cai $tool. Hay cai $tool roi chay lai lenh nay." -ForegroundColor Red
            return
        }
    }
    $py = $null
    if (Get-Command python -ErrorAction SilentlyContinue) { $py = "python" }
    elseif (Get-Command py -ErrorAction SilentlyContinue) { $py = "py" }
    else {
        Write-Host "Chua cai Python 3.10+. Hay cai Python roi chay lai lenh nay." -ForegroundColor Red
        return
    }

    if (Test-Path (Join-Path $dir ".git")) {
        Write-Host "Da co code, cap nhat ban moi nhat..." -ForegroundColor Cyan
        Set-Location $dir
        git pull --ff-only
    } else {
        Write-Host "Dang tai code du an..." -ForegroundColor Cyan
        git clone $repoUrl $dir
        if (-not (Test-Path (Join-Path $dir ".git"))) {
            Write-Host "Tai code that bai. Kiem tra mang roi thu lai." -ForegroundColor Red
            return
        }
        Set-Location $dir
    }

    Write-Host "Khoi dong du an (backend + frontend)..." -ForegroundColor Green
    & $py start.py
}

Start-HrmAi
