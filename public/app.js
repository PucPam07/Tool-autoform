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
  const submitDelayInput = document.getElementById('submit-delay');
  const btnStart = document.getElementById('btn-start');
  
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
      case 0: return 'Văn bản ngắn';
      case 1: return 'Đoạn văn';
      case 2: return 'Trắc nghiệm';
      case 3: return 'Hộp thả xuống';
      case 4: return 'Hộp kiểm';
      case 5: return 'Thang đo tuyến tính';
      case 7: return 'Lưới trắc nghiệm';
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

    fields.forEach((q) => {
      const isChoice = [2, 3, 4, 5, 7].includes(q.type);
      const card = document.createElement('div');
      card.className = 'question-card';
      card.dataset.qId = q.id;
      card.dataset.type = q.type;

      // Header row
      let headerHtml = `
        <div class="question-header">
          <div>
            <span class="question-title">${q.title}</span>
            ${q.required ? '<span style="color: var(--danger); margin-left: 4px; font-weight: bold;">*</span>' : ''}
          </div>
          <span class="question-type-badge">${getQuestionTypeLabel(q.type)}</span>
        </div>
      `;

      let contentHtml = '';

      if (isChoice) {
        // Render sliders for choice options
        contentHtml += `<div class="options-list">`;
        
        q.choices.forEach((choice, cIdx) => {
          // Default equal ratio initially
          const defaultRatio = Math.round(100 / q.choices.length);
          
          contentHtml += `
            <div class="option-row" data-choice-value="${choice}">
              <div class="option-text" title="${choice}">${choice}</div>
              <input type="range" class="ratio-slider" min="0" max="100" value="${defaultRatio}">
              <div class="ratio-input-wrapper">
                <input type="number" class="ratio-number" min="0" max="100" value="${defaultRatio}" style="width: 65px; padding: 4px 8px; text-align: center;">
                <span>%</span>
              </div>
            </div>
          `;
        });
        
        // Auto balance and status summary
        contentHtml += `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; border-top: 1px solid var(--border-glass); padding-top: 0.75rem;">
            <span class="ratio-sum-badge" style="font-size: 0.85rem; font-weight: 600; padding: 4px 8px; border-radius: 4px; background: rgba(16, 185, 129, 0.1); color: var(--success);">
              Tổng cộng: <span class="ratio-sum-value">100</span>%
            </span>
            <button class="btn btn-secondary btn-auto-balance" type="button" style="padding: 4px 10px; font-size: 0.8rem; border-radius: 6px;">
              <i data-lucide="scale" style="width: 14px; height: 14px;"></i>
              Chia đều
            </button>
          </div>
        `;
        
        contentHtml += `</div>`;
      } else {
        // Text / Paragraph question
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

      // Add slider and input interaction logic
      if (isChoice) {
        const optionRows = card.querySelectorAll('.option-row');
        const sumValueSpan = card.querySelector('.ratio-sum-value');
        const sumBadge = card.querySelector('.ratio-sum-badge');
        const btnBalance = card.querySelector('.btn-auto-balance');

        const updateSum = () => {
          let sum = 0;
          card.querySelectorAll('.ratio-number').forEach(num => {
            sum += Number(num.value || 0);
          });
          sumValueSpan.textContent = sum;

          // Color badge based on sum limit
          if (q.type === 4) {
            // For checkbox, ratios are independent check probabilities, so sum doesn't need to be 100%
            sumBadge.style.background = 'rgba(6, 182, 212, 0.1)';
            sumBadge.style.color = 'var(--secondary)';
            sumBadge.innerHTML = 'Hộp kiểm độc lập';
          } else {
            if (sum === 100) {
              sumBadge.style.background = 'rgba(16, 185, 129, 0.1)';
              sumBadge.style.color = 'var(--success)';
            } else {
              sumBadge.style.background = 'rgba(245, 158, 11, 0.1)';
              sumBadge.style.color = 'var(--warning)';
            }
          }
        };

        optionRows.forEach(row => {
          const slider = row.querySelector('.ratio-slider');
          const number = row.querySelector('.ratio-number');

          slider.addEventListener('input', () => {
            number.value = slider.value;
            updateSum();
          });

          number.addEventListener('input', () => {
            let val = Math.min(100, Math.max(0, Number(number.value || 0)));
            number.value = val;
            slider.value = val;
            updateSum();
          });
        });

        // Initialize equal distribution
        btnBalance.addEventListener('click', () => {
          const count = optionRows.length;
          const base = Math.floor(100 / count);
          const remainder = 100 - (base * count);

          optionRows.forEach((row, idx) => {
            const slider = row.querySelector('.ratio-slider');
            const number = row.querySelector('.ratio-number');
            const val = base + (idx < remainder ? 1 : 0);
            slider.value = val;
            number.value = val;
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
        const optionRows = card.querySelectorAll('.option-row');
        let sum = 0;

        optionRows.forEach(row => {
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
          ratios: ratios
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
          textValues: lines
        });
      }
    });

    if (validationFailed) return;

    const count = Number(submitCountInput.value || 100);
    const threads = Number(submitThreadsInput.value || 5);
    const delay = Number(submitDelayInput.value || 200);

    const payload = {
      postUrl: parsedFormData.postUrl,
      fbzx: parsedFormData.fbzx,
      questions,
      count,
      threads,
      delay
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
});
