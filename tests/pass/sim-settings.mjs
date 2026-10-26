// Settings simulations: change every setting through the Settings screen and
// check where it shows up (and that saved jobs don't change).
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as L from './pass-lib.mjs';
const {check,note,near,r2,money,sleep,startScenario,R,pdfText,lineAmount}=L;
const S=await L.bootServer(); const D=await L.bootDashboard(S); const {E,d,$,w}=D; const U=L.ui(D);
const items=()=>[...d.querySelectorAll('#lineItemsContainer .line-item')];
const fmt$=n=>'$'+(+n).toFixed(2);
async function setSettings(vals){ E('openSettings()'); await sleep(15); for(const [id,v] of Object.entries(vals))U.type($(id),v); E('saveSettings()'); await sleep(30); E('closeSettings()'); await sleep(5); }
async function matUI(cat,fn){ E('openSettings()'); await sleep(15); await fn(); E('saveSettings()'); await sleep(30); E('closeSettings()'); }
const row=(cat,name)=>[...d.querySelectorAll(`#${cat}CostRows .mat-row`)].find(r=>r.dataset.name===name);
const pdfOf=async fn=>{ const n=D.pdfs.length; await fn(); await sleep(30); const p=D.pdfs.slice(n); return p.length?pdfText(p.at(-1).buf):''; };
let num=7001;
async function newJob(fill,job){ const n=num++; E(`openPricer(${n},'${cid}')`); await sleep(15); fill(); if(job)L.fillJob(D,job); E('recalc()'); return n; }
async function save(n){ $('pricerSaveBtn').click(); await sleep(90); E('closePricer()'); return E(`getProjects().find(p=>p.estNo==='EST-${n}')`); }
const item=(i,o)=>{ if(i>0)d.querySelector('.add-line-btn').click(); L.fillItem(D,items()[i],o); };
const share=async id=>(await (await S.route('/api/proof-share',{method:'POST',body:JSON.stringify({projectId:id})})).json()).token;
const pub=async tok=>(await (await S.route('/api/proof-public?token='+tok)).json());
const clientPage=async tok=>{ const cp=new JSDOM(fs.readFileSync(L.ROOT+'proof.html','utf8'),{url:'https://x.netlify.app/proof.html?token='+tok,runScripts:'dangerously',virtualConsole:new VirtualConsole(),beforeParse(cw){cw.fetch=S.route;}}); await sleep(80); return cp.window.document.getElementById('mainCard')?.textContent||''; };

E("addClient({name:'Settings Test Co',email:'st@example.com',addr:'1 Oak',city:'Katy',state:'TX',zip:'77494'})"); await sleep(40); const cid=E('getClients()[0].id');
// a job saved BEFORE any settings change: it must never move
const n0=await newJob(()=>item(0,{desc:'Reference sign',vinyl:'Orajet 3165 (4 Mil Intermediate Calendered)',lam:'Oraguard 210 Over-Laminate',w:24,h:24,sub:'Coroplast',design:{hrs:1},install:{hrs:1}}));
const ref=await save(n0); const refTotal=+ref.state.form.estimateSummary.total; const refTok=await share(ref.id); const refDep=(await pub(refTok)).depositAmount;
const refUnchanged=async(what)=>{
  check(near(E(`getProjectAmount(getProjects().find(p=>p.id==='${ref.id}'))`),refTotal),`${what}: saved job's total unchanged`);
  E(`editInPricer('${ref.id}')`); await sleep(15); const t=E('gatherPricerPDFData().total'); E('pricerCleanState=pricerSnapshot();closePricer()');
  check(near(t,refTotal),`${what}: saved job reopens at its quoted price`,`${t} vs ${refTotal}`); };

// ── Shop rates ──
startScenario('ST1','Design and install rates','settings');
await setSettings({settingDesignBasic:50,settingDesignStandard:70,settingDesignAdvanced:95,settingInstallBasic:45,settingInstallStandard:75,settingInstallAdvanced:100});
{ const n=await newJob(()=>{ item(0,{desc:'a',mode:'flat',price:0,design:{hrs:1,level:'basic'},install:{hrs:1,level:'basic'}}); item(1,{desc:'b',mode:'flat',price:0,design:{hrs:1},install:{hrs:1}}); item(2,{desc:'c',mode:'flat',price:0,design:{hrs:1,level:'advanced'},install:{hrs:1,level:'advanced'}}); },{setupMins:0});
  const g=E('gatherPricerPDFData()'); check(near(g.designTotal,215)&&near(g.totalInstall,220),'new estimate: design $215 (50+70+95), install $220 (45+75+100)',`${g.designTotal} / ${g.totalInstall}`);
  E('pricerCleanState=pricerSnapshot();closePricer()'); }
await refUnchanged('rates changed');

startScenario('ST2','Setup rate, print cost, markup','settings');
await setSettings({settingSetupRate:60,settingPrintCost:0.25,settingMarkup:3});
{ const n=await newJob(()=>{ item(0,{desc:'printed',vinyl:'Orajet 3165 (4 Mil Intermediate Calendered)',w:24,h:24}); item(1,{desc:'cut',vinyl:'Oracal 651 Intermediate Cal',printed:false,w:24,h:24}); item(2,{desc:'vendor',mode:'flat',price:100}); });
  const g=E('gatherPricerPDFData()');
  check(near(g.lineData[0].matTotal,r2((0.41+0.25)*4*3)),`printed item = (0.41 + print 0.25) × 4 sqft × 3 = ${fmt$((0.41+0.25)*4*3)}`,g.lineData[0].matTotal);
  check(near(g.lineData[1].matTotal,r2(0.48*4*3)),'cut item: no print cost, markup 3',g.lineData[1].matTotal);
  check(near(g.lineData[2].matTotal,100),'flat vendor item: markup not applied');
  check(near(g.setupTotal,15),'default 15 min setup at $60/hr = $15',g.setupTotal);
  E('pricerCleanState=pricerSnapshot();closePricer()'); }
await refUnchanged('setup/print/markup changed');

startScenario('ST3','Card processing fee %','settings');
await setSettings({settingProcessingFeeRate:3.5});
{ const n=await newJob(()=>item(0,{desc:'x',mode:'flat',price:200}),{setupMins:0});
  const g=E('gatherPricerPDFData()'); check(near(g.processingFee,r2((200+16.5)*0.035)),'fee = 3.5% of (price + tax)',g.processingFee);
  E('pricerCleanState=pricerSnapshot();closePricer()'); }
await setSettings({settingProcessingFeeRate:0});
{ const n=await newJob(()=>item(0,{desc:'x',mode:'flat',price:200}),{setupMins:0}); const p=await save(n);
  check(+p.state.form.estimateSummary.processingFee===0,'0%: no card fee');
  const est=await pdfOf(()=>E(`generateSavedPDF('${p.id}','estimate')`)); check(!/Card Processing Fee/.test(est),'0%: no card fee line on the estimate');
  const tok=await share(p.id); check(!/Card Processing Fee/.test(await clientPage(tok)),'0%: no card fee line on the client page'); }
await setSettings({settingProcessingFeeRate:2.9});

startScenario('ST4','My costs (never shown to clients)','settings');
await setSettings({settingMyCostDesign:25,settingMyCostInstall:30,settingMyCostSetup:22});
{ const n=await newJob(()=>item(0,{desc:'x',mode:'flat',price:100,design:{hrs:2},install:{hrs:1}}),{setupHrs:1,setupMins:0}); const before=E('gatherPricerPDFData().total'); const p=await save(n); await sleep(40);
  const ex=E(`getExpenses('${p.id}')`); const cat=c=>ex.filter(e=>e.category===c).reduce((a,e)=>a+e.amount,0);
  check(near(cat('design'),50)&&near(cat('install'),30)&&near(cat('setup'),22),'recorded costs use my costs (design 2h×25, install 1h×30, setup 1h×22)',`${cat('design')}/${cat('install')}/${cat('setup')}`);
  check(near(+p.state.form.estimateSummary.total,before),'client price unaffected by my costs'); }

startScenario('ST5','Install speed','settings');
await setSettings({settingInstallSqftStandard:50});
{ const n=await newJob(()=>item(0,{desc:'x',vinyl:'Fellers Black Label Banner',w:10,wFt:true,h:10,hFt:true,install:{hrs:0}}));
  const t=items()[0].querySelector('.li-install-suggest-text').textContent; check(/~2h for 100\.0 sqft/.test(t),'100 sqft at 50 sqft/hr → ~2h',t);
  E('pricerCleanState=pricerSnapshot();closePricer()'); }

startScenario('ST6','Odd values typed in Settings','settings');
{ let ab=D.alerts.length; await setSettings({settingMarkup:0.5});
  check(D.alerts.length>ab&&/at least 1/.test(D.alerts.at(-1))&&E('getRates().markup')===3,'markup below 1 refused, nothing saved',D.alerts.at(-1));
  ab=D.alerts.length; await setSettings({settingPrintCost:-1});
  check(D.alerts.length>ab&&/below 0/.test(D.alerts.at(-1))&&E('getRates().printCost')===0.25,'negative print cost refused, nothing saved',D.alerts.at(-1));
  await setSettings({settingSetupRate:''}); check(E('getRates().setupRate')===60,'a box left empty keeps its value ($60)',E('getRates().setupRate'));
  await setSettings({settingMarkup:3,settingPrintCost:0.25,settingSetupRate:60}); }

// ── Business ──
startScenario('ST7','Business contact details','settings');
await setSettings({settingBizEmail:'hello@inkablestudios.com',settingBizPhone:'832-555-0199',settingBizInstagram:'@inkable.test'});
{ const n=await newJob(()=>item(0,{desc:'x',mode:'flat',price:50})); const p=await save(n);
  const est=await pdfOf(()=>E(`generateSavedPDF('${p.id}','estimate')`)), inv=await pdfOf(()=>E(`generateSavedPDF('${p.id}','invoice')`));
  E(`addPayment('${p.id}',10,'Cash','Oct 26, 2026')`); await sleep(20); const rc=await pdfOf(()=>E(`generateReceiptPDF('${p.id}')`));
  check(est.includes('hello@inkablestudios.com')&&est.includes('832-555-0199'),'estimate PDF: new email + phone');
  check(inv.includes('hello@inkablestudios.com')&&inv.includes('@inkable.test'),'invoice PDF: new email + Instagram');
  check(rc.includes('hello@inkablestudios.com'),'receipt PDF: new email');
  const tok=await share(p.id); const cp=await clientPage(tok); check(cp.includes('hello@inkablestudios.com')&&cp.includes('832-555-0199')&&cp.includes('@inkable.test'),'client page: new contact details');
  if(!/832-555-0199/.test(inv))note('settings','The shop phone number is printed on estimates but not on invoices or receipts.');
  const estAgain=await pdfOf(()=>E(`generateSavedPDF('${p.id}','estimate')`)); check(estAgain.includes('832-555-0199'),'an estimate already made keeps what it showed');
  await setSettings({settingBizPhone:''}); const n2=await newJob(()=>item(0,{desc:'y',mode:'flat',price:50})); const p2=await save(n2);
  const est2=await pdfOf(()=>E(`generateSavedPDF('${p2.id}','estimate')`)); const cp2=await clientPage(await share(p2.id));
  check(!est2.includes('832-555-0199')&&!cp2.includes('832-555-0199'),'blank phone: left off new estimates and the client page'); }

startScenario('ST8','Deposit %','settings');
await setSettings({settingDepositPct:30});
{ const n=await newJob(()=>item(0,{desc:'x',mode:'flat',price:100})); check($('depositPctInput').value==='30','new estimate starts at 30% deposit',$('depositPctInput').value);
  const p=await save(n); const tok=await share(p.id); const dd=await pub(tok); check(near(dd.depositAmount,r2(dd.estimateSummary.total*0.3)),'client page: 30% deposit',dd.depositAmount);
  check(near((await pub(refTok)).depositAmount,refDep),'saved job keeps its own deposit %');
  await setSettings({settingDepositPct:0}); const dp=E('getRates().depositPct');
  if(dp>0)note('settings',`There's no "no deposit / pay at completion" option: typing 0% saves ${dp}%. Trusted clients or net-terms jobs still get asked for a deposit online.`);
  await setSettings({settingDepositPct:50}); }

startScenario('ST9','Estimates valid for N days','settings');
await setSettings({settingEstimateValidDays:15});
{ const n=await newJob(()=>item(0,{desc:'x',mode:'flat',price:100})); const p=await save(n);
  const est=await pdfOf(()=>E(`generateSavedPDF('${p.id}','estimate')`)); check(/valid for 15 days/.test(est),'estimate PDF says 15 days');
  const dd=await pub(await share(p.id)); const days=Math.round((new Date(dd.validUntil)-Date.now())/864e5); check(days>=14&&days<=16,'client page: valid about 15 days',days);
  const rd=await pub(refTok); const rdays=Math.round((new Date(rd.validUntil)-Date.now())/864e5); check(rdays>=29,'saved job keeps its 30 days',rdays);
  await setSettings({settingEstimateValidDays:30}); }

startScenario('ST10','Sales tax rate','settings');
await setSettings({settingTaxRate:0});
{ const n=await newJob(()=>item(0,{desc:'x',mode:'flat',price:100}),{setupMins:0}); const g=E('gatherPricerPDFData()'); check(g.tax===0&&g.taxRate===0,'0%: no tax on new estimates');
  E('pricerCleanState=pricerSnapshot();closePricer()');
  const has=E("!!document.getElementById('pricerTaxRate')||[...document.querySelectorAll('#pricerOverlay input')].some(i=>/tax/i.test(i.id)&&i.type==='number')");
  if(!has)note('settings','The tax rate can only be set for the whole shop. A job installed somewhere with a different rate means changing Settings, saving the job, and changing it back.');
  await setSettings({settingTaxRate:8.25}); }
await refUnchanged('tax rate changed and back');

startScenario('ST11','Default notes and terms','settings');
await setSettings({settingDefaultNotes:'Thank you for choosing Inkable!',settingDefaultTerms:'50% deposit to start. Balance due at install.'});
{ const n=await newJob(()=>item(0,{desc:'x',mode:'flat',price:100})); check($('pricerNotes').value==='Thank you for choosing Inkable!'&&/Balance due at install/.test($('pricerTerms').value),'new estimate pre-filled with notes + terms');
  const p=await save(n); const est=await pdfOf(()=>E(`generateSavedPDF('${p.id}','estimate')`)); check(/Thank you for choosing/.test(est)&&/Balance due at install/.test(est),'estimate PDF prints them');
  const cp=await clientPage(await share(p.id)); check(/Balance due at install/.test(cp),'client page shows the terms before accepting'); }

// ── Materials ──
startScenario('ST12','Materials: odd names, price change, reset','settings');
{ const odd=`Joe's "Premium" 1/8" Vinyl`;
  await matUI('vinyl',async()=>{ U.type($('addMatInput_vinyl'),odd); E("addMaterial('vinyl')"); const r=row('vinyl',odd); const i=r.querySelector('input'); i.value='0.77'; i.dispatchEvent(new w.Event('change',{bubbles:true})); });
  check(E('getVinyl()')[odd]===0.77,'name with quotes/apostrophe/slash saved at $0.77');
  const n=await newJob(()=>item(0,{desc:'odd',vinyl:odd,w:12,h:12})); check(near(E('gatherPricerPDFData()').lineData[0].matTotal,r2((0.77+0.25)*1*3)),'priced right in the pricer');
  const p=await save(n); E(`editInPricer('${p.id}')`); await sleep(15); check(items()[0].querySelector('.li-vinyl').value===odd,'reopens with the same material'); E('closePricer()');
  const wo=await pdfOf(()=>E(`generateWorkOrderPDF('${p.id}')`)); check(wo.includes(`Joe's "Premium" 1/8" Vinyl`),'work order prints the name');
  await matUI('vinyl',async()=>{ const i=row('vinyl',odd).querySelector('input'); i.value='1.10'; i.dispatchEvent(new w.Event('change',{bubbles:true})); });
  check(near(E(`getProjectAmount(getProjects().find(x=>x.id==='${p.id}'))`),+p.state.form.estimateSummary.total),'price change: saved job keeps its price');
  const c=D.confirms.length; E('openSettings()'); await sleep(10); E("resetMatCategory('vinyl')"); E('saveSettings()'); await sleep(30); E('closeSettings()');
  check(!(odd in E('getVinyl()')),'reset to defaults removes custom vinyl');
  E(`editInPricer('${p.id}')`); await sleep(15); check(/job price kept/.test(items()[0].querySelector('.li-vinyl').selectedOptions[0].textContent),'…and the saved job keeps it at its price'); E('pricerCleanState=pricerSnapshot();closePricer()');
  E('openSettings()'); await sleep(10); const ab=D.alerts.length; U.type($('addMatInput_vinyl'),'Oracal 651 Intermediate Cal'); E("addMaterial('vinyl')"); check(D.alerts.length>ab,'duplicate name refused'); E('closeSettings()'); }

startScenario('ST13','"No Laminate" and "None" substrate stay','settings');
{ let ab=D.alerts.length; await matUI('laminate',async()=>{ row('laminate','No Laminate').querySelector('button').click(); });
  check(D.alerts.length>ab&&/can't be removed/.test(D.alerts.at(-1))&&('No Laminate' in E('getLaminate()')),'"No Laminate" can\'t be removed');
  ab=D.alerts.length; await matUI('substrate',async()=>{ row('substrate','None').querySelector('button').click(); });
  check(D.alerts.length>ab&&('None' in E('getSubstrate()')),'"None" substrate can\'t be removed');
  // an older save that lost them gets them back
  E("(()=>{const pd=getPricingData(); const l={...pd.laminate}; delete l['No Laminate']; const sb={...pd.substrate}; delete sb['None']; localStorage.setItem(PRICING_KEY,JSON.stringify({...pd,laminate:l,substrate:sb}));})()");
  const n=await newJob(()=>{}); const it=items()[0];
  check(it.querySelector('.li-lam').value==='No Laminate'&&it.querySelector('.li-sub').value==='None','a new item still starts with no laminate and no board',it.querySelector('.li-lam').value+' / '+it.querySelector('.li-sub').value);
  E('pricerCleanState=pricerSnapshot();closePricer()'); }

// ── Reminders ──
startScenario('ST14','Reminder days','settings');
await setSettings({settingStaleEstimateDays:3,settingOverdueBalanceDays:5});
{ const old=new Date(Date.now()-6*864e5); const n=await newJob(()=>item(0,{desc:'old quote',mode:'flat',price:100})); U.type($('pricerDate'),old.toISOString().slice(0,10)); const p=await save(n);
  E(`setJobMeta('${p.id}',{...getJobMeta('${p.id}'),statusAt:${old.getTime()}})`); await sleep(20);
  let rem=E('computeReminders()'); check(rem.some(r=>r.type==='stale'&&r.projectId===p.id),'stale estimate (6 days, limit 3) shows in the bell',JSON.stringify(rem.map(r=>r.type)));
  const old2=new Date(Date.now()-8*864e5); const n2=await newJob(()=>item(0,{desc:'unpaid',mode:'flat',price:100})); U.type($('pricerDate'),old2.toISOString().slice(0,10)); const p2=await save(n2);
  E(`addPayment('${p2.id}',20,'Cash','${old2.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}')`); await sleep(20);
  rem=E('computeReminders()'); check(rem.some(r=>r.type==='overdue'&&r.projectId===p2.id),'overdue balance (8 days, limit 5) shows in the bell');
  await setSettings({settingOverdueBalanceDays:30}); rem=E('computeReminders()'); check(!rem.some(r=>r.type==='overdue'&&r.projectId===p2.id),'raising the limit clears it');
  const bk=E('computeReminders()').some(r=>/backup/i.test(r.type||r.message||'')); check(bk,'backup reminder shows when no backup was ever downloaded');
  if(!E("typeof getReminderSettings==='function'&&'installReminderDays' in getReminderSettings()"))note('settings','No reminder for upcoming installs (e.g. the day before) or for a proof the client hasn\'t answered in N days; only quiet estimates, unpaid balances and backups.'); }

// ── Data ──
startScenario('ST15','Backup and restore keep Settings','settings');
{ let backup=null; w.downloadBlob=async(b,name)=>{ backup=await b.text(); }; const origCreate=w.URL.createObjectURL; let blob=null; w.URL.createObjectURL=b=>{ blob=b; return 'blob:x'; };
  w.HTMLAnchorElement.prototype.click=function(){}; E('exportAllData()'); await sleep(30); if(!backup&&blob)backup=await blob.text();
  check(!!backup&&/"markup":\s*3\b/.test(backup)&&/hello@inkablestudios\.com/.test(backup),'backup file contains rates and business details',String(backup).slice(0,0));
  w.URL.createObjectURL=origCreate;
  await setSettings({settingMarkup:4}); check(E('getRates().markup')===4,'changed after backup');
  if(backup){ const f=new w.File([backup],'b.json',{type:'application/json'}); await E('handleRestoreFile')({target:{files:[f],value:''}}); await sleep(120);
    const mk=E('getRates().markup'); if(mk!==3)note('settings',`Restoring a backup brings back jobs and clients but not your rates/Settings (markup stayed ${mk} instead of the backed-up 3).`);
    check(mk===3,'restore brings back the backed-up rates',mk); }
  await setSettings({settingMarkup:3}); }

startScenario('ST16','Settings reach a second device','settings');
{ const D2=await L.bootDashboard(S); await D2.E('pullFromServerOnLoad()'); await sleep(40);
  check(D2.E('getRates().markup')===3&&D2.E('getRates().setupRate')===60&&D2.E('getVinyl()')['Oracal 651 Intermediate Cal']!=null,'second device gets the same rates and materials');
  check(D2.E('getBusinessInfo().bizEmail')==='hello@inkablestudios.com','…and business details'); }

startScenario('ST17','Settings changed while the pricer is open','settings');
{ const n=await newJob(()=>item(0,{desc:'open',vinyl:'Fellers Black Label Banner',w:48,h:24})); const t1=E('gatherPricerPDFData().total');
  await setSettings({settingMarkup:3.5}); const t2=E('gatherPricerPDFData().total');
  check(t2>t1,'new (unsaved) estimate re-prices right away',`${t1} → ${t2}`);
  E('pricerCleanState=pricerSnapshot();closePricer()');
  E(`editInPricer('${ref.id}')`); await sleep(15); await setSettings({settingMarkup:3.8});
  check(near(E('gatherPricerPDFData().total'),refTotal)&&$('pricerRatesNotice').style.display==='block','saved job open in the pricer keeps its price, notice shown');
  E('pricerCleanState=pricerSnapshot();closePricer()'); await setSettings({settingMarkup:3}); }

console.log(`\nSETTINGS SIMS ${R.scen.length}  CHECKS ${R.checks}  PASSED ${R.passed}  FAILED ${R.fails.length}  NOTES ${R.issues.length}`);
fs.writeFileSync('sim-settings-results.json',JSON.stringify({checks:R.checks,passed:R.passed,fails:R.fails,notes:R.issues,scen:R.scen},null,1));
console.log('page errors',D.errs.slice(0,3),'server',S.serverLog.slice(0,3));
process.exit();
