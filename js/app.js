/* Clinic Kōrero: clinic English for a Chinese medicine practitioner in Aotearoa New Zealand.
   Everything is stored on the phone (localStorage). No accounts, no server. */
'use strict';

const APP_VERSION = '0.1.0';
const KEY = 'ck-state-v1';
const DAY_GOAL_MIN = 60;
const UNIT_FILES = ['unit01'];

// Course outline. Units without a file show as "coming soon".
const SYLLABUS = [
  { no: 1, title: 'First Visit: A Sore Back', zh: '初診：腰痛（ACC 傷科）' },
  { no: 2, title: 'Neck and Shoulder Tension', zh: '肩頸僵硬：上班族' },
  { no: 3, title: 'Sports Injuries: Ankles and Knees', zh: '運動傷害：腳踝與膝蓋' },
  { no: 4, title: 'Tongue and Pulse: Explaining the Exam', zh: '舌診脈診怎麼解釋' },
  { no: 5, title: 'Cupping, Moxa and Gua Sha', zh: '拔罐、艾灸、刮痧與痕跡' },
  { no: 6, title: 'Herbs, Safely', zh: '中藥安全：西藥交互作用、懷孕' },
  { no: 7, title: 'Sleep, Stress and the Whole Person', zh: '睡眠、情志與整體觀' },
  { no: 8, title: "Women's Health: Period Pain", zh: '婦科：經痛' },
  { no: 9, title: 'Phone, Bookings, ACC and GP Letters', zh: '電話、預約、ACC 與轉介信' },
  { no: 10, title: 'Tricky Moments', zh: '難題：懷疑派病人、抱怨、紅旗症狀' }
];

const STEPS = [
  { key: 'intro', label: 'Overview', zh: '情境', min: 3 },
  { key: 'dialogue', label: 'Dialogue', zh: '對話', min: 15 },
  { key: 'phrases', label: 'Say it better', zh: '說得更好', min: 8 },
  { key: 'concepts', label: 'Key concepts', zh: '名相', min: 12 },
  { key: 'kiwi', label: 'Kiwi corner', zh: '在地化', min: 7 },
  { key: 'shadow', label: 'Speak', zh: '跟讀', min: 10 },
  { key: 'writing', label: 'Write', zh: '書寫', min: 8 },
  { key: 'check', label: 'Quick check', zh: '小測', min: 5 }
];

const DAY = 86400000;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/* ---------- state ---------- */
const fresh = () => ({
  v: 1, created: Date.now(),
  pos: { view: 'today', unit: 'u01', step: 0, item: 0 },
  units: {}, cards: {}, days: {}, writing: {}, checks: {},
  prefs: { zh: true, slow: false }
});
let S = load();
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return Object.assign(fresh(), JSON.parse(raw)); } catch (e) {}
  return fresh();
}
let saveTimer = null;
function save(now = false) {
  clearTimeout(saveTimer);
  const go = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  if (now) go(); else saveTimer = setTimeout(go, 250);
}
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

/* ---------- content ---------- */
const UNITS = {};   // id -> unit json
const CARDS = {};   // card id -> {kind, unit, front, back}
async function loadContent() {
  for (const f of UNIT_FILES) {
    const u = await fetch(`content/${f}.json`).then(r => r.json());
    UNITS[u.id] = u;
    u.concepts.forEach(c => CARDS[c.id] = { kind: 'concept', unit: u.id, step: 3, c });
    u.phrases.forEach(p => CARDS[p.id] = { kind: 'phrase', unit: u.id, step: 2, p });
    u.dialogue.forEach((d, i) => { if (d.who === 'P') CARDS[`${u.id}d${i}`] = { kind: 'line', unit: u.id, step: 1, d }; });
  }
}
const unitState = id => (S.units[id] ||= { done: [], completed: false });
const hasStarted = () => Object.values(S.units).some(u => u.done.length) || S.pos.step > 0 || S.pos.item > 0;

/* ---------- audio ---------- */
let AUDIO = {};
const VOICE = { P: 'M', C: 'F' };
const norm = t => t.toLowerCase().replace(/[^a-z0-9]/g, '');
const player = new Audio();
let playingBtn = null;
function speak(text, who = 'P', btn = null) {
  const f = AUDIO[`${VOICE[who] || 'M'}|${norm(text)}`];
  stopAudio();
  if (btn) { btn.classList.add('on'); playingBtn = btn; }
  const done = () => { if (playingBtn) playingBtn.classList.remove('on'); playingBtn = null; };
  if (f) {
    player.src = `audio/${f}`;
    player.playbackRate = S.prefs.slow ? 0.8 : 1;
    player.onended = done; player.onerror = done;
    player.play().catch(done);
  } else if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-NZ'; u.rate = S.prefs.slow ? 0.8 : 1; u.onend = done;
    speechSynthesis.speak(u);
  } else done();
}
function stopAudio() {
  player.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (playingBtn) playingBtn.classList.remove('on');
  playingBtn = null;
}
const playBtn = (text, who = 'P', label = 'Play') =>
  `<button class="icon-btn" data-say="${esc(text)}" data-who="${who}" aria-label="${label}">▶</button>`;

/* ---------- recording (shadowing) ---------- */
const recordings = {};
let recorder = null, recBtn = null;
async function toggleRecord(i, btn) {
  if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recBtn = btn; btn.classList.add('rec'); btn.textContent = '■';
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      recordings[i] = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
      recBtn.classList.remove('rec'); recBtn.textContent = '●';
      const mine = $(`[data-mine="${i}"]`); if (mine) mine.disabled = false;
      toast('Recorded. Tap ♪ to hear yourself.');
    };
    recorder.start();
  } catch (e) { toast('Microphone not available. Allow it in Settings › Safari.'); }
}

/* ---------- time tracking ---------- */
let lastActive = Date.now();
['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => addEventListener(ev, () => lastActive = Date.now(), { passive: true }));
setInterval(() => {
  if (document.visibilityState !== 'visible' || Date.now() - lastActive > 120000) return;
  const k = todayKey(); S.days[k] = (S.days[k] || 0) + 10; save(); renderMeter();
}, 10000);
const minsToday = () => Math.floor((S.days[todayKey()] || 0) / 60);

/* ---------- SRS (simplified SM-2) ---------- */
function addCard(id, dueNow = true) {
  if (!CARDS[id]) return;
  if (!S.cards[id]) S.cards[id] = { due: dueNow ? Date.now() : startOfDay() + DAY, ivl: 0, ef: 2.5, reps: 0, lapses: 0 };
}
function lapse(id) {
  addCard(id);
  const c = S.cards[id];
  c.lapses++; c.reps = 0; c.ivl = 0; c.due = Date.now(); c.ef = Math.max(1.3, c.ef - 0.2);
}
function nextIvl(c, r) {
  if (r === 'again') return 0;
  if (r === 'good') return c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.round(Math.max(c.ivl, 1) * c.ef);
  return c.reps === 0 ? 3 : Math.round(Math.max(c.ivl, 1) * c.ef * 1.3);
}
function rate(id, r) {
  const c = S.cards[id];
  if (r === 'again') { lapse(id); save(); return; }
  c.ivl = nextIvl(c, r); c.reps++;
  if (r === 'easy') c.ef += 0.15;
  c.due = startOfDay() + c.ivl * DAY + 4 * 3600000;
  save();
}
const dueIds = () => Object.keys(S.cards).filter(id => CARDS[id] && S.cards[id].due <= Date.now())
  .sort((a, b) => S.cards[a].due - S.cards[b].due);
const ivlLabel = d => d === 0 ? 'now' : d === 1 ? '1 day' : d < 30 ? `${d} days` : `${Math.round(d / 30)} mo`;

/* ---------- navigation & resume ---------- */
function go(view, opts = {}) {
  stopAudio();
  if (view === 'review') queue = null;
  if (view === 'lesson') { Object.assign(S.pos, { view, unit: opts.unit || S.pos.unit, step: opts.step ?? S.pos.step, item: opts.item ?? 0 }); }
  else S.pos.view = view;
  save();
  render(opts.restore);
}
function render(restore = false) {
  const v = S.pos.view;
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.go === v || (v === 'lesson' && b.dataset.go === 'learn')));
  document.body.classList.toggle('hide-zh', !S.prefs.zh);
  const view = $('#view');
  ({ today: viewToday, learn: viewLearn, lesson: viewLesson, review: viewReview, glossary: viewGlossary, me: viewMe }[v] || viewToday)(view);
  renderMeter();
  if (v === 'lesson' && restore && S.pos.item > 0) {
    const el = $(`[data-i="${S.pos.item}"]`);
    if (el) { requestAnimationFrame(() => { el.scrollIntoView({ block: 'center' }); el.classList.add('flash-hl'); }); return; }
  }
  scrollTo(0, 0);
}
// Remember the item currently on screen so the lesson reopens at the same spot.
let scrollT = null;
addEventListener('scroll', () => {
  if (S.pos.view !== 'lesson') return;
  clearTimeout(scrollT);
  scrollT = setTimeout(() => {
    const top = $('.top').getBoundingClientRect().bottom + 8;
    const items = $$('[data-i]');
    const cur = items.find(el => el.getBoundingClientRect().bottom > top);
    S.pos.item = cur ? +cur.dataset.i : 0; save();
  }, 200);
}, { passive: true });
addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(true); });

function renderMeter() {
  const m = minsToday(), p = Math.min(1, m / DAY_GOAL_MIN), r = 11, C = 2 * Math.PI * r;
  $('#meter').innerHTML = `<span>${m}/${DAY_GOAL_MIN} min</span>
    <svg class="ring" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="4"/>
    <circle cx="14" cy="14" r="${r}" fill="none" stroke="var(--brand)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${C * p} ${C}" transform="rotate(-90 14 14)"/></svg>`;
  const n = dueIds().length, b = $('#dueBadge');
  b.hidden = !n; b.textContent = n;
}
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- views ---------- */
function resumeInfo() {
  const u = UNITS[S.pos.unit] || UNITS.u01;
  const us = unitState(u.id);
  if (us.completed) {
    const next = SYLLABUS.find(s => s.no === u.no + 1);
    return { done: true, u, next };
  }
  return { u, step: STEPS[S.pos.unit === u.id ? S.pos.step : 0], stepIdx: S.pos.unit === u.id ? S.pos.step : 0 };
}

function viewToday(el) {
  const due = dueIds().length, m = minsToday(), ri = resumeInfo();
  const days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * DAY); return { d, s: S.days[todayKey(d)] || 0 }; });
  const started = hasStarted();
  el.innerHTML = `
    <p class="eyebrow">${new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1>${m >= DAY_GOAL_MIN ? 'Ka pai! Goal reached today.' : started ? 'Welcome back.' : 'Kia ora! Let’s get started.'}</h1>
    <p class="muted zh-opt" lang="zh-Hant">${m >= DAY_GOAL_MIN ? '今天的一小時已達成。' : '每天一小時：先複習，再學新課，最後開口說、動手寫。'}</p>

    <div class="card hero stack">
      ${ri.done
        ? `<div><p class="muted">Unit ${ri.u.no} complete</p><h3>${ri.next ? `Next: Unit ${ri.next.no} · ${esc(ri.next.title)} (coming soon)` : 'All units complete'}</h3></div>`
        : `<div><p class="muted">${started ? 'Continue where you stopped' : 'Start here'}</p>
           <h3>Unit ${ri.u.no} · ${esc(ri.u.title)}</h3>
           <p class="muted" style="margin:0">Step ${ri.stepIdx + 1} of ${STEPS.length}: ${ri.step.label} <span class="zh-opt" lang="zh-Hant">（${ri.step.zh}）</span></p></div>
           <button class="btn block" data-resume>${started ? 'Continue ›' : 'Start lesson ›'}</button>`}
    </div>

    <div class="card">
      <div class="row between"><h3>Review</h3><span class="tag" ${due ? '' : 'style="background:var(--good-soft);color:var(--good)"'}>${due ? `${due} due` : 'all clear'}</span></div>
      <p class="muted">${due ? 'Cards you missed come back until you know them well.' : 'Nothing due right now. New cards arrive as you finish each step.'}
      <span class="zh-opt" lang="zh-Hant">${due ? '答錯的卡會一直回來，直到熟練。' : ''}</span></p>
      ${due ? `<button class="btn primary block" data-go="review">Review ${due} card${due > 1 ? 's' : ''}</button>` : ''}
    </div>

    <div class="card">
      <h3>Your hour <span class="muted zh-opt" lang="zh-Hant">每日一小時</span></h3>
      <ul class="plan">
        <li><span>Review due cards</span><span class="muted">10 min</span></li>
        <li><span>Dialogue, phrases, concepts</span><span class="muted">35 min</span></li>
        <li><span>Speak: listen and repeat aloud</span><span class="muted">10 min</span></li>
        <li><span>Write and quick check</span><span class="muted">5–10 min</span></li>
      </ul>
      <div class="bar" style="margin-top:12px"><i style="width:${Math.min(100, m / DAY_GOAL_MIN * 100)}%"></i></div>
      <p class="muted" style="margin:6px 0 0">${m} of ${DAY_GOAL_MIN} minutes today</p>
    </div>

    <div class="card">
      <h3>This week</h3>
      <div class="week">${days.map(x => `<div><b><i style="height:${Math.min(100, x.s / 36)}%"></i></b>${x.d.toLocaleDateString('en-NZ', { weekday: 'narrow' })}</div>`).join('')}</div>
    </div>

    <button class="btn block" data-go="me">Settings and backup</button>`;
}

function viewLearn(el) {
  el.innerHTML = `<h1>Learn</h1><p class="muted">Ten clinic situations. One unit is about one day of study. <span class="zh-opt" lang="zh-Hant">十個診間情境，一課約一天的量。</span></p>
    ${SYLLABUS.map(s => {
      const id = `u${String(s.no).padStart(2, '0')}`, u = UNITS[id], us = S.units[id];
      const pct = us ? Math.round((us.completed ? STEPS.length : us.done.length) / STEPS.length * 100) : 0;
      return `<div class="card" ${u ? `data-open="${id}" role="button" tabindex="0" style="cursor:pointer"` : 'style="opacity:.55"'}>
        <div class="row between"><span class="eyebrow">Unit ${s.no}</span><span class="muted">${u ? (us?.completed ? 'Done ✓' : pct ? `${pct}%` : 'Ready') : 'Coming soon'}</span></div>
        <h3>${esc(s.title)}</h3><p class="muted zh-opt" lang="zh-Hant" style="margin:0">${esc(s.zh)}</p>
        ${u && pct ? `<div class="bar" style="margin-top:10px"><i style="width:${pct}%"></i></div>` : ''}
      </div>`;
    }).join('')}`;
}

function viewLesson(el) {
  const u = UNITS[S.pos.unit]; if (!u) return viewLearn(el);
  const us = unitState(u.id), si = S.pos.step, st = STEPS[si];
  const head = `
    <p class="eyebrow">Unit ${u.no} · Step ${si + 1}/${STEPS.length}</p>
    <h1>${st.label} <span class="zh-opt" lang="zh-Hant" style="font-size:18px">${st.zh}</span></h1>
    <div class="steps">${STEPS.map((s, i) => `<button data-step="${i}" class="${i === si ? 'cur' : us.done.includes(i) ? 'done' : ''}">${i + 1}. ${s.label}</button>`).join('')}</div>
    <div class="toolbar">
      <button class="chip ${S.prefs.zh ? 'on' : ''}" data-pref="zh">中文 ${S.prefs.zh ? 'on' : 'off'}</button>
      <button class="chip ${S.prefs.slow ? 'on' : ''}" data-pref="slow">Slow audio ${S.prefs.slow ? 'on' : 'off'}</button>
    </div>`;
  let body = '';
  let i = 0;
  const I = () => `data-i="${++i}"`;
  if (st.key === 'intro') {
    body = `<div class="card" ${I()}><p class="eyebrow">${esc(u.title)}</p><p>${esc(u.scenario.en)}</p><p class="zh-opt" lang="zh-Hant">${esc(u.scenario.zh)}</p></div>
      <h2>By the end you can…</h2>
      ${u.goals.map(g => `<div class="card soft" ${I()}><p style="margin:0">${esc(g.en)}</p><p class="zh-opt" lang="zh-Hant" style="margin:4px 0 0">${esc(g.zh)}</p></div>`).join('')}
      <div class="card" ${I()}><h3>How to study this unit</h3><p class="muted">Listen first, then read. Turn Chinese off once you know a part, and turn on slow audio when you need it. Every step you finish adds cards to your review deck.</p>
      <p class="muted zh-opt" lang="zh-Hant">先聽再讀。熟了就把中文關掉；需要時打開慢速。每完成一步，相關的卡片就會進入複習。</p></div>`;
  } else if (st.key === 'dialogue') {
    body = `<p class="muted">P = you, the practitioner · C = Sarah, the client. <span class="zh-opt" lang="zh-Hant">P 是你，C 是病人。</span></p>
      <button class="btn block" data-playall style="margin-bottom:12px">▶ Play the whole conversation</button>` +
      u.dialogue.map((d, k) => `<div class="card line ${d.who}" ${I()} data-line="${k}">
        <div><div class="who">${d.who === 'P' ? 'You' : 'Sarah'}</div><div class="en">${esc(d.en)}</div>
        <div class="zh-opt" lang="zh-Hant">${esc(d.zh)}</div>
        ${d.note ? `<details class="note"><summary>Note 說明</summary><div lang="zh-Hant" class="zh">${esc(d.note)}</div></details>` : ''}</div>
        ${playBtn(d.en, d.who)}</div>`).join('');
  } else if (st.key === 'phrases') {
    body = `<p class="muted">When you're nervous, the short version comes out. Learn the better version so it comes out instead. <span class="zh-opt" lang="zh-Hant">緊張時說出口的是簡短版；把「更好的說法」練熟，讓它取而代之。</span></p>` +
      u.phrases.map(p => `<div class="card upgrade line" ${I()}><div>
        <div class="simple">${esc(p.simple)}</div><div class="better">${esc(p.better)}</div>
        <div class="zh-opt" lang="zh-Hant">${esc(p.zh)}</div></div>${playBtn(p.better)}</div>`).join('');
  } else if (st.key === 'concepts') {
    body = `<p class="muted">Each term in four layers: the Chinese, the standard English term, how to say it to a Kiwi patient, and what to avoid. <span class="zh-opt" lang="zh-Hant">每個名相四層：中文、標準英譯、對紐西蘭病人怎麼說、避免怎麼說。</span></p>` +
      u.concepts.map(c => conceptCard(c, I())).join('');
  } else if (st.key === 'kiwi') {
    body = u.kiwi.map(k => `<div class="card" ${I()}>
      <h3>${esc(k.title)} <span class="zh-opt" lang="zh-Hant" style="font-weight:400">${esc(k.titleZh)}</span></h3>
      <p>${esc(k.en)}</p><p class="zh-opt" lang="zh-Hant">${esc(k.zh)}</p>
      ${k.say.length ? `<p class="eyebrow" style="margin-top:8px">Try saying</p><ul class="say">${k.say.map(s => `<li><span>${esc(s)}</span>${playBtn(s)}</li>`).join('')}</ul>` : ''}</div>`).join('');
  } else if (st.key === 'shadow') {
    body = `<div class="card soft" ${I()}><p style="margin:0">Listen ▶, say it aloud ●, then compare ♪. Do each line two or three times. Copy the rhythm, not just the words.</p>
      <p class="zh-opt" lang="zh-Hant" style="margin:6px 0 0">聽 ▶、錄自己的聲音 ●、再比對 ♪。每句練兩三次，模仿節奏和語調，不只是字。錄音只留在手機上，不會上傳。</p></div>` +
      u.shadow.map((s, k) => `<div class="card" ${I()}><p class="en">${esc(s)}</p>
        <div class="row">${playBtn(s)}<button class="icon-btn" data-rec="${k}" aria-label="Record">●</button>
        <button class="icon-btn" data-mine="${k}" aria-label="Play my recording" ${recordings[k] ? '' : 'disabled'}>♪</button></div></div>`).join('');
  } else if (st.key === 'writing') {
    const w = u.writing, txt = S.writing[u.id] || '';
    body = `<div class="card" ${I()}><h3>${esc(w.task)}</h3><p class="zh-opt" lang="zh-Hant">${esc(w.taskZh)}</p>
      <div class="ticks">${w.checklist.map((c, k) => `<label><input type="checkbox" data-tick="${k}"><span>${esc(c.en)}<br><span class="zh-opt" lang="zh-Hant" style="font-size:15px">${esc(c.zh)}</span></span></label>`).join('')}</div></div>
      <div ${I()}><textarea id="wr" placeholder="Hi Sarah, …" spellcheck="true" lang="en-NZ">${esc(txt)}</textarea>
      <p class="muted">Saved on this phone as you type. <span class="zh-opt" lang="zh-Hant">邊打邊存在手機上。</span></p></div>
      <details class="card" ${I()}><summary><b>Show a model answer</b> <span class="zh-opt" lang="zh-Hant">看範例</span></summary>
      <p style="margin-top:10px">${esc(w.model)}</p><p class="zh-opt" lang="zh-Hant">${esc(w.modelZh)}</p>${playBtn(w.model)}</details>`;
  } else if (st.key === 'check') {
    const ans = S.checks[u.id] || {};
    body = `<p class="muted">Anything you miss goes straight into your review deck. <span class="zh-opt" lang="zh-Hant">答錯的題目會立刻進入複習。</span></p>` +
      u.check.map((q, k) => `<div class="card" ${I()} data-q="${k}"><p style="margin-bottom:4px"><b>${k + 1}.</b> ${esc(q.q)}</p>
        <p class="zh-opt" lang="zh-Hant" style="font-size:15px">${esc(q.qZh)}</p>
        ${q.options.map((o, j) => `<button class="check-opt ${ans[k] !== undefined ? (j === q.answer ? 'right' : j === ans[k] ? 'wrong' : '') : ''}" data-ans="${k}:${j}" ${ans[k] !== undefined ? 'disabled' : ''}>${esc(o)}</button>`).join('')}
      </div>`).join('');
  }
  const last = si === STEPS.length - 1;
  el.innerHTML = head + body + `<div class="nextbar">
      ${si > 0 ? `<button class="btn" data-step="${si - 1}">‹ Back</button>` : ''}
      <button class="btn primary" data-finish>${last ? 'Finish unit ✓' : `Done · next: ${STEPS[si + 1].label} ›`}</button></div>`;
  const strip = $('.steps', el), cur = $('.steps .cur', el);
  if (strip && cur) strip.scrollLeft = cur.offsetLeft - strip.clientWidth / 2 + cur.clientWidth / 2;
  const wr = $('#wr', el);
  if (wr) wr.addEventListener('input', () => { S.writing[u.id] = wr.value; save(); });
}

function conceptCard(c, attr = '') {
  return `<div class="card" ${attr}>
    <div class="row between"><div><span class="term">${esc(c.zh)}</span><span class="py">${esc(c.py)}</span></div>${playBtn(c.kiwi)}</div>
    <div class="layer"><span>Term</span><span>${esc(c.std)}</span></div>
    <div class="layer"><span>Say</span><span><b>${esc(c.kiwi)}</b></span></div>
    <div class="layer"><span>Avoid</span><span class="avoid">${esc(c.avoid)}</span></div>
    <div class="layer zh-opt"><span>中文</span><span lang="zh-Hant" class="zh">${esc(c.zhNote)}</span></div>
  </div>`;
}

function finishStep() {
  const u = UNITS[S.pos.unit], us = unitState(u.id), si = S.pos.step;
  if (!us.done.includes(si)) us.done.push(si);
  const added = Object.keys(CARDS).filter(id => CARDS[id].unit === u.id && CARDS[id].step === si && !S.cards[id]);
  added.forEach(id => addCard(id, false));
  if (si === STEPS.length - 1) {
    us.completed = true; save(true);
    toast('Ka pai! Unit complete. Your cards will come back for review.', 3500);
    go('today'); return;
  }
  if (added.length) toast(`${added.length} cards added to tomorrow’s review.`);
  go('lesson', { step: si + 1, item: 0 });
}

/* ---------- review ---------- */
let queue = null, revealed = false, sessionDone = 0;
function viewReview(el) {
  if (!queue) { queue = dueIds(); sessionDone = 0; }
  revealed = false;
  if (!queue.length) {
    const total = Object.keys(S.cards).length;
    const tricky = Object.keys(S.cards).filter(id => S.cards[id].lapses >= 3);
    const nextDue = Object.values(S.cards).map(c => c.due).sort((a, b) => a - b)[0];
    el.innerHTML = `<h1>Review</h1>
      <div class="card"><h3>${sessionDone ? `Sweet as! ${sessionDone} done.` : 'Nothing due right now.'}</h3>
      <p class="muted">${total ? `${total} cards in your deck.${nextDue ? ` Next one: ${new Date(nextDue).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}.` : ''}` : 'Finish a lesson step to add your first cards.'}</p>
      <p class="muted zh-opt" lang="zh-Hant">答對的卡間隔會越拉越長（1 天 → 3 天 → 一週 → 更久）；答錯就回到今天，直到熟練。</p></div>
      ${tricky.length ? `<h2>Tricky ones <span class="zh-opt" lang="zh-Hant" style="font-weight:400">難點</span></h2><p class="muted">Missed three times or more.</p>
        <button class="btn block" data-drill>Practise ${tricky.length} tricky card${tricky.length > 1 ? 's' : ''} now</button>` : ''}`;
    return;
  }
  const id = queue[0], card = CARDS[id], c = S.cards[id];
  el.innerHTML = `<div class="row between"><h1>Review</h1><span class="muted">${queue.length} left</span></div>
    <div class="card flash" id="flash">${cardFront(card)}${c.lapses >= 3 ? '<p style="margin-top:10px"><span class="tag">Tricky 難點</span></p>' : ''}<div id="back"></div></div>
    <div id="act"><button class="btn primary block" data-reveal>Show answer</button></div>`;
}
function cardFront(k) {
  if (k.kind === 'concept') return `<div class="front"><span class="term">${esc(k.c.zh)}</span><div class="py">${esc(k.c.py)}</div></div><p class="muted" style="margin-top:12px">How would you explain this to a Kiwi patient?</p>`;
  if (k.kind === 'phrase') return `<div class="front">${esc(k.p.zh)}</div><p class="muted" style="margin-top:8px">Not “${esc(k.p.simple)}”. Say it better.</p>`;
  return `<div class="front" lang="zh-Hant">${esc(k.d.zh)}</div><p class="muted" style="margin-top:8px">Say it in English, out loud.</p>`;
}
function cardBack(k) {
  if (k.kind === 'concept') return `<p class="muted" style="margin:0">${esc(k.c.std)}</p><p><b>${esc(k.c.kiwi)}</b></p><p class="avoid" style="font-size:15px">${esc(k.c.avoid)}</p>${playBtn(k.c.kiwi)}`;
  if (k.kind === 'phrase') return `<p><b>${esc(k.p.better)}</b></p>${playBtn(k.p.better)}`;
  return `<p><b>${esc(k.d.en)}</b></p>${playBtn(k.d.en)}`;
}
function reveal() {
  const id = queue[0], c = S.cards[id], k = CARDS[id];
  revealed = true;
  $('#back').className = 'back'; $('#back').innerHTML = cardBack(k);
  $('#act').innerHTML = `<div class="rate">
    <button class="btn again" data-rate="again">Again<small>soon</small></button>
    <button class="btn good" data-rate="good">Good<small>${ivlLabel(nextIvl(c, 'good'))}</small></button>
    <button class="btn" data-rate="easy">Easy<small>${ivlLabel(nextIvl(c, 'easy'))}</small></button></div>`;
  const t = k.kind === 'concept' ? k.c.kiwi : k.kind === 'phrase' ? k.p.better : k.d.en;
  speak(t, 'P');
}
function doRate(r) {
  const id = queue.shift();
  rate(id, r);
  if (r === 'again') queue.splice(Math.min(3, queue.length), 0, id);  // comes back in this session
  else sessionDone++;
  render();
}

/* ---------- glossary ---------- */
let glQuery = '';
function viewGlossary(el) {
  const all = Object.values(UNITS).flatMap(u => u.concepts.map(c => ({ ...c, unit: u.no })));
  el.innerHTML = `<h1>Glossary <span class="zh-opt" lang="zh-Hant" style="font-size:18px">名相表</span></h1>
    <input class="search" id="q" type="search" placeholder="Search 中文, pinyin or English" value="${esc(glQuery)}" autocomplete="off">
    <div id="gl"></div>`;
  const draw = () => {
    const q = glQuery.trim().toLowerCase();
    const hits = all.filter(c => !q || [c.zh, c.py, c.std, c.kiwi].some(s => s.toLowerCase().includes(q)));
    $('#gl').innerHTML = hits.length ? hits.map(c => `<details class="card gl-item"><summary><span><span class="term">${esc(c.zh)}</span><span class="py">${esc(c.py)}</span></span><span class="std">${esc(c.std)}</span></summary>
      <div style="margin-top:10px">${conceptCard(c).replace(/^<div class="card"[^>]*>/, '<div>')}
      <p class="muted" style="margin:8px 0 0">Unit ${c.unit} · ${S.cards[c.id] ? 'in your review deck' : `<button class="btn small" data-addcard="${c.id}">Add to review</button>`}</p></div></details>`).join('')
      : '<p class="muted">No match.</p>';
  };
  draw();
  $('#q').addEventListener('input', e => { glQuery = e.target.value; draw(); });
}

/* ---------- settings / backup ---------- */
function viewMe(el) {
  const total = Object.values(S.days).reduce((a, b) => a + b, 0);
  el.innerHTML = `<h1>Settings and backup</h1>
    <div class="card"><h3>Your progress lives on this phone</h3>
      <p class="muted">Add this app to your Home Screen (Share › Add to Home Screen) so iOS keeps your progress. Make a backup now and then, especially before changing phones.</p>
      <p class="muted zh-opt" lang="zh-Hant">請用 Safari「分享 › 加入主畫面」，iOS 才會穩定保存進度。偶爾備份一次，換手機前一定要備份。</p>
      <div class="row" style="flex-wrap:wrap"><button class="btn" data-export>Back up progress</button>
      <label class="btn" style="margin:0">Restore from file<input type="file" accept="application/json,.json" data-import hidden></label></div></div>
    <div class="card"><h3>Display</h3>
      <div class="row" style="flex-wrap:wrap"><button class="chip ${S.prefs.zh ? 'on' : ''}" data-pref="zh">中文 ${S.prefs.zh ? 'on' : 'off'}</button>
      <button class="chip ${S.prefs.slow ? 'on' : ''}" data-pref="slow">Slow audio ${S.prefs.slow ? 'on' : 'off'}</button></div></div>
    <div class="card"><h3>Stats</h3><p class="muted" style="margin:0">${Math.round(total / 60)} minutes studied · ${Object.keys(S.cards).length} cards in deck · version ${APP_VERSION}</p></div>
    <button class="btn block" data-reset style="color:var(--bad)">Start over (erase progress)</button>`;
}
async function exportProgress() {
  const name = `clinic-korero-backup-${todayKey()}.json`;
  const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}
function importProgress(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data.cards || !data.pos) throw new Error('bad');
      if (!confirm('Replace the progress on this phone with this backup?')) return;
      S = Object.assign(fresh(), data); save(true); toast('Progress restored.'); go('today');
    } catch (e) { toast('That file isn’t a Clinic Kōrero backup.'); }
  };
  r.readAsText(file);
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-open]');
  if (!t) return;
  const d = t.dataset;
  if (d.go) return go(d.go);
  if (d.say !== undefined) return speak(d.say, d.who, t);
  if ('resume' in d) return go('lesson', { restore: true, item: S.pos.item });
  if (d.open) { const same = S.pos.unit === d.open; return go('lesson', { unit: d.open, step: same ? S.pos.step : 0, item: same ? S.pos.item : 0, restore: same }); }
  if (d.step !== undefined) return go('lesson', { step: +d.step, item: 0 });
  if ('finish' in d) return finishStep();
  if (d.pref) { S.prefs[d.pref] = !S.prefs[d.pref]; save(); const y = scrollY; render(); scrollTo(0, y); return; }
  if ('playall' in d) return playAll(t);
  if (d.rec !== undefined) return toggleRecord(+d.rec, t);
  if (d.mine !== undefined) { stopAudio(); player.src = recordings[d.mine]; player.playbackRate = 1; player.play(); return; }
  if (d.ans) {
    const [k, j] = d.ans.split(':').map(Number), u = UNITS[S.pos.unit], q = u.check[k];
    (S.checks[u.id] ||= {})[k] = j;
    if (j !== q.answer && q.card) { lapse(q.card); toast('Added to review. It’ll come back today.'); }
    else if (q.card) addCard(q.card, false);
    save();
    $$(`[data-ans^="${k}:"]`).forEach((b, jj) => { b.disabled = true; if (jj === q.answer) b.classList.add('right'); else if (jj === j) b.classList.add('wrong'); });
    renderMeter(); return;
  }
  if ('reveal' in d) return reveal();
  if (d.rate) return doRate(d.rate);
  if ('drill' in d) { queue = Object.keys(S.cards).filter(id => S.cards[id].lapses >= 3); return render(); }
  if (d.addcard) { addCard(d.addcard); save(); toast('Added. It’s in today’s review.'); return viewGlossary($('#view')); }
  if ('export' in d) return exportProgress();
  if ('reset' in d) { if (confirm('Erase all progress on this phone? This can’t be undone.')) { S = fresh(); save(true); go('today'); } return; }
});
document.addEventListener('change', e => { if (e.target.matches('[data-import]') && e.target.files[0]) importProgress(e.target.files[0]); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.open) e.target.click(); });

function playAll(btn) {
  const lines = UNITS[S.pos.unit].dialogue;
  if (btn.dataset.running) { delete btn.dataset.running; stopAudio(); btn.textContent = '▶ Play the whole conversation'; return; }
  btn.dataset.running = '1'; btn.textContent = '■ Stop';
  let k = 0;
  const next = () => {
    if (!btn.dataset.running || k >= lines.length) { delete btn.dataset.running; btn.textContent = '▶ Play the whole conversation'; return; }
    const card = $(`[data-line="${k}"]`); if (card) { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); card.classList.remove('flash-hl'); void card.offsetWidth; card.classList.add('flash-hl'); }
    const d = lines[k++];
    speak(d.en, d.who);
    const wait = () => { player.onended = () => setTimeout(next, 500); };
    if (AUDIO[`${VOICE[d.who]}|${norm(d.en)}`]) wait(); else setTimeout(next, 2500);
  };
  next();
}

/* ---------- boot ---------- */
(async function boot() {
  try { AUDIO = await fetch('audio/index.json').then(r => r.ok ? r.json() : {}); } catch (e) { AUDIO = {}; }
  await loadContent();
  if (S.pos.view === 'lesson' && UNITS[S.pos.unit] && !unitState(S.pos.unit).completed) {
    render(true);
    if (S.pos.step > 0 || S.pos.item > 0) toast('Welcome back. Carrying on from where you stopped.');
  } else { if (!['today', 'learn', 'review', 'glossary', 'me'].includes(S.pos.view)) S.pos.view = 'today'; render(); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
