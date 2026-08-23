# UCMS Web Server

UCMS (University Club Management System) 웹 서버는 MVC (Model-View-Controller) 패턴을 사용하여 구축된 대학 동아리 관리 시스템입니다.

## 프로젝트 구조

```
UCMS_WebServer/
├── models/                 # 데이터 모델 (MVC의 Model)
│   ├── index.js           # 데이터베이스 연결
│   ├── User.js            # 사용자 모델
│   ├── Member.js          # 회원 모델
│   ├── Event.js           # 이벤트 모델
│   ├── Purchase.js        # 구매 기록 모델
│   └── Recruit.js         # 채용 모델
├── controllers/           # 비즈니스 로직 (MVC의 Controller)
│   ├── memberController.js # 회원 관리 컨트롤러
│   ├── eventController.js # 이벤트 컨트롤러
│   ├── purchaseController.js # 구매 기록 컨트롤러
│   └── recruitController.js # 채용 컨트롤러
├── routes/               # 라우팅 (MVC의 Router)
│   ├── auth.js          # 인증 라우터
│   ├── member.js        # 회원 관리 라우터
│   ├── event.js         # 이벤트 라우터
│   ├── api.js           # API 라우터
│   ├── recruit.js       # 채용 라우터
│   └── router.js        # 기본 라우터
├── public/              # 정적 파일 및 뷰 (MVC의 View)
│   ├── views/           # EJS 템플릿
│   ├── styles/          # CSS 파일
│   ├── js/              # 클라이언트 JavaScript
│   └── images/          # 이미지 파일
├── extern_apis/         # 외부 API 연동
├── main.js              # 애플리케이션 진입점
└── package.json         # 프로젝트 의존성
```

## MVC 패턴

### Model (모델)

- 데이터베이스와의 상호작용을 담당
- 비즈니스 로직과 데이터 접근 로직을 분리
- 각 엔티티별로 독립적인 모델 클래스 구성

### View (뷰)

- 사용자 인터페이스를 담당
- EJS 템플릿과 정적 파일들로 구성
- 컨트롤러로부터 데이터를 받아 화면에 표시

### Controller (컨트롤러)

- 요청을 받아서 처리하는 비즈니스 로직을 담당
- 모델을 통해 데이터를 조작하고 뷰에 결과를 전달
- 각 기능별로 독립적인 컨트롤러 클래스 구성

## 주요 기능

### 1. 인증 시스템

- 이메일/비밀번호 로그인과 회원가입 이메일 인증
- 로그인 이메일 2차 인증 및 30일 신뢰 기기
- MySQL 세션 기반 인증
- 권한 관리

### 2. 회원 관리

- 회원 정보 CRUD
- 회원 검색 및 필터링
- 일괄 회원 등록

### 3. 이벤트 관리

- 이벤트 생성, 수정, 삭제
- 이벤트 참가자 관리
- 공휴일 자동 동기화

### 4. 구매 기록 관리

- POS 시스템
- 구매 기록 저장 및 조회
- 매출 통계

### 5. 채용 관리

- 지원서 폼 관리
- 지원자 응답 관리
- 면접 계획 및 면접관 관리

## 설치 및 실행

1. 의존성 설치

```bash
npm install
```

2. 환경 변수 설정

```bash
# keys/.env.prod 파일 생성
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DOMAIN=your_domain
PORT=your_port
EMAIL_CODE_SECRET=your_independent_email_code_secret
EMAIL_VERIFICATION_ENABLED=false
SPRING_MAIL_BASE_URL=http://ucms-spring:8080
UCMS_INTERNAL_MAIL_TOKEN=your_independent_internal_service_token
HOLIDAY_API_KEY=your_holiday_api_key
```

2026-08-23: 기존 인증 상태와 세션은 이 서비스가 유지하지만 새 메일 발송 백엔드는 Spring Boot입니다. Spring의 별도 untracked `spring.env`에 `GMAIL_USERNAME`과 Gmail 앱 비밀번호인 `GMAIL_APP_PASSWORD`를 설정합니다. 인증번호는 5분 동안 유효하며 코드 원문은 로그나 DB에 저장하지 않습니다. 현재 dev는 임시로 `EMAIL_VERIFICATION_ENABLED=false`를 사용할 수 있고 prod는 반드시 `true`로 유지합니다.

3. 서버 실행

```bash
npm run dev
```

## API 문서

### 인증 API

- `POST /api/auth/register/start` - 회원가입 이메일 인증 시작
- `POST /api/auth/login/start` - 비밀번호 확인 및 로그인 2차 인증 시작
- `POST /api/auth/email/verify` - 이메일 인증번호 확인
- `POST /api/auth/logout` - 로그아웃과 현재 신뢰 기기 해제

### 회원 관리 API

- `GET /member` - 회원 목록 조회
- `POST /member` - 회원 생성
- `PUT /member/:id` - 회원 수정
- `DELETE /member/:id` - 회원 삭제

### 이벤트 API

- `GET /event` - 이벤트 목록 조회
- `POST /event` - 이벤트 생성
- `PUT /event/:id` - 이벤트 수정
- `DELETE /event/:id` - 이벤트 삭제

### 구매 기록 API

- `GET /api/purchases` - 구매 기록 조회
- `POST /api/purchases` - 구매 기록 생성

### 채용 API

- `GET /recruit/forms` - 지원서 폼 목록
- `GET /recruit/forms/:id/responses` - 지원자 응답 조회
- `PUT /recruit/responses/:id/rating` - 응답 평가 업데이트

## 기술 스택

- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **Template Engine**: EJS
- **Authentication**: scrypt password + email verification/2FA
- **Session**: express-session, express-mysql-session
- **Real-time**: ShareDB, WebSocket

## 개발 가이드

### 새로운 기능 추가 시

1. **모델 생성**: `models/` 디렉토리에 새로운 모델 클래스 생성
2. **컨트롤러 생성**: `controllers/` 디렉토리에 새로운 컨트롤러 클래스 생성
3. **라우터 추가**: `routes/` 디렉토리에 새로운 라우터 파일 생성
4. **뷰 생성**: `public/views/` 디렉토리에 새로운 EJS 템플릿 생성

### 코드 컨벤션

- 클래스명: PascalCase (예: `UserController`)
- 메서드명: camelCase (예: `getUserById`)
- 파일명: camelCase (예: `userController.js`)
- 상수: UPPER_SNAKE_CASE (예: `MAX_RETRY_COUNT`)

## 라이선스

ISC License
