document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // Page elements
  const btnParse = document.getElementById('btn-parse');
  const formUrlInput = document.getElementById('form-url');
  const errorBanner = document.getElementById('error-banner');
  const errorMessage = document.getElementById('error-message');
  const loadingContainer = document.getElementById('loading-container');
  const configSection = document.getElementById('config-section');
  const parsedFormTitle = document.getElementById('parsed-form-title');
  const parsedFormDesc = document.getElementById('parsed-form-desc');
  const questionsList = document.getElementById('questions-list');

  // Settings & Submission
  const submitCountInput = document.getElementById('submit-count');
  const submitThreadsInput = document.getElementById('submit-threads');
  const submitDelayMinInput = document.getElementById('submit-delay-min');
  const submitDelayMaxInput = document.getElementById('submit-delay-max');
  const timeRestrictionSelect = document.getElementById('time-restriction');
  const customTimeRangeContainer = document.getElementById('custom-time-range');
  const timeStartInput = document.getElementById('time-start');
  const timeEndInput = document.getElementById('time-end');
  const btnStart = document.getElementById('btn-start');
  const btnSaveConfig = document.getElementById('btn-save-config');

  // Navigation and Views
  const navHome = document.getElementById('nav-home');
  const navHistory = document.getElementById('nav-history');
  const viewHome = document.getElementById('view-home');
  const viewHistory = document.getElementById('view-history');
  const historyGrid = document.getElementById('history-grid');
  const historyListEmpty = document.getElementById('history-list-empty');

  // Dashboard & Real-time section
  const dashboardSection = document.getElementById('dashboard-section');
  const statSuccess = document.getElementById('stat-success');
  const statFail = document.getElementById('stat-fail');
  const statRemaining = document.getElementById('stat-remaining');
  const progressBar = document.getElementById('progress-bar');
  const logConsole = document.getElementById('log-console');
  const sessionStatusBadge = document.getElementById('session-status-badge');
  const chartsList = document.getElementById('charts-list');

  // Control buttons
  const btnPause = document.getElementById('btn-pause');
  const btnResume = document.getElementById('btn-resume');
  const btnStop = document.getElementById('btn-stop');
  const btnBackToConfig = document.getElementById('btn-back-to-config');

  // Application State
  let parsedFormData = null;
  let activeSessionId = null;
  let eventSource = null;
  let chartInstances = {}; // Map of question ID -> ChartJS instance

  // Helper: Show Error
  function showError(msg) {
    errorMessage.textContent = msg;
    errorBanner.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Helper: Hide Error
  function hideError() {
    errorBanner.classList.add('hidden');
  }

  // Helper: Get question type text
  function getQuestionTypeLabel(type) {
    switch (type) {
      case 0: return 'Văn Bản Ngắn';
      case 1: return 'Đoạn Văn';
      case 2: return 'Trắc Nghiệm';
      case 3: return 'Hộp Thả Xuống';
      case 4: return 'Hộp Kiểm';
      case 5: return 'Thang Đo Tuyến Tính';
      case 7: return 'Lưới Trắc Nghiệm';
      default: return 'Khác';
    }
  }

  // Event: Parse Form Link
  btnParse.addEventListener('click', async () => {
    const url = formUrlInput.value.trim();
    if (!url) {
      showError('Vui lòng nhập liên kết Google Form.');
      return;
    }

    hideError();
    loadingContainer.classList.remove('hidden');
    configSection.classList.add('hidden');
    dashboardSection.classList.add('hidden');
    questionsList.innerHTML = '';
    parsedFormData = null;

    try {
      const res = await fetch(`/api/parse-form?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Lỗi không xác định khi phân tích form.');
      }

      parsedFormData = data;
      parsedFormTitle.textContent = data.formTitle;
      parsedFormDesc.textContent = data.formDescription || 'Không có mô tả.';

      // Inject questions configuration
      renderQuestions(data.fields);

      loadingContainer.classList.add('hidden');
      configSection.classList.remove('hidden');
      lucide.createIcons();
    } catch (err) {
      loadingContainer.classList.add('hidden');
      showError(err.message);
    }
  });

  // Render question cards to UI
  function renderQuestions(fields) {
    if (fields.length === 0) {
      questionsList.innerHTML = `
        <div class="glass-panel flex-center" style="padding: 2rem; color: var(--text-secondary);">
          Không tìm thấy câu hỏi tương thích nào trong form này.
        </div>
      `;
      return;
    }

    fields.forEach((q, qIdx) => {
      const isChoice = [2, 3, 4, 5, 7].includes(q.type);
      const card = document.createElement('div');
      card.className = 'question-card';
      card.dataset.qId = q.id;
      card.dataset.type = q.type;
      card.dataset.pageIndex = q.pageIndex !== undefined ? q.pageIndex : 0;

      // Header row with index, title and badges (inspired by autofillform.com)
      let headerHtml = `
        <div class="question-header-wrapper">
          <div class="question-index">${qIdx + 1}</div>
          <div class="question-title-area">
            <span class="question-title">${q.title}</span>
            <div class="badge-container">
              <span class="badge badge-grey">${getQuestionTypeLabel(q.type)}</span>
              ${q.required ? '<span class="badge badge-danger"><i data-lucide="star" style="width:12px; height:12px;"></i> Bắt buộc</span>' : ''}
              ${isChoice && q.type !== 4 ? '<span class="badge sum-badge badge-danger"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="flex-shrink: 0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg> <span>Tổng: 0% (Thiếu 100%)</span></span>' : ''}
              ${q.type === 4 ? '<span class="badge badge-grey">Hộp kiểm độc lập</span>' : ''}
            </div>
          </div>
        </div>
      `;

      let contentHtml = '';

      if (isChoice) {
        contentHtml += `<div class="option-grid">`;
        
        q.choices.forEach((choice) => {
          const defaultRatio = Math.round(100 / q.choices.length);
          
          contentHtml += `
            <div class="option-card" data-choice-value="${choice}">
              <div class="option-card-title" title="${choice}">${choice}</div>
              <div class="percent-input-container">
                <input type="number" class="ratio-number" min="0" max="100" value="${defaultRatio}">
                <span class="percent-symbol">%</span>
              </div>
            </div>
          `;
        });
        
        contentHtml += `</div>`;
        
        // Auto balance button
        contentHtml += `
          <div style="display: flex; justify-content: flex-end; margin-top: 1rem; border-top: 1px solid var(--border-glass); padding-top: 0.75rem;">
            <button class="btn btn-secondary btn-auto-balance" type="button" style="padding: 6px 12px; font-size: 0.85rem; border-radius: 6px;">
              <i data-lucide="scale" style="width: 14px; height: 14px;"></i>
              <span>Chia đều</span>
            </button>
          </div>
        `;
      } else {
        contentHtml += `
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <label style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">
              Danh sách câu trả lời ngẫu nhiên (mỗi dòng một câu, bỏ trống để dùng mặc định):
            </label>
            <textarea class="text-values-input" rows="3" placeholder="Nhập câu trả lời 1&#10;Nhập câu trả lời 2&#10;Nhập câu trả lời 3" style="width: 100%; font-size: 0.9rem; resize: vertical;"></textarea>
          </div>
        `;
      }

      card.innerHTML = headerHtml + contentHtml;
      questionsList.appendChild(card);

      // Add input interaction logic
      if (isChoice) {
        const optionCards = Array.from(card.querySelectorAll('.option-card'));
        const sumBadge = card.querySelector('.sum-badge');
        const btnBalance = card.querySelector('.btn-auto-balance');

        const updateSum = () => {
          let sum = 0;
          card.querySelectorAll('.ratio-number').forEach(num => {
            sum += Number(num.value || 0);
          });

          if (q.type === 4) {
            // Checkbox sum is ignored (independent probabilities)
            return;
          }

          if (sum === 100) {
            sumBadge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle" style="flex-shrink: 0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> <span>Tổng: 100%</span>`;
            sumBadge.className = 'badge sum-badge badge-success';
          } else if (sum < 100) {
            sumBadge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="flex-shrink: 0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg> <span>Tổng: ${sum}% (Thiếu ${100 - sum}%)</span>`;
            sumBadge.className = 'badge sum-badge badge-danger';
          } else {
            sumBadge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="flex-shrink: 0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg> <span>Tổng: ${sum}% (Thừa ${sum - 100}%)</span>`;
            sumBadge.className = 'badge sum-badge badge-danger';
          }
        };

        // Register change listeners for number inputs
        optionCards.forEach(opCard => {
          const numberInput = opCard.querySelector('.ratio-number');

          numberInput.addEventListener('input', () => {
            let val = Number(numberInput.value || 0);
            if (val < 0) val = 0;
            if (val > 100) val = 100;
            numberInput.value = val;
            updateSum();
          });
        });

        // Initialize equal distribution
        btnBalance.addEventListener('click', () => {
          const count = optionCards.length;
          const base = Math.floor(100 / count);
          const remainder = 100 - (base * count);

          optionCards.forEach((opCard, idx) => {
            const numberInput = opCard.querySelector('.ratio-number');
            const val = base + (idx < remainder ? 1 : 0);
            numberInput.value = val;
          });
          updateSum();
        });

        // Initial sum check
        updateSum();
      }
    });
  }

  // Trigger submission execution
  btnStart.addEventListener('click', async () => {
    if (!parsedFormData) return;

    hideError();

    const questions = [];
    let validationFailed = false;

    // Collect configurations from card elements
    const cards = questionsList.querySelectorAll('.question-card');
    cards.forEach(card => {
      const qId = card.dataset.qId;
      const type = Number(card.dataset.type);
      const originalQuestion = parsedFormData.fields.find(f => String(f.id) === String(qId));

      const qTitle = originalQuestion.title;
      const qRequired = originalQuestion.required;

      if ([2, 3, 4, 5, 7].includes(type)) {
        // Collect ratios
        const ratios = {};
        const optionCards = card.querySelectorAll('.option-card');
        let sum = 0;

        optionCards.forEach(row => {
          const choiceVal = row.dataset.choiceValue;
          const ratioVal = Number(row.querySelector('.ratio-number').value || 0);
          ratios[choiceVal] = ratioVal;
          sum += ratioVal;
        });

        // If not checkbox (type 4), warning if sum is 0
        if (type !== 4 && sum === 0 && originalQuestion.choices.length > 0) {
          showError(`Câu hỏi "${qTitle}" chưa được cấu hình tỷ lệ lựa chọn (tổng tỷ lệ bằng 0).`);
          validationFailed = true;
          return;
        }

        questions.push({
          id: qId,
          type: type,
          title: qTitle,
          choices: originalQuestion.choices,
          required: qRequired,
          ratios: ratios,
          pageIndex: Number(card.dataset.pageIndex || 0)
        });
      } else {
        // Collect custom text responses
        const textAreas = card.querySelector('.text-values-input');
        const lines = textAreas.value.split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0);

        questions.push({
          id: qId,
          type: type,
          title: qTitle,
          required: qRequired,
          textValues: lines,
          pageIndex: Number(card.dataset.pageIndex || 0)
        });
      }
    });

    if (validationFailed) return;

    const count = Number(submitCountInput.value || 100);
    const threads = Number(submitThreadsInput.value || 5);
    const delayMin = Number(submitDelayMinInput.value || 2);
    const delayMax = Number(submitDelayMaxInput.value || 5);
    const timeRestriction = timeRestrictionSelect.value || 'unlimited';
    const timeStart = timeStartInput.value || '08:00';
    const timeEnd = timeEndInput.value || '17:00';

    const payload = {
      postUrl: parsedFormData.postUrl,
      fbzx: parsedFormData.fbzx,
      pageHistory: parsedFormData.pageHistory || '0',
      pageCount: parsedFormData.pageCount || 1,
      questions,
      count,
      threads,
      delayMin,
      delayMax,
      timeRestriction,
      timeStart,
      timeEnd
    };

    try {
      btnStart.disabled = true;
      btnStart.innerHTML = '<div class="spinner" style="width:16px; height:16px; border-width:2px;"></div><span>Đang kết nối...</span>';

      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Không thể bắt đầu gửi form.');

      activeSessionId = data.sessionId;

      // Clear logs and prepare dashboard UI
      logConsole.innerHTML = '';
      statSuccess.textContent = '0';
      statFail.textContent = '0';
      statRemaining.textContent = count;
      progressBar.style.width = '0%';
      sessionStatusBadge.textContent = 'Đang khởi tạo';

      // Init Chart views
      initCharts(questions, count);

      // Transition screen views
      configSection.classList.add('hidden');
      dashboardSection.classList.remove('hidden');

      // Connect to SSE stream channel
      startProgressStream(activeSessionId);
    } catch (err) {
      showError(err.message);
    } finally {
      btnStart.disabled = false;
      btnStart.innerHTML = '<i data-lucide="play"></i><span>Bắt đầu tự động gửi</span>';
      lucide.createIcons();
    }
  });

  // Initialize distribution charts
  function initCharts(questions, totalCount) {
    // Destroy existing chart elements and clear container
    chartsList.innerHTML = '';
    chartInstances = {};

    questions.forEach(q => {
      // Create chart views only for choice questions (trắc nghiệm, thả xuống, thang đo, v.v.)
      if (![2, 3, 4, 5, 7].includes(q.type)) return;

      const chartCard = document.createElement('div');
      chartCard.className = 'chart-card';

      const title = document.createElement('h4');
      title.className = 'chart-title';
      title.textContent = q.title;
      chartCard.appendChild(title);

      const chartWrapper = document.createElement('div');
      chartWrapper.className = 'chart-wrapper';
      const canvas = document.createElement('canvas');
      chartWrapper.appendChild(canvas);
      chartCard.appendChild(chartWrapper);

      chartsList.appendChild(chartCard);

      const labels = q.choices;

      // Calculate target counts based on user ratio configuration
      let targetPercentages = [];
      let targetCounts = [];
      let totalRatios = Object.values(q.ratios || {}).reduce((a, b) => a + b, 0);

      labels.forEach(choice => {
        const ratio = q.ratios ? (q.ratios[choice] || 0) : 0;
        targetPercentages.push(ratio);

        if (q.type === 4) {
          // Checkbox uses separate ratio probabilities (independent check occurrences)
          targetCounts.push(Math.round(totalCount * ratio / 100));
        } else {
          // Normalize targets so it matches proportional distribution
          const normalizedRatio = totalRatios > 0 ? (ratio / totalRatios) : (1 / labels.length);
          targetCounts.push(Math.round(totalCount * normalizedRatio));
        }
      });

      // Construct ChartJS horizontal double-bar layout (Target vs Actual)
      const ctx = canvas.getContext('2d');
      chartInstances[q.id] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Mục tiêu (Cấu hình)',
              data: targetCounts,
              backgroundColor: 'rgba(99, 102, 241, 0.25)',
              borderColor: 'rgba(99, 102, 241, 0.8)',
              borderWidth: 1,
              borderRadius: 4
            },
            {
              label: 'Thực tế (Thành công)',
              data: labels.map(() => 0), // Starts with zero actual hits
              backgroundColor: 'rgba(6, 182, 212, 0.7)',
              borderColor: 'rgba(6, 182, 212, 1)',
              borderWidth: 1,
              borderRadius: 4
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans', size: 10 } }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans' }, precision: 0 }
            },
            y: {
              grid: { display: false },
              ticks: { color: '#f3f4f6', font: { family: 'Plus Jakarta Sans', weight: 'bold' } }
            }
          }
        }
      });
    });
  }

  // Connect Server-Sent Events stream channel
  function startProgressStream(sessionId) {
    if (eventSource) {
      eventSource.close();
    }

    btnPause.classList.remove('hidden');
    btnResume.classList.add('hidden');

    eventSource = new EventSource(`/api/stream/${sessionId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.status === 'not_found') {
        showError('Không tìm thấy phiên làm việc.');
        eventSource.close();
        return;
      }

      // Update values
      statSuccess.textContent = data.successCount;
      statFail.textContent = data.failCount;
      const totalSent = data.successCount + data.failCount;
      const remaining = Math.max(0, data.total - totalSent);
      statRemaining.textContent = remaining;

      // Update progress bar
      const progressPercent = Math.min(100, (totalSent / data.total) * 100);
      progressBar.style.width = `${progressPercent}%`;

      // Update Badge Status
      updateStatusBadge(data.status);

      // Append new logs to terminal console
      if (data.logs && data.logs.length > 0) {
        data.logs.forEach(log => {
          const div = document.createElement('div');
          div.className = 'log-entry';
          if (log.includes('Thất bại') || log.includes('Lỗi')) {
            div.className += ' error';
          } else if (log.includes('Bắt đầu') || log.includes('Hoàn thành')) {
            div.className += ' system';
          }
          div.textContent = log;
          logConsole.appendChild(div);
        });
        // Scroll terminal to bottom
        logConsole.scrollTop = logConsole.scrollHeight;
      }

      // Update Chart actual values
      if (data.stats) {
        Object.keys(data.stats).forEach(qId => {
          const chart = chartInstances[qId];
          if (!chart) return;

          const questionStats = data.stats[qId];
          const labels = chart.data.labels;
          const actualData = labels.map(label => questionStats[label] || 0);

          chart.data.datasets[1].data = actualData;
          chart.update('none'); // Update without full animation cycle for performance
        });
      }

      // Handle termination status
      if (data.status === 'completed' || data.status === 'stopped' || data.status === 'failed') {
        eventSource.close();
        btnPause.classList.add('hidden');
        btnResume.classList.add('hidden');
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      const div = document.createElement('div');
      div.className = 'log-entry error';
      div.textContent = `[Lỗi hệ thống] Mất kết nối tới máy chủ. Thử kết nối lại...`;
      logConsole.appendChild(div);
      logConsole.scrollTop = logConsole.scrollHeight;
    };
  }

  function updateStatusBadge(status) {
    sessionStatusBadge.textContent = status === 'running' ? 'Đang chạy' :
      status === 'paused' ? 'Đã tạm dừng' :
        status === 'stopped' ? 'Đã dừng' :
          status === 'completed' ? 'Hoàn thành' : status;

    if (status === 'running') {
      sessionStatusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
      sessionStatusBadge.style.color = '#34d399';
    } else if (status === 'paused') {
      sessionStatusBadge.style.background = 'rgba(245, 158, 11, 0.2)';
      sessionStatusBadge.style.color = '#fbbf24';
    } else if (status === 'stopped' || status === 'failed') {
      sessionStatusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
      sessionStatusBadge.style.color = '#f87171';
    } else if (status === 'completed') {
      sessionStatusBadge.style.background = 'rgba(59, 130, 246, 0.2)';
      sessionStatusBadge.style.color = '#60a5fa';
    }
  }

  // Trigger Action on Active Session
  async function triggerControl(action) {
    if (!activeSessionId) return;

    try {
      const res = await fetch(`/api/control/${activeSessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();

      updateStatusBadge(data.status);

      if (action === 'pause') {
        btnPause.classList.add('hidden');
        btnResume.classList.remove('hidden');
      } else if (action === 'resume') {
        btnPause.classList.remove('hidden');
        btnResume.classList.add('hidden');
        // Restart SSE channel listener
        startProgressStream(activeSessionId);
      } else if (action === 'stop') {
        btnPause.classList.add('hidden');
        btnResume.classList.add('hidden');
        if (eventSource) eventSource.close();
      }
      lucide.createIcons();
    } catch (err) {
      showError(err.message);
    }
  }

  btnPause.addEventListener('click', () => triggerControl('pause'));
  btnResume.addEventListener('click', () => triggerControl('resume'));
  btnStop.addEventListener('click', () => triggerControl('stop'));

  btnBackToConfig.addEventListener('click', () => {
    if (eventSource) {
      eventSource.close();
    }
    dashboardSection.classList.add('hidden');
    configSection.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 1. Time restriction dropdown show/hide logic
  timeRestrictionSelect.addEventListener('change', () => {
    if (timeRestrictionSelect.value === 'custom') {
      customTimeRangeContainer.classList.remove('hidden');
    } else {
      customTimeRangeContainer.classList.add('hidden');
    }
  });

  // 2. Navigation menu logic
  navHome.addEventListener('click', (e) => {
    e.preventDefault();
    navHome.classList.add('active');
    navHistory.classList.remove('active');
    viewHome.classList.remove('hidden');
    viewHistory.classList.add('hidden');
  });

  navHistory.addEventListener('click', (e) => {
    e.preventDefault();
    navHistory.classList.add('active');
    navHome.classList.remove('active');
    viewHistory.classList.remove('hidden');
    viewHome.classList.add('hidden');
    loadHistory();
  });

  // 3. Load history and render grid list
  async function loadHistory() {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();

      if (data.length === 0) {
        historyListEmpty.classList.remove('hidden');
        historyGrid.classList.add('hidden');
        return;
      }

      historyListEmpty.classList.add('hidden');
      historyGrid.classList.remove('hidden');
      historyGrid.innerHTML = '';

      data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';

        const updatedDate = new Date(item.updatedAt).toLocaleString('vi-VN');
        const qCount = item.fields ? item.fields.length : 0;

        card.innerHTML = `
          <div class="history-card-header">
            <h4 class="history-card-title" title="${item.formTitle}">${item.formTitle}</h4>
            <div class="history-card-url" title="${item.formUrl}">${item.formUrl}</div>
          </div>
          <div class="history-card-meta">
            <div class="history-meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-help-circle"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
              <span>${qCount} câu hỏi</span>
            </div>
            <div class="history-meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>Lưu: ${updatedDate}</span>
            </div>
          </div>
          <div class="history-card-actions">
            <button class="btn btn-load-config" data-id="${item.id}" style="flex: 1; padding: 8px 12px; font-size: 0.85rem; border-radius: 6px; justify-content: center; align-items: center; gap: 4px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>
              <span>Tải cấu hình</span>
            </button>
            <button class="btn btn-danger btn-delete-config" data-id="${item.id}" style="padding: 8px 12px; font-size: 0.85rem; border-radius: 6px; justify-content: center; align-items: center;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </button>
          </div>
        `;
        historyGrid.appendChild(card);
      });

      // Register click actions for history items
      historyGrid.querySelectorAll('.btn-load-config').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const entry = data.find(item => item.id === id);
          if (entry) {
            loadSavedConfig(entry);
          }
        });
      });

      historyGrid.querySelectorAll('.btn-delete-config').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (confirm('Bạn chắc chắn muốn xóa cấu hình form này khỏi lịch sử chứ?')) {
            try {
              const delRes = await fetch(`/api/history/${id}`, { method: 'DELETE' });
              if (delRes.ok) {
                loadHistory();
              }
            } catch (err) {
              alert('Không thể xóa cấu hình: ' + err.message);
            }
          }
        });
      });

    } catch (err) {
      console.error('Lỗi khi tải lịch sử:', err);
    }
  }

  // 4. Load saved configuration into the UI page
  function loadSavedConfig(entry) {
    // 1. Fill URL
    formUrlInput.value = entry.formUrl;
    parsedFormData = {
      formTitle: entry.formTitle,
      formDescription: entry.formDescription,
      fbzx: entry.fbzx,
      postUrl: entry.postUrl,
      fields: entry.fields
    };

    // 2. Render questions
    parsedFormTitle.textContent = entry.formTitle;
    parsedFormDesc.textContent = entry.formDescription || 'Không có mô tả.';
    renderQuestions(entry.fields);

    // 3. Fill settings
    const saved = entry.savedConfig || {};
    submitCountInput.value = saved.submitCount || 100;
    submitThreadsInput.value = saved.submitThreads || 5;
    submitDelayMinInput.value = saved.delayMin !== undefined ? saved.delayMin : 2;
    submitDelayMaxInput.value = saved.delayMax !== undefined ? saved.delayMax : 5;
    timeRestrictionSelect.value = saved.timeRestriction || 'unlimited';
    timeStartInput.value = saved.timeStart || '08:00';
    timeEndInput.value = saved.timeEnd || '17:00';

    // Show/hide custom time bounds container
    if (saved.timeRestriction === 'custom') {
      customTimeRangeContainer.classList.remove('hidden');
    } else {
      customTimeRangeContainer.classList.add('hidden');
    }

    // 4. Load questions inputs (ratios and texts)
    const cards = questionsList.querySelectorAll('.question-card');
    cards.forEach(card => {
      const qId = card.dataset.qId;
      const type = Number(card.dataset.type);
      const savedQ = saved.questions ? saved.questions.find(q => String(q.id) === String(qId)) : null;

      if (savedQ) {
        if ([2, 3, 4, 5, 7].includes(type) && savedQ.ratios) {
          // Fill option ratios
          card.querySelectorAll('.option-card').forEach(opCard => {
            const val = opCard.getAttribute('data-choice-value');
            const ratioVal = savedQ.ratios[val] !== undefined ? savedQ.ratios[val] : 0;
            opCard.querySelector('.ratio-number').value = ratioVal;
          });
          // Update sum validation badge
          const updateSumBtn = card.querySelector('.btn-auto-balance');
          if (updateSumBtn) {
            // Find inputs change listener and trigger input event to refresh sum
            const input = card.querySelector('.ratio-number');
            if (input) {
              input.dispatchEvent(new Event('input'));
            }
          }
        } else if (savedQ.textValues) {
          // Fill custom texts
          const textAreas = card.querySelector('.text-values-input');
          if (textAreas) {
            textAreas.value = savedQ.textValues.join('\n');
          }
        }
      }
    });

    // 5. Hide history view and show home view
    navHome.classList.add('active');
    navHistory.classList.remove('active');
    viewHome.classList.remove('hidden');
    viewHistory.classList.add('hidden');
    configSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });
    lucide.createIcons();
  }

  // 5. Save current UI configuration to DB
  btnSaveConfig.addEventListener('click', async () => {
    if (!parsedFormData) {
      showError('Chưa có cấu hình form nào để lưu. Vui lòng phân tích form trước.');
      return;
    }

    // Gather questions config from cards
    const questions = [];
    const cards = questionsList.querySelectorAll('.question-card');
    cards.forEach(card => {
      const qId = card.dataset.qId;
      const type = Number(card.dataset.type);

      if ([2, 3, 4, 5, 7].includes(type)) {
        const ratios = {};
        card.querySelectorAll('.option-card').forEach(opCard => {
          const choiceVal = opCard.getAttribute('data-choice-value');
          const ratioVal = Number(opCard.querySelector('.ratio-number').value || 0);
          ratios[choiceVal] = ratioVal;
        });
        questions.push({ id: qId, ratios });
      } else {
        const textAreas = card.querySelector('.text-values-input');
        const lines = textAreas ? textAreas.value.split('\n').map(l => l.trim()).filter(l => l.length > 0) : [];
        questions.push({ id: qId, textValues: lines });
      }
    });

    const payload = {
      formUrl: formUrlInput.value.trim(),
      formTitle: parsedFormData.formTitle,
      formDescription: parsedFormData.formDescription,
      fbzx: parsedFormData.fbzx,
      postUrl: parsedFormData.postUrl,
      fields: parsedFormData.fields,
      savedConfig: {
        submitCount: Number(submitCountInput.value || 100),
        submitThreads: Number(submitThreadsInput.value || 5),
        delayMin: Number(submitDelayMinInput.value || 2),
        delayMax: Number(submitDelayMaxInput.value || 5),
        timeRestriction: timeRestrictionSelect.value || 'unlimited',
        timeStart: timeStartInput.value || '08:00',
        timeEnd: timeEndInput.value || '17:00',
        questions
      }
    };

    try {
      btnSaveConfig.disabled = true;
      const text = btnSaveConfig.querySelector('span');
      const origText = text.textContent;
      text.textContent = 'Đang lưu...';

      const res = await fetch('/api/history/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Lỗi khi lưu cấu hình.');

      text.textContent = 'Đã lưu thành công!';
      setTimeout(() => {
        text.textContent = origText;
        btnSaveConfig.disabled = false;
      }, 1500);

    } catch (err) {
      showError(err.message);
      btnSaveConfig.disabled = false;
    }
  });
});
