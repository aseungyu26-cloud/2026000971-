const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 요청 본문 파싱 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 메모리 내 게시글 임시 저장소 (서버가 재시작되면 초기화됩니다)
let nextId = 3;
const posts = [
  {
    id: 2,
    title: '게시판 이용 안내',
    author: '관리자',
    content:
      '왼쪽 작성 폼에서 새 글을 등록할 수 있습니다.\n목록의 글을 클릭하면 전체 내용을 확인하거나 수정할 수 있고, 삭제 버튼으로 바로 지울 수 있습니다.',
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: 1,
    title: '메모리 게시판에 오신 것을 환영합니다!',
    author: '운영자',
    content:
      'Node.js와 Express로 구현된 심플한 CRUD 게시판입니다.\n모든 게시글 데이터는 서버 메모리에 임시 저장됩니다.',
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
];

// ID 파라미터 검증 헬퍼
function parsePostId(idParam) {
  if (!/^\d+$/.test(idParam)) {
    return null;
  }
  const id = Number(idParam);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// 프론트엔드 페이지 연결
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// [READ] 전체 게시글 목록 조회 (검색어 q 지원, 최신순 정렬)
app.get('/api/posts', (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

  let result = [...posts].sort((a, b) => b.id - a.id);

  if (query) {
    result = result.filter(
      (post) =>
        post.title.toLowerCase().includes(query) ||
        post.content.toLowerCase().includes(query) ||
        post.author.toLowerCase().includes(query)
    );
  }

  res.json(result);
});

// [READ] 특정 게시글 상세 조회
app.get('/api/posts/:id', (req, res) => {
  const id = parsePostId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: '유효하지 않은 게시글 ID입니다.' });
  }

  const post = posts.find((item) => item.id === id);
  if (!post) {
    return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  }

  res.json(post);
});

// [CREATE] 새 게시글 작성
app.post('/api/posts', (req, res) => {
  const { title, content, author } = req.body || {};

  if (typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: '제목을 입력해주세요.' });
  }

  if (typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: '내용을 입력해주세요.' });
  }

  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();
  const trimmedAuthor =
    typeof author === 'string' && author.trim().length > 0 ? author.trim() : '익명';

  if (trimmedTitle.length > 100) {
    return res.status(400).json({ error: '제목은 100자 이하로 입력해주세요.' });
  }

  if (trimmedAuthor.length > 30) {
    return res.status(400).json({ error: '작성자는 30자 이하로 입력해주세요.' });
  }

  if (trimmedContent.length > 5000) {
    return res.status(400).json({ error: '내용은 5000자 이하로 입력해주세요.' });
  }

  const now = new Date().toISOString();
  const newPost = {
    id: nextId++,
    title: trimmedTitle,
    author: trimmedAuthor,
    content: trimmedContent,
    createdAt: now,
    updatedAt: now,
  };

  posts.unshift(newPost);
  res.status(201).json(newPost);
});

// [UPDATE] 게시글 전체 수정 (PUT)
app.put('/api/posts/:id', (req, res) => {
  const id = parsePostId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: '유효하지 않은 게시글 ID입니다.' });
  }

  const post = posts.find((item) => item.id === id);
  if (!post) {
    return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  }

  const { title, content, author } = req.body || {};

  if (typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: '제목을 입력해주세요.' });
  }

  if (typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: '내용을 입력해주세요.' });
  }

  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();

  if (trimmedTitle.length > 100) {
    return res.status(400).json({ error: '제목은 100자 이하로 입력해주세요.' });
  }

  if (trimmedContent.length > 5000) {
    return res.status(400).json({ error: '내용은 5000자 이하로 입력해주세요.' });
  }

  if (author !== undefined) {
    if (typeof author !== 'string') {
      return res.status(400).json({ error: '작성자 형식이 올바르지 않습니다.' });
    }
    const trimmedAuthor = author.trim();
    if (trimmedAuthor.length > 30) {
      return res.status(400).json({ error: '작성자는 30자 이하로 입력해주세요.' });
    }
    post.author = trimmedAuthor.length > 0 ? trimmedAuthor : '익명';
  }

  post.title = trimmedTitle;
  post.content = trimmedContent;
  post.updatedAt = new Date().toISOString();

  res.json(post);
});

// [UPDATE] 게시글 부분 수정 (PATCH)
app.patch('/api/posts/:id', (req, res) => {
  const id = parsePostId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: '유효하지 않은 게시글 ID입니다.' });
  }

  const post = posts.find((item) => item.id === id);
  if (!post) {
    return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  }

  const { title, content, author } = req.body || {};

  if (title === undefined && content === undefined && author === undefined) {
    return res.status(400).json({ error: '수정할 항목을 최소 하나 이상 입력해주세요.' });
  }

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: '제목은 비어 있을 수 없습니다.' });
    }
    if (title.trim().length > 100) {
      return res.status(400).json({ error: '제목은 100자 이하로 입력해주세요.' });
    }
    post.title = title.trim();
  }

  if (content !== undefined) {
    if (typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: '내용은 비어 있을 수 없습니다.' });
    }
    if (content.trim().length > 5000) {
      return res.status(400).json({ error: '내용은 5000자 이하로 입력해주세요.' });
    }
    post.content = content.trim();
  }

  if (author !== undefined) {
    if (typeof author !== 'string') {
      return res.status(400).json({ error: '작성자 형식이 올바르지 않습니다.' });
    }
    const trimmedAuthor = author.trim();
    if (trimmedAuthor.length > 30) {
      return res.status(400).json({ error: '작성자는 30자 이하로 입력해주세요.' });
    }
    post.author = trimmedAuthor.length > 0 ? trimmedAuthor : '익명';
  }

  post.updatedAt = new Date().toISOString();
  res.json(post);
});

// [DELETE] 게시글 삭제
app.delete('/api/posts/:id', (req, res) => {
  const id = parsePostId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: '유효하지 않은 게시글 ID입니다.' });
  }

  const index = posts.findIndex((item) => item.id === id);
  if (index === -1) {
    return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  }

  const [deletedPost] = posts.splice(index, 1);
  res.json({
    message: '게시글이 삭제되었습니다.',
    post: deletedPost,
  });
});

// 존재하지 않는 API 경로 404 처리
app.use('/api', (req, res) => {
  res.status(404).json({ error: '요청한 API 경로를 찾을 수 없습니다.' });
});

// JSON 파싱 오류 및 서버 예외 처리 미들웨어
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: '올바른 JSON 형식의 요청 본문이 아닙니다.' });
  }
  console.error(err);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  });
}

module.exports = app;
