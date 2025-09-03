@echo off
title UCMS OT Migration

echo ========================================
echo     UCMS OT Migration 실행
echo ========================================
echo.

echo 데이터베이스 연결 정보를 입력하세요:
set /p DB_USER=사용자명: 
set /p DB_PASS=비밀번호: 

echo.
echo 마이그레이션을 시작합니다...
echo.

mysql -u %DB_USER% -p%DB_PASS% UCMS < migrate_ot_alter.sql

if %errorlevel%==0 (
    echo.
    echo ✅ 마이그레이션이 성공적으로 완료되었습니다!
    echo.
    echo 이제 OT 기반 공유 문서 시스템을 사용할 수 있습니다.
    echo 서버를 재시작해주세요: npm run sharedb
) else (
    echo.
    echo ❌ 마이그레이션 중 오류가 발생했습니다.
    echo 오류 내용을 확인하고 다시 시도해주세요.
)

echo.
pause
