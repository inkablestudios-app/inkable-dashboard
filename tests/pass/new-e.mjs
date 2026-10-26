// New settings, group E (reminders): install coming up, proof waiting on the
// client, sales tax filing frequency.
import * as L from './pass-lib.mjs';
const {check,sleep,startScenario,R}=L;
const S=await L.bootServer(); const D=await L.bootDashboard(S); const {E,d,$,w}=D; const U=L.ui(D);
const items=()=>[...d.querySelectorAll('#lineItemsContainer .line-item')];
async function setX(vals){ E('openSettings()'); await sleep(15); for(const [k,v] of Object.entries(vals)){ const el=$('xs-'+k)||$(k); if(el.type==='checkbox')el.checked=!!v; else if(el.tagName==='SELECT')U.pick(el,String(v)); else U.type(el,v); } const ab=D.alerts.length; E('saveSettings()'); await sleep(30); E('closeSettings()'); return D.alerts.length>ab?D.alerts.at(-1):''; }
const ymd=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
const day=n=>{ const t=new Date(); return new Date(t.getFullYear(),t.getMonth(),t.getDate()+n); };
E("addClient({name:'<b>Bold</b> Signs Co'})"); await sleep(40); const cid=E('getClients()[0].id');
async function job(price){ const n=E('nextProjectNum()'); E(`openPricer(${n},'${cid}')`); await sleep(15); L.fillItem(D,items()[0],{desc:'Sign',mode:'flat',price}); L.fillJob(D,{setupMins:0}); E('recalc()'); $('pricerSaveBtn').click(); await sleep(90); E('closePricer()'); return E(`getProjects().find(p=>p.estNo==='EST-${n}')`); }
const meta=(id,m)=>E(`setJobMeta('${id}',{...getJobMeta('${id}'),...${JSON.stringify(m)}})`);
const rem=(id,type)=>E('computeReminders()').filter(r=>r.projectId===id&&(!type||r.type===type));

startScenario('E1','Install coming up','new');
const a=await job(100);
meta(a.id,{status:'prod',installDate:ymd(day(1)),installTime:''});
let r=rem(a.id,'install'); check(r.length===1&&/: install tomorrow \(/.test(r[0].message),'install tomorrow: reminded (default 1 day)',JSON.stringify(r));
meta(a.id,{installDate:ymd(day(0)),installTime:'09:30'});
r=rem(a.id,'install'); check(r.length===1&&/install today \(.*at 9:30 AM\)/.test(r[0].message),'install today at 9:30 AM',JSON.stringify(r));
meta(a.id,{installDate:ymd(day(3)),installTime:''}); check(rem(a.id,'install').length===0,'install in 3 days: not yet (1 day setting)');
check(await setX({installReminderDays:3})==='','set to 3 days');
r=rem(a.id,'install'); check(r.length===1&&/install in 3 days/.test(r[0].message),'install in 3 days: reminded with a 3-day setting');
meta(a.id,{installDate:ymd(day(-1))}); check(rem(a.id,'install').length===0,'install yesterday: no reminder');
meta(a.id,{installDate:ymd(day(1)),status:'done'}); check(rem(a.id,'install').length===0,'job already Done: no reminder');
meta(a.id,{status:'cancelled'}); check(rem(a.id,'install').length===0,'cancelled job: no reminder');
meta(a.id,{status:'prod'}); await setX({installReminderDays:0}); check(rem(a.id,'install').length===0,'0 = off');
await setX({installReminderDays:1});

startScenario('E2','Proof waiting on the client','new');
const OrigDate=w.Date;
function at(iso){ const T=new OrigDate(iso).getTime(); w.Date=class extends OrigDate{ constructor(...x){ if(x.length===0)super(T); else super(...x); } static now(){ return T; } }; }
const later=n=>new OrigDate(OrigDate.now()+n*864e5).toISOString();
const b=await job(200);
meta(b.id,{status:'awaiting'}); await sleep(30);
at(later(2)); check(rem(b.id).length===0,'waiting 2 days: nothing yet (3-day default)');
at(later(4)); let r2=rem(b.id); check(r2.length===1&&r2[0].type==='proof'&&/proof has waited 4 days for an answer/.test(r2[0].message),'waiting 4 days: proof reminder',JSON.stringify(r2));
// 20 days: also past the general "sitting" reminder (7 days) — only the proof one shows
at(later(20)); r2=rem(b.id); check(r2.length===1&&r2[0].type==='proof'&&/20 days/.test(r2[0].message),'20 days: one reminder (the proof one), not two',JSON.stringify(r2.map(x=>x.type)));
await setX({proofWaitDays:0}); r2=rem(b.id); check(r2.length===1&&r2[0].type==='stale','proof reminder off: the general one is back',JSON.stringify(r2.map(x=>x.type)));
await setX({proofWaitDays:3});
// the bell list shows names as text
E('refreshReminders()'); E('toggleNotifDropdown()'); await sleep(10);
const dd=$('notifDropdown'); check(/🖼️ <b>Bold<\/b> Signs Co's proof has waited 20 days/.test(dd.textContent)&&!dd.querySelector('b'),'bell list: proof icon, client name shown as text',dd.textContent.slice(0,300));
E('toggleNotifDropdown()');
// the client answers (status moves on): no more proof reminder
meta(b.id,{status:'approved'}); check(rem(b.id,'proof').length===0,'after the client approves: gone');
w.Date=OrigDate;

startScenario('E3','Sales tax filing frequency','new');
const due=()=>{ E('renderTaxDueReminder()'); return $('tax-due-reminder').textContent.replace(/\s+/g,' '); };
const cases=[
  ['quarterly','2026-10-26T10:00:00','Jan 20, 2027'],['quarterly','2026-10-15T10:00:00','Oct 20, 2026'],
  ['monthly','2026-10-26T10:00:00','Nov 20, 2026'],['monthly','2026-11-20T18:00:00','Nov 20, 2026'],['monthly','2026-11-21T08:00:00','Dec 20, 2026'],
  ['yearly','2026-10-26T10:00:00','Jan 20, 2027'],['yearly','2027-01-10T10:00:00','Jan 20, 2027'],['yearly','2027-01-25T10:00:00','Jan 20, 2028']];
for(const [f,now,exp] of cases){
  w.Date=OrigDate; await setX({taxFiling:f}); at(now);
  const t=due(); check(t.includes('due: '+exp)&&t.includes(f+' filing'),`${f}, on ${now.slice(0,10)}: next filing ${exp}`,t);
}
w.Date=OrigDate; await setX({taxFiling:'quarterly'});

console.log(`\nGROUP E  CHECKS ${R.checks}  PASSED ${R.passed}  FAILED ${R.fails.length}`); R.fails.forEach(f=>console.log(' FAIL',f.scen,f.what,f.detail));
console.log('errors',D.errs.slice(0,3),S.serverLog.slice(0,3)); process.exit();
