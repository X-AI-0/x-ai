@echo off
title Port Cleanup Tool
color 0C

echo ========================================
echo  Port Cleanup Tool (3000 & 3001)
echo ========================================
echo.

echo This script will forcefully kill all processes using ports 3000 and 3001
echo.
pause

echo.
echo Starting port cleanup...
echo.

REM Kill processes using port 3000
echo [1/4] Checking port 3000...
set "found3000=false"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
    set "found3000=true"
    echo Found process %%a using port 3000
    taskkill /F /PID %%a >nul 2>&1
    if not errorlevel 1 (
        echo ✓ Successfully killed process %%a
    ) else (
        echo ✗ Failed to kill process %%a
    )
)
if "%found3000%"=="false" (
    echo ✓ Port 3000 is already free
)

echo.
echo [2/4] Checking port 3001...
set "found3001=false"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :3001 ^| findstr LISTENING') do (
    set "found3001=true"
    echo Found process %%a using port 3001
    taskkill /F /PID %%a >nul 2>&1
    if not errorlevel 1 (
        echo ✓ Successfully killed process %%a
    ) else (
        echo ✗ Failed to kill process %%a
    )
)
if "%found3001%"=="false" (
    echo ✓ Port 3001 is already free
)

echo.
echo [3/4] Cleaning up Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
if not errorlevel 1 (
    echo ✓ Killed remaining Node.js processes
) else (
    echo ✓ No Node.js processes found
)

echo.
echo [4/4] Waiting for ports to be released...
timeout /t 3 /nobreak >nul

echo.
echo Final verification:
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    echo ✓ Port 3000 is free
) else (
    echo ✗ Port 3000 is still in use
)

netstat -ano | findstr :3001 | findstr LISTENING >nul 2>&1
if errorlevel 1 (
    echo ✓ Port 3001 is free
) else (
    echo ✗ Port 3001 is still in use
)

echo.
echo ========================================
echo  Cleanup completed!
echo ========================================
echo.
echo You can now run start.bat to start the application.
echo.
pause 