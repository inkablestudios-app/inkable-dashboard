// New settings, group B (payments): card fee only when paying by card, no deposit, payment schedule.
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as L from './pass-lib.mjs';
const {check,near,r2,sleep,startScenario,R,pdfText,lineAmount,cent}=L;
const S=await L.bootServer(); const D=await L.bootDashboard(S); const {E,d,$,w}=D; const U=L.ui(D);
const items=()=>[...d.querySelectorAll('#lineItemsContainer .line-item')];
async function setX(vals){ E('openSettings()'); await sleep(15); for(const [k,v] of Object.entries(vals)){ const el=$('xs-'+k)||$(k); if(el.type==='checkbox')el.checked=!!v; else if(el.tagName==='SELECT')U.pick(el,String(v)); else U.type(el,v); } E('saveSettings()'); await sleep(30); E('closeSettings()'); }
let num=8101;
E("addClient({name:'Group B Co',email:'b@example.com'})"); await sleep(40); const cid=E('getClients()[0].id');
async function job(price,extra){ const n=num++; E(`openPricer(${n},'${cid}')`); await sleep(15); L.fillItem(D,items()[0],{desc:'Sign',mode:'flat',price}); L.fillJob(D,{setupMins:0}); if(extra)extra(); E('recalc()'); $('pricerSaveBtn').click(); await sleep(90); E('closePricer()'); return E(`getProjects().find(p=>p.estNo==='EST-${n}')`); }
const share=async id=>(await (await S.route('/api/proof-share',{method:'POST',body:JSON.stringify({projectId:id})})).json()).token;
const pub=async tok=>(await (await S.route('/api/proof-public?token='+tok)).json());
const accept=async (tok,total)=>(await S.route('/api/proof-public?token='+tok,{method:'POST',body:JSON.stringify({action:'accept-estimate',name:'Pat Client',total})})).status;
const checkout=async(tok,type)=>{ const n=S.stripe.created.length; const r=await S.route('/api/create-checkout-session',{method:'POST',body:JSON.stringify({token:tok,amountType:type})}); return {status:r.status,body:await r.json(),ses:S.stripe.created.length>n?S.stripe.created.at(-1):null}; };
const page=async tok=>{ const cp=new JSDOM(fs.readFileSync(L.ROOT+'proof.html','utf8'),{url:'https://x.netlify.app/proof.html?token='+tok,runScripts:'dangerously',virtualConsole:new VirtualConsole(),beforeParse(cw){cw.fetch=S.route;}}); await sleep(80); return cp.window.document; };
const txt=doc=>(doc.getElementById('mainCard')?.textContent||'').replace(/\s+/g,' ');
const pull=async()=>{ await E('pullFromServerOnLoad()'); await sleep(30); };

startScenario('B1','Card fee only when paying by card','new');
await setX({feeMode:'cardOnly',feeFixed:0.3});
{ const p=await job(100); const s=p.state.form.estimateSummary;
  check(near(+s.total,108.25)&&!(+s.processingFee>0),'estimate total leaves the card fee out ($108.25)',s.total);
  check(s.cardFeeOnCard===true&&s.cardFeePct===2.9&&s.cardFeeFixed===0.3,'job remembers: fee 2.9% + $0.30 at card checkout');
  const tok=await share(p.id); let doc=await page(tok); let t=txt(doc);
  const depFee=cent(54.13*0.029+0.3);
  check(t.includes(`Accept & Pay 50% Deposit — $54.13 + $${depFee.toFixed(2)} card fee`),'client page: deposit button shows the card fee',t.slice(0,0));
  check(/No fee for cash, check or Zelle/.test(t),'client page explains the fee');
  check(await accept(tok,108.25)===200,'accepted');
  const ck=await checkout(tok,'deposit'); check(ck.ses&&ck.ses.base===5413&&ck.ses.amount===5413+Math.round(depFee*100)&&ck.ses.lines===2,'Stripe: $54.13 + a separate card-fee line',JSON.stringify({base:ck.ses?.base,amount:ck.ses?.amount,lines:ck.ses?.lines}));
  await S.stripe.pay(ck.ses); await pull();
  const pays=E(`getPayments('${p.id}')`); check(pays.length===1&&near(pays[0].amount,54.13)&&near(pays[0].cardFee,depFee),'recorded: $54.13 toward the job + the card fee kept apart',JSON.stringify(pays));
  check(near(E(`Math.max(0,getProjectAmount(getProjects().find(x=>x.id==='${p.id}'))-getAmountPaid('${p.id}'))`),54.12),'balance $54.12 (fee doesn\'t count toward the job)');
  const rep=E("computeReportsData('month',0)"); check(rep.revenueCollected>=54.13+depFee-0.001,'Reports: money in includes the card fee');
  const rc=await (async()=>{ const k=D.pdfs.length; E(`generateReceiptPDF('${p.id}')`); await sleep(40); return pdfText(D.pdfs.at(-1).buf); })();
  check(/card fee/.test(rc),'receipt mentions the card fee');
  const est=await (async()=>{ E(`generateSavedPDF('${p.id}','estimate')`); await sleep(40); return pdfText(D.pdfs.at(-1).buf); })();
  check(/Paying by card adds a 2.9% \+ \$0.30 card fee/.test(est.replace(/\s+/g,' ')),'estimate PDF says paying by card adds the fee');
  // cash payment: no fee at all
  E(`addPayment('${p.id}',54.12,'Cash','Oct 26, 2026')`); await sleep(30);
  check(near(E(`getAmountPaid('${p.id}')`),108.25),'cash balance pays it off with no fee'); }
await setX({feeMode:'always',feeFixed:0});

startScenario('B2','No deposit (pay at completion)','new');
await setX({settingDepositPct:0});
{ check(E('getRates().depositPct')===0,'Settings accepts 0% deposit');
  const p=await job(500); check(JSON.parse(p.state.form.pricerData).depositPct===0,'new estimate saved with 0% deposit');
  const tok=await share(p.id); const d0=await pub(tok); check(d0.nextPayment===null&&d0.depositPct===0,'server: nothing due until completion');
  let doc=await page(tok); let t=txt(doc);
  check(/Accept Estimate — pay when it's done/.test(t)&&/Accept & Pay in Full/.test(t)&&!/Deposit/.test(t),'client page: accept now / pay in full, no deposit button');
  check((await checkout(tok,'deposit')).status===400,'a deposit checkout is refused');
  check(await accept(tok,+d0.estimateSummary.total)===200,'accepting without paying works');
  doc=await page(tok); t=txt(doc); check(/No deposit needed/.test(t)&&/Pay in Full Now/.test(t),'after accepting: "no deposit needed", pay in full button');
  await pull(); check(E(`isJobCommitted('${p.id}')`),'accepted job counts as owed (committed)');
  const ck=await checkout(tok,'full'); check(ck.ses&&near(ck.ses.amount/100,+d0.estimateSummary.total),'paying in full works'); }
await setX({settingDepositPct:50});

startScenario('B3','Payment schedule 50/40/10','new');
{ const p=await job(1000,()=>U.type($('paySchedule'),'50/40/10')); const s=p.state.form.estimateSummary; const T=+s.total;
  check(JSON.stringify(s.paySchedule)==='[50,40,10]','schedule saved with the job');
  const tok=await share(p.id); let doc=await page(tok); let t=txt(doc);
  check(t.includes(`Accept & Pay Payment 1 of 3 (50%) — $${cent(T/2).toLocaleString('en-US',{minimumFractionDigits:2})}`),'client page: first payment 50%',t.slice(0,0));
  await accept(tok,T);
  let ck=await checkout(tok,'deposit'); check(near(ck.ses.amount/100,cent(T*0.5)),'payment 1: 50%'); await S.stripe.pay(ck.ses);
  doc=await page(tok); t=txt(doc); check(/Pay Payment 2 of 3 \(40%\)/.test(t)&&/Pay Remaining Balance/.test(t),'then: payment 2 (40%) or pay off the rest');
  ck=await checkout(tok,'next'); check(near(ck.ses.amount/100,cent(T*0.9)-cent(T*0.5)),'payment 2: 40%',ck.ses.amount); check(/Payment 2 of 3/.test(ck.ses.desc),'Stripe line says Payment 2 of 3'); await S.stripe.pay(ck.ses);
  ck=await checkout(tok,'next'); check(near(ck.ses.amount/100,cent(T-cent(T*0.9))),'payment 3: the last 10%',ck.ses.amount); await S.stripe.pay(ck.ses);
  const d3=await pub(tok); check(d3.balance===0,'paid in full after 3 payments');
  await pull(); check(E(`getPayments('${p.id}')`).length===3,'3 payments on the job');
  E(`generateSavedPDF('${p.id}','estimate')`); await sleep(40); const est=pdfText(D.pdfs.at(-1).buf).replace(/\s+/g,' ');
  check(/Payments: 50% \(\$[\d,.]+\) · 40% \(\$[\d,.]+\) · 10% \(\$[\d,.]+\)/.test(est),'estimate PDF lists the schedule'); }

startScenario('B4','Schedule typing mistakes','new');
{ const n=num++; E(`openPricer(${n},'${cid}')`); await sleep(15); L.fillItem(D,items()[0],{desc:'x',mode:'flat',price:100}); U.type($('paySchedule'),'50/40');
  const ab=D.alerts.length; $('pricerSaveBtn').click(); await sleep(40); check(D.alerts.length>ab&&/add up to 100/.test(D.alerts.at(-1)),'50/40 (adds to 90) is refused');
  E('pricerCleanState=pricerSnapshot();closePricer()');
  E('openSettings()'); await sleep(10); U.type($('xs-paySchedule'),'abc'); const ab2=D.alerts.length; E('saveSettings()'); check(D.alerts.length>ab2,'a bad default schedule in Settings is refused'); E('closeSettings()'); }

console.log(`\nGROUP B  CHECKS ${R.checks}  PASSED ${R.passed}  FAILED ${R.fails.length}`); R.fails.forEach(f=>console.log(' FAIL',f.scen,f.what,f.detail));
console.log('errors',D.errs.slice(0,3),S.serverLog.slice(0,3)); process.exit();
