let questions = [],
  selected = [],
  current = 0,
  timeLeft = 0,
  endTime = 0,
  clock = null,
  mode = "",
  answers = [];

/* 工具 */
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const load = async (l) => await (await fetch(`questions_${l}.json`)).json();

/* 抽取：单选在前，多选在后，category 去重 */
const pick = (l) => {
  const singleNeed = l === "A" ? 32 : l === "B" ? 45 : 70;
  const multiNeed = l === "A" ? 8 : l === "B" ? 15 : 20;

  const single = [],
    multi = [];
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
  let html = `<div class="question">${current + 1}. ${q.question}`;
  if (q.image)
    html += `<br><img src="${q.image}" alt="题目相关图片" style="max-width:100%;border-radius:8px">`;
  html += `<div class="options">`;
  q.options.forEach((t, i) => {
    const v = String.fromCharCode(65 + i);
    html += `<label><input type="${type}" name="q" value="${v}" aria-label="选项 ${v}">${v}. ${t}</label>`;
  });
  html += `</div></div>`;
  document.getElementById("quiz").innerHTML = html;
  document
    .querySelectorAll('input[name="q"]')
    .forEach((inp) => (inp.onchange = checkAnswer));
  document.getElementById("nextBtn").disabled = true;
};

/* 高精度倒计时 */
const startTimer = () => {
  endTime = Date.now() + timeLeft * 1000;
  const tick = () => {
    const left = Math.max(0, endTime - Date.now());
    const m = String(Math.floor(left / 60000)).padStart(2, "0");
    const s = String(Math.floor(left / 1000) % 60).padStart(2, "0");
    document.getElementById("timer").textContent = `${m}:${s}`;
    if (left === 0) {
      clearInterval(clock);
      submitQuiz();
    }
  };
  tick();
  clock = setInterval(tick, 250);
};

/* 判分 */
const submitQuiz = () => {
  clearInterval(clock);
  const l = document.getElementById("level").value;
  const pass = { A: 30, B: 45, C: 70 }[l];
  let score = 0,
    wrong = [];
  answers = mode === "batch"
    ? Array.from({ length: selected.length }, (_, i) =>
        [...document.querySelectorAll(`input[name=q${i}]:checked`)].map((e) =>
          e.value
        ).sort()
      )
    : answers;
  selected.forEach((q, i) => {
    const user = answers[i] || [];
    const right = q.correct.split("").sort();
    if (user.join("") === right.join("")) score++;
    else {
      const userText = user.map(v => q.options[v.charCodeAt(0) - 65]).join(", ");
      const correctText = q.correct.split("").map(v => q.options[v.charCodeAt(0) - 65]).join(", ");
      wrong.push({ ...q, user, userText, correctText });
    }
  });
  const res = document.getElementById("result");
  res.innerHTML =
    `<h2>得分：${score}/${selected.length}</h2>` +
    `<p style="color:${score >= pass ? "var(--success)" : "var(--danger)"}">${score >= pass ? "恭喜通过！" : "未通过，请继续努力！"}</p>`;
  if (wrong.length) {
    res.innerHTML += "<h3>错题回顾：</h3>";
    wrong.forEach(
      (w) =>
        (res.innerHTML += `<div><p><strong>题目：</strong>${w.question}</p><p><strong>你的答案：</strong><span style="color:var(--danger)">${w.user.join("") || "未选择"} (${w.userText || "无"})</span></p><p><strong>正确答案：</strong><span style="color:var(--success)">${w.correct} (${w.correctText})</span></p></div>`)
    );
  }
  ["quiz", "timer", "submitBtn", "nextBtn", "prevBtn"].forEach(
    (id) => (document.getElementById(id).style.display = "none")
  );
  res.style.display = "block";
};

/* 随机抽题 */
const startQuiz = async () => {
  mode = "batch";
  const l = document.getElementById("level").value;
  questions = await load(l);
  selected = pick(l);
  timeLeft = { A: 2400, B: 3600, C: 5400 }[l];
  answers = Array(selected.length).fill(null);
  document.getElementById("quiz").innerHTML = selected
    .map((q, i) => {
      syncOptions(q);
      const multi = /MC(?!1)/.test(q.type);
      const type = multi ? "checkbox" : "radio";
      let html = `<div class="question">${i + 1}. ${q.question}`;
      if (q.image)
        html += `<br><img src="${q.image}" alt="题目相关图片" style="max-width:100%;border-radius:8px">`;
      html += `<div class="options">`;
      q.options.forEach((t, j) => {
        const v = String.fromCharCode(65 + j);
        html += `<label><input type="${type}" name="q${i}" value="${v}" aria-label="选项 ${v}">${v}. ${t}</label>`;
      });
      html += `</div></div>`;
      return html;
    })
    .join("");
  ["quiz", "timer", "submitBtn"].forEach(
    (id) => (document.getElementById(id).style.display = "block")
  );
  ["nextBtn", "prevBtn", "result"].forEach(
    (id) => (document.getElementById(id).style.display = "none")
  );
  startTimer();
};

/* 逐题答题 */
const startSequential = async () => {
  mode = "seq";
  const l = document.getElementById("level").value;
  questions = await load(l);
  const single = questions.filter((q) => /MC1/.test(q.type.split("-")[0]));
  const multi = questions.filter((q) => /MC(?!1)/.test(q.type.split("-")[0]));
  selected = [...single, ...multi];
  answers = Array(selected.length).fill(null);
  current = 0;
  render(selected[current]);
  ["quiz", "nextBtn", "prevBtn"].forEach(
    (id) => (document.getElementById(id).style.display = "block")
  );
  ["timer", "submitBtn", "result"].forEach(
    (id) => (document.getElementById(id).style.display = "none")
  );
  document.getElementById("prevBtn").style.display = current > 0 ? "block" : "none";
  document.getElementById("nextBtn").disabled = true;
};

/* 逐题检查答案 */
const checkAnswer = () => {
  const q = selected[current];
  const user = [...document.querySelectorAll('input[name="q"]:checked')].map(
    (e) => e.value
  ).sort();
  answers[current] = user;
  const right = q.correct.split("").sort();
  document.getElementById("nextBtn").disabled = user.join("") !== right.join("");
};

/* 上一题 */
const prevQuestion = () => {
  if (current > 0) {
    current--;
    render(selected[current]);
    document.getElementById("prevBtn").style.display = current > 0 ? "block" : "none";
    document.getElementById("nextBtn").disabled = !answers[current];
  }
};

/* 下一题 */
const nextQuestion = () => {
  current++;
  if (current < selected.length) {
    render(selected[current]);
    document.getElementById("prevBtn").style.display = "block";
    document.getElementById("nextBtn").disabled = !answers[current];
  } else {
    submitQuiz();
  }
};

/* 黑暗模式切换 */
const toggleDark = () => {
  document.body.classList.toggle("dark-mode");
  const darkModeBtn = document.getElementById("darkModeBtn");
  if (document.body.classList.contains("dark-mode")) {
    darkModeBtn.innerHTML = '<i class="fas fa-sun"></i>';
  } else {
    darkModeBtn.innerHTML = '<i class="fas fa-moon"></i>';
  }
};