import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as L from './pass-lib.mjs';
import { SCENARIOS, NONE_MAT, CUST_MAT, PERF, MAGNET, FLOORLAM } from './pass-scen.mjs';
const {check,note,near,r2,money,sleep,startScenario,R,pdfText,lineAmount,amountsIn}=L;

const S=await L.bootServer(); const D=await L.bootDashboard(S);
const {E,d,$,w}=D; const U=L.ui(D);
const ONLY=process.argv[2]?process.argv[2].split(','):null;
const rates=L.ratesOf(E);
const fmt$=n=>'$'+(+n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

// ── helpers ────────────────────────────────────────────────────────────
const clients={};
async function clientFor(name){
  if(clients[name])return clients[name];
  const slug=name.toLowerCase().replace(/[^a-z]+/g,'.');
  E(`addClient(${JSON.stringify({name,phone:'281-555-0'+(100+Object.keys(clients).length),email:slug+'@example.com',addr:'100 Main St',city:'Katy',state:'TX',zip:'77494'})})`);
  await sleep(40);
  const c=E('getClients()').find(c=>c.name===name); clients[name]=c.id; return c.id;
}
async function addMaterialUI(category,name,cost){
  if(Object.prototype.hasOwnProperty.call(E(category==='vinyl'?'getVinyl()':category==='laminate'?'getLaminate()':'getSubstrate()'),name))return;
  E('openSettings()'); await sleep(20);
  const inp=$('addMatInput_'+category); U.type(inp,name); E(`addMaterial('${category}')`);
  const row=[...d.querySelectorAll(`#${category}CostRows .mat-row`)].find(r=>r.dataset.name===name);
  check(!!row,`Settings: new ${category} "${name}" row appears`);
  const ci=row.querySelector('input'); ci.value=String(cost); ci.dispatchEvent(new w.Event('change',{bubbles:true}));
  E('saveSettings()'); await sleep(40);
  const list=E(category==='vinyl'?'getVinyl()':category==='laminate'?'getLaminate()':'getSubstrate()');
  check(list[name]===cost,`Settings: "${name}" saved at $${cost}`,JSON.stringify(list[name]));
  const srv=(await S.pg.query('select data from pricing_settings where id=1')).rows[0]?.data;
  check(srv&&srv[category]&&srv[category][name]===cost,`Settings: "${name}" reached the server`);
  if(typeof E('closeSettings')==='function')E('closeSettings()');
}
const pdfsSince=n=>D.pdfs.slice(n);
async function pdfOf(fn){ const n=D.pdfs.length; await fn(); await sleep(30); const p=pdfsSince(n); return p.length?pdfText(p[p.length-1].buf):null; }
const errsBefore=()=>({dash:D.errs.length,srv:S.serverLog.length,alerts:D.alerts.length});
function noNewErrors(b,where){
  const de=D.errs.slice(b.dash), se=S.serverLog.slice(b.srv), al=D.alerts.slice(b.alerts);
  check(!de.length,`${where}: no page errors`,de.join(' | '));
  check(!se.length,`${where}: no server errors`,se.join(' | '));
  return al;
}
const items=()=>[...d.querySelectorAll('#lineItemsContainer .line-item')];
async function openAndFill(sc,num){
  const cid=sc.noClient?'':await clientFor(sc.client);
  E(`openPricer(${num},'${cid}')`); await sleep(15);
  sc.items.forEach((it,i)=>{ if(i>0)d.querySelector('.add-line-btn').click(); L.fillItem(D,items()[i],it); });
  L.fillJob(D,sc.job);
  E('recalc()');
  return cid;
}
const dimShown=(v,ft)=>+(+(Math.max(0,v))).toFixed(3)+(ft?' ft':'"');

// Check the three totals boxes on a PDF / page add up and match expected.
function checkTotalsText(where,t,exp,sc){
  if(!check(!!t,`${where}: was created`))return;
  const tot=lineAmount(t,'TOTAL',true)??lineAmount(t,'Total',true);
  check(tot!=null&&near(tot,r2(exp.total)),`${where}: total ${fmt$(exp.total)}`,`shows ${tot}`);
  const sub=lineAmount(t,'Subtotal');
  if(exp.total>0)check(sub!=null&&near(sub,r2(exp.taxable)),`${where}: subtotal ${fmt$(exp.taxable)}`,`shows ${sub}`);
  const tax=lineAmount(t,'Sales Tax');
  if(!sc.job?.taxExempt&&exp.total>0)check(tax!=null&&near(tax,r2(exp.tax)),`${where}: tax ${fmt$(exp.tax)}`,`shows ${tax}`);
  const fee=lineAmount(t,'Card Processing Fee');
  if(exp.fee>0.005)check(fee!=null&&near(fee,r2(exp.fee)),`${where}: card fee ${fmt$(exp.fee)}`,`shows ${fee}`);
  else check(fee==null,`${where}: no card fee line`,`shows ${fee}`);
  if(exp.disc>0.005){ const dc=lineAmount(t,'Discount'); check(dc!=null&&near(Math.abs(dc),r2(exp.disc)),`${where}: discount ${fmt$(exp.disc)}`,`shows ${dc}`); }
  if(exp.minAdj>0.005){ const m=lineAmount(t,'Minimum'); check(m!=null&&near(m,r2(exp.minAdj)),`${where}: minimum-charge line ${fmt$(exp.minAdj)}`,`shows ${m}`); }
  // what a reader sees must add up to the cent
  if(sub!=null&&tot!=null){
    const shownTax=tax??0, shownFee=fee??0;
    check(near(r2(sub+shownTax+shownFee),tot,0.001),`${where}: subtotal + tax + fee = total (to the cent)`,`${sub} + ${shownTax} + ${shownFee} = ${r2(sub+shownTax+shownFee)} vs ${tot}`);
  }
}
// Sum of the printed item + extra rows must equal the printed subtotal.
function checkRowsAddUp(where,t,sc,exp){
  if(!t||exp.total<=0)return;
  const lines=t.split('\n'); const subIdx=lines.findIndex(l=>/Subtotal/.test(l)); if(subIdx<0)return;
  const startIdx=lines.findIndex(l=>/DESCRIPTION/.test(l));
  const amts=lines.slice(startIdx+1,subIdx).flatMap(l=>amountsIn(l));
  const sum=r2(amts.reduce((s,a)=>s+a,0)); const sub=lineAmount(t,'Subtotal');
  check(near(sum,sub,0.001),`${where}: item rows + extras add up to the subtotal (to the cent)`,`rows ${sum} vs subtotal ${sub}`);
}

// ── one project through pricer → save → reopen → PDFs → pages ─────────
async function runPricing(sc,num){
  startScenario(sc.id,sc.name,sc.tier);
  for(const m of sc.needs||[])await addMaterialUI('vinyl',m,m===PERF?0.95:m==='Magnet 30 mil'?1.1:0);
  for(const m of sc.needsLam||[])await addMaterialUI('laminate',m,0.9);
  const b=errsBefore();
  await openAndFill(sc,num);
  const exp=L.expected(sc,rates,L.matsOf(E)); sc.exp=exp;
  const live=E('gatherPricerPDFData()');
  // 1. live price in the pricer
  check(near(live.total,exp.total),`pricer total ${fmt$(exp.total)}`,`pricer ${live.total}`);
  ['totalMat:items','designTotal:design','totalInstall:install','setupTotal:setup','hardwareTotal:hardware','disc:disc','minChargeAdj:minAdj','tax:tax','processingFee:fee'].forEach(k=>{
    const [a,e]=k.split(':'); check(near(live[a]||0,exp[e]),`pricer ${e} ${fmt$(exp[e])}`,`pricer ${live[a]}`); });
  live.lineData.forEach((l,i)=>{ check(near(l.matTotal,exp.lines[i].price),`item ${i+1} price ${fmt$(exp.lines[i].price)}`,`pricer ${l.matTotal}`);
    check(near(l.sqft,exp.lines[i].sqft,0.0005),`item ${i+1} sqft ${exp.lines[i].sqft.toFixed(2)}`,`pricer ${l.sqft}`); });
  const shown=money(d.querySelector('.lp-total-row .val')?.textContent), mob=money($('pricerMobileTotal')?.textContent);
  check(near(shown,r2(exp.total)),'live preview shows the total',shown); check(near(mob,r2(exp.total)),'phone total bar shows the total',mob);
  const mpMat=money($('mp-mat')?.textContent); check(near(mpMat,exp.costs.materials,0.006),`margin panel: material cost ${fmt$(exp.costs.materials)}`,mpMat);
  // 2. save
  const ab=D.alerts.length; $('pricerSaveBtn').click(); await sleep(90);
  const alerts=D.alerts.slice(ab);
  if(sc.expectBlocked){ check(alerts.length>0,'save is refused',alerts.join()); return null; }
  check(!alerts.length,'save goes through without a warning',alerts.join(' | '));
  const p=E(`getProjects().find(p=>p.estNo==='EST-${num}')`);
  if(!check(!!p,'job appears in Projects'))return null;
  sc.pid=p.id;
  const s=p.state.form.estimateSummary||{};
  check(near(+s.total,exp.total),'saved total = pricer total',s.total);
  check((s.lineItems||[]).length===sc.items.length,'saved one line per item',(s.lineItems||[]).length);
  check(+s.depositPct===exp.depPct,`saved deposit ${exp.depPct}%`,s.depositPct);
  const srv=(await S.pg.query('select state,client_id from projects where id=$1',[p.id])).rows[0];
  check(srv&&near(+srv.state.form.estimateSummary.total,exp.total),'server has the job with the same total',srv?.state?.form?.estimateSummary?.total);
  if(!sc.noClient)check(srv?.client_id===clients[sc.client],'server: job linked to the client',srv?.client_id);
  // 3. cost seeded as expenses
  await sleep(40);
  const ex=E(`getExpenses('${p.id}')`).filter(e=>e.source==='pricer');
  const byCat=c=>r2(ex.filter(e=>e.category===c).reduce((a,e)=>a+e.amount,0));
  for(const c of ['materials','design','install','setup','hardware'])
    check(near(byCat(c),exp.costs[c],0.011),`cost "${c}" recorded ${fmt$(exp.costs[c])}`,byCat(c));
  // 4. close + reopen: nothing changes
  const cb=D.confirms.length; check(E('closePricer()')===true&&D.confirms.length===cb,'closing after save asks nothing');
  E(`editInPricer('${p.id}')`); await sleep(15);
  const live2=E('gatherPricerPDFData()');
  check(near(live2.total,exp.total),'reopened: same total',live2.total);
  check(E('pricerSnapshot()===pricerCleanState'),'reopened: not marked as changed');
  sc.items.forEach((it,i)=>{
    const el=items()[i]; if(!el){ check(false,`reopened: item ${i+1} is there`); return; } const q=s=>el.querySelector(s);
    check(q('.line-desc').value===(it.desc||''),`reopened item ${i+1}: description`,q('.line-desc').value);
    if(it.mode==='flat'){ check(el.dataset.pricingMode==='flat',`reopened item ${i+1}: flat mode`);
      check(el.dataset.flatSubMode===(it.flat==='unit'?'unit':'total'),`reopened item ${i+1}: ${it.flat==='unit'?'per-unit':'total'} price mode`); }
    else{
      check(q('.li-vinyl').value===it.vinyl,`reopened item ${i+1}: material`,q('.li-vinyl').value);
      check(q('.li-lam').value===(it.lam||'No Laminate'),`reopened item ${i+1}: laminate`);
      check(q('.li-printed-chk').checked===(it.printed!==false),`reopened item ${i+1}: printed box`);
      const wft=q('.li-w-unit[data-unit="ft"]').classList.contains('active'), hft=q('.li-h-unit[data-unit="ft"]').classList.contains('active');
      check(wft===!!it.wFt&&hft===!!it.hFt,`reopened item ${i+1}: in/ft units`);
      check(near(+q('.li-w').value,Math.max(0,it.w),0.001)&&near(+q('.li-h').value,Math.max(0,it.h),0.001),`reopened item ${i+1}: size ${it.w}×${it.h}`,q('.li-w').value+'×'+q('.li-h').value);
      if(it.sub){ check(q('.li-sub').value===it.sub,`reopened item ${i+1}: substrate`);
        if(it.subW!=null)check(!q('.li-sub-samesize').checked&&near(+q('.li-sub-w').value,it.subW,0.001)&&near(+q('.li-sub-h').value,it.subH,0.001),`reopened item ${i+1}: board size`);
        if(it.thick)check(q('.li-sub-thickness').value===it.thick,`reopened item ${i+1}: thickness`); }
    }
    check(near(+q('.li-qty').value,Math.max(1,+(it.qty??1)||1)),`reopened item ${i+1}: qty`,q('.li-qty').value);
    if(it.design)check(q('.li-design-chk').checked&&el.dataset.designLevel===(it.design.level||'standard'),`reopened item ${i+1}: design + level`);
    if(it.install){ check(q('.li-install-chk').checked,`reopened item ${i+1}: install ticked`);
      if(it.install.flat!=null)check(el.dataset.installMode==='flat'&&near(+q('.li-install-flat-price').value,it.install.flat),`reopened item ${i+1}: flat install price`);
      else check(el.dataset.installLevel===(it.install.level||'standard'),`reopened item ${i+1}: install level`); }
    if(it.vehicle)check(q('.li-vehicle-info').value===it.vehicle,`reopened item ${i+1}: vehicle info`);
  });
  E('closePricer()');
  // 5. estimate + invoice PDFs
  const est=await pdfOf(()=>E(`generateSavedPDF('${p.id}','estimate')`));
  checkTotalsText('estimate PDF',est,exp,sc); checkRowsAddUp('estimate PDF',est,sc,exp);
  if(est){ check(est.includes('EST-'+num),'estimate PDF: estimate number');
    sc.items.forEach((it,i)=>{ const key=(it.desc||'').replace(/[<>]/g,'').slice(0,14); check(est.includes(key),`estimate PDF: item ${i+1} "${key}"`); });
    sc.estText=est; }
  const inv=await pdfOf(()=>E(`generateSavedPDF('${p.id}','invoice')`));
  checkTotalsText('invoice PDF',inv,exp,sc); checkRowsAddUp('invoice PDF',inv,sc,exp);
  if(inv)check(inv.includes('INV-'+num),'invoice PDF: invoice number');
  // 6. work order: sizes, no prices
  const wo=await pdfOf(()=>E(`generateWorkOrderPDF('${p.id}')`));
  if(check(!!wo,'work order PDF was created')){
    check(!/\$\s?\d/.test(wo),'work order: no prices on it');
    sc.items.forEach((it,i)=>{
      if(it.mode==='flat')return check(wo.includes('Qty '+Math.max(1,+(it.qty??1)||1)),`work order item ${i+1}: qty`);
      const line=`${dimShown(it.w,it.wFt)} W × ${dimShown(it.h,it.hFt)} H`;
      check(wo.includes(line),`work order item ${i+1}: size "${line}"`);
      check(wo.includes(exp.lines[i].sqft.toFixed(2)+' sqft'),`work order item ${i+1}: ${exp.lines[i].sqft.toFixed(2)} sqft`);
      if(it.subW!=null)check(wo.includes(`(${dimShown(it.subW,it.subWFt)} × ${dimShown(it.subH,it.subHFt)})`),`work order item ${i+1}: board size`);
    });
    sc.woText=wo;
  }
  // 7. job page + Sales
  E(`openJobPage('${p.id}')`); const jp=$('job-page');
  check(near(money(jp.querySelector('.cp-stat b')?.textContent),r2(exp.total)),'job page: total',jp.querySelector('.cp-stat b')?.textContent);
  check(jp.querySelectorAll('.jp-item').length===sc.items.length,'job page: one card per item');
  check(!jp.querySelector('script'),'job page: no injected script');
  if(sc.items.some(it=>/</.test(it.desc||'')))check(jp.textContent.includes('<b>x</b>'),'job page: names with < > shown as typed');
  sc.items.forEach((it,i)=>{ if(it.mode==='flat')return; const card=jp.querySelectorAll('.jp-item')[i]; const sz=`${dimShown(it.w,it.wFt)} × ${dimShown(it.h,it.hFt)}`;
    check(card&&card.textContent.includes(sz),`job page item ${i+1}: size ${sz}`); });
  E("switchTab('sales')");
  const row=[...d.querySelectorAll('#sales-list .sales-row')].find(r=>r.textContent.includes('EST-'+num));
  if(check(!!row,'Sales: job listed')){ const a=[...row.querySelectorAll('.amount')].map(x=>money(x.textContent)); check(near(a[0],r2(exp.total)),'Sales: total',a.join()); }
  // 8. client page + card deposit amount
  const share=await (await S.route('/api/proof-share',{method:'POST',body:JSON.stringify({projectId:p.id})})).json();
  sc.token=share.token;
  const pub=await (await S.route('/api/proof-public?token='+share.token)).json();
  check(pub.estimateSummary&&near(+pub.estimateSummary.total,exp.total),'client page data: total',pub.estimateSummary?.total);
  check(near(pub.depositAmount,exp.deposit,0.001),`client page: deposit ${fmt$(exp.deposit)}`,pub.depositAmount);
  const cp=await renderClientPage(share.token); const cpt=cp.body.textContent;
  const rows=Object.fromEntries([...cp.querySelectorAll('.totrow')].map(x=>[x.children[0].textContent,money(x.children[1].textContent)]));
  check(near(rows['Total'],r2(exp.total)),'client page shows the total',rows['Total']);
  if(exp.total>0){
    const lineSum=[...cp.querySelectorAll('.lineitem .price')].reduce((s,x)=>s+money(x.textContent),0);
    const extras=['Setup','Design & Prep','Installation','Hardware & Misc','Discount','Minimum Job Charge Adjustment'].reduce((s,k)=>s+(rows[k]||0),0);
    check(near(r2(lineSum+extras),rows['Subtotal'],0.001),'client page: rows add up to the subtotal (to the cent)',`${r2(lineSum+extras)} vs ${rows['Subtotal']}`);
    const taxK=Object.keys(rows).find(k=>k.startsWith('Sales Tax'));
    check(near(r2(rows['Subtotal']+(rows[taxK]||0)+(rows['Card Processing Fee']||0)),rows['Total'],0.001),'client page: subtotal + tax + fee = total (to the cent)');
    if(est){ const pdfItems=sc.items.map((it,i)=>{ const key=(it.desc||'').replace(/[<>]/g,'').slice(0,14); return lineAmount(est,key); });
      const cpItems=[...cp.querySelectorAll('.lineitem .price')].map(x=>money(x.textContent));
      check(JSON.stringify(pdfItems)===JSON.stringify(cpItems),'client page item prices = estimate PDF item prices',`${pdfItems} vs ${cpItems}`); }
  }
  check(!cp.querySelector('.desc b, .desc script'),'client page: names shown as plain text');
  if(exp.total>0){
    const acc=await (await S.route('/api/proof-public?token='+share.token,{method:'POST',body:JSON.stringify({action:'accept-estimate',name:'Test Signer',total:+pub.estimateSummary.total})})).json();
    check(acc.ok===true,'client can accept online',JSON.stringify(acc));
    const nb=S.stripe.created.length;
    const r=await S.route('/api/create-checkout-session',{method:'POST',body:JSON.stringify({token:share.token,amountType:'deposit'})});
    const ses=S.stripe.created[nb];
    if(exp.deposit>=0.5){ check(r.ok&&ses&&ses.amount===Math.round(exp.deposit*100),`card deposit charge ${fmt$(exp.deposit)}`,ses?.amount);
      sc.session=ses; }
    else check(!r.ok,'deposit under 50¢ is refused before Stripe');
  }else{
    const acc=await S.route('/api/proof-public?token='+share.token,{method:'POST',body:JSON.stringify({action:'accept-estimate',name:'Test Signer',total:0})});
    sc.zeroAccept=acc.status;
  }
  noNewErrors(b,'whole run');
  return {p,exp};
}
async function renderClientPage(token,query=''){
  const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>{ if(!/navigation/.test(e.message))errs.push(e.message); });
  const cp=new JSDOM(fs.readFileSync(L.ROOT+'proof.html','utf8'),{url:'https://x.netlify.app/proof.html?token='+token+query,runScripts:'dangerously',virtualConsole:vc,beforeParse(cw){cw.fetch=S.route; cw.alert=()=>{};}});
  await sleep(80); check(!errs.length,'client page: no errors',errs.join('|'));
  cp.window.__errs=errs; return cp.window.document;
}

// ── run the projects ──────────────────────────────────────────────────
let num=3001;
for(const sc of SCENARIOS){
  if(ONLY&&!ONLY.includes(sc.id)){ num++; continue; }
  console.log(`\n${sc.id} ${sc.name}`);
  try{ await runPricing(sc,num); }catch(e){ check(false,'scenario crashed',e.stack); }
  sc.num=num; num++;
}
fs.writeFileSync('pass-state.json',JSON.stringify(SCENARIOS.map(s=>({id:s.id,num:s.num,pid:s.pid,token:s.token,exp:s.exp,zeroAccept:s.zeroAccept,estText:s.estText,woText:s.woText})),null,1));
globalThis.PASS={S,D,SCENARIOS,clients,clientFor,addMaterialUI,openAndFill,renderClientPage,pdfOf,num:()=>num,bump:()=>num++};
if(!process.env.PASS_CONTINUE){
  const {default:more}=await import('./pass-more.mjs').catch(e=>({default:null}));
  if(more)await more(globalThis.PASS);
  // data for the browser layout check
  const sync=await (await S.route('/api/sync-all')).json(); fs.writeFileSync('pass-sync.json',JSON.stringify(sync));
  const pubs={}; for(const id of ['C05','B05','C01','C08','R13']){ const s=SCENARIOS.find(x=>x.id===id); if(s?.token)pubs[id]={token:s.token,pid:s.pid,data:await (await S.route('/api/proof-public?token='+s.token)).json()}; }
  fs.writeFileSync('pass-pubs.json',JSON.stringify(pubs));
  const out={checks:R.checks,passed:R.passed,failed:R.fails.length,scenarios:R.scen,fails:R.fails,notes:R.issues};
  fs.writeFileSync('pass-results.json',JSON.stringify(out,null,1));
  console.log(`\nSCENARIOS ${R.scen.length}  CHECKS ${R.checks}  PASSED ${R.passed}  FAILED ${R.fails.length}  NOTES ${R.issues.length}`);
  process.exit();
}
