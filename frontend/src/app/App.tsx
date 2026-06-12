import { useState, useEffect, useRef } from "react";

// ─── tokens / palette (mirrors QVAC CSS vars) ───────────────────────────────
const C = {
  bg: "#0f1115",
  card: "#14161d",
  cardStrong: "#181a22",
  secondary: "#1d1f28",
  muted: "#6e7180",
  mutedFg: "#8b8f9b",
  border: "rgba(255,255,255,0.08)",
  fg: "#e6e8ef",
  primary: "#00e5ff",
  primaryDim: "rgba(0,229,255,0.14)",
  primaryBorder: "rgba(0,229,255,0.34)",
  ring: "rgba(0,229,255,0.45)",
};

const styles: Record<string, React.CSSProperties> = {
  shell: { display: "flex", flexDirection: "column", minHeight: "100vh", background: C.bg, color: C.fg, fontFamily: '"Inter", system-ui, sans-serif', letterSpacing: "0.01em", fontSize: 16, fontWeight: 400, lineHeight: 1.55 },
  topbar: { position: "sticky", top: 0, zIndex: 20, borderBottom: `1px solid ${C.border}`, background: `radial-gradient(1200px 700px at 10% -10%, rgba(0,229,255,0.08) 0%, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.02), transparent 40%), ${C.bg}` },
  topbarInner: { maxWidth: 1200, margin: "0 auto", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 },
  brand: { display: "inline-flex", alignItems: "center", gap: 8, color: C.fg, textDecoration: "none", fontWeight: 600, fontSize: 18, letterSpacing: "0.18px" },
  logotype: { width: 32, height: 32, borderRadius: 12, background: "linear-gradient(#4df0ff, #09b4d0)", display: "inline-grid", placeItems: "center", fontSize: 15, fontWeight: 700, color: C.bg },
  nav: { display: "flex", gap: 4, flexWrap: "wrap" as const },
  navA: { padding: "6px 10px", borderRadius: 12, color: C.mutedFg, border: "1px solid transparent", fontWeight: 500, textDecoration: "none", cursor: "pointer", transition: "all 0.2s", fontSize: 14, background: "none" },
  navAActive: { color: C.fg },
  hero: { padding: "96px 28px 72px", borderBottom: `1px solid ${C.border}`, background: `radial-gradient(1200px 900px at 90% 18%, rgba(0,229,255,0.12) 0%, transparent 55%), radial-gradient(900px 700px at 15% 85%, rgba(14,18,36,0.9) 0%, transparent 45%), linear-gradient(180deg, ${C.bg}, #0b0d12)`, position: "relative", overflow: "hidden" },
  heroInner: { maxWidth: 1200, margin: "0 auto", position: "relative" },
  heroH1: { margin: "0 0 16px", color: C.fg, fontFamily: '"Inter", sans-serif', letterSpacing: "-1.2px", maxWidth: 920, fontSize: "clamp(34px, 5vw, 58px)", fontWeight: 600, lineHeight: 1.05 },
  lead: { margin: "0 0 48px", maxWidth: 820, color: C.mutedFg, fontSize: 18, lineHeight: 1.55 },
  heroActions: { display: "flex", gap: 14, flexWrap: "wrap" as const },
  btnPrimary: { display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 8, borderRadius: 12, fontWeight: 600, fontFamily: '"Inter", sans-serif', color: "#001015", background: "linear-gradient(#2bffd8, #00bcd4)", border: "1px solid rgba(0,229,255,0.4)", cursor: "pointer", padding: "10px 20px", textDecoration: "none", transition: "all 0.2s", boxShadow: "0 18px 44px rgba(0,229,255,0.18)", fontSize: 15 },
  btn: { display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 8, borderRadius: 12, fontWeight: 500, fontFamily: '"Inter", sans-serif', color: C.fg, background: C.secondary, border: `1px solid ${C.border}`, cursor: "pointer", padding: "10px 20px", textDecoration: "none", transition: "all 0.2s", fontSize: 15 },
  glowOrb: { position: "absolute", top: -320, right: -220, width: 720, height: 720, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(0,229,255,0.14), transparent 70%)", pointerEvents: "none", animation: "drift 7s ease-in-out infinite alternate" },
  section: { padding: "72px 28px", borderTop: `1px solid ${C.border}` },
  sectionInner: { maxWidth: 1200, margin: "0 auto" },
  sectionH2: { margin: "0 0 18px", color: C.fg, fontFamily: '"Inter", sans-serif', letterSpacing: "-0.3px", fontSize: "clamp(22px, 2.8vw, 28px)", fontWeight: 500 },
  sectionP: { color: C.mutedFg, maxWidth: 760, margin: 0, lineHeight: 1.65 },
  subhead: { margin: "0 0 22px", color: C.mutedFg, maxWidth: 720, lineHeight: 1.6 },
  stepsGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14, marginTop: 36, padding: 0, listStyle: "none" },
  stepCard: { padding: 22, borderRadius: 18, background: C.card, border: `1px solid ${C.border}`, color: C.mutedFg, transition: "all 0.3s", position: "relative" as const },
  stepNum: { display: "inline-flex", fontFamily: '"JetBrains Mono", monospace', padding: "6px 10px", borderRadius: 999, background: C.primaryDim, color: C.primary, marginBottom: 14, fontSize: 12, fontWeight: 500 },
  stepTitle: { color: C.fg, fontWeight: 500, marginBottom: 6, display: "block", fontSize: 15 },
  grid4: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14, marginTop: 36, padding: 0, listStyle: "none" },
  gridCard: { padding: 22, borderRadius: 18, background: C.card, border: `1px solid ${C.border}`, color: C.mutedFg },
  gridTitle: { color: C.fg, fontWeight: 500, marginBottom: 8, display: "block", fontSize: 15 },
  panel: { padding: 22, borderRadius: 18, background: C.card, border: `1px solid ${C.border}` },
  footer: { padding: "28px 28px", borderTop: `1px solid ${C.border}`, background: `radial-gradient(1600px 400px at 20% 100%, rgba(0,229,255,0.08), transparent 55%), ${C.bg}`, marginTop: "auto" },
  footerInner: { maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 24 },
  footerCopy: { color: C.muted, fontSize: 13 },
  footerNav: { display: "flex", gap: 18, flexWrap: "wrap" as const },
  footerNavA: { color: C.muted, textDecoration: "none", fontSize: 14, transition: "color 0.2s", cursor: "pointer" },
  mono: { fontFamily: '"JetBrains Mono", monospace' },
  snippet: { padding: 18, border: `1px solid ${C.border}`, fontFamily: '"JetBrains Mono", monospace', color: C.mutedFg, background: "#0b0d10", borderRadius: 14, margin: 0, fontSize: 13, lineHeight: 1.7, overflow: "auto" as const },
  metricGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14, marginTop: 18, padding: 0, listStyle: "none" },
  metricValue: { display: "block", fontFamily: '"JetBrains Mono", monospace', color: C.fg, fontSize: 20, fontWeight: 500 },
  metricLabel: { color: C.muted, marginTop: 6, fontSize: 12, fontWeight: 500 },
  statusDot: { display: "inline-block", width: 10, height: 10, borderRadius: 999, marginRight: 8, verticalAlign: "middle" },
  progress: { marginTop: 18, borderRadius: 999, background: C.secondary, height: 6, overflow: "hidden" },
  roleToggle: { display: "inline-flex", gap: 8, padding: 4, borderRadius: 14, background: C.card, border: `1px solid ${C.border}`, marginBottom: 22 },
  roleBtn: { padding: "8px 14px", borderRadius: 12, color: C.mutedFg, cursor: "pointer", background: "none", border: "1px solid transparent", fontWeight: 500, transition: "all 0.2s", fontSize: 14 },
  roleBtnActive: { background: C.primaryDim, borderColor: C.primaryBorder, color: C.fg, boxShadow: "0 0 22px rgba(0,229,255,0.18)" },
  planOptions: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14, marginTop: 22 },
  planCard: { display: "flex", flexDirection: "column" as const, gap: 8, padding: 18, borderRadius: 18, background: C.card, border: `1px solid ${C.border}`, cursor: "pointer", color: C.mutedFg, transition: "all 0.2s" },
  planCardActive: { borderColor: C.primaryBorder, background: "linear-gradient(160deg,#0a1a1f,#112021)", boxShadow: "0 18px 42px rgba(0,229,255,0.14)" },
  rewardsCard: { padding: 22, borderRadius: 18, background: C.card, border: `1px solid ${C.border}`, boxShadow: "0 0 0 1px rgba(0,229,255,0.08), 0 18px 40px rgba(0,229,255,0.12)" },
  consoleGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 18, marginTop: 28 },
  consoleCard: { padding: 22, borderRadius: 18, background: C.card, border: `1px solid ${C.border}`, transition: "all 0.2s" },
  chip: { display: "inline-flex", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: "#001015", background: "linear-gradient(#2bffd8,#00bcd4)" },
  chipSecondary: { display: "inline-flex", padding: "4px 10px", borderRadius: 999, fontSize: 12, background: C.secondary, color: C.mutedFg, border: `1px solid ${C.border}` },
  hint: { color: C.muted, fontSize: 13 },
  modeToggle: { display: "inline-flex", gap: 8, borderRadius: 12, background: C.secondary, border: `1px solid ${C.border}`, padding: 4 },
  modeBtn: { padding: "6px 12px", borderRadius: 12, color: C.mutedFg, cursor: "pointer", background: "none", border: "1px solid transparent", fontSize: 13, transition: "all 0.2s" },
  modeBtnActive: { background: C.primaryDim, borderColor: C.primaryBorder, color: C.fg },
};

function useHover() {
  const [hovered, setHovered] = useState(false);
  return { hovered, onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) };
}

function NavLink({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  const h = useHover();
  return (
    <button
      onClick={onClick}
      style={{ ...styles.navA, ...(active ? styles.navAActive : {}), ...(h.hovered ? { background: C.primaryDim, borderColor: C.primaryBorder, color: C.fg } : {}) }}
      onMouseEnter={h.onMouseEnter}
      onMouseLeave={h.onMouseLeave}
    >
      {children}
    </button>
  );
}

function Btn({ children, primary, onClick }: { children: React.ReactNode; primary?: boolean; onClick?: () => void }) {
  const h = useHover();
  const base = primary ? styles.btnPrimary : styles.btn;
  const hoverStyle = primary
    ? { background: "linear-gradient(#4bffe6, #1fd5e0)", borderColor: "rgba(0,229,255,0.8)" }
    : { borderColor: C.primaryBorder, background: C.primaryDim, transform: "translateY(-1px)" };
  return (
    <button onClick={onClick} style={{ ...base, ...(h.hovered ? hoverStyle : {}) }} onMouseEnter={h.onMouseEnter} onMouseLeave={h.onMouseLeave}>
      {children}
    </button>
  );
}

function StepCard({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  const h = useHover();
  return (
    <li style={{ ...styles.stepCard, ...(h.hovered ? { borderColor: C.primaryBorder, background: C.cardStrong, boxShadow: "0 18px 40px rgba(0,229,255,0.12)" } : {}) }} onMouseEnter={h.onMouseEnter} onMouseLeave={h.onMouseLeave}>
      <span style={styles.stepNum}>{num}</span>
      <span style={styles.stepTitle}>{title}</span>
      <span style={{ fontSize: 14 }}>{children}</span>
    </li>
  );
}

function GridCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li style={styles.gridCard}>
      <span style={styles.gridTitle}>{title}</span>
      <span style={{ fontSize: 14 }}>{children}</span>
    </li>
  );
}

// ─── Embed Configurator ──────────────────────────────────────────────────────
function EmbedConfigurator() {
  const [mode, setMode] = useState<"script" | "module">("script");
  const snippet = mode === "script"
    ? `<script\n  src="https://cdn.qhc.templeearth.cc/embed.js"\n  data-contributions="enabled">\n</script>`
    : `import { QVACEmbed } from "@qvac/embed"`;
  return (
    <div style={{ marginTop: 22 }}>
      <div style={styles.modeToggle}>
        {(["script", "module"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} style={{ ...styles.modeBtn, ...(mode === m ? styles.modeBtnActive : {}) }}>
            {m === "script" ? "Script tag" : "ES module"}
          </button>
        ))}
      </div>
      <pre style={styles.snippet}><code>{snippet}</code></pre>
      <p style={{ ...styles.hint, marginTop: 10 }}>Replace your inference app's script tag or component root with the snippet above.</p>
    </div>
  );
}

// ─── Publisher Setup ─────────────────────────────────────────────────────────
const PLANS = [
  { id: "starter", label: "Starter", sessions: "500 / mo", compute: "10 K CU", rewards: "2%" },
  { id: "growth", label: "Growth", sessions: "5 K / mo", compute: "100 K CU", rewards: "5%" },
  { id: "scale", label: "Scale", sessions: "Unlimited", compute: "Unlimited", rewards: "8%" },
];

function PublisherSetup() {
  const [plan, setPlan] = useState("growth");
  const [step, setStep] = useState(0);
  const steps = ["Embed snippet", "Configure plan", "View metrics"];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "22px 0 28px" }}>
        {steps.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} style={{ padding: "6px 14px", borderRadius: 999, fontWeight: 500, cursor: "pointer", fontSize: 14, border: `1px solid ${i === step ? C.primaryBorder : C.border}`, background: i === step ? C.primaryDim : C.secondary, color: i === step ? C.fg : C.mutedFg, transition: "all 0.2s" }}>
            {s}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div style={styles.panel}>
          <p style={{ ...styles.sectionP, marginBottom: 14 }}>Load the QVAC widget inside your inference interface.</p>
          <EmbedConfigurator />
        </div>
      )}

      {step === 1 && (
        <div style={styles.panel}>
          <p style={{ ...styles.sectionP, marginBottom: 18 }}>Select permission handling, contribution limits, and reward share. These controls are exposed to contributors during opt-in.</p>
          <div style={styles.planOptions}>
            {PLANS.map((p) => (
              <div key={p.id} onClick={() => setPlan(p.id)} style={{ ...styles.planCard, ...(plan === p.id ? styles.planCardActive : {}) }}>
                <span style={{ color: C.fg, fontWeight: 500, fontSize: 15 }}>{p.label}</span>
                <span style={{ fontSize: 13 }}>{p.sessions} sessions</span>
                <span style={{ fontSize: 13 }}>{p.compute}</span>
                <span style={{ color: C.primary, fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, marginTop: 4 }}>{p.rewards} reward share</span>
              </div>
            ))}
          </div>
          <ul style={{ margin: "22px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {["Granular per-request consent rules.", "Session-based contribution caps.", "Adjustable split percentages."].map((t) => (
              <li key={t} style={{ fontSize: 14, color: C.mutedFg, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: C.primary, fontWeight: 700, marginTop: 1 }}>·</span>{t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 2 && (
        <div style={styles.rewardsCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <span style={styles.chip}>Publisher</span>
            <span style={styles.chipSecondary}>{PLANS.find((p) => p.id === plan)?.label ?? "Growth"}</span>
          </div>
          <ul style={styles.metricGrid}>
            {[
              { v: "3,847", l: "Plan tier sessions" },
              { v: "184 K", l: "Compute units" },
              { v: "≈ 0.34 Ξ", l: "Estimated rewards" },
            ].map((m) => (
              <li key={m.l} style={{ padding: 18, borderRadius: 14, background: C.secondary, border: `1px solid ${C.border}` }}>
                <span style={styles.metricValue}>{m.v}</span>
                <span style={styles.metricLabel}>{m.l}</span>
              </li>
            ))}
          </ul>
          <p style={{ ...styles.hint, marginTop: 14 }}>Metrics update as contribution progresses.</p>
          <div style={styles.progress}>
            <span style={{ ...styles.progressBar, width: "62%" }} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 22 }}>
        {step > 0 && <Btn onClick={() => setStep((s) => s - 1)}>Back</Btn>}
        {step < steps.length - 1 && <Btn primary onClick={() => setStep((s) => s + 1)}>Continue →</Btn>}
      </div>
    </div>
  );
}

const styles2: { progressBar: React.CSSProperties } = {
  progressBar: { borderRadius: "inherit", background: "linear-gradient(#6cffef, #00bcd4)", minWidth: 20, height: "100%", transition: "width 0.3s", display: "block" },
};
// alias for inline use
const progressBar = styles2.progressBar;

// ─── Contributor View ────────────────────────────────────────────────────────
function ContributorView() {
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(38);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setProgress((p) => Math.min(p + 1, 95)), 300);
    return () => clearInterval(id);
  }, [active]);

  return (
    <div style={styles.panel}>
      <p style={{ ...styles.sectionP, marginBottom: 22 }}>Opt in to contribute local compute when your app queries inference networks.</p>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <span style={{ ...styles.statusDot, background: active ? C.primary : C.muted, boxShadow: active ? `0 0 18px ${C.primary}b3` : "none" }} />
        <span style={{ color: C.mutedFg, fontWeight: 600 }}>{active ? "Contribution active" : "Contribution paused"}</span>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <Btn primary={!active} onClick={() => setActive((a) => !a)}>{active ? "Pause contribution" : "Opt in & contribute"}</Btn>
      </div>
      <div style={styles.progress}>
        <span style={{ ...progressBar, width: `${active ? progress : 38}%` }} />
      </div>
      <p style={{ ...styles.hint, marginTop: 10 }}>Contribution is session-scoped and may be paused at any time.</p>
      <ul style={{ margin: "22px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {["Client-side only contribution state.", "Per-request opt-in consent.", "Session scoped telemetry.", "Explicit pause or revocation."].map((t) => (
          <li key={t} style={{ fontSize: 14, color: C.mutedFg, display: "flex", gap: 10 }}>
            <span style={{ color: C.primary }}>·</span>{t}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Console Section ─────────────────────────────────────────────────────────
function useCountUp(target: number, active: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    const step = Math.ceil(target / 40);
    const id = setInterval(() => setValue((v) => { if (v + step >= target) { clearInterval(id); return target; } return v + step; }), 40);
    return () => clearInterval(id);
  }, [active, target]);
  return value;
}

const consoleJobs = [
  { id: "job-001", origin: "app.decentralai.io", status: "active", units: "4,210 CU", share: "7.3%", progress: 73 },
  { id: "job-002", origin: "inference.zkml.network", status: "active", units: "1,830 CU", share: "3.2%", progress: 32 },
  { id: "job-003", origin: "api.neuralmesh.cc", status: "idle", units: "830 CU", share: "1.4%", progress: 14 },
];

function ConsoleSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  const total = useCountUp(6870, visible);
  const reward = useCountUp(342, visible);

  return (
    <div ref={ref}>
      <ul style={styles.metricGrid}>
        {[
          { v: total.toLocaleString() + " CU", l: "Total compute units" },
          { v: "≈ 0." + reward + " Ξ", l: "Accrued rewards" },
          { v: "3 active", l: "Contributing sessions" },
        ].map((m) => (
          <li key={m.l} style={{ padding: 18, borderRadius: 14, background: C.secondary, border: `1px solid ${C.border}` }}>
            <span style={styles.metricValue}>{m.v}</span>
            <span style={styles.metricLabel}>{m.l}</span>
          </li>
        ))}
      </ul>

      <div style={{ ...styles.consoleGrid, marginTop: 28 }}>
        {consoleJobs.map((job) => (
          <div key={job.id} style={styles.consoleCard}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <span style={{ ...styles.statusDot, background: job.status === "active" ? C.primary : C.muted, boxShadow: job.status === "active" ? `0 0 18px ${C.primary}b3` : "none" }} />
              <span style={{ color: C.mutedFg, fontWeight: 600, fontSize: 13, verticalAlign: "middle" }}>{job.status}</span>
            </div>
            <p style={{ margin: "0 0 4px", color: C.fg, fontWeight: 500, fontSize: 14 }}>{job.origin}</p>
            <p style={{ margin: "0 0 12px", color: C.mutedFg, fontSize: 13, fontFamily: '"JetBrains Mono", monospace' }}>{job.units} · {job.share}</p>
            <div style={styles.progress}>
              <span style={{ ...progressBar, width: `${job.progress}%` }} />
            </div>
          </div>
        ))}
      </div>

      <ul style={{ margin: "28px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {["Per-user contribution share.", "Aggregate by origin domain or session.", "Export CSV summaries for off-chain payouts."].map((t) => (
          <li key={t} style={{ fontSize: 14, color: C.mutedFg, display: "flex", gap: 10 }}>
            <span style={{ color: C.primary }}>·</span>{t}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────
const sections = ["product", "how-it-works", "publisher", "contributor", "console"];

export default function App() {
  const [activeSection, setActiveSection] = useState("product");
  const [role, setRole] = useState<"publisher" | "contributor">("publisher");

  const scrollTo = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const handler = () => {
      for (const id of [...sections].reverse()) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 200) { setActiveSection(id); return; }
      }
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const navLabels: Record<string, string> = { product: "Product", "how-it-works": "How it Works", publisher: "Publishers", contributor: "Earn Idle", console: "Console" };

  return (
    <>
      <style>{`
        @keyframes drift { from { translate: 0 0; } to { translate: -24px 18px; } }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 0; height: 0; }
      `}</style>

      <div style={styles.shell}>
        {/* Topbar */}
        <header style={styles.topbar}>
          <div style={styles.topbarInner}>
            <a href="#" style={styles.brand} onClick={(e) => { e.preventDefault(); scrollTo("product"); }}>
              <span style={styles.logotype}>R</span>
              <span>Rooted</span>
            </a>
            <nav style={styles.nav}>
              {sections.map((id) => (
                <NavLink key={id} active={activeSection === id} onClick={() => scrollTo(id)}>
                  {navLabels[id]}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        {/* Hero */}
        <section style={styles.hero} id="product">
          <div style={styles.glowOrb} />
          <div style={styles.heroInner}>
            <h1 style={styles.heroH1}>Add contribution and rewards to decentralized inference apps.</h1>
            <p style={styles.lead}>Embed opt-in compute contribution and rewards into your AI application.</p>
            <div style={styles.heroActions}>
              <Btn primary onClick={() => scrollTo("publisher")}>Configure embed</Btn>
              <Btn onClick={() => scrollTo("contributor")}>Contribute compute</Btn>
            </div>
          </div>
        </section>

        {/* What's missing */}
        <section style={styles.section}>
          <div style={styles.sectionInner}>
            <h2 style={styles.sectionH2}>The gap</h2>
            <p style={styles.sectionP}>Decentralized AI networks route and execute tasks. What they still lack is a clean, trustworthy way for users to grant explicit permissions over how their compute is used, verify real contribution, and be rewarded directly for it. Rooted sits above that execution path as the missing accountability layer.</p>

            <ul style={styles.grid4}>
              <GridCard title="Trust and control">Client-side only contribution state.</GridCard>
              <GridCard title="Explicit opt-in">Granular consent for approved resources.</GridCard>
              <GridCard title="Session telemetry">Scoped metrics with no persistent tracking.</GridCard>
              <GridCard title="Revocation">Explicit pause or revocation at any time.</GridCard>
            </ul>

            <div style={{ marginTop: 48 }}>
              <h2 style={styles.sectionH2}>Why it matters</h2>
              <p style={styles.sectionP}>Transparent contribution measurement turns local compute into a first-class resource across decentralized networks, improving alignment between developers, contributors, and users.</p>
            </div>
          </div>
        </section>

        {/* How it Works */}
        <section style={styles.section} id="how-it-works">
          <div style={styles.sectionInner}>
            <h2 style={styles.sectionH2}>Getting Started</h2>
            <p style={{ ...styles.subhead }}>Understand the Rooted contribution layer across publishers, contributors, and rewards.</p>

            <ol style={styles.stepsGrid}>
              <StepCard num="01" title="Add embed">Load the widget inside your inference interface.</StepCard>
              <StepCard num="02" title="Invite contributors">User opts in inside a client-side consent flow.</StepCard>
              <StepCard num="03" title="Monitor sessions">View live contribution metrics in the console.</StepCard>
              <StepCard num="04" title="Distribute rewards">Automatic split based on measured share.</StepCard>
            </ol>

            <div style={{ display: "flex", gap: 14, marginTop: 36 }}>
              <Btn primary onClick={() => scrollTo("publisher")}>Go to publisher setup</Btn>
              <Btn onClick={() => scrollTo("console")}>Open contributor console</Btn>
            </div>
          </div>
        </section>

        {/* Publisher Setup */}
        <section style={styles.section} id="publisher">
          <div style={styles.sectionInner}>
            <div style={styles.roleToggle}>
              {(["publisher", "contributor"] as const).map((r) => (
                <button key={r} onClick={() => setRole(r)} style={{ ...styles.roleBtn, ...(role === r ? styles.roleBtnActive : {}) }}>
                  {r === "publisher" ? "Publisher" : "Contributor"}
                </button>
              ))}
            </div>

            {role === "publisher" ? (
              <>
                <h2 style={styles.sectionH2}>Publisher setup</h2>
                <p style={styles.subhead}>Configure how your inference app exposes contribution and rewards.</p>
                <PublisherSetup />
              </>
            ) : (
              <>
                <h2 style={styles.sectionH2} id="contributor">Contribute compute</h2>
                <p style={styles.subhead}>Opt in to contribute local compute when your app queries inference networks.</p>
                <ContributorView />
              </>
            )}
          </div>
        </section>

        {/* Contributor (anchor target) */}
        <div id="contributor" />

        {/* Console */}
        <section style={styles.section} id="console">
          <div style={styles.sectionInner}>
            <h2 style={styles.sectionH2}>Status console</h2>
            <p style={{ ...styles.subhead }}>Real-time contribution jobs and reward attribution.</p>
            <ConsoleSection />
          </div>
        </section>

        {/* Footer */}
        <footer style={styles.footer}>
          <div style={styles.footerInner}>
            <a href="#" style={styles.brand} onClick={(e) => { e.preventDefault(); scrollTo("product"); }}>
              <span style={styles.logotype}>R</span>
              <span>Rooted</span>
            </a>
            <span style={styles.footerCopy}>Rooted — app-embedded contribution, attribution, and rewards above decentralized AI with Fortytwo Network and Cortensor.</span>
            <nav style={styles.footerNav}>
              {["Docs", "Console", "GitHub"].map((l) => (
                <a key={l} href="#" style={styles.footerNavA} onMouseEnter={(e) => (e.currentTarget.style.color = C.primary)} onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}>
                  {l}
                </a>
              ))}
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}
