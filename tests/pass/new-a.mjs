// New settings, group A (pricing): each setting with a real value, checked
// in the pricer, the saved job, the PDF and the client page.
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as L from './pass-lib.mjs';
const {check,near,r2,sleep,startScenario,R,pdfText,lineAmount,cent}=L;
const S=await L.bootServer(); const D=await L.bootDashboard(S); const {E,d,$,w}=D; const U=L.ui(D);
const items=()=>[...d.querySelectorAll('#lineItemsContainer .line-item')];
async function setX(vals){ E('openSettings()'); await sleep(15); for(const [k,v] of Object.entries(vals)){ const el=$('xs-'+k)||$(k); if(el.type==='checkbox')el.checked=!!v; else if(el.tagName==='SELECT')U.pick(el,String(v)); else U.type(el,v); } E('saveSettings()'); await sleep(30); E('closeSettings()'); }
async function matSet(cat,name,{mk,waste}={}){ E('openSettings()'); await sleep(15); const r=[...d.querySelectorAll(`#${cat}CostRows .mat-row`)].find(x=>x.dataset.name===name);
  if(mk!==undefined){ const i=r.querySelector('.mat-mk'); i.value=String(mk); i.dispatchEvent(new w.Event('change',{bubbles:true})); }
  if(waste!==undefined){ const i=r.querySelector('.mat-waste'); i.value=String(waste); i.dispatchEvent(new w.Event('change',{bubbles:true})); }
  E('saveSettings()'); await sleep(30); E('closeSettings()'); }
let num=8001;
E("addClient({name:'Group A Co',email:'a@example.com'})"); await sleep(40); const cid=E('getClients()[0].id');
async function job(fill,jobv){ const n=num++; E(`openPricer(${n},'${cid}')`); await sleep(15); fill(); if(jobv)L.fillJob(D,jobv); E('recalc()'); return n; }
const item=(i,o)=>{ if(i>0)d.querySelector('.add-line-btn').click(); L.fillItem(D,items()[i],o); };
async function save(n){ $('pricerSaveBtn').click(); await sleep(90); E('closePricer()'); return E(`getProjects().find(p=>p.estNo==='EST-${n}')`); }
const g=()=>E('gatherPricerPDFData()');
const pdfOf=async fn=>{ const k=D.pdfs.length; await fn(); await sleep(30); const p=D.pdfs.slice(k); return p.length?pdfText(p.at(-1).buf):''; };
const clientPage=async id=>{ const tok=(await (await S.route('/api/proof-share',{method:'POST',body:JSON.stringify({projectId:id})})).json()).token; const cp=new JSDOM(fs.readFileSync(L.ROOT+'proof.html','utf8'),{url:'https://x.netlify.app/proof.html?token='+tok,runScripts:'dangerously',virtualConsole:new VirtualConsole(),beforeParse(cw){cw.fetch=S.route;}}); await sleep(80); return cp.window.document.getElementById('mainCard')?.textContent||''; };
const close=()=>E('pricerCleanState=pricerSnapshot();closePricer()');

startScenario('A1','Labor per sq ft','new');
await setX({printLaborRate:0.5,cutLaborRate:1});
{ await job(()=>{ item(0,{desc:'printed',vinyl:'Orajet 3165 (4 Mil Intermediate Calendered)',w:24,h:24}); item(1,{desc:'cut',vinyl:'Oracal 651 Intermediate Cal',printed:false,w:24,h:24}); });
  const x=g(); check(near(x.lineData[0].matTotal,cent((0.41+0.15)*4*2.5+0.5*4)),'printed item: + $0.50/sqft print labor',x.lineData[0].matTotal);
  check(near(x.lineData[1].matTotal,cent(0.48*4*2.5+1*4)),'cut item: + $1.00/sqft cut & weed labor',x.lineData[1].matTotal); close(); }

startScenario('A2',"Customer's material",'new');
{ await job(()=>{ item(0,{desc:'their canvas',vinyl:'Orajet 3165 (4 Mil Intermediate Calendered)',w:10,wFt:true,h:7,hFt:true}); items()[0].querySelector('.li-cust-chk').click();
    item(1,{desc:'their vinyl, cut',vinyl:'Oracal 651 Intermediate Cal',printed:false,w:10,wFt:true,h:7,hFt:true}); items()[1].querySelector('.li-cust-chk').click();
    item(2,{desc:'their media + our laminate',vinyl:'Orajet 3165 (4 Mil Intermediate Calendered)',lam:'Oraguard 210 Over-Laminate',w:24,h:24}); items()[2].querySelector('.li-cust-chk').click(); });
  const x=g(); check(near(x.lineData[0].matTotal,175),'70 sqft print only at $2.50 = $175',x.lineData[0].matTotal);
  check(near(x.lineData[1].matTotal,105),'70 sqft cut only at $1.50 = $105',x.lineData[1].matTotal);
  check(near(x.lineData[2].matTotal,cent(2.5*4+0.42*4*2.5)),'our laminate on their media still charged',x.lineData[2].matTotal);
  check(/customer-supplied material/.test(x.lineData[0].desc),'estimate line says customer-supplied material',x.lineData[0].desc);
  const c0=E("calcLine(document.querySelectorAll('.line-item')[0])"); check(near(c0.rawMatCost,0.15*70),'your cost = ink only ($0.15 × 70)',c0.rawMatCost);
  const p=await save(num-1); const s=p.state.form.estimateSummary; check(near(s.lineItems[0].matTotal,175),'saved at $175');
  E(`editInPricer('${p.id}')`); await sleep(15); check(items()[0].querySelector('.li-cust-chk').checked,'reopened: still customer\'s material'); close(); }

startScenario('A3','Markup and waste per material','new');
await matSet('vinyl','Fellers Black Label Banner',{mk:4});
await matSet('vinyl','3M IJ175C Cast Vinyl',{waste:10});
await matSet('substrate','Coroplast',{mk:3.5,waste:5});
{ await job(()=>{ item(0,{desc:'banner',vinyl:'Fellers Black Label Banner',w:8,wFt:true,h:3,hFt:true}); item(1,{desc:'wrap',vinyl:'3M IJ175C Cast Vinyl',lam:'3M 8508 Over-Laminate',w:10,wFt:true,h:5,hFt:true}); item(2,{desc:'sign',vinyl:'Orajet 3165 (4 Mil Intermediate Calendered)',w:24,h:18,sub:'Coroplast'}); });
  const x=g();
  check(near(x.lineData[0].matTotal,cent(0.22*24*4+0.15*24*2.5+0.5*24)),'banner: material at its own ×4, print at shop ×2.5, labor not marked up',x.lineData[0].matTotal);
  check(near(x.lineData[1].matTotal,cent((0.86+0.57+0.15)*50*1.1*2.5+0.5*50)),'wrap film: +10% waste on film, laminate and ink; labor on the real 50 sqft',x.lineData[1].matTotal);
  check(near(x.lineData[2].matTotal,cent((0.41+0.15)*3*2.5+0.65*3*1.05*3.5+0.5*3)),'coroplast: its own ×3.5 and 5% waste',x.lineData[2].matTotal);
  const c1=E("calcLine(document.querySelectorAll('.line-item')[1])"); check(near(c1.rawMatCost,(0.86+0.57+0.15)*55),'your cost includes the waste',c1.rawMatCost);
  close(); }

startScenario('A4','Quantity breaks','new');
await setX({qtyBreaks:'10=5, 50=10'});
{ await job(()=>{ item(0,{desc:'yard signs',vinyl:'Orajet 3165 (4 Mil Intermediate Calendered)',w:24,h:18,qty:25,sub:'Coroplast'}); item(1,{desc:'stickers',mode:'flat',flat:'unit',price:0.45,qty:500}); item(2,{desc:'one sign',vinyl:'Orajet 3165 (4 Mil Intermediate Calendered)',w:24,h:18,qty:5}); });
  const x=g(); const sq=3*25;
  check(near(x.lineData[0].matTotal,cent(((0.41+0.15)*sq*2.5+0.65*sq*1.05*3.5+0.5*sq)*0.95)),'25 pcs: 5% off',x.lineData[0].matTotal);
  check(near(x.lineData[1].matTotal,cent(0.45*500*0.9)),'500 per-unit stickers: 10% off',x.lineData[1].matTotal);
  check(near(x.lineData[2].matTotal,cent((0.41+0.15)*15*2.5+0.5*15)),'5 pcs: no break',x.lineData[2].matTotal);
  check(/5% quantity discount/.test(x.lineData[0].desc)&&!/quantity discount/.test(x.lineData[2].desc),'documents say which items got a quantity discount');
  close(); }
await setX({qtyBreaks:''});

startScenario('A5','Rush fee','new');
await setX({rushPct:15});
{ await job(()=>{ item(0,{desc:'x',mode:'flat',price:200,design:{hrs:1}}); $('rushChk').click(); });
  const x=g(); check(near(x.rushTotal,cent((200+65+10)*0.15)),'rush = 15% of items + design + setup',x.rushTotal);
  check(/\+15%/.test($('rushLabel').textContent),'label shows the %');
  const p=await save(num-1); await sleep(60);
  check(E(`getJobMeta('${p.id}').tags`).includes('rush'),'rush job gets the Rush tag');
  const est=await pdfOf(()=>E(`generateSavedPDF('${p.id}','estimate')`)); check(near(lineAmount(est,'Rush Fee'),x.rushTotal),'estimate PDF: Rush Fee line');
  check(/Rush Fee/.test(await clientPage(p.id)),'client page: Rush Fee line'); }

startScenario('A6','Trip charge','new');
await setX({tripBase:25,tripPerMile:1.5,tripFreeMiles:10});
{ await job(()=>{ item(0,{desc:'install',mode:'flat',price:0,install:{hrs:2}}); $('tripChk').click(); U.type($('tripMiles'),30); });
  const x=g(); check(near(x.tripTotal,55),'30 miles: $25 + 20 × $1.50 = $55',x.tripTotal);
  const p=await save(num-1); const inv=await pdfOf(()=>E(`generateSavedPDF('${p.id}','invoice')`)); check(near(lineAmount(inv,'Trip Charge'),55),'invoice PDF: Trip Charge $55');
  E(`editInPricer('${p.id}')`); await sleep(15); check($('tripChk').checked&&$('tripMiles').value==='30','reopened: trip + miles kept'); close(); }

startScenario('A7','Tax rate for one job','new');
{ await job(()=>{ item(0,{desc:'x',mode:'flat',price:100}); U.type($('pricerTaxRate'),6.25); },{setupMins:0});
  const x=g(); check(x.taxRate===6.25&&near(x.tax,6.25),'6.25% on this job',x.tax);
  const p=await save(num-1); check(JSON.parse(p.state.form.pricerData).taxRate===6.25,'saved with the job');
  const est=await pdfOf(()=>E(`generateSavedPDF('${p.id}','estimate')`)); check(/6\.25%/.test(est),'estimate PDF shows 6.25%');
  check(E('getRates().taxRate')===8.25,'shop rate unchanged'); }

startScenario('A8','New-estimate defaults','new');
await setX({defaultSetupMins:30,minChargeDefault:50,minChargeOn:true,feeBoxDefault:false});
{ await job(()=>item(0,{desc:'x',mode:'flat',price:10}));
  check($('setupHrs').value==='0'&&$('setupMins').value==='30','setup starts at 30 min');
  check($('minChargeChk').checked&&$('minChargeVal').value==='50','minimum charge on at $50');
  check(!$('processingFeeChk').checked,'card fee box starts unticked');
  check(near(g().total,cent(50*1.0825)),'a $10 item becomes the $50 minimum (+ tax)',g().total); close(); }
await setX({defaultSetupMins:15,minChargeOn:false,feeBoxDefault:true});

startScenario('A9','Card fee fixed part','new');
await setX({feeFixed:0.3});
{ await job(()=>item(0,{desc:'x',mode:'flat',price:100}),{setupMins:0});
  check(near(g().processingFee,cent(108.25*0.029+0.3)),'fee = 2.9% + $0.30',g().processingFee); close(); }

startScenario('A10','Saved jobs keep these settings','new');
{ await job(()=>{ item(0,{desc:'banner',vinyl:'Fellers Black Label Banner',w:8,wFt:true,h:3,hFt:true}); $('rushChk').click(); });
  const p=await save(num-1); const t0=+p.state.form.estimateSummary.total;
  await setX({printLaborRate:2,rushPct:40,feeFixed:1}); await matSet('vinyl','Fellers Black Label Banner',{mk:6});
  E(`editInPricer('${p.id}')`); await sleep(15);
  check(near(g().total,t0),'reopened after Settings changed: same price',`${g().total} vs ${t0}`);
  check($('pricerRatesNotice').style.display==='block','notice offers today\'s rates');
  $('pricerRatesNotice').querySelector('button').click(); await sleep(10);
  check(g().total>t0+1,'"Use today\'s rates" picks up the new labor, rush, markup and fee',`${t0} → ${g().total}`); close();
  E(`copyJobToNewEstimate('${p.id}')`); await sleep(15); check(g().total>t0+1,'copy as new uses today\'s settings'); close(); }

console.log(`\nGROUP A  CHECKS ${R.checks}  PASSED ${R.passed}  FAILED ${R.fails.length}`); R.fails.forEach(f=>console.log(' FAIL',f.scen,f.what,f.detail));
console.log('errors',D.errs.slice(0,3)); process.exit();
