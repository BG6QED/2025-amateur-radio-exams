let questions = [],
  selected = [],
  current = 0,
  timeLeft = 0,
  endTime = 0,
  clock = null,
  mode = "",
  startTime = 0;

// Cookie工具函数
const setCookie = (name, value, days = 365) => {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))}; expires=${expires}; path=/`;
};

const getCookie = (name) => {
  const value = document.cookie
    .split('; ')
    .find(row => row.startsWith(name + '='));
  return value ? JSON.parse(decodeURIComponent(value.split('=')[1])) : null;
};

const deleteCookie = (name) => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
};

/* 工具 */
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const load = async (l) => {
  try {
    return await (await fetch(`questions_${l}.json`)).json();
  } catch (e) {
    console.error('加载题库失败:', e);
    return [];
  }
};

/* 初始化设置 */
const initializeSettings = () => {
  // 恢复深色模式
  const darkMode = getCookie('darkMode');
  if (darkMode) {
    document.body.classList.toggle('dark-mode', darkMode);
    updateDarkModeIcon(darkMode);
  }

  // 恢复逐题答题进度
  const sequentialProgress = getCookie('sequentialProgress');
  if (sequentialProgress) {
    document.getElementById('level').value = sequentialProgress.level;
  }

  // 显示历史成绩图表
  renderHistoryChart();
};

const updateDarkModeIcon = (isDark) => {
  const icon = document.querySelector('#darkModeBtn i');
  icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
};

/* 抽取：单选在前，多选在后，category 去重 */
const pick = (l) => {
  const singleNeed = l === "A" ? 32 : l === "B" ? 45 : 70;
  const multiNeed = l === "A" ? 8 : l === "B" ? 15 : 20;

  const single = [], multi = [];
  questions.forEach((q) => {
    const typeCode = q.type.split("-")[0];
    (/MC1/.test(typeCode) ? single : multi).push(q);
  });

  const used = new Set();
  const unique = (arr) =>
    arr.filter((q) => {
      if (used.has(q.category)) return false;
      used.add(q.category);
      return true;
    });

  const s = shuffle(unique(shuffle(single))).slice(0, singleNeed);
  used.clear();
  const m = shuffle(unique(shuffle(multi))).slice(0, multiNeed);
  return [...s, ...m];
};

/* 打乱选项并同步 correct */
const syncOptions = (q) => {
  const correct = q.correct.split("").map((c) => c.charCodeAt(0) - 65);
  const opts = q.options.map((t, i) => ({ t, i }));
  shuffle(opts);
  q.options = opts.map((o) => o.t);
  q.correct = opts
    .map((o, i) => (correct.includes(o.i) ? i : null))
    .filter((v) => v !== null)
    .map((i) => String.fromCharCode(i + 65))
    .join("");
};

/* 渲染一题 */
const render = (q) => {
  syncOptions(q);
  const multi = /MC(?!1)/.test(q.type);
  const type = multi ? "checkbox" : "radio";
  
  let html = `
    <article class="question-container">
      <h3 class="question-title">${current + 1}. ${q.question}</h3>
  `;
  
  if (q.image) {
    html += `<img src="${q.image}" alt="题目图片" class="question-image">`;
  }
  
  html += `<div class="options" role="group" aria-labelledby="question-${current}">`;
  q.options.forEach((t, i) => {
    const v = String.fromCharCode(65 + i);
    html += `
      <label class="option-label">
        <input type="${type}" name="q" value="${v}" aria-describedby="option-${v}">
        <span class="option-text">${v}. ${t}</span>
      </label>
    `;
  });
  html += '</div></article>';
  
  document.getElementById("quiz").innerHTML = html;
  document.querySelectorAll('input[name="q"]').forEach(inp => inp.addEventListener('change', checkAnswer));
  
  // 更新按钮状态
  document.getElementById("nextBtn").disabled = true;
  document.getElementById("prevBtn").disabled = current === 0;
};

/* 高精度倒计时 */
const startTimer = () => {
  startTime = Date.now();
  endTime = startTime + timeLeft * 1000;
  
  const tick = () => {
    const left = Math.max(0, endTime - Date.now());
    const m = String(Math.floor(left / 60000)).padStart(2, "0");
    const s = String(Math.floor(left / 1000) % 60).padStart(2, "0");
    document.getElementById("timeDisplay").textContent = `${m}:${s}`;
    
    if (left === 0) {
      clearInterval(clock);
      submitQuiz();
    }
  };
  
  tick();
  clock = setInterval(tick, 250);
};

/* 保存历史记录 */
const saveHistory = (level, score, total, timeUsed) => {
  const history = getCookie('examHistory') || [];
  history.push({
    date: new Date().toISOString(),
    level,
    score,
    total,
    timeUsed: Math.floor(timeUsed / 1000),
    percentage: Math.round((score / total) * 100)
  });
  
  // 限制历史记录数量
  if (history.length > 50) history.shift();
  
  setCookie('examHistory', history);
  renderHistoryChart();
};

/* 渲染历史图表 */
const renderHistoryChart = () => {
  const history = getCookie('examHistory');
  if (!history || history.length === 0) {
    document.getElementById('history-section').style.display = 'none';
    return;
  }

  document.getElementById('history-section').style.display = 'block';
  
  const ctx = document.getElementById('historyChart').getContext('2d');
  
  // 销毁旧图表
  if (window.historyChart) window.historyChart.destroy();
  
  const labels = history.map(h => new Date(h.date).toLocaleDateString('zh-CN'));
  const data = history.map(h => h.percentage);
  
  window.historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '正确率 (%)',
        data,
        borderColor: 'var(--primary)',
        backgroundColor: 'rgba(0, 82, 204, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            stepSize: 20
          }
        }
      }
    }
  });
};

/* 判分 */
const submitQuiz = () => {
  clearInterval(clock);
  const l = document.getElementById("level").value;
  const pass = { A: 30, B: 45, C: 70 }[l];
  let score = 0, wrong = [];
  
  const timeUsed = Date.now() - startTime;
  
  const answers = mode === "batch"
    ? Array.from({ length: selected.length }, (_, i) =>
        [...document.querySelectorAll(`input[name=q${i}]:checked`)].map(e => e.value).sort()
      )
    : [[...document.querySelectorAll('input[name="q"]:checked')].map(e => e.value).sort()];
  
  selected.forEach((q, i) => {
    const user = answers[i] || [];
    const right = q.correct.split("").sort();
    
    if (user.join("") === right.join("")) {
      score++;
    } else {
      wrong.push({ ...q, user: user.join(""), correctOptions: right });
    }
  });

  // 保存历史记录
  saveHistory(l, score, selected.length, timeUsed);

  const res = document.getElementById("result");
  let html = `
    <h2>得分：${score}/${selected.length}</h2>
    <p class="result-status ${score >= pass ? 'success' : 'error'}">
      ${score >= pass ? '<i class="fas fa-check-circle"></i> 恭喜通过！' : '<i class="fas fa-times-circle"></i> 未通过，请继续努力！'}
    </p>
    <p class="time-info">用时：${Math.floor(timeUsed / 1000)}秒</p>
  `;
  
  if (wrong.length) {
    html += '<h3><i class="fas fa-times"></i> 错题回顾：</h3>';
    wrong.forEach(w => {
      const correctContents = w.correct.split('').map(c => 
        `${c}. ${w.options[c.charCodeAt(0) - 65]}`
      ).join('<br>');
      
      html += `
        <div class="wrong-question">
          <p><strong>题目：</strong>${w.question}</p>
          <p><strong>你的答案：</strong><span class="wrong-answer">${w.user || '未作答'}</span></p>
          <p><strong>正确答案：</strong><span class="correct-answer">${w.correct}</span></p>
          <div class="correct-options">
            <strong>正确答案内容：</strong><br>${correctContents}
          </div>
        </div>
      `;
    });
  }
  
  res.innerHTML = html;
  
  ["quiz", "timer", "submitBtn", "nextBtn", "prevBtn"].forEach(
    id => document.getElementById(id).style.display = "none"
  );
  
  res.style.display = "block";
  
  // 清除逐题答题进度
  if (mode === 'seq') {
    deleteCookie('sequentialProgress');
  }
};

/* 随机抽题：抽完即显示，等待用户答题 */
const startQuiz = async () => {
  mode = "batch";
  const l = document.getElementById("level").value;
  questions = await load(l);
  selected = pick(l);
  timeLeft = { A: 2400, B: 3600, C: 5400 }[l];
  
  const html = selected.map((q, i) => {
    syncOptions(q);
    const multi = /MC(?!1)/.test(q.type);
    const type = multi ? "checkbox" : "radio";
    
    return `
      <article class="question-container">
        <h3 class="question-title">${i + 1}. ${q.question}</h3>
        ${q.image ? `<img src="${q.image}" alt="题目图片" class="question-image">` : ''}
        <div class="options" role="group" aria-labelledby="question-${i}">
          ${q.options.map((t, j) => {
            const v = String.fromCharCode(65 + j);
            return `
              <label class="option-label">
                <input type="${type}" name="q${i}" value="${v}" aria-describedby="option-${i}-${v}">
                <span class="option-text">${v}. ${t}</span>
              </label>
            `;
          }).join('')}
        </div>
      </article>
    `;
  }).join("");
  
  document.getElementById("quiz").innerHTML = html;
  ["quiz", "timer", "submitBtn"].forEach(id => document.getElementById(id).style.display = "block");
  ["nextBtn", "prevBtn", "result"].forEach(id => document.getElementById(id).style.display = "none");
  
  startTimer();
};

/* 逐题答题：题库全部题目，顺序做，不随机 */
const startSequential = async () => {
  mode = "seq";
  const l = document.getElementById("level").value;
  questions = await load(l);
  
  const single = questions.filter(q => /MC1/.test(q.type.split("-")[0]));
  const multi = questions.filter(q => /MC(?!1)/.test(q.type.split("-")[0]));
  selected = [...single, ...multi];
  
  const progress = getCookie('sequentialProgress');
  if (progress && progress.level === l) {
    current = progress.current || 0;
  } else {
    current = 0;
  }
  
  render(selected[current]);
  
  ["quiz", "nextBtn", "prevBtn"].forEach(id => document.getElementById(id).style.display = "block");
  ["timer", "submitBtn", "result"].forEach(id => document.getElementById(id).style.display = "none");
  
  saveSequentialProgress();
};

/* 保存逐题答题进度 */
const saveSequentialProgress = () => {
  if (mode === 'seq') {
    setCookie('sequentialProgress', {
      level: document.getElementById("level").value,
      current: current
    });
  }
};

/* 逐题检查答案，仅启用按钮 */
const checkAnswer = () => {
  const q = selected[current];
  const user = [...document.querySelectorAll('input[name="q"]:checked')].map(e => e.value).sort();
  const right = q.correct.split("").sort();
  
  const isCorrect = user.join("") === right.join("");
  document.getElementById("nextBtn").disabled = !isCorrect;
};

/* 逐题上一题 */
const prevQuestion = () => {
  if (current > 0) {
    current--;
    render(selected[current]);
    saveSequentialProgress();
  }
};

/* 逐题下一题 */
const nextQuestion = () => {
  current++;
  if (current < selected.length) {
    render(selected[current]);
    saveSequentialProgress();
  } else {
    submitQuiz();
  }
};

const toggleDark = () => {
  const isDark = document.body.classList.toggle('dark-mode');
  setCookie('darkMode', isDark);
  updateDarkModeIcon(isDark);
};

// 初始化
document.addEventListener('DOMContentLoaded', initializeSettings);