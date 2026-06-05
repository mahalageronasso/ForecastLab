import React, { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, BarChart, Bar, Cell, Legend,
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// REAL DATA — Jumeirah Beach Hotel Dubai (599 rooms), from RDM 2301 project
// ─────────────────────────────────────────────────────────────────────────────
const ROOMS = 599;
const DAYS = { Jan: 31, Feb: 28, Mar: 31, Apr: 30, May: 31, Jun: 30, Jul: 31, Aug: 31, Sep: 30, Oct: 31, Nov: 30, Dec: 31 };
const RAW = [
  { m: "Jan", y: 2024, occ: 0.792, adr: 1820, note: "High season — Winter tourism peak" },
  { m: "Feb", y: 2024, occ: 0.831, adr: 1890, note: "Peak season — Pleasant weather, events" },
  { m: "Mar", y: 2024, occ: 0.814, adr: 1860, note: "High season — Dubai Art Week" },
  { m: "Apr", y: 2024, occ: 0.748, adr: 1640, note: "Shoulder season begins" },
  { m: "May", y: 2024, occ: 0.623, adr: 1380, note: "Low season — Heat increases" },
  { m: "Jun", y: 2024, occ: 0.571, adr: 1260, note: "Low season — Summer heat" },
  { m: "Jul", y: 2024, occ: 0.546, adr: 1210, note: "Low season — Peak summer" },
  { m: "Aug", y: 2024, occ: 0.582, adr: 1250, note: "Low season — Still hot" },
  { m: "Sep", y: 2024, occ: 0.637, adr: 1310, note: "Transition — Weather improving" },
  { m: "Oct", y: 2024, occ: 0.704, adr: 1540, note: "Shoulder — Events & GITEX" },
  { m: "Nov", y: 2024, occ: 0.778, adr: 1720, note: "High season — Tourism returns" },
  { m: "Dec", y: 2024, occ: 0.853, adr: 2100, note: "Peak season — F1 / Holidays" },
  { m: "Jan", y: 2025, occ: 0.810, adr: 1850, note: "High season — Winter tourism" },
  { m: "Feb", y: 2025, occ: 0.854, adr: 1940, note: "Peak season — DSF & Valentine's" },
  { m: "Mar", y: 2025, occ: 0.832, adr: 1900, note: "High season — Events continue" },
  { m: "Apr", y: 2025, occ: 0.761, adr: 1680, note: "Shoulder season" },
  { m: "May", y: 2025, occ: 0.638, adr: 1410, note: "Low season — Heat" },
  { m: "Jun", y: 2025, occ: 0.589, adr: 1290, note: "Low season — Summer" },
  { m: "Jul", y: 2025, occ: 0.557, adr: 1230, note: "Low season — Peak summer" },
  { m: "Aug", y: 2025, occ: 0.596, adr: 1270, note: "Low season — Hot weather" },
  { m: "Sep", y: 2025, occ: 0.652, adr: 1340, note: "Transition — Weather improving" },
  { m: "Oct", y: 2025, occ: 0.721, adr: 1580, note: "Shoulder — GITEX & Events" },
  { m: "Nov", y: 2025, occ: 0.794, adr: 1760, note: "High season — Tourism returns" },
  { m: "Dec", y: 2025, occ: 0.871, adr: 2150, note: "Peak season — F1 / Year-end" },
].map((d, i) => ({
  ...d, idx: i, label: `${d.m} ${String(d.y).slice(2)}`,
  roomsSold: ROOMS * DAYS[d.m] * d.occ,
  revpar: d.occ * d.adr,
}));

const ACTUAL = RAW.map((d) => d.occ);
const LABELS = RAW.map((d) => d.label);

// ─────────────────────────────────────────────────────────────────────────────
// FORECASTING ENGINE — every method recomputes live from controls
// ─────────────────────────────────────────────────────────────────────────────
function naive(actual) {
  // F[t] = A[t-1]
  return actual.map((_, t) => (t === 0 ? null : actual[t - 1]));
}
function movingAvg(actual, n) {
  return actual.map((_, t) => {
    if (t < n) return null;
    let s = 0;
    for (let k = 1; k <= n; k++) s += actual[t - k];
    return s / n;
  });
}
function weightedMA(actual, weights) {
  const n = weights.length;
  return actual.map((_, t) => {
    if (t < n) return null;
    let s = 0;
    for (let k = 0; k < n; k++) s += weights[k] * actual[t - 1 - k];
    return s;
  });
}
function expSmooth(actual, alpha, seed) {
  // F[t] = alpha*A[t-1] + (1-alpha)*F[t-1]; F starts at seed
  const f = [];
  for (let t = 0; t < actual.length; t++) {
    if (t === 0) { f.push(seed); continue; }
    f.push(alpha * actual[t - 1] + (1 - alpha) * f[t - 1]);
  }
  return f;
}

// Error metrics computed over a window [start, end] inclusive
function metrics(forecast, actual, start, end) {
  const errs = [], abss = [], pcts = [], sqs = [];
  for (let t = start; t <= end; t++) {
    if (forecast[t] == null) continue;
    const e = forecast[t] - actual[t];
    errs.push(e); abss.push(Math.abs(e));
    pcts.push(Math.abs(e) / actual[t]); sqs.push(e * e);
  }
  if (!errs.length) return null;
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const mse = avg(sqs);
  return { ME: avg(errs), MAE: avg(abss), MAPE: avg(pcts) * 100, MSE: mse, RMSE: Math.sqrt(mse) };
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSESSMENT — questions mapped to the 5 Excel rubric criteria (100 pts).
// type "num"   → auto-graded, |answer-correct| <= tol
// type "mc"    → auto-graded, exact match
// type "text"  → manual grading by instructor, points awarded on review
// correct/tol only ever live here (instructor side); never shown to students.
// ─────────────────────────────────────────────────────────────────────────────
const TOTAL_POINTS = 100;
const QUESTIONS = [
  // ── Criterion 1: Raw Data & KPI (20) ──
  { id: "q1", crit: "Raw Data & KPI Analysis", section: 1, pts: 4, type: "num",
    prompt: "Peak occupancy in the dataset (%). Read it from the Data tab.", unit: "%", correct: 87.1, tol: 0.2 },
  { id: "q2", crit: "Raw Data & KPI Analysis", section: 1, pts: 4, type: "num",
    prompt: "Trough (lowest) occupancy in the dataset (%).", unit: "%", correct: 54.6, tol: 0.2 },
  { id: "q3", crit: "Raw Data & KPI Analysis", section: 1, pts: 4, type: "num",
    prompt: "Average 2025 occupancy minus average 2024 occupancy — the year-over-year lift, in percentage points (one decimal).", unit: "pp", correct: 2.0, tol: 0.6 },
  { id: "q4", crit: "Raw Data & KPI Analysis", section: 1, pts: 8, type: "text",
    prompt: "In 2–3 sentences, describe the seasonal pattern a revenue manager must plan around. Reference at least one specific month or season.", rows: 4 },
  // ── Criterion 2: Four Methods (30) ──
  { id: "q5", crit: "Four Forecasting Methods", section: 2, pts: 5, type: "mc",
    prompt: "Which method sets next period's forecast equal to the most recent actual value?",
    options: ["Naïve", "Moving Average", "Weighted MA", "Exponential Smoothing"], correct: "Naïve" },
  { id: "q6", crit: "Four Forecasting Methods", section: 2, pts: 5, type: "num",
    prompt: "On the Weighted MA tab, set weights w₁=0.5, w₂=0.3, w₃=0.2. Report the WMA forecast for Jan 2026 (the value the tab shows), in %.", unit: "%", correct: 81.1, tol: 0.8 },
  { id: "q7", crit: "Four Forecasting Methods", section: 2, pts: 10, type: "text",
    prompt: "Choose your own WMA weights (summing to 1.0, with w₁>w₂>w₃) and justify them. Why does the most recent month deserve the weight you gave it at THIS hotel?", rows: 5 },
  { id: "q8", crit: "Four Forecasting Methods", section: 2, pts: 10, type: "text",
    prompt: "On the Exponential Smoothing tab, pick an α you would actually use and explain the trade-off. What does a low α protect you from, and what does it cost you?", rows: 5 },
  // ── Criterion 3: Accuracy (20) ──
  { id: "q9", crit: "Accuracy Evaluation", section: 3, pts: 5, type: "num",
    prompt: "On the Accuracy tab (holdout Jul–Dec 2025), report the Naïve method's MAPE (%).", unit: "%", correct: 8.08, tol: 0.4 },
  { id: "q10", crit: "Accuracy Evaluation", section: 3, pts: 5, type: "mc",
    prompt: "All four methods show a NEGATIVE Mean Error (ME) on the holdout. What does that tell you?",
    options: ["The methods over-forecast (forecast > actual)", "The methods under-forecast (forecast < actual)", "The methods are unbiased", "ME cannot be interpreted this way"],
    correct: "The methods under-forecast (forecast < actual)" },
  { id: "q11", crit: "Accuracy Evaluation", section: 3, pts: 10, type: "text",
    prompt: "For one method, RMSE sits noticeably above its MAE. Explain in your own words what that gap signals about the method's errors, and why a revenue manager should care.", rows: 5 },
  // ── Criterion 4: Scenario (15) ──
  { id: "q12", crit: "Scenario Planning", section: 4, pts: 5, type: "num",
    prompt: "Using your chosen method, state your forecast occupancy for Jan 2026 (%). Any defensible value from your method is accepted; we check it lands in a sane band.", unit: "%", correct: 81, tol: 8 },
  { id: "q13", crit: "Scenario Planning", section: 4, pts: 10, type: "text",
    prompt: "Build a Q1 2026 projection (Jan/Feb/Mar): for each month give occupancy %, a target ADR in AED, and the resulting RevPAR. Tie your ADR choices to the seasonal/event pattern in the data.", rows: 6 },
  // ── Criterion 5: Strategic Recommendations (15) ──
  { id: "q14", crit: "Strategic Recommendations", section: 5, pts: 7, type: "text",
    prompt: "State the single forecasting method you recommend to the GM and defend it with a SPECIFIC number from the Accuracy tab. Then name the biggest risk to your forecast.", rows: 5 },
  { id: "q15", crit: "Strategic Recommendations", section: 5, pts: 8, type: "text",
    prompt: "Executive summary (4–6 sentences) for the General Manager: method chosen & why, how Q1 2026 compares to Q1 2025, and your single most important pricing recommendation.", rows: 7 },
];
const CRITERIA = [
  { name: "Raw Data & KPI Analysis", pts: 20 },
  { name: "Four Forecasting Methods", pts: 30 },
  { name: "Accuracy Evaluation", pts: 20 },
  { name: "Scenario Planning", pts: 15 },
  { name: "Strategic Recommendations", pts: 15 },
];
const INSTRUCTOR_PASSWORD = "rdm2301"; // change before sharing with students

// Submission codec: JSON → URI-escaped → base64, wrapped with a checksum + marker.
function encodeSubmission(obj) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  let sum = 0;
  for (let i = 0; i < b64.length; i++) sum = (sum + b64.charCodeAt(i) * (i + 1)) % 9973;
  const tag = sum.toString(36).padStart(3, "0").toUpperCase();
  // chunk into readable groups of 5
  const body = b64.replace(/(.{5})/g, "$1 ").trim();
  return `RDM2301-${tag}::${body}`;
}
function decodeSubmission(code) {
  try {
    const m = code.trim().match(/^RDM2301-([0-9A-Z]{3})::([\s\S]+)$/);
    if (!m) return { ok: false, err: "Not a valid RDM2301 code (missing header)." };
    const tag = m[1];
    const b64 = m[2].replace(/\s+/g, "");
    let sum = 0;
    for (let i = 0; i < b64.length; i++) sum = (sum + b64.charCodeAt(i) * (i + 1)) % 9973;
    const calc = sum.toString(36).padStart(3, "0").toUpperCase();
    const tampered = calc !== tag;
    const json = decodeURIComponent(escape(atob(b64)));
    return { ok: true, data: JSON.parse(json), tampered };
  } catch (e) {
    return { ok: false, err: "Could not decode — the code may be incomplete or corrupted." };
  }
}
function autoGrade(q, ans) {
  if (ans == null || ans === "") return { auto: true, earned: 0, max: q.pts, verdict: "blank" };
  if (q.type === "num") {
    const v = parseFloat(String(ans).replace(/[^0-9.\-]/g, ""));
    if (isNaN(v)) return { auto: true, earned: 0, max: q.pts, verdict: "invalid" };
    const ok = Math.abs(v - q.correct) <= q.tol;
    return { auto: true, earned: ok ? q.pts : 0, max: q.pts, verdict: ok ? "correct" : "wrong", got: v, want: q.correct, tol: q.tol };
  }
  if (q.type === "mc") {
    const ok = ans === q.correct;
    return { auto: true, earned: ok ? q.pts : 0, max: q.pts, verdict: ok ? "correct" : "wrong", got: ans, want: q.correct };
  }
  return { auto: false, earned: null, max: q.pts, verdict: "manual" };
}

const SEASON = (m) => (["Nov", "Dec", "Jan", "Feb", "Mar"].includes(m) ? "High" : ["Jun", "Jul", "Aug"].includes(m) ? "Low" : "Shoulder");
const SEASON_COLOR = { High: "#c8893f", Low: "#7a9bb0", Shoulder: "#9aa089" };

// ─────────────────────────────────────────────────────────────────────────────
// UI PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  ink: "#23211c", paper: "#f4f0e6", panel: "#fbf8f0", line: "#ddd5c2",
  gold: "#b8863b", goldDk: "#8c6325", teal: "#2f6d6a", rust: "#a8542e",
  muted: "#7d7768", green: "#5b7a4a",
};

function Slider({ label, value, min, max, step, onChange, fmt, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: 0.2 }}>{label}</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 500, color: C.goldDk, background: "#f0e7d2", padding: "2px 9px", borderRadius: 5 }}>{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: C.gold, height: 4, cursor: "pointer" }} />
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontStyle: "italic" }}>{hint}</div>}
    </div>
  );
}

function Tab({ active, onClick, children, num }) {
  return (
    <button onClick={onClick} style={{
      border: "none", background: active ? C.ink : "transparent", color: active ? C.paper : C.ink,
      padding: "11px 18px", borderRadius: 9, cursor: "pointer", fontSize: 13.5, fontWeight: 600,
      fontFamily: "'Spectral', serif", letterSpacing: 0.3, display: "flex", alignItems: "center", gap: 9,
      transition: "all .18s", whiteSpace: "nowrap",
    }}>
      <span style={{
        fontFamily: "'DM Mono', monospace", fontSize: 11, width: 20, height: 20, borderRadius: "50%",
        display: "grid", placeItems: "center", background: active ? C.gold : "#e6ddc8", color: active ? "#fff" : C.muted,
      }}>{num}</span>
      {children}
    </button>
  );
}

const pct = (x) => (x == null ? "—" : (x * 100).toFixed(1) + "%");

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function ForecastLab() {
  const [tab, setTab] = useState(0);
  // controls
  const [maWindow, setMaWindow] = useState(3);
  const [w1, setW1] = useState(0.5);
  const [w2, setW2] = useState(0.3);
  const [alpha, setAlpha] = useState(0.3);

  const w3 = Math.max(0, 1 - w1 - w2);
  const weights = [w1, w2, w3];
  const wSum = w1 + w2 + w3;

  const seed = (ACTUAL[0] + ACTUAL[1] + ACTUAL[2]) / 3; // Jan–Mar 2024 avg

  // all forecast series
  const fNaive = useMemo(() => naive(ACTUAL), []);
  const fMA = useMemo(() => movingAvg(ACTUAL, maWindow), [maWindow]);
  const fWMA = useMemo(() => weightedMA(ACTUAL, weights), [w1, w2, w3]);
  const fES = useMemo(() => expSmooth(ACTUAL, alpha, seed), [alpha]);

  // test window: Jul 2025 (idx 18) → Dec 2025 (idx 23)
  const TEST_START = 18, TEST_END = 23;

  const allMethods = {
    "Naïve": fNaive,
    [`MA(${maWindow})`]: fMA,
    "WMA": fWMA,
    [`ES α=${alpha.toFixed(2)}`]: fES,
  };
  const metricRows = Object.entries(allMethods).map(([name, series]) => ({
    name, ...metrics(series, ACTUAL, TEST_START, TEST_END),
  })).filter((r) => r.MAE != null);

  const bestByMAPE = [...metricRows].sort((a, b) => a.MAPE - b.MAPE)[0];

  return (
    <div style={{ background: C.paper, minHeight: "100vh", fontFamily: "'Spectral', Georgia, serif", color: C.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        input[type=range]::-webkit-slider-thumb { cursor: pointer; }
        .grain::before { content:''; position:fixed; inset:0; pointer-events:none; opacity:.025; z-index:0;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
        @keyframes rise { from { opacity:0; transform:translateY(12px);} to {opacity:1; transform:none;} }
      `}</style>
      <div className="grain" />

      {/* HEADER */}
      <header style={{ borderBottom: `2px solid ${C.ink}`, background: C.panel, position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 28px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2.5, color: C.gold, textTransform: "uppercase" }}>RDM 2301 · Revenue & Pricing Management</div>
              <h1 style={{ margin: "4px 0 2px", fontSize: 34, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1 }}>
                Forecast<span style={{ color: C.gold }}>Lab</span>
              </h1>
              <div style={{ fontSize: 14, color: C.muted, fontStyle: "italic" }}>Demand forecasting playground — Jumeirah Beach Hotel Dubai · 599 rooms</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: C.muted, fontFamily: "'DM Mono', monospace" }}>
              <div>Dr. Mahala Geronasso</div>
              <div>ADHA — Les Roches</div>
            </div>
          </div>
        </div>
      </header>

      {/* TABS */}
      <nav style={{ background: C.panel, borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "10px 28px", display: "flex", gap: 6, overflowX: "auto" }}>
          <Tab num="0" active={tab === 0} onClick={() => setTab(0)}>The Data</Tab>
          <Tab num="1" active={tab === 1} onClick={() => setTab(1)}>Naïve</Tab>
          <Tab num="2" active={tab === 2} onClick={() => setTab(2)}>Moving Avg</Tab>
          <Tab num="3" active={tab === 3} onClick={() => setTab(3)}>Weighted MA</Tab>
          <Tab num="4" active={tab === 4} onClick={() => setTab(4)}>Exp. Smoothing</Tab>
          <Tab num="5" active={tab === 5} onClick={() => setTab(5)}>Accuracy</Tab>
          <div style={{ width: 1, background: C.line, margin: "2px 4px" }} />
          <Tab num="✎" active={tab === 6} onClick={() => setTab(6)}>Assignment</Tab>
          <Tab num="★" active={tab === 7} onClick={() => setTab(7)}>Instructor</Tab>
        </div>
      </nav>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 28px 60px", position: "relative", zIndex: 1 }}>
        {tab === 0 && <DataTab />}
        {tab === 1 && <MethodTab
          title="Naïve Method" badge="Method 1"
          formula="Fₜ = Aₜ₋₁"
          desc="The simplest forecast: tomorrow equals today. Next period's forecast is set equal to the most recent actual value. Fast and free of assumptions — but blind to trend and seasonality."
          series={fNaive} color={C.rust}
          insight="Notice how the Naïve line is just the actual line shifted one month to the right. In a seasonal hotel like Jumeirah, that means every turning point is forecast one month too late."
        />}
        {tab === 2 && <div>
          <Controls>
            <Slider label="Window size (n)" value={maWindow} min={2} max={6} step={1} onChange={setMaWindow} fmt={(v) => `${v} months`}
              hint="Smaller n = more responsive. Larger n = smoother but laggier." />
          </Controls>
          <MethodTab
            title="Moving Average" badge="Method 2"
            formula={`MA(${maWindow}) = (Aₜ₋₁ + … + Aₜ₋${maWindow}) / ${maWindow}`}
            desc={`Averages the last ${maWindow} actual months to forecast the next. Drag the slider and watch the forecast line tighten or loosen against the actuals.`}
            series={fMA} color={C.teal}
            insight={`With n=${maWindow}, the forecast lags the seasonal swing. Try n=2 vs n=6 and watch how a larger window flattens the December peaks.`}
          />
        </div>}
        {tab === 3 && <div>
          <Controls>
            <Slider label="w₁ — most recent month" value={w1} min={0} max={1} step={0.05} onChange={setW1} fmt={(v) => v.toFixed(2)} />
            <Slider label="w₂ — second month" value={w2} min={0} max={1} step={0.05} onChange={setW2} fmt={(v) => v.toFixed(2)} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0", borderTop: `1px dashed ${C.line}` }}>
              <span style={{ fontWeight: 600 }}>w₃ — third month <span style={{ color: C.muted, fontWeight: 400 }}>(auto)</span></span>
              <span style={{ fontFamily: "'DM Mono', monospace", color: C.goldDk }}>{w3.toFixed(2)}</span>
            </div>
            <div style={{ marginTop: 8, padding: "8px 11px", borderRadius: 7, fontSize: 12.5, fontFamily: "'DM Mono', monospace",
              background: Math.abs(wSum - 1) < 0.001 ? "#e7f0e3" : "#f6e3dc", color: Math.abs(wSum - 1) < 0.001 ? C.green : C.rust }}>
              Σw = {wSum.toFixed(2)} {Math.abs(wSum - 1) < 0.001 ? "✓ valid" : "✗ must equal 1.00"}
              {w1 < w2 || w2 < w3 ? "  ·  ⚠ recency rule w₁>w₂>w₃ broken" : ""}
            </div>
          </Controls>
          <MethodTab
            title="Weighted Moving Average" badge="Method 3"
            formula="WMA = w₁Aₜ₋₁ + w₂Aₜ₋₂ + w₃Aₜ₋₃"
            desc="You decide how much each recent month matters. The most recent month should usually carry the highest weight — but you justify the trade-off."
            series={fWMA} color={C.gold}
            insight="Push w₁ toward 0.7 and the forecast hugs the latest month — great in fast-moving demand, risky near a seasonal turn. The art of revenue management is choosing the weight, not memorising it."
          />
        </div>}
        {tab === 4 && <div>
          <Controls>
            <Slider label="Smoothing constant α (alpha)" value={alpha} min={0.05} max={0.95} step={0.05} onChange={setAlpha} fmt={(v) => v.toFixed(2)}
              hint="α→0 heavily smoothed & sluggish · α→1 reacts almost like the Naïve method." />
            <div style={{ fontSize: 12.5, color: C.muted, fontFamily: "'DM Mono', monospace", paddingTop: 4 }}>
              Seed F₁ = avg(Jan–Mar 2024) = {(seed * 100).toFixed(1)}%
            </div>
          </Controls>
          <MethodTab
            title="Exponential Smoothing" badge="Method 4"
            formula="Fₜ = α·Aₜ₋₁ + (1−α)·Fₜ₋₁"
            desc="Every past month contributes, but its influence decays geometrically. α is the single dial that sets how fast the past is forgotten."
            series={fES} color={C.goldDk}
            insight={`At α=${alpha.toFixed(2)}, roughly ${(alpha * 100).toFixed(0)}% of the new forecast comes from last month's actual and the rest from forecast memory. Slide α up and watch the curve grow nervous.`}
          />
        </div>}
        {tab === 5 && <AccuracyTab metricRows={metricRows} best={bestByMAPE} allMethods={allMethods}
          testStart={TEST_START} testEnd={TEST_END} />}
        {tab === 6 && <AssignmentTab />}
        {tab === 7 && <InstructorTab />}
      </main>

      <footer style={{ borderTop: `1px solid ${C.line}`, padding: "18px 28px", textAlign: "center", fontSize: 11.5, color: C.muted, fontFamily: "'DM Mono', monospace", position: "relative", zIndex: 1 }}>
        Built for teaching · all forecasts recompute live in your browser · no data leaves this page
      </footer>
    </div>
  );
}

// ── Controls wrapper ─────────────────────────────────────────────────────────
function Controls({ children }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.gold}`, borderRadius: 12, padding: "18px 22px", marginBottom: 20, animation: "rise .4s ease both" }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, letterSpacing: 2, color: C.gold, textTransform: "uppercase", marginBottom: 14 }}>◆ Your controls — drag to explore</div>
      {children}
    </div>
  );
}

// ── Reusable method view ─────────────────────────────────────────────────────
function MethodTab({ title, badge, formula, desc, series, color, insight }) {
  const chartData = RAW.map((d, t) => ({
    label: d.label, Actual: +(d.occ * 100).toFixed(1),
    Forecast: series[t] == null ? null : +(series[t] * 100).toFixed(1),
    season: SEASON(d.m),
  }));
  return (
    <div style={{ animation: "rise .4s ease both" }}>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 340px" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2, color, textTransform: "uppercase" }}>{badge}</div>
          <h2 style={{ fontSize: 27, fontWeight: 800, margin: "3px 0 10px", letterSpacing: -0.4 }}>{title}</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#4a463d", margin: "0 0 14px", maxWidth: 560 }}>{desc}</p>
          <div style={{ display: "inline-block", background: C.ink, color: C.paper, padding: "10px 18px", borderRadius: 9, fontFamily: "'DM Mono', monospace", fontSize: 16, letterSpacing: 0.5 }}>{formula}</div>
        </div>
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "20px 16px 12px", marginTop: 22 }}>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: C.muted, fontFamily: "DM Mono" }} interval={1} />
            <YAxis domain={[45, 95]} tick={{ fontSize: 11, fill: C.muted, fontFamily: "DM Mono" }} unit="%" />
            <Tooltip contentStyle={{ background: C.ink, border: "none", borderRadius: 9, color: C.paper, fontFamily: "DM Mono", fontSize: 12 }}
              labelStyle={{ color: C.gold }} formatter={(v) => (v == null ? "—" : v + "%")} />
            <Legend wrapperStyle={{ fontSize: 12.5, fontFamily: "Spectral" }} />
            <Line type="monotone" dataKey="Actual" stroke={C.ink} strokeWidth={2.4} dot={{ r: 2.5, fill: C.ink }} connectNulls />
            <Line type="monotone" dataKey="Forecast" stroke={color} strokeWidth={2.6} strokeDasharray="6 4" dot={{ r: 3, fill: color }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 14, alignItems: "flex-start", background: "#f0e7d2", border: `1px solid ${C.line}`, borderRadius: 11, padding: "15px 18px" }}>
        <span style={{ fontSize: 20 }}>💡</span>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#5a513c", fontStyle: "italic" }}>{insight}</p>
      </div>
    </div>
  );
}

// ── Data tab ─────────────────────────────────────────────────────────────────
function DataTab() {
  const chartData = RAW.map((d) => ({ label: d.label, occ: +(d.occ * 100).toFixed(1), season: SEASON(d.m), revpar: Math.round(d.revpar) }));
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const y24 = RAW.filter((d) => d.y === 2024), y25 = RAW.filter((d) => d.y === 2025);
  const stat = [
    { k: "Avg occupancy 2024", v: pct(avg(y24.map((d) => d.occ))) },
    { k: "Avg occupancy 2025", v: pct(avg(y25.map((d) => d.occ))) },
    { k: "Peak month", v: "Dec 2025 · 87.1%" },
    { k: "Trough month", v: "Jul 2024 · 54.6%" },
  ];
  return (
    <div style={{ animation: "rise .4s ease both" }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2, color: C.gold, textTransform: "uppercase" }}>The Raw Material</div>
      <h2 style={{ fontSize: 27, fontWeight: 800, margin: "3px 0 8px", letterSpacing: -0.4 }}>24 Months of Demand</h2>
      <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#4a463d", maxWidth: 620, margin: "0 0 18px" }}>
        Two full years of monthly occupancy. Before forecasting anything, read the shape: a deep summer trough, a winter peak, and a small year-over-year lift. Every method ahead is just a different bet on which part of this pattern repeats.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 22 }}>
        {stat.map((s) => (
          <div key={s.k} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 11, padding: "14px 16px" }}>
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 5 }}>{s.k}</div>
            <div style={{ fontSize: 19, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: C.goldDk }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "20px 16px 12px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, paddingLeft: 8 }}>Monthly occupancy — coloured by season</div>
        <ResponsiveContainer width="100%" height={330}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted, fontFamily: "DM Mono" }} interval={1} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted, fontFamily: "DM Mono" }} unit="%" />
            <Tooltip contentStyle={{ background: C.ink, border: "none", borderRadius: 9, color: C.paper, fontFamily: "DM Mono", fontSize: 12 }}
              labelStyle={{ color: C.gold }} formatter={(v, n, p) => [`${v}%  ·  ${p.payload.season} season`, "Occupancy"]} />
            <Bar dataKey="occ" radius={[3, 3, 0, 0]}>
              {chartData.map((d, i) => <Cell key={i} fill={SEASON_COLOR[d.season]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 18, justifyContent: "center", paddingTop: 6, fontSize: 12, color: C.muted }}>
          {Object.entries(SEASON_COLOR).map(([k, v]) => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 11, height: 11, background: v, borderRadius: 3, display: "inline-block" }} />{k} season
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Accuracy tab ─────────────────────────────────────────────────────────────
function AccuracyTab({ metricRows, best, allMethods, testStart, testEnd }) {
  const fmtN = (x) => (x == null ? "—" : x.toFixed(4));
  const cols = ["ME", "MAE", "MAPE", "MSE", "RMSE"];
  const colHint = {
    ME: "Bias — closest to 0 wins", MAE: "Avg error size", MAPE: "% error — lower better",
    MSE: "Penalises big misses", RMSE: "Big-error penalty, % units",
  };
  // overlay chart on test window
  const overlay = RAW.slice(testStart, testEnd + 1).map((d, i) => {
    const t = testStart + i;
    const row = { label: d.label, Actual: +(d.occ * 100).toFixed(1) };
    Object.entries(allMethods).forEach(([name, s]) => { row[name] = s[t] == null ? null : +(s[t] * 100).toFixed(1); });
    return row;
  });
  const palette = [C.rust, C.teal, C.gold, C.goldDk];
  const names = Object.keys(allMethods);

  return (
    <div style={{ animation: "rise .4s ease both" }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2, color: C.gold, textTransform: "uppercase" }}>The Verdict</div>
      <h2 style={{ fontSize: 27, fontWeight: 800, margin: "3px 0 8px", letterSpacing: -0.4 }}>Which Method Wins?</h2>
      <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#4a463d", maxWidth: 640, margin: "0 0 8px" }}>
        We back-test on the holdout window <strong>Jul–Dec 2025</strong>: each method forecasts months it never "saw", and we score the misses. Change any control on the method tabs and these numbers move instantly.
      </p>

      {best && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: C.ink, color: C.paper, padding: "10px 18px", borderRadius: 10, margin: "8px 0 20px" }}>
          <span style={{ fontSize: 18 }}>🏆</span>
          <span style={{ fontSize: 14 }}>Lowest MAPE right now: <strong style={{ color: C.gold }}>{best.name}</strong> at <span style={{ fontFamily: "DM Mono" }}>{best.MAPE.toFixed(2)}%</span></span>
        </div>
      )}

      {/* metric table */}
      <div style={{ overflowX: "auto", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 560 }}>
          <thead>
            <tr style={{ background: C.ink, color: C.paper }}>
              <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600 }}>Method</th>
              {cols.map((c) => (
                <th key={c} style={{ padding: "12px 14px", textAlign: "right", fontWeight: 600 }}>
                  {c}<div style={{ fontSize: 10, fontWeight: 400, color: "#c9c0a8", fontFamily: "DM Mono" }}>{colHint[c]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((r, i) => {
              const isBest = best && r.name === best.name;
              return (
                <tr key={r.name} style={{ background: isBest ? "#f0e7d2" : i % 2 ? "#faf6ec" : "transparent", borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: "11px 16px", fontWeight: 700, color: isBest ? C.goldDk : C.ink }}>
                    {isBest && "★ "}{r.name}
                  </td>
                  {cols.map((c) => (
                    <td key={c} style={{ padding: "11px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontSize: 12.5 }}>
                      {c === "MAPE" ? r[c].toFixed(2) + "%" : fmtN(r[c])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* overlay chart */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "20px 16px 12px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, paddingLeft: 8 }}>All methods vs actual — holdout window (Jul–Dec 2025)</div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={overlay} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={C.line} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted, fontFamily: "DM Mono" }} />
            <YAxis domain={[50, 95]} tick={{ fontSize: 11, fill: C.muted, fontFamily: "DM Mono" }} unit="%" />
            <Tooltip contentStyle={{ background: C.ink, border: "none", borderRadius: 9, color: C.paper, fontFamily: "DM Mono", fontSize: 12 }}
              labelStyle={{ color: C.gold }} formatter={(v) => (v == null ? "—" : v + "%")} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Spectral" }} />
            <Line type="monotone" dataKey="Actual" stroke={C.ink} strokeWidth={3} dot={{ r: 3.5, fill: C.ink }} connectNulls />
            {names.map((n, i) => (
              <Line key={n} type="monotone" dataKey={n} stroke={palette[i % palette.length]} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 14, alignItems: "flex-start", background: "#f0e7d2", border: `1px solid ${C.line}`, borderRadius: 11, padding: "15px 18px" }}>
        <span style={{ fontSize: 20 }}>🎓</span>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#5a513c", fontStyle: "italic" }}>
          Teaching cue: a low MAPE alone never settles it. Check whether RMSE sits far above MAE (a sign of occasional large misses), and whether ME reveals a method that systematically over- or under-forecasts. The "best" method is the one whose errors you can live with in a real pricing decision.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENT TAB — student fills answers, generates a submission code
// ─────────────────────────────────────────────────────────────────────────────
function AssignmentTab() {
  const [name, setName] = useState("");
  const [sid, setSid] = useState("");
  const [answers, setAnswers] = useState({});
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const set = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));
  const answeredCount = QUESTIONS.filter((q) => answers[q.id] != null && answers[q.id] !== "").length;
  const canGenerate = name.trim() && sid.trim() && answeredCount > 0;

  const generate = () => {
    const payload = {
      v: 1, name: name.trim(), sid: sid.trim(),
      ts: new Date().toISOString(), answers,
    };
    setCode(encodeSubmission(payload));
    setCopied(false);
    setTimeout(() => document.getElementById("subcode")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const sections = [...new Set(QUESTIONS.map((q) => q.section))];
  return (
    <div style={{ animation: "rise .4s ease both", maxWidth: 760 }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2, color: C.gold, textTransform: "uppercase" }}>Graded Assignment</div>
      <h2 style={{ fontSize: 27, fontWeight: 800, margin: "3px 0 8px", letterSpacing: -0.4 }}>Forecasting Report — Submission</h2>
      <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#4a463d", margin: "0 0 18px" }}>
        Use the method tabs to explore, then answer below. When you finish, click <strong>Generate submission code</strong>, copy the code, and paste it into the Moodle assignment. Worth {TOTAL_POINTS} points.
      </p>

      {/* identity */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <label style={{ flex: "1 1 220px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Full name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aïsha Al Mansoori"
            style={inp} />
        </label>
        <label style={{ flex: "1 1 220px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Student ID</div>
          <input value={sid} onChange={(e) => setSid(e.target.value)} placeholder="e.g. LR-2026-0481" style={inp} />
        </label>
      </div>

      {sections.map((sec) => {
        const qs = QUESTIONS.filter((q) => q.section === sec);
        const crit = CRITERIA[sec - 1];
        return (
          <div key={sec} style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: `2px solid ${C.ink}`, paddingBottom: 6, marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{sec}. {crit.name}</h3>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: C.gold }}>{crit.pts} pts</span>
            </div>
            {qs.map((q) => (
              <div key={q.id} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: C.muted, flexShrink: 0 }}>{q.id.toUpperCase()}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.5 }}>{q.prompt}
                    <span style={{ color: C.muted, fontSize: 12 }}> ({q.pts} pts)</span>
                  </span>
                </div>
                <div style={{ paddingLeft: 30 }}>
                  {q.type === "text" && (
                    <textarea value={answers[q.id] || ""} onChange={(e) => set(q.id, e.target.value)} rows={q.rows || 4}
                      placeholder="Your answer…" style={{ ...inp, resize: "vertical", fontFamily: "'Spectral', serif" }} />
                  )}
                  {q.type === "num" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input value={answers[q.id] || ""} onChange={(e) => set(q.id, e.target.value)} placeholder="number"
                        inputMode="decimal" style={{ ...inp, maxWidth: 160, fontFamily: "'DM Mono', monospace" }} />
                      <span style={{ color: C.muted, fontSize: 13 }}>{q.unit}</span>
                    </div>
                  )}
                  {q.type === "mc" && (
                    <div style={{ display: "grid", gap: 7 }}>
                      {q.options.map((opt) => (
                        <label key={opt} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, cursor: "pointer",
                          background: answers[q.id] === opt ? "#f0e7d2" : C.panel, border: `1px solid ${answers[q.id] === opt ? C.gold : C.line}`,
                          borderRadius: 8, padding: "9px 13px" }}>
                          <input type="radio" name={q.id} checked={answers[q.id] === opt} onChange={() => set(q.id, opt)} style={{ accentColor: C.gold }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* generate */}
      <div style={{ position: "sticky", bottom: 0, background: C.paper, paddingTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
          <button onClick={generate} disabled={!canGenerate} style={{
            background: canGenerate ? C.ink : "#cfc7b4", color: C.paper, border: "none", borderRadius: 10,
            padding: "13px 24px", fontSize: 14.5, fontWeight: 700, fontFamily: "'Spectral', serif",
            cursor: canGenerate ? "pointer" : "not-allowed", letterSpacing: 0.3,
          }}>Generate submission code →</button>
          <span style={{ fontSize: 13, color: C.muted }}>{answeredCount} / {QUESTIONS.length} answered</span>
        </div>
        {!canGenerate && <div style={{ fontSize: 12, color: C.rust, marginTop: 8 }}>Enter your name, ID, and at least one answer to generate a code.</div>}
      </div>

      {code && (
        <div id="subcode" style={{ marginTop: 22, background: C.panel, border: `2px solid ${C.gold}`, borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 1.5, color: C.gold, textTransform: "uppercase" }}>✓ Your submission code — copy & paste into Moodle</div>
            <button onClick={copy} style={{ background: copied ? C.green : C.ink, color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12.5, cursor: "pointer", fontWeight: 600 }}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <textarea readOnly value={code} rows={5} onFocus={(e) => e.target.select()}
            style={{ ...inp, fontFamily: "'DM Mono', monospace", fontSize: 12, wordBreak: "break-all", background: "#fdfbf5" }} />
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8, fontStyle: "italic" }}>
            Tip: re-generating after editing answers creates a new code. Submit only your final one.
          </div>
        </div>
      )}
    </div>
  );
}
const inp = {
  width: "100%", padding: "10px 13px", border: `1px solid ${C.line}`, borderRadius: 8,
  fontSize: 14, background: C.panel, color: C.ink, outline: "none", fontFamily: "'Spectral', serif",
};

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCTOR TAB — password gate, decode codes, auto-grade, manual scoring
// ─────────────────────────────────────────────────────────────────────────────
function InstructorTab() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [raw, setRaw] = useState("");
  const [decoded, setDecoded] = useState(null);
  const [manual, setManual] = useState({}); // qid -> points awarded
  const [roster, setRoster] = useState([]); // saved graded submissions

  if (!authed) {
    return (
      <div style={{ animation: "rise .4s ease both", maxWidth: 420, margin: "40px auto", textAlign: "center" }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>🔒</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>Instructor Access</h2>
        <p style={{ fontSize: 13.5, color: C.muted, margin: "0 0 18px" }}>This area decodes and grades student submissions. Students should not open it.</p>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password"
          onKeyDown={(e) => e.key === "Enter" && pw === INSTRUCTOR_PASSWORD && setAuthed(true)}
          style={{ ...inp, textAlign: "center", marginBottom: 12 }} />
        <button onClick={() => pw === INSTRUCTOR_PASSWORD ? setAuthed(true) : alert("Wrong password")}
          style={{ width: "100%", background: C.ink, color: C.paper, border: "none", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Spectral', serif" }}>
          Unlock
        </button>
      </div>
    );
  }

  const decode = () => {
    const r = decodeSubmission(raw);
    if (!r.ok) { setDecoded({ error: r.err }); return; }
    setDecoded(r); setManual({});
  };

  const grades = decoded?.data ? QUESTIONS.map((q) => {
    const g = autoGrade(q, decoded.data.answers?.[q.id]);
    return { q, g };
  }) : [];
  const autoTotal = grades.filter((x) => x.g.auto).reduce((s, x) => s + x.g.earned, 0);
  const manualTotal = grades.filter((x) => !x.g.auto).reduce((s, x) => s + (manual[x.q.id] ?? 0), 0);
  const grandTotal = autoTotal + manualTotal;
  const manualMax = grades.filter((x) => !x.g.auto).reduce((s, x) => s + x.g.max, 0);
  const allManualScored = grades.filter((x) => !x.g.auto).every((x) => manual[x.q.id] != null);

  const critScore = CRITERIA.map((c) => {
    const rows = grades.filter((x) => x.q.crit === c.name);
    const earned = rows.reduce((s, x) => s + (x.g.auto ? x.g.earned : (manual[x.q.id] ?? 0)), 0);
    return { ...c, earned };
  });

  const saveToRoster = () => {
    setRoster((r) => [...r.filter((x) => x.sid !== decoded.data.sid), {
      name: decoded.data.name, sid: decoded.data.sid, total: grandTotal,
      complete: allManualScored, ts: decoded.data.ts,
    }]);
  };

  const vColor = (v) => v === "correct" ? C.green : v === "wrong" ? C.rust : C.muted;

  return (
    <div style={{ animation: "rise .4s ease both" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2, color: C.gold, textTransform: "uppercase" }}>Grading Console</div>
          <h2 style={{ fontSize: 27, fontWeight: 800, margin: "3px 0 0", letterSpacing: -0.4 }}>Decode & Grade</h2>
        </div>
        <button onClick={() => setAuthed(false)} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 12px", fontSize: 12, cursor: "pointer", color: C.muted }}>Lock</button>
      </div>

      <div style={{ marginTop: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Paste a student's submission code</div>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={3} placeholder="RDM2301-XXX::..."
          style={{ ...inp, fontFamily: "'DM Mono', monospace", fontSize: 12 }} />
        <button onClick={decode} style={{ marginTop: 10, background: C.ink, color: C.paper, border: "none", borderRadius: 9, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Spectral', serif" }}>
          Decode →
        </button>
      </div>

      {decoded?.error && (
        <div style={{ background: "#f6e3dc", color: C.rust, borderRadius: 10, padding: "13px 16px", fontSize: 13.5 }}>⚠ {decoded.error}</div>
      )}

      {decoded?.data && (
        <div>
          {decoded.tampered && (
            <div style={{ background: "#f6e3dc", color: C.rust, borderRadius: 10, padding: "11px 15px", fontSize: 13, marginBottom: 14 }}>
              ⚠ Checksum mismatch — this code may have been hand-edited. Review carefully.
            </div>
          )}
          {/* student header + score */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
            background: C.ink, color: C.paper, borderRadius: 13, padding: "16px 22px", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700 }}>{decoded.data.name}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#c9c0a8" }}>
                ID {decoded.data.sid} · submitted {new Date(decoded.data.ts).toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: C.gold, lineHeight: 1 }}>{grandTotal}<span style={{ fontSize: 17, color: "#c9c0a8" }}>/{TOTAL_POINTS}</span></div>
              <div style={{ fontSize: 11, color: "#c9c0a8" }}>{allManualScored ? "fully graded" : `${manualMax - grades.filter(x=>!x.g.auto).reduce((s,x)=>s+(manual[x.q.id]!=null?x.g.max:0),0)} manual pts pending`}</div>
            </div>
          </div>

          {/* criterion breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 20 }}>
            {critScore.map((c) => (
              <div key={c.name} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 13px" }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, height: 28 }}>{c.name}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 17, fontWeight: 700, color: C.goldDk }}>{c.earned}<span style={{ fontSize: 12, color: C.muted }}>/{c.pts}</span></div>
              </div>
            ))}
          </div>

          {/* per-question */}
          {grades.map(({ q, g }) => (
            <div key={q.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 11, padding: "14px 16px", marginBottom: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: C.muted, fontWeight: 400 }}>{q.id.toUpperCase()} </span>{q.prompt}
                </span>
                <span style={{ flexShrink: 0, fontFamily: "'DM Mono', monospace", fontSize: 12, color: C.muted }}>{q.pts} pts</span>
              </div>
              <div style={{ background: "#fdfbf5", border: `1px solid ${C.line}`, borderRadius: 7, padding: "9px 12px", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", marginBottom: 9, minHeight: 20 }}>
                {decoded.data.answers?.[q.id] || <span style={{ color: C.muted, fontStyle: "italic" }}>— blank —</span>}
              </div>
              {g.auto ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: vColor(g.verdict) }}>
                    {g.verdict === "correct" ? "✓ Correct" : g.verdict === "wrong" ? "✗ Incorrect" : g.verdict === "blank" ? "○ Blank" : "✗ Invalid"} · {g.earned}/{g.max}
                  </span>
                  {q.type === "num" && g.want != null && (
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: C.muted }}>
                      got {g.got ?? "—"} · accept {g.want}±{g.tol}
                    </span>
                  )}
                  {q.type === "mc" && g.verdict === "wrong" && (
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: C.muted }}>key: {g.want}</span>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, color: C.teal, fontWeight: 600 }}>Manual grade:</span>
                  <input type="range" min={0} max={q.pts} step={1} value={manual[q.id] ?? 0}
                    onChange={(e) => setManual((m) => ({ ...m, [q.id]: parseInt(e.target.value) }))}
                    style={{ accentColor: C.gold, flex: "1 1 140px", maxWidth: 220 }} />
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: manual[q.id] != null ? C.goldDk : C.muted, minWidth: 52 }}>
                    {manual[q.id] ?? "–"}/{q.pts}
                  </span>
                </div>
              )}
            </div>
          ))}

          <div style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={saveToRoster} style={{ background: C.green, color: "#fff", border: "none", borderRadius: 9, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Spectral', serif" }}>
              Save to class roster ↓
            </button>
            <span style={{ fontSize: 12.5, color: C.muted }}>Final score: <strong style={{ color: C.ink, fontFamily: "DM Mono" }}>{grandTotal}/{TOTAL_POINTS}</strong></span>
          </div>
        </div>
      )}

      {/* roster */}
      {roster.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, borderBottom: `2px solid ${C.ink}`, paddingBottom: 6 }}>Class Roster ({roster.length})</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, marginTop: 8, minWidth: 480 }}>
              <thead><tr style={{ background: C.ink, color: C.paper }}>
                <th style={{ textAlign: "left", padding: "10px 14px" }}>Name</th>
                <th style={{ textAlign: "left", padding: "10px 14px" }}>ID</th>
                <th style={{ textAlign: "right", padding: "10px 14px" }}>Score</th>
                <th style={{ textAlign: "center", padding: "10px 14px" }}>Status</th>
              </tr></thead>
              <tbody>
                {roster.map((r, i) => (
                  <tr key={r.sid} style={{ background: i % 2 ? "#faf6ec" : "transparent", borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: "9px 14px", fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "DM Mono", fontSize: 12 }}>{r.sid}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "DM Mono", fontWeight: 700, color: C.goldDk }}>{r.total}/{TOTAL_POINTS}</td>
                    <td style={{ padding: "9px 14px", textAlign: "center", fontSize: 12 }}>{r.complete ? <span style={{ color: C.green }}>✓ final</span> : <span style={{ color: C.rust }}>pending</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8, fontStyle: "italic" }}>
            Roster lives in this browser session only — copy the scores out before closing the tab.
          </div>
        </div>
      )}
    </div>
  );
}
