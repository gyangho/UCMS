# GLPK 설치 및 사용 가이드

## GLPK란?

GLPK (GNU Linear Programming Kit)는 GNU 프로젝트의 오픈소스 선형/정수 계획법 솔버입니다. 면접 스케줄링과 같은 복잡한 최적화 문제를 해결하는 데 사용됩니다.

## Windows에서 설치하기

### 방법 1: MSYS2/MinGW 사용 (권장)

1. **MSYS2 설치**
   - https://www.msys2.org/ 에서 MSYS2 설치 프로그램 다운로드
   - 설치 후 MSYS2 터미널 실행

2. **GLPK 설치**
   ```bash
   pacman -S mingw-w64-x86_64-glpk
   pacman -S mingw-w64-x86_64-gcc
   pacman -S mingw-w64-x86_64-make
   ```

3. **환경 변수 설정**
   - MSYS2의 bin 폴더를 PATH에 추가
   - 예: `C:\msys64\mingw64\bin`

4. **컴파일**
   ```bash
   make all
   ```

### 방법 2: vcpkg 사용

1. **vcpkg 설치**
   ```bash
   git clone https://github.com/Microsoft/vcpkg.git
   cd vcpkg
   .\bootstrap-vcpkg.bat
   ```

2. **GLPK 설치**
   ```bash
   .\vcpkg install glpk:x64-windows
   ```

3. **컴파일 (CMake 사용)**
   ```bash
   cmake -B build -S . -DCMAKE_TOOLCHAIN_FILE=[path to vcpkg]/scripts/buildsystems/vcpkg.cmake
   cmake --build build
   ```

## Linux에서 설치하기

### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install libglpk-dev g++ make
```

### CentOS/RHEL/Fedora
```bash
sudo yum install glpk-devel gcc-c++ make
# 또는
sudo dnf install glpk-devel gcc-c++ make
```

### Arch Linux
```bash
sudo pacman -S glpk gcc make
```

## macOS에서 설치하기

### Homebrew 사용
```bash
brew install glpk gcc make
```

### MacPorts 사용
```bash
sudo port install glpk gcc7 make
```

## 컴파일 및 실행

### 1. 의존성 확인
```bash
# GLPK 헤더 파일 확인
pkg-config --cflags glpk

# GLPK 라이브러리 확인
pkg-config --libs glpk
```

### 2. 컴파일
```bash
make all
```

### 3. 실행
```bash
./interview_scheduler_glpk input.json
```

## 문제 해결

### 컴파일 에러: glpk.h를 찾을 수 없음
```bash
# 헤더 파일 경로 추가
g++ -I/usr/include -I/usr/local/include -c interview_scheduler_glpk.cpp
```

### 링크 에러: glpk 라이브러리를 찾을 수 없음
```bash
# 라이브러리 경로 추가
g++ interview_scheduler_glpk.o -L/usr/lib -L/usr/local/lib -lglpk
```

### 런타임 에러: glpk 라이브러리를 찾을 수 없음
```bash
# LD_LIBRARY_PATH 설정 (Linux/macOS)
export LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH

# Windows에서는 PATH에 라이브러리 경로 추가
```

## GLPK 대안

만약 GLPK 설치가 어렵다면 다음 대안을 고려해보세요:

### 1. CBC (COIN-OR Branch and Cut)
- 무료, 오픈소스
- 설치: `vcpkg install coin-or-cbc`

### 2. Gurobi (학생/연구용 무료)
- 상용이지만 학생/연구용은 무료
- https://www.gurobi.com/academia/

### 3. CPLEX (학생/연구용 무료)
- IBM의 상용 솔버
- 학생/연구용은 무료 라이센스 제공

## 성능 최적화 팁

1. **제약 조건 단순화**: 불필요한 제약 조건 제거
2. **변수 수 줄이기**: 가능한 변수 통합
3. **시간 제한 설정**: 무한정 기다리지 않도록 제한
4. **초기 해 사용**: 좋은 초기 해가 있다면 제공

## 예제 데이터 형식

`input.json` 파일은 다음과 같은 형식이어야 합니다:

```json
{
  "interviewDates": ["8/21(목)", "8/22(금)", "8/23(토)"],
  "interviewerSlots": [
    {"interviewerId": 1, "interviewDate": "8/21(목)", "timeslot": "09:00~10:00"},
    {"interviewerId": 1, "interviewDate": "8/21(목)", "timeslot": "10:00~11:00"}
  ],
  "intervieweeSlots": [
    {"intervieweeId": 101, "interviewDate": "8/21(목)", "timeslot": "09:00~10:00"},
    {"intervieweeId": 101, "interviewDate": "8/21(목)", "timeslot": "10:00~11:00"}
  ],
  "panelSize": 3
}
```

## 추가 리소스

- [GLPK 공식 문서](https://www.gnu.org/software/glpk/)
- [GLPK 예제](https://www.gnu.org/software/glpk/examples/)
- [GLPK 메일링 리스트](https://lists.gnu.org/mailman/listinfo/help-glpk)
