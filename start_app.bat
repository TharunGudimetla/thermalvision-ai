@echo off
title Thermal Pedestrian Surveillance System
cd /d "%~dp0"

echo =====================================================================
echo   Thermal & Infrared Pedestrian Detection Surveillance System
echo =====================================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python was not found in your system PATH.
    echo Please install Python 3.10+ or add it to PATH.
    pause
    exit /b 1
)

echo Starting Application Launcher...
python run_app.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo Application stopped or encountered an error.
    pause
)
