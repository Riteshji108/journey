import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  Moon,
  Sun,
  ArrowRight,
  ListTree,
  Table2,
  NotebookPen,
  Compass,
  ArrowUpDown,
  X,
  Loader2,
  Tag,
  Smile,
  Meh,
  Flame,
  CloudDrizzle,
  Feather,
} from "lucide-react";

/* ----------------------------------------------------------------------- *
 *  BUJO TRANSFORM — turn a paragraph (or a photo of a page) into a
 *  structured daily log, a mindmap, a categorized table, and a set of
 *  at-a-glance insights. Built to feel like an actual dot-grid notebook.
 * ----------------------------------------------------------------------- */

/* ---------------------------- copy / fonts ------------------------------ */

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600;700&family=Caveat:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');`;

/* ------------------------------- helpers -------------------------------- */

const STOPWORDS = new Set(
  "a an the and or but if then so to of in on at for with by from as is are was were be been being this that these those it its i you he she we they my your his her our their not no do does did will would can could should must have has had also very just about into over under again more most other some such only own same than too very s t don now".split(
    " "
  )
);

const TASK_WORDS = [
  "need to", "needs to", "must", "should", "have to", "has to", "todo", "to-do",
  "finish", "complete", "submit", "prepare", "review", "call", "email", "buy",
  "fix", "write", "send", "schedule", "book", "clean", "organize", "plan",
  "update", "follow up", "reach out", "draft",
];
const EVENT_WORDS = [
  "meeting", "appointment", "conference", "webinar", "interview", "on monday",
  "on tuesday", "on wednesday", "on thursday", "on friday", "on saturday",
  "on sunday", "at ", "pm", "am", "scheduled", "event", "class", "session",
  "call with", "lunch with", "dinner with",
];
const PRIORITY_WORDS = [
  "urgent", "important", "critical", "asap", "priority", "deadline",
  "immediately", "crucial", "must", "high priority",
];
const NOTE_WORDS = [
  "idea", "think", "maybe", "consider", "note that", "remember", "interesting",
  "wonder", "reminds me", "realize", "notice",
];
const RESOURCE_WORDS = [
  "use", "tool", "resource", "link", "website", "book", "reference", "app",
  "platform", "guide", "template", "course", "article", "video",
];
const POSITIVE_WORDS = ["great", "excited", "happy", "love", "good", "success", "win", "glad", "enjoy", "hope", "grateful", "progress"];
const NEGATIVE_WORDS = ["worried", "stress", "problem", "issue", "delay", "fail", "difficult", "concerned", "tired", "frustrat", "behind", "overwhelm"];
const URGENT_WORDS = ["urgent", "asap", "immediately", "deadline", "critical", "now", "today"];

function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])|(?<=[.!?])$/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function includesAny(lower, words) {
  return words.some((w) => lower.includes(w));
}

function shorten(str, maxWords = 7) {
  const words = str.replace(/[.!?]+$/, "").split(" ");
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ") + "…";
}

function bujoTypeFor(sentence) {
  const lower = sentence.toLowerCase();
  if (includesAny(lower, PRIORITY_WORDS)) return "priority";
  if (includesAny(lower, EVENT_WORDS)) return "event";
  if (includesAny(lower, TASK_WORDS)) return "task";
  if (includesAny(lower, NOTE_WORDS)) return "note";
  return "note";
}

function categoryFor(sentence) {
  const lower = sentence.toLowerCase();
  if (includesAny(lower, PRIORITY_WORDS) && includesAny(lower, ["by", "due", "deadline", "before"]))
    return "Deadlines";
  if (includesAny(lower, EVENT_WORDS) || includesAny(lower, ["deadline", "due", "by "])) return "Deadlines";
  if (includesAny(lower, TASK_WORDS)) return "Action Items";
  if (includesAny(lower, RESOURCE_WORDS)) return "Resources";
  if (includesAny(lower, NOTE_WORDS)) return "Ideas";
  return "Ideas";
}

function extractTags(text, count = 7) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  const freq = {};
  words.forEach((w) => (freq[w] = (freq[w] || 0) + 1));
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
}

function detectMood(text) {
  const lower = text.toLowerCase();
  const pos = POSITIVE_WORDS.filter((w) => lower.includes(w)).length;
  const neg = NEGATIVE_WORDS.filter((w) => lower.includes(w)).length;
  const urgent = URGENT_WORDS.filter((w) => lower.includes(w)).length;
  if (urgent >= 2) return { label: "Urgent", icon: "flame" };
  if (pos > neg) return { label: "Upbeat", icon: "smile" };
  if (neg > pos) return { label: "Heavy", icon: "drizzle" };
  return { label: "Neutral", icon: "meh" };
}

function buildMindmap(sentences, tags) {
  const central = tags[0] || shorten(sentences[0] || "Main Topic", 3);
  const branches = sentences.slice(0, 6).map((s, i) => ({
    id: `b${i}`,
    label: shorten(s, 4),
    type: bujoTypeFor(s),
  }));
  return { central, branches };
}

/* ---------------------------- design tokens ------------------------------ */

const TYPE_META = {
  task: { glyph: "•", label: "Task", ink: "text-rose-700 dark:text-rose-300" },
  event: { glyph: "○", label: "Event", ink: "text-sky-700 dark:text-sky-300" },
  note: { glyph: "–", label: "Note", ink: "text-stone-600 dark:text-stone-300" },
  priority: { glyph: "✺", label: "Priority", ink: "text-amber-700 dark:text-amber-300" },
};

const CATEGORY_META = {
  "Action Items": {
    badge: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
    dot: "bg-rose-500",
  },
  Ideas: {
    badge: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
    dot: "bg-sky-500",
  },
  Resources: {
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  Deadlines: {
    badge: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    dot: "bg-amber-500",
  },
};

const MOOD_META = {
  smile: { icon: Smile, ring: "ring-emerald-400", text: "text-emerald-700 dark:text-emerald-300" },
  meh: { icon: Meh, ring: "ring-stone-400", text: "text-stone-600 dark:text-stone-300" },
  flame: { icon: Flame, ring: "ring-rose-400", text: "text-rose-700 dark:text-rose-300" },
  drizzle: { icon: CloudDrizzle, ring: "ring-slate-400", text: "text-slate-700 dark:text-slate-300" },
};

/* -------------------------- washi tape decor ----------------------------- */

function WashiTape({ className = "", color = "bg-amber-300/70" }) {
  return (
    <span
      className={`pointer-events-none absolute -top-3 h-6 w-16 rotate-[-4deg] ${color} shadow-sm ${className}`}
      style={{ clipPath: "polygon(0 10%,100% 0,100% 90%,0 100%)" }}
    />
  );
}

/* ------------------------------- component -------------------------------- */

export default function BujoTransform() {
  const [dark, setDark] = useState(false);
  const [text, setText] = useState(
    "Need to finish the polymer chemistry lab report by Friday. Meeting with the project advisor on Wednesday at 3pm to review the QSPR draft. I have an idea to combine glass transition temperature data with a small ML model for the practice paper. Remember to email the professor about extending the SwipeHire prototype demo. Buy new notebook and pens for the next sprint. It's urgent to submit the IGNOU assignment before the deadline. Consider using scikit-learn as a resource for the regression model. Feeling good about the progress this week, though a bit worried about time management."
  );
  const [fileName, setFileName] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [activeQuadrant, setActiveQuadrant] = useState("log");
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const fileInputRef = useRef(null);

  const canTransform = text.trim().length > 12 || fileName;

  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    // Simulated OCR: in a real build this would call a vision/OCR endpoint.
    setText(
      (prev) =>
        prev ||
        "Scanned page: Draft the quarterly review deck, urgent — due Thursday. Team sync at 10am. Idea — try a color legend for the roadmap. Use Figma as a reference for the layout."
    );
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const runTransform = () => {
    if (!canTransform) return;
    setIsProcessing(true);
    setResult(null);
    window.setTimeout(() => {
      const sentences = splitSentences(text);
      const tags = extractTags(text);
      const bujo = sentences.map((s, i) => ({ id: i, text: s, type: bujoTypeFor(s) }));
      const table = sentences.map((s, i) => ({
        id: i,
        text: s,
        category: categoryFor(s),
        length: s.split(" ").length,
      }));
      const mindmap = buildMindmap(sentences, tags);
      const mood = detectMood(text);
      const takeaways = sentences.slice(0, 3).map((s) => shorten(s, 10));
      setResult({ bujo, table, mindmap, mood, tags, takeaways, sentenceCount: sentences.length });
      setIsProcessing(false);
      setActiveQuadrant("log");
    }, 900);
  };

  const sortedTable = useMemo(() => {
    if (!result) return [];
    const rows = [...result.table];
    if (!sortKey) return rows;
    rows.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "number") return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return rows;
  }, [result, sortKey, sortAsc]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const quadrants = [
    { id: "log", label: "Daily Log", icon: NotebookPen },
    { id: "map", label: "Mindmap", icon: ListTree },
    { id: "table", label: "Database", icon: Table2 },
    { id: "insights", label: "Insights", icon: Compass },
  ];

  return (
    <div className={dark ? "dark" : ""}>
      <style>{`
        ${FONT_IMPORT}
        .font-display { font-family: 'Fraunces', serif; }
        .font-body { font-family: 'Inter', sans-serif; }
        .font-hand { font-family: 'Caveat', cursive; }
        .font-mono-bujo { font-family: 'JetBrains Mono', monospace; }
        .dot-grid {
          background-image: radial-gradient(var(--dot-color) 1px, transparent 1px);
          background-size: 22px 22px;
        }
        @keyframes riseIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rise-in { animation: riseIn 0.45s ease both; }
        @media (prefers-reduced-motion: reduce) {
          .rise-in { animation: none; }
        }
      `}</style>

      <div
        className="min-h-screen w-full font-body dot-grid transition-colors duration-300 bg-[#F6F1E4] dark:bg-[#171512] text-stone-800 dark:text-stone-200"
        style={{ "--dot-color": dark ? "rgba(255,255,255,0.06)" : "rgba(43,42,40,0.08)" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8">
          {/* ------------------------------ header ------------------------------ */}
          <header className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-sm bg-stone-800 dark:bg-amber-300 flex items-center justify-center text-amber-200 dark:text-stone-900 font-display text-lg rotate-[-2deg] shadow-md">
                ✺
              </div>
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight leading-none">
                  Bujo Transform
                </h1>
                <p className="font-hand text-lg text-stone-500 dark:text-amber-200/70 -mt-1">
                  paragraphs, plotted onto the page
                </p>
              </div>
            </div>
            <button
              onClick={() => setDark((d) => !d)}
              aria-label="Toggle dark mode"
              className="group relative flex items-center gap-2 rounded-full border border-stone-300 dark:border-stone-700 bg-white/70 dark:bg-stone-900/70 px-3.5 py-2 text-sm font-medium shadow-sm hover:shadow transition-all"
            >
              {dark ? <Sun size={16} className="text-amber-300" /> : <Moon size={16} className="text-stone-600" />}
              <span className="hidden sm:inline">{dark ? "Cozy dark" : "Daylight"}</span>
            </button>
          </header>

          {/* ------------------------------ input card ------------------------------ */}
          <section className="relative rounded-2xl border border-stone-300/70 dark:border-stone-700/70 bg-[#FDFBF5] dark:bg-[#1F1C18] shadow-[0_1px_0_rgba(0,0,0,0.04)] p-6 sm:p-8 mb-10">
            <WashiTape className="left-8" color="bg-rose-300/70 dark:bg-rose-500/40" />
            <WashiTape className="right-10" color="bg-sky-300/70 dark:bg-sky-500/40" />

            <div className="flex items-center gap-2 mb-4">
              <Feather size={18} className="text-stone-500 dark:text-amber-300" />
              <h2 className="font-display text-lg font-medium">Capture a page</h2>
            </div>

            <div className="grid md:grid-cols-5 gap-5">
              <div className="md:col-span-3">
                <label className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400 font-medium mb-1.5 block">
                  Paste a paragraph
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  placeholder="Write or paste anything — a journal entry, meeting notes, a rambling to-do list…"
                  className="w-full resize-none rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-3 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-amber-400/60 dark:focus:ring-amber-500/40 placeholder:text-stone-400 dark:placeholder:text-stone-600"
                />
                <p className="mt-1.5 text-xs text-stone-400 dark:text-stone-500">
                  {text.trim().split(/\s+/).filter(Boolean).length} words
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400 font-medium mb-1.5 block">
                  Or drop a photo
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`h-[calc(100%-2rem)] min-h-[10rem] flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors px-4 text-center ${
                    isDragging
                      ? "border-amber-400 bg-amber-50 dark:bg-amber-500/10"
                      : "border-stone-300 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-900/40 hover:border-stone-400"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                  {fileName ? (
                    <>
                      <ImageIcon size={22} className="text-emerald-600" />
                      <p className="text-sm font-medium text-stone-700 dark:text-stone-200 max-w-[14rem] truncate">
                        {fileName}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFileName(null);
                        }}
                        className="text-xs text-stone-400 hover:text-rose-500 flex items-center gap-1 mt-1"
                      >
                        <X size={12} /> remove
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload size={22} className="text-stone-400" />
                      <p className="text-sm text-stone-500 dark:text-stone-400">
                        Drag an image here, or click to browse
                      </p>
                      <p className="text-xs text-stone-400 dark:text-stone-600">
                        page photos are scanned for text
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-stone-400 dark:text-stone-500 max-w-sm">
                We'll sort every sentence into tasks, events, notes and priorities — then map, tabulate,
                and summarize the whole thing.
              </p>
              <button
                onClick={runTransform}
                disabled={!canTransform || isProcessing}
                className="inline-flex items-center gap-2 rounded-full bg-stone-800 dark:bg-amber-300 text-amber-50 dark:text-stone-900 px-6 py-3 text-sm font-semibold shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Transforming…
                  </>
                ) : (
                  <>
                    <Sparkles size={16} /> Transform in One Go <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </section>

          {/* ------------------------------ dashboard ------------------------------ */}
          {result && (
            <section className="rise-in">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="font-display text-xl font-semibold">Your page, plotted</h2>
                <div className="flex gap-1.5 rounded-full bg-stone-200/70 dark:bg-stone-800/70 p-1">
                  {quadrants.map((q) => {
                    const Icon = q.icon;
                    const active = activeQuadrant === q.id;
                    return (
                      <button
                        key={q.id}
                        onClick={() => setActiveQuadrant(q.id)}
                        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all lg:hidden ${
                          active
                            ? "bg-white dark:bg-stone-950 shadow text-stone-900 dark:text-amber-300"
                            : "text-stone-500 dark:text-stone-400"
                        }`}
                      >
                        <Icon size={14} /> {q.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <QuadrantCard
                  visible={activeQuadrant === "log"}
                  title="Bujo Daily Log"
                  icon={NotebookPen}
                  tape="bg-rose-300/70 dark:bg-rose-500/40"
                >
                  <ul className="space-y-2.5">
                    {result.bujo.map((item) => {
                      const meta = TYPE_META[item.type];
                      return (
                        <li key={item.id} className="flex items-start gap-3 text-[15px] leading-snug">
                          <span className={`font-mono-bujo text-lg leading-none w-4 shrink-0 ${meta.ink}`}>
                            {meta.glyph}
                          </span>
                          <span className="flex-1">
                            {item.text}
                            <span
                              className={`ml-2 align-middle text-[10px] uppercase tracking-wide font-semibold ${meta.ink} opacity-70`}
                            >
                              {meta.label}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </QuadrantCard>

                <QuadrantCard
                  visible={activeQuadrant === "map"}
                  title="Mindmap & Flow"
                  icon={ListTree}
                  tape="bg-sky-300/70 dark:bg-sky-500/40"
                >
                  <MindmapSVG data={result.mindmap} dark={dark} />
                </QuadrantCard>

                <QuadrantCard
                  visible={activeQuadrant === "table"}
                  title="Color-Coded Database"
                  icon={Table2}
                  tape="bg-emerald-300/70 dark:bg-emerald-500/40"
                  wide
                >
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-sm border-collapse min-w-[28rem]">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500 border-b border-stone-200 dark:border-stone-700">
                          <th className="py-2 px-2 font-medium">
                            <button
                              onClick={() => toggleSort("category")}
                              className="flex items-center gap-1 hover:text-stone-600 dark:hover:text-stone-300"
                            >
                              Category <ArrowUpDown size={11} />
                            </button>
                          </th>
                          <th className="py-2 px-2 font-medium">Extracted text</th>
                          <th className="py-2 px-2 font-medium">
                            <button
                              onClick={() => toggleSort("length")}
                              className="flex items-center gap-1 hover:text-stone-600 dark:hover:text-stone-300"
                            >
                              Words <ArrowUpDown size={11} />
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTable.map((row) => {
                          const meta = CATEGORY_META[row.category];
                          return (
                            <tr
                              key={row.id}
                              className="border-b border-stone-100 dark:border-stone-800/70 align-top"
                            >
                              <td className="py-2.5 px-2">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${meta.badge}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                                  {row.category}
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-stone-600 dark:text-stone-300">{row.text}</td>
                              <td className="py-2.5 px-2 text-stone-400 font-mono-bujo text-xs">{row.length}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </QuadrantCard>

                <QuadrantCard
                  visible={activeQuadrant === "insights"}
                  title="Visual Summary"
                  icon={Compass}
                  tape="bg-amber-300/70 dark:bg-amber-500/40"
                >
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500 font-medium mb-2">
                        Tags
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {result.tags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-2 py-1 text-xs text-stone-600 dark:text-stone-300"
                          >
                            <Tag size={10} /> {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500 font-medium mb-2">
                        Key takeaways
                      </p>
                      <ul className="space-y-1.5">
                        {result.takeaways.map((t, i) => (
                          <li key={i} className="flex gap-2 text-sm text-stone-600 dark:text-stone-300">
                            <span className="font-hand text-lg text-amber-500 leading-none">{i + 1}.</span>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex items-center gap-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/60 p-3.5">
                      {(() => {
                        const m = MOOD_META[result.mood.icon];
                        const Icon = m.icon;
                        return (
                          <>
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ring-2 ${m.ring} bg-white dark:bg-stone-950`}>
                              <Icon size={18} className={m.text} />
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">
                                Mood / tone
                              </p>
                              <p className={`font-display text-base font-semibold ${m.text}`}>
                                {result.mood.label}
                              </p>
                            </div>
                          </>
                        );
                      })()}
                      <div className="ml-auto text-right">
                        <p className="text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">
                          Lines logged
                        </p>
                        <p className="font-mono-bujo text-lg">{result.sentenceCount}</p>
                      </div>
                    </div>
                  </div>
                </QuadrantCard>
              </div>
            </section>
          )}

          {!result && !isProcessing && (
            <p className="text-center text-sm text-stone-400 dark:text-stone-600 font-hand text-xl">
              your page is waiting — press transform to see it plotted
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ subcomponents ------------------------------ */

function QuadrantCard({ visible, title, icon: Icon, children, tape, wide }) {
  return (
    <div
      className={`relative rounded-2xl border border-stone-300/70 dark:border-stone-700/70 bg-[#FDFBF5] dark:bg-[#1F1C18] shadow-[0_1px_0_rgba(0,0,0,0.04)] p-5 sm:p-6 rise-in ${
        wide ? "lg:col-span-2" : ""
      } ${visible ? "block" : "hidden lg:block"}`}
    >
      <WashiTape className="left-6" color={tape} />
      <div className="flex items-center gap-2 mb-4">
        <Icon size={17} className="text-stone-500 dark:text-amber-300" />
        <h3 className="font-display text-base font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function MindmapSVG({ data, dark }) {
  const { central, branches } = data;
  const cx = 220;
  const cy = 150;
  const r = 130;
  const inkColor = dark ? "#e7e2d6" : "#3a362f";
  const lineColor = dark ? "#57524a" : "#c9c2b2";

  const points = branches.map((b, i) => {
    const angle = (i / Math.max(branches.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle) * 0.75;
    return { ...b, x, y };
  });

  const typeFill = {
    task: "#f43f5e",
    event: "#0ea5e9",
    note: "#a8a29e",
    priority: "#d97706",
  };

  return (
    <svg viewBox="0 0 440 300" className="w-full h-auto">
      {points.map((p) => (
        <line
          key={`l-${p.id}`}
          x1={cx}
          y1={cy}
          x2={p.x}
          y2={p.y}
          stroke={lineColor}
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      ))}

      <circle cx={cx} cy={cy} r="46" fill={dark ? "#2a2620" : "#FBEFD4"} stroke="#d9a441" strokeWidth="1.5" />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill={inkColor}
        style={{ fontFamily: "Fraunces, serif" }}
      >
        {shortenSvgText(central, 16)}
      </text>

      {points.map((p) => (
        <g key={p.id}>
          <rect
            x={p.x - 52}
            y={p.y - 16}
            width="104"
            height="32"
            rx="9"
            fill={dark ? "#211e19" : "#ffffff"}
            stroke={typeFill[p.type]}
            strokeWidth="1.4"
          />
          <text
            x={p.x}
            y={p.y + 4}
            textAnchor="middle"
            fontSize="9.5"
            fill={inkColor}
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            {shortenSvgText(p.label, 18)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function shortenSvgText(str, maxChars) {
  return str.length > maxChars ? str.slice(0, maxChars - 1) + "…" : str;
}
