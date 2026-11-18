const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helpers
function readJson(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return fallback;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // API Endpoints
  if (pathname.startsWith('/api/')) {
    try {
      // GET /api/questions
      if (pathname === '/api/questions' && method === 'GET') {
        const questions = readJson(QUESTIONS_FILE, []);
        return sendJson(res, 200, { success: true, count: questions.length, data: questions });
      }

      // POST /api/questions (Add question)
      if (pathname === '/api/questions' && method === 'POST') {
        const body = await parseBody(req);
        if (!body.question || !Array.isArray(body.options) || body.options.length < 2) {
          return sendJson(res, 400, { success: false, message: 'Nội dung câu hỏi và ít nhất 2 đáp án là bắt buộc' });
        }
        const questions = readJson(QUESTIONS_FILE, []);
        const newQuestion = {
          id: 'q_' + Date.now(),
          part: Number(body.part) || 1,
          category: body.category || (body.part === 2 ? 'Kiến thức Hội nhập' : 'Tiếng Anh giao tiếp'),
          level: body.level || 'A2',
          question: body.question.trim(),
          options: body.options.map(opt => String(opt).trim()),
          correct: Number(body.correct) || 0,
          explanation: body.explanation ? body.explanation.trim() : 'Đáp án chính xác theo quy chuẩn kiến thức.'
        };
        questions.push(newQuestion);
        writeJson(QUESTIONS_FILE, questions);
        return sendJson(res, 201, { success: true, data: newQuestion });
      }

      // PUT /api/questions/:id (Edit question)
      if (pathname.startsWith('/api/questions/') && method === 'PUT') {
        const qId = pathname.replace('/api/questions/', '');
        const body = await parseBody(req);
        const questions = readJson(QUESTIONS_FILE, []);
        const idx = questions.findIndex(q => q.id === qId);
        if (idx === -1) {
          return sendJson(res, 404, { success: false, message: 'Không tìm thấy câu hỏi' });
        }
        questions[idx] = {
          ...questions[idx],
          part: body.part !== undefined ? Number(body.part) : questions[idx].part,
          category: body.category || questions[idx].category,
          level: body.level || questions[idx].level,
          question: body.question ? body.question.trim() : questions[idx].question,
          options: Array.isArray(body.options) ? body.options.map(o => String(o).trim()) : questions[idx].options,
          correct: body.correct !== undefined ? Number(body.correct) : questions[idx].correct,
          explanation: body.explanation !== undefined ? body.explanation.trim() : questions[idx].explanation
        };
        writeJson(QUESTIONS_FILE, questions);
        return sendJson(res, 200, { success: true, data: questions[idx] });
      }

      // DELETE /api/questions/:id (Delete question)
      if (pathname.startsWith('/api/questions/') && method === 'DELETE') {
        const qId = pathname.replace('/api/questions/', '');
        let questions = readJson(QUESTIONS_FILE, []);
        const initialLength = questions.length;
        questions = questions.filter(q => q.id !== qId);
        if (questions.length === initialLength) {
          return sendJson(res, 404, { success: false, message: 'Không tìm thấy câu hỏi' });
        }
        writeJson(QUESTIONS_FILE, questions);
        return sendJson(res, 200, { success: true, message: 'Đã xóa câu hỏi thành công' });
      }

      // POST /api/questions/reset
      if (pathname === '/api/questions/reset' && method === 'POST') {
        // Reset to initial 30 questions if needed
        // Re-read initial questions or let client reset
        return sendJson(res, 200, { success: true, message: 'Đã khôi phục ngân hàng câu hỏi' });
      }

      // GET /api/submissions
      if (pathname === '/api/submissions' && method === 'GET') {
        const submissions = readJson(SUBMISSIONS_FILE, []);
        // Sort descending by score, then duration
        const sorted = [...submissions].sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return (a.durationSeconds || 0) - (b.durationSeconds || 0);
        });
        return sendJson(res, 200, { success: true, count: sorted.length, data: sorted });
      }

      // POST /api/submissions (Submit candidate result)
      if (pathname === '/api/submissions' && method === 'POST') {
        const body = await parseBody(req);
        if (!body.fullName || !body.school) {
          return sendJson(res, 400, { success: false, message: 'Họ tên và trường là bắt buộc' });
        }
        const submissions = readJson(SUBMISSIONS_FILE, []);
        const sbdNumber = 1000 + submissions.length + 1;
        const newSubmission = {
          id: body.id || `SUB-${sbdNumber}`,
          fullName: body.fullName.trim(),
          school: body.school.trim(),
          grade: body.grade || '11',
          className: body.className ? body.className.trim() : '11A1',
          score: Number(body.score) || 0,
          correctCount: Number(body.correctCount) || 0,
          totalQuestions: Number(body.totalQuestions) || 20,
          durationSeconds: Number(body.durationSeconds) || 0,
          durationFormatted: body.durationFormatted || '15:00',
          title: body.title || 'Công dân Toàn cầu Tiềm năng',
          warningsCount: Number(body.warningsCount) || 0,
          submittedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };
        submissions.unshift(newSubmission);
        writeJson(SUBMISSIONS_FILE, submissions);
        return sendJson(res, 201, { success: true, data: newSubmission });
      }

      // GET /api/export-csv
      if (pathname === '/api/export-csv' && method === 'GET') {
        const submissions = readJson(SUBMISSIONS_FILE, []);
        // Sort descending by score, duration
        submissions.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return (a.durationSeconds || 0) - (b.durationSeconds || 0);
        });

        const headers = [
          'SBD',
          'Họ và Tên',
          'Trường THPT',
          'Khối',
          'Lớp',
          'Điểm Số (Thang 100)',
          'Số Câu Đúng',
          'Tổng Số Câu',
          'Thời Gian Làm Bài',
          'Số Lần Cảnh Báo',
          'Danh Hiệu',
          'Thời Điểm Nộp'
        ];

        // Format CSV rows, escape quotes
        const rows = submissions.map(s => [
          `"${s.id}"`,
          `"${(s.fullName || '').replace(/"/g, '""')}"`,
          `"${(s.school || '').replace(/"/g, '""')}"`,
          `"Khối ${s.grade || ''}"`,
          `"${(s.className || '').replace(/"/g, '""')}"`,
          s.score,
          s.correctCount || Math.round(s.score / 5),
          s.totalQuestions || 20,
          `"${s.durationFormatted || ''}"`,
          s.warningsCount || 0,
          `"${(s.title || '').replace(/"/g, '""')}"`,
          `"${s.submittedAt || ''}"`
        ]);

        // UTF-8 BOM (\uFEFF) ensures Excel displays Vietnamese diacritics correctly!
        const csvContent = '\uFEFF' + headers.join(',') + '\r\n' + rows.map(r => r.join(',')).join('\r\n');

        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="Ket_Qua_Thi_Tieng_Anh_Hoi_Nhap_Quoc_Te.csv"',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(csvContent);
      }

      return sendJson(res, 404, { success: false, message: 'Endpoint không tồn tại' });
    } catch (err) {
      console.error('API Error:', err);
      return sendJson(res, 500, { success: false, message: err.message });
    }
  }

  // Static File Serving
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  // If requesting /admin or /exam or /results, rewrite to index.html for SPA router
  if (reqPath === '/admin' || reqPath === '/exam' || reqPath === '/result') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(path.join(PUBLIC_DIR, reqPath));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Access denied');
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return fs.createReadStream(indexPath).pipe(res);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('File not found');
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(safePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

module.exports = server;
