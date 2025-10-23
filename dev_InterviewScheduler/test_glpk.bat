@echo off
echo ========================================
echo Interview Scheduler with GLPK - Test
echo ========================================

echo.
echo Checking GLPK installation...
where glpsol >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: GLPK not found in PATH
    echo Please install GLPK first using MSYS2 or vcpkg
    echo See GLPK_INSTALL_GUIDE.md for details
    pause
    exit /b 1
)

echo GLPK found: 
glpsol --version

echo.
echo Checking compiler...
where g++ >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: g++ compiler not found
    echo Please install MinGW-w64 or MSYS2
    pause
    exit /b 1
)

echo Compiler found:
g++ --version

echo.
echo Building interview scheduler...
echo Cleaning previous build...
if exist interview_scheduler_glpk.o del interview_scheduler_glpk.o
if exist interview_scheduler_glpk.exe del interview_scheduler_glpk.exe

echo Compiling...
g++ -std=c++17 -Wall -Wextra -O2 -c interview_scheduler_glpk.cpp -o interview_scheduler_glpk.o

if %errorlevel% neq 0 (
    echo ERROR: Compilation failed
    pause
    exit /b 1
)

echo Linking...
g++ interview_scheduler_glpk.o -o interview_scheduler_glpk.exe -lglpk -DGLPK_HAVE_THREADS 

if %errorlevel% neq 0 (
    echo ERROR: Linking failed
    pause
    exit /b 1
)

echo.
echo Build successful! Running test...
echo.

echo Input data:
type ./inputs/input_glpk.json

echo.
echo ========================================
echo Running Interview Scheduler...
echo ========================================

interview_scheduler_glpk.exe ./inputs/input_glpk.json

echo.
echo ========================================
echo Test completed!
echo ========================================

pause
