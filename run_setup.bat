@echo off
REM Change to project directory
cd /d "C:\Users\DELL\OneDrive\Documents\WinD\Dự án AI find Video\find-app"

REM Run the bash script using Git Bash or WSL
if exist "C:\Program Files\Git\bin\bash.exe" (
    echo Running with Git Bash...
    "C:\Program Files\Git\bin\bash.exe" -i create_oauth_routes.sh
) else if exist "C:\Program Files\Git\usr\bin\bash.exe" (
    echo Running with Git Bash (alternate path)...
    "C:\Program Files\Git\usr\bin\bash.exe" -i create_oauth_routes.sh
) else (
    echo Neither Git Bash nor standard bash found.
    echo Please run manually:
    echo   bash create_oauth_routes.sh
)

pause
