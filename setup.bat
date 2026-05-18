@echo off
cd /d "C:\Users\DELL\OneDrive\Documents\WinD\Dự án AI find Video\find-app"

REM Create directories
mkdir app\api\auth\tiktok\callback
mkdir app\api\auth\meta\callback
mkdir app\api\auth\youtube\callback

REM Verify creation
echo Directories created. Now run: node create-oauth-routes.js
