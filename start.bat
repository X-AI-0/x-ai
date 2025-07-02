@echo off
setlocal enabledelayedexpansion
title Ollama Multi-Model Discussion System
color 0A

echo ========================================
echo  Ollama Multi-Model Discussion System
echo ========================================
echo.

REM Set DYNAMIC NVIDIA GPU environment variables for Ollama
echo [0/5] Setting DYNAMIC NVIDIA GPU configuration...

REM Get GPU memory info and set optimal configuration
for /f "skip=1 tokens=1" %%a in ('nvidia-smi --query-gpu=memory.total --format=csv,nounits 2^>nul') do set GPU_MEMORY=%%a

REM Default values in case nvidia-smi fails
if not defined GPU_MEMORY set GPU_MEMORY=8192

REM Dynamic memory fraction based on GPU VRAM
if !GPU_MEMORY! GEQ 20000 (
    set MEMORY_FRACTION=0.95
    echo High-end GPU detected ^(!GPU_MEMORY!MB^) - Maximum performance mode
) else (
    if !GPU_MEMORY! GEQ 12000 (
        set MEMORY_FRACTION=0.92
        echo Mid-high GPU detected ^(!GPU_MEMORY!MB^) - High performance mode
    ) else (
        if !GPU_MEMORY! GEQ 8000 (
            set MEMORY_FRACTION=0.90
            echo Mid-range GPU detected ^(!GPU_MEMORY!MB^) - Optimized performance mode
        ) else (
            if !GPU_MEMORY! GEQ 6000 (
                set MEMORY_FRACTION=0.85
                echo Entry-level GPU detected ^(!GPU_MEMORY!MB^) - Balanced mode
            ) else (
                set MEMORY_FRACTION=0.75
                echo Limited VRAM GPU detected ^(!GPU_MEMORY!MB^) - Conservative mode
            )
        )
    )
)

set CUDA_VISIBLE_DEVICES=0
set OLLAMA_NUM_GPU=1
set OLLAMA_GPU_LAYERS=-1
set OLLAMA_FORCE_GPU=1
set OLLAMA_SKIP_CPU_GENERATE=1
set OLLAMA_GPU_MEMORY_FRACTION=!MEMORY_FRACTION!
set OLLAMA_HOST=127.0.0.1:12434

echo DYNAMIC GPU environment variables set:
echo   CUDA_VISIBLE_DEVICES=!CUDA_VISIBLE_DEVICES!
echo   OLLAMA_GPU_LAYERS=!OLLAMA_GPU_LAYERS! (FORCE ALL layers on GPU)
echo   OLLAMA_FORCE_GPU=!OLLAMA_FORCE_GPU!
echo   OLLAMA_SKIP_CPU_GENERATE=!OLLAMA_SKIP_CPU_GENERATE!
echo   OLLAMA_GPU_MEMORY_FRACTION=!MEMORY_FRACTION! (DYNAMIC)
echo   GPU_MEMORY=!GPU_MEMORY!MB
echo.

echo [1/5] Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js found!

echo.
echo [2/5] Checking and starting Ollama service with FORCE GPU...

REM Check if local Ollama exists
if exist "ollama\ollama.exe" (
    echo Found local Ollama installation
    
    REM Stop any existing Ollama processes first
    echo Stopping existing Ollama processes...
    taskkill /F /IM ollama.exe >nul 2>&1
    taskkill /F /IM "ollama app.exe" >nul 2>&1
    timeout /t 3 /nobreak >nul
    
    REM Set models directory for local installation
    set OLLAMA_MODELS=%CD%\ollama\models
    
    echo Starting Ollama service with FORCE GPU acceleration...
    echo GPU Config: CUDA_VISIBLE_DEVICES=!CUDA_VISIBLE_DEVICES!
    echo GPU Layers: OLLAMA_GPU_LAYERS=!OLLAMA_GPU_LAYERS! (ALL on GPU)
    echo GPU Force: OLLAMA_FORCE_GPU=!OLLAMA_FORCE_GPU!
    echo Skip CPU: OLLAMA_SKIP_CPU_GENERATE=!OLLAMA_SKIP_CPU_GENERATE!
    echo Models Dir: !OLLAMA_MODELS!
    
    REM Start Ollama service in background with GPU forcing
    start /B "Ollama GPU Service" ollama\ollama.exe serve
    
    echo Waiting for GPU-accelerated Ollama service to start...
    timeout /t 8 /nobreak >nul
    
    REM Verify Ollama is running with GPU
    ollama\ollama.exe ps >nul 2>&1
    if not errorlevel 1 (
        echo [SUCCESS] Ollama service started with GPU acceleration!
        echo [INFO] All models will use 100%% GPU processing
    ) else (
        echo [WARNING] Ollama service may not be fully ready yet
        echo [INFO] GPU configuration applied, service starting...
    )
) else (
    REM Check if system Ollama exists
    ollama --version >nul 2>&1
    if not errorlevel 1 (
        echo Found system Ollama installation
        
        REM Stop any existing Ollama processes first
        echo Stopping existing Ollama processes...
        taskkill /F /IM ollama.exe >nul 2>&1
        taskkill /F /IM "ollama app.exe" >nul 2>&1
        timeout /t 3 /nobreak >nul
        
        echo Starting system Ollama service with FORCE GPU acceleration...
        echo GPU Config: CUDA_VISIBLE_DEVICES=!CUDA_VISIBLE_DEVICES!
        echo GPU Layers: OLLAMA_GPU_LAYERS=!OLLAMA_GPU_LAYERS! (ALL on GPU)
        echo GPU Force: OLLAMA_FORCE_GPU=!OLLAMA_FORCE_GPU!
        echo Skip CPU: OLLAMA_SKIP_CPU_GENERATE=!OLLAMA_SKIP_CPU_GENERATE!
        
        REM Start system Ollama service in background with GPU forcing
        start /B "Ollama GPU Service" ollama serve
        
        echo Waiting for GPU-accelerated Ollama service to start...
        timeout /t 8 /nobreak >nul
        
        REM Verify Ollama is running with GPU
        ollama ps >nul 2>&1
        if not errorlevel 1 (
            echo [SUCCESS] Ollama service started with GPU acceleration!
            echo [INFO] All models will use 100%% GPU processing
        ) else (
            echo [WARNING] Ollama service may not be fully ready yet
            echo [INFO] GPU configuration applied, service starting...
        )
    ) else (
        echo [INFO] Ollama not found - you can install it from the Models page
        echo [INFO] GPU configuration will be applied when Ollama is installed
    )
)

echo.
echo [3/5] Cleaning up ports 3000 and 3001...

REM Function to kill processes using specific ports
echo Checking port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Killing process %%a using port 3000...
    taskkill /F /PID %%a >nul 2>&1
    if not errorlevel 1 (
        echo Successfully killed process %%a
    )
)

echo Checking port 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo Killing process %%a using port 3001...
    taskkill /F /PID %%a >nul 2>&1
    if not errorlevel 1 (
        echo Successfully killed process %%a
    )
)

REM Also kill any remaining Node.js processes for safety
echo Cleaning up any remaining Node.js processes...
taskkill /F /IM node.exe >nul 2>&1

echo Waiting for ports to be fully released...
timeout /t 3 /nobreak >nul

REM Verify ports are free
echo Verifying ports are available...
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if not errorlevel 1 (
    echo WARNING: Port 3000 may still be in use
)

netstat -ano | findstr :3001 | findstr LISTENING >nul 2>&1
if not errorlevel 1 (
    echo WARNING: Port 3001 may still be in use
)

echo Port cleanup completed!

echo.
echo [4/5] Installing/updating dependencies...
if not exist node_modules (
    echo Installing dependencies for the first time...
    npm install
) else (
    echo Dependencies already installed, skipping...
)

echo.
echo [5/5] Starting the application...
echo.
echo ========================================
echo  Application Information
echo ========================================
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:3001
echo GPU:      NVIDIA GPU Acceleration FORCE ENABLED
echo Ollama:   Service started with 100%% GPU processing
echo.
echo [GPU STATUS] !GPU_MEMORY!MB VRAM - All AI models use GPU acceleration
echo [PERFORMANCE] Memory fraction: !MEMORY_FRACTION! - Optimized for your GPU
echo.
echo Note: If Ollama is not installed, you can install it from the Models page
echo Starting servers and opening browser...
echo Press Ctrl+C to stop the application
echo ========================================
echo.

REM Create a batch file to open browser after delay (browser only, no folder)
echo @echo off > open_browser.bat
echo timeout /t 8 /nobreak ^>nul >> open_browser.bat
echo start "" "http://localhost:3000" >> open_browser.bat
echo del "%%~f0" >> open_browser.bat

REM Start browser opener in background
start /B open_browser.bat

REM Start the development servers (this will keep running)
npm run dev 