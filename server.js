import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global state to track active submission sessions
const activeSessions = new Map();

// Helper: Parse Google Form page
async function fetchAndParseForm(url) {
  // Normalize URL to /viewform
  let formUrl = url.trim();
  if (formUrl.includes('/formResponse')) {
    formUrl = formUrl.replace('/formResponse', '/viewform');
  }
  if (!formUrl.endsWith('/viewform') && !formUrl.includes('/viewform?')) {
    if (formUrl.includes('?')) {
      const [base, query] = formUrl.split('?');
      if (!base.endsWith('/viewform')) {
        formUrl = `${base.replace(/\/$/, '')}/viewform?${query}`;
      }
    } else {
      formUrl = `${formUrl.replace(/\/$/, '')}/viewform`;
    }
  }

  const response = await fetch(formUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Không thể tải trang Google Form (Mã lỗi: ${response.status})`);
  }

  const html = await response.text();

  // Extract FB_PUBLIC_LOAD_DATA_
  let jsonData = null;
  const marker = 'FB_PUBLIC_LOAD_DATA_';
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) {
    throw new Error('Không thể tìm thấy dữ liệu form ẩn FB_PUBLIC_LOAD_DATA_. Hãy kiểm tra lại URL form.');
  }

  const arrayStart = html.indexOf('[', startIdx);
  if (arrayStart === -1) {
    throw new Error('Không thể tìm thấy mảng dữ liệu form ẩn FB_PUBLIC_LOAD_DATA_.');
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  let jsonString = '';

  for (let i = arrayStart; i < html.length; i++) {
    const char = html[i];
    jsonString += char;

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"' || char === "'") {
      if (!inString) {
        inString = char;
      } else if (inString === char) {
        inString = false;
      }
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '[') {
      depth++;
    } else if (char === ']') {
      depth--;
      if (depth === 0) {
        break;
      }
    }
  }

  if (depth !== 0 || !jsonString) {
    throw new Error('Dữ liệu form ẩn FB_PUBLIC_LOAD_DATA_ bị lỗi hoặc không khớp ngoặc.');
  }

  try {
    jsonData = JSON.parse(jsonString);
  } catch (err) {
    throw new Error('Lỗi khi phân tích dữ liệu JSON cấu trúc form: ' + err.message);
  }

  // Extract fbzx token
  const fbzxMatch = html.match(/name="fbzx"\s+value="([^"]+)"/) || html.match(/value="([^"]+)"\s+name="fbzx"/);
  const fbzx = fbzxMatch ? fbzxMatch[1] : '';

  // Parse questions
  const formInfo = jsonData[1];
  const formTitle = formInfo[8] || formInfo[0] || 'Google Form Không Tên';
  const formDescription = formInfo[1] || '';
  const rawFields = formInfo[1] ? formInfo[1] : []; // If layout differs, it's at index 1

  // Note: jsonData[1][1] contains the fields
  const fieldsArray = formInfo[1] || [];
  const parsedFields = [];

  for (const field of fieldsArray) {
    if (!field) continue;
    
    const questionTitle = field[1] || '';
    const questionType = field[3];
    
    // Skip formatting items (images, videos, sections without inputs)
    if (!field[4] || field[4].length === 0) continue;
    
    // If it's a grid question (Type 7)
    if (questionType === 7) {
      const rows = field[4];
      // columns are in the first row item choice list
      const columns = rows[0][1] ? rows[0][1].map(c => c[0]) : [];
      
      for (const row of rows) {
        if (!row) continue;
        const rowId = row[0];
        const rowTitle = row[3] ? row[3][0] : '';
        const required = !!row[2];
        
        parsedFields.push({
          id: rowId,
          title: `${questionTitle} [${rowTitle}]`,
          type: 7, // Grid sub-question
          choices: columns,
          required: required
        });
      }
      continue;
    }

    const questionInfo = field[4][0];
    if (!questionInfo) continue;
    
    const entryId = questionInfo[0];
    if (!entryId) continue; // No input entry ID found (e.g. description blocks)

    const required = !!questionInfo[2];
    
    // Extract choices
    const choices = [];
    if (questionInfo[1]) {
      for (const choice of questionInfo[1]) {
        if (choice && choice[0] !== undefined && choice[0] !== null) {
          choices.push(String(choice[0]));
        }
      }
    }

    parsedFields.push({
      id: entryId,
      title: questionTitle,
      type: questionType,
      choices: choices,
      required: required
    });
  }

  // Find post URL
  const postUrl = formUrl.replace('/viewform', '/formResponse');

  return {
    formTitle,
    formDescription,
    fbzx,
    postUrl,
    fields: parsedFields
  };
}

// Route to parse Google Form
app.get('/api/parse-form', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Thiếu tham số URL.' });
  }

  try {
    const data = await fetchAndParseForm(url);
    res.json(data);
  } catch (err) {
    console.error('Lỗi khi phân tích form:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper for weighted random choice
function chooseWeighted(options, ratios) {
  const keys = Object.keys(ratios);
  if (keys.length === 0) {
    return options[Math.floor(Math.random() * options.length)];
  }

  // Calculate sum of weights
  let sumWeights = 0;
  for (const key of keys) {
    sumWeights += Number(ratios[key] || 0);
  }

  if (sumWeights <= 0) {
    // Uniform random if no weights configured
    return options[Math.floor(Math.random() * options.length)];
  }

  const r = Math.random() * sumWeights;
  let runningSum = 0;
  for (const key of keys) {
    runningSum += Number(ratios[key] || 0);
    if (r <= runningSum) {
      return key;
    }
  }
  return keys[keys.length - 1];
}

// Generate default answer for text fields
const VIETNAMESE_NAMES = [
  'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Châu', 'Phạm Minh Đức', 
  'Hoàng Kim Chi', 'Vũ Hồng Hải', 'Đặng Quốc Khánh', 'Bùi Mai Lan', 
  'Đỗ Nam Anh', 'Ngô Phương Thảo', 'Phan Văn Hải', 'Dương Thúy Hằng'
];
const TEXT_FEEDBACKS = [
  'Tôi thấy khảo sát rất ý nghĩa.', 'Nội dung chuẩn bị kỹ lưỡng.', 
  'Không có ý kiến gì thêm.', 'Dịch vụ rất tốt và nhân viên chu đáo.', 
  'Mong nhận được phản hồi sớm.', 'Rất hài lòng với trải nghiệm này.', 
  'Cần cải thiện tốc độ phục vụ.', 'Sản phẩm dùng tốt, giá cả hợp lý.'
];

function generateTextAnswer(question, customTextList) {
  if (customTextList && customTextList.length > 0) {
    return customTextList[Math.floor(Math.random() * customTextList.length)];
  }
  
  const titleLower = question.title.toLowerCase();
  if (titleLower.includes('tên') || titleLower.includes('name') || titleLower.includes('họ')) {
    return VIETNAMESE_NAMES[Math.floor(Math.random() * VIETNAMESE_NAMES.length)];
  }
  if (titleLower.includes('sđt') || titleLower.includes('điện thoại') || titleLower.includes('phone')) {
    return '09' + Math.floor(10000000 + Math.random() * 90000000);
  }
  if (titleLower.includes('email') || titleLower.includes('thư điện tử')) {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let user = '';
    for (let i = 0; i < 8; i++) user += chars[Math.floor(Math.random() * chars.length)];
    return `${user}@gmail.com`;
  }
  
  return TEXT_FEEDBACKS[Math.floor(Math.random() * TEXT_FEEDBACKS.length)];
}

// Run the submission loop in background
async function runSubmissionLoop(sessionId, config) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const { postUrl, fbzx, questions, count, delay, threads } = config;
  
  // Initialize Stats tracker
  const stats = {};
  for (const q of questions) {
    stats[q.id] = {};
    if (q.choices) {
      for (const choice of q.choices) {
        stats[q.id][choice] = 0;
      }
    }
  }

  session.stats = stats;
  session.total = count;

  let activeRequests = 0;
  let index = 0;

  const logsQueue = [];
  const logMessage = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    const logStr = `[${timestamp}] ${msg}`;
    logsQueue.push(logStr);
    session.logs.push(logStr);
    if (session.logs.length > 200) session.logs.shift(); // Limit server logs size
  };

  logMessage(`Bắt đầu chiến dịch tự động điền form: ${count} lượt gửi, luồng: ${threads}, độ trễ: ${delay}ms`);

  // Single submission worker
  const submitOne = async (submitIndex) => {
    try {
      const formData = new URLSearchParams();
      formData.append('fvv', '1');
      formData.append('draftResponse', '[]');
      formData.append('pageHistory', '0');
      if (fbzx) {
        formData.append('fbzx', fbzx);
      }

      const answersLog = [];

      for (const q of questions) {
        const entryKey = `entry.${q.id}`;
        
        // Text/Paragraph
        if (q.type === 0 || q.type === 1) {
          const ans = generateTextAnswer(q, q.textValues);
          formData.append(entryKey, ans);
          answersLog.push(`${q.title.substring(0, 15)}...: "${ans}"`);
          
          if (!stats[q.id][ans]) stats[q.id][ans] = 0;
          stats[q.id][ans]++;
        }
        // Radio / Dropdown / Linear Scale / Grid Rows
        else if (q.type === 2 || q.type === 3 || q.type === 5 || q.type === 7) {
          const ans = chooseWeighted(q.choices, q.ratios || {});
          formData.append(entryKey, ans);
          answersLog.push(`${q.title.substring(0, 15)}...: "${ans}"`);
          
          if (stats[q.id][ans] === undefined) stats[q.id][ans] = 0;
          stats[q.id][ans]++;
        }
        // Checkboxes (Type 4)
        else if (q.type === 4) {
          const selected = [];
          for (const choice of q.choices) {
            const prob = q.ratios ? Number(q.ratios[choice] || 0) : 50; // Default 50% if not set
            if (Math.random() * 100 < prob) {
              selected.push(choice);
            }
          }
          // If required and nothing selected, select at least one weighted option
          if (q.required && selected.length === 0) {
            const ans = chooseWeighted(q.choices, q.ratios || {});
            selected.push(ans);
          }

          for (const ans of selected) {
            formData.append(entryKey, ans);
            
            if (stats[q.id][ans] === undefined) stats[q.id][ans] = 0;
            stats[q.id][ans]++;
          }
          answersLog.push(`${q.title.substring(0, 15)}...: [${selected.join(', ')}]`);
        }
      }

      const res = await fetch(postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: formData.toString()
      });

      if (res.ok) {
        session.successCount++;
        logMessage(`[Thành công #${submitIndex}] ${answersLog.slice(0, 3).join(' | ')}${answersLog.length > 3 ? '...' : ''}`);
      } else {
        session.failCount++;
        logMessage(`[Thất bại #${submitIndex}] Google Form trả về status ${res.status}`);
      }
    } catch (err) {
      session.failCount++;
      logMessage(`[Lỗi #${submitIndex}] ${err.message}`);
    }
  };

  // Submission manager loop
  const runNext = async () => {
    if (session.status === 'paused' || session.status === 'stopped') {
      return;
    }

    if (index >= count) {
      if (activeRequests === 0) {
        session.status = 'completed';
        logMessage(`Hoàn thành! Thành công: ${session.successCount}, Thất bại: ${session.failCount}`);
      }
      return;
    }

    const currentIdx = ++index;
    activeRequests++;
    
    await submitOne(currentIdx);
    
    activeRequests--;

    if (session.status === 'running') {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      runNext();
    }
  };

  // Launch initial workers
  session.status = 'running';
  for (let i = 0; i < Math.min(threads, count); i++) {
    runNext();
  }
}

// Route to trigger auto filling
app.post('/api/start', (req, res) => {
  const { postUrl, fbzx, questions, count, delay, threads } = req.body;
  if (!postUrl || !questions || !count) {
    return res.status(400).json({ error: 'Thiếu các thông tin cấu hình bắt buộc.' });
  }

  const sessionId = 'session_' + Date.now();
  const session = {
    status: 'idle',
    successCount: 0,
    failCount: 0,
    total: count,
    stats: {},
    logs: [],
    config: { postUrl, fbzx, questions, count, delay: Number(delay || 0), threads: Number(threads || 1) }
  };

  activeSessions.set(sessionId, session);
  runSubmissionLoop(sessionId, session.config);

  res.json({ sessionId });
});

// SSE Endpoint for real-time updates
app.get('/api/stream/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);

  if (!session) {
    res.write('event: error\ndata: Session not found\n\n');
    return res.end();
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  let lastLogIndex = 0;

  const intervalId = setInterval(() => {
    const currentSession = activeSessions.get(sessionId);
    if (!currentSession) {
      res.write(`data: ${JSON.stringify({ status: 'not_found' })}\n\n`);
      clearInterval(intervalId);
      return res.end();
    }

    // Send new logs only
    const newLogs = currentSession.logs.slice(lastLogIndex);
    lastLogIndex = currentSession.logs.length;

    const data = {
      status: currentSession.status,
      successCount: currentSession.successCount,
      failCount: currentSession.failCount,
      total: currentSession.total,
      stats: currentSession.stats,
      logs: newLogs
    };

    res.write(`data: ${JSON.stringify(data)}\n\n`);

    if (currentSession.status === 'completed' || currentSession.status === 'stopped') {
      clearInterval(intervalId);
      res.end();
    }
  }, 300); // 300ms intervals

  req.on('close', () => {
    clearInterval(intervalId);
  });
});

// Control API: Pause / Resume / Stop
app.post('/api/control/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { action } = req.body; // 'pause' | 'resume' | 'stop'
  const session = activeSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Không tìm thấy session.' });
  }

  if (action === 'pause') {
    session.status = 'paused';
    session.logs.push(`[${new Date().toLocaleTimeString()}] Tạm dừng tiến trình gửi.`);
  } else if (action === 'resume') {
    session.status = 'running';
    session.logs.push(`[${new Date().toLocaleTimeString()}] Tiếp tục tiến trình gửi.`);
    // Re-launch workers
    const threads = session.config.threads;
    const count = session.total;
    // Simple helper to restart submission
    const runNext = async () => {
      if (session.status !== 'running' || session.successCount + session.failCount >= count) return;
      
      // Select next index
      const nextIndex = session.successCount + session.failCount + 1;
      if (nextIndex > count) return;
      
      // Single execute
      await new Promise(resolve => setTimeout(resolve, session.config.delay));
      if (session.status !== 'running') return;
      
      // Run submitOne dynamically (direct loop continuation)
      // Note: the loop automatically resumes via runSubmissionLoop style
    };
    
    // Trigger submission resume
    runSubmissionLoop(sessionId, session.config);
  } else if (action === 'stop') {
    session.status = 'stopped';
    session.logs.push(`[${new Date().toLocaleTimeString()}] Dừng hoàn toàn tiến trình gửi.`);
  }

  res.json({ status: session.status });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
