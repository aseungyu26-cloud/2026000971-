# 📌 안티그래비티 기반 복합 다중 공간·게시판 시스템 (Vibe Coding 실습)

안티그래비티(Anti-gravity) AI 에이전트와 Node.js, Express, Tailwind CSS를 활용하여 단계별로 확장 완성된 **공간(Space)별 다중 게시판 시스템**입니다.  
로컬 서버 환경(Node.js)은 물론, 백엔드가 없는 **GitHub Pages 배포 환경(브라우저 LocalStorage 기반 가상 MockDB)** 및 **외부 백엔드 호스팅(Render 등)** 환경까지 완벽하게 지원합니다.

---

## 🛠️ 개발 환경 및 사용 기술

* **AI IDE:** Google Antigravity (바이브 코딩 실습)
* **Backend:** Node.js, Express (인메모리 세션 및 REST API, 역할 기반 권한 제어)
* **Database:** Local Memory Array (서버 모드) / Browser `localStorage` MockDB (GitHub Pages 오프라인 모드)
* **Frontend:** HTML5, Tailwind CSS, Pretendard 웹폰트, Vanilla JavaScript
* **Deployment & Version Control:** Git, GitHub Pages, Render 호스팅 대응

---

## 🚀 실행 및 배포 방법

### 1) 로컬 개발 환경에서 실행하기
1. 컴퓨터에 [Node.js](https://nodejs.org)가 설치되어 있는지 확인합니다.
2. 터미널(Git CMD 또는 PowerShell)을 열고 아래 명령어로 서버를 실행합니다:
   ```bash
   node server.js
   ```
3. 브라우저에서 아래 주소로 접속합니다:
   👉 **http://localhost:3000**

---

### 2) GitHub Pages 정적 배포 환경에서 실행하기
* 백엔드 서버 없이 GitHub Pages에 업로드된 정적 `index.html` 상태에서도 **MockDB (LocalStorage 기반 가상 DB)** 가 자동 활성화되어 **회원가입, 로그인, 공간/게시판/게시글/댓글 작성 및 삭제 등 모든 기능을 100% 오프라인으로 체험**할 수 있습니다.
* 데이터는 접속한 브라우저의 `localStorage`에 영구 보존됩니다.

---

### 3) 외부 백엔드(Render, Railway 등) 호스팅 연동하기
만약 Node.js 백엔드(`server.js`)를 무료 클라우드 호스팅(예: Render.com)에 올렸다면, 프론트엔드 코드 수정 없이 즉시 백엔드와 연동할 수 있습니다:
1. 웹페이지 상단 헤더 우측의 **`[API: 상대경로 ⚙️]`** 버튼 클릭
2. 배포된 백엔드 주소(예: `https://your-service.onrender.com`)를 입력하고 저장
3. 또는 URL 주소창에 파라미터를 붙여 접속:
   👉 `https://username.github.io/repo/?api=https://your-service.onrender.com`

---

## 📋 핵심 구현 기능 목록

### 1. 계층형 다중 공간(Space) & 게시판(Board) 구조
* **공간(Space) ➡️ 게시판(Board) ➡️ 게시글(Post) ➡️ 댓글(Comment)** 4단계 계층 아키텍처
* 공간별 독립된 게시판 생성/수정/삭제 및 게시글 격리

### 2. 3계층 역할 기반 접근 제어 (RBAC) 및 서버 보안
| 역할 (Role) | 권한 범위 | 기본 테스트 계정 |
| :--- | :--- | :--- |
| **최고 관리자 (superadmin)** | 모든 공간 생성/삭제, 공간 운영자 임명, 전역 게시판/게시글 관리 | `superadmin` / `super123` |
| **공간 운영자 (operator)** | 자신에게 배정된 공간 내에서만 게시판 생성/삭제 및 글 관리 (타 공간 접근 원천 차단) | `op_tech` / `tech123` (기술팀)<br>`op_comm` / `comm123` (커뮤니티) |
| **일반 사용자 (user)** | 모든 허용된 공간/게시판 조회, 게시글 및 댓글 작성 (본인 작성 글만 수정/삭제) | `user1` / `user123` (길동이)<br>`user2` / `user456` (철수) |

* **보안 검증:** UI 버튼 숨김뿐 아니라, URL 변조나 API 직접 호출을 통한 타 공간 조작 시도 시 백엔드 및 MockDB에서 `403 Forbidden` 차단

### 3. 회원가입 및 닉네임 자동 연동 시스템
* **가입 항목:** `[아이디]`, `[비밀번호]`, `[비밀번호 확인]`, `[닉네임]` 총 4개 필드 구성 (실명/이메일 배제)
* **유효성 검사:** 비밀번호와 비밀번호 확인 불일치 시 `"비밀번호가 일치하지 않습니다"` 경고창 표시 및 진행 중단
* **닉네임 연동:** 로그인 시 게시글 및 댓글 작성자 필드에 등록한 `[닉네임]`이 자동으로 입력 및 잠금(`readOnly`) 적용
* 사용자 모델 및 데이터 구조 전반에 걸쳐 `nickname` 필드로 통일

### 4. 하이브리드 데이터베이스 (듀얼 모드)
* **온라인 모드:** 로컬 Node.js 또는 클라우드 RESTful API와 비동기(`fetch`) 통신
* **오프라인 / GitHub Pages 모드:** 브라우저 `localStorage` 기반 `MockDB` 가상 엔진 탑재로 서버가 꺼져 있어도 완전 동작

---

## 🧪 점검 및 테스트 시나리오

1. **회원가입 비밀번호 불일치 검증**: 가입 창에서 비밀번호를 다르게 입력했을 때 정확히 `"비밀번호가 일치하지 않습니다"` 경고창이 뜨고 가입이 차단되는지 확인
2. **닉네임 자동 입력 확인**: 새로 가입한 닉네임으로 로그인 후 글/댓글 작성 시 작성자란에 닉네임이 자동 반영되는지 확인
3. **공간 격리 및 권한 차단**: `op_tech`(기술팀 운영자)로 로그인하여 '커뮤니티 공간'의 게시판 관리 권한이 거부되는지 확인
4. **GitHub Pages / 오프라인 동작**: 서버 실행 없이 `index.html` 단독 실행 상태에서도 데이터 저장 및 모든 기능이 영구 유지되는지 확인
