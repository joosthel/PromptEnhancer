@echo off
REM PromptEnhancer — one-click launcher (Windows)

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed. Download it from https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

if not exist ".env.local" (
    echo.
    echo No .env.local file found.
    echo Create one with your OpenRouter API key:
    echo.
    echo   echo OPENROUTER_API_KEY=sk-or-v1-... ^> .env.local
    echo.
    echo Get a key at https://openrouter.ai
    pause
    exit /b 1
)

echo.
echo Starting PromptEnhancer on http://localhost:3000 ...
echo.

start "" http://localhost:3000
call npm run dev
