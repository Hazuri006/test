@echo off
REM Lance ScreenChat sous Windows : cree l'environnement virtuel au premier demarrage.
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (set PY=py -3) else (set PY=python)

if not exist ".venv\Scripts\python.exe" (
    echo Premier demarrage : installation des dependances...
    %PY% -m venv .venv || goto :error
    ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt || goto :error
)

".venv\Scripts\python.exe" -m screenchat
if %errorlevel% neq 0 goto :error
exit /b 0

:error
echo.
echo ScreenChat n'a pas pu demarrer. Verifie que Python 3.10+ est installe.
pause
exit /b 1
