@echo off
title nginx Manager

:menu
cls
echo ========================================
echo           nginx Manager
echo ========================================
echo.
echo 1. Start nginx
echo 2. Stop nginx
echo 3. Restart nginx
echo 4. Test configuration
echo 5. Show status
echo 6. Exit
echo.
set /p choice="Select option (1-6): "

if "%choice%"=="1" goto start
if "%choice%"=="2" goto stop
if "%choice%"=="3" goto restart
if "%choice%"=="4" goto test
if "%choice%"=="5" goto status
if "%choice%"=="6" goto exit
goto menu

:start
echo.
echo Starting nginx...
cd nginx-1.28.0
nginx
if %errorlevel%==0 (
    echo nginx started successfully
    echo Main server: http://localhost
    echo WebSocket: ws://localhost/sharedb
) else (
    echo Failed to start nginx
)
pause
cd ..
goto menu

:stop
echo.
echo Stopping nginx...
cd nginx-1.28.0
nginx -s stop
if %errorlevel%==0 (
    echo nginx stopped successfully
) else (
    echo Failed to stop nginx (may not be running)
)
pause
cd ..
goto menu

:restart
echo.
echo Restarting nginx...
cd nginx-1.28.0
nginx -s stop
timeout /t 2 /nobreak > nul
nginx
if %errorlevel%==0 (
    echo nginx restarted successfully
    echo Main server: http://localhost
    echo WebSocket: ws://localhost/sharedb
) else (
    echo Failed to restart nginx
)
pause
cd ..
goto menu

:test
echo.
echo Testing nginx configuration...
cd nginx-1.28.0
nginx -t
pause
cd ..
goto menu

:status
echo.
echo Checking nginx status...
tasklist /FI "IMAGENAME eq nginx.exe" 2>NUL | find /I /N "nginx.exe">NUL
if "%errorlevel%"=="0" (
    echo nginx is running
) else (
    echo nginx is not running
)
pause
cd ..
goto menu

:exit
echo.
echo Exiting nginx manager...
exit 