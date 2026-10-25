// Special cases + full job life + Reports, run after the projects.
import * as L from './pass-lib.mjs';
const {check,note,near,r2,money,sleep,startScenario,pdfText,lineAmount}=L;

export default async function more(P){
  const {S,D,SCENARIOS}=P; const {E,d,$,w}=D; const U=L.ui(D);
  const sc=id=>SCENARIOS.find(s=>s.id===id);
  const fmt$=n=>'$'+(+n).toFixed(2);
  const today=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const pull=async()=>{ await E('pullFromServerOnLoad()'); await sleep(30); };
  const meta=id=>E(`getJobMeta('${id}')`);
  const dbMeta=async id=>(await S.pg.query('select * from job_meta where project_id=$1',[id])).rows[0]||{};
  const pub=async tok=>(await (await S.route('/api/proof-public?token='+tok)).json());
  const post=async(tok,body)=>{ const r=await S.route('/api/proof-public?token='+tok,{method:'POST',body:JSON.stringify(body)}); return {status:r.status,body:await r.json()}; };
  const checkout=async(tok,type)=>{ const n=S.stripe.created.length; const r=await S.route('/api/create-checkout-session',{method:'POST',body:JSON.stringify({token:tok,amountType:type})}); return {status:r.status,body:await r.json(),ses:S.stripe.created.length>n?S.stripe.created.at(-1):null}; };
  const payUI=async(id,amount,method='Cash')=>{ E(`openPaymentModal('${id}')`); U.type($('pmtAmount'),amount); U.pick($('pmtMethod'),method); const ab=D.alerts.length; E('submitPayment()'); await sleep(40); return D.alerts.slice(ab); };
  const settings=async fn=>{ E('openSettings()'); await sleep(20); await fn(); E('saveSettings()'); await sleep(40); if(typeof E('closeSettings')==='function')E('closeSettings()'); };
  const items=()=>[...d.querySelectorAll('#lineItemsContainer .line-item')];

  // ─────────────────────────── special cases ───────────────────────────
  startScenario('S01','Switch in → ft after typing','special');
  { const cid=P.clients['Katy Coffee Co']; const n=P.bump();
    E(`openPricer(${n},'${cid}')`); await sleep(15); const el=items()[0];
    U.pick(el.querySelector('.li-vinyl'),'Fellers Black Label Banner'); U.type(el.querySelector('.li-w'),96); U.type(el.querySelector('.li-h'),36);
    const t1=E('gatherPricerPDFData().total');
    el.querySelector('.li-w-unit[data-unit="ft"]').click(); el.querySelector('.li-h-unit[data-unit="ft"]').click();
    check(el.querySelector('.li-w').value==='8'&&el.querySelector('.li-h').value==='3','96×36 in shows as 8×3 ft',el.querySelector('.li-w').value+'×'+el.querySelector('.li-h').value);
    check(near(E('gatherPricerPDFData().total'),t1),'price unchanged by switching units');
    el.querySelector('.li-w').value='9'; U.fire(el.querySelector('.li-w'),'input');
    check(near(E('calcLine(document.querySelector(".line-item")).sqft'),27,0.001),'typing 9 in the ft box means 9 ft (27 sqft)',E('calcLine(document.querySelector(".line-item")).sqft'));
    $('pricerSaveBtn').click(); await sleep(80);
    const p=E(`getProjects().find(p=>p.estNo==='EST-${n}')`);
    E('closePricer()'); E(`editInPricer('${p.id}')`); await sleep(15);
    check(items()[0].querySelector('.li-w').value==='9'&&items()[0].querySelector('.li-w-unit[data-unit="ft"]').classList.contains('active'),'reopened: 9 ft kept');
    E('closePricer()'); }

  startScenario('S02','Re-price a job after its first save (costs)','special');
  { const s=sc('B02'); const before=E(`getExpenses('${s.pid}')`).filter(e=>e.category==='materials').reduce((a,e)=>a+e.amount,0);
    E(`editInPricer('${s.pid}')`); await sleep(15); U.type(items()[0].querySelector('.li-qty'),8); $('pricerSaveBtn').click(); await sleep(90); E('closePricer()');
    const p=E(`getProjects().find(p=>p.id==='${s.pid}')`);
    check(near(+p.state.form.estimateSummary.lineItems[0].matTotal,58.8),'new price saved (qty 8 → $58.80 for the decals)',p.state.form.estimateSummary.lineItems[0].matTotal);
    const after=E(`getExpenses('${s.pid}')`).filter(e=>e.category==='materials').reduce((a,e)=>a+e.amount,0);
    if(near(after,before)) note('logic',`Re-pricing a saved job does not update its recorded costs: B02 went from 4 to 8 decals (price $29.40 → $58.80) but "Materials" cost stayed ${fmt$(before)} (should be ${fmt$(before*2)}). Profit in Sales/Reports is overstated until the cost is fixed by hand.`);
    check(!near(after,before),'materials cost follows the new quantity',`${before} → ${after}`); }

  startScenario('S03','Material removed from Settings after a job used it','special');
  { const cid=P.clients['Katy Coffee Co']; const n=P.bump();
    E(`openPricer(${n},'${cid}')`); await sleep(15); const el=items()[0];
    U.pick(el.querySelector('.li-vinyl'),'Arlon DPF 4500 Cast Vinyl'); U.type(el.querySelector('.li-w'),48); U.type(el.querySelector('.li-h'),24);
    const total=E('gatherPricerPDFData().total'); $('pricerSaveBtn').click(); await sleep(80); E('closePricer()');
    const p=E(`getProjects().find(p=>p.estNo==='EST-${n}')`);
    await settings(async()=>{ const row=[...d.querySelectorAll('#vinylCostRows .mat-row')].find(r=>r.dataset.name==='Arlon DPF 4500 Cast Vinyl'); row.querySelector('button').click(); });
    check(!('Arlon DPF 4500 Cast Vinyl' in E('getVinyl()')),'material removed');
    check(near(E(`getProjectAmount(getProjects().find(p=>p.id==='${p.id}'))`),total),'old job keeps its saved total');
    const est=await P.pdfOf(()=>E(`generateSavedPDF('${p.id}','estimate')`));
    check(near(lineAmount(est,'TOTAL',true),r2(total)),'old job estimate PDF: same total');
    const wo=await P.pdfOf(()=>E(`generateWorkOrderPDF('${p.id}')`)); check(wo&&wo.includes('Arlon DPF 4500'),'work order still names the material');
    E(`openJobPage('${p.id}')`); check(/Arlon DPF 4500/.test($('job-page').textContent),'job page still names the material');
    E(`editInPricer('${p.id}')`); await sleep(15);
    const sel=items()[0].querySelector('.li-vinyl'); check(sel.dataset.missing==='Arlon DPF 4500 Cast Vinyl','reopened: material flagged as removed');
    const ab=D.alerts.length; $('pricerSaveBtn').click(); await sleep(40);
    check(D.alerts.length>ab&&/removed from Settings/.test(D.alerts.at(-1)),'save asks to pick a material first',D.alerts.at(-1));
    E('pricerCleanState=pricerSnapshot();closePricer()');
    await settings(async()=>{ U.type($('addMatInput_vinyl'),'Arlon DPF 4500 Cast Vinyl'); E("addMaterial('vinyl')"); const row=[...d.querySelectorAll('#vinylCostRows .mat-row')].find(r=>r.dataset.name==='Arlon DPF 4500 Cast Vinyl'); const ci=row.querySelector('input'); ci.value='0.43'; ci.dispatchEvent(new w.Event('change',{bubbles:true})); }); }

  startScenario('S04','Copy an old job as a new estimate','special');
  { const s=sc('B05'); const count=E('getProjects().length');
    E(`copyJobToNewEstimate('${s.pid}')`); await sleep(20);
    const est=$('pricerEstNo').value; check(est!=='EST-'+s.num,'copy gets a new Est #',est);
    check(near(E('gatherPricerPDFData().total'),s.exp.total),'copy has the same price (same rates)');
    check($('pricerDate').value===E('storedDateToInput()'),'copy is dated today');
    $('pricerSaveBtn').click(); await sleep(80); E('closePricer()');
    check(E('getProjects().length')===count+1,'saving the copy adds one job');
    check(near(E(`getProjectAmount(getProjects().find(p=>p.id==='${s.pid}'))`),s.exp.total),'original job unchanged'); }

  startScenario('S05','Sales tax rate changes after jobs were saved','special');
  { await settings(async()=>{ U.type($('settingTaxRate'),8.5); });
    check(E('getRates().taxRate')===8.5,'tax rate now 8.5%');
    const s=sc('B05'); check(near(E(`getProjectAmount(getProjects().find(p=>p.id==='${s.pid}'))`),s.exp.total),'old job keeps 8.25%');
    const d1=await pub(s.token); check(near(+d1.estimateSummary.total,s.exp.total),'client page of old job unchanged');
    E(`editInPricer('${s.pid}')`); await sleep(15); check(E('gatherPricerPDFData().taxRate')===8.25,'reopening the old job keeps its 8.25%',E('gatherPricerPDFData().taxRate')); E('closePricer()');
    const cid=P.clients['Katy Coffee Co']; const n=P.bump(); E(`openPricer(${n},'${cid}')`); await sleep(15);
    U.pick(items()[0].querySelector('.li-vinyl'),'Fellers Black Label Banner'); U.type(items()[0].querySelector('.li-w'),48); U.type(items()[0].querySelector('.li-h'),24);
    const g=E('gatherPricerPDFData()'); check(g.taxRate===8.5&&near(g.tax,g.taxable*0.085),'new estimate uses 8.5%');
    E('pricerCleanState=pricerSnapshot();closePricer()');
    await settings(async()=>{ U.type($('settingTaxRate'),8.25); }); }

  startScenario('S06','Typing an Est # that another job uses','special');
  { const cid=P.clients['Katy Coffee Co']; const n=P.bump(); E(`openPricer(${n},'${cid}')`); await sleep(15);
    U.type(items()[0].querySelector('.li-w'),12); U.type(items()[0].querySelector('.li-h'),12);
    U.type($('pricerEstNo'),'EST-'+sc('B01').num); const ab=D.alerts.length; const c=E('getProjects().length');
    $('pricerSaveBtn').click(); await sleep(60);
    check(D.alerts.length>ab&&/already used/.test(D.alerts.at(-1)),'save refused with a clear message',D.alerts.at(-1));
    check(E('getProjects().length')===c,'no duplicate created');
    E('pricerCleanState=pricerSnapshot();closePricer()'); }

  startScenario('S07','Estimate older than its 30 valid days','special');
  { const s=sc('B08'); const st=(await S.pg.query('select state from projects where id=$1',[s.pid])).rows[0].state;
    st.form.estimateSummary.quotedAt=new Date(Date.now()-40*864e5).toISOString();
    await S.pg.query('update projects set state=$1 where id=$2',[JSON.stringify(st),s.pid]);
    await S.pg.query('update proof_shares set estimate_accepted_at=null, estimate_accepted_total=null where token=$1',[s.token]);
    const dd=await pub(s.token); check(dd.expired===true,'client page: marked expired');
    const a=await post(s.token,{action:'accept-estimate',name:'Late Larry',total:+dd.estimateSummary.total}); check(a.status===400,'accepting an expired estimate is refused',a.status);
    const ck=await checkout(s.token,'deposit'); check(ck.status===400&&!ck.ses,'paying an expired estimate is refused');
    const doc=await P.renderClientPage(s.token); check(/expired/i.test(doc.body.textContent),'client page says it expired'); }

  startScenario('S08','Overpayment and refunds','special');
  { const s=sc('B03'); const total=E(`getProjectAmount(getProjects().find(p=>p.id==='${s.pid}'))`);
    const al=await payUI(s.pid,r2(total+10),'Cash');
    check(!al.length,'overpaying is accepted (no warning)',al.join());
    const paid=E(`getAmountPaid('${s.pid}')`); E("switchTab('sales')");
    const row=[...d.querySelectorAll('#sales-list .sales-row')].find(r=>r.textContent.includes('EST-'+s.num));
    const txt=row?.textContent||''; const shows=/overpaid|credit|refund/i.test(txt);
    note('logic',`Overpayment is accepted without a warning and nothing shows the extra ${fmt$(paid-total)}: Sales shows balance $0.00${shows?' (but it is mentioned)':''}. There is no way to record a refund (payments must be above $0); the only option is deleting the payment.`);
    const al2=await payUI(s.pid,-10,'Cash'); check(al2.length&&/greater than \$0/.test(al2[0]),'negative payment (refund) refused',al2.join());
    E(`openJobPage('${s.pid}')`); const bal=money($('job-page').querySelectorAll('.cp-stat b')[2]?.textContent); check(near(bal,0),'job page balance shows $0');
    const dd=await pub(s.token); check(dd.balance===0,'client page balance $0'); }

  startScenario('S09','Install time suggestion on small items','special');
  { const cid=P.clients['Katy Coffee Co']; const n=P.bump(); E(`openPricer(${n},'${cid}')`); await sleep(15); const el=items()[0];
    U.type(el.querySelector('.li-w'),24); U.type(el.querySelector('.li-h'),24); U.tick(el.querySelector('.li-install-chk'),true); E('recalc()');
    const txt=el.querySelector('.li-install-suggest-text')?.textContent||'';
    if(/~0min/.test(txt))note('logic',`Install suggestion says "${txt}" for a 4 sqft item (100 sqft/hr): "Apply" would set 0 minutes and the install charge to $0. Small items need a minimum (e.g. 15 min).`);
    check(!/~0min/.test(txt),'suggestion is never "0 min"',txt);
    E('pricerCleanState=pricerSnapshot();closePricer()'); }

  startScenario('S10','Double-click Save','special');
  { const cid=P.clients['Katy Coffee Co']; const n=P.bump(); E(`openPricer(${n},'${cid}')`); await sleep(15);
    U.type(items()[0].querySelector('.li-w'),24); U.type(items()[0].querySelector('.li-h'),24);
    const c=E('getProjects().length'); $('pricerSaveBtn').click(); $('pricerSaveBtn').click(); await sleep(120); E('closePricer()');
    check(E('getProjects().length')===c+1,'one job, not two');
    const p=E(`getProjects().find(p=>p.estNo==='EST-${n}')`);
    check(E(`getExpenses('${p.id}')`).filter(e=>e.category==='materials').length===1,'costs recorded once');
    const srv=(await S.pg.query("select count(*)::int n from projects where est_no=$1",['EST-'+n])).rows[0].n; check(srv===1,'server has one copy',srv); }

  startScenario('S11','Shop rates change: old jobs stay frozen','special');
  { const s=sc('B02'); const before=E(`getProjectAmount(getProjects().find(p=>p.id==='${s.pid}'))`);
    await settings(async()=>{ U.type($('settingMarkup'),3); });
    check(near(E(`getProjectAmount(getProjects().find(p=>p.id==='${s.pid}'))`),before),'Sales total of old job unchanged after markup change');
    const est=await P.pdfOf(()=>E(`generateSavedPDF('${s.pid}','estimate')`)); check(near(lineAmount(est,'TOTAL',true),r2(before)),'old estimate PDF unchanged');
    E(`openJobPage('${s.pid}')`); const jpTotal=money($('job-page').querySelector('.cp-stat b').textContent); check(near(jpTotal,r2(before)),'job page total unchanged');
    E(`editInPricer('${s.pid}')`); await sleep(15); const now=E('gatherPricerPDFData().total');
    const clean=E('pricerSnapshot()===pricerCleanState');
    if(now>before+0.01&&clean)note('logic',`Opening an old job after a rate change shows the NEW price in the pricer (${fmt$(now)} instead of the saved ${fmt$(before)}) without saying so; closing doesn't ask, and pressing Save re-prices the job (and asks the client to accept again if they had).`);
    E('pricerCleanState=pricerSnapshot();closePricer()');
    await settings(async()=>{ U.type($('settingMarkup'),2.5); }); }

  startScenario('S12','Item with no size typed','special');
  { const cid=P.clients['Katy Coffee Co']; const n=P.bump(); E(`openPricer(${n},'${cid}')`); await sleep(15);
    U.type(items()[0].querySelector('.line-desc'),'Forgot the height'); U.type(items()[0].querySelector('.li-w'),24);
    const ab=D.alerts.length; $('pricerSaveBtn').click(); await sleep(60);
    const p=E(`getProjects().find(p=>p.estNo==='EST-${n}')`);
    if(p&&D.alerts.length===ab)note('logic','An item with a missing width or height saves as a $0.00 item with no warning (e.g. typed the width, forgot the height). Same for a negative size.');
    check(!p||D.alerts.length>ab,'warns about an item with no size');
    E('closePricer()'); }

  startScenario('S13','Delete a job that has payments','special');
  { const s=sc('R15'); E(`addPayment('${s.pid}',100,'Cash','${today}')`); await sleep(40);
    const repBefore=E("computeReportsData('month',0).revenueCollected");
    const cb=D.confirms.length; E(`deleteProjectConfirm('${s.pid}')`); await sleep(60);
    check(D.confirms.length>cb&&/\$100\.00 in recorded payments/.test(D.confirms.at(-1)),'delete warns about the recorded payments',D.confirms.at(-1));
    const repAfter=E("computeReportsData('month',0).revenueCollected");
    if(repAfter<repBefore-0.01)note('logic',`Deleting a job also deletes its payments, so money already collected disappears from Reports and the sales-tax report (collected this month dropped ${fmt$(repBefore-repAfter)}). An "archive/cancel" option would keep the history.`);
    const srv=(await S.pg.query('select count(*)::int n from projects where id=$1',[s.pid])).rows[0].n; check(srv===0,'job removed from the server');
    const tok=await pub(s.token); check(tok.error&&/isn't valid/.test(tok.error),'client link stops working',JSON.stringify(tok).slice(0,80)); }

  startScenario('S14','Pricer: mark an item done, remove an item','special');
  { const cid=P.clients['Katy Coffee Co']; const n=P.bump(); E(`openPricer(${n},'${cid}')`); await sleep(15);
    U.type(items()[0].querySelector('.line-desc'),'Item A'); U.type(items()[0].querySelector('.li-w'),24); U.type(items()[0].querySelector('.li-h'),24);
    d.querySelector('.add-line-btn').click(); U.type(items()[1].querySelector('.line-desc'),'Item B'); U.type(items()[1].querySelector('.li-w'),48); U.type(items()[1].querySelector('.li-h'),24);
    d.querySelector('.add-line-btn').click(); U.type(items()[2].querySelector('.line-desc'),'Item C'); U.type(items()[2].querySelector('.li-w'),12); U.type(items()[2].querySelector('.li-h'),12);
    const all3=E('gatherPricerPDFData().total');
    const a=items()[0]; a.querySelector('.li-done-btn').click(); await sleep(5);
    check(near(E('gatherPricerPDFData().total'),all3),'a "done" item still counts in the total');
    const c=[...d.querySelectorAll('.line-item')].find(x=>x.querySelector('.line-desc').value==='Item C'); c.querySelector('.line-del').click(); await sleep(5);
    const g=E('gatherPricerPDFData()'); check(g.lineData.length===2&&!g.lineData.some(l=>/Item C/.test(l.desc)),'removed item is gone from the total');
    $('pricerSaveBtn').click(); await sleep(80); E('closePricer()');
    const p=E(`getProjects().find(p=>p.estNo==='EST-${n}')`); const lines=JSON.parse(p.state.form.pricerData).lines.map(l=>l.desc);
    check(lines.length===2&&lines.includes('Item A')&&lines.includes('Item B'),'saved: A (done) and B, not C',lines.join());
    E(`editInPricer('${p.id}')`); await sleep(15);
    check(d.querySelectorAll('.line-item').length===2,'reopened: both items back'); E('closePricer()'); }

  startScenario('S15','Job priced last month, paid this month (Reports)','special');
  { const cid=P.clients['Gulf Coast Dental']; const n=P.bump(); E(`openPricer(${n},'${cid}')`); await sleep(15);
    U.pick(items()[0].querySelector('.li-vinyl'),'3M IJ35C Cast Vinyl'); U.type(items()[0].querySelector('.li-w'),96); U.type(items()[0].querySelector('.li-h'),48);
    const now=new Date(); const last=new Date(now.getFullYear(),now.getMonth()-1,20);
    U.type($('pricerDate'),last.toISOString().slice(0,10));
    $('pricerSaveBtn').click(); await sleep(90); E('closePricer()');
    const p=E(`getProjects().find(p=>p.estNo==='EST-${n}')`); const total=E(`getProjectAmount(getProjects().find(x=>x.id==='${p.id}'))`);
    const mBefore=E("computeReportsData('month',0)"), lBefore=E("computeReportsData('month',1)");
    E(`addPayment('${p.id}',${r2(total)},'Zelle','${today}')`); await sleep(40);
    const mAfter=E("computeReportsData('month',0)"), lAfter=E("computeReportsData('month',1)");
    const costThis=mAfter.expenses.total-mBefore.expenses.total, costLast=lAfter.expenses.total-lBefore.expenses.total;
    const revThis=mAfter.revenueCollected-mBefore.revenueCollected;
    check(near(revThis,r2(total),0.011),'payment counts this month');
    if(costLast>0.01&&costThis<0.01)note('logic',`Reports count a job's costs in the month it was PRICED but its money in the month it was PAID: EST-${n} priced last month, paid today → this month shows ${fmt$(revThis)} income with $0 cost, last month shows ${fmt$(costLast)} cost with no income. Monthly profit is off for any job that spans two months.`);
  }

  // ─────────────────────────── full job life ───────────────────────────
  startScenario('L1','ACM sign: accept → card deposit → proof → approve → cash balance → done','life');
  { const s=sc('B05'); const id=s.pid, tok=s.token, exp=s.exp;
    check(!!s.session,'deposit checkout exists');
    check(await S.stripe.pay(s.session)===200,'Stripe confirms the deposit');
    await pull();
    const pays=E(`getPayments('${id}')`); check(pays.length===1&&near(pays[0].amount,exp.deposit)&&/Card \(Stripe\)/.test(pays[0].method),'deposit shows on the job',JSON.stringify(pays));
    const fee=E(`getExpenses('${id}')`).find(e=>e.source==='stripe'); check(fee&&near(fee.amount,r2(exp.deposit*0.029+0.30)),'Stripe fee recorded as a cost',fee?.amount);
    const notifs=d.getElementById('notifBadge')?.textContent||d.querySelector('.notif-badge')?.textContent||'';
    let dd=await pub(tok); check(near(dd.balance,exp.total-exp.deposit),'client page: balance after deposit',dd.balance);
    let doc=await P.renderClientPage(tok); check(/Pay Remaining Balance/.test(doc.body.textContent),'client page offers "Pay Remaining Balance"');
    // proof uploaded (same steps as the upload button)
    E(`setJobMeta('${id}',{...getJobMeta('${id}'),proofLink:'https://drive.google.com/file/d/PROOF1/view'})`); await E(`resetClientResponseAndMarkAwaiting('${id}')`); await sleep(40);
    E(`setJobMeta('${id}',{...getJobMeta('${id}'),status:'awaiting'})`); await sleep(40);
    doc=await P.renderClientPage(tok); const t=doc.body.textContent;
    check(/Approve/i.test(t)&&doc.querySelector('iframe'),'client page shows the proof with Approve / Request changes');
    const ap=await post(tok,{response:'approved',note:''}); check(ap.status===200,'client approves');
    await pull(); check(meta(id).status==='approved','Dashboard: status Proof Approved',meta(id).status);
    E(`setJobMeta('${id}',{...getJobMeta('${id}'),status:'prod',installDate:'2026-11-03',installTime:'09:00'})`); await sleep(40);
    dd=await pub(tok); check(dd.status==='prod'&&dd.installDate==='2026-11-03','client page: In production + install date');
    const bal=r2(exp.total-exp.deposit); const al=await payUI(id,bal,'Cash'); check(!al.length,'final cash payment entered');
    check(near(E(`getAmountPaid('${id}')`),r2(exp.deposit+bal)),'paid in full');
    dd=await pub(tok); check(dd.balance<0.005,'client page: nothing owed',dd.balance);
    doc=await P.renderClientPage(tok); check(/Paid in full/i.test(doc.body.textContent),'client page says Paid in full');
    E(`setJobMeta('${id}',{...getJobMeta('${id}'),status:'done'})`); await sleep(40);
    const rc=await P.pdfOf(()=>E(`generateReceiptPDF('${id}')`));
    check(rc&&/PAID IN FULL/.test(rc)&&near(lineAmount(rc,'Total Paid'),r2(exp.deposit+bal)),'receipt: both payments, PAID IN FULL',rc&&lineAmount(rc,'Total Paid'));
    const inv=await P.pdfOf(()=>E(`generateSavedPDF('${id}','invoice')`));
    if(inv&&!/Paid|Balance/i.test(inv))note('logic','The invoice PDF never shows payments or the balance due: after a deposit (or when fully paid) it still shows only the full total. Only the receipt shows what was paid. Clients usually expect "Amount paid / Balance due" on the invoice.');
    const srvM=await dbMeta(id); check((srvM.payments||[]).length===2&&srvM.status==='done','server has both payments and Done'); }

  startScenario('L2','2-piece acrylic sign: accept & pay in full by card','life');
  { const s=sc('C01'); const ck=await checkout(s.token,'full');
    check(ck.ses&&ck.ses.amount===Math.round(r2(s.exp.total)*100),`full payment charge ${fmt$(s.exp.total)}`,ck.ses?.amount);
    check(ck.ses&&S.stripe.S[s.session.id].status==='expired','the earlier unpaid deposit checkout was cancelled');
    check(/Lobby sign/.test(ck.ses?.name||''),'Stripe line shows the job description',ck.ses?.name);
    check(ck.ses?.email==='gulf.coast.dental@example.com','client email pre-filled for the receipt',ck.ses?.email);
    await S.stripe.pay(ck.ses); await pull();
    check(near(E(`getAmountPaid('${s.pid}')`),r2(s.exp.total)),'paid in full recorded');
    const again=await checkout(s.token,'full'); check(again.status===400&&!again.ses,'no second charge once paid'); }

  startScenario('L3','Van wrap: deposit → changes requested → new proof → approve → re-priced → re-accept → balance','life');
  { const s=sc('C05'); const id=s.pid, tok=s.token;
    await S.stripe.pay(s.session); await pull();
    E(`setJobMeta('${id}',{...getJobMeta('${id}'),proofLink:'https://drive.google.com/file/d/W1/view',status:'awaiting'})`); await sleep(40);
    const ch=await post(tok,{response:'changes',note:'Make the logo bigger, phone number in white'}); check(ch.status===200,'client requests changes');
    await pull(); check(meta(id).status==='revision','Dashboard: In Design Revision',meta(id).status);
    const share=await (await S.route('/api/proof-share?projectId='+id)).json(); check(/bigger/.test(share.responseNote||''),'Dashboard can read the client note',JSON.stringify(share).slice(0,120));
    E(`setJobMeta('${id}',{...getJobMeta('${id}'),proofLink:'https://drive.google.com/file/d/W2/view'})`); await E(`resetClientResponseAndMarkAwaiting('${id}')`); await sleep(40);
    let dd=await pub(tok); check(!dd.response&&dd.status==='awaiting','new proof: response cleared, awaiting approval',dd.response+' '+dd.status);
    await post(tok,{response:'approved'}); await pull(); check(meta(id).status==='approved','approved');
    // client wants a spare-tire cover added: re-price
    E(`editInPricer('${id}')`); await sleep(15); d.querySelector('.add-line-btn').click();
    L.fillItem(D,items().at(-1),{desc:'Spare tire cover',vinyl:'3M IJ175C Cast Vinyl',lam:'3M 8508 Over-Laminate',w:30,h:30});
    const newTotal=E('gatherPricerPDFData().total'); const cb=D.confirms.length; $('pricerSaveBtn').click(); await sleep(90); E('closePricer()');
    check(D.confirms.length>cb&&/accept the new total/.test(D.confirms.at(-1)),'Save warns that the client must accept the new total',D.confirms.at(-1));
    dd=await pub(tok); check(dd.needsAcceptance&&dd.estimateChangedSinceAccepted,'client page asks to accept the new total');
    let ck=await checkout(tok,'full'); check(ck.status===400&&!ck.ses,'no payment before re-accepting');
    const acc=await post(tok,{action:'accept-estimate',name:'Mike Brazos',total:+dd.estimateSummary.total}); check(acc.status===200,'client re-accepts');
    ck=await checkout(tok,'deposit'); const owed=r2(newTotal-s.exp.deposit);
    check(ck.ses&&ck.ses.amount===Math.round(owed*100)&&ck.ses.desc==='Remaining balance',`charges the remaining ${fmt$(owed)} even from the deposit button`,ck.ses?.amount+' '+ck.ses?.desc);
    await S.stripe.pay(ck.ses); await pull();
    check(near(E(`getAmountPaid('${id}')`),r2(newTotal),0.011),'paid in full at the new total');
    const exAfter=E(`getExpenses('${id}')`).filter(e=>e.category==='materials').reduce((a,e)=>a+e.amount,0);
    if(near(exAfter,s.exp.costs.materials,0.011))note('logic',`C05 (L3): after adding the spare-tire cover the job's material cost is still the first-save amount (${fmt$(exAfter)}), same issue as S02.`); }

  startScenario('L4','Wholesale tax-exempt job paid cash','life');
  { const s=sc('C09'); const al=await payUI(s.pid,175,'Check'); check(!al.length,'check payment entered');
    const rep=E("computeReportsData('month',0)"); check(rep.taxableCollected>=0,'reports computed');
    const fin=E(`getJobFinancials(getProjects().find(p=>p.id==='${s.pid}'))`); check(fin.tax===0&&fin.taxExempt,'job shows $0 tax, exempt'); }

  startScenario('L5','$0 warranty job on the client page','life');
  { const s=sc('R04'); check(s.zeroAccept===400,'a $0 estimate cannot be accepted online (known)',s.zeroAccept);
    const doc=await P.renderClientPage(s.token); const t=doc.body.textContent;
    check(!/Pay \d+% Deposit/.test(t),'no pay button for a $0 job'); }

  startScenario('L6','Price lowered after the client paid in full','life');
  { const s=sc('C11'); const ck=await checkout(s.token,'full'); await S.stripe.pay(ck.ses); await pull();
    E(`editInPricer('${s.pid}')`); await sleep(15); U.tick(items()[0].querySelector('.li-design-chk'),false);
    const cb=D.confirms.length; $('pricerSaveBtn').click(); await sleep(90); E('closePricer()');
    check(D.confirms.length>cb&&/refund would be due/.test(D.confirms.at(-1)),'Save says a refund would be due',D.confirms.at(-1));
    const dd=await pub(s.token); check(dd.balance===0,'client page: nothing owed');
    E(`openJobPage('${s.pid}')`); const t=$('job-page').textContent;
    if(!/refund|overpaid|credit/i.test(t))note('logic',`After lowering a paid job's price, nothing in the Dashboard shows the ${fmt$(E(`getAmountPaid('${s.pid}')`)-E(`getProjectAmount(getProjects().find(p=>p.id==='${s.pid}'))`))} you owe back (job page, Sales and Reports just show $0 balance).`); }

  // ─────────────────────────── Reports ───────────────────────────
  startScenario('RP','Reports and sales-tax summary match the jobs','reports');
  { await pull(); E("switchTab('reports')"); E("setReportsPeriod('month')"); await sleep(20);
    const projects=E('getProjects()');
    let collected=0,tax=0,owed=0,taxable=0;
    for(const p of projects){ const m=E(`getJobMeta('${p.id}')`); if(m.excluded)continue;
      const fin=E(`getJobFinancials(getProjects().find(x=>x.id==='${p.id}'))`);
      const pays=(m.payments||[]); const paid=pays.reduce((a,x)=>a+x.amount,0); collected+=paid;
      if(fin.revenue>0){ tax+=paid*fin.tax/fin.revenue; if(!fin.taxExempt)taxable+=paid*(+fin.taxable)/fin.revenue; }
      if(E(`isJobCommitted('${p.id}')`))owed+=Math.max(0,fin.revenue-paid); }
    const shown=id=>money($(id)?.textContent);
    check(near(shown('r-revenue'),r2(collected),0.011),`Reports: collected this month ${fmt$(collected)}`,shown('r-revenue'));
    check(near(shown('r-outstanding'),r2(owed),0.011),`Reports: owed ${fmt$(owed)}`,shown('r-outstanding'));
    const rep=E("computeReportsData('month',0)"); check(near(rep.taxCollected,tax,0.011),`Reports: tax collected ${fmt$(tax)}`,rep.taxCollected);
    E('window.__printed=""'); const fnName=['printTaxReport','printTaxSummary'].find(f=>typeof E(`typeof ${f}==='function'?${f}:null`)==='function');
    if(fnName){ E(`${fnName}()`); const html=w.__printed||''; check(html.includes(r2(rep.taxCollected).toFixed(2)),'tax summary prints the same tax',html.slice(0,0)); }
    else check(false,'tax summary function found'); }
}
