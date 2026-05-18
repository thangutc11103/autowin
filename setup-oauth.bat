@echo off
REM OAuth Routes Setup Script
REM This script creates all OAuth route files and directories

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo Creating OAuth directories...
mkdir app\api\auth\tiktok\callback 2>nul
mkdir app\api\auth\meta\callback 2>nul
mkdir app\api\auth\youtube\callback 2>nul

echo.
echo OAuth directories created successfully!
echo.
echo Now running Node script to create route files...
echo.

node create-oauth-routes.js

echo.
echo Done! All OAuth routes have been created.
echo.
pause
