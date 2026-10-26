// New settings, group C (client settings): tax-exempt + certificate, discount %,
// deposit %, invoice terms, estimate terms — saved per client, filled into new estimates.
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as L from './pass-lib.mjs';
const {check,near,sleep,startScenario,R,pdfText}=L;
const S=await L.bootServer(); const D=await L.bootDashboard(S); const {E,d,$,w}=D; const U=L.ui(D);
const items=()=>[...d.querySelectorAll('#lineItemsContainer .line-item')];
const q=async(sql,p=[])=>(await S.pg.query(sql,p)).rows;
const page=async tok=>{ const cp=new JSDOM(fs.readFileSync(L.ROOT+'proof.html','utf8'),{url:'https://x.netlify.app/proof.html?token='+tok,runScripts:'dangerously',virtualConsole:new VirtualConsole(),beforeParse(cw){cw.fetch=S.route;}}); await sleep(80); return cp.window.document; };
const txt=doc=>(doc.getElementById('mainCard')?.textContent||'').replace(/\s+/g,' ');
const share=async id=>(await (await S.route('/api/proof-share',{method:'POST',body:JSON.stringify({projectId:id})})).json()).token;
const notice=()=>{ const b=$('pricerClientNotice'); return b.style.display==='none'?'':b.textContent; };
const form=(vals)=>{ for(const [id,v] of Object.entries(vals)){ const el=$(id); if(el.type==='checkbox')el.checked=!!v; else if(el.tagName==='SELECT')U.pick(el,String(v)); else U.type(el,v); } };
let num=9101;

startScenario('C1','Client form saves the settings','new');
E('openClientForm()'); await sleep(10);
form({'cf-name':'Katy ISD','cf-email':'ap@katyisd.example','cf-tax-exempt':true,'cf-tax-cert':'TX-<b>12345</b>','cf-discount':10,'cf-deposit':0,'cf-pay-terms':'net30','cf-terms':'Net 30 per district PO.'});
E('saveClientForm()'); await sleep(80);
const A=E("getClients().find(c=>c.name==='Katy ISD')"); const cidA=A.id;
check(JSON.stringify(A.prefs)===JSON.stringify({taxExempt:true,taxCert:'TX-<b>12345</b>',discountPct:10,depositPct:0,payTerms:'net30',terms:'Net 30 per district PO.'}),'saved on the client',JSON.stringify(A.prefs));
let row=(await q('select prefs from clients where id=$1',[cidA]))[0];
check(row&&row.prefs.taxExempt===true&&row.prefs.discountPct===10&&row.prefs.depositPct===0&&row.prefs.payTerms==='net30','saved on the server (new prefs column)',JSON.stringify(row));
// bad values refused
E(`openClientForm('${cidA}')`); await sleep(10);
check($('cf-tax-exempt').checked&&$('cf-tax-cert').value==='TX-<b>12345</b>'&&$('cf-discount').value==='10'&&$('cf-deposit').value==='0'&&$('cf-pay-terms').value==='net30','reopening the client shows the settings');
let ab=D.alerts.length; form({'cf-discount':150}); E('saveClientForm()'); check(D.alerts.length>ab&&/Discount/.test(D.alerts.at(-1)),'discount 150% refused');
ab=D.alerts.length; form({'cf-discount':10,'cf-deposit':120}); E('saveClientForm()'); check(D.alerts.length>ab&&/Deposit/.test(D.alerts.at(-1)),'deposit 120% refused');
form({'cf-deposit':0}); E('closeClientForm()');
// profile badges (and the certificate text is shown as text, not HTML)
E(`openClientProfile('${cidA}')`); await sleep(20);
const badges=d.querySelector('.cp-badges'); const bt=badges?.textContent||'';
check(/Tax-exempt · cert #TX-<b>12345<\/b>/.test(bt)&&/10% discount/.test(bt)&&/No deposit/.test(bt)&&/Invoices Net 30/.test(bt)&&/Own terms/.test(bt),'client profile shows the settings as badges',bt);
check(!badges?.querySelector('b'),'certificate text can\'t inject HTML');
E("switchTab('clients')");
// a plain client, and one with only a deposit + discount
E("addClient({name:'Walk-in Wally'})"); await sleep(40); const cidB=E("getClients().find(c=>c.name==='Walk-in Wally').id");
E('openClientForm()'); await sleep(10); form({'cf-name':'Builder Bob','cf-discount':5,'cf-deposit':20}); E('saveClientForm()'); await sleep(80);
const cidC=E("getClients().find(c=>c.name==='Builder Bob').id");
check(JSON.stringify(E(`getClients().find(c=>c.id==='${cidC}').prefs`))===JSON.stringify({discountPct:5,depositPct:20}),'only the boxes filled in are saved');
row=(await q('select prefs from clients where id=$1',[cidB]))[0]; check(row&&JSON.stringify(row.prefs)==='{}','a client without settings: empty');

startScenario('C2','New estimate for a client with settings','new');
let n=num++; E(`openPricer(${n},'${cidA}')`); await sleep(20);
check($('taxExemptChk').checked&&$('discType').value==='pct'&&$('discVal').value==='10'&&$('depositPctInput').value==='0'&&$('pricerTerms').value==='Net 30 per district PO.','tax-exempt, 10% discount, no deposit and their terms filled in');
check(/Client settings applied: tax-exempt \(cert #TX-<b>12345<\/b>\), 10% discount, no deposit, their terms, invoices net 30\./.test(notice()),'notice says what was applied',notice());
check(!$('pricerClientNotice').querySelector('b'),'notice shows the certificate as text');
L.fillItem(D,items()[0],{desc:'Gym banner',mode:'flat',price:1000}); L.fillJob(D,{setupMins:0}); E('recalc()');
$('pricerSaveBtn').click(); await sleep(90); E('closePricer()');
let pA=E(`getProjects().find(p=>p.estNo==='EST-${n}')`); let s=pA.state.form.estimateSummary; let pd=JSON.parse(pA.state.form.pricerData);
check(s.taxExempt&&+s.tax===0&&near(+s.disc,100)&&near(+s.total,cent(900*1.029)),'priced: $1,000 − 10%, no tax, + card fee',JSON.stringify({tax:s.tax,disc:s.disc,total:s.total}));
check(pd.taxCert==='TX-<b>12345</b>'&&pd.payTerms==='net30'&&pd.depositPct===0&&s.taxCert==='TX-<b>12345</b>','job keeps the certificate, invoice terms and deposit',JSON.stringify({c:pd.taxCert,t:pd.payTerms,d:pd.depositPct}));
E(`generateSavedPDF('${pA.id}','estimate')`); await sleep(40); let est=pdfText(D.pdfs.at(-1).buf).replace(/\s+/g,' ');
check(/Sales Tax \(Exempt\) \$0\.00 Certificate #TX-<b>12345<\/b>/.test(est),'estimate PDF: "Sales Tax (Exempt)" with the certificate #',est.slice(est.indexOf('Sales Tax')-10,est.indexOf('Sales Tax')+80));
E(`generateSavedPDF('${pA.id}','invoice')`); await sleep(40); let inv=pdfText(D.pdfs.at(-1).buf).replace(/\s+/g,' ');
check(/Certificate #TX-<b>12345<\/b>/.test(inv),'invoice PDF shows the certificate #');
let tok=await share(pA.id); let doc=await page(tok); let t=txt(doc);
check(t.includes('Sales Tax (Exempt — cert #TX-<b>12345</b>)'),'client page: "Sales Tax (Exempt — cert #…)"',t.slice(t.indexOf('Sales Tax')-5,t.indexOf('Sales Tax')+60));
check(!doc.querySelector('#mainCard .estimate-totals b'),'client page shows the certificate as text');
check(/Accept Estimate — pay when it's done/.test(t),'client page: no deposit for this client');
// reopening the saved job: no notice, nothing re-applied; the job keeps its own values
E(`editInPricer('${pA.id}')`); await sleep(30);
check(notice()===''&&$('taxExemptChk').checked&&$('discVal').value==='10','reopened job: same values, no "applied" notice');
E('pricerCleanState=pricerSnapshot();closePricer()');
// changing the client's settings later doesn't touch jobs already priced
E(`openClientForm('${cidA}')`); await sleep(10); form({'cf-tax-exempt':false,'cf-discount':''}); E('saveClientForm()'); await sleep(80);
pA=E(`getProjects().find(p=>p.id==='${pA.id}')`); check(pA.state.form.estimateSummary.taxExempt&&near(+pA.state.form.estimateSummary.total,+s.total),'old job keeps tax-exempt and its total after the client changes');
row=(await q('select prefs from clients where id=$1',[cidA]))[0]; check(row&&!row.prefs.taxExempt&&row.prefs.discountPct==null&&row.prefs.depositPct===0,'server updated with only what changed',JSON.stringify(row?.prefs));
E(`openClientForm('${cidA}')`); await sleep(10); form({'cf-tax-exempt':true,'cf-tax-cert':'TX-<b>12345</b>','cf-discount':10}); E('saveClientForm()'); await sleep(80);
// unticking tax-exempt on the estimate drops the certificate
n=num++; E(`openPricer(${n},'${cidA}')`); await sleep(20); L.fillItem(D,items()[0],{desc:'x',mode:'flat',price:100}); U.tick($('taxExemptChk'),false); E('recalc()');
$('pricerSaveBtn').click(); await sleep(90); E('closePricer()');
let p2=E(`getProjects().find(p=>p.estNo==='EST-${n}')`); check(!p2.state.form.estimateSummary.taxExempt&&!JSON.parse(p2.state.form.pricerData).taxCert&&+p2.state.form.estimateSummary.tax>0,'unticked tax-exempt: taxed, no certificate kept');

startScenario('C3','Switching the client on a new estimate','new');
n=num++; E(`openPricer(${n},'${cidA}')`); await sleep(20);
E('changeClientInPricer()'); E(`cpSelectClient('${cidB}')`); await sleep(20);
const shopDep=String(E('getRates().depositPct'));
check(!$('taxExemptChk').checked&&$('discType').value==='none'&&$('depositPctInput').value===shopDep&&$('pricerTerms').value===(E('getBusinessInfo().defaultTerms')||'')&&notice()==='','to a client without settings: back to the shop defaults',JSON.stringify({tax:$('taxExemptChk').checked,disc:$('discType').value,dep:$('depositPctInput').value}));
E('changeClientInPricer()'); E(`cpSelectClient('${cidC}')`); await sleep(20);
check(!$('taxExemptChk').checked&&$('discVal').value==='5'&&$('depositPctInput').value==='20'&&/5% discount, 20% deposit/.test(notice()),'to Builder Bob: 5% discount, 20% deposit',notice());
U.type($('discVal'),12);
E('changeClientInPricer()'); E(`cpSelectClient('${cidB}')`); await sleep(20);
check($('discVal').value==='12'&&$('depositPctInput').value===shopDep,'a discount changed by hand is kept; the client\'s deposit is undone');
E('pricerCleanState=pricerSnapshot();closePricer()');
// shop default payment schedule vs a client deposit
E('openSettings()'); await sleep(10); U.type($('xs-paySchedule'),'50/40/10'); E('saveSettings()'); await sleep(20); E('closeSettings()');
n=num++; E(`openPricer(${n},'${cidC}')`); await sleep(20);
check($('paySchedule').value===''&&$('depositPctInput').value==='20','client\'s deposit replaces the shop\'s default schedule');
E('changeClientInPricer()'); E(`cpSelectClient('${cidB}')`); await sleep(20);
check($('paySchedule').value==='50/40/10','switching to a plain client brings the shop schedule back');
E('pricerCleanState=pricerSnapshot();closePricer()');
E('openSettings()'); await sleep(10); U.type($('xs-paySchedule'),''); E('saveSettings()'); await sleep(20); E('closeSettings()');
// an estimate with no client at all
E(`openPricer(${num++},'')`); await sleep(20); check(notice()===''&&!$('taxExemptChk').checked,'no client: nothing applied'); E('pricerCleanState=pricerSnapshot();closePricer()');

startScenario('C4','Second device + migration','new');
const D2=await L.bootDashboard(S); await sleep(150);
const a2=D2.E(`getClients().find(c=>c.id==='${cidA}')`);
check(a2&&a2.prefs.taxExempt&&a2.prefs.taxCert==='TX-<b>12345</b>'&&a2.prefs.payTerms==='net30','other device gets the client settings',JSON.stringify(a2?.prefs));
D2.E(`openClientForm('${cidC}')`); await sleep(10);
D2.$('cf-deposit').value='30'; D2.E('saveClientForm()'); await sleep(80);
await E('pullFromServerOnLoad()'); await sleep(40);
const c1=E(`getClients().find(c=>c.id==='${cidC}')`); check(c1.prefs.depositPct===30&&c1.prefs.discountPct===5&&c1.name==='Builder Bob','change made on the other device arrives (and nothing else is lost)',JSON.stringify(c1));
let mErr=null; try{ await S.pg.exec(fs.readFileSync(L.ROOT+'netlify/database/migrations/012_client_prefs_migration.sql','utf8')); }catch(e){ mErr=e.message; }
check(!mErr,'migration 012 runs cleanly even after the column exists',mErr);
// a client saved by an older copy of the app (no prefs field) keeps its settings
await S.route('/api/clients',{method:'POST',body:JSON.stringify({id:cidC,patch:true,phone:'281-555-0101'})});
row=(await q('select prefs,phone from clients where id=$1',[cidC]))[0]; check(row.prefs.depositPct===30&&row.phone==='281-555-0101','an edit without settings leaves the settings alone');

console.log(`\nGROUP C  CHECKS ${R.checks}  PASSED ${R.passed}  FAILED ${R.fails.length}`); R.fails.forEach(f=>console.log(' FAIL',f.scen,f.what,f.detail));
console.log('errors',D.errs.slice(0,3),D2.errs.slice(0,3),S.serverLog.slice(0,3)); process.exit();
function cent(n){ return L.cent(n); }
