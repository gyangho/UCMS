@echo off
title UCMS Database Restore

echo ========================================
echo     UCMS 데이터베이스 복원
echo ========================================
echo.

echo ⚠️  주의: 이 작업은 현재 데이터베이스를 덮어씁니다!
echo.

echo 데이터베이스 연결 정보를 입력하세요:
set /p DB_USER=사용자명: 
set /p DB_PASS=비밀번호: 

echo.
echo 백업 파일을 선택하세요:
echo.

:: backups 폴더의 백업 파일 목록 표시
if not exist "backups" (
    echo ❌ backups 폴더가 없습니다.
    echo 먼저 백업을 실행해주세요.
    pause
    exit /b 1
)

echo 사용 가능한 백업 파일들:
dir backups\backup_*.sql /b
echo.

set /p BACKUP_FILE=복원할 백업 파일명 (전체 경로 포함): 

if not exist "%BACKUP_FILE%" (
    echo ❌ 지정된 백업 파일을 찾을 수 없습니다: %BACKUP_FILE%
    pause
    exit /b 1
)

echo.
echo 정말로 데이터베이스를 복원하시겠습니까?
echo 현재 데이터베이스의 모든 데이터가 삭제됩니다!
set /p CONFIRM=계속하려면 'YES'를 입력하세요: 

if not "%CONFIRM%"=="YES" (
    echo 복원이 취소되었습니다.
    pause
    exit /b 0
)

echo.
echo 데이터베이스 복원을 시작합니다...
echo.

:: 데이터베이스 복원
mysql -u %DB_USER% -p%DB_PASS% < "%BACKUP_FILE%"

if %errorlevel%==0 (
    echo.
    echo ✅ 데이터베이스 복원이 성공적으로 완료되었습니다!
    echo.
    echo 복원된 파일: %BACKUP_FILE%
    echo.
    echo 이제 서버를 재시작해주세요.
) else (
    echo.
    echo ❌ 데이터베이스 복원 중 오류가 발생했습니다.
    echo 오류 내용을 확인하고 다시 시도해주세요.
)

echo.
pause
