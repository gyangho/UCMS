@echo off
title UCMS Service Manager

:menu
cls
echo ========================================
echo         UCMS Service Manager
echo ========================================
echo.
echo 1. Start all services (nginx + Node.js)
echo 2. Stop all services
echo 3. Restart all services
echo 4. Start nginx only
echo 5. Start Node.js servers only
echo 6. Show service status
echo 7. Exit
echo.
set /p choice="Select option (1-7): "

if "%choice%"=="1" goto start_all
if "%choice%"=="2" goto stop_all
if "%choice%"=="3" goto restart_all
if "%choice%"=="4" goto start_nginx
if "%choice%"=="5" goto start_nodejs
if "%choice%"=="6" goto status
if "%choice%"=="7" goto exit
goto menu

:start_all
echo.
echo Starting all services...
echo 1. Starting nginx...
cd nginx-1.28.0
if not exist nginx.exe (
    dir
    echo ERROR: nginx.exe not found in nginx-1.28.0 directory!
    echo Please check if nginx is properly installed.
    pause
    goto menu
)

nginx -t
if %errorlevel% neq 0 (
    echo ERROR: nginx configuration test failed!
    echo Please check nginx-UCMS.conf file.
    pause
    goto menu
)

start "nginx" cmd /c "nginx"
timeout /t 2 /nobreak > nul

echo 2. Starting Node.js servers...
cd ..
cd UCMS_WebServer

if not exist package.json (
    echo ERROR: package.json not found in UCMS_WebServer directory!
    echo Please check if Node.js project is properly set up.
    pause
    goto menu
)

if not exist node_modules (
    echo WARNING: node_modules not found. Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install npm dependencies!
        pause
        goto menu
    )
)

start "UCMS Servers" cmd /c "npm run dev:all"

echo.
echo All services started successfully!
echo Main server: http://localhost
echo WebSocket: ws://localhost/sharedb
echo.
echo Press any key to return to menu...
pause > nul
cd ..
goto menu

:stop_all
echo.
echo Stopping all services...
echo 1. Stopping nginx...

cd nginx-1.28.0
nginx -s stop
if %errorlevel% neq 0 (
    echo WARNING: Failed to stop nginx gracefully. Force stopping...
    taskkill /F /IM nginx.exe 2>NUL
)

echo 2. Stopping Node.js servers...
taskkill /F /IM node.exe 2>NUL
if %errorlevel% equ 0 (
    echo Node.js servers stopped successfully.
) else (
    echo No Node.js processes found to stop.
)

echo All services stopped.
pause
cd ..
goto menu

:restart_all
echo.
echo Restarting all services...
echo 1. Stopping services...

cd nginx-1.28.0
nginx -s stop
taskkill /F /IM node.exe 2>NUL

echo 2. Starting services...
timeout /t 2 /nobreak > nul

start "nginx" cmd /c "nginx"
if %errorlevel% neq 0 (
    echo ERROR: Failed to start nginx!
    pause
    goto menu
)

timeout /t 2 /nobreak > nul
cd ..
cd UCMS_WebServer

if not exist package.json (
    echo ERROR: package.json not found!
    pause
    goto menu
)

start "UCMS Servers" cmd /c "npm run dev:all"

echo All services restarted successfully!
pause
cd ..
goto menu

:start_nginx
echo.
echo Starting nginx only...

cd nginx-1.28.0
if not exist nginx.exe (
    echo ERROR: nginx.exe not found!
    pause
    goto menu
)

nginx -t
if %errorlevel% neq 0 (
    echo ERROR: nginx configuration test failed!
    pause
    goto menu
)

start "nginx" cmd /c "nginx"
echo nginx started successfully.
pause
cd ..
goto menu

:start_nodejs
echo.
echo Starting Node.js servers only...

cd UCMS_WebServer
if not exist package.json (
    echo ERROR: package.json not found in UCMS_WebServer directory!
    pause
    goto menu
)

if not exist node_modules (
    echo WARNING: node_modules not found. Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install npm dependencies!
        pause
        goto menu
    )
)

start "UCMS Servers" cmd /c "npm run dev:all"
echo Node.js servers started successfully.
pause
cd ..
goto menu

:status
echo.
echo Checking service status...
echo.
echo nginx status:
tasklist /FI "IMAGENAME eq nginx.exe" 2>NUL | find /I /N "nginx.exe">NUL
if "%errorlevel%"=="0" (
    echo - nginx: Running
) else (
    echo - nginx: Not running
)

echo.
echo Node.js status:
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%errorlevel%"=="0" (
    echo - Node.js: Running
) else (
    echo - Node.js: Not running
)

echo.
echo Port status:
netstat -an | findstr /C:":80" /C:":3000" /C:":8080"
pause
goto menu

:exit
echo.
echo Exiting UCMS Service Manager...
exit 