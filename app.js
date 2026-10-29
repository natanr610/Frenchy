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
  talksDone: 0,
  settings: { newPerDay: 10, goal: 50, cardsCat: "p:All" },
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const s = Object.assign(defaultState(), saved);
      s.settings = Object.assign(defaultState().settings, saved.settings);
      return s;
    }
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

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

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
  // Read "le pain" rather than "le pain (m)", "enchanté" rather than "enchanté(e)", and only the first of "grand / grande".
  const clean = text.replace(/\((m|f|e|ne|s)\)/g, "").split(" / ")[0].replace(/…/g, "")
    .replace("il/elle", "il").replace("ils/elles", "ils").trim();
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
  return s.toLowerCase().replace(/[’`]/g, "'").replace(/\((m|f)\)/g, "").replace(/[.!?¿¡,…«»"]/g, "").replace(/\s+/g, " ").trim();
}

function noAccents(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae");
}

// "l'ami (m) / l'amie (f)" and "grand / grande" are lists of acceptable answers;
// "enchanté(e)" accepts both "enchanté" and "enchantée"; "il est …" may be left out.
function acceptedAnswers(answer) {
  const out = [];
  for (const a of answer.split(" / ").map(norm)) {
    for (const v of [a.replace(/\((e|ne|s)\)/g, ""), a.replace(/\((e|ne|s)\)/g, "$1")]) {
      out.push(v, v.replace(/^il est /, ""));
    }
  }
  return [...new Set(out)];
}

// Returns "ok", "accent" (right except accents), "article" (right but article missing), or "wrong".
function check(input, answer) {
  const got = norm(input);
  if (!got) return "wrong";
  const accepted = acceptedAnswers(answer);
  if (accepted.includes(got)) return "ok";
  if (accepted.some((a) => noAccents(a) === noAccents(got))) return "accent";
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

// ---------- Content pools ----------
// Category values: "All", "w:All", "w:<word category>", "p:All", "p:<phrase topic>", and "clock" (quiz only).
const WORD_CATS = [...new Set(VOCAB.map((w) => w[2]))];
const PHRASE_CATS = [...new Set(PHRASES.map((p) => p[2]))];

function fillCategorySelect(sel, withClock) {
  sel.innerHTML = `<option value="All">Everything</option>`
    + `<optgroup label="Phrases & small talk"><option value="p:All">All phrases</option>${PHRASE_CATS.map((c) => `<option value="p:${esc(c)}">${esc(c)}</option>`).join("")}</optgroup>`
    + `<optgroup label="Words"><option value="w:All">All words</option>${WORD_CATS.map((c) => `<option value="w:${esc(c)}">${esc(c)}</option>`).join("")}</optgroup>`
    + (withClock ? `<optgroup label="Generated"><option value="clock">🕐 What time is it?</option></optgroup>` : "");
}

function itemsIn(cat) {
  if (cat === "All") return [...PHRASES, ...VOCAB];
  const [kind, name] = [cat.slice(0, 1), cat.slice(2)];
  const pool = kind === "p" ? PHRASES : VOCAB;
  return name === "All" ? pool : pool.filter((w) => w[2] === name);
}

// ---------- Telling the time ----------
const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze",
  "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const TENS = { 2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante" };

function numFr(n, feminine) {
  if (n < 20) return n === 1 && feminine ? "une" : UNITS[n];
  const t = TENS[Math.floor(n / 10)], u = n % 10;
  if (!u) return t;
  if (u === 1) return `${t} et ${feminine ? "une" : "un"}`;
  return `${t}-${UNITS[u]}`;
}

function hourFr(h) {
  if (h === 0) return "minuit";
  if (h === 12) return "midi";
  return `${numFr(h, true)} heure${h === 1 ? "" : "s"}`;
}

// Returns [french, "h:mm"]. Half the time it uses the conversational 12-hour style
// (et quart, et demie, moins le quart), half the time the 24-hour style used for timetables.
function randomTime() {
  const m = Math.floor(Math.random() * 12) * 5;
  const label = (h) => `${h}:${String(m).padStart(2, "0")}`;
  if (Math.random() < 0.5) {
    const h = 13 + Math.floor(Math.random() * 11);
    return [`Il est ${hourFr(h)}${m ? " " + numFr(m) : ""}`, label(h)];
  }
  const h = 1 + Math.floor(Math.random() * 12);
  let fr;
  if (m === 0) fr = hourFr(h);
  else if (m === 15) fr = `${hourFr(h)} et quart`;
  else if (m === 30) fr = `${hourFr(h)} et ${h === 12 ? "demi" : "demie"}`;
  else if (m < 30) fr = `${hourFr(h)} ${numFr(m)}`;
  else fr = `${hourFr(h === 12 ? 1 : h + 1)} moins ${m === 45 ? "le quart" : numFr(60 - m)}`;
  return [`Il est ${fr}`, label(h)];
}

function timeItems(n) {
  const seen = new Map();
  while (seen.size < n) {
    const [fr, en] = randomTime();
    seen.set(fr, [fr, en, "Time"]);
  }
  return [...seen.values()];
}

// ---------- Navigation ----------
function show(view) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
  if (view === "home") renderHome();
  if (view === "cards" && !flash.queue) startFlash();
  if (view === "quiz" && !quiz.questions) startQuiz();
  if (view === "verbs" && !verb.current) nextVerb();
  if (view === "talk" && !talk.d) startTalk();
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
  const unseen = itemsIn(state.settings.cardsCat).filter((w) => !state.cards[w[0]]).length;
  $("#stat-learned").textContent = learned;
  $("#stat-due").textContent = due;
  $("#stat-quiz").textContent = state.bestQuiz == null ? "–" : `${state.bestQuiz}%`;
  $("#stat-verbs").textContent = state.verbCorrect;
  $("#stat-talks").textContent = state.talksDone;

  const parts = [];
  if (due) parts.push(`<b>${due}</b> card${due > 1 ? "s" : ""} to review`);
  const n = Math.min(newLeft, unseen);
  if (n) parts.push(`<b>${n}</b> new card${n > 1 ? "s" : ""} to learn`);
  $("#home-summary").innerHTML = parts.length
    ? `Today you have ${parts.join(" and ")}.`
    : "You're all caught up on flashcards. Practise a conversation or some verb tenses!";

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
  $("#cards-cat").value = state.settings.cardsCat;
  renderHome();
  toast("Progress reset");
});

// ---------- Flashcards (spaced repetition) ----------
const flash = { queue: null, revealed: false };

function startFlash() {
  rollDay();
  const today = dayStr();
  const pool = itemsIn($("#cards-cat").value);
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
      <p class="muted">No more cards for now in this category. Come back tomorrow, pick another category, or raise "new cards per day" on Home.</p>
      <button class="btn primary" data-goto="talk">Practise a conversation</button>
    </div>`;
    return;
  }
  const [fr, en, cat] = q[0];
  const isNew = !state.cards[fr];
  area.innerHTML = `
    <div class="card flashcard" id="flashcard">
      <div class="tag">${esc(cat)}${isNew ? " · new" : ""}</div>
      <div class="front${fr.length > 25 ? " long" : ""}">${esc(fr)}</div>
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

$("#cards-cat").addEventListener("change", (e) => {
  state.settings.cardsCat = e.target.value;
  save();
  startFlash();
});

// ---------- Quiz ----------
const QUIZ_LEN = 10;
const quiz = { questions: null, i: 0, score: 0, answered: false };

function startQuiz() {
  const cat = $("#quiz-cat").value;
  const pool = cat === "clock" ? timeItems(30) : itemsIn(cat);
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
  const others = [...new Set(quiz.pool.filter((w) => w[0] !== fr).map((w) => (toFr ? w[0] : w[1])))].filter((o) => o !== answer);
  const options = shuffle([answer, ...shuffle(others).slice(0, 3)]);

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

// ---------- Verbs & tenses ----------
const verb = { current: null, answered: false };

const PC_AGREE = [["", "e"], ["", "e"], ["", "e"], ["s", "es"], ["", "e", "s", "es"], ["s", "es"]];
const PC_SHOW = ["(e)", "(e)", "(e)", "(e)s", "(e)(s)", "(e)s"];

// Returns six { show, accept } entries (je … ils/elles) for a verb in a tense.
function conjugate(name, tense) {
  const v = VERBS[name];
  const one = (s) => ({ show: s, accept: [s] });
  switch (tense) {
    case "present":
      return v.forms.map(one);
    case "passe":
      if (v.aux === "avoir") return VERBS.avoir.forms.map((a) => one(`${a} ${v.pp}`));
      return VERBS["être"].forms.map((a, i) => ({
        show: `${a} ${v.pp}${PC_SHOW[i]}`,
        accept: PC_AGREE[i].map((end) => `${a} ${v.pp}${end}`),
      }));
    case "imparfait": {
      const stem = name === "être" ? "ét" : v.forms[3].replace(/ons$/, "");
      return ["ais", "ais", "ait", "ions", "iez", "aient"].map((end) =>
        // mangeons → mange-, but "mangions" not "mangeions".
        one((stem.endsWith("ge") && end.startsWith("i") ? stem.slice(0, -1) : stem) + end));
    }
    case "proche":
      return VERBS.aller.forms.map((a) => one(`${a} ${name}`));
    case "futur":
      return ["ai", "as", "a", "ons", "ez", "ont"].map((end) => one(v.fut + end));
    case "conditionnel":
      return ["ais", "ais", "ait", "ions", "iez", "aient"].map((end) => one(v.fut + end));
  }
}

function pronounFor(i, form) {
  if (i === 0 && /^[aeiouéèêh]/.test(form)) return "j'";
  return PRONOUNS[i];
}

const withPronoun = (pr, form) => `${pr}${pr.endsWith("'") ? "" : " "}${form}`;

function nextVerb() {
  const vPick = $("#verb-pick").value;
  const tPick = $("#tense-pick").value;
  const name = vPick === "Random" ? pickOne(Object.keys(VERBS)) : vPick;
  const tense = tPick === "Random" ? pickOne(Object.keys(TENSES)) : tPick;
  verb.current = { name, tense, i: Math.floor(Math.random() * PRONOUNS.length) };
  verb.answered = false;
  renderVerb();
}

function renderVerb() {
  const { name, tense, i } = verb.current;
  const v = VERBS[name];
  const t = TENSES[tense];
  const form = conjugate(name, tense)[i];
  const pr = pronounFor(i, form.show);
  $("#tense-info").innerHTML = `<b>${esc(t.name)}</b> <span class="muted">(${esc(t.en)})</span> — ${esc(t.use)}
    <div class="example">${speakBtn(t.ex[0])} <span><i>${esc(t.ex[0])}</i><br><span class="muted">${esc(t.ex[1])}</span></span></div>`;
  $("#verb-area").innerHTML = `<div class="card">
    <div class="qcount">${esc(t.name)} · ${esc(name)} (${esc(v.en)})</div>
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
    const res = check(typed, form.accept.join(" / "));
    const full = withPronoun(pr, form.show);
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
    speak(withPronoun(pr, form.accept[0]));
    verb.answered = true;
    $("#verb-check").textContent = "Next →";
  };
  $("#verb-check").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  if (!$("#verb-table").classList.contains("hidden")) renderVerbTable();
}

function renderVerbTable() {
  const { name, tense } = verb.current;
  const v = VERBS[name];
  $("#verb-table").innerHTML = `<h3>${esc(name)} — ${esc(v.en)} ${speakBtn(name)}</h3>
    <p class="muted">${esc(TENSES[tense].name)}</p>
    <table>${conjugate(name, tense).map((f, i) => {
      const pr = pronounFor(i, f.show);
      return `<tr><td>${esc(pr)}</td><td><b>${esc(f.show)}</b></td><td>${speakBtn(withPronoun(pr, f.accept[0]))}</td></tr>`;
    }).join("")}</table>`;
}

$("#verb-pick").innerHTML = `<option>Random</option>` + Object.keys(VERBS).map((n) => `<option>${esc(n)}</option>`).join("");
$("#tense-pick").innerHTML = `<option value="Random">Mixed tenses</option>`
  + Object.entries(TENSES).map(([k, t]) => `<option value="${k}">${esc(t.name)}</option>`).join("");
$("#tense-pick").value = "passe";
$("#verb-pick").addEventListener("change", nextVerb);
$("#tense-pick").addEventListener("change", nextVerb);
$("#verb-table-btn").addEventListener("click", () => {
  const t = $("#verb-table");
  t.classList.toggle("hidden");
  $("#verb-table-btn").textContent = t.classList.contains("hidden") ? "Show table" : "Hide table";
  if (!t.classList.contains("hidden")) renderVerbTable();
});

// ---------- Small talk (conversations) ----------
const talk = { d: null, turn: 0, score: 0, log: [], answered: false, options: null };

$("#talk-pick").innerHTML = `<option value="Random">Random conversation</option>`
  + DIALOGUES.map((d, i) => `<option value="${i}">${esc(d.title)}</option>`).join("");

function startTalk() {
  const pick = $("#talk-pick").value;
  let d;
  if (pick === "Random") {
    const others = DIALOGUES.filter((x) => x !== talk.d);
    d = pickOne(others.length ? others : DIALOGUES);
  } else {
    d = DIALOGUES[+pick];
  }
  Object.assign(talk, { d, turn: 0, score: 0, log: [], answered: false, options: null });
  renderTalk();
}

function bubble(side, fr, en, revealed) {
  return `<div class="bubble ${side}">
    <div class="b-fr">${esc(fr)} ${speakBtn(fr)}</div>
    <div class="b-en${revealed ? "" : " blur"}" title="Tap to show the English">${esc(en)}</div>
  </div>`;
}

function renderTalk() {
  const { d, turn, log } = talk;
  const done = turn >= d.turns.length;
  let html = `<div class="card chat"><h3>${esc(d.title)}</h3>`;
  html += log.map((l) => bubble(l.side, l.fr, l.en, l.side === "me")).join("");

  if (done) {
    html += `</div><div class="card center">
      <h2>${talk.score === d.turns.length ? "Parfait ! 🎉" : "Bien joué ! 👏"}</h2>
      <p>You chose the natural reply <b>${talk.score} / ${d.turns.length}</b> times.</p>
      <button class="btn primary" id="talk-next">Next conversation</button>
      <button class="btn" id="talk-redo">Try this one again</button>
    </div>`;
    $("#talk-area").innerHTML = html;
    $("#talk-next").addEventListener("click", () => { $("#talk-pick").value = "Random"; startTalk(); });
    $("#talk-redo").addEventListener("click", () => {
      Object.assign(talk, { turn: 0, score: 0, log: [], answered: false, options: null });
      renderTalk();
    });
    return;
  }

  const t = d.turns[turn];
  if (!talk.options) talk.options = shuffle([t.reply[0], ...t.wrong]);
  html += bubble("them", t.them[0], t.them[1], false);
  html += `</div><div class="card">
    <div class="qcount">Turn ${turn + 1} of ${d.turns.length} · What would you say?</div>
    <div class="options">${talk.options.map((o, n) => `<button class="btn option" data-reply="${esc(o)}">${n + 1}. ${esc(o)}</button>`).join("")}</div>
    <div class="feedback" id="talk-fb"></div>
  </div>`;
  $("#talk-area").innerHTML = html;
  if (!talk.answered) speak(t.them[0]);

  document.querySelectorAll("[data-reply]").forEach((b) => b.addEventListener("click", () => {
    if (talk.answered) return advanceTalk();
    talk.answered = true;
    const right = b.dataset.reply === t.reply[0];
    document.querySelectorAll("[data-reply]").forEach((o) => { if (o.dataset.reply === t.reply[0]) o.classList.add("correct"); });
    const fb = $("#talk-fb");
    if (right) {
      talk.score++;
      addXp(3);
      fb.className = "feedback ok";
      fb.innerHTML = `✓ Natural reply! <span class="muted">“${esc(t.reply[1])}”</span>`;
    } else {
      b.classList.add("wrong");
      fb.className = "feedback bad";
      fb.innerHTML = `✗ That doesn't fit here. The natural reply means <span class="muted">“${esc(t.reply[1])}”</span>`;
    }
    fb.innerHTML += `<div><button class="btn primary small" id="talk-continue">Continue →</button></div>`;
    $("#talk-continue").addEventListener("click", advanceTalk);
    speak(t.reply[0]);
  }));
}

function advanceTalk() {
  const t = talk.d.turns[talk.turn];
  talk.log.push({ side: "them", fr: t.them[0], en: t.them[1] }, { side: "me", fr: t.reply[0], en: t.reply[1] });
  talk.turn++;
  talk.answered = false;
  talk.options = null;
  if (talk.turn >= talk.d.turns.length) {
    state.talksDone++;
    save();
  }
  renderTalk();
}

$("#talk-pick").addEventListener("change", startTalk);
$("#talk-area").addEventListener("click", (e) => {
  const en = e.target.closest(".b-en.blur");
  if (en) en.classList.remove("blur");
});

// ---------- Phrases ----------
$("#phrase-topic").innerHTML = `<option value="All">All topics</option>` + PHRASE_CATS.map((c) => `<option>${esc(c)}</option>`).join("");

function renderPhrases() {
  const hide = $("#hide-en").checked;
  const topic = $("#phrase-topic").value;
  const groups = topic === "All" ? PHRASE_CATS : [topic];
  $("#phrase-list").innerHTML = groups.map((g) => `<div class="phrase-group">
    <h3>${esc(g)}</h3>
    ${PHRASES.filter((p) => p[2] === g).map(([fr, en]) => `<div class="card phrase">
      ${speakBtn(fr)}
      <div><div class="fr">${esc(fr)}</div><div class="en${hide ? " blur" : ""}">${esc(en)}</div></div>
    </div>`).join("")}
  </div>`).join("");
}

$("#hide-en").addEventListener("change", renderPhrases);
$("#phrase-topic").addEventListener("change", renderPhrases);
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
      const opts = document.querySelectorAll("#quiz-area .option");
      if (opts[+e.key - 1]) opts[+e.key - 1].click();
    }
  }
  if (view === "view-talk" && talk.d && talk.turn < talk.d.turns.length) {
    if (talk.answered && e.key === "Enter") { e.preventDefault(); advanceTalk(); }
    else if (!talk.answered && ["1", "2", "3"].includes(e.key)) {
      const opts = document.querySelectorAll("[data-reply]");
      if (opts[+e.key - 1]) opts[+e.key - 1].click();
    }
  }
});

// ---------- Init ----------
fillCategorySelect($("#cards-cat"), false);
fillCategorySelect($("#quiz-cat"), true);
$("#cards-cat").value = state.settings.cardsCat;
if (!$("#cards-cat").value) $("#cards-cat").value = "p:All";
$("#quiz-cat").value = "p:All";
renderPhrases();
renderHome();
