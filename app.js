"use strict";

// ---------- Storage ----------
const STORE_KEY = "frenchy-v1";
// Days until next review for each Leitner box.
const INTERVALS = [0, 1, 3, 7, 14, 30, 60, 120];

const defaultState = () => ({
  cards: {},          // fr -> { box, due }
  xp: 0,
  streak: 0,
  lastDay: null,
  todayDate: null,
  todayXp: 0,
  newToday: 0,
  bestQuiz: null,
  verbCorrect: 0,
  settings: { newPerDay: 10, goal: 50 },
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { /* storage unavailable or corrupt: start fresh */ }
  return defaultState();
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function dayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rollDay() {
  const today = dayStr();
  if (state.todayDate !== today) {
    state.todayDate = today;
    state.todayXp = 0;
    state.newToday = 0;
    save();
  }
}

function addXp(n) {
  rollDay();
  const today = dayStr();
  if (state.lastDay !== today) {
    state.streak = state.lastDay === dayStr(-1) ? state.streak + 1 : 1;
    state.lastDay = today;
  }
  state.xp += n;
  state.todayXp += n;
  save();
  renderHeader();
}

function currentStreak() {
  return state.lastDay === dayStr() || state.lastDay === dayStr(-1) ? state.streak : 0;
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

// ---------- Speech ----------
let frVoice = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const voices = speechSynthesis.getVoices();
  frVoice = voices.find((v) => v.lang === "fr-FR") || voices.find((v) => v.lang.startsWith("fr")) || null;
}
if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

function speak(text) {
  if (!("speechSynthesis" in window)) { toast("Speech not supported in this browser"); return; }
  // Read "le pain" rather than "le pain (m)" or both halves of "grand / grande".
  const clean = text.replace(/\((m|f)\)/g, "").split(" / ")[0].replace("…", "").trim();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = "fr-FR";
  if (frVoice) u.voice = frVoice;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

function speakBtn(text) {
  return `<button class="speak" data-say="${esc(text)}" title="Listen" aria-label="Listen">🔊</button>`;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-say]");
  if (b) { e.stopPropagation(); speak(b.dataset.say); }
});

// ---------- Answer checking ----------
const ARTICLE = /^(le |la |les |l'|un |une )/;

function norm(s) {
  return s.toLowerCase().replace(/[’`]/g, "'").replace(/\((m|f)\)/g, "").replace(/[.!?¿¡,]/g, "").replace(/\s+/g, " ").trim();
}

function noAccents(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae");
}

// Returns "ok", "accent" (right except accents), "article" (right but article missing), or "wrong".
function check(input, answer) {
  const got = norm(input);
  if (!got) return "wrong";
  const accepted = answer.split(" / ").map(norm);
  // "l'ami (m) / l'amie (f)" and "grand / grande" both become lists of acceptable answers.
  if (accepted.includes(got)) return "ok";
  if (accepted.some((a) => noAccents(a) === noAccents(got))) return "accent";
  if (accepted.some((a) => a.replace(ARTICLE, "") === got)) return "article";
  if (accepted.some((a) => noAccents(a.replace(ARTICLE, "")) === noAccents(got))) return "article";
  return "wrong";
}

function accentBar(inputSel) {
  const chars = ["é", "è", "ê", "à", "â", "ç", "ô", "î", "ï", "û", "ù", "ë", "œ"];
  return `<div class="accents" data-for="${inputSel}">${chars.map((c) => `<button type="button">${c}</button>`).join("")}</div>`;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest(".accents button");
  if (!b) return;
  const input = $(b.parentElement.dataset.for);
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + b.textContent + input.value.slice(end);
  input.focus();
  input.setSelectionRange(start + 1, start + 1);
});

// ---------- Categories ----------
const CATEGORIES = [...new Set(VOCAB.map((w) => w[2]))];

function fillCategorySelect(sel) {
  sel.innerHTML = `<option value="All">All</option>` + CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join("");
}

function wordsIn(cat) {
  return cat === "All" ? VOCAB : VOCAB.filter((w) => w[2] === cat);
}

// ---------- Navigation ----------
function show(view) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
  if (view === "home") renderHome();
  if (view === "cards" && !flash.queue) startFlash();
  if (view === "quiz" && !quiz.questions) startQuiz();
  if (view === "verbs" && !verb.current) nextVerb();
  window.scrollTo(0, 0);
}

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) show(g.dataset.goto);
});

// ---------- Header & Home ----------
function renderHeader() {
  $("#streak").textContent = currentStreak();
  $("#xp").textContent = state.xp;
}

function dueCount() {
  const today = dayStr();
  return Object.values(state.cards).filter((c) => c.due <= today).length;
}

function renderHome() {
  rollDay();
  const learned = Object.values(state.cards).filter((c) => c.box >= 2).length;
  const due = dueCount();
  const newLeft = Math.max(0, state.settings.newPerDay - state.newToday);
  const unseen = VOCAB.filter((w) => !state.cards[w[0]]).length;
  $("#stat-learned").textContent = learned;
  $("#stat-due").textContent = due;
  $("#stat-quiz").textContent = state.bestQuiz == null ? "–" : `${state.bestQuiz}%`;
  $("#stat-verbs").textContent = state.verbCorrect;

  const parts = [];
  if (due) parts.push(`<b>${due}</b> card${due > 1 ? "s" : ""} to review`);
  if (newLeft && unseen) parts.push(`<b>${Math.min(newLeft, unseen)}</b> new word${Math.min(newLeft, unseen) > 1 ? "s" : ""} to learn`);
  $("#home-summary").innerHTML = parts.length
    ? `Today you have ${parts.join(" and ")}.`
    : "You're all caught up for today. Try a quiz or practise verbs!";

  const pct = Math.min(100, Math.round((state.todayXp / state.settings.goal) * 100));
  $("#goal-bar").style.width = `${pct}%`;
  $("#goal-text").textContent = pct >= 100
    ? `Goal reached! ${state.todayXp} XP today. Bravo ! 🎉`
    : `${state.todayXp} / ${state.settings.goal} XP today`;

  $("#set-new").value = String(state.settings.newPerDay);
  $("#set-goal").value = String(state.settings.goal);
  renderHeader();
}

$("#set-new").addEventListener("change", (e) => { state.settings.newPerDay = +e.target.value; save(); renderHome(); flash.queue = null; });
$("#set-goal").addEventListener("change", (e) => { state.settings.goal = +e.target.value; save(); renderHome(); });
$("#reset").addEventListener("click", () => {
  if (!confirm("Erase all progress? This cannot be undone.")) return;
  state = defaultState();
  save();
  flash.queue = null;
  renderHome();
  toast("Progress reset");
});

// ---------- Flashcards (spaced repetition) ----------
const flash = { queue: null, revealed: false };

function startFlash() {
  rollDay();
  const today = dayStr();
  const pool = wordsIn($("#cards-cat").value);
  const due = shuffle(pool.filter((w) => state.cards[w[0]] && state.cards[w[0]].due <= today));
  const newLeft = Math.max(0, state.settings.newPerDay - state.newToday);
  const fresh = pool.filter((w) => !state.cards[w[0]]).slice(0, newLeft);
  flash.queue = [...due, ...fresh];
  flash.revealed = false;
  renderFlash();
}

function renderFlash() {
  const area = $("#flash-area");
  const q = flash.queue;
  $("#cards-remaining").textContent = q.length ? `${q.length} left` : "";
  if (!q.length) {
    area.innerHTML = `<div class="card center">
      <h2>C'est fini ! ✅</h2>
      <p class="muted">No more cards for now in this category. Come back tomorrow, or raise "new words per day" on Home.</p>
      <button class="btn primary" data-goto="quiz">Take a quiz</button>
    </div>`;
    return;
  }
  const [fr, en, cat] = q[0];
  const isNew = !state.cards[fr];
  area.innerHTML = `
    <div class="card flashcard" id="flashcard">
      <div class="tag">${esc(cat)}${isNew ? " · new" : ""}</div>
      <div class="front">${esc(fr)}</div>
      ${speakBtn(fr)}
      ${flash.revealed ? `<div class="back">${esc(en)}</div>` : `<div class="hint">Tap or press Space to reveal</div>`}
    </div>
    ${flash.revealed ? `<div class="rate">
      <button class="btn again" data-rate="0">Again<small>see it again soon</small></button>
      <button class="btn good" data-rate="1">Good<small>${intervalLabel(fr, 1)}</small></button>
      <button class="btn easy" data-rate="2">Easy<small>${intervalLabel(fr, 2)}</small></button>
    </div>` : ""}`;
  $("#flashcard").addEventListener("click", (e) => {
    if (e.target.closest("[data-say]")) return;
    if (!flash.revealed) revealFlash();
  });
  area.querySelectorAll("[data-rate]").forEach((b) => b.addEventListener("click", () => rateFlash(+b.dataset.rate)));
}

function nextBox(fr, step) {
  const box = state.cards[fr] ? state.cards[fr].box : 0;
  return Math.min(INTERVALS.length - 1, box + step);
}

function intervalLabel(fr, step) {
  const days = INTERVALS[nextBox(fr, step)];
  return days === 1 ? "in 1 day" : `in ${days} days`;
}

function revealFlash() {
  flash.revealed = true;
  speak(flash.queue[0][0]);
  renderFlash();
}

function rateFlash(step) {
  const word = flash.queue.shift();
  const fr = word[0];
  if (!state.cards[fr]) state.newToday++;
  if (step === 0) {
    state.cards[fr] = { box: 0, due: dayStr() };
    // Put it back a few cards later so it's practised again this session.
    flash.queue.splice(Math.min(3, flash.queue.length), 0, word);
    addXp(1);
  } else {
    const box = nextBox(fr, step);
    state.cards[fr] = { box, due: dayStr(INTERVALS[box]) };
    addXp(step === 2 ? 3 : 2);
  }
  save();
  flash.revealed = false;
  renderFlash();
}

$("#cards-cat").addEventListener("change", startFlash);

// ---------- Quiz ----------
const QUIZ_LEN = 10;
const quiz = { questions: null, i: 0, score: 0, answered: false };

function startQuiz() {
  const pool = wordsIn($("#quiz-cat").value);
  quiz.questions = shuffle(pool).slice(0, Math.min(QUIZ_LEN, pool.length));
  quiz.pool = pool.length >= 4 ? pool : VOCAB;
  quiz.dir = $("#quiz-dir").value;
  quiz.i = 0;
  quiz.score = 0;
  renderQuiz();
}

function renderQuiz() {
  const area = $("#quiz-area");
  quiz.answered = false;
  if (quiz.i >= quiz.questions.length) {
    const pct = Math.round((quiz.score / quiz.questions.length) * 100);
    const best = state.bestQuiz == null || pct > state.bestQuiz;
    if (best) { state.bestQuiz = pct; save(); }
    const msg = pct === 100 ? "Parfait ! 🏆" : pct >= 70 ? "Très bien ! 👏" : pct >= 40 ? "Pas mal ! 💪" : "Courage ! Keep practising 🙂";
    area.innerHTML = `<div class="card center">
      <h2>${msg}</h2>
      <p style="font-size:1.4rem"><b>${quiz.score} / ${quiz.questions.length}</b> (${pct}%)</p>
      ${best ? `<p class="muted">New best score!</p>` : ""}
      <button class="btn primary" id="quiz-again">Play again</button>
    </div>`;
    $("#quiz-again").addEventListener("click", startQuiz);
    return;
  }

  const [fr, en] = quiz.questions[quiz.i];
  const counter = `<div class="qcount">Question ${quiz.i + 1} of ${quiz.questions.length} · Score ${quiz.score}</div>`;

  if (quiz.dir === "type") {
    area.innerHTML = `<div class="card">
      ${counter}
      <div class="question">${esc(en)}</div>
      <input type="text" id="quiz-input" placeholder="Type it in French…" autocomplete="off" autocapitalize="off" spellcheck="false">
      ${accentBar("#quiz-input")}
      <button class="btn primary" id="quiz-check">Check</button>
      <div class="feedback" id="quiz-fb"></div>
    </div>`;
    const input = $("#quiz-input");
    input.focus();
    const submit = () => {
      if (quiz.answered) return nextQuestion();
      const res = check(input.value, fr);
      const fb = $("#quiz-fb");
      if (res === "wrong") {
        fb.className = "feedback bad";
        fb.innerHTML = `✗ The answer is <b>${esc(fr)}</b>`;
      } else {
        quiz.score++;
        addXp(3);
        fb.className = res === "ok" ? "feedback ok" : "feedback warn";
        fb.innerHTML = res === "ok" ? `✓ Correct! <b>${esc(fr)}</b>`
          : res === "accent" ? `✓ Almost — watch the accents: <b>${esc(fr)}</b>`
          : `✓ Correct — remember the article: <b>${esc(fr)}</b>`;
      }
      speak(fr);
      quiz.answered = true;
      $("#quiz-check").textContent = "Next →";
    };
    $("#quiz-check").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    return;
  }

  const toFr = quiz.dir === "en-fr";
  const prompt = toFr ? en : fr;
  const answer = toFr ? fr : en;
  const distractors = shuffle(quiz.pool.filter((w) => w[0] !== fr)).slice(0, 3).map((w) => (toFr ? w[0] : w[1]));
  const options = shuffle([answer, ...distractors]);

  area.innerHTML = `<div class="card">
    ${counter}
    <div class="question">${esc(prompt)} ${toFr ? "" : speakBtn(fr)}</div>
    <div class="options">${options.map((o, n) => `<button class="btn option" data-opt="${esc(o)}">${n + 1}. ${esc(o)}</button>`).join("")}</div>
    <div class="feedback" id="quiz-fb"></div>
  </div>`;
  if (!toFr) speak(fr);

  area.querySelectorAll(".option").forEach((b) => b.addEventListener("click", () => {
    if (quiz.answered) return nextQuestion();
    quiz.answered = true;
    const right = b.dataset.opt === answer;
    area.querySelectorAll(".option").forEach((o) => { if (o.dataset.opt === answer) o.classList.add("correct"); });
    const fb = $("#quiz-fb");
    if (right) {
      quiz.score++;
      addXp(2);
      fb.className = "feedback ok";
      fb.textContent = "✓ Correct! (tap any option or press Enter to continue)";
    } else {
      b.classList.add("wrong");
      fb.className = "feedback bad";
      fb.textContent = "✗ Not quite. (tap any option or press Enter to continue)";
    }
    if (toFr) speak(fr);
  }));
}

function nextQuestion() {
  quiz.i++;
  renderQuiz();
}

$("#quiz-start").addEventListener("click", startQuiz);
$("#quiz-cat").addEventListener("change", startQuiz);
$("#quiz-dir").addEventListener("change", startQuiz);

// ---------- Verbs ----------
const verb = { current: null, answered: false };

function pronounFor(i, form) {
  if (i === 0 && /^[aeiouéèêh]/.test(form)) return "j'";
  return PRONOUNS[i];
}

function nextVerb() {
  const pick = $("#verb-pick").value;
  const names = Object.keys(VERBS);
  const name = pick === "Random" ? names[Math.floor(Math.random() * names.length)] : pick;
  const i = Math.floor(Math.random() * PRONOUNS.length);
  verb.current = { name, i };
  verb.answered = false;
  renderVerb();
}

function renderVerb() {
  const { name, i } = verb.current;
  const v = VERBS[name];
  const form = v.forms[i];
  const pr = pronounFor(i, form);
  $("#verb-area").innerHTML = `<div class="card">
    <div class="qcount">Présent · ${esc(name)} (${esc(v.en)})</div>
    <div class="question">${esc(pr)}${pr.endsWith("'") ? "" : " "}<span class="muted">_____</span></div>
    <input type="text" id="verb-input" placeholder="Conjugate ${esc(name)}…" autocomplete="off" autocapitalize="off" spellcheck="false">
    ${accentBar("#verb-input")}
    <button class="btn primary" id="verb-check">Check</button>
    <div class="feedback" id="verb-fb"></div>
  </div>`;
  const input = $("#verb-input");
  input.focus();
  const submit = () => {
    if (verb.answered) return nextVerb();
    // Accept the answer with or without the pronoun typed in front.
    const typed = norm(input.value).replace(/^(je |j'|tu |il |elle |on |nous |vous |ils |elles )/, "");
    const res = check(typed, form);
    const full = `${pr}${pr.endsWith("'") ? "" : " "}${form}`;
    const fb = $("#verb-fb");
    if (res === "wrong") {
      fb.className = "feedback bad";
      fb.innerHTML = `✗ It's <b>${esc(full)}</b>`;
    } else {
      state.verbCorrect++;
      addXp(2);
      fb.className = res === "ok" ? "feedback ok" : "feedback warn";
      fb.innerHTML = res === "ok" ? `✓ Correct! <b>${esc(full)}</b>` : `✓ Almost — watch the accents: <b>${esc(full)}</b>`;
    }
    speak(full.replace("il/elle", "il").replace("ils/elles", "ils"));
    verb.answered = true;
    $("#verb-check").textContent = "Next →";
  };
  $("#verb-check").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  if (!$("#verb-table").classList.contains("hidden")) renderVerbTable();
}

function renderVerbTable() {
  const name = verb.current.name;
  const v = VERBS[name];
  $("#verb-table").innerHTML = `<h3>${esc(name)} — ${esc(v.en)} ${speakBtn(name)}</h3><table>${v.forms.map((f, i) => {
    const pr = pronounFor(i, f);
    const full = `${pr}${pr.endsWith("'") ? "" : " "}${f}`;
    return `<tr><td>${esc(pr)}</td><td><b>${esc(f)}</b></td><td>${speakBtn(full.replace("il/elle", "il").replace("ils/elles", "ils"))}</td></tr>`;
  }).join("")}</table>`;
}

$("#verb-pick").innerHTML = `<option>Random</option>` + Object.keys(VERBS).map((n) => `<option>${esc(n)}</option>`).join("");
$("#verb-pick").addEventListener("change", nextVerb);
$("#verb-table-btn").addEventListener("click", () => {
  const t = $("#verb-table");
  t.classList.toggle("hidden");
  $("#verb-table-btn").textContent = t.classList.contains("hidden") ? "Show table" : "Hide table";
  if (!t.classList.contains("hidden")) renderVerbTable();
});

// ---------- Phrases ----------
function renderPhrases() {
  const hide = $("#hide-en").checked;
  const groups = [...new Set(PHRASES.map((p) => p[2]))];
  $("#phrase-list").innerHTML = groups.map((g) => `<div class="phrase-group">
    <h3>${esc(g)}</h3>
    ${PHRASES.filter((p) => p[2] === g).map(([fr, en]) => `<div class="card phrase">
      ${speakBtn(fr)}
      <div><div class="fr">${esc(fr)}</div><div class="en${hide ? " blur" : ""}">${esc(en)}</div></div>
    </div>`).join("")}
  </div>`).join("");
}

$("#hide-en").addEventListener("change", renderPhrases);
$("#phrase-list").addEventListener("click", (e) => {
  const en = e.target.closest(".en.blur");
  if (en) en.classList.remove("blur");
});

// ---------- Keyboard shortcuts ----------
document.addEventListener("keydown", (e) => {
  const view = document.querySelector(".view.active").id;
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (view === "view-cards" && flash.queue && flash.queue.length) {
    if (!flash.revealed && (e.key === " " || e.key === "Enter")) { e.preventDefault(); revealFlash(); }
    else if (flash.revealed && ["1", "2", "3"].includes(e.key)) rateFlash(+e.key - 1);
  }
  if (view === "view-quiz" && quiz.questions && quiz.dir !== "type") {
    if (quiz.answered && e.key === "Enter") { e.preventDefault(); nextQuestion(); }
    else if (!quiz.answered && ["1", "2", "3", "4"].includes(e.key)) {
      const opts = document.querySelectorAll(".option");
      if (opts[+e.key - 1]) opts[+e.key - 1].click();
    }
  }
});

// ---------- Init ----------
fillCategorySelect($("#cards-cat"));
fillCategorySelect($("#quiz-cat"));
renderPhrases();
renderHome();
