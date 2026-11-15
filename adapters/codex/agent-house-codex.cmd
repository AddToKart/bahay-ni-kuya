@echo off
rem Agent House adapter for codex-cli hooks (verified against codex-cli 0.166.0).
rem stdin (the hook JSON payload) is inherited by powershell; stdout is never written.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0agent-house-codex.ps1" >nul 2>nul
exit /b 0
