@echo off
title UCMS Database Backup

echo ========================================
echo     UCMS 데이터베이스 백업
echo ========================================
echo.

echo 데이터베이스 연결 정보를 입력하세요:
set /p DB_USER=사용자명: 
set /p DB_PASS=비밀번호: 

echo.
echo 백업을 시작합니다...
echo.

:: 현재 날짜와 시간으로 백업 파일명 생성
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "datestamp=%YYYY%%MM%%DD%_%HH%%Min%%Sec%"

:: 백업 디렉토리 생성
if not exist "backups" mkdir backups

:: 전체 데이터베이스 백업
echo 전체 데이터베이스 백업 중...
mysqldump -u %DB_USER% -p%DB_PASS% --routines --triggers --single-transaction --add-drop-database --databases UCMS > "backups\backup_ucms_full_%datestamp%.sql"

if %errorlevel%==0 (
    echo ✅ 전체 데이터베이스 백업 완료: backup_ucms_full_%datestamp%.sql
) else (
    echo ❌ 전체 데이터베이스 백업 실패
    goto :error
)

:: evaluation_notes 테이블만 별도 백업
echo evaluation_notes 테이블 백업 중...
mysqldump -u %DB_USER% -p%DB_PASS% --single-transaction --add-drop-table UCMS evaluation_notes > "backups\backup_evaluation_notes_%datestamp%.sql"

if %errorlevel%==0 (
    echo ✅ evaluation_notes 테이블 백업 완료: backup_evaluation_notes_%datestamp%.sql
) else (
    echo ❌ evaluation_notes 테이블 백업 실패
    goto :error
)

echo.
echo ========================================
echo     백업 완료!
echo ========================================
echo.
echo 백업 파일 위치: backups\ 폴더
echo.
echo 백업된 파일들:
dir backups\backup_*%datestamp%.sql /b
echo.
echo 이제 마이그레이션을 진행할 수 있습니다.
echo.
pause
exit /b 0

:error
echo.
echo ❌ 백업 중 오류가 발생했습니다.
echo 오류 내용을 확인하고 다시 시도해주세요.
echo.
pause
exit /b 1
