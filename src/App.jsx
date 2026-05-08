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
const pct  = n => `${Number(n).toFixed(2)}%`;
const pct1 = n => `${Number(n).toFixed(1)}%`;

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
  const score = (m.nY>=7?3:m.nY>=5?2:m.nY>=3?1:0)
              + (m.coc>=8?3:m.coc>=5?2:m.coc>=2?1:0)
              + (m.cf>=500?2:m.cf>=0?1:0);
  if (score>=7) return { grade:"A", label:"Strong Buy", col:"#166534", bg:"#dcfce7", border:"#86efac" };
  if (score>=5) return { grade:"B", label:"Buy",        col:"#14532d", bg:"#f0fdf4", border:"#4ade80" };
  if (score>=3) return { grade:"C", label:"Watch",      col:"#713f12", bg:"#fefce8", border:"#fde047" };
  return          { grade:"D", label:"Pass",            col:"#7f1d1d", bg:"#fef2f2", border:"#fca5a5" };
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
  const g = dealGrade(m); const grw = calcGrowth(deal);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${deal.address}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',sans-serif;background:#fff;color:#0f172a;padding:40px;font-size:11px;line-height:1.5;}
h1{font-family:'Playfair Display',serif;font-size:24px;color:#0f172a;margin-bottom:4px;}
.sub{color:#64748b;font-size:10px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px;}
.grade{display:inline-block;padding:4px 12px;border-radius:4px;font-size:10px;font-weight:600;margin-bottom:20px;border:1px solid;}
.st{font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;padding-bottom:5px;margin:18px 0 10px;}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;}
.card{border:1px solid #e2e8f0;border-radius:6px;padding:12px;background:#f8fafc;}
.cl{font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;}
.cv{font-size:16px;font-weight:600;color:#0f172a;}
.cv.amber{color:#92400e;}.cv.green{color:#166534;}.cv.red{color:#991b1b;}
table{width:100%;border-collapse:collapse;font-size:10px;}
th{background:#f8fafc;padding:7px 10px;text-align:left;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;}
td{padding:7px 10px;border-bottom:1px solid #f1f5f9;}
.ai{background:#fffbeb;border-left:3px solid #d97706;padding:14px;font-size:12px;line-height:1.75;color:#44403c;white-space:pre-wrap;margin-top:4px;}
.cm{border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin-bottom:8px;}
.ca{font-size:9px;color:#92400e;font-weight:600;margin-bottom:5px;}
.ct{font-size:11px;color:#475569;line-height:1.6;}
.foot{margin-top:30px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;display:flex;justify-content:space-between;}
</style></head><body>
<h1>${deal.address}</h1>
<div class="sub">${deal.type||""} · ${deal.market||""} · ${c}</div>
<div class="grade" style="background:${g.bg};color:${g.col};border-color:${g.border}">Grade ${g.grade} — ${g.label}</div>
<div class="st">Key Returns</div>
<div class="g4">
<div class="card"><div class="cl">Gross Yield</div><div class="cv amber">${pct(m.gY)}</div></div>
<div class="card"><div class="cl">Net Yield</div><div class="cv ${m.nY>=5?"green":m.nY>=3?"amber":"red"}">${pct(m.nY)}</div></div>
<div class="card"><div class="cl">Cash-on-Cash</div><div class="cv ${m.coc>=6?"green":m.coc>=3?"amber":"red"}">${pct(m.coc)}</div></div>
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

// ─── STYLES (LIGHT THEME) ────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',sans-serif;background:#f1f5f9;color:#0f172a;}
::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:#f1f5f9;}::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px;}
::-webkit-scrollbar-thumb:hover{background:#94a3b8;}
.app{display:flex;height:100vh;overflow:hidden;background:#f1f5f9;}

/* ── SIDEBAR ── */
.sb{width:290px;min-width:290px;background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;overflow:hidden;box-shadow:1px 0 0 #e2e8f0;}
.sb-head{padding:20px 18px 14px;border-bottom:1px solid #f1f5f9;}
.logo{font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:10px;}
.logo-i{width:32px;height:32px;background:linear-gradient(135deg,#d97706,#92400e);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff;font-weight:700;font-family:'Playfair Display',serif;}
.logo-sub{font-size:10px;color:#94a3b8;letter-spacing:.08em;text-transform:uppercase;margin-top:2px;}
.sb-search{padding:10px 14px;border-bottom:1px solid #f1f5f9;}
.search-inp{width:100%;background:#f8fafc;border:1px solid #e2e8f0;color:#0f172a;font-family:'Inter',sans-serif;font-size:13px;padding:8px 12px;border-radius:7px;outline:none;transition:border-color .15s;}
.search-inp:focus{border-color:#d97706;box-shadow:0 0 0 3px #d9770620;}
.search-inp::placeholder{color:#94a3b8;}
.sb-acts{padding:10px 14px;border-bottom:1px solid #f1f5f9;display:flex;gap:7px;}
.btn-add{flex:1;padding:8px 12px;background:#d97706;color:#fff;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;letter-spacing:.02em;border:none;border-radius:7px;cursor:pointer;transition:background .15s;}
.btn-add:hover{background:#b45309;}
.btn-sm{padding:7px 11px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-family:'Inter',sans-serif;font-size:12px;border-radius:7px;cursor:pointer;transition:all .15s;white-space:nowrap;font-weight:500;}
.btn-sm.on{border-color:#d97706;color:#92400e;background:#fffbeb;}
.btn-sm:hover{border-color:#94a3b8;color:#0f172a;background:#f1f5f9;}
.dl{flex:1;overflow-y:auto;padding:8px;}
.di{padding:12px;border-radius:8px;margin-bottom:4px;cursor:pointer;border:1px solid transparent;transition:all .15s;position:relative;background:transparent;}
.di:hover{background:#f8fafc;border-color:#e2e8f0;}
.di.act{background:#fffbeb;border-color:#fcd34d;}
.di-addr{font-family:'Playfair Display',serif;font-size:13px;color:#0f172a;font-weight:600;line-height:1.3;padding-right:26px;}
.di-mkt{font-size:11px;color:#94a3b8;margin-top:3px;font-family:'Inter',sans-serif;}
.di-row{display:flex;justify-content:space-between;align-items:center;margin-top:7px;}
.di-price{font-family:'IBM Plex Mono',monospace;font-size:12px;color:#0f172a;font-weight:500;}
.badge{font-size:10px;font-family:'Inter',sans-serif;padding:2px 8px;border-radius:4px;font-weight:500;}
.badge-review{background:#dcfce7;color:#166534;}.badge-hold{background:#fef3c7;color:#92400e;}
.badge-pass{background:#fee2e2;color:#991b1b;}.badge-new{background:#dbeafe;color:#1e40af;}
.di-yields{font-family:'IBM Plex Mono',monospace;font-size:10px;color:#94a3b8;margin-top:5px;}
.grade-pill{position:absolute;top:10px;right:10px;font-family:'Inter',sans-serif;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;border:1px solid;}
.cmp-chk{position:absolute;top:10px;right:10px;width:18px;height:18px;border:2px solid #cbd5e1;border-radius:4px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;color:#d97706;transition:all .15s;}
.cmp-chk.on{background:#fffbeb;border-color:#d97706;}

/* ── MAIN ── */
.main{flex:1;overflow:hidden;display:flex;flex-direction:column;}
.main-nav{padding:0 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;background:#fff;min-height:50px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
.nav-tabs{display:flex;gap:0;}
.tab{font-family:'Inter',sans-serif;font-size:12px;font-weight:500;padding:16px 16px;border-bottom:2px solid transparent;cursor:pointer;color:#64748b;background:transparent;border-left:none;border-right:none;border-top:none;transition:all .15s;}
.tab.on{color:#92400e;border-bottom-color:#d97706;}
.tab:hover:not(.on){color:#0f172a;}
.nav-r{display:flex;gap:8px;align-items:center;}
.nav-info{font-family:'Inter',sans-serif;font-size:11px;color:#94a3b8;}
.btn-pdf{background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;padding:7px 14px;border-radius:7px;cursor:pointer;transition:all .15s;}
.btn-pdf:hover{border-color:#d97706;color:#92400e;background:#fffbeb;}
.m-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;}
.empty-i{font-size:40px;opacity:.2;}.empty-t{font-family:'Playfair Display',serif;font-size:18px;color:#64748b;}.empty-s{font-size:13px;color:#94a3b8;}

/* ── SCROLLABLE VIEWS ── */
.sv{flex:1;overflow-y:auto;padding:24px 28px;}

/* ── SECTION HEADER ── */
.sh{font-family:'Inter',sans-serif;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:8px;}
.sh::after{content:'';flex:1;height:1px;background:#e2e8f0;}

/* ── METRIC CARDS ── */
.mg4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px;}
.mc{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
.ml{font-family:'Inter',sans-serif;font-size:10px;font-weight:600;color:#94a3b8;letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px;}
.mv{font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:500;color:#0f172a;}
.mv.amber{color:#92400e;}.mv.green{color:#166534;}.mv.red{color:#991b1b;}.mv.blue{color:#1e40af;}
.ms{font-family:'Inter',sans-serif;font-size:10px;color:#94a3b8;margin-top:3px;}

/* ── INPUTS ── */
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;}
.ig{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.inp-g{display:flex;flex-direction:column;gap:4px;}
.inp-l{font-family:'Inter',sans-serif;font-size:11px;font-weight:500;color:#475569;}
.inp{background:#fff;border:1px solid #e2e8f0;color:#0f172a;font-family:'IBM Plex Mono',monospace;font-size:13px;padding:8px 10px;border-radius:7px;outline:none;transition:all .15s;width:100%;}
.inp:focus{border-color:#d97706;box-shadow:0 0 0 3px #d9770615;}
select.inp{cursor:pointer;color:#0f172a;font-family:'Inter',sans-serif;font-size:13px;}

/* ── DEAL HEADER ── */
.dh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid #f1f5f9;}
.dh-l .addr{font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:#0f172a;line-height:1.2;max-width:480px;}
.dh-l .dtag{font-family:'Inter',sans-serif;font-size:11px;color:#94a3b8;margin-top:5px;letter-spacing:.04em;}
.dh-r{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;margin-left:16px;}
.btn-edit{background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;padding:6px 12px;border-radius:6px;cursor:pointer;transition:all .15s;}
.btn-edit:hover{border-color:#94a3b8;color:#0f172a;}
.del-btn{background:transparent;border:none;color:#fca5a5;font-size:12px;cursor:pointer;padding:5px 8px;font-family:'Inter',sans-serif;border-radius:5px;transition:all .15s;}
.del-btn:hover{background:#fee2e2;color:#991b1b;}
.grade-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:6px;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;border:1px solid;}

/* ── CHART BOX ── */
.chart-box{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);}

/* ── AI PANEL ── */
.ai-panel{background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
.ai-hdr{padding:12px 16px;background:#fffbeb;border-bottom:1px solid #fde68a;display:flex;align-items:center;justify-content:space-between;}
.ai-lbl{font-family:'Inter',sans-serif;font-size:11px;font-weight:600;color:#92400e;letter-spacing:.04em;text-transform:uppercase;display:flex;align-items:center;gap:8px;}
.ai-dot{width:7px;height:7px;border-radius:50%;background:#d97706;animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.5;transform:scale(.85);}}
.btn-ai{background:#d97706;border:none;color:#fff;font-family:'Inter',sans-serif;font-size:11px;font-weight:600;padding:6px 14px;border-radius:6px;cursor:pointer;transition:background .15s;}
.btn-ai:hover{background:#b45309;}.btn-ai:disabled{background:#fcd34d;cursor:not-allowed;color:#92400e;}
.ai-body{padding:18px;min-height:80px;font-size:14px;line-height:1.8;color:#374151;}
.ai-ph{color:#94a3b8;font-style:italic;font-size:13px;font-family:'Inter',sans-serif;}

/* ── SOURCE IMPORT PANEL ── */
.source-panel{background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
.source-hdr{padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;}
.source-lbl{font-family:'Inter',sans-serif;font-size:11px;font-weight:600;color:#475569;letter-spacing:.04em;text-transform:uppercase;display:flex;align-items:center;gap:8px;}
.source-body{padding:16px;}
.source-tabs{display:flex;gap:4px;margin-bottom:14px;}
.src-tab{padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:#64748b;cursor:pointer;transition:all .15s;}
.src-tab.on{background:#fffbeb;border-color:#d97706;color:#92400e;}
.src-tab:hover:not(.on){background:#f8fafc;color:#0f172a;}
.upload-zone{border:2px dashed #e2e8f0;border-radius:10px;padding:28px;text-align:center;cursor:pointer;transition:all .15s;background:#f8fafc;}
.upload-zone:hover{border-color:#d97706;background:#fffbeb;}
.upload-zone.has-file{border-color:#d97706;background:#fffbeb;}
.upload-icon{font-size:28px;margin-bottom:8px;}
.upload-text{font-family:'Inter',sans-serif;font-size:13px;color:#475569;font-weight:500;}
.upload-sub{font-family:'Inter',sans-serif;font-size:11px;color:#94a3b8;margin-top:3px;}
.upload-fname{font-family:'IBM Plex Mono',monospace;font-size:12px;color:#92400e;font-weight:500;margin-top:6px;}
.url-row{display:flex;gap:8px;}
.url-inp{flex:1;background:#f8fafc;border:1px solid #e2e8f0;color:#0f172a;font-family:'Inter',sans-serif;font-size:13px;padding:9px 12px;border-radius:7px;outline:none;transition:all .15s;}
.url-inp:focus{border-color:#d97706;box-shadow:0 0 0 3px #d9770615;}
.url-inp::placeholder{color:#94a3b8;}
.btn-import{background:#0f172a;border:none;color:#fff;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;padding:9px 16px;border-radius:7px;cursor:pointer;transition:background .15s;white-space:nowrap;}
.btn-import:hover{background:#1e293b;}.btn-import:disabled{background:#94a3b8;cursor:not-allowed;}
.import-status{margin-top:10px;font-family:'Inter',sans-serif;font-size:12px;color:#64748b;padding:8px 12px;background:#f1f5f9;border-radius:6px;display:flex;align-items:center;gap:8px;}
.import-status.ok{background:#dcfce7;color:#166534;}
.import-status.err{background:#fee2e2;color:#991b1b;}

/* ── SCENARIO ── */
.sc-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;}
.sc-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
.sc-hdr{font-family:'Inter',sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;}
.sc-rate{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:500;color:#64748b;}
.sc-row{margin-bottom:10px;}
.sc-label{font-family:'Inter',sans-serif;font-size:10px;font-weight:500;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;}
.sc-val{font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:500;}

/* ── GROWTH TABLE ── */
.gtbl{width:100%;border-collapse:collapse;font-family:'IBM Plex Mono',monospace;font-size:12px;}
.gtbl th{font-family:'Inter',sans-serif;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:left;background:#f8fafc;}
.gtbl td{padding:9px 12px;border-bottom:1px solid #f1f5f9;color:#0f172a;}
.gtbl tr:hover td{background:#f8fafc;}

/* ── COMPARE ── */
.cv-wrap{flex:1;overflow:auto;padding:24px 28px;}
.cv-title{font-family:'Playfair Display',serif;font-size:20px;color:#0f172a;margin-bottom:3px;}
.cv-sub{font-family:'Inter',sans-serif;font-size:12px;color:#94a3b8;margin-bottom:18px;}
.ctbl{border-collapse:collapse;min-width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);}
.ctbl th{font-family:'Inter',sans-serif;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;padding:10px 14px;border-bottom:2px solid #e2e8f0;white-space:nowrap;background:#f8fafc;}
.ctbl th.dc{min-width:170px;text-align:center;}
.ctbl td{padding:10px 14px;border-bottom:1px solid #f1f5f9;font-family:'IBM Plex Mono',monospace;font-size:12px;color:#0f172a;}
.ctbl td.rl{color:#94a3b8;font-family:'Inter',sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;}
.ctbl td.dv{text-align:center;}
.ctbl td.best{color:#166534;background:#f0fdf4;font-weight:600;}
.ctbl td.worst{color:#991b1b;background:#fef2f2;}
.ctbl tr:hover td{background:#f8fafc;}

/* ── NOTES ── */
.cmt-card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:8px;box-shadow:0 1px 2px rgba(0,0,0,.04);}
.cmt-meta{display:flex;justify-content:space-between;margin-bottom:7px;}
.cmt-auth{font-family:'Inter',sans-serif;font-size:12px;color:#92400e;font-weight:600;}
.cmt-time{font-family:'Inter',sans-serif;font-size:11px;color:#94a3b8;}
.cmt-txt{font-size:14px;color:#374151;line-height:1.6;}
.star{color:#e2e8f0;font-size:12px;cursor:pointer;transition:color .1s;}.star.on{color:#d97706;}
.inp-name{width:150px;background:#fff;border:1px solid #e2e8f0;color:#0f172a;font-family:'Inter',sans-serif;font-size:13px;padding:8px 10px;border-radius:7px;outline:none;}
.inp-name:focus{border-color:#d97706;box-shadow:0 0 0 3px #d9770615;}
.ta{flex:1;background:#fff;border:1px solid #e2e8f0;color:#0f172a;font-family:'Inter',sans-serif;font-size:14px;padding:10px;border-radius:7px;outline:none;resize:none;line-height:1.5;transition:all .15s;}
.ta:focus{border-color:#d97706;box-shadow:0 0 0 3px #d9770615;}
.btn-post{background:#0f172a;border:none;color:#fff;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;padding:8px 16px;border-radius:7px;cursor:pointer;transition:background .15s;}
.btn-post:hover{background:#1e293b;}

/* ── MODAL ── */
.mo{position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:100;padding:16px;backdrop-filter:blur(2px);}
.md{background:#fff;border-radius:12px;width:100%;max-width:620px;padding:26px;max-height:93vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);}
.md-title{font-family:'Playfair Display',serif;font-size:20px;color:#0f172a;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #f1f5f9;}
.md-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;}
.md-full{grid-column:1/-1;}
.md-div{font-family:'Inter',sans-serif;font-size:10px;font-weight:600;color:#94a3b8;letter-spacing:.1em;text-transform:uppercase;padding:6px 0 2px;border-bottom:1px solid #f1f5f9;margin-bottom:8px;grid-column:1/-1;}
.md-acts{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid #f1f5f9;}
.btn-cancel{background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;padding:8px 16px;border-radius:7px;cursor:pointer;transition:all .15s;}
.btn-cancel:hover{border-color:#94a3b8;color:#0f172a;}
.btn-save{background:#d97706;border:none;color:#fff;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;padding:8px 18px;border-radius:7px;cursor:pointer;transition:background .15s;}
.btn-save:hover{background:#b45309;}

/* ── DASHBOARD ── */
.db-wrap{flex:1;overflow-y:auto;padding:24px 28px;}
.db-hero{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px;}
.db-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);}
.db-label{font-family:'Inter',sans-serif;font-size:10px;font-weight:600;color:#94a3b8;letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px;}
.db-val{font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:500;color:#0f172a;}
.db-val.amber{color:#92400e;}.db-val.green{color:#166534;}.db-val.blue{color:#1e40af;}
.db-sub{font-family:'Inter',sans-serif;font-size:10px;color:#94a3b8;margin-top:2px;}
.db-two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;}

/* ── PIE LABEL ── */
.recharts-label{font-size:9px !important;}

/* ── TOOLTIP ── */
.tt{background:#fff !important;border:1px solid #e2e8f0 !important;border-radius:8px !important;box-shadow:0 4px 12px rgba(0,0,0,.1) !important;font-family:'Inter',sans-serif !important;font-size:12px !important;color:#0f172a !important;}

/* ── LISTING LINK ── */
.link{color:#1d4ed8;font-size:11px;text-decoration:none;font-family:'Inter',sans-serif;}
.link:hover{text-decoration:underline;}

/* ── NOTES ── */
.notes-note{display:inline-flex;align-items:center;gap:5px;background:#fffbeb;border:1px solid #fde68a;border-radius:5px;padding:3px 9px;font-family:'Inter',sans-serif;font-size:11px;color:#92400e;margin-top:5px;}

@keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
.url-inp{background:#f8fafc;border:1px solid #e2e8f0;color:#0f172a;font-family:'Inter',sans-serif;font-size:13px;padding:9px 12px;border-radius:7px;outline:none;transition:all .15s;}
.url-inp:focus{border-color:#d97706;box-shadow:0 0 0 3px #d9770615;}
.url-inp::placeholder{color:#94a3b8;}
.btn-import{background:#0f172a;border:none;color:#fff;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;padding:9px 16px;border-radius:7px;cursor:pointer;transition:background .15s;white-space:nowrap;}
.btn-import:hover{background:#1e293b;}.btn-import:disabled{background:#94a3b8;cursor:not-allowed;}
@media(max-width:900px){
  .mg4{grid-template-columns:1fr 1fr;}
  .db-hero{grid-template-columns:repeat(2,1fr);}
  .sc-grid{grid-template-columns:1fr;}
  .two{grid-template-columns:1fr;}
  .db-two{grid-template-columns:1fr;}
}
`;

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const DEAL_TYPES=["Apartment — Studio","Apartment — 1BR","Apartment — 2BR","Apartment — 3BR","Apartment — 4BR+","Villa — 3BR","Villa — 4BR","Villa — 5BR+","Townhouse","Commercial","Land","Other"];
const STATUSES=[{v:"new",l:"New Lead"},{v:"review",l:"Under Review"},{v:"hold",l:"Hold"},{v:"pass",l:"Pass"}];
const SL = id => STATUSES.find(s=>s.v===id)?.l||id;
const PIE_COLORS=["#d97706","#3b82f6","#10b981","#f97316","#8b5cf6"];
const TT_STYLE={background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,fontFamily:"Inter,sans-serif",fontSize:11,color:"#0f172a",boxShadow:"0 4px 12px rgba(0,0,0,.1)"};

// ─── MICRO ───────────────────────────────────────────────────────────────────
function Stars({ v, onChange }) {
  return <div style={{display:"flex",gap:3}}>{[1,2,3,4,5].map(i=>(
    <span key={i} className={`star ${i<=v?"on":""}`} onClick={()=>onChange&&onChange(i)}>★</span>
  ))}</div>;
}

// ─── SOURCE IMPORT PANEL ─────────────────────────────────────────────────────
// Calls Anthropic API directly. PDF path is reliable. URL path uses web_search
// tool — works best for open/indexed pages; many major portals (Rightmove,
// Domain, Bayut) block scrapers so Claude searches for cached/indexed data
// rather than loading the raw page. Results will vary by portal.

async function callClaude(body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    // Surface the actual API error message
    const msg = data?.error?.message || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  if (data.type === "error") {
    throw new Error(data.error?.message || "Unknown API error");
  }
  return data;
}

// Extract all text blocks from a response, handling tool_use multi-turn
function extractText(data) {
  if (!data?.content) return "";
  return data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();
}

// For URL mode we may need to continue the conversation after tool_use turns
async function runWithWebSearch(messages, maxTurns = 4) {
  let msgs = [...messages];
  let lastData = null;

  for (let i = 0; i < maxTurns; i++) {
    const data = await callClaude({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: msgs,
    });
    lastData = data;

    if (data.stop_reason === "end_turn") break;

    // If the model used a tool, add its response and continue
    if (data.stop_reason === "tool_use") {
      const toolUseBlocks = data.content.filter(b => b.type === "tool_use");
      if (!toolUseBlocks.length) break;
      // Add assistant turn
      msgs.push({ role: "assistant", content: data.content });
      // Add tool results (web_search returns results automatically in this env)
      msgs.push({
        role: "user",
        content: toolUseBlocks.map(tb => ({
          type: "tool_result",
          tool_use_id: tb.id,
          content: tb.input?.query
            ? `Web search completed for: "${tb.input.query}". Results have been retrieved.`
            : "Web search completed.",
        })),
      });
    } else {
      break;
    }
  }
  return lastData;
}

function parseFieldsJson(fullText) {
  const marker = "FIELDS_JSON:";
  const idx = fullText.lastIndexOf(marker);
  if (idx === -1) return { analysis: fullText, fields: null };
  const analysis = fullText.slice(0, idx).trim();
  let fields = null;
  try {
    const raw = fullText.slice(idx + marker.length).trim().replace(/```json|```/g, "");
    fields = JSON.parse(raw);
  } catch {}
  return { analysis, fields };
}

function SourceImportPanel({ deal, onAnalysisComplete, onFieldsExtracted }) {
  const [srcTab,  setSrcTab]  = useState("pdf");
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfB64,  setPdfB64]  = useState(null);
  const [url,     setUrl]     = useState(deal?.listingUrl || "");
  const [loading, setLoading] = useState(false);
  const [status,  setStatus]  = useState(null);
  const [logLines,setLogLines]= useState([]);
  const fileRef = useRef();

  const log = msg => setLogLines(p => [...p, msg]);

  const handleFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 30 * 1024 * 1024) {
      setStatus({ ok:false, msg:`PDF is ${(f.size/1024/1024).toFixed(1)} MB — please use a file under 30 MB.` });
      return;
    }
    setPdfFile(f); setPdfB64(null); setStatus(null); setLogLines([]);
    const reader = new FileReader();
    reader.onload = ev => setPdfB64(ev.target.result.split(",")[1]);
    reader.onerror = () => setStatus({ ok:false, msg:"Failed to read file. Please try again." });
    reader.readAsDataURL(f);
  };

  const run = async () => {
    setLoading(true); setStatus(null); setLogLines([]);
    const c   = deal?.currency || "USD";
    const mkt = deal?.market   || "the relevant market";

    const FIELDS_TEMPLATE = `{"address":"","market":"","type":"","currency":"${c}","purchasePrice":"","monthlyRent":"","serviceCharge":"","closingCosts":""}`;
    const FIELDS_INSTRUCTION = `\n\nFinally, on a completely new line, write exactly: FIELDS_JSON: then immediately the JSON object (no markdown fences, no extra text):\nFIELDS_JSON:${FIELDS_TEMPLATE}`;

    try {
      let fullText = "";

      // ── PDF PATH ────────────────────────────────────────────────────────────
      if (srcTab === "pdf") {
        if (!pdfB64) {
          setStatus({ ok:false, msg:"No PDF loaded yet — please select a file first." });
          setLoading(false); return;
        }
        log("Sending PDF to Claude…");
        const prompt =
          `You are an expert property investment analyst. The attached PDF is a property listing or brochure.\n\n` +
          `Step 1 — Extract every piece of investment-relevant data you can find: full address, property type, market/city/country, asking price (numbers only, currency ${c}), any rental estimates, service charges, management fees, size (sqm/sqft), developer or agent name, completion or handover date.\n\n` +
          `Step 2 — Write a thorough 3-paragraph investment appraisal: (a) yield potential and value versus comparable ${mkt} market rates (b) risks, red flags, anything missing (c) your verdict.\n\n` +
          `Step 3 — End with: VERDICT: [Buy/Watch/Pass] — [one sentence]` +
          FIELDS_INSTRUCTION;

        const data = await callClaude({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfB64 } },
              { type: "text", text: prompt },
            ],
          }],
        });
        log("Response received.");
        fullText = extractText(data);

      // ── URL PATH ────────────────────────────────────────────────────────────
      } else {
        if (!url.trim()) {
          setStatus({ ok:false, msg:"Please enter a URL first." });
          setLoading(false); return;
        }
        log("Searching for property listing…");
        const prompt =
          `You are an expert property investment analyst. Use web search to find information about this property listing: ${url.trim()}\n\n` +
          `Important: Many portals like Rightmove, Domain, and Bayut block direct scraping, so search for the address or property details that appear in Google's index from this URL instead.\n\n` +
          `Step 1 — Find and extract: full address, property type, market/city/country, asking price, any rental estimates, service charges, fees, size, developer/agent, completion date.\n\n` +
          `Step 2 — Write a thorough 3-paragraph investment appraisal: (a) yield potential and value for this market (b) risks, red flags, concerns (c) your verdict.\n\n` +
          `Step 3 — End with: VERDICT: [Buy/Watch/Pass] — [one sentence]\n\n` +
          `If the portal blocked access and you cannot retrieve specific listing details, say so clearly, then give a general market appraisal for the area based on what you know.` +
          FIELDS_INSTRUCTION;

        const data = await runWithWebSearch([{ role: "user", content: prompt }]);
        log("Search complete. Processing response…");
        fullText = extractText(data);
      }

      if (!fullText) {
        throw new Error("The API returned an empty response. This can happen if the PDF is image-only (scanned) with no readable text, or if the portal blocked access.");
      }

      const { analysis, fields } = parseFieldsJson(fullText);
      onAnalysisComplete(analysis);
      if (fields) onFieldsExtracted(fields);

      setStatus({
        ok: true,
        msg: fields
          ? "✓ Analysis complete — deal fields pre-filled. Review and adjust the numbers below."
          : "✓ Analysis written — some fields couldn't be extracted automatically. Fill in the financials below.",
      });

    } catch (err) {
      console.error("[DealDesk import error]", err);
      setStatus({ ok:false, msg:`Error: ${err.message}` });
    }
    setLoading(false);
  };

  return (
    <div className="source-panel">
      <div className="source-hdr">
        <div className="source-lbl"><span>📄</span> Analyse from Listing</div>
      </div>
      <div className="source-body">
        <div style={{fontFamily:"Inter,sans-serif",fontSize:13,color:"#475569",marginBottom:12,lineHeight:1.6}}>
          Upload a property PDF or paste a portal link and Claude will extract the key details and write a full investment appraisal.
          <span style={{display:"block",marginTop:4,fontSize:12,color:"#94a3b8"}}>
            ⚠️ Portal links: Claude searches for indexed listing data. Sites like Rightmove and Domain actively block direct scraping — if a portal blocks access, Claude will tell you clearly and give a market-level appraisal instead.
          </span>
        </div>

        <div className="source-tabs">
          <div className={`src-tab ${srcTab==="pdf"?"on":""}`} onClick={()=>{setSrcTab("pdf");setStatus(null);setLogLines([]);}}>📄 PDF Upload</div>
          <div className={`src-tab ${srcTab==="url"?"on":""}`} onClick={()=>{setSrcTab("url");setStatus(null);setLogLines([]);}}>🔗 Portal Link</div>
        </div>

        {srcTab === "pdf" ? (
          <>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{display:"none"}} onChange={handleFile}/>
            <div className={`upload-zone ${pdfFile?"has-file":""}`} onClick={()=>{fileRef.current.value="";fileRef.current.click();}}>
              <div className="upload-icon">{pdfFile ? "✅" : "📁"}</div>
              <div className="upload-text">{pdfFile ? "PDF loaded — ready to analyse" : "Click to select a PDF"}</div>
              <div className="upload-sub">Property brochure, listing PDF, or OM · Max 30 MB</div>
              {pdfFile && <div className="upload-fname">{pdfFile.name} ({(pdfFile.size/1024).toFixed(0)} KB)</div>}
            </div>
          </>
        ) : (
          <div>
            <input className="url-inp" placeholder="https://www.rightmove.co.uk/properties/123456 or any listing URL"
              value={url} onChange={e=>{setUrl(e.target.value);setStatus(null);}}
              style={{width:"100%",marginBottom:0}}/>
          </div>
        )}

        <div style={{marginTop:12,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <button className="btn-import" onClick={run}
            disabled={loading || (srcTab==="pdf" ? !pdfB64 : !url.trim())}>
            {loading ? "Analysing…" : "✦ Analyse Listing"}
          </button>
          {loading && (
            <span style={{fontFamily:"Inter,sans-serif",fontSize:12,color:"#94a3b8"}}>
              {logLines[logLines.length-1] || "Starting…"} — may take 20–40 s
            </span>
          )}
        </div>

        {status && (
          <div className={`import-status ${status.ok?"ok":"err"}`} style={{marginTop:10,whiteSpace:"pre-wrap",lineHeight:1.5}}>
            {status.msg}
            {!status.ok && (
              <div style={{marginTop:6,fontSize:11,color:"inherit",opacity:.8}}>
                Check the browser console (F12 → Console) for the full error detail.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MARKET INTELLIGENCE TAB ─────────────────────────────────────────────────
function MarketIntelTab({ deal }) {
  const [intel,    setIntel]    = useState(deal.marketIntel || null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const run = async () => {
    if (!deal.market && !deal.address) {
      setError("Add a market / city to this deal first so Claude knows where to research.");
      return;
    }
    setLoading(true); setError(null);
    const location = deal.market || deal.address;
    const type     = deal.type   || "residential property";
    const prompt =
      `You are a property market research analyst. Use web search to find current data for: ${location}\n\n` +
      `Research and report on ALL of the following, citing sources where possible:\n\n` +
      `1. RENTAL YIELDS — Current average gross and net rental yields for ${type} in ${location}. Include specific suburb/district breakdowns if available.\n\n` +
      `2. PRICE TRENDS — Property price changes over the last 12 months and 3 years. Are prices rising, falling, or flat?\n\n` +
      `3. RENTAL DEMAND — Vacancy rates, rental price growth, demand drivers (expats, students, corporates etc).\n\n` +
      `4. COMPARABLE TRANSACTIONS — Any recent comparable sales or listings for ${type} in this area with prices.\n\n` +
      `5. MARKET OUTLOOK — Key risks and tailwinds for investors in the next 1–3 years. Oversupply concerns? Infrastructure? Regulation changes?\n\n` +
      `6. INVESTOR VERDICT — Given all of the above, rate ${location} as an investment market: Strong / Neutral / Caution, with a 2-sentence rationale.\n\n` +
      `Format each section with a clear heading. Be specific with numbers wherever you can find them.`;

    try {
      const data = await runWithWebSearch([{ role:"user", content:prompt }]);
      const text = extractText(data);
      if (!text) throw new Error("Empty response from API.");
      setIntel(text);
    } catch(e) {
      setError(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  return (
    <div className="sv">
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,.04)",marginBottom:20}}>
        <div style={{padding:"12px 18px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontFamily:"Inter,sans-serif",fontSize:11,fontWeight:700,color:"#475569",letterSpacing:".06em",textTransform:"uppercase",display:"flex",alignItems:"center",gap:8}}>
            <span>🌐</span> Live Market Research
          </div>
          <button className="btn-ai" onClick={run} disabled={loading}
            style={{background:loading?"#fcd34d":"#0f172a",color:loading?"#92400e":"#fff"}}>
            {loading ? "Researching…" : intel ? "↻ Refresh" : "Research Market"}
          </button>
        </div>
        <div style={{padding:"14px 18px",fontFamily:"Inter,sans-serif",fontSize:13,color:"#475569",lineHeight:1.6}}>
          {!intel && !loading && !error && (
            <>
              <p>Click <strong>Research Market</strong> to search the web for live data on <strong>{deal.market || deal.address || "this market"}</strong>, including:</p>
              <ul style={{marginTop:8,paddingLeft:20,display:"flex",flexDirection:"column",gap:3}}>
                {["Current rental yields & vacancy rates","Recent price trends (12m & 3yr)","Comparable transactions","Rental demand drivers","Market outlook & risks"].map(x=>(
                  <li key={x} style={{fontSize:12,color:"#64748b"}}>{x}</li>
                ))}
              </ul>
            </>
          )}
          {loading && (
            <div style={{display:"flex",alignItems:"center",gap:10,color:"#94a3b8"}}>
              <span style={{fontSize:18,animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span>
              Searching the web for {deal.market || deal.address} market data… this takes 20–40 seconds.
            </div>
          )}
          {error && <div style={{color:"#991b1b",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:6,padding:"10px 14px",fontSize:12}}>{error}</div>}
          {intel && !loading && (
            <div style={{whiteSpace:"pre-wrap",lineHeight:1.8,color:"#1e293b",fontSize:14}}>{intel}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── QUICK IMPORT MODAL ───────────────────────────────────────────────────────
// Lets users create a new deal by importing from PDF or URL, skipping the manual form
function QuickImportModal({ onDealCreated, onClose }) {
  const BLANK = {
    address:"",market:"",type:"Apartment — 2BR",currency:"USD",listingUrl:"",notes:"",
    purchasePrice:"",closingCosts:"",downPaymentPct:"20",mortgageRate:"5.5",mortgageTerm:"25",
    monthlyRent:"",serviceCharge:"",insurance:"",mgmtFeePct:"8",maintenance:"",
    appreciationRate:"5",status:"new",comments:[],aiAnalysis:null,
  };
  const [mode,     setMode]    = useState("choose"); // choose | pdf | url | form
  const [draft,    setDraft]   = useState(BLANK);
  const [pdfFile,  setPdfFile] = useState(null);
  const [pdfB64,   setPdfB64]  = useState(null);
  const [url,      setUrl]     = useState("");
  const [loading,  setLoading] = useState(false);
  const [status,   setStatus]  = useState(null);
  const fileRef = useRef();

  const handleFile = e => {
    const f = e.target.files[0]; if(!f) return;
    if(f.size > 30*1024*1024){ setStatus({ok:false,msg:"File over 30 MB — please use a smaller PDF."}); return; }
    setPdfFile(f); setPdfB64(null); setStatus(null);
    const r = new FileReader();
    r.onload = ev => setPdfB64(ev.target.result.split(",")[1]);
    r.readAsDataURL(f);
  };

  const runImport = async () => {
    setLoading(true); setStatus(null);
    const FIELDS_TEMPLATE = `{"address":"","market":"","type":"Apartment — 2BR","currency":"USD","purchasePrice":"","monthlyRent":"","serviceCharge":"","closingCosts":"","notes":""}`;
    const FIELDS_INSTRUCTION = `\n\nOn a new line write exactly:\nFIELDS_JSON:${FIELDS_TEMPLATE}`;
    const basePrompt =
      `You are an expert property investment analyst.\n\n` +
      `Step 1 — Extract: full address, property type, city/country, asking price, any rental estimate, service charges, completion date, developer/agent.\n\n` +
      `Step 2 — Write a 3-paragraph investment appraisal: (a) yield potential (b) risks & red flags (c) verdict.\n\n` +
      `Step 3 — End with VERDICT: [Buy/Watch/Pass] — [one sentence]` +
      FIELDS_INSTRUCTION;

    try {
      let data;
      if (mode === "pdf") {
        if (!pdfB64) { setStatus({ok:false,msg:"Please select a PDF first."}); setLoading(false); return; }
        data = await callClaude({
          model:"claude-sonnet-4-20250514", max_tokens:1500,
          messages:[{ role:"user", content:[
            {type:"document",source:{type:"base64",media_type:"application/pdf",data:pdfB64}},
            {type:"text",text:basePrompt},
          ]}],
        });
      } else {
        if (!url.trim()) { setStatus({ok:false,msg:"Please enter a URL first."}); setLoading(false); return; }
        data = await runWithWebSearch([{ role:"user", content:
          `You are an expert property investment analyst. Search for this listing: ${url.trim()}\n\n${basePrompt}` }]);
      }

      const fullText = extractText(data);
      if (!fullText) throw new Error("Empty response. Try a different source.");
      const { analysis, fields } = parseFieldsJson(fullText);

      const merged = { ...BLANK, aiAnalysis:analysis };
      if (fields) {
        if (fields.address)       merged.address       = fields.address;
        if (fields.market)        merged.market        = fields.market;
        if (fields.type)          merged.type          = fields.type;
        if (fields.currency)      merged.currency      = fields.currency;
        if (fields.purchasePrice) merged.purchasePrice = fields.purchasePrice;
        if (fields.monthlyRent)   merged.monthlyRent   = fields.monthlyRent;
        if (fields.serviceCharge) merged.serviceCharge = fields.serviceCharge;
        if (fields.closingCosts)  merged.closingCosts  = fields.closingCosts;
        if (fields.notes)         merged.notes         = fields.notes;
      }
      merged.listingUrl = mode === "url" ? url.trim() : "";
      setDraft(merged);
      setMode("form");
      setStatus({ok:true, msg:fields ? "Fields extracted — review & save below." : "Analysis complete — fill in financials below."});
    } catch(e) {
      setStatus({ok:false, msg:`Error: ${e.message}`});
    }
    setLoading(false);
  };

  const s = (k,v) => setDraft(p=>({...p,[k]:v}));

  return (
    <div className="mo" onClick={onClose}>
      <div className="md" style={{maxWidth:660}} onClick={e=>e.stopPropagation()}>
        <div className="md-title">
          {mode==="choose" ? "Add Deal" : mode==="form" ? "Review & Save Deal" : mode==="pdf" ? "Import from PDF" : "Import from Portal Link"}
        </div>

        {/* CHOOSE MODE */}
        {mode==="choose" && (
          <div>
            <p style={{fontFamily:"Inter,sans-serif",fontSize:14,color:"#475569",marginBottom:18,lineHeight:1.6}}>
              How would you like to add this deal?
            </p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:8}}>
              {[
                {icon:"📄",title:"Upload PDF",sub:"Brochure or OM",action:()=>setMode("pdf")},
                {icon:"🔗",title:"Portal Link",sub:"Rightmove, Bayut…",action:()=>setMode("url")},
                {icon:"✏️",title:"Enter Manually",sub:"Fill in yourself",action:()=>setMode("form")},
              ].map(opt=>(
                <button key={opt.title} onClick={opt.action}
                  style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"20px 12px",cursor:"pointer",textAlign:"center",transition:"all .15s",fontFamily:"Inter,sans-serif"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#d97706";e.currentTarget.style.background="#fffbeb";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.background="#f8fafc";}}>
                  <div style={{fontSize:28,marginBottom:8}}>{opt.icon}</div>
                  <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{opt.title}</div>
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PDF MODE */}
        {mode==="pdf" && (
          <div>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{display:"none"}} onChange={handleFile}/>
            <div className={`upload-zone ${pdfFile?"has-file":""}`} style={{marginBottom:14}} onClick={()=>{fileRef.current.value="";fileRef.current.click();}}>
              <div className="upload-icon">{pdfFile?"✅":"📁"}</div>
              <div className="upload-text">{pdfFile?"PDF loaded — ready to analyse":"Click to select a PDF"}</div>
              <div className="upload-sub">Property brochure, listing PDF · Max 30 MB</div>
              {pdfFile&&<div className="upload-fname">{pdfFile.name}</div>}
            </div>
            {status&&<div className={`import-status ${status.ok?"ok":"err"}`} style={{marginBottom:12}}>{status.msg}</div>}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="btn-cancel" onClick={()=>{setMode("choose");setStatus(null);}}>← Back</button>
              <button className="btn-import" onClick={runImport} disabled={loading||!pdfB64}>{loading?"Analysing…":"✦ Analyse PDF"}</button>
            </div>
          </div>
        )}

        {/* URL MODE */}
        {mode==="url" && (
          <div>
            <div style={{fontFamily:"Inter,sans-serif",fontSize:12,color:"#64748b",marginBottom:10,lineHeight:1.6,background:"#fefce8",border:"1px solid #fde68a",borderRadius:6,padding:"10px 12px"}}>
              ⚠️ Works best on open portals. Rightmove, Domain and Bayut block direct scraping — Claude will search Google for cached data from the URL instead.
            </div>
            <input className="url-inp" style={{width:"100%",marginBottom:14}}
              placeholder="https://www.propertyportal.com/listing/123456"
              value={url} onChange={e=>{setUrl(e.target.value);setStatus(null);}}/>
            {status&&<div className={`import-status ${status.ok?"ok":"err"}`} style={{marginBottom:12}}>{status.msg}</div>}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="btn-cancel" onClick={()=>{setMode("choose");setStatus(null);}}>← Back</button>
              <button className="btn-import" onClick={runImport} disabled={loading||!url.trim()}>{loading?"Analysing…":"✦ Analyse Link"}</button>
            </div>
          </div>
        )}

        {/* FORM MODE */}
        {mode==="form" && (
          <div>
            {status&&<div className={`import-status ${status.ok?"ok":"err"}`} style={{marginBottom:14}}>{status.msg}</div>}
            {draft.aiAnalysis&&(
              <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"12px 14px",marginBottom:14,fontSize:13,lineHeight:1.7,color:"#44403c",maxHeight:160,overflowY:"auto",whiteSpace:"pre-wrap"}}>
                {draft.aiAnalysis}
              </div>
            )}
            <div className="md-grid">
              <div className="inp-g md-full"><div className="inp-l">Property Address</div>
                <input className="inp" value={draft.address} onChange={e=>s("address",e.target.value)} placeholder="Full address"/></div>
              <div className="inp-g"><div className="inp-l">Market / City</div>
                <input className="inp" value={draft.market} onChange={e=>s("market",e.target.value)} placeholder="e.g. Dubai, London"/></div>
              <div className="inp-g"><div className="inp-l">Currency</div>
                <select className="inp" value={draft.currency} onChange={e=>s("currency",e.target.value)}>
                  {Object.values(CURRENCIES).map(c=><option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>)}
                </select></div>
              <div className="inp-g"><div className="inp-l">Property Type</div>
                <select className="inp" value={draft.type} onChange={e=>s("type",e.target.value)}>
                  {DEAL_TYPES.map(t=><option key={t}>{t}</option>)}
                </select></div>
              <div className="inp-g"><div className="inp-l">Status</div>
                <select className="inp" value={draft.status} onChange={e=>s("status",e.target.value)}>
                  {STATUSES.map(x=><option key={x.v} value={x.v}>{x.l}</option>)}
                </select></div>
              <div className="md-div">Acquisition</div>
              {[["purchasePrice","Purchase Price"],["closingCosts","Closing Costs"],["downPaymentPct","Down Payment %"],["mortgageRate","Rate %"],["mortgageTerm","Term (yrs)"]].map(([k,l])=>(
                <div className="inp-g" key={k}><div className="inp-l">{l}</div>
                  <input className="inp" type="number" value={draft[k]} onChange={e=>s(k,e.target.value)}/></div>
              ))}
              <div className="md-div">Income & Monthly Expenses</div>
              {[["monthlyRent","Monthly Rent"],["serviceCharge","Service / Strata"],["insurance","Insurance"],["mgmtFeePct","Mgmt Fee %"],["maintenance","Maintenance"]].map(([k,l])=>(
                <div className="inp-g" key={k}><div className="inp-l">{l}</div>
                  <input className="inp" type="number" value={draft[k]} onChange={e=>s(k,e.target.value)}/></div>
              ))}
              <div className="md-div">Growth</div>
              <div className="inp-g"><div className="inp-l">Annual Capital Growth %</div>
                <input className="inp" type="number" value={draft.appreciationRate} onChange={e=>s("appreciationRate",e.target.value)}/></div>
              <div className="inp-g md-full"><div className="inp-l">Notes</div>
                <input className="inp" value={draft.notes||""} onChange={e=>s("notes",e.target.value)} placeholder="Any quick notes"/></div>
            </div>
          </div>
        )}

        {mode==="form"&&(
          <div className="md-acts">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-save" onClick={()=>onDealCreated({...draft,id:String(Date.now())})}>Save Deal</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DEAL MODAL ──────────────────────────────────────────────────────────────
function DealModal({ deal, onSave, onClose }) {
  const blank = {
    address:"",market:"",type:"Apartment — 2BR",currency:"USD",listingUrl:"",notes:"",
    purchasePrice:"",closingCosts:"",downPaymentPct:"20",mortgageRate:"5.5",mortgageTerm:"25",
    monthlyRent:"",serviceCharge:"",insurance:"",mgmtFeePct:"8",maintenance:"",
    appreciationRate:"5",status:"new",comments:[],aiAnalysis:null,
  };
  const [f,setF]=useState(deal||blank);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return (
    <div className="mo" onClick={onClose}>
      <div className="md" onClick={e=>e.stopPropagation()}>
        <div className="md-title">{deal?"Edit Deal":"Add New Deal"}</div>
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
            <input className="inp" placeholder="https://rightmove.co.uk/..." value={f.listingUrl||""} onChange={e=>s("listingUrl",e.target.value)}/></div>

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

// ─── GROWTH TAB ──────────────────────────────────────────────────────────────
function GrowthTab({ deal, onUpdate }) {
  const c    = deal.currency || "USD";
  const base = parseFloat(deal.appreciationRate) || 5;
  const bear = Math.max(0, base - 3);
  const bull = base + 3;
  const baseRows = calcGrowth(deal, base);
  const bearRows = calcGrowth(deal, bear);
  const bullRows = calcGrowth(deal, bull);
  const chartData = baseRows.map((r,i)=>({
    name:r.yr, Bear:Math.round(bearRows[i].eq), Base:Math.round(r.eq), Bull:Math.round(bullRows[i].eq),
  }));
  return (
    <div className="sv">
      <div style={{marginBottom:16}}>
        <div className="sh">Base Appreciation Rate</div>
        <div style={{display:"flex",gap:14,alignItems:"flex-end"}}>
          <div className="inp-g" style={{width:180}}>
            <div className="inp-l">Annual Growth % (base scenario)</div>
            <input className="inp" type="number" value={deal.appreciationRate||5} onChange={e=>onUpdate({appreciationRate:e.target.value})}/>
          </div>
          <div style={{fontFamily:"Inter,sans-serif",fontSize:12,color:"#64748b",paddingBottom:8}}>
            Bear: <b>{pct1(bear)}</b> · Base: <b>{pct1(base)}</b> · Bull: <b>{pct1(bull)}</b>
          </div>
        </div>
      </div>

      <div className="sh">Bear / Base / Bull Scenarios</div>
      <div className="sc-grid">
        {[{label:"🐻 Bear",rows:bearRows,rate:bear,col:"#991b1b",bg:"#fef2f2",bc:"#fca5a5"},
          {label:"◆ Base",rows:baseRows,rate:base,col:"#92400e",bg:"#fffbeb",bc:"#fde68a"},
          {label:"🐂 Bull",rows:bullRows,rate:bull,col:"#166534",bg:"#f0fdf4",bc:"#86efac"}].map(sc=>(
          <div className="sc-card" key={sc.label} style={{borderColor:sc.bc,background:sc.bg}}>
            <div className="sc-hdr"><span style={{color:sc.col}}>{sc.label}</span><span className="sc-rate">{pct1(sc.rate)} p.a.</span></div>
            {[{y:3,l:"3-Year Equity"},{y:5,l:"5-Year Equity"},{y:10,l:"10-Year Equity"}].map(({y,l})=>{
              const r=sc.rows[y-1];
              return <div key={y} className="sc-row">
                <div className="sc-label">{l}</div>
                <div className="sc-val" style={{color:sc.col}}>{fmtC(r.eq,c)}</div>
                <div className="sc-label">Total Return: <span style={{color:r.ret>=0?"#166534":"#991b1b",fontFamily:"IBM Plex Mono,monospace",fontWeight:500}}>{r.ret>=0?"+":""}{fmtC(r.ret,c)}</span></div>
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
              {[["bull","#10b981"],["base","#d97706"],["bear","#ef4444"]].map(([id,col])=>(
                <linearGradient key={id} id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={col} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={col} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
            <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:10,fontFamily:"Inter,sans-serif"}} axisLine={{stroke:"#e2e8f0"}} tickLine={false}/>
            <YAxis tick={{fill:"#94a3b8",fontSize:10,fontFamily:"Inter,sans-serif"}} axisLine={false} tickLine={false}
              tickFormatter={v=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}K`:v}/>
            <Tooltip contentStyle={TT_STYLE} formatter={v=>fmtC(v,c)}/>
            <Legend wrapperStyle={{fontFamily:"Inter,sans-serif",fontSize:11,color:"#64748b",paddingTop:8}}/>
            <Area type="monotone" dataKey="Bull" stroke="#10b981" fill="url(#gbull)" strokeWidth={2} strokeDasharray="5 3" dot={false}/>
            <Area type="monotone" dataKey="Base" stroke="#d97706" fill="url(#gbase)" strokeWidth={2.5} dot={false}/>
            <Area type="monotone" dataKey="Bear" stroke="#ef4444" fill="url(#gbear)" strokeWidth={2} strokeDasharray="5 3" dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="sh">Base Case — Year-by-Year</div>
      <div style={{background:"#fff",borderRadius:10,overflow:"hidden",border:"1px solid #e2e8f0",boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
        <div style={{overflowX:"auto"}}>
          <table className="gtbl">
            <thead><tr><th>Year</th><th>Value</th><th>Loan Bal.</th><th>Equity</th><th>Cum. CF</th><th>Total Return</th><th>ROI</th></tr></thead>
            <tbody>
              {baseRows.map(r=>(
                <tr key={r.yr}>
                  <td style={{color:"#92400e",fontWeight:500}}>{r.yr}</td>
                  <td>{fmtC(r.val,c)}</td>
                  <td style={{color:"#94a3b8"}}>{fmtC(r.bal,c)}</td>
                  <td style={{color:"#0f172a",fontWeight:500}}>{fmtC(r.eq,c)}</td>
                  <td style={{color:r.ccf>=0?"#166534":"#991b1b"}}>{r.ccf>=0?"+":""}{fmtC(r.ccf,c)}</td>
                  <td style={{color:r.ret>=0?"#166534":"#991b1b",fontWeight:500}}>{r.ret>=0?"+":""}{fmtC(r.ret,c)}</td>
                  <td style={{color:r.roi>=0?"#166534":"#991b1b"}}>{r.roi>=0?"+":""}{pct1(r.roi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      <div className="cv-sub">Tick checkboxes on 2 or more deals in the sidebar to compare them side by side.</div>
      <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8",fontFamily:"Inter,sans-serif",fontSize:14}}>☐ Select deals in the sidebar to begin</div>
    </div>
  );
  const mx = sel.map(d=>({d,m:calcMetrics(d),g:dealGrade(calcMetrics(d))}));
  const rows = [
    {l:"Market",         vals:mx.map(({d})=>d.market||"—"),                     txt:true},
    {l:"Type",           vals:mx.map(({d})=>d.type||"—"),                       txt:true},
    {l:"Currency",       vals:mx.map(({d})=>d.currency||"USD"),                 txt:true},
    {l:"Grade",          vals:mx.map(({g})=>`${g.grade} — ${g.label}`),         txt:true},
    {l:"Purchase Price", vals:mx.map(({d})=>fmtC(d.purchasePrice,d.currency)),  txt:true},
    {l:"Total Invested", vals:mx.map(({d,m})=>fmtC(m.inv,d.currency)),          txt:true},
    {l:"Monthly Rent",   vals:mx.map(({d})=>fmtC(d.monthlyRent,d.currency)),    txt:true},
    {l:"Gross Yield",    vals:mx.map(({m})=>m.gY),  f:pct,  hi:true},
    {l:"Net Yield",      vals:mx.map(({m})=>m.nY),  f:pct,  hi:true},
    {l:"Cash-on-Cash",   vals:mx.map(({m})=>m.coc), f:pct,  hi:true},
    {l:"Monthly CF",     vals:mx.map(({m})=>m.cf),  f:(v,d)=>fmtC(v,d.currency), hi:true},
    {l:"Monthly Exp.",   vals:mx.map(({m})=>m.exp), f:(v,d)=>fmtC(v,d.currency), hi:false},
    {l:"Growth % p.a.",  vals:mx.map(({d})=>parseFloat(d.appreciationRate)||5), f:pct, hi:true},
    {l:"Status",         vals:mx.map(({d})=>SL(d.status)),                      txt:true},
  ];
  return (
    <div className="cv-wrap">
      <div className="cv-title">Deal Comparison</div>
      <div className="cv-sub">{sel.length} deals · Values in each deal's native currency · Green = best, Red = worst</div>
      <div style={{overflowX:"auto"}}>
        <table className="ctbl">
          <thead><tr>
            <th style={{width:130}}>Metric</th>
            {sel.map(d=><th key={d.id} className="dc">
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:12,color:"#0f172a",fontWeight:700,textAlign:"center",padding:"0 6px"}}>{d.address}</div>
              <div style={{fontSize:11,color:"#92400e",textAlign:"center",marginTop:2,fontFamily:"IBM Plex Mono,monospace"}}>{fmtC(d.purchasePrice,d.currency||"USD")}</div>
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

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function Dashboard({ deals }) {
  const active = deals.filter(d=>d.status!=="pass");
  const withData = active.filter(d=>parseFloat(d.purchasePrice)>0);
  const mx = withData.map(d=>({d,m:calcMetrics(d)}));
  const avgNY   = mx.length ? mx.reduce((s,{m})=>s+m.nY,0)/mx.length : 0;
  const avgCoC  = mx.length ? mx.reduce((s,{m})=>s+m.coc,0)/mx.length : 0;
  const totalCF = mx.reduce((s,{m})=>s+m.cf,0);
  const grades  = {A:0,B:0,C:0,D:0};
  deals.forEach(d=>{ const g=dealGrade(calcMetrics(d)); grades[g.grade]++; });
  const gradePie = Object.entries(grades).filter(([,v])=>v>0).map(([k,v])=>({name:`Grade ${k}`,value:v}));
  const gradeCols = {A:"#16a34a",B:"#4ade80",C:"#d97706",D:"#ef4444"};
  const yieldData = withData.slice(0,8).map(d=>{const m=calcMetrics(d);return{name:d.address.split(",")[0].substring(0,12),net:+m.nY.toFixed(2),gross:+m.gY.toFixed(2)};});

  if (!deals.length) return (
    <div className="db-wrap"><div style={{textAlign:"center",padding:"80px 0"}}>
      <div style={{fontSize:40,opacity:.2,marginBottom:12}}>◆</div>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"#64748b"}}>No deals yet</div>
      <div style={{fontSize:13,color:"#94a3b8",marginTop:6}}>Add your first deal to see portfolio stats</div>
    </div></div>
  );

  return (
    <div className="db-wrap">
      <div className="sh">Portfolio Overview — {deals.length} deal{deals.length!==1?"s":""}</div>
      <div className="db-hero">
        <div className="db-card"><div className="db-label">Total Deals</div><div className="db-val blue">{deals.length}</div><div className="db-sub">{active.length} active</div></div>
        <div className="db-card"><div className="db-label">Avg Net Yield</div><div className="db-val amber">{pct(avgNY)}</div><div className="db-sub">active deals</div></div>
        <div className="db-card"><div className="db-label">Avg Cash-on-Cash</div><div className="db-val amber">{pct(avgCoC)}</div><div className="db-sub">active deals</div></div>
        <div className="db-card"><div className="db-label">Total Monthly CF</div><div className={`db-val ${totalCF>=0?"green":"red"}`} style={{color:totalCF>=0?"#166534":"#991b1b"}}>{totalCF>=0?"+":""}{Math.round(totalCF).toLocaleString()}</div><div className="db-sub">mixed currencies</div></div>
        <div className="db-card"><div className="db-label">Grade A + B</div><div className="db-val green">{grades.A+grades.B}</div><div className="db-sub">of {deals.length} total</div></div>
      </div>
      <div className="db-two">
        <div>
          <div className="sh">Net Yield by Deal</div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={yieldData} margin={{top:4,right:8,bottom:26,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:9,fontFamily:"Inter,sans-serif"}} angle={-30} textAnchor="end" interval={0} axisLine={{stroke:"#e2e8f0"}} tickLine={false}/>
                <YAxis tick={{fill:"#94a3b8",fontSize:10,fontFamily:"Inter,sans-serif"}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`}/>
                <Tooltip contentStyle={TT_STYLE} formatter={v=>`${v}%`}/>
                <Legend wrapperStyle={{fontFamily:"Inter,sans-serif",fontSize:10,color:"#64748b"}}/>
                <Bar dataKey="gross" name="Gross Yield" fill="#fcd34d" radius={[4,4,0,0]}/>
                <Bar dataKey="net"   name="Net Yield"   fill="#d97706" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div className="sh">Grade Distribution</div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={gradePie} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value"
                  label={({name,value})=>`${name} (${value})`} labelLine={{stroke:"#e2e8f0"}}
                  style={{fontFamily:"Inter,sans-serif",fontSize:10,fill:"#64748b"}}>
                  {gradePie.map((e,i)=><Cell key={i} fill={gradeCols[e.name.split(" ")[1]]}/>)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      {/* CUMULATIVE CASH FLOW CHART */}
      {mx.length > 0 && (
        <div style={{marginBottom:20}}>
          <div className="sh">Portfolio — 5-Year Cumulative Cash Flow Projection</div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={Array.from({length:60},(_,i)=>({
                  mo: `Mo ${i+1}`,
                  cf: mx.reduce((s,{m})=>s+(m.cf*(i+1)),0),
                }))}
                margin={{top:4,right:8,bottom:4,left:8}}>
                <defs>
                  <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="mo" tick={{fill:"#94a3b8",fontSize:9,fontFamily:"Inter,sans-serif"}}
                  tickFormatter={v=>{ const n=parseInt(v.split(" ")[1]); return n%12===0?`Yr ${n/12}`:""; }}
                  axisLine={{stroke:"#e2e8f0"}} tickLine={false}/>
                <YAxis tick={{fill:"#94a3b8",fontSize:9,fontFamily:"Inter,sans-serif"}} axisLine={false} tickLine={false}
                  tickFormatter={v=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}K`:v}/>
                <Tooltip contentStyle={TT_STYLE}
                  formatter={v=>[Math.round(v).toLocaleString()+" (mixed ccy)","Cumulative CF"]}
                  labelFormatter={l=>l}/>
                <Area type="monotone" dataKey="cf" stroke="#10b981" fill="url(#cfGrad)" strokeWidth={2.5} dot={false} name="Cumulative CF"/>
              </AreaChart>
            </ResponsiveContainer>
            <div style={{fontFamily:"Inter,sans-serif",fontSize:11,color:"#94a3b8",textAlign:"center",marginTop:4}}>
              Cumulative monthly cash flows summed across all active deals · Mixed currencies — for directional indication only
            </div>
          </div>
        </div>
      )}

      <div className="sh">All Deals</div>
      <div style={{background:"#fff",borderRadius:10,overflow:"hidden",border:"1px solid #e2e8f0",boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
        <div style={{overflowX:"auto"}}>
          <table className="gtbl">
            <thead><tr><th>Address</th><th>Market</th><th>Ccy</th><th>Price</th><th>Net Yield</th><th>CoC</th><th>CF/mo</th><th>Grade</th><th>Status</th></tr></thead>
            <tbody>
              {deals.map(d=>{const m=calcMetrics(d);const g=dealGrade(m);const c=d.currency||"USD";return(
                <tr key={d.id}>
                  <td style={{fontFamily:"'Playfair Display',serif",fontSize:13,color:"#0f172a",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.address}</td>
                  <td style={{color:"#64748b",fontSize:11}}>{d.market||"—"}</td>
                  <td style={{color:"#94a3b8"}}>{c}</td>
                  <td style={{color:"#92400e",fontWeight:500}}>{fmtC(d.purchasePrice,c)}</td>
                  <td style={{color:m.nY>=5?"#166534":m.nY>=3?"#92400e":"#991b1b",fontWeight:600}}>{pct(m.nY)}</td>
                  <td style={{color:m.coc>=6?"#166534":m.coc>=3?"#92400e":"#991b1b"}}>{pct(m.coc)}</td>
                  <td style={{color:m.cf>=0?"#166534":"#991b1b"}}>{m.cf>=0?"+":""}{fmtC(m.cf,c)}</td>
                  <td><span style={{background:g.bg,color:g.col,border:`1px solid ${g.border}`,padding:"2px 8px",borderRadius:5,fontFamily:"Inter,sans-serif",fontSize:11,fontWeight:700}}>{g.grade}</span></td>
                  <td><span className={`badge badge-${d.status}`}>{SL(d.status)}</span></td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── SAMPLE DATA ─────────────────────────────────────────────────────────────
const SAMPLE = [
  {id:"1",address:"Marina Gate II, Studio 1204",market:"Dubai, UAE",type:"Apartment — Studio",currency:"AED",purchasePrice:"850000",closingCosts:"38000",downPaymentPct:"25",mortgageRate:"4.5",mortgageTerm:"25",monthlyRent:"6800",serviceCharge:"1100",insurance:"200",mgmtFeePct:"8",maintenance:"300",appreciationRate:"6",status:"review",notes:"Off-plan completion Q4 2025",listingUrl:"",comments:[{id:"c1",author:"Chris",text:"Strong rental demand in Marina. Net yield looks healthy but watch service charges trending up YoY.",score:4,time:"2 days ago"}],aiAnalysis:null},
  {id:"2",address:"Canary Wharf, 2BR E14 5HQ",market:"London, UK",type:"Apartment — 2BR",currency:"GBP",purchasePrice:"620000",closingCosts:"22000",downPaymentPct:"25",mortgageRate:"5.25",mortgageTerm:"25",monthlyRent:"3200",serviceCharge:"450",insurance:"150",mgmtFeePct:"10",maintenance:"200",appreciationRate:"4",status:"review",notes:"Leasehold — 125yr remaining",listingUrl:"",comments:[],aiAnalysis:null},
  {id:"3",address:"Bondi Junction, 1BR Unit 5",market:"Sydney, Australia",type:"Apartment — 1BR",currency:"AUD",purchasePrice:"780000",closingCosts:"35000",downPaymentPct:"20",mortgageRate:"6.2",mortgageTerm:"30",monthlyRent:"3000",serviceCharge:"900",insurance:"180",mgmtFeePct:"8",maintenance:"250",appreciationRate:"5",status:"hold",notes:"",listingUrl:"",comments:[],aiAnalysis:null},
];

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [deals,   setDeals]   = useState(()=>{ try{const s=localStorage.getItem("dealdesk_v4");return s?JSON.parse(s):SAMPLE;}catch{return SAMPLE;} });
  const [selId,   setSelId]   = useState(deals[0]?.id||null);
  const [tab,     setTab]     = useState("overview");
  const [cmpMode, setCmpMode] = useState(false);
  const [cmpIds,  setCmpIds]  = useState([]);
  const [modal,      setModal]      = useState(false);
  const [editD,      setEditD]      = useState(null);
  const [quickImport,setQuickImport]= useState(false);
  const [aiLoad,  setAiLoad]  = useState(false);
  const [cmt,     setCmt]     = useState({author:"Chris",text:"",score:4});
  const [search,  setSearch]  = useState("");
  const streamRef = useRef("");

  useEffect(()=>{ try{localStorage.setItem("dealdesk_v4",JSON.stringify(deals));}catch{} },[deals]);

  const sel = deals.find(d=>d.id===selId);
  const upd = useCallback(patch=>setDeals(p=>p.map(d=>d.id===selId?{...d,...patch}:d)),[selId]);

  const saveDeal = d => { setDeals(p=>p.find(x=>x.id===d.id)?p.map(x=>x.id===d.id?d:x):[...p,d]); setSelId(d.id); setModal(false); setEditD(null); };
  const toggleCmp = id => setCmpIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const filtered  = deals.filter(d=>!search||(d.address+" "+d.market).toLowerCase().includes(search.toLowerCase()));

  const runAI = async () => {
    if (!sel) return; setAiLoad(true); streamRef.current=""; upd({aiAnalysis:""});
    const m=calcMetrics(sel); const c=sel.currency||"USD";
    const prompt=`You are an expert property investment analyst. Appraise this real estate deal concisely but thoroughly.\n\nDEAL: ${sel.address}\nMarket: ${sel.market||"Not specified"}\nType: ${sel.type}\nCurrency: ${c}\nPurchase Price: ${fmtC(sel.purchasePrice,c)}\nDown Payment: ${sel.downPaymentPct}% (${fmtC(m.downAmt,c)})\nTotal Invested: ${fmtC(m.inv,c)}\nMonthly Rent: ${fmtC(sel.monthlyRent,c)}\nGross Yield: ${pct(m.gY)} | Net Yield: ${pct(m.nY)}\nCash Flow/mo: ${fmtC(m.cf,c)} | Cash-on-Cash: ${pct(m.coc)}\nMortgage: ${sel.mortgageRate}% over ${sel.mortgageTerm}yrs\nCapital Growth: ${sel.appreciationRate||5}% p.a.\n${sel.notes?`Notes: ${sel.notes}`:""}\n\nWrite a 3-paragraph appraisal: (1) yield & cash flow quality for this market (2) risks & concerns (3) verdict. End with "VERDICT: [Buy/Watch/Pass] — [reason]"`;
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:700,stream:true,messages:[{role:"user",content:prompt}]})});
      const reader=res.body.getReader();const dec=new TextDecoder();
      while(true){const{done,value}=await reader.read();if(done)break;
        for(const line of dec.decode(value).split("\n").filter(l=>l.startsWith("data: "))){
          try{const j=JSON.parse(line.slice(6));if(j.type==="content_block_delta"&&j.delta?.text){streamRef.current+=j.delta.text;setDeals(p=>p.map(d=>d.id===selId?{...d,aiAnalysis:streamRef.current}:d));}}catch{}}}
    }catch{upd({aiAnalysis:"Analysis unavailable. Please try again."});}
    setAiLoad(false);
  };

  const addCmt=()=>{ if(!cmt.text.trim()||!sel)return; upd({comments:[...(sel.comments||[]),{id:String(Date.now()),author:cmt.author||"Anonymous",text:cmt.text,score:cmt.score,time:"just now"}]}); setCmt(p=>({...p,text:""})); };

  const m = sel?calcMetrics(sel):null;
  const g = m?dealGrade(m):null;
  const c = sel?.currency||"USD";

  const expPie = m&&sel ? [
    {name:"Mortgage",  value:Math.round(m.mo)},
    {name:"Service",   value:Math.round(m.svc)},
    {name:"Insurance", value:Math.round(m.ins)},
    {name:"Mgmt",      value:Math.round(m.mgmt)},
    {name:"Maint.",    value:Math.round(m.maint)},
  ].filter(x=>x.value>0) : [];

  const OverviewContent = () => (
    <div className="sv">
      {/* DEAL HEADER */}
      <div className="dh">
        <div className="dh-l">
          <div className="addr">{sel.address}</div>
          <div className="dtag">
            {sel.type} · {sel.market} · {CURRENCIES[c]?.flag} {c}
            {sel.listingUrl&&<> · <a href={sel.listingUrl} target="_blank" rel="noopener" className="link">View Listing ↗</a></>}
          </div>
          {sel.notes&&<div className="notes-note">📝 {sel.notes}</div>}
        </div>
        <div className="dh-r">
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
            <span className="grade-badge" style={{background:g.bg,color:g.col,borderColor:g.border}}>
              Grade {g.grade} · {g.label}
            </span>
            <select className="inp" style={{width:"auto",fontSize:12,padding:"6px 10px"}} value={sel.status} onChange={e=>upd({status:e.target.value})}>
              {STATUSES.map(x=><option key={x.v} value={x.v}>{x.l}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:7}}>
            <button className="btn-edit" onClick={()=>{setEditD(sel);setModal(true);}}>Edit</button>
            <button className="del-btn" onClick={()=>{const r=deals.filter(d=>d.id!==selId);setDeals(r);setSelId(r[0]?.id||null);}}>✕ Remove</button>
          </div>
        </div>
      </div>

      {/* METRICS */}
      <div className="sh">Returns</div>
      <div className="mg4" style={{marginBottom:16}}>
        <div className="mc"><div className="ml">Gross Yield</div><div className="mv amber">{pct(m.gY)}</div><div className="ms">Annual rent / price</div></div>
        <div className="mc"><div className="ml">Net Yield</div><div className="mv" style={{color:m.nY>=5?"#166534":m.nY>=3?"#92400e":"#991b1b"}}>{pct(m.nY)}</div><div className="ms">After running costs</div></div>
        <div className="mc"><div className="ml">Cash-on-Cash</div><div className="mv" style={{color:m.coc>=6?"#166534":m.coc>=3?"#92400e":"#991b1b"}}>{pct(m.coc)}</div><div className="ms">Annual cash / invested</div></div>
        <div className="mc"><div className="ml">Monthly Cash Flow</div><div className="mv" style={{color:m.cf>=0?"#166534":"#991b1b"}}>{m.cf>=0?"+":""}{fmtC(m.cf,c)}</div><div className="ms">Rent minus all expenses</div></div>
        <div className="mc"><div className="ml">Purchase Price</div><div className="mv">{fmtC(sel.purchasePrice,c)}</div></div>
        <div className="mc"><div className="ml">Total Invested</div><div className="mv">{fmtC(m.inv,c)}</div><div className="ms">Down + closing costs</div></div>
        <div className="mc"><div className="ml">Monthly Mortgage</div><div className="mv">{fmtC(m.mo,c)}</div><div className="ms">{sel.mortgageRate}% / {sel.mortgageTerm}yr</div></div>
        <div className="mc"><div className="ml">Total Expenses/mo</div><div className="mv">{fmtC(m.exp,c)}</div></div>
      </div>

      {/* INPUTS */}
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

      {/* EXPENSE PIE */}
      {expPie.length>0&&(
        <>
          <div className="sh">Expense Breakdown</div>
          <div className="chart-box" style={{marginBottom:20}}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={expPie} cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={2} dataKey="value"
                  label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={{stroke:"#e2e8f0"}}
                  style={{fontFamily:"Inter,sans-serif",fontSize:10,fill:"#64748b"}}>
                  {expPie.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} formatter={v=>fmtC(v,c)}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* SOURCE IMPORT */}
      <div className="sh">Analyse from Listing</div>
      <SourceImportPanel
        deal={sel}
        onAnalysisComplete={analysis => upd({aiAnalysis:analysis})}
        onFieldsExtracted={fields => {
          const patch = {};
          if (fields.address && !sel.address) patch.address = fields.address;
          if (fields.market)       patch.market       = fields.market;
          if (fields.type)         patch.type         = fields.type;
          if (fields.purchasePrice) patch.purchasePrice = fields.purchasePrice;
          if (fields.monthlyRent)  patch.monthlyRent  = fields.monthlyRent;
          if (fields.serviceCharge) patch.serviceCharge = fields.serviceCharge;
          if (fields.closingCosts) patch.closingCosts = fields.closingCosts;
          if (Object.keys(patch).length) upd(patch);
        }}
      />

      {/* AI ANALYSIS */}
      <div className="sh">Manual AI Analysis</div>
      <div className="ai-panel">
        <div className="ai-hdr">
          <div className="ai-lbl"><div className="ai-dot"/>Claude Investment Analyst</div>
          <button className="btn-ai" onClick={runAI} disabled={aiLoad}>{aiLoad?"Analysing…":"Run Analysis"}</button>
        </div>
        <div className="ai-body">
          {aiLoad&&!sel.aiAnalysis
            ?<div style={{color:"#94a3b8",fontFamily:"Inter,sans-serif",fontSize:13}}>Analysing deal…</div>
            :sel.aiAnalysis
              ?<div style={{whiteSpace:"pre-wrap"}}>{sel.aiAnalysis}</div>
              :<div className="ai-ph">Use "Analyse from Listing" above to import from a PDF or portal URL, or click "Run Analysis" to appraise the financials you've entered manually.</div>}
        </div>
      </div>
    </div>
  );

  const NotesContent = () => (
    <div className="sv">
      <div className="sh">Collaboration Notes ({(sel.comments||[]).length})</div>
      <div style={{marginBottom:14}}>
        {!(sel.comments||[]).length&&<div style={{color:"#94a3b8",fontFamily:"Inter,sans-serif",fontSize:13,padding:"16px 0"}}>No notes yet — add the first one below.</div>}
        {(sel.comments||[]).map(cm=>(
          <div key={cm.id} className="cmt-card">
            <div className="cmt-meta"><span className="cmt-auth">{cm.author}</span><span className="cmt-time">{cm.time}</span></div>
            <div className="cmt-txt">{cm.text}</div>
            {cm.score&&<div style={{marginTop:7}}><Stars v={cm.score}/></div>}
          </div>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,background:"#fff",padding:16,borderRadius:10,border:"1px solid #e2e8f0",boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
        <div style={{fontFamily:"Inter,sans-serif",fontSize:12,fontWeight:600,color:"#475569",textTransform:"uppercase",letterSpacing:".04em"}}>Add Note</div>
        <input className="inp-name" placeholder="Your name" value={cmt.author} onChange={e=>setCmt(p=>({...p,author:e.target.value}))}/>
        <textarea className="ta" rows={3} placeholder="Add your observations, concerns, or questions about this deal…" value={cmt.text} onChange={e=>setCmt(p=>({...p,text:e.target.value}))}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontFamily:"Inter,sans-serif",fontSize:11,fontWeight:600,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".04em"}}>Score</span>
            <Stars v={cmt.score} onChange={v=>setCmt(p=>({...p,score:v}))}/>
          </div>
          <button className="btn-post" onClick={addCmt}>Post Note</button>
        </div>
      </div>
    </div>
  );

  const dealTabs = sel&&!cmpMode ? [
    {k:"overview",l:"Overview"},
    {k:"growth",  l:"Growth"},
    {k:"market",  l:"Market Intel"},
    {k:"notes",   l:`Notes (${(sel.comments||[]).length})`},
  ] : [];

  const mainContent = () => {
    if (tab==="dashboard") return <Dashboard deals={deals}/>;
    if (cmpMode)           return <CompareView deals={deals} cmpIds={cmpIds}/>;
    if (!sel)              return <div className="m-empty"><div className="empty-i">◆</div><div className="empty-t">No deal selected</div><div className="empty-s">Choose a deal or add a new one</div></div>;
    if (tab==="growth")    return <GrowthTab deal={sel} onUpdate={upd}/>;
    if (tab==="market")    return <MarketIntelTab deal={sel}/>;
    if (tab==="notes")     return <NotesContent/>;
    return <OverviewContent/>;
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* SIDEBAR */}
        <div className="sb">
          <div className="sb-head">
            <div className="logo"><div className="logo-i">D</div>DealDesk</div>
            <div className="logo-sub">Property Investment Appraisal</div>
          </div>
          <div className="sb-search">
            <input className="search-inp" placeholder="🔍  Search deals…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div className="sb-acts">
            <button className="btn-add" onClick={()=>setQuickImport(true)}>+ Add Deal</button>
            <button className={`btn-sm ${tab==="dashboard"&&!cmpMode?"on":""}`} onClick={()=>{setTab("dashboard");setCmpMode(false);}}>Dashboard</button>
            <button className={`btn-sm ${cmpMode?"on":""}`} onClick={()=>{setCmpMode(p=>!p);if(!cmpMode)setTab("overview");}}>
              {cmpMode?"✓ Cmp":"⇄ Cmp"}
            </button>
          </div>
          <div className="dl">
            {filtered.length===0&&<div style={{padding:"24px 10px",textAlign:"center",color:"#94a3b8",fontFamily:"Inter,sans-serif",fontSize:13}}>No deals match</div>}
            {filtered.map(d=>{
              const dm=calcMetrics(d); const dc=d.currency||"USD"; const dg=dealGrade(dm);
              return (
                <div key={d.id} className={`di ${d.id===selId&&!cmpMode&&tab!=="dashboard"?"act":""}`}
                  onClick={()=>{if(!cmpMode){setSelId(d.id);if(tab==="dashboard")setTab("overview");}}}>
                  {cmpMode
                    ?<div className={`cmp-chk ${cmpIds.includes(d.id)?"on":""}`} onClick={e=>{e.stopPropagation();toggleCmp(d.id);}}>{cmpIds.includes(d.id)?"✓":""}</div>
                    :<div className="grade-pill" style={{background:dg.bg,color:dg.col,borderColor:dg.border}}>{dg.grade}</div>
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
              {dealTabs.map(t=><button key={t.k} className={`tab ${tab===t.k?"on":""}`} onClick={()=>setTab(t.k)}>{t.l}</button>)}
              {cmpMode&&<span className="nav-info" style={{padding:"0 12px"}}>{cmpIds.length} deal{cmpIds.length!==1?"s":""} selected</span>}
              {tab==="dashboard"&&!cmpMode&&<span className="nav-info" style={{padding:"0 12px"}}>Portfolio · {deals.length} deal{deals.length!==1?"s":""} · saved locally</span>}
            </div>
            <div className="nav-r">
              {!cmpMode&&sel&&tab!=="dashboard"&&<button className="btn-pdf" onClick={()=>exportPDF(sel)}>⬇ Export PDF</button>}
            </div>
          </div>
          {mainContent()}
        </div>
      </div>
      {modal&&<DealModal deal={editD} onSave={saveDeal} onClose={()=>{setModal(false);setEditD(null);}}/>}
      {quickImport&&<QuickImportModal
        onDealCreated={d=>{ saveDeal(d); setQuickImport(false); setTab("overview"); }}
        onClose={()=>setQuickImport(false)}
      />}
    </>
  );
}
