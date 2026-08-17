/* =========================================================
   MindSpace — app.js
   A private, local-first wellness journal.
   No backend, no analytics, no network calls.
   ========================================================= */

(function () {
  "use strict";

  /* ---------- Storage keys ---------- */
  const ENTRIES_KEY = "mindspace_entries";
  const THEME_KEY = "mindspace_theme";

  /* ---------- Mood reference data ---------- */
  const MOODS = {
    great:     { emoji: "😄", label: "Great",     value: 5 },
    good:      { emoji: "🙂", label: "Good",      value: 4 },
    okay:      { emoji: "😐", label: "Okay",      value: 3 },
    low:       { emoji: "😔", label: "Low",       value: 2 },
    difficult: { emoji: "😣", label: "Difficult", value: 1 },
  };

  /* ---------- Gentle post-save reflections (rotated, not diagnostic) ---------- */
  const REFLECTIONS = [
    "Thank you for taking a moment to reflect today.",
    "That's one more honest check-in with yourself. Well done.",
    "Noticing how you feel is a quiet kind of self-care. Nice work.",
    "Whatever today held, you showed up for yourself just now.",
    "Small habit, real value — thanks for writing today.",
  ];

  /* ---------- Very light, supportive-only safety net ----------
     This is NOT a diagnostic tool. It only looks for a small set of
     phrases that suggest someone may be in crisis, so MindSpace can
     point them toward real support instead of just saying "thanks". */
  const CONCERN_PHRASES = [
    "kill myself", "end my life", "ending my life", "want to die",
    "wish i was dead", "wish i were dead", "suicide", "suicidal",
    "hurt myself", "harm myself", "self harm", "self-harm",
    "no reason to live", "not worth living", "can't go on", "cant go on",
    "better off dead", "no point in living",
  ];

  /* ---------- State ---------- */
  let entries = [];
  let selectedMood = null;
  let breathing = { timer: null, cycleTimer: null, secondsLeft: 60, running: false };

  /* ============================================================
     Utilities
     ============================================================ */
  function loadEntries() {
    try {
      const raw = localStorage.getItem(ENTRIES_KEY);
      entries = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("MindSpace: could not read saved entries, starting fresh.", e);
      entries = [];
    }
  }

  function persistEntries() {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  }

  function sortedEntries() {
    return [...entries].sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }

  function formatDayLabel(date) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function containsConcernLanguage(text) {
    const lower = text.toLowerCase();
    return CONCERN_PHRASES.some((phrase) => lower.includes(phrase));
  }

  function uid() {
    return "e_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /* ============================================================
     Theme
     ============================================================ */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    const label = document.getElementById("theme-label");
    if (label) label.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      applyTheme(saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      applyTheme("dark");
    } else {
      applyTheme("light");
    }
  }

  /* ============================================================
     Landing <-> App
     ============================================================ */
  function enterApp() {
    document.getElementById("landing").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    renderAll();
  }

  /* ============================================================
     Navigation between views
     ============================================================ */
  function switchView(viewName) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const target = document.getElementById("view-" + viewName);
    if (target) target.classList.add("active");

    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === viewName);
    });

    if (viewName === "mood") renderMoodView();
    if (viewName === "dashboard") renderDashboard();
  }

  /* ============================================================
     Mood picker (journal form)
     ============================================================ */
  function initMoodPicker() {
    const options = document.querySelectorAll(".mood-option");
    options.forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedMood = btn.dataset.mood;
        options.forEach((o) => {
          o.classList.toggle("selected", o === btn);
          o.setAttribute("aria-checked", o === btn ? "true" : "false");
        });
      });
    });
  }

  function resetMoodPicker() {
    selectedMood = null;
    document.querySelectorAll(".mood-option").forEach((o) => {
      o.classList.remove("selected");
      o.setAttribute("aria-checked", "false");
    });
  }

  /* ============================================================
     Journal: save entry
     ============================================================ */
  function saveEntry() {
    const mainText = document.getElementById("journal-main").value.trim();
    const promptHappy = document.getElementById("prompt-happy").value.trim();
    const promptDifficult = document.getElementById("prompt-difficult").value.trim();
    const promptGrateful = document.getElementById("prompt-grateful").value.trim();
    const promptImprove = document.getElementById("prompt-improve").value.trim();

    const hint = document.getElementById("save-hint");

    if (!mainText && !promptHappy && !promptDifficult && !promptGrateful && !promptImprove) {
      hint.textContent = "Write a little something before saving.";
      hint.style.color = "var(--danger)";
      return;
    }

    const entry = {
      id: uid(),
      isoDate: new Date().toISOString(),
      mood: selectedMood,
      text: mainText,
      prompts: {
        happy: promptHappy,
        difficult: promptDifficult,
        grateful: promptGrateful,
        improve: promptImprove,
      },
      demo: false,
    };

    entries.push(entry);
    persistEntries();

    const allText = [mainText, promptHappy, promptDifficult, promptGrateful, promptImprove].join(" ");
    const concerning = containsConcernLanguage(allText);

    showPostSaveMessage(concerning);
    clearJournalForm();
    renderEntries();
    hint.textContent = "Saved just now.";
    hint.style.color = "var(--ink-muted)";
  }

  function showPostSaveMessage(concerning) {
    const reflectionCard = document.getElementById("reflection-card");
    const crisisCard = document.getElementById("crisis-card");

    if (concerning) {
      crisisCard.classList.remove("hidden");
      reflectionCard.classList.add("hidden");
      crisisCard.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      const msg = REFLECTIONS[Math.floor(Math.random() * REFLECTIONS.length)];
      document.getElementById("reflection-text").textContent = msg;
      reflectionCard.classList.remove("hidden");
      crisisCard.classList.add("hidden");
      setTimeout(() => reflectionCard.classList.add("hidden"), 6000);
    }
  }

  function clearJournalForm() {
    document.getElementById("journal-main").value = "";
    document.getElementById("prompt-happy").value = "";
    document.getElementById("prompt-difficult").value = "";
    document.getElementById("prompt-grateful").value = "";
    document.getElementById("prompt-improve").value = "";
    resetMoodPicker();
  }

  /* ============================================================
     Render: entries list
     ============================================================ */
  function renderEntries() {
    const list = document.getElementById("entries-list");
    const countEl = document.getElementById("entries-count");
    const sorted = sortedEntries();

    countEl.textContent = sorted.length === 1 ? "1 entry" : sorted.length + " entries";

    if (sorted.length === 0) {
      list.innerHTML = '<p class="empty-state">No entries yet. Your first one is above — there\'s no wrong way to start.</p>';
      return;
    }

    list.innerHTML = sorted.map((e) => {
      const moodInfo = e.mood ? MOODS[e.mood] : null;
      const promptRows = ["happy", "difficult", "grateful", "improve"]
        .filter((k) => e.prompts && e.prompts[k])
        .map((k) => {
          const questions = {
            happy: "What made you happy today?",
            difficult: "What was difficult today?",
            grateful: "What are you grateful for?",
            improve: "One thing to improve tomorrow",
          };
          return `<div><div class="entry-prompt-q">${questions[k]}</div><div class="entry-prompt-a">${escapeHtml(e.prompts[k])}</div></div>`;
        }).join("");

      return `
        <div class="entry-item">
          <div class="entry-item-head">
            <span class="entry-date">${formatDateTime(e.isoDate)}${e.demo ? '<span class="entry-demo-badge">Demo</span>' : ""}</span>
            ${moodInfo ? `<span class="entry-mood" title="${moodInfo.label}">${moodInfo.emoji}</span>` : ""}
          </div>
          ${e.text ? `<div class="entry-text">${escapeHtml(e.text)}</div>` : ""}
          ${promptRows ? `<div class="entry-prompts">${promptRows}</div>` : ""}
        </div>`;
    }).join("");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ============================================================
     Mood view + weekly chart (shared by Mood view & Dashboard)
     ============================================================ */
  function lastNDays(n) {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    return days;
  }

  function moodForDay(day) {
    // If multiple entries on a day, use the last one recorded that day.
    const dayEntries = entries
      .filter((e) => e.mood && isSameDay(new Date(e.isoDate), day))
      .sort((a, b) => new Date(a.isoDate) - new Date(b.isoDate));
    if (dayEntries.length === 0) return null;
    return dayEntries[dayEntries.length - 1].mood;
  }

  function renderWeeklyChart(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const days = lastNDays(7);

    container.innerHTML = days.map((day) => {
      const mood = moodForDay(day);
      const info = mood ? MOODS[mood] : null;
      const heightPct = info ? (info.value / 5) * 100 : 0;
      return `
        <div class="chart-bar-col">
          <span class="chart-emoji">${info ? info.emoji : "·"}</span>
          <div class="chart-bar ${info ? "" : "chart-bar-empty"}" style="height:${info ? heightPct : 3}%"></div>
          <span class="chart-day-label">${formatDayLabel(day)}</span>
        </div>`;
    }).join("");
  }

  function renderMoodView() {
    renderWeeklyChart("mood-chart-weekly");

    const historyList = document.getElementById("mood-history-list");
    const withMood = sortedEntries().filter((e) => e.mood);
    if (withMood.length === 0) {
      historyList.innerHTML = '<p class="empty-state">No moods logged yet. Pick one next time you write an entry.</p>';
      return;
    }
    historyList.innerHTML = withMood.map((e) => {
      const info = MOODS[e.mood];
      return `
        <div class="mood-history-row">
          <span class="mood-history-emoji">${info.emoji}</span>
          <span class="mood-history-label">${info.label}</span>
          <span class="mood-history-date">${formatDateTime(e.isoDate)}</span>
        </div>`;
    }).join("");
  }

  /* ============================================================
     Dashboard: stats
     ============================================================ */
  function computeStreak() {
    const daysWithEntries = new Set(
      entries.map((e) => {
        const d = new Date(e.isoDate);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })
    );
    if (daysWithEntries.size === 0) return 0;

    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    // If nothing logged today yet, streak can still count from yesterday backward.
    if (!daysWithEntries.has(cursor.getTime())) {
      cursor.setDate(cursor.getDate() - 1);
    }

    while (daysWithEntries.has(cursor.getTime())) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function mostCommonMood() {
    const counts = {};
    entries.forEach((e) => {
      if (e.mood) counts[e.mood] = (counts[e.mood] || 0) + 1;
    });
    const keys = Object.keys(counts);
    if (keys.length === 0) return null;
    return keys.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  }

  function renderDashboard() {
    document.getElementById("stat-total").textContent = entries.length;
    document.getElementById("stat-streak").innerHTML = computeStreak() + '<span class="stat-unit"> days</span>';

    const common = mostCommonMood();
    document.getElementById("stat-common-mood").textContent = common
      ? `${MOODS[common].emoji} ${MOODS[common].label}`
      : "—";

    renderWeeklyChart("mood-chart-dashboard");
    renderTodayReflection();
  }

  function renderTodayReflection() {
    const today = new Date();
    const todaysEntries = entries.filter((e) => isSameDay(new Date(e.isoDate), today));
    const el = document.getElementById("today-reflection");

    if (todaysEntries.length === 0) {
      el.innerHTML = '<p class="empty-state">You haven\'t written today yet. Head to the Journal tab whenever you\'re ready.</p>';
      return;
    }
    const latest = todaysEntries[todaysEntries.length - 1];
    const info = latest.mood ? MOODS[latest.mood] : null;
    el.innerHTML = `
      <p>${info ? `${info.emoji} You logged your day as <strong>${info.label}</strong>. ` : ""}${latest.text ? escapeHtml(latest.text) : "Thanks for checking in today."}</p>
    `;
  }

  /* ============================================================
     Demo data
     ============================================================ */
  function buildDemoEntries() {
    const now = new Date();
    const demo = [
      { offset: 6, mood: "good", text: "Demo entry: Settled into a new routine at college. Feeling optimistic.", happy: "Caught up with an old friend." },
      { offset: 5, mood: "okay", text: "Demo entry: An average day, nothing remarkable, but steady.", grateful: "A quiet evening to myself." },
      { offset: 4, mood: "difficult", text: "Demo entry: Overwhelmed by deadlines piling up.", difficult: "Too many things due at once." },
      { offset: 3, mood: "good", text: "Demo entry: Finished a project I'd been putting off. Relief.", improve: "Start tasks earlier next time." },
      { offset: 2, mood: "great", text: "Demo entry: Genuinely happy today — small wins added up.", happy: "A good workout and good food." },
      { offset: 1, mood: "low", text: "Demo entry: Tired and a bit low on motivation.", difficult: "Didn't sleep well." },
      { offset: 0, mood: "good", text: "Demo entry: Feeling steady heading into the day.", grateful: "Morning coffee and quiet time to plan." },
    ];

    return demo.map((d, i) => {
      const date = new Date(now);
      date.setDate(date.getDate() - d.offset);
      date.setHours(9 + i, 15, 0, 0);
      return {
        id: "demo_" + d.offset,
        isoDate: date.toISOString(),
        mood: d.mood,
        text: d.text,
        prompts: {
          happy: d.happy || "",
          difficult: d.difficult || "",
          grateful: d.grateful || "",
          improve: d.improve || "",
        },
        demo: true,
      };
    });
  }

  function loadDemoData() {
    const existingIds = new Set(entries.map((e) => e.id));
    const demoEntries = buildDemoEntries().filter((d) => !existingIds.has(d.id));
    entries.push(...demoEntries);
    persistEntries();
    renderAll();
  }

  /* ============================================================
     Delete all data
     ============================================================ */
  function deleteAllData() {
    entries = [];
    localStorage.removeItem(ENTRIES_KEY);
    renderAll();
  }

  /* ============================================================
     Breathing exercise
     ============================================================ */
  const BREATH_PHASES = [
    { label: "Breathe in", duration: 4000, cssClass: "state-in" },
    { label: "Hold", duration: 4000, cssClass: "state-hold" },
    { label: "Breathe out", duration: 6000, cssClass: "state-out" },
  ];

  function startBreathing() {
    if (breathing.running) return;
    breathing.running = true;
    breathing.secondsLeft = 60;

    document.getElementById("breathe-start-btn").classList.add("hidden");
    document.getElementById("breathe-stop-btn").classList.remove("hidden");

    runBreathPhase(0);

    breathing.timer = setInterval(() => {
      breathing.secondsLeft--;
      document.getElementById("breathe-timer").textContent = Math.max(breathing.secondsLeft, 0) + "s";
      if (breathing.secondsLeft <= 0) {
        stopBreathing(true);
      }
    }, 1000);
  }

  function runBreathPhase(phaseIndex) {
    if (!breathing.running) return;
    const phase = BREATH_PHASES[phaseIndex % BREATH_PHASES.length];
    const circle = document.getElementById("breathe-circle");
    const instruction = document.getElementById("breathe-instruction");

    circle.classList.remove("state-in", "state-hold", "state-out");
    // force reflow so the transition re-triggers each phase
    void circle.offsetWidth;
    circle.classList.add(phase.cssClass);
    instruction.textContent = phase.label;

    breathing.cycleTimer = setTimeout(() => {
      runBreathPhase(phaseIndex + 1);
    }, phase.duration);
  }

  function stopBreathing(completed) {
    breathing.running = false;
    clearInterval(breathing.timer);
    clearTimeout(breathing.cycleTimer);
    breathing.timer = null;
    breathing.cycleTimer = null;

    const circle = document.getElementById("breathe-circle");
    circle.classList.remove("state-in", "state-hold", "state-out");
    document.getElementById("breathe-instruction").textContent = completed ? "Nicely done" : "Ready";
    document.getElementById("breathe-timer").textContent = "60s";
    document.getElementById("breathe-start-btn").classList.remove("hidden");
    document.getElementById("breathe-stop-btn").classList.add("hidden");
  }

  /* ============================================================
     Modals
     ============================================================ */
  function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
  function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

  /* ============================================================
     Master render
     ============================================================ */
  function renderAll() {
    renderEntries();
    renderMoodView();
    renderDashboard();
  }

  /* ============================================================
     Init
     ============================================================ */
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    loadEntries();
    initMoodPicker();

    document.getElementById("today-date-label").textContent =
      new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    // Landing
    document.getElementById("enter-app-btn").addEventListener("click", enterApp);
    document.getElementById("landing-theme-toggle").addEventListener("click", toggleTheme);

    // Theme toggles (sidebar + mobile)
    document.getElementById("app-theme-toggle").addEventListener("click", toggleTheme);
    document.getElementById("mobile-theme-toggle").addEventListener("click", toggleTheme);

    // Nav (sidebar + bottom bar share the .nav-item[data-view] pattern)
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    // Journal
    document.getElementById("save-entry-btn").addEventListener("click", saveEntry);
    document.getElementById("dismiss-crisis-btn").addEventListener("click", () => {
      document.getElementById("crisis-card").classList.add("hidden");
    });

    const promptsToggle = document.getElementById("prompts-toggle");
    promptsToggle.addEventListener("click", () => {
      const panel = document.getElementById("optional-prompts");
      const isHidden = panel.hasAttribute("hidden");
      if (isHidden) {
        panel.removeAttribute("hidden");
        promptsToggle.setAttribute("aria-expanded", "true");
        promptsToggle.innerHTML = "<span>− Hide guided prompts</span>";
      } else {
        panel.setAttribute("hidden", "");
        promptsToggle.setAttribute("aria-expanded", "false");
        promptsToggle.innerHTML = "<span>+ Add guided prompts</span>";
      }
    });

    // Dashboard actions
    document.getElementById("load-demo-btn").addEventListener("click", loadDemoData);
    document.getElementById("delete-all-btn").addEventListener("click", () => openModal("delete-modal"));
    document.getElementById("cancel-delete-btn").addEventListener("click", () => closeModal("delete-modal"));
    document.getElementById("confirm-delete-btn").addEventListener("click", () => {
      deleteAllData();
      closeModal("delete-modal");
    });

    // Privacy modal
    document.getElementById("privacy-btn").addEventListener("click", () => openModal("privacy-modal"));
    document.getElementById("close-privacy-btn").addEventListener("click", () => closeModal("privacy-modal"));

    // Close modals on overlay click
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.add("hidden");
      });
    });

    // Breathing
    document.getElementById("breathe-start-btn").addEventListener("click", startBreathing);
    document.getElementById("breathe-stop-btn").addEventListener("click", () => stopBreathing(false));
  });
})();