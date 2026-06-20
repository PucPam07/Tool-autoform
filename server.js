import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Local JSON Database for saved forms
const historyFilePath = path.join(__dirname, 'data', 'history.json');
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(historyFilePath)) {
  fs.writeFileSync(historyFilePath, JSON.stringify([]));
}

function getHistory() {
  try {
    const content = fs.readFileSync(historyFilePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return [];
  }
}

function saveHistory(history) {
  fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2));
}

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

  const resolvedUrl = response.url || formUrl;
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
  const formTitle = (Array.isArray(formInfo) ? (formInfo[8] || formInfo[0]) : null) || 'Google Form Không Tên';
  const formDescription = '';

  // jsonData[1][1] contains the array of form items
  const fieldsArray = (Array.isArray(formInfo) && Array.isArray(formInfo[1])) ? formInfo[1] : [];
  const parsedFields = [];
  let pageCount = 1; // Start at 1 (page index 0 always exists)
  let currentPage = 0; // Tracks current page during parsing

  for (const field of fieldsArray) {
    if (!field) continue;
    
    const questionTitle = field[1] || '';
    const questionType = field[3];
    
    // type=8 in Google Forms JSON = PAGE BREAK (confirmed via form inspection).
    // Each page break adds one more page. Do NOT count type=6 (section titles on same page).
    if (questionType === 8) {
      pageCount++;
      currentPage++;
      continue;
    }

    // Skip non-input items (section titles, images, etc.) — they are NOT page breaks
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
          title: rowTitle || questionTitle,
          type: 7, // Grid sub-question
          choices: columns,
          required: required,
          pageIndex: currentPage
        });
      }
      continue;
    }

    const questionInfo = field[4][0];
    if (!questionInfo) continue;
    
    const entryId = questionInfo[0];
    if (!entryId && entryId !== 0) continue; // No input entry ID found

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
      required: required,
      pageIndex: currentPage
    });
  }

  // Find post URL
  const postUrl = resolvedUrl.replace('/viewform', '/formResponse');

  // Build pageHistory: EXACTLY the number of pages detected.
  // IMPORTANT: Google Forms returns HTTP 400 if pageHistory has MORE indices than actual pages.
  // type=8 items = page breaks. pageCount pages = indices 0 to pageCount-1.
  const pageHistory = Array.from({ length: pageCount }, (_, i) => i).join(',');

  console.log(`[Parse] Form: "${formTitle}" | Pages: ${pageCount} | pageHistory: "${pageHistory}" | Questions: ${parsedFields.length}`);

  return {
    formTitle,
    formDescription,
    fbzx,
    postUrl,
    pageCount,
    pageHistory,
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

function isWithinTimeWindow(config) {
  const { timeRestriction, timeStart, timeEnd } = config;
  if (!timeRestriction || timeRestriction === 'unlimited') {
    return true;
  }

  let startHour = 8, startMin = 0;
  let endHour = 17, endMin = 0;

  if (timeRestriction === 'office') {
    startHour = 8; startMin = 0;
    endHour = 17; endMin = 0;
  } else if (timeRestriction === 'custom' && timeStart && timeEnd) {
    const [sH, sM] = timeStart.split(':').map(Number);
    const [eH, eM] = timeEnd.split(':').map(Number);
    startHour = sH; startMin = sM;
    endHour = eH; endMin = eM;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();

  const startTotal = startHour * 60 + startMin;
  const endTotal = endHour * 60 + endMin;
  const currentTotal = currentHour * 60 + currentMin;

  if (startTotal <= endTotal) {
    return currentTotal >= startTotal && currentTotal <= endTotal;
  } else {
    // Spans across midnight
    return currentTotal >= startTotal || currentTotal <= endTotal;
  }
}

function getTimeWindowLabel(config) {
  if (config.timeRestriction === 'office') return '08:00 - 17:00';
  if (config.timeRestriction === 'custom') return `${config.timeStart} - ${config.timeEnd}`;
  return '24/7';
}

// Run the submission loop in background
async function runSubmissionLoop(sessionId, config) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const { postUrl, fbzx, questions, count, threads } = config;
  
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

  logMessage(`Bắt đầu chiến dịch tự động điền form: ${count} lượt gửi, luồng: ${threads}, trễ ngẫu nhiên: ${config.delayMin}-${config.delayMax}s, khung giờ: ${getTimeWindowLabel(config)}`);

  // Single submission worker — submits each page sequentially with proper session state
  // Maintains cookie jar + extracts new fbzx from each page response (like a real browser).
  const submitOne = async (submitIndex) => {
    try {
      const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const referer = postUrl.replace('/formResponse', '/viewform');
      const answersLog = [];

      // --- Phase 1: Generate all answers upfront ---
      const allAnswers = {}; // entryKey -> [values]

      for (const q of questions) {
        const entryKey = `entry.${q.id}`;

        if (q.type === 0 || q.type === 1) {
          const ans = generateTextAnswer(q, q.textValues);
          allAnswers[entryKey] = [ans];
          answersLog.push(`${q.title.substring(0, 15)}: "${ans}"`);
          if (!stats[q.id][ans]) stats[q.id][ans] = 0;
          stats[q.id][ans]++;
        } else if (q.type === 2 || q.type === 3 || q.type === 5 || q.type === 7) {
          const ans = chooseWeighted(q.choices, q.ratios || {});
          allAnswers[entryKey] = [ans];
          answersLog.push(`${q.title.substring(0, 15)}: "${ans}"`);
          if (stats[q.id][ans] === undefined) stats[q.id][ans] = 0;
          stats[q.id][ans]++;
        } else if (q.type === 4) {
          const selected = [];
          for (const choice of q.choices) {
            const prob = q.ratios ? Number(q.ratios[choice] || 0) : 50;
            if (Math.random() * 100 < prob) selected.push(choice);
          }
          if (q.required && selected.length === 0) {
            selected.push(chooseWeighted(q.choices, q.ratios || {}));
          }
          allAnswers[entryKey] = selected;
          answersLog.push(`${q.title.substring(0, 15)}: [${selected.join(', ')}]`);
          for (const ans of selected) {
            if (stats[q.id][ans] === undefined) stats[q.id][ans] = 0;
            stats[q.id][ans]++;
          }
        }
      }

      // --- Phase 2: Submit all answers in one single POST ---
      const formData = new URLSearchParams();
      formData.append('fvv', '1');
      formData.append('draftResponse', '[]');
      formData.append('pageHistory', config.pageHistory || '0');
      if (fbzx) {
        formData.append('fbzx', fbzx);
      }

      // Append all entry answers
      for (const entryKey in allAnswers) {
        const vals = allAnswers[entryKey];
        for (const v of vals) {
          formData.append(entryKey, v);
        }
      }

      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
        'Referer': referer,
        'Origin': 'https://docs.google.com'
      };

      const res = await fetch(postUrl, {
        method: 'POST',
        headers,
        body: formData.toString(),
        redirect: 'follow'
      });

      if (!res.ok) {
        session.failCount++;
        logMessage(`[Thất bại #${submitIndex}] HTTP ${res.status}`);
        return;
      }

      session.successCount++;
      logMessage(`[Thành công #${submitIndex}] ${answersLog.slice(0, 3).join(' | ')}${answersLog.length > 3 ? '...' : ''}`);

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

    // Check if within daily sending window
    while (!isWithinTimeWindow(config)) {
      if (session.status !== 'running') return;
      logMessage(`[Chờ khung giờ] Hiện tại đang ngoài khung giờ gửi cấu hình (${getTimeWindowLabel(config)}). Đang tạm nghỉ và sẽ kiểm tra lại sau 1 phút...`);
      await new Promise(resolve => setTimeout(resolve, 60000));
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
      // Calculate random delay range in milliseconds
      const minMs = (config.delayMin || 2) * 1000;
      const maxMs = (config.delayMax || 5) * 1000;
      const randomDelay = Math.random() * (maxMs - minMs) + minMs;

      if (randomDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, randomDelay));
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
  const { postUrl, fbzx, questions, count, threads, delayMin, delayMax, timeRestriction, timeStart, timeEnd, pageHistory, pageCount } = req.body;
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
    config: { 
      postUrl, 
      fbzx, 
      questions, 
      count, 
      threads: Number(threads || 1),
      delayMin: Number(delayMin !== undefined ? delayMin : 2),
      delayMax: Number(delayMax !== undefined ? delayMax : 5),
      timeRestriction: timeRestriction || 'unlimited',
      timeStart: timeStart || '08:00',
      timeEnd: timeEnd || '17:00',
      pageHistory: pageHistory || '0',
      pageCount: Number(pageCount || 1)
    }
  };

  activeSessions.set(sessionId, session);
  runSubmissionLoop(sessionId, session.config);

  res.json({ sessionId });
});

// API endpoint to retrieve all saved form configurations
app.get('/api/history', (req, res) => {
  res.json(getHistory());
});

// API endpoint to save/update a form configuration
app.post('/api/history/save', (req, res) => {
  const config = req.body;
  if (!config.formUrl || !config.formTitle) {
    return res.status(400).json({ error: 'Thiếu thông tin URL hoặc Tiêu đề form.' });
  }

  const history = getHistory();
  const existingIndex = history.findIndex(item => item.formUrl === config.formUrl);

  const newEntry = {
    id: existingIndex !== -1 ? history[existingIndex].id : 'form_' + Date.now(),
    formUrl: config.formUrl,
    formTitle: config.formTitle,
    formDescription: config.formDescription,
    fbzx: config.fbzx,
    postUrl: config.postUrl,
    fields: config.fields,
    savedConfig: config.savedConfig,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex !== -1) {
    history[existingIndex] = newEntry;
  } else {
    history.push(newEntry);
  }

  saveHistory(history);
  res.json({ success: true, entry: newEntry });
});

// API endpoint to delete a configuration from history
app.delete('/api/history/:id', (req, res) => {
  const { id } = req.params;
  const history = getHistory();
  const filtered = history.filter(item => item.id !== id);
  saveHistory(filtered);
  res.json({ success: true });
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
