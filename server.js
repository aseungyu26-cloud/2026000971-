/**
 * 공간(Space) 기반 복합 다중 게시판 시스템 - API 서버
 *
 * 계층 구조: Space(운영 공간) → Board(게시판) → Post(게시글) → Comment(댓글)
 *
 * 역할 체계
 *  superadmin : 공간 생성·삭제, 공간 운영자 지정, 전체 관리
 *  operator   : 자신의 담당 공간 내 게시판·게시글·댓글 관리 (타 공간 접근 차단)
 *  user       : 공개 공간에서 게시글·댓글 읽기·작성
 *
 * 모든 권한 검증은 클라이언트 UI 뿐 아니라 서버에서 직접 수행합니다.
 *
 * REST API 목록
 * ─ 인증
 *   POST   /api/auth/login
 *   POST   /api/auth/logout
 *   GET    /api/auth/me
 *
 * ─ 사용자 (superadmin 전용)
 *   GET    /api/admin/users
 *
 * ─ 공간
 *   GET    /api/spaces                              공개 목록
 *   POST   /api/spaces                              생성 (superadmin)
 *   GET    /api/spaces/:sid                         상세 (접근 제어)
 *   PATCH  /api/spaces/:sid                         수정 (superadmin)
 *   DELETE /api/spaces/:sid                         삭제 + 하위 전체 cascade (superadmin)
 *   POST   /api/spaces/:sid/operators               운영자 추가 (superadmin)
 *   DELETE /api/spaces/:sid/operators/:userId        운영자 제거 (superadmin)
 *
 * ─ 게시판
 *   GET    /api/spaces/:sid/boards                  목록 (접근 제어)
 *   POST   /api/spaces/:sid/boards                  생성 (해당 공간 operator/superadmin)
 *   DELETE /api/spaces/:sid/boards/:bid             삭제 + cascade (해당 공간 operator/superadmin)
 *
 * ─ 게시글
 *   GET    /api/spaces/:sid/boards/:bid/posts       목록 (?q= 검색, 접근 제어)
 *   POST   /api/spaces/:sid/boards/:bid/posts       작성 (접근 제어, 익명 가능)
 *   GET    /api/spaces/:sid/boards/:bid/posts/:pid  상세 (접근 제어)
 *   PUT    /api/spaces/:sid/boards/:bid/posts/:pid  수정 (해당 공간 operator/superadmin)
 *   DELETE /api/spaces/:sid/boards/:bid/posts/:pid  삭제 (해당 공간 operator/superadmin)
 *
 * ─ 댓글
 *   GET    /api/spaces/:sid/boards/:bid/posts/:pid/comments        목록 (접근 제어)
 *   POST   /api/spaces/:sid/boards/:bid/posts/:pid/comments        작성 (접근 제어, 익명 가능)
 *   DELETE /api/spaces/:sid/boards/:bid/posts/:pid/comments/:cid   삭제 (해당 공간 operator/superadmin)
 */

'use strict';

const express = require('express');
const path    = require('path');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS 허용 미들웨어 (GitHub Pages, 외부 프론트엔드 연동 지원)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

/* ══════════════════════════════════════════════════
   인-메모리 데이터 저장소
══════════════════════════════════════════════════ */

/** 사용자 목록 (실제 서비스는 DB + bcrypt) */
const USERS = [
  { id: 'superadmin', nickname: '최고 관리자',    role: 'superadmin', password: 'super123' },
  { id: 'op_tech',    nickname: '기술팀 운영자',   role: 'operator',   password: 'tech123'  },
  { id: 'op_comm',    nickname: '커뮤니티 운영자', role: 'operator',   password: 'comm123'  },
  { id: 'user1',      nickname: '길동이',           role: 'user',       password: 'user123'  },
  { id: 'user2',      nickname: '철수',             role: 'user',       password: 'user456'  },
];

/** 세션 저장소: token → { userId, name, role } */
const sessions = new Map();

/* ── 공간(Space) ── */
let nextSpaceId = 4;
const spaces = [
  {
    id: 1,
    name: '기술 공간',
    description: '개발·기술 관련 게시판 모음',
    operatorIds: ['op_tech'],
    isPublic: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
  {
    id: 2,
    name: '커뮤니티 공간',
    description: '자유로운 소통과 정보 공유',
    operatorIds: ['op_comm'],
    isPublic: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: 3,
    name: '내부 운영 공간',
    description: '운영진 전용 비공개 공간',
    operatorIds: ['op_tech', 'op_comm'],
    isPublic: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

/* ── 게시판(Board) ── */
let nextBoardId = 6;
const boards = [
  { id: 1, spaceId: 1, name: '개발 게시판',  description: '개발 관련 이야기',   createdAt: new Date(Date.now() - 1000 * 60 * 175).toISOString() },
  { id: 2, spaceId: 1, name: '기술 Q&A',    description: '기술 질문과 답변',    createdAt: new Date(Date.now() - 1000 * 60 * 160).toISOString() },
  { id: 3, spaceId: 2, name: '자유게시판',  description: '자유로운 이야기',      createdAt: new Date(Date.now() - 1000 * 60 * 115).toISOString() },
  { id: 4, spaceId: 2, name: '공지사항',    description: '중요 공지를 확인하세요', createdAt: new Date(Date.now() - 1000 * 60 * 100).toISOString() },
  { id: 5, spaceId: 3, name: '팀 공지',     description: '운영진 내부 공지',    createdAt: new Date(Date.now() - 1000 * 60 * 55).toISOString() },
];

/* ── 게시글(Post): Map<boardId, Post[]> ── */
let nextPostId = 11;
const postsByBoard = new Map([
  [1, [
    { id: 2, boardId: 1, spaceId: 1, title: 'Node.js 18 주요 변경점', author: '기술팀 운영자', authorId: 'op_tech', content: 'Node.js 18에서는 Fetch API가 기본 내장되었습니다.\n또한 V8 업그레이드로 성능이 대폭 향상되었습니다.', createdAt: new Date(Date.now() - 1000*60*165).toISOString(), updatedAt: new Date(Date.now() - 1000*60*165).toISOString() },
    { id: 1, boardId: 1, spaceId: 1, title: '개발 게시판을 개설했습니다', author: '기술팀 운영자', authorId: 'op_tech', content: '기술 공간 개발 게시판에 오신 것을 환영합니다.\n개발 관련 주제를 자유롭게 나눠요!', createdAt: new Date(Date.now() - 1000*60*175).toISOString(), updatedAt: new Date(Date.now() - 1000*60*175).toISOString() },
  ]],
  [2, [
    { id: 4, boardId: 2, spaceId: 1, title: 'Express 5 vs 4 차이점', author: '홍길동', authorId: 'user1', content: 'Express 5에서는 async 에러 처리가 개선되어 try/catch 없이도 에러 미들웨어로 전달됩니다.', createdAt: new Date(Date.now() - 1000*60*155).toISOString(), updatedAt: new Date(Date.now() - 1000*60*155).toISOString() },
    { id: 3, boardId: 2, spaceId: 1, title: 'REST API 계층형 URL 설계 질문', author: '김철수', authorId: 'user2', content: '/spaces/:id/boards/:id/posts 처럼 계층 구조를 그대로 URL에 반영하는 것이 맞나요?', createdAt: new Date(Date.now() - 1000*60*158).toISOString(), updatedAt: new Date(Date.now() - 1000*60*158).toISOString() },
  ]],
  [3, [
    { id: 6, boardId: 3, spaceId: 2, title: '오늘 날씨 정말 좋네요', author: '홍길동', authorId: 'user1', content: '가을 햇살이 따뜻하고 좋습니다. 산책하기 딱 좋은 날씨예요 :)', createdAt: new Date(Date.now() - 1000*60*105).toISOString(), updatedAt: new Date(Date.now() - 1000*60*105).toISOString() },
    { id: 5, boardId: 3, spaceId: 2, title: '자유게시판 이용 안내', author: '커뮤니티 운영자', authorId: 'op_comm', content: '주제 제한 없이 자유롭게 이야기 나눌 수 있는 공간입니다.\n서로 존중하는 분위기를 만들어 주세요.', createdAt: new Date(Date.now() - 1000*60*115).toISOString(), updatedAt: new Date(Date.now() - 1000*60*115).toISOString() },
  ]],
  [4, [
    { id: 8, boardId: 4, spaceId: 2, title: '11월 커뮤니티 이벤트 안내', author: '커뮤니티 운영자', authorId: 'op_comm', content: '11월 한 달간 커뮤니티 활성화 이벤트를 진행합니다! 많은 참여 부탁드립니다.', createdAt: new Date(Date.now() - 1000*60*95).toISOString(), updatedAt: new Date(Date.now() - 1000*60*95).toISOString() },
    { id: 7, boardId: 4, spaceId: 2, title: '공지사항 게시판 개설 안내', author: '커뮤니티 운영자', authorId: 'op_comm', content: '커뮤니티 공간에 공지사항 게시판이 새로 개설되었습니다.', createdAt: new Date(Date.now() - 1000*60*100).toISOString(), updatedAt: new Date(Date.now() - 1000*60*100).toISOString() },
  ]],
  [5, [
    { id: 10, boardId: 5, spaceId: 3, title: '11월 운영 미팅 결과 공유', author: '최고 관리자', authorId: 'superadmin', content: '[내부 문서] 11월 운영 미팅에서 논의된 사항을 정리했습니다. 운영진만 열람 가능합니다.', createdAt: new Date(Date.now() - 1000*60*45).toISOString(), updatedAt: new Date(Date.now() - 1000*60*45).toISOString() },
    { id: 9,  boardId: 5, spaceId: 3, title: '팀 공지 게시판 개설', author: '최고 관리자', authorId: 'superadmin', content: '운영진 전용 비공개 공간의 팀 공지 게시판이 개설되었습니다.', createdAt: new Date(Date.now() - 1000*60*55).toISOString(), updatedAt: new Date(Date.now() - 1000*60*55).toISOString() },
  ]],
]);

/* ── 댓글(Comment): Map<postId, Comment[]> ── */
let nextCommentId = 10;
const commentsByPost = new Map();

(function seedComments() {
  commentsByPost.set(1, [
    { id: 1, postId: 1, boardId: 1, spaceId: 1, author: '김철수', content: '환영합니다! 좋은 정보 많이 나눠요 :)', createdAt: new Date(Date.now() - 1000*60*172).toISOString() },
    { id: 2, postId: 1, boardId: 1, spaceId: 1, author: '홍길동', content: '잘 부탁드립니다!', createdAt: new Date(Date.now() - 1000*60*170).toISOString() },
  ]);
  commentsByPost.set(3, [
    { id: 3, postId: 3, boardId: 2, spaceId: 1, author: '기술팀 운영자', content: '네, 계층형 URL은 소유 관계가 명확할 때 적합합니다. 이 프로젝트가 좋은 예시가 될 것 같네요!', createdAt: new Date(Date.now() - 1000*60*150).toISOString() },
  ]);
  commentsByPost.set(6, [
    { id: 4, postId: 6, boardId: 3, spaceId: 2, author: '김철수', content: '맞아요! 오늘 같은 날씨에는 커피 한 잔이 딱이죠.', createdAt: new Date(Date.now() - 1000*60*103).toISOString() },
  ]);
  nextCommentId = 10;
})();

/* ══════════════════════════════════════════════════
   헬퍼 함수
══════════════════════════════════════════════════ */

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parsePositiveInt(val) {
  if (!/^\d+$/.test(String(val))) return null;
  const n = Number(val);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function userPublicInfo(user) {
  return { id: user.id, nickname: user.nickname, role: user.role };
}

/** 공간의 운영자 상세 정보 포함 보강 */
function enrichSpace(space) {
  const operators = space.operatorIds
    .map((id) => USERS.find((u) => u.id === id))
    .filter(Boolean)
    .map(userPublicInfo);

  const spaceBoards = boards.filter((b) => b.spaceId === space.id);
  const boardCount  = spaceBoards.length;
  const postCount   = spaceBoards.reduce((sum, b) => sum + (postsByBoard.get(b.id) || []).length, 0);

  return { ...space, operators, boardCount, postCount };
}

/** 공간 접근 가능 여부 */
function canAccessSpace(user, space) {
  if (space.isPublic) return true;
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  if (user.role === 'operator' && space.operatorIds.includes(user.id)) return true;
  return false;
}

/** 공간 운영 권한 보유 여부 (superadmin 또는 해당 공간 operator) */
function isSpaceOperator(user, space) {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  return user.role === 'operator' && space.operatorIds.includes(user.id);
}

/** 공간 삭제 시 하위 데이터 cascade 삭제 */
function cascadeDeleteSpace(spaceId) {
  const spaceBoardIds = boards.filter((b) => b.spaceId === spaceId).map((b) => b.id);
  for (const bid of spaceBoardIds) cascadeDeleteBoard(bid);
  for (let i = boards.length - 1; i >= 0; i--) {
    if (boards[i].spaceId === spaceId) boards.splice(i, 1);
  }
}

/** 게시판 삭제 시 하위 게시글·댓글 cascade 삭제 */
function cascadeDeleteBoard(boardId) {
  for (const post of postsByBoard.get(boardId) || []) {
    commentsByPost.delete(post.id);
  }
  postsByBoard.delete(boardId);
}

/* ══════════════════════════════════════════════════
   미들웨어
══════════════════════════════════════════════════ */

/**
 * 토큰 인증 (선택적)
 * Authorization: Bearer <token> 헤더에서 세션 조회.
 * 토큰 없거나 유효하지 않으면 req.user = null
 */
function authenticate(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.user = token && sessions.has(token) ? sessions.get(token) : null;
  next();
}

/** 최고 관리자 전용 */
function requireSuperAdmin(req, res, next) {
  if (!req.user)                           return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (req.user.role !== 'superadmin')     return res.status(403).json({ error: '최고 관리자 권한이 필요합니다.' });
  next();
}

/** :spaceId 파라미터 → req.space / req.spaceId */
function resolveSpace(req, res, next) {
  const spaceId = parsePositiveInt(req.params.spaceId);
  if (!spaceId) return res.status(400).json({ error: '유효하지 않은 공간 ID입니다.' });
  const space = spaces.find((s) => s.id === spaceId);
  if (!space)  return res.status(404).json({ error: '공간을 찾을 수 없습니다.' });
  req.spaceId = spaceId;
  req.space   = space;
  next();
}

/**
 * 공간 접근 제어 (공개 공간은 누구나, 비공개 공간은 운영자/superadmin)
 * resolveSpace 이후 사용
 */
function requireSpaceAccess(req, res, next) {
  if (canAccessSpace(req.user, req.space)) return next();
  if (!req.user) return res.status(401).json({ error: '이 공간은 로그인이 필요합니다.' });
  return res.status(403).json({ error: '이 공간에 접근 권한이 없습니다.' });
}

/**
 * 공간 운영 권한 (해당 공간의 operator 또는 superadmin)
 * resolveSpace 이후 사용
 * ★ 타 공간 operator는 403 반환 (서버 레벨 보안)
 */
function requireSpaceOperator(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (isSpaceOperator(req.user, req.space)) return next();
  return res.status(403).json({
    error: '이 공간의 운영 권한이 없습니다.',
    detail: `'${req.space.name}'의 운영자이거나 최고 관리자만 이 작업을 수행할 수 있습니다.`,
  });
}

/** :boardId 파라미터 → req.board / req.boardId (공간 소속 검증 포함) */
function resolveBoard(req, res, next) {
  const boardId = parsePositiveInt(req.params.boardId);
  if (!boardId) return res.status(400).json({ error: '유효하지 않은 게시판 ID입니다.' });
  const board = boards.find((b) => b.id === boardId);
  if (!board)  return res.status(404).json({ error: '게시판을 찾을 수 없습니다.' });
  if (board.spaceId !== req.spaceId) {
    return res.status(404).json({ error: '해당 공간에 존재하지 않는 게시판입니다.' });
  }
  req.boardId = boardId;
  req.board   = board;
  next();
}

/** :postId 파라미터 → req.post / req.postId (게시판·공간 소속 검증 포함) */
function resolvePost(req, res, next) {
  const postId = parsePositiveInt(req.params.postId);
  if (!postId) return res.status(400).json({ error: '유효하지 않은 게시글 ID입니다.' });
  const posts = postsByBoard.get(req.boardId) || [];
  const post  = posts.find((p) => p.id === postId);
  if (!post || post.spaceId !== req.spaceId) {
    return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  }
  req.postId = postId;
  req.post   = post;
  next();
}

app.use(authenticate);

/* ══════════════════════════════════════════════════
   정적 파일 (프론트엔드)
══════════════════════════════════════════════════ */

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

/* ══════════════════════════════════════════════════
   인증 API
══════════════════════════════════════════════════ */

/** 회원가입 (아이디, 비밀번호, 비밀번호 확인, 닉네임) */
app.post('/api/auth/register', (req, res) => {
  const { id, password, confirmPassword, nickname } = req.body || {};

  if (typeof id !== 'string' || !id.trim()) {
    return res.status(400).json({ error: '아이디를 입력해주세요.' });
  }
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ error: '비밀번호를 입력해주세요.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: '비밀번호가 일치하지 않습니다.' });
  }
  if (typeof nickname !== 'string' || !nickname.trim()) {
    return res.status(400).json({ error: '닉네임을 입력해주세요.' });
  }

  const cleanId = id.trim();
  const cleanNick = nickname.trim();

  if (cleanId.length < 2 || cleanId.length > 20) {
    return res.status(400).json({ error: '아이디는 2자 이상 20자 이하로 입력해주세요.' });
  }
  if (cleanNick.length < 2 || cleanNick.length > 20) {
    return res.status(400).json({ error: '닉네임은 2자 이상 20자 이하로 입력해주세요.' });
  }

  if (USERS.some((u) => u.id === cleanId)) {
    return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
  }
  if (USERS.some((u) => u.nickname === cleanNick)) {
    return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
  }

  const newUser = {
    id: cleanId,
    nickname: cleanNick,
    role: 'user',
    password: password,
  };
  USERS.push(newUser);

  const token = generateToken();
  const session = userPublicInfo(newUser);
  sessions.set(token, session);

  res.status(201).json({ token, user: session, message: '회원가입이 완료되었습니다.' });
});

app.post('/api/auth/login', (req, res) => {
  const { id, password } = req.body || {};
  if (typeof id !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요.' });
  }
  const user = USERS.find((u) => u.id === id.trim() && u.password === password);
  if (!user) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

  const token   = generateToken();
  const session = userPublicInfo(user);
  sessions.set(token, session);
  res.json({ token, user: session });
});

app.post('/api/auth/logout', (req, res) => {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) sessions.delete(token);
  res.json({ message: '로그아웃되었습니다.' });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: '인증되지 않은 사용자입니다.' });
  res.json(req.user);
});

/* ══════════════════════════════════════════════════
   관리자 전용 API
══════════════════════════════════════════════════ */

/** GET /api/admin/users  —  사용자 목록 (superadmin) */
app.get('/api/admin/users', requireSuperAdmin, (req, res) => {
  res.json(USERS.map(userPublicInfo));
});

/* ══════════════════════════════════════════════════
   공간(Space) API
══════════════════════════════════════════════════ */

/** GET /api/spaces  —  전체 공간 목록 (공개; 비공개 공간은 접근 가능 여부 표시) */
app.get('/api/spaces', (req, res) => {
  const result = spaces.map((space) => {
    const accessible = canAccessSpace(req.user, space);
    return { ...enrichSpace(space), accessible };
  });
  res.json(result);
});

/** POST /api/spaces  —  공간 생성 (superadmin) */
app.post('/api/spaces', requireSuperAdmin, (req, res) => {
  const { name, description, isPublic } = req.body || {};
  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: '공간 이름을 입력해주세요.' });
  }
  const trimName = name.trim();
  if (trimName.length > 40) return res.status(400).json({ error: '공간 이름은 40자 이하로 입력해주세요.' });
  if (spaces.some((s) => s.name === trimName)) return res.status(409).json({ error: '이미 같은 이름의 공간이 존재합니다.' });

  const newSpace = {
    id: nextSpaceId++,
    name: trimName,
    description: typeof description === 'string' ? description.trim().slice(0, 120) : '',
    operatorIds: [],
    isPublic: typeof isPublic === 'boolean' ? isPublic : true,
    createdAt: new Date().toISOString(),
  };
  spaces.push(newSpace);
  res.status(201).json(enrichSpace(newSpace));
});

/** GET /api/spaces/:spaceId  —  공간 상세 (접근 제어) */
app.get('/api/spaces/:spaceId', resolveSpace, requireSpaceAccess, (req, res) => {
  res.json(enrichSpace(req.space));
});

/** PATCH /api/spaces/:spaceId  —  공간 정보 수정 (superadmin) */
app.patch('/api/spaces/:spaceId', resolveSpace, requireSuperAdmin, (req, res) => {
  const { name, description, isPublic } = req.body || {};
  const space = req.space;

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) return res.status(400).json({ error: '공간 이름이 유효하지 않습니다.' });
    const trimName = name.trim();
    if (spaces.some((s) => s.name === trimName && s.id !== space.id)) return res.status(409).json({ error: '이미 같은 이름의 공간이 존재합니다.' });
    space.name = trimName;
  }
  if (description !== undefined && typeof description === 'string') space.description = description.trim().slice(0, 120);
  if (typeof isPublic === 'boolean') space.isPublic = isPublic;

  res.json(enrichSpace(space));
});

/** DELETE /api/spaces/:spaceId  —  공간 삭제 + cascade (superadmin) */
app.delete('/api/spaces/:spaceId', resolveSpace, requireSuperAdmin, (req, res) => {
  const { space, spaceId } = req;
  cascadeDeleteSpace(spaceId);
  spaces.splice(spaces.findIndex((s) => s.id === spaceId), 1);
  res.json({ message: `'${space.name}' 공간과 하위 데이터가 모두 삭제되었습니다.` });
});

/** POST /api/spaces/:spaceId/operators  —  운영자 추가 (superadmin) */
app.post('/api/spaces/:spaceId/operators', resolveSpace, requireSuperAdmin, (req, res) => {
  const { userId } = req.body || {};
  if (typeof userId !== 'string' || !userId.trim()) return res.status(400).json({ error: 'userId를 입력해주세요.' });
  const targetUser = USERS.find((u) => u.id === userId.trim());
  if (!targetUser)                           return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (targetUser.role === 'superadmin')      return res.status(400).json({ error: '최고 관리자는 운영자로 지정할 수 없습니다.' });
  if (req.space.operatorIds.includes(targetUser.id)) return res.status(409).json({ error: '이미 운영자로 지정된 사용자입니다.' });

  req.space.operatorIds.push(targetUser.id);
  res.json(enrichSpace(req.space));
});

/** DELETE /api/spaces/:spaceId/operators/:userId  —  운영자 제거 (superadmin) */
app.delete('/api/spaces/:spaceId/operators/:userId', resolveSpace, requireSuperAdmin, (req, res) => {
  const { userId } = req.params;
  const idx = req.space.operatorIds.indexOf(userId);
  if (idx === -1) return res.status(404).json({ error: '해당 운영자를 찾을 수 없습니다.' });
  req.space.operatorIds.splice(idx, 1);
  res.json(enrichSpace(req.space));
});

/* ══════════════════════════════════════════════════
   게시판(Board) API
══════════════════════════════════════════════════ */

/** GET /api/spaces/:spaceId/boards  —  게시판 목록 (공간 접근 제어) */
app.get('/api/spaces/:spaceId/boards', resolveSpace, requireSpaceAccess, (req, res) => {
  const result = boards
    .filter((b) => b.spaceId === req.spaceId)
    .map((b) => ({ ...b, postCount: (postsByBoard.get(b.id) || []).length }));
  res.json(result);
});

/** POST /api/spaces/:spaceId/boards  —  게시판 생성 (해당 공간 operator/superadmin) */
app.post('/api/spaces/:spaceId/boards', resolveSpace, requireSpaceAccess, requireSpaceOperator, (req, res) => {
  const { name, description } = req.body || {};
  if (typeof name !== 'string' || name.trim().length === 0) return res.status(400).json({ error: '게시판 이름을 입력해주세요.' });
  const trimName = name.trim();
  if (trimName.length > 30) return res.status(400).json({ error: '게시판 이름은 30자 이하로 입력해주세요.' });
  const spaceBoards = boards.filter((b) => b.spaceId === req.spaceId);
  if (spaceBoards.some((b) => b.name === trimName)) return res.status(409).json({ error: '이 공간에 같은 이름의 게시판이 이미 존재합니다.' });

  const newBoard = {
    id: nextBoardId++,
    spaceId: req.spaceId,
    name: trimName,
    description: typeof description === 'string' ? description.trim().slice(0, 100) : '',
    createdAt: new Date().toISOString(),
  };
  boards.push(newBoard);
  postsByBoard.set(newBoard.id, []);
  res.status(201).json({ ...newBoard, postCount: 0 });
});

/** DELETE /api/spaces/:spaceId/boards/:boardId  —  게시판 삭제 + cascade (해당 공간 operator/superadmin) */
app.delete('/api/spaces/:spaceId/boards/:boardId', resolveSpace, requireSpaceAccess, requireSpaceOperator, resolveBoard, (req, res) => {
  const { board, boardId } = req;
  const postCount = (postsByBoard.get(boardId) || []).length;
  cascadeDeleteBoard(boardId);
  boards.splice(boards.findIndex((b) => b.id === boardId), 1);
  res.json({ message: `'${board.name}' 게시판과 게시글 ${postCount}개가 삭제되었습니다.` });
});

/* ══════════════════════════════════════════════════
   게시글(Post) API
══════════════════════════════════════════════════ */

/** GET /api/spaces/:spaceId/boards/:boardId/posts  —  글 목록 (?q= 검색) */
app.get('/api/spaces/:spaceId/boards/:boardId/posts', resolveSpace, requireSpaceAccess, resolveBoard, (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  let posts = [...(postsByBoard.get(req.boardId) || [])].sort((a, b) => b.id - a.id);
  if (q) posts = posts.filter((p) => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || p.author.toLowerCase().includes(q));
  const result = posts.map((p) => ({ ...p, commentCount: (commentsByPost.get(p.id) || []).length }));
  res.json(result);
});

/** POST /api/spaces/:spaceId/boards/:boardId/posts  —  글 작성 (접근 가능하면 익명 허용) */
app.post('/api/spaces/:spaceId/boards/:boardId/posts', resolveSpace, requireSpaceAccess, resolveBoard, (req, res) => {
  const { title, content, author } = req.body || {};
  if (typeof title !== 'string' || title.trim().length === 0)   return res.status(400).json({ error: '제목을 입력해주세요.' });
  if (typeof content !== 'string' || content.trim().length === 0) return res.status(400).json({ error: '내용을 입력해주세요.' });
  const trimTitle   = title.trim();
  const trimContent = content.trim();
  const trimAuthor  = (typeof author === 'string' && author.trim()) ? author.trim() : (req.user ? req.user.nickname : '익명');
  if (trimTitle.length > 100)   return res.status(400).json({ error: '제목은 100자 이하로 입력해주세요.' });
  if (trimAuthor.length > 30)   return res.status(400).json({ error: '작성자는 30자 이하로 입력해주세요.' });
  if (trimContent.length > 5000) return res.status(400).json({ error: '내용은 5000자 이하로 입력해주세요.' });

  const now = new Date().toISOString();
  const newPost = {
    id: nextPostId++, boardId: req.boardId, spaceId: req.spaceId,
    title: trimTitle, author: trimAuthor,
    authorId: req.user ? req.user.id : null,
    content: trimContent, createdAt: now, updatedAt: now,
  };
  postsByBoard.get(req.boardId).unshift(newPost);
  res.status(201).json({ ...newPost, commentCount: 0 });
});

/** GET /api/spaces/:spaceId/boards/:boardId/posts/:postId  —  글 상세 */
app.get('/api/spaces/:spaceId/boards/:boardId/posts/:postId', resolveSpace, requireSpaceAccess, resolveBoard, resolvePost, (req, res) => {
  res.json({ ...req.post, commentCount: (commentsByPost.get(req.postId) || []).length });
});

/** PUT /api/spaces/:spaceId/boards/:boardId/posts/:postId  —  글 수정 (해당 공간 operator/superadmin) */
app.put('/api/spaces/:spaceId/boards/:boardId/posts/:postId', resolveSpace, requireSpaceAccess, requireSpaceOperator, resolveBoard, resolvePost, (req, res) => {
  const { title, content, author } = req.body || {};
  if (typeof title !== 'string' || title.trim().length === 0)   return res.status(400).json({ error: '제목을 입력해주세요.' });
  if (typeof content !== 'string' || content.trim().length === 0) return res.status(400).json({ error: '내용을 입력해주세요.' });
  if (title.trim().length > 100)   return res.status(400).json({ error: '제목은 100자 이하로 입력해주세요.' });
  if (content.trim().length > 5000) return res.status(400).json({ error: '내용은 5000자 이하로 입력해주세요.' });

  const post = req.post;
  post.title = title.trim();
  post.content = content.trim();
  if (typeof author === 'string') post.author = author.trim() || post.author;
  post.updatedAt = new Date().toISOString();
  res.json({ ...post, commentCount: (commentsByPost.get(post.id) || []).length });
});

/** DELETE /api/spaces/:spaceId/boards/:boardId/posts/:postId  —  글 삭제 (해당 공간 operator/superadmin) */
app.delete('/api/spaces/:spaceId/boards/:boardId/posts/:postId', resolveSpace, requireSpaceAccess, requireSpaceOperator, resolveBoard, resolvePost, (req, res) => {
  const { post, postId, boardId } = req;
  commentsByPost.delete(postId);
  const posts = postsByBoard.get(boardId);
  posts.splice(posts.findIndex((p) => p.id === postId), 1);
  res.json({ message: '게시글이 삭제되었습니다.', post });
});

/* ══════════════════════════════════════════════════
   댓글(Comment) API
══════════════════════════════════════════════════ */

/** GET /api/spaces/:sid/boards/:bid/posts/:pid/comments  —  댓글 목록 */
app.get('/api/spaces/:spaceId/boards/:boardId/posts/:postId/comments', resolveSpace, requireSpaceAccess, resolveBoard, resolvePost, (req, res) => {
  res.json(commentsByPost.get(req.postId) || []);
});

/** POST /api/spaces/:sid/boards/:bid/posts/:pid/comments  —  댓글 작성 (익명 허용) */
app.post('/api/spaces/:spaceId/boards/:boardId/posts/:postId/comments', resolveSpace, requireSpaceAccess, resolveBoard, resolvePost, (req, res) => {
  const { content, author } = req.body || {};
  if (typeof content !== 'string' || content.trim().length === 0) return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
  if (content.trim().length > 1000) return res.status(400).json({ error: '댓글은 1000자 이하로 입력해주세요.' });

  const trimAuthor = (typeof author === 'string' && author.trim()) ? author.trim() : (req.user ? req.user.nickname : '익명');
  if (trimAuthor.length > 30) return res.status(400).json({ error: '작성자는 30자 이하로 입력해주세요.' });

  const newComment = {
    id: nextCommentId++,
    postId: req.postId, boardId: req.boardId, spaceId: req.spaceId,
    author: trimAuthor, content: content.trim(),
    createdAt: new Date().toISOString(),
  };
  if (!commentsByPost.has(req.postId)) commentsByPost.set(req.postId, []);
  commentsByPost.get(req.postId).push(newComment);
  res.status(201).json(newComment);
});

/** DELETE /api/spaces/:sid/boards/:bid/posts/:pid/comments/:cid  —  댓글 삭제 (해당 공간 operator/superadmin) */
app.delete('/api/spaces/:spaceId/boards/:boardId/posts/:postId/comments/:commentId', resolveSpace, requireSpaceAccess, requireSpaceOperator, resolveBoard, resolvePost, (req, res) => {
  const commentId = parsePositiveInt(req.params.commentId);
  if (!commentId) return res.status(400).json({ error: '유효하지 않은 댓글 ID입니다.' });
  const comments = commentsByPost.get(req.postId) || [];
  const idx = comments.findIndex((c) => c.id === commentId && c.spaceId === req.spaceId);
  if (idx === -1) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
  const [deleted] = comments.splice(idx, 1);
  res.json({ message: '댓글이 삭제되었습니다.', comment: deleted });
});

/* ══════════════════════════════════════════════════
   공통 오류 처리
══════════════════════════════════════════════════ */

app.use('/api', (req, res) => res.status(404).json({ error: '요청한 API 경로를 찾을 수 없습니다.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status === 400 && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '올바른 JSON 형식의 요청이 아닙니다.' });
  }
  console.error('[Server Error]', err);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

/* ══════════════════════════════════════════════════
   서버 실행
══════════════════════════════════════════════════ */

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
    console.log('');
    console.log('계정 정보 (아이디 / 비밀번호 / 닉네임)');
    console.log('  최고 관리자 : superadmin / super123 (닉네임: 최고 관리자)');
    console.log('  기술팀 운영자  : op_tech   / tech123  (닉네임: 기술팀 운영자)');
    console.log('  커뮤니티 운영자: op_comm   / comm123  (닉네임: 커뮤니티 운영자)');
    console.log('  일반 사용자    : user1     / user123  (닉네임: 길동이)');
    console.log('  일반 사용자    : user2     / user456  (닉네임: 철수)');
  });
}

module.exports = app;
