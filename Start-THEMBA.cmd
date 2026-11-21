@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0run-investor.ps1" Preview
if errorlevel 1 pause
