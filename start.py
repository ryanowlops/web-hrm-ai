#!/usr/bin/env python3
"""Chạy Web HRM AI bằng 1 lệnh duy nhất (Windows / macOS / Linux).

    python start.py        (Windows)
    python3 start.py       (macOS / Linux)

Script tự làm hết:
  1. Tạo môi trường ảo Python cho server/ và cài thư viện (lần đầu).
  2. Cài node_modules cho client/ (lần đầu).
  3. Tạo database + dữ liệu mẫu (seed, chạy lại an toàn).
  4. Chạy Flask (cổng 5000) và React/Vite (cổng 5173) song song.
  5. Mở trình duyệt vào http://localhost:5173 — Ctrl+C để dừng cả hai.

Yêu cầu máy: Python 3.10+, Node.js 18+.
"""
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(ROOT, "server")
CLIENT = os.path.join(ROOT, "client")
IS_WIN = os.name == "nt"

VENV = os.path.join(SERVER, ".venv")
VENV_PY = os.path.join(VENV, "Scripts" if IS_WIN else "bin",
                       "python.exe" if IS_WIN else "python")
NPM = "npm.cmd" if IS_WIN else "npm"

FE_URL = "http://localhost:5173"
BE_HEALTH = "http://localhost:5000/api/v1/health"


def step(msg):
    print(f"\n=== {msg} ===", flush=True)


def run(cmd, cwd=None, check=True):
    print("+", " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=cwd, check=check)


def ensure_python_env():
    step("1/4  Môi trường Python cho backend")
    if not os.path.exists(VENV_PY):
        run([sys.executable, "-m", "venv", VENV])
    run([VENV_PY, "-m", "pip", "install", "-q", "-r",
         os.path.join(SERVER, "requirements.txt")])


def ensure_node_modules():
    step("2/4  Thư viện cho frontend")
    if shutil.which(NPM) is None:
        print("!! Không tìm thấy Node.js/npm. Hãy cài Node.js 18+ rồi chạy lại.")
        sys.exit(1)
    if not os.path.isdir(os.path.join(CLIENT, "node_modules")):
        run([NPM, "install"], cwd=CLIENT)
    else:
        print("node_modules đã có, bỏ qua npm install.")


def seed_database():
    step("3/4  Tạo database + dữ liệu mẫu")
    run([VENV_PY, "seed.py"], cwd=SERVER)


def wait_health(url, timeout=40):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(1)
    return False


def main():
    ensure_python_env()
    ensure_node_modules()
    seed_database()

    step("4/4  Khởi động Flask (5000) + React (5173)")
    procs = []
    try:
        flask = subprocess.Popen([VENV_PY, "run.py"], cwd=SERVER)
        procs.append(flask)
        vite = subprocess.Popen(
            [NPM, "run", "dev", "--", "--port", "5173", "--host"],
            cwd=CLIENT,
        )
        procs.append(vite)

        if wait_health(BE_HEALTH):
            print("\nBackend đã sẵn sàng:", BE_HEALTH)
        else:
            print("\n!! Backend chưa phản hồi sau 40s — xem log Flask ở trên.")

        print(f"""
----------------------------------------------------------
  WEB HRM AI đang chạy:  {FE_URL}
  Trang tuyển dụng:      {FE_URL}/jobs

  Tài khoản demo:
    Admin     admin@hrm.local    / Admin@123
    HR        hr@hrm.local       / Hr@12345
    Manager   manager@hrm.local  / Manager@123
    Employee  employee@hrm.local / Employee@123

  Nhấn Ctrl+C để dừng cả backend + frontend.
----------------------------------------------------------
""", flush=True)
        try:
            webbrowser.open(FE_URL)
        except Exception:
            pass

        while all(p.poll() is None for p in procs):
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nĐang dừng hệ thống...")
    finally:
        for p in procs:
            try:
                p.terminate()
            except Exception:
                pass
        for p in procs:
            try:
                p.wait(timeout=5)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass
    print("Đã dừng. Hẹn gặp lại anh!")


if __name__ == "__main__":
    main()
