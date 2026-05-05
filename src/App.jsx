import { useState, useCallback, useRef, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell, PieChart, Pie
} from "recharts";

// ─── CURRENCIES ──────────────────────────────────────────────────────────────
const CURRENCIES = {
  AED:{ code:"AED", name:"UAE Dirham",         flag:"🇦🇪" },
  USD:{ code:"USD", name:"US Dollar",          flag:"🇺🇸" },
  GBP:{ code:"GBP", name:"British Pound",      flag:"🇬🇧" },
  EUR:{ code:"EUR", name:"Euro",               flag:"🇪🇺" },
  AUD:{ code:"AUD", name:"Australian Dollar",  flag:"🇦🇺" },
  SGD:{ code:"SGD", name:"Singapore Dollar",   flag:"🇸🇬" },
  CAD:{ code:"CAD", name:"Canadian Dollar",    flag:"🇨🇦" },
  HKD:{ code:"HKD", name:"Hong Kong Dollar",  flag:"🇭🇰" },
  INR:{ code:"INR", name:"Indian Rupee",       flag:"🇮🇳" },
  JPY:{ code:"JPY", name:"Japanese Yen",       flag:"🇯🇵" },
  SAR:{ code:"SAR", name:"Saudi Riyal",        flag:"🇸🇦" },
  QAR:{ code:"QAR", name:"Qatari Riyal",       flag:"🇶🇦" },
  NZD:{ code:"NZD", name:"New Zealand Dollar", flag:"🇳🇿" },
  ZAR:{ code:"ZAR", name:"South African Rand", flag:"🇿🇦" },
  MYR:{ code:"MYR", name:"Malaysian Ringgit",  flag:"🇲🇾" },
  THB:{ code:"THB", name:"Thai Baht",          flag:"🇹🇭" },
  TRY:{ code:"TRY", name:"Turkish Lira",       flag:"🇹🇷" },
  BRL:{ code:"BRL", name:"Brazilian Real",     flag:"🇧🇷" },
  CHF:{ code:"CHF", name:"Swiss Franc",        flag:"🇨🇭" },
  SEK:{ code:"SEK", name:"Swedish Krona",      flag:"🇸🇪" },
};

const fmtC = (n, code = "USD") => {
  try { return new Intl.NumberFormat("en", { style:"currency", currency:code, maximumFractionDigits:0 }).format(n); }
  catch { return `${code} ${Math.round(n)}`; }
};
const pct  = n  => `${Number(n).toFixed(2)}%`;
const pct1 = n  => `${Number(n).toFixed(1)}%`;

// ─── FINANCIAL ENGINE ────────────────────────────────────────────────────────
function calcMetrics(d) {
  const price   = parseFloat(d.purchasePrice)  || 0;
  const downPct = parseFloat(d.downPaymentPct) || 20;
  const downAmt = price * downPct / 100;
  const loan    = price - downAmt;
  const r       = (parseFloat(d.mortgageRate) || 4.5) / 100 / 12;
  const n       = (parseFloat(d.mortgageTerm) || 25) * 12;
  const mo      = loan > 0 && r > 0 ? loan*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1) : 0;
  const rent    = parseFloat(d.monthlyRent)    || 0;
  const svc     = parseFloat(d.serviceCharge)  || 0;
  const ins     = parseFloat(d.insurance)      || 0;
  const mgmt    = rent * (parseFloat(d.mgmtFeePct) || 8) / 100;
  const maint   = parseFloat(d.maintenance)    || 0;
  const exp     = mo + svc + ins + mgmt + maint;
  const cf      = rent - exp;
  const gY      = price > 0 ? (rent*12/price)*100 : 0;
  const nY      = price > 0 ? ((rent-svc-ins-mgmt-maint)*12/price)*100 : 0;
  const inv     = downAmt + (parseFloat(d.closingCosts) || 0);
  const coc     = inv > 0 ? (cf*12/inv)*100 : 0;
  return { downAmt, loan, mo, mgmt, svc, ins, maint, exp, cf, gY, nY, inv, coc, rent };
}

function dealGrade(m) {
  const score = (m.nY >= 7 ? 3 : m.nY >= 5 ? 2 : m.nY >= 3 ? 1 : 0)
              + (m.coc >= 8 ? 3 : m.coc >= 5 ? 2 : m.coc >= 2 ? 1 : 0)
              + (m.cf >= 500 ? 2 : m.cf >= 0 ? 1 : 0);
  if (score >= 7) return { grade:"A", label:"Strong Buy", col:"#4ade80", bg:"#0d2418" };
  if (score >= 5) return { grade:"B", label:"Buy",        col:"#86efac", bg:"#0d2018" };
  if (score >= 3) return { grade:"C", label:"Watch",      col:"#fbbf24", bg:"#241a08" };
  return           { grade:"D", label:"Pass",             col:"#f87171", bg:"#240d0d" };
}

function calcGrowth(d, appRate) {
  const app   = parseFloat(appRate ?? d.appreciationRate) || 5;
  const price = parseFloat(d.purchasePrice) || 0;
  const r     = (parseFloat(d.mortgageRate) || 4.5) / 100 / 12;
  const n     = (parseFloat(d.mortgageTerm) || 25) * 12;
  const m     = calcMetrics(d);
  return Array.from({ length:10 }, (_, i) => {
    const y   = i + 1;
    const val = price * Math.pow(1 + app/100, y);
    const t   = Math.min(y*12, n);
    const bal = r > 0 && n > 0
      ? m.loan*(Math.pow(1+r,n)-Math.pow(1+r,t))/(Math.pow(1+r,n)-1)
      : Math.max(0, m.loan - (m.loan/n)*t);
    const eq  = val - Math.max(0, bal);
    const ccf = m.cf * 12 * y;
    const ret = eq - m.inv + ccf;
    const roi = m.inv > 0 ? (ret/m.inv)*100 : 0;
    return { yr:`Yr ${y}`, val, eq, bal:Math.max(0,bal), ccf, ret, roi };
  });
}

// ─── PDF EXPORT ──────────────────────────────────────────────────────────────
function exportPDF(deal) {
  const m = calcMetrics(deal); const c = deal.currency || "USD";
  const g = dealGrade(m);      const grw = calcGrowth(deal);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${deal.address}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'IBM Plex Mono',monospace;background:#fff;color:#111;padding:36px;font-size:11px;}
h1{font-family:'Playfair Display',serif;font-size:22px;margin-bottom:3px;}
.sub{color:#777;font-size:9px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px;}
.grade{display:inline-block;padding:3px 10px;border-radius:3px;font-size:10px;font-weight:600;margin-bottom:18px;}
.st{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:#999;border-bottom:1px solid #eee;padding-bottom:5px;margin:16px 0 10px;}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;}
.card{border:1px solid #e5e5e5;border-radius:5px;padding:11px;}
.cl{font-size:7px;letter-spacing:.1em;text-transform:uppercase;color:#aaa;margin-bottom:3px;}
.cv{font-size:15px;font-weight:500;}
.cv.gold{color:#b8861a;}.cv.green{color:#166534;}.cv.red{color:#991b1b;}
table{width:100%;border-collapse:collapse;font-size:10px;}
th{background:#f5f5f5;padding:6px 9px;text-align:left;font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:#888;}
td{padding:6px 9px;border-bottom:1px solid #f0f0f0;}
.ai{background:#faf9f4;border-left:3px solid #b8861a;padding:12px;font-family:Georgia,serif;font-size:11px;line-height:1.7;color:#333;white-space:pre-wrap;margin-top:4px;}
.cm{border:1px solid #ebebeb;border-radius:5px;padding:10px;margin-bottom:7px;}
.ca{font-size:8px;color:#b8861a;font-weight:500;margin-bottom:4px;}
.ct{font-size:10px;color:#555;font-family:Georgia,serif;line-height:1.6;}
.foot{margin-top:26px;padding-top:10px;border-top:1px solid #eee;font-size:8px;color:#ccc;display:flex;justify-content:space-between;}
</style></head><body>
<h1>${deal.address}</h1>
<div class="sub">${deal.type||""} · ${deal.market||""} · ${c}</div>
<div class="grade" style="background:${g.bg};color:${g.col};border:1px solid ${g.col}44">Grade ${g.grade} — ${g.label}</div>
<div class="st">Key Returns</div>
<div class="g4">
<div class="card"><div class="cl">Gross Yield</div><div class="cv gold">${pct(m.gY)}</div></div>
<div class="card"><div class="cl">Net Yield</div><div class="cv ${m.nY>=5?"green":m.nY>=3?"gold":"red"}">${pct(m.nY)}</div></div>
<div class="card"><div class="cl">Cash-on-Cash</div><div class="cv ${m.coc>=6?"green":m.coc>=3?"gold":"red"}">${pct(m.coc)}</div></div>
<div class="card"><div class="cl">Monthly Cash Flow</div><div class="cv ${m.cf>=0?"green":"red"}">${m.cf>=0?"+":""}${fmtC(m.cf,c)}</div></div>
</div>
<div class="g4">
<div class="card"><div class="cl">Purchase Price</div><div class="cv">${fmtC(deal.purchasePrice,c)}</div></div>
<div class="card"><div class="cl">Total Invested</div><div class="cv">${fmtC(m.inv,c)}</div></div>
<div class="card"><div class="cl">Monthly Mortgage</div><div class="cv">${fmtC(m.mo,c)}</div></div>
<div class="card"><div class="cl">Monthly Expenses</div><div class="cv">${fmtC(m.exp,c)}</div></div>
</div>
<div class="st">10-Year Growth Projection (${deal.appreciationRate||5}% p.a.)</div>
<table><thead><tr><th>Year</th><th>Value</th><th>Loan Bal.</th><th>Equity</th><th>Cum. Cash Flow</th><th>Total Return</th><th>ROI</th></tr></thead>
<tbody>${grw.map(r=>`<tr><td>${r.yr}</td><td>${fmtC(r.val,c)}</td><td>${fmtC(r.bal,c)}</td><td>${fmtC(r.eq,c)}</td><td style="color:${r.ccf>=0?"#166534":"#991b1b"}">${r.ccf>=0?"+":""}${fmtC(r.ccf,c)}</td><td style="color:${r.ret>=0?"#166534":"#991b1b"}">${r.ret>=0?"+":""}${fmtC(r.ret,c)}</td><td style="color:${r.roi>=0?"#166534":"#991b1b"}">${r.roi>=0?"+":""}${pct1(r.roi)}</td></tr>`).join("")}</tbody></table>
${deal.aiAnalysis?`<div class="st">AI Analysis</div><div class="ai">${deal.aiAnalysis}</div>`:""}
${deal.comments?.length?`<div class="st">Collaboration Notes</div>${deal.comments.map(cm=>`<div class="cm"><div class="ca">${cm.author} · ${cm.time}</div><div class="ct">${cm.text}</div></div>`).join("")}`:""}
<div class="foot"><span>DealDesk · Property Investment Appraisal</span><span>${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</span></div>
</body></html>`;
  const w = window.open("","_blank"); w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=IBM+Plex+Mono:wght@300;400;500&family=Crimson+Pro:wght@300;400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Crimson Pro',Georgia,serif;background:#080c14;color:#ddd6c8;}
::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#2a3448;border-radius:2px;}
.app{display:flex;height:100vh;overflow:hidden;background:#080c14;}

/* ── SIDEBAR ── */
.sb{width:286px;min-width:286px;background:#0d1220;border-right:1px solid #1e2a3d;display:flex;flex-direction:column;overflow:hidden;}
.sb-head{padding:18px 16px 12px;border-bottom:1px solid #1e2a3d;}
.logo{font-family:'Playfair Display',serif;font-size:16px;font-weight:700;color:#c9a84c;letter-spacing:.05em;display:flex;align-items:center;gap:8px;}
.logo-i{width:28px;height:28px;background:linear-gradient(135deg,#c9a84c,#8b6914);border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:13px;}
.logo-sub{font-size:9px;color:#3a4558;letter-spacing:.1em;text-transform:uppercase;margin-top:2px;}
.sb-search{padding:8px 12px;border-bottom:1px solid #1e2a3d;}
.search-inp{width:100%;background:#080c14;border:1px solid #1e2a3d;color:#ddd6c8;font-family:'IBM Plex Mono',monospace;font-size:11px;padding:7px 10px;border-radius:5px;outline:none;transition:border-color .15s;}
.search-inp:focus{border-color:#c9a84c44;}
.search-inp::placeholder{color:#2a3448;}
.sb-acts{padding:8px 12px;border-bottom:1px solid #1e2a3d;display:flex;gap:6px;}
.btn-add{flex:1;padding:7px;background:linear-gradient(135deg,#c9a84c,#a07828);color:#080c14;font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;border:none;border-radius:4px;cursor:pointer;transition:opacity .2s;}
.btn-add:hover{opacity:.85;}
.btn-sm{padding:6px 10px;background:transparent;border:1px solid #2a3448;color:#4a5568;font-family:'IBM Plex Mono',monospace;font-size:10px;border-radius:4px;cursor:pointer;letter-spacing:.04em;transition:all .15s;white-space:nowrap;}
.btn-sm.on{border-color:#c9a84c55;color:#c9a84c;background:#c9a84c0d;}
.btn-sm:hover{border-color:#4a5568;color:#ddd6c8;}
.dl{flex:1;overflow-y:auto;padding:6px;}
.di{padding:11px;border-radius:6px;margin-bottom:4px;cursor:pointer;border:1px solid transparent;transition:all .15s;position:relative;}
.di:hover{background:#131929;border-color:#2a3448;}
.di.act{background:#141c2e;border-color:#c9a84c44;}
.di-addr{font-family:'Playfair Display',serif;font-size:12px;color:#ddd6c8;font-weight:600;line-height:1.3;padding-right:22px;}
.di-mkt{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#3a4a5e;margin-top:3px;}
.di-row{display:flex;justify-content:space-between;align-items:center;margin-top:6px;}
.di-price{font-family:'IBM Plex Mono',monospace;font-size:11px;color:#c9a84c;}
.badge{font-size:9px;font-family:'IBM Plex Mono',monospace;padding:2px 6px;border-radius:3px;font-weight:500;text-transform:uppercase;}
.badge-review{background:#1e3a2a;color:#4ade80;}.badge-hold{background:#2a1e0e;color:#fb923c;}
.badge-pass{background:#2a1e1e;color:#f87171;}.badge-new{background:#1e2a3d;color:#60a5fa;}
.di-yields{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#2e3d4f;margin-top:4px;}
.grade-pill{position:absolute;top:9px;right:9px;font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:600;padding:2px 5px;border-radius:3px;}
.cmp-chk{position:absolute;top:9px;right:9px;width:15px;height:15px;border:1px solid #2a3448;border-radius:3px;background:#0d1220;display:flex;align-items:center;justify-content:center;font-size:9px;color:#c9a84c;transition:all .15s;}
.cmp-chk.on{background:#c9a84c1a;border-color:#c9a84c55;}

/* ── MAIN ── */
.main{flex:1;overflow:hidden;display:flex;flex-direction:column;}
.main-nav{padding:10px 20px;border-bottom:1px solid #1e2a3d;display:flex;align-items:center;justify-content:space-between;background:#0a0e18;min-height:44px;}
.nav-tabs{display:flex;gap:3px;}
.tab{font-family:'IBM Plex Mono',monospace;font-size:9px;padding:5px 12px;border-radius:4px;border:1px solid transparent;cursor:pointer;letter-spacing:.06em;text-transform:uppercase;color:#4a5568;background:transparent;transition:all .15s;}
.tab.on{background:#141c2e;border-color:#c9a84c44;color:#c9a84c;}
.tab:hover:not(.on){color:#ddd6c8;border-color:#2a3448;}
.nav-r{display:flex;gap:6px;align-items:center;}
.btn-pdf{background:transparent;border:1px solid #2a3448;color:#4a5568;font-family:'IBM Plex Mono',monospace;font-size:9px;padding:5px 12px;border-radius:4px;cursor:pointer;letter-spacing:.06em;text-transform:uppercase;transition:all .15s;}
.btn-pdf:hover{border-color:#c9a84c55;color:#c9a84c;}
.nav-info{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#3a4558;padding:4px;}
.m-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;}
.empty-i{font-size:36px;opacity:.15;}.empty-t{font-family:'Playfair Display',serif;font-size:16px;color:#2a3a4e;}.empty-s{font-size:11px;color:#1e2a3a;}

/* ── SHARED ── */
.sv{flex:1;overflow-y:auto;padding:20px 24px;}
.sh{font-family:'IBM Plex Mono',monospace;font-size:8px;color:#3a4a5e;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:6px;}
.sh::after{content:'';flex:1;height:1px;background:#1a2234;}
.mg4{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:7px;}
.mg3{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:7px;}
.mg2{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:7px;}
.mc{background:#0d1220;border:1px solid #1a2234;border-radius:6px;padding:11px;}
.ml{font-family:'IBM Plex Mono',monospace;font-size:8px;color:#3a4a5e;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;}
.mv{font-family:'IBM Plex Mono',monospace;font-size:15px;font-weight:500;color:#ddd6c8;}
.mv.gold{color:#c9a84c;}.mv.green{color:#4ade80;}.mv.red{color:#f87171;}.mv.blue{color:#60a5fa;}
.ms{font-family:'IBM Plex Mono',monospace;font-size:8px;color:#3a4a5e;margin-top:2px;}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;}
.ig{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
.ig3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;}
.inp-g{display:flex;flex-direction:column;gap:3px;}
.inp-l{font-family:'IBM Plex Mono',monospace;font-size:8px;color:#3a4a5e;letter-spacing:.08em;text-transform:uppercase;}
.inp{background:#0d1220;border:1px solid #1a2234;color:#ddd6c8;font-family:'IBM Plex Mono',monospace;font-size:12px;padding:6px 8px;border-radius:4px;outline:none;transition:border-color .15s;width:100%;}
.inp:focus{border-color:#c9a84c44;}
select.inp{color:#c9a84c;cursor:pointer;}

/* ── GRADE BADGE ── */
.grade-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:4px;font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;border:1px solid;}

/* ── AI PANEL ── */
.ai-panel{background:#090e1a;border:1px solid #1a2234;border-radius:7px;overflow:hidden;margin-bottom:18px;}
.ai-hdr{padding:10px 14px;background:linear-gradient(90deg,#0e1828,#090e1a);border-bottom:1px solid #1a2234;display:flex;align-items:center;justify-content:space-between;}
.ai-lbl{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#c9a84c;letter-spacing:.12em;text-transform:uppercase;display:flex;align-items:center;gap:6px;}
.ai-dot{width:5px;height:5px;border-radius:50%;background:#c9a84c;animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.3;}}
.btn-ai{background:transparent;border:1px solid #c9a84c44;color:#c9a84c;font-family:'IBM Plex Mono',monospace;font-size:9px;padding:4px 11px;border-radius:3px;cursor:pointer;letter-spacing:.08em;text-transform:uppercase;transition:all .15s;}
.btn-ai:hover{background:#c9a84c1a;border-color:#c9a84c;}.btn-ai:disabled{opacity:.4;cursor:not-allowed;}
.ai-body{padding:14px;min-height:60px;font-size:13px;line-height:1.75;color:#9a9080;}
.ai-ph{color:#2a3448;font-style:italic;font-size:11px;font-family:'IBM Plex Mono',monospace;}

/* ── DEAL HEADER ── */
.dh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #1a2234;}
.dh-l .addr{font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:#ddd6c8;line-height:1.2;max-width:440px;}
.dh-l .dtag{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#3a4a5e;margin-top:4px;text-transform:uppercase;letter-spacing:.1em;}
.dh-r{display:flex;flex-direction:column;align-items:flex-end;gap:7px;}
.btn-cancel{background:transparent;border:1px solid #2a3448;color:#4a5568;font-family:'IBM Plex Mono',monospace;font-size:9px;padding:5px 12px;border-radius:4px;cursor:pointer;transition:all .15s;}
.btn-cancel:hover{border-color:#4a5568;color:#ddd6c8;}
.del-btn{background:transparent;border:none;color:#2a1a1a;font-size:10px;cursor:pointer;padding:4px 7px;font-family:'IBM Plex Mono',monospace;border-radius:3px;transition:all .15s;}
.del-btn:hover{background:#2a1414;color:#f87171;}

/* ── CHART BOX ── */
.chart-box{background:#0d1220;border:1px solid #1a2234;border-radius:7px;padding:14px;margin-bottom:14px;}

/* ── GROWTH TABLE ── */
.gtbl{width:100%;border-collapse:collapse;font-family:'IBM Plex Mono',monospace;font-size:11px;}
.gtbl th{font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:#3a4a5e;padding:7px 10px;border-bottom:1px solid #1a2234;text-align:left;}
.gtbl td{padding:7px 10px;border-bottom:1px solid #0d1220;color:#ddd6c8;}
.gtbl tr:hover td{background:#0d1220;}

/* ── SCENARIO ── */
.sc-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px;}
.sc-card{background:#0d1220;border:1px solid #1a2234;border-radius:7px;padding:14px;}
.sc-header{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;}
.sc-val{font-family:'IBM Plex Mono',monospace;font-size:13px;margin:4px 0;color:#ddd6c8;}
.sc-label{font-family:'IBM Plex Mono',monospace;font-size:8px;color:#3a4a5e;text-transform:uppercase;letter-spacing:.08em;}

/* ── COMPARE ── */
.cv-wrap{flex:1;overflow:auto;padding:20px 24px;}
.cv-title{font-family:'Playfair Display',serif;font-size:18px;color:#ddd6c8;margin-bottom:2px;}
.cv-sub{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#3a4a5e;margin-bottom:16px;}
.ctbl{border-collapse:collapse;min-width:100%;}
.ctbl th{font-family:'IBM Plex Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:#3a4a5e;padding:8px 13px;border-bottom:2px solid #1a2234;white-space:nowrap;}
.ctbl th.dc{min-width:160px;text-align:center;}
.ctbl td{padding:8px 13px;border-bottom:1px solid #1a2234;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#ddd6c8;}
.ctbl td.rl{color:#3a4a5e;font-size:8px;text-transform:uppercase;letter-spacing:.09em;white-space:nowrap;}
.ctbl td.dv{text-align:center;}
.ctbl td.best{color:#4ade80;background:#0d1a12;}
.ctbl td.worst{color:#f87171;}
.ctbl tr:hover td{background:#0d1220;}

/* ── NOTES ── */
.cmt-card{background:#0d1220;border:1px solid #1a2234;border-radius:6px;padding:12px;margin-bottom:7px;}
.cmt-meta{display:flex;justify-content:space-between;margin-bottom:6px;}
.cmt-auth{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#c9a84c;font-weight:500;}
.cmt-time{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#2a3448;}
.cmt-txt{font-size:13px;color:#9a9080;line-height:1.6;}
.star{color:#2a3448;font-size:10px;cursor:pointer;}.star.on{color:#c9a84c;}
.inp-name{width:140px;background:#0d1220;border:1px solid #1a2234;color:#ddd6c8;font-family:'IBM Plex Mono',monospace;font-size:11px;padding:6px 8px;border-radius:4px;outline:none;}
.inp-name:focus{border-color:#c9a84c44;}
.ta{flex:1;background:#0d1220;border:1px solid #1a2234;color:#ddd6c8;font-family:'Crimson Pro',Georgia,serif;font-size:13px;padding:8px;border-radius:4px;outline:none;resize:none;line-height:1.5;transition:border-color .15s;}
.ta:focus{border-color:#c9a84c44;}
.btn-post{background:#0d1220;border:1px solid #2a3448;color:#ddd6c8;font-family:'IBM Plex Mono',monospace;font-size:10px;padding:6px 13px;border-radius:4px;cursor:pointer;letter-spacing:.04em;transition:all .15s;}
.btn-post:hover{border-color:#c9a84c55;color:#c9a84c;}

/* ── MODAL ── */
.mo{position:fixed;inset:0;background:#000000cc;display:flex;align-items:center;justify-content:center;z-index:100;padding:14px;}
.md{background:#0d1220;border:1px solid #2a3448;border-radius:9px;width:100%;max-width:600px;padding:22px;max-height:93vh;overflow-y:auto;}
.md-title{font-family:'Playfair Display',serif;font-size:17px;color:#ddd6c8;margin-bottom:14px;padding-bottom:11px;border-bottom:1px solid #1a2234;}
.md-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;}
.md-full{grid-column:1/-1;}
.md-div{font-family:'IBM Plex Mono',monospace;font-size:8px;color:#3a4a5e;letter-spacing:.12em;text-transform:uppercase;padding:5px 0 2px;border-bottom:1px solid #1a2234;margin-bottom:8px;grid-column:1/-1;}
.md-acts{display:flex;justify-content:flex-end;gap:7px;margin-top:14px;padding-top:12px;border-top:1px solid #1a2234;}
.btn-save{background:linear-gradient(135deg,#c9a84c,#a07828);border:none;color:#080c14;font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:500;padding:7px 14px;border-radius:4px;cursor:pointer;text-transform:uppercase;transition:opacity .2s;}
.btn-save:hover{opacity:.85;}

/* ── DASHBOARD ── */
.db-wrap{flex:1;overflow-y:auto;padding:20px 24px;}
.db-hero{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:18px;}
.db-card{background:#0d1220;border:1px solid #1a2234;border-radius:7px;padding:13px;}
.db-label{font-family:'IBM Plex Mono',monospace;font-size:8px;color:#3a4a5e;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;}
.db-val{font-family:'IBM Plex Mono',monospace;font-size:17px;font-weight:500;color:#ddd6c8;}
.db-val.gold{color:#c9a84c;}.db-val.green{color:#4ade80;}.db-val.blue{color:#60a5fa;}
.db-sub{font-family:'IBM Plex Mono',monospace;font-size:8px;color:#3a4a5e;margin-top:2px;}
.db-two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;}

/* ── TOOLTIP custom ── */
.recharts-tooltip-wrapper{z-index:10;}

/* ── LINK FIELD ── */
.listing-link{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#4a7ab5;text-decoration:none;transition:color .15s;}
.listing-link:hover{color:#60a5fa;}

@media(max-width:860px){
  .mg4{grid-template-columns:1fr 1fr;}
  .db-hero{grid-template-columns:repeat(3,1fr);}
  .sc-grid{grid-template-columns:1fr;}
  .two{grid-template-columns:1fr;}
  .db-two{grid-template-columns:1fr;}
}
`;

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const DEAL_TYPES = ["Apartment — Studio","Apartment — 1BR","Apartment — 2BR","Apartment — 3BR","Apartment — 4BR+","Villa — 3BR","Villa — 4BR","Villa — 5BR+","Townhouse","Commercial","Land","Other"];
const STATUSES   = [{v:"new",l:"New Lead"},{v:"review",l:"Under Review"},{v:"hold",l:"Hold"},{v:"pass",l:"Pass"}];
const SL = id => STATUSES.find(s=>s.v===id)?.l || id;
const PIE_COLORS = ["#c9a84c","#4a7ab5","#4ade80","#fb923c","#a78bfa"];
const CHART_STYLE = { fontFamily:"IBM Plex Mono", fontSize:9 };
const TT_STYLE = { background:"#0d1220", border:"1px solid #2a3448", borderRadius:5, fontFamily:"IBM Plex Mono", fontSize:10 };

// ─── MICRO ───────────────────────────────────────────────────────────────────
function Stars({ v, onChange }) {
  return <div style={{display:"flex",gap:3}}>{[1,2,3,4,5].map(i=>(
    <span key={i} className={`star ${i<=v?"on":""}`} onClick={()=>onChange&&onChange(i)}>★</span>
  ))}</div>;
}

// ─── DEAL MODAL ──────────────────────────────────────────────────────────────
function DealModal({ deal, onSave, onClose }) {
  const blank = {
    address:"", market:"", type:"Apartment — 2BR", currency:"USD", listingUrl:"",
    purchasePrice:"", closingCosts:"", downPaymentPct:"20", mortgageRate:"5.5", mortgageTerm:"25",
    monthlyRent:"", serviceCharge:"", insurance:"", mgmtFeePct:"8", maintenance:"",
    appreciationRate:"5", status:"new", notes:"", comments:[], aiAnalysis:null,
  };
  const [f,setF] = useState(deal || blank);
  const s = (k,v) => setF(p=>({...p,[k]:v}));
  return (
    <div className="mo" onClick={onClose}>
      <div className="md" onClick={e=>e.stopPropagation()}>
        <div className="md-title">{deal ? "Edit Deal" : "Add New Deal"}</div>
        <div className="md-grid">
          <div className="inp-g md-full"><div className="inp-l">Property Address</div>
            <input className="inp" placeholder="e.g. 12 Harbour View, Apt 8B" value={f.address} onChange={e=>s("address",e.target.value)}/></div>
          <div className="inp-g"><div className="inp-l">Market / City</div>
            <input className="inp" placeholder="e.g. Dubai, London, Sydney" value={f.market} onChange={e=>s("market",e.target.value)}/></div>
          <div className="inp-g"><div className="inp-l">Currency</div>
            <select className="inp" value={f.currency} onChange={e=>s("currency",e.target.value)}>
              {Object.values(CURRENCIES).map(c=><option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>)}
            </select></div>
          <div className="inp-g"><div className="inp-l">Property Type</div>
            <select className="inp" value={f.type} onChange={e=>s("type",e.target.value)}>
              {DEAL_TYPES.map(t=><option key={t}>{t}</option>)}
            </select></div>
          <div className="inp-g"><div className="inp-l">Status</div>
            <select className="inp" value={f.status} onChange={e=>s("status",e.target.value)}>
              {STATUSES.map(x=><option key={x.v} value={x.v}>{x.l}</option>)}
            </select></div>
          <div className="inp-g md-full"><div className="inp-l">Listing URL (optional)</div>
            <input className="inp" placeholder="https://..." value={f.listingUrl||""} onChange={e=>s("listingUrl",e.target.value)}/></div>

          <div className="md-div">Acquisition</div>
          {[["purchasePrice","Purchase Price"],["closingCosts","Closing / Stamp Duty"],["downPaymentPct","Down Payment %"],["mortgageRate","Mortgage Rate %"],["mortgageTerm","Term (years)"]].map(([k,l])=>(
            <div className="inp-g" key={k}><div className="inp-l">{l}</div>
              <input className="inp" type="number" value={f[k]} onChange={e=>s(k,e.target.value)}/></div>
          ))}

          <div className="md-div">Income & Monthly Expenses</div>
          {[["monthlyRent","Monthly Rent"],["serviceCharge","Service / Strata"],["insurance","Insurance"],["mgmtFeePct","Mgmt Fee %"],["maintenance","Maintenance"]].map(([k,l])=>(
            <div className="inp-g" key={k}><div className="inp-l">{l}</div>
              <input className="inp" type="number" value={f[k]} onChange={e=>s(k,e.target.value)}/></div>
          ))}

          <div className="md-div">Growth & Notes</div>
          <div className="inp-g"><div className="inp-l">Annual Capital Growth %</div>
            <input className="inp" type="number" value={f.appreciationRate} onChange={e=>s("appreciationRate",e.target.value)}/></div>
          <div className="inp-g md-full"><div className="inp-l">Private Notes</div>
            <input className="inp" placeholder="e.g. motivated seller, off-plan, leasehold" value={f.notes||""} onChange={e=>s("notes",e.target.value)}/></div>
        </div>
        <div className="md-acts">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-save" onClick={()=>onSave({...f,id:f.id||String(Date.now())})}>Save Deal</button>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function Dashboard({ deals }) {
  const active = deals.filter(d => d.status !== "pass");
  const withData = active.filter(d => parseFloat(d.purchasePrice) > 0);
  const metrics = withData.map(d => ({ d, m: calcMetrics(d) }));

  const totalInvested  = metrics.reduce((s,{m})=>s+m.inv, 0);
  const totalMonthlyCF = metrics.reduce((s,{m})=>s+m.cf,  0);
  const avgNetYield    = metrics.length ? metrics.reduce((s,{m})=>s+m.nY, 0) / metrics.length : 0;
  const avgCoC         = metrics.length ? metrics.reduce((s,{m})=>s+m.coc, 0) / metrics.length : 0;

  // Grade distribution
  const grades = { A:0, B:0, C:0, D:0 };
  deals.forEach(d => { const g = dealGrade(calcMetrics(d)); grades[g.grade]++; });
  const gradePie = Object.entries(grades).filter(([,v])=>v>0).map(([k,v])=>({name:`Grade ${k}`,value:v}));
  const gradeCols = { A:"#4ade80", B:"#86efac", C:"#fbbf24", D:"#f87171" };

  // Status distribution
  const statDist = STATUSES.map(s=>({ name:s.l, value:deals.filter(d=>d.status===s.v).length })).filter(x=>x.value>0);

  // Yield bar chart
  const yieldData = withData.slice(0,8).map(d=>{
    const m=calcMetrics(d); return { name:d.address.split(",")[0].substring(0,14), net:+m.nY.toFixed(2), gross:+m.gY.toFixed(2) };
  });

  if (!deals.length) return (
    <div className="db-wrap"><div className="m-empty" style={{flex:"unset",padding:"60px 0"}}>
      <div className="empty-i">◈</div><div className="empty-t">No deals yet</div>
      <div className="empty-s">Add your first deal to see portfolio stats</div>
    </div></div>
  );

  return (
    <div className="db-wrap">
      <div className="sh">Portfolio Summary — {deals.length} deal{deals.length!==1?"s":""}</div>
      <div className="db-hero">
        <div className="db-card"><div className="db-label">Total Deals</div><div className="db-val blue">{deals.length}</div><div className="db-sub">{active.length} active</div></div>
        <div className="db-card"><div className="db-label">Avg Net Yield</div><div className="db-val gold">{pct(avgNetYield)}</div><div className="db-sub">active deals</div></div>
        <div className="db-card"><div className="db-label">Avg Cash-on-Cash</div><div className="db-val gold">{pct(avgCoC)}</div><div className="db-sub">active deals</div></div>
        <div className="db-card"><div className="db-label">Total Monthly CF</div><div className={`db-val ${totalMonthlyCF>=0?"green":"red"}`}>{totalMonthlyCF>=0?"+":""}{Math.round(totalMonthlyCF).toLocaleString()}</div><div className="db-sub">mixed currencies</div></div>
        <div className="db-card"><div className="db-label">Grade A / B Deals</div><div className="db-val green">{grades.A + grades.B}</div><div className="db-sub">of {deals.length} total</div></div>
      </div>

      <div className="db-two">
        <div>
          <div className="sh">Yield Comparison</div>
          {yieldData.length > 0 ? (
            <div className="chart-box" style={{padding:12}}>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={yieldData} margin={{top:4,right:8,bottom:24,left:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2234"/>
                  <XAxis dataKey="name" tick={{...CHART_STYLE,fill:"#3a4a5e",fontSize:8}} angle={-30} textAnchor="end" interval={0} axisLine={{stroke:"#1a2234"}} tickLine={false}/>
                  <YAxis tick={{...CHART_STYLE,fill:"#3a4a5e"}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`}/>
                  <Tooltip contentStyle={TT_STYLE} labelStyle={{color:"#c9a84c"}} formatter={v=>`${v}%`}/>
                  <Legend wrapperStyle={{fontFamily:"IBM Plex Mono",fontSize:8,color:"#3a4a5e"}}/>
                  <Bar dataKey="gross" name="Gross Yield" fill="#c9a84c44" radius={[3,3,0,0]}/>
                  <Bar dataKey="net"   name="Net Yield"   fill="#c9a84c"   radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div style={{color:"#2a3448",fontFamily:"IBM Plex Mono",fontSize:11,padding:"20px 0"}}>Add deals with financials to see chart</div>}
        </div>
        <div>
          <div className="sh">Deal Grades</div>
          <div className="chart-box" style={{padding:12}}>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={gradePie} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value" label={({name,value})=>`${name} (${value})`} labelLine={{stroke:"#2a3448"}} style={{fontSize:8,fontFamily:"IBM Plex Mono",fill:"#4a5568"}}>
                  {gradePie.map((entry,i)=><Cell key={i} fill={gradeCols[entry.name.split(" ")[1]]}/>)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="sh">All Deals — Quick View</div>
      <div style={{overflowX:"auto"}}>
        <table className="gtbl" style={{marginBottom:4}}>
          <thead><tr>
            <th>Address</th><th>Market</th><th>Currency</th><th>Price</th>
            <th>Net Yield</th><th>CoC</th><th>Cash Flow/mo</th><th>Grade</th><th>Status</th>
          </tr></thead>
          <tbody>
            {deals.map(d=>{
              const m=calcMetrics(d); const g=dealGrade(m); const c=d.currency||"USD";
              return <tr key={d.id}>
                <td style={{fontFamily:"'Playfair Display',serif",fontSize:12,color:"#ddd6c8",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.address}</td>
                <td style={{color:"#4a5568"}}>{d.market||"—"}</td>
                <td style={{color:"#4a5568"}}>{c}</td>
                <td style={{color:"#c9a84c"}}>{fmtC(d.purchasePrice,c)}</td>
                <td className={m.nY>=5?"grn":m.nY>=3?"gg":"grd"} style={{color:m.nY>=5?"#4ade80":m.nY>=3?"#c9a84c":"#f87171"}}>{pct(m.nY)}</td>
                <td style={{color:m.coc>=6?"#4ade80":m.coc>=3?"#c9a84c":"#f87171"}}>{pct(m.coc)}</td>
                <td style={{color:m.cf>=0?"#4ade80":"#f87171"}}>{m.cf>=0?"+":""}{fmtC(m.cf,c)}</td>
                <td><span style={{background:g.bg,color:g.col,border:`1px solid ${g.col}44`,padding:"2px 6px",borderRadius:3,fontFamily:"IBM Plex Mono",fontSize:9,fontWeight:600}}>{g.grade}</span></td>
                <td><span className={`badge badge-${d.status}`}>{SL(d.status)}</span></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── GROWTH TAB ──────────────────────────────────────────────────────────────
function GrowthTab({ deal, onUpdate }) {
  const c    = deal.currency || "USD";
  const base = parseFloat(deal.appreciationRate) || 5;
  const bear = Math.max(0, base - 3);
  const bull = base + 3;

  const baseRows = calcGrowth(deal, base);
  const bearRows = calcGrowth(deal, bear);
  const bullRows = calcGrowth(deal, bull);

  const chartData = baseRows.map((r,i) => ({
    name: r.yr,
    Bear:  Math.round(bearRows[i].eq),
    Base:  Math.round(r.eq),
    Bull:  Math.round(bullRows[i].eq),
    Value: Math.round(r.val),
  }));

  return (
    <div className="sv">
      <div style={{marginBottom:14}}>
        <div className="sh">Base Capital Growth Rate</div>
        <div style={{display:"flex",gap:12,alignItems:"flex-end",marginBottom:4}}>
          <div className="inp-g" style={{width:170}}>
            <div className="inp-l">Annual Appreciation % (base)</div>
            <input className="inp" type="number" value={deal.appreciationRate||5} onChange={e=>onUpdate({appreciationRate:e.target.value})}/>
          </div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#3a4a5e",paddingBottom:7}}>
            Bear: {pct1(bear)} · Base: {pct1(base)} · Bull: {pct1(bull)}
          </div>
        </div>
      </div>

      <div className="sh">Scenario Modelling — Equity Growth</div>
      <div className="sc-grid">
        {[{label:"🐻 Bear",rows:bearRows,rate:bear,col:"#f87171"},{label:"◈ Base",rows:baseRows,rate:base,col:"#c9a84c"},{label:"🐂 Bull",rows:bullRows,rate:bull,col:"#4ade80"}].map(sc=>(
          <div className="sc-card" key={sc.label} style={{borderColor:sc.col+"22"}}>
            <div className="sc-header"><span style={{color:sc.col}}>{sc.label}</span><span style={{color:"#3a4a5e",fontSize:10}}>{pct1(sc.rate)} p.a.</span></div>
            {[{y:3,l:"3-Year"},{y:5,l:"5-Year"},{y:10,l:"10-Year"}].map(({y,l})=>{
              const r=sc.rows[y-1];
              return <div key={y} style={{marginBottom:8}}>
                <div className="sc-label">{l} Equity</div>
                <div className="sc-val" style={{color:sc.col}}>{fmtC(r.eq,c)}</div>
                <div className="sc-label">Total Return: <span style={{color:r.ret>=0?"#4ade80":"#f87171"}}>{r.ret>=0?"+":""}{fmtC(r.ret,c)}</span></div>
              </div>;
            })}
          </div>
        ))}
      </div>

      <div className="sh">10-Year Equity Projection</div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={chartData} margin={{top:4,right:8,bottom:4,left:8}}>
            <defs>
              {[["bull","#4ade80"],["base","#c9a84c"],["bear","#f87171"],["val","#60a5fa"]].map(([id,col])=>(
                <linearGradient key={id} id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={col} stopOpacity={0.25}/><stop offset="95%" stopColor={col} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2234"/>
            <XAxis dataKey="name" tick={{...CHART_STYLE,fill:"#3a4a5e"}} axisLine={{stroke:"#1a2234"}} tickLine={false}/>
            <YAxis tick={{...CHART_STYLE,fill:"#3a4a5e"}} axisLine={false} tickLine={false}
              tickFormatter={v=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}K`:v}/>
            <Tooltip contentStyle={TT_STYLE} labelStyle={{color:"#c9a84c"}} formatter={v=>fmtC(v,c)}/>
            <Legend wrapperStyle={{fontFamily:"IBM Plex Mono",fontSize:8,color:"#3a4a5e",paddingTop:6}}/>
            <Area type="monotone" dataKey="Bull"  stroke="#4ade80" fill="url(#gbull)" strokeWidth={1.5} strokeDasharray="4 2" dot={false}/>
            <Area type="monotone" dataKey="Base"  stroke="#c9a84c" fill="url(#gbase)" strokeWidth={2}   dot={false}/>
            <Area type="monotone" dataKey="Bear"  stroke="#f87171" fill="url(#gbear)" strokeWidth={1.5} strokeDasharray="4 2" dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="sh">Base Case — Year-by-Year</div>
      <div style={{overflowX:"auto"}}>
        <table className="gtbl">
          <thead><tr><th>Year</th><th>Value</th><th>Loan Bal.</th><th>Equity</th><th>Cum. CF</th><th>Total Return</th><th>ROI</th></tr></thead>
          <tbody>
            {baseRows.map(r=>(
              <tr key={r.yr}>
                <td style={{color:"#c9a84c"}}>{r.yr}</td>
                <td>{fmtC(r.val,c)}</td>
                <td style={{color:"#3a4a5e"}}>{fmtC(r.bal,c)}</td>
                <td style={{color:"#c9a84c"}}>{fmtC(r.eq,c)}</td>
                <td style={{color:r.ccf>=0?"#4ade80":"#f87171"}}>{r.ccf>=0?"+":""}{fmtC(r.ccf,c)}</td>
                <td style={{color:r.ret>=0?"#4ade80":"#f87171"}}>{r.ret>=0?"+":""}{fmtC(r.ret,c)}</td>
                <td style={{color:r.roi>=0?"#4ade80":"#f87171"}}>{r.roi>=0?"+":""}{pct1(r.roi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── COMPARE VIEW ─────────────────────────────────────────────────────────────
function CompareView({ deals, cmpIds }) {
  const sel = deals.filter(d=>cmpIds.includes(d.id));
  if (sel.length < 2) return (
    <div className="cv-wrap">
      <div className="cv-title">Compare Deals</div>
      <div className="cv-sub">Tick the checkboxes on 2+ deals in the sidebar</div>
      <div style={{textAlign:"center",padding:"50px 0",color:"#2a3448",fontFamily:"'IBM Plex Mono',monospace",fontSize:12}}>☐ Select deals to begin</div>
    </div>
  );
  const mx = sel.map(d=>({d, m:calcMetrics(d), g:dealGrade(calcMetrics(d))}));
  const rows = [
    {l:"Market",        vals:mx.map(({d})=>d.market||"—"),                      txt:true},
    {l:"Type",          vals:mx.map(({d})=>d.type||"—"),                        txt:true},
    {l:"Currency",      vals:mx.map(({d})=>d.currency||"USD"),                  txt:true},
    {l:"Grade",         vals:mx.map(({g})=>`${g.grade} — ${g.label}`),          txt:true},
    {l:"Purchase Price",vals:mx.map(({d})=>fmtC(d.purchasePrice,d.currency)),   txt:true},
    {l:"Total Invested",vals:mx.map(({d,m})=>fmtC(m.inv,d.currency)),           txt:true},
    {l:"Monthly Rent",  vals:mx.map(({d})=>fmtC(d.monthlyRent,d.currency)),     txt:true},
    {l:"Gross Yield",   vals:mx.map(({m})=>m.gY),  f:pct,   hi:true},
    {l:"Net Yield",     vals:mx.map(({m})=>m.nY),  f:pct,   hi:true},
    {l:"Cash-on-Cash",  vals:mx.map(({m})=>m.coc), f:pct,   hi:true},
    {l:"Monthly CF",    vals:mx.map(({m})=>m.cf),  f:(v,d)=>fmtC(v,d.currency), hi:true},
    {l:"Monthly Exp.",  vals:mx.map(({m})=>m.exp), f:(v,d)=>fmtC(v,d.currency), hi:false},
    {l:"Mortgage /mo",  vals:mx.map(({m})=>m.mo),  f:(v,d)=>fmtC(v,d.currency), hi:false},
    {l:"Growth % p.a.", vals:mx.map(({d})=>parseFloat(d.appreciationRate)||5),  f:pct, hi:true},
    {l:"Status",        vals:mx.map(({d})=>SL(d.status)),                       txt:true},
  ];
  return (
    <div className="cv-wrap">
      <div className="cv-title">Deal Comparison</div>
      <div className="cv-sub">{sel.length} deals · Values in each deal's native currency</div>
      <div style={{overflowX:"auto"}}>
        <table className="ctbl">
          <thead><tr>
            <th style={{width:130}}>Metric</th>
            {sel.map(d=><th key={d.id} className="dc">
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:11,color:"#ddd6c8",fontWeight:600,textAlign:"center",padding:"0 6px"}}>{d.address}</div>
              <div style={{fontSize:9,color:"#c9a84c",textAlign:"center",marginTop:2}}>{fmtC(d.purchasePrice,d.currency||"USD")}</div>
            </th>)}
          </tr></thead>
          <tbody>
            {rows.map((row,i)=>{
              let bi=-1,wi=-1;
              if (!row.txt) {
                const ns=row.vals.map(v=>parseFloat(v)||0);
                bi=row.hi?ns.indexOf(Math.max(...ns)):ns.indexOf(Math.min(...ns));
                wi=row.hi?ns.indexOf(Math.min(...ns)):ns.indexOf(Math.max(...ns));
                if(ns.every(n=>n===ns[0])){bi=-1;wi=-1;}
              }
              return <tr key={i}>
                <td className="rl">{row.l}</td>
                {row.vals.map((v,j)=>{
                  const cls=j===bi?"best":j===wi?"worst":"";
                  const dv=row.txt?v:(row.f?row.f(v,sel[j]):v);
                  return <td key={j} className={`dv ${cls}`}>{dv}</td>;
                })}
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── SAMPLE DATA ─────────────────────────────────────────────────────────────
const SAMPLE = [
  {id:"1",address:"Marina Gate II, Studio 1204",market:"Dubai, UAE",type:"Apartment — Studio",currency:"AED",purchasePrice:"850000",closingCosts:"38000",downPaymentPct:"25",mortgageRate:"4.5",mortgageTerm:"25",monthlyRent:"6800",serviceCharge:"1100",insurance:"200",mgmtFeePct:"8",maintenance:"300",appreciationRate:"6",status:"review",notes:"Off-plan completion Q4 2025",listingUrl:"",comments:[{id:"c1",author:"Chris",text:"Strong rental demand in Marina. Net yield looks healthy but watch service charges trending up YoY.",score:4,time:"2 days ago"}],aiAnalysis:null},
  {id:"2",address:"Canary Wharf, 2BR E14 5HQ",market:"London, UK",type:"Apartment — 2BR",currency:"GBP",purchasePrice:"620000",closingCosts:"22000",downPaymentPct:"25",mortgageRate:"5.25",mortgageTerm:"25",monthlyRent:"3200",serviceCharge:"450",insurance:"150",mgmtFeePct:"10",maintenance:"200",appreciationRate:"4",status:"review",notes:"Leasehold — 125yr remaining",listingUrl:"",comments:[],aiAnalysis:null},
  {id:"3",address:"Bondi Junction, 1BR Unit 5",market:"Sydney, Australia",type:"Apartment — 1BR",currency:"AUD",purchasePrice:"780000",closingCosts:"35000",downPaymentPct:"20",mortgageRate:"6.2",mortgageTerm:"30",monthlyRent:"3000",serviceCharge:"900",insurance:"180",mgmtFeePct:"8",maintenance:"250",appreciationRate:"5",status:"hold",notes:"Strata levies rising",listingUrl:"",comments:[],aiAnalysis:null},
];

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [deals,   setDeals]   = useState(() => {
    try { const s = localStorage.getItem("dealdesk_deals"); return s ? JSON.parse(s) : SAMPLE; }
    catch { return SAMPLE; }
  });
  const [selId,   setSelId]   = useState(deals[0]?.id || null);
  const [tab,     setTab]     = useState("overview");  // overview | growth | notes | dashboard
  const [cmpMode, setCmpMode] = useState(false);
  const [cmpIds,  setCmpIds]  = useState([]);
  const [modal,   setModal]   = useState(false);
  const [editD,   setEditD]   = useState(null);
  const [aiLoad,  setAiLoad]  = useState(false);
  const [cmt,     setCmt]     = useState({ author:"Chris", text:"", score:4 });
  const [search,  setSearch]  = useState("");
  const streamRef = useRef("");

  // Persist to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem("dealdesk_deals", JSON.stringify(deals)); } catch {}
  }, [deals]);

  const sel = deals.find(d => d.id === selId);
  const upd = useCallback(patch => setDeals(p => p.map(d => d.id === selId ? {...d,...patch} : d)), [selId]);

  const saveDeal = d => {
    setDeals(p => p.find(x=>x.id===d.id) ? p.map(x=>x.id===d.id?d:x) : [...p,d]);
    setSelId(d.id); setModal(false); setEditD(null);
  };

  const toggleCmp = id => setCmpIds(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);

  const filteredDeals = deals.filter(d =>
    !search || d.address.toLowerCase().includes(search.toLowerCase()) || (d.market||"").toLowerCase().includes(search.toLowerCase())
  );

  const runAI = async () => {
    if (!sel) return; setAiLoad(true); streamRef.current = ""; upd({aiAnalysis:""});
    const m = calcMetrics(sel); const c = sel.currency || "USD";
    const prompt = `You are an expert property investment analyst. Appraise this real estate deal concisely but thoroughly.\n\nDEAL: ${sel.address}\nMarket: ${sel.market||"Not specified"}\nType: ${sel.type}\nCurrency: ${c}\nPurchase Price: ${fmtC(sel.purchasePrice,c)}\nDown Payment: ${sel.downPaymentPct}% (${fmtC(m.downAmt,c)})\nTotal Invested (incl. costs): ${fmtC(m.inv,c)}\nMonthly Rent: ${fmtC(sel.monthlyRent,c)}\nGross Yield: ${pct(m.gY)} | Net Yield: ${pct(m.nY)}\nMonthly Cash Flow: ${fmtC(m.cf,c)} | Cash-on-Cash Return: ${pct(m.coc)}\nMortgage: ${sel.mortgageRate}% over ${sel.mortgageTerm} years\nCapital Growth Assumption: ${sel.appreciationRate||5}% p.a.\nMonthly Expenses: ${fmtC(m.exp,c)} (mortgage ${fmtC(m.mo,c)} + service ${fmtC(sel.serviceCharge,c)} + insurance ${fmtC(sel.insurance,c)} + mgmt ${fmtC(m.mgmt,c)} + maintenance ${fmtC(sel.maintenance,c)})\n${sel.notes?`Notes: ${sel.notes}`:""}\n\nWrite a 3-paragraph investment appraisal: (1) yield quality & cash flow analysis for this market (2) key risks & concerns (3) clear verdict. Be direct and investment-focused. End with exactly: "VERDICT: [Buy/Watch/Pass] — [one sentence reason]"`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:650,stream:true,messages:[{role:"user",content:prompt}]})});
      const reader = res.body.getReader(); const dec = new TextDecoder();
      while(true){ const{done,value}=await reader.read(); if(done) break;
        for(const line of dec.decode(value).split("\n").filter(l=>l.startsWith("data: "))){
          try{const j=JSON.parse(line.slice(6));if(j.type==="content_block_delta"&&j.delta?.text){streamRef.current+=j.delta.text;setDeals(p=>p.map(d=>d.id===selId?{...d,aiAnalysis:streamRef.current}:d));}}catch{}}}
    } catch { upd({aiAnalysis:"Analysis unavailable. Please try again."}); }
    setAiLoad(false);
  };

  const addCmt = () => {
    if(!cmt.text.trim()||!sel) return;
    upd({comments:[...(sel.comments||[]),{id:String(Date.now()),author:cmt.author||"Anonymous",text:cmt.text,score:cmt.score,time:"just now"}]});
    setCmt(p=>({...p,text:""}));
  };

  const m = sel ? calcMetrics(sel) : null;
  const g = m   ? dealGrade(m)     : null;
  const c = sel?.currency || "USD";

  const expPieData = m && sel ? [
    {name:"Mortgage",    value:Math.round(m.mo)},
    {name:"Service",     value:Math.round(m.svc)},
    {name:"Insurance",   value:Math.round(m.ins)},
    {name:"Mgmt Fee",    value:Math.round(m.mgmt)},
    {name:"Maintenance", value:Math.round(m.maint)},
  ].filter(x=>x.value>0) : [];

  // Overview tab content
  const OverviewContent = () => (
    <div className="sv">
      <div className="dh">
        <div className="dh-l">
          <div className="addr">{sel.address}</div>
          <div className="dtag">{sel.type} · {sel.market} · {CURRENCIES[c]?.flag} {c}
            {sel.listingUrl && <> · <a href={sel.listingUrl} target="_blank" rel="noopener" className="listing-link">View Listing ↗</a></>}
          </div>
          {sel.notes && <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#4a5568",marginTop:5,fontStyle:"italic"}}>📝 {sel.notes}</div>}
        </div>
        <div className="dh-r">
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span className="grade-badge" style={{background:g.bg,color:g.col,borderColor:g.col+"44"}}>Grade {g.grade} · {g.label}</span>
            <select className="inp" style={{width:"auto",fontSize:9,padding:"5px 7px"}} value={sel.status} onChange={e=>upd({status:e.target.value})}>
              {STATUSES.map(x=><option key={x.v} value={x.v}>{x.l}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn-cancel" style={{fontSize:9,padding:"4px 9px"}} onClick={()=>{setEditD(sel);setModal(true);}}>Edit</button>
            <button className="del-btn" onClick={()=>{const r=deals.filter(d=>d.id!==selId);setDeals(r);setSelId(r[0]?.id||null);}}>✕ Remove</button>
          </div>
        </div>
      </div>

      <div className="sh">Returns</div>
      <div className="mg4" style={{marginBottom:16}}>
        <div className="mc"><div className="ml">Gross Yield</div><div className="mv gold">{pct(m.gY)}</div><div className="ms">Annual rent / price</div></div>
        <div className="mc"><div className="ml">Net Yield</div><div className={`mv ${m.nY>=5?"green":m.nY>=3?"gold":"red"}`}>{pct(m.nY)}</div><div className="ms">After running costs</div></div>
        <div className="mc"><div className="ml">Cash-on-Cash</div><div className={`mv ${m.coc>=6?"green":m.coc>=3?"gold":"red"}`}>{pct(m.coc)}</div><div className="ms">Annual cash / invested</div></div>
        <div className="mc"><div className="ml">Monthly Cash Flow</div><div className={`mv ${m.cf>=0?"green":"red"}`}>{m.cf>=0?"+":""}{fmtC(m.cf,c)}</div><div className="ms">Rent minus all expenses</div></div>
        <div className="mc"><div className="ml">Purchase Price</div><div className="mv">{fmtC(sel.purchasePrice,c)}</div></div>
        <div className="mc"><div className="ml">Total Invested</div><div className="mv">{fmtC(m.inv,c)}</div><div className="ms">Down + closing costs</div></div>
        <div className="mc"><div className="ml">Monthly Mortgage</div><div className="mv">{fmtC(m.mo,c)}</div><div className="ms">{sel.mortgageRate}% / {sel.mortgageTerm}yr</div></div>
        <div className="mc"><div className="ml">Total Expenses/mo</div><div className="mv">{fmtC(m.exp,c)}</div></div>
      </div>

      <div className="two">
        <div>
          <div className="sh">Acquisition</div>
          <div className="ig">
            {[["purchasePrice","Purchase Price"],["closingCosts","Closing / Stamp Duty"],["downPaymentPct","Down Payment %"],["mortgageRate","Rate %"],["mortgageTerm","Term (yrs)"]].map(([k,l])=>(
              <div className="inp-g" key={k}><div className="inp-l">{l}</div>
                <input className="inp" type="number" value={sel[k]||""} onChange={e=>upd({[k]:e.target.value})}/></div>
            ))}
          </div>
        </div>
        <div>
          <div className="sh">Income & Expenses / Month</div>
          <div className="ig">
            {[["monthlyRent","Rent"],["serviceCharge","Service / Strata"],["insurance","Insurance"],["mgmtFeePct","Mgmt Fee %"],["maintenance","Maintenance"]].map(([k,l])=>(
              <div className="inp-g" key={k}><div className="inp-l">{l}</div>
                <input className="inp" type="number" value={sel[k]||""} onChange={e=>upd({[k]:e.target.value})}/></div>
            ))}
          </div>
        </div>
      </div>

      {expPieData.length > 0 && (
        <>
          <div className="sh">Expense Breakdown</div>
          <div className="chart-box" style={{padding:12,marginBottom:18}}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={expPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={2} dataKey="value"
                  label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={{stroke:"#2a3448"}}
                  style={{fontFamily:"IBM Plex Mono",fontSize:8,fill:"#4a5568"}}>
                  {expPieData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} formatter={v=>fmtC(v,c)}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div className="sh">AI Analysis</div>
      <div className="ai-panel">
        <div className="ai-hdr">
          <div className="ai-lbl"><div className="ai-dot"/>Claude Investment Analyst</div>
          <button className="btn-ai" onClick={runAI} disabled={aiLoad}>{aiLoad?"Analysing…":"Run Analysis"}</button>
        </div>
        <div className="ai-body">
          {aiLoad && !sel.aiAnalysis
            ? <div style={{color:"#3a4a5e",fontFamily:"'IBM Plex Mono',monospace",fontSize:11}}>Analysing deal…</div>
            : sel.aiAnalysis
              ? <div style={{whiteSpace:"pre-wrap"}}>{sel.aiAnalysis}</div>
              : <div className="ai-ph">Click "Run Analysis" for an AI appraisal contextualised to this market.</div>}
        </div>
      </div>
    </div>
  );

  // Notes tab
  const NotesContent = () => (
    <div className="sv">
      <div className="sh">Collaboration Notes ({(sel.comments||[]).length})</div>
      <div style={{marginBottom:12}}>
        {(sel.comments||[]).map(cm=>(
          <div key={cm.id} className="cmt-card">
            <div className="cmt-meta"><span className="cmt-auth">{cm.author}</span><span className="cmt-time">{cm.time}</span></div>
            <div className="cmt-txt">{cm.text}</div>
            {cm.score&&<div style={{marginTop:6}}><Stars v={cm.score}/></div>}
          </div>
        ))}
        {!(sel.comments||[]).length && <div style={{color:"#2a3448",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,padding:"16px 0"}}>No notes yet — add the first one below.</div>}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        <input className="inp-name" placeholder="Your name" value={cmt.author} onChange={e=>setCmt(p=>({...p,author:e.target.value}))}/>
        <textarea className="ta" rows={3} placeholder="Add notes, concerns, or observations about this deal…" value={cmt.text} onChange={e=>setCmt(p=>({...p,text:e.target.value}))}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:8,color:"#3a4a5e",textTransform:"uppercase",letterSpacing:".08em"}}>Score</span>
            <Stars v={cmt.score} onChange={v=>setCmt(p=>({...p,score:v}))}/>
          </div>
          <button className="btn-post" onClick={addCmt}>Post Note</button>
        </div>
      </div>
    </div>
  );

  const mainContent = () => {
    if (tab === "dashboard") return <Dashboard deals={deals}/>;
    if (cmpMode)             return <CompareView deals={deals} cmpIds={cmpIds}/>;
    if (!sel)                return (
      <div className="m-empty">
        <div className="empty-i">◈</div>
        <div className="empty-t">No deal selected</div>
        <div className="empty-s">Pick a deal from the sidebar or add one</div>
      </div>
    );
    if (tab === "growth") return <GrowthTab deal={sel} onUpdate={upd}/>;
    if (tab === "notes")  return <NotesContent/>;
    return <OverviewContent/>;
  };

  const dealTabs = sel && !cmpMode ? [
    {k:"overview",l:"Overview"},
    {k:"growth",  l:"Growth"},
    {k:"notes",   l:`Notes (${(sel.comments||[]).length})`},
  ] : [];

  return (
    <>
      <style>{CSS}</style>
      <div className="app">

        {/* SIDEBAR */}
        <div className="sb">
          <div className="sb-head">
            <div className="logo"><div className="logo-i">◈</div>DealDesk</div>
            <div className="logo-sub">Property Investment Appraisal</div>
          </div>
          <div className="sb-search">
            <input className="search-inp" placeholder="Search deals…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div className="sb-acts">
            <button className="btn-add" onClick={()=>{setEditD(null);setModal(true);}}>+ Add</button>
            <button className={`btn-sm ${tab==="dashboard"&&!cmpMode?"on":""}`}
              onClick={()=>{setTab("dashboard");setCmpMode(false);}}>Dashboard</button>
            <button className={`btn-sm ${cmpMode?"on":""}`}
              onClick={()=>{setCmpMode(p=>!p);if(!cmpMode)setTab("overview");}}>
              {cmpMode?"✓ Cmp":"⇄ Cmp"}
            </button>
          </div>
          <div className="dl">
            {filteredDeals.length === 0 && (
              <div style={{padding:"20px 10px",textAlign:"center",color:"#2a3448",fontFamily:"'IBM Plex Mono',monospace",fontSize:11}}>No deals match</div>
            )}
            {filteredDeals.map(d => {
              const dm = calcMetrics(d); const dc = d.currency||"USD"; const dg = dealGrade(dm);
              return (
                <div key={d.id} className={`di ${d.id===selId&&!cmpMode&&tab!=="dashboard"?"act":""}`}
                  onClick={()=>{if(!cmpMode){setSelId(d.id);if(tab==="dashboard")setTab("overview");}}}>
                  {cmpMode
                    ? <div className={`cmp-chk ${cmpIds.includes(d.id)?"on":""}`}
                        onClick={e=>{e.stopPropagation();toggleCmp(d.id);}}>
                        {cmpIds.includes(d.id)?"✓":""}
                      </div>
                    : <div className="grade-pill" style={{background:dg.bg,color:dg.col,border:`1px solid ${dg.col}33`}}>{dg.grade}</div>
                  }
                  <div className="di-addr">{d.address}</div>
                  <div className="di-mkt">{d.market||d.type}</div>
                  <div className="di-row">
                    <div className="di-price">{fmtC(d.purchasePrice,dc)}</div>
                    <div className={`badge badge-${d.status}`}>{SL(d.status)}</div>
                  </div>
                  <div className="di-yields">Net {pct(dm.nY)} · CoC {pct(dm.coc)} · CF {dm.cf>=0?"+":""}{fmtC(dm.cf,dc)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* MAIN */}
        <div className="main">
          <div className="main-nav">
            <div className="nav-tabs">
              {dealTabs.map(t=>(
                <button key={t.k} className={`tab ${tab===t.k?"on":""}`} onClick={()=>setTab(t.k)}>{t.l}</button>
              ))}
              {cmpMode && <div className="nav-info">{cmpIds.length} deal{cmpIds.length!==1?"s":""} selected</div>}
              {tab==="dashboard" && !cmpMode && <div className="nav-info">Portfolio · {deals.length} deal{deals.length!==1?"s":""}</div>}
            </div>
            <div className="nav-r">
              {!cmpMode && sel && tab!=="dashboard" && (
                <button className="btn-pdf" onClick={()=>exportPDF(sel)}>⬇ PDF</button>
              )}
              {deals.length > 0 && (
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#2a3448"}}>
                  {deals.length} deal{deals.length!==1?"s":""} saved locally
                </div>
              )}
            </div>
          </div>
          {mainContent()}
        </div>
      </div>
      {modal && <DealModal deal={editD} onSave={saveDeal} onClose={()=>{setModal(false);setEditD(null);}}/>}
    </>
  );
}
