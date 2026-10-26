// New settings, group D (documents): numbering, payment methods, business
// address/website/phone on documents, logo + client page color, invoice terms.
import fs from 'node:fs'; import zlib from 'node:zlib';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as L from './pass-lib.mjs';
const {check,near,sleep,startScenario,R,pdfText}=L;
const S=await L.bootServer(); const D=await L.bootDashboard(S); const {E,d,$,w}=D; const U=L.ui(D);
const items=()=>[...d.querySelectorAll('#lineItemsContainer .line-item')];
async function setX(vals){ E('openSettings()'); await sleep(15); for(const [k,v] of Object.entries(vals)){ const el=$('xs-'+k)||$(k); if(el.type==='checkbox')el.checked=!!v; else if(el.tagName==='SELECT')U.pick(el,String(v)); else U.type(el,v); } const ab=D.alerts.length; E('saveSettings()'); await sleep(30); E('closeSettings()'); return D.alerts.length>ab?D.alerts.at(-1):''; }
const page=async tok=>{ const cp=new JSDOM(fs.readFileSync(L.ROOT+'proof.html','utf8'),{url:'https://x.netlify.app/proof.html?token='+tok,runScripts:'dangerously',virtualConsole:new VirtualConsole(),beforeParse(cw){cw.fetch=S.route;}}); await sleep(80); return cp.window; };
const share=async id=>(await (await S.route('/api/proof-share',{method:'POST',body:JSON.stringify({projectId:id})})).json()).token;
const pdf=async(fn)=>{ const k=D.pdfs.length; E(fn); await sleep(40); return D.pdfs.length>k?pdfText(D.pdfs.at(-1).buf).replace(/[ \t]+/g,' '):''; };
const raw=()=>D.pdfs.at(-1).buf.toString('latin1');
const fmtD=x=>x.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const addDays=(x,n)=>new Date(x.getFullYear(),x.getMonth(),x.getDate()+n);
E("addClient({name:'Docs Co',email:'d@example.com',addr:'1 Main St',city:'Katy',state:'TX',zip:'77494'})"); await sleep(40); const cid=E('getClients()[0].id');
async function job(price,{client=cid}={}){ const n=E('nextProjectNum()'); E(`openPricer(${n},'${client}')`); await sleep(15); const est=$('pricerEstNo').value; L.fillItem(D,items()[0],{desc:'Sign',mode:'flat',price}); L.fillJob(D,{setupMins:0}); E('recalc()'); $('pricerSaveBtn').click(); await sleep(90); E('closePricer()'); return E(`getProjects().find(p=>p.estNo===${JSON.stringify(est)})`); }
// a real 30×12 PNG (red), for the logo
function png(wd,ht){ const crc=b=>{ let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;} let x=0xffffffff; for(const v of b)x=t[(x^v)&255]^(x>>>8); return (x^0xffffffff)>>>0; };
  const chunk=(ty,data)=>{ const l=Buffer.alloc(4);l.writeUInt32BE(data.length); const td=Buffer.concat([Buffer.from(ty),data]); const c=Buffer.alloc(4);c.writeUInt32BE(crc(td)); return Buffer.concat([l,td,c]); };
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(wd,0); ihdr.writeUInt32BE(ht,4); ihdr[8]=8; ihdr[9]=2;
  const rows=[]; for(let y=0;y<ht;y++){ rows.push(Buffer.from([0])); rows.push(Buffer.alloc(wd*3,0).fill(Buffer.from([220,30,30]))); }
  return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]).toString('base64'); }

startScenario('D1','Numbering: prefix and starting number','new');
const old=await job(100); check(/^EST-\d+$/.test(old.estNo),'before: EST- numbers',old.estNo);
check(/must|characters/.test(await setX({estPrefix:'EST1'})),'a prefix ending in a number is refused');
check(/characters/.test(await setX({invPrefix:''})),'an empty prefix is refused');
check(await setX({estPrefix:'IS- ',invPrefix:'IN-',startNumber:2500})==='','prefix IS- / IN-, start at 2500');
let p=await job(250); let pd=JSON.parse(p.state.form.pricerData);
check(p.estNo==='IS-2500'&&p.state.form.invNo==='IN-2500'&&String(p.projectNum)==='2500','new job: IS-2500 / IN-2500',JSON.stringify({e:p.estNo,i:p.state.form.invNo,n:p.projectNum}));
const p2=await job(260); check(p2.estNo==='IS-2501','next one: IS-2501',p2.estNo);
await setX({startNumber:100}); const p3=await job(270); check(p3.estNo==='IS-2502','a lower start number doesn\'t go backwards',p3.estNo);
check(E(`getProjects().find(x=>x.id==='${old.id}').estNo`)===old.estNo,'old job keeps its EST- number');
let inv=await pdf(`generateSavedPDF('${p.id}','invoice')`); check(/IN-2500/.test(inv),'invoice PDF shows IN-2500');
let est=await pdf(`generateSavedPDF('${p.id}','estimate')`); check(/IS-2500/.test(est),'estimate PDF shows IS-2500');
// sorting by job #: by the number, old EST- jobs before the new ones
E("currentFilter='all';sortCol='jobnum';sortDir='asc';renderProjects()"); await sleep(20);
const order=E("getFilteredSortedProjects().map(p=>p.estNo)");
check(JSON.stringify(order).indexOf(old.estNo)<JSON.stringify(order).indexOf('IS-2500'),'sorting by job #: by number across prefixes',JSON.stringify(order).slice(0,160));
// copy as a new estimate: next number, new prefix
E(`copyJobToNewEstimate('${old.id}')`); await sleep(30); check($('pricerEstNo').value==='IS-2503','copy of an old job gets IS-2503',$('pricerEstNo').value); E('pricerCleanState=pricerSnapshot();closePricer()');
// two devices made the same number: the server renumbers with the same prefixes
const body={id:'proj_clash',name:'x',estNo:'IS-2500',projectNum:'2500',clientId:cid,savedAt:new Date().toISOString(),docType:'estimate',state:{form:{estNo:'IS-2500',invNo:'IN-2500',projectNum:'2500'}},onEstClash:'renumber',minNextNum:2503};
const rr=await (await S.route('/api/projects',{method:'POST',body:JSON.stringify(body)})).json();
check(rr.renumbered&&/^IS-25\d\d$/.test(rr.renumbered.estNo)&&rr.renumbered.invNo==='IN-'+rr.renumbered.estNo.slice(3),'server renumbers a clash as IS-…/IN-…',JSON.stringify(rr.renumbered));
await S.route('/api/projects?id=proj_clash',{method:'DELETE'});

startScenario('D2','Payment methods list','new');
await setX({paymentMethods:'Cash, Zelle, Venmo, Cash App, ACH, Zelle'});
E(`openPaymentModal('${p.id}')`); await sleep(10);
let opts=[...$('pmtMethod').options].map(o=>o.value); check(JSON.stringify(opts)==='["Cash","Zelle","Venmo","Cash App","ACH"]','payment window lists them (no duplicates)',JSON.stringify(opts));
check($('pmtMethod').value==='Cash','first one picked');
U.type($('pmtAmount'),50); U.pick($('pmtMethod'),'Venmo'); E('submitPayment()'); await sleep(40);
check(E(`getPayments('${p.id}')`).some(x=>x.method==='Venmo'&&near(x.amount,50)),'payment recorded as Venmo');
let rc=await pdf(`generateReceiptPDF('${p.id}')`); check(/Venmo/.test(rc),'receipt shows Venmo');
await setX({paymentMethods:' , '}); E(`openPaymentModal('${p.id}')`); await sleep(10);
opts=[...$('pmtMethod').options].map(o=>o.value); check(JSON.stringify(opts)==='["Cash","Check","Card","Zelle","Other"]','blank list: the standard choices',JSON.stringify(opts)); E('closePaymentModal()');

startScenario('D3','Business address, website and phone on documents','new');
const ADDR='1234 Westheimer Pkwy, Katy, TX 77494';
await setX({bizAddress:ADDR,bizWebsite:'https://inkablestudios.com/',settingBizPhone:'281-555-0101'});
let pp=await job(300);
est=await pdf(`generateSavedPDF('${pp.id}','estimate')`); check(est.includes(ADDR)&&est.includes('https://inkablestudios.com/'),'estimate PDF: address and website',est.slice(0,300));
inv=await pdf(`generateSavedPDF('${pp.id}','invoice')`); check(inv.includes(ADDR)&&/281-555-0101/.test(inv)&&inv.includes('inkablestudios.com'),'invoice PDF: address, phone, website');
rc=await pdf(`generateReceiptPDF('${pp.id}')`); check(rc.includes(ADDR)&&/281-555-0101/.test(rc),'receipt PDF: address and phone');
let tok=await share(pp.id); let cw=await page(tok); let ct=cw.document.getElementById('mainCard').textContent;
check(ct.includes(ADDR)&&ct.includes('inkablestudios.com'),'client page: address and website');
const links=[...cw.document.querySelectorAll('#mainCard a')].map(a=>a.getAttribute('href'));
check(links.includes('https://inkablestudios.com')&&links.some(h=>h.startsWith('https://www.google.com/maps/search/?api=1&query=1234%20Westheimer')),'client page: website link and map link',JSON.stringify(links));
await setX({bizAddress:'',bizWebsite:''}); E('settingsDraft=null');
const pq=await job(310); est=await pdf(`generateSavedPDF('${pq.id}','estimate')`);
check(!est.includes('Westheimer')&&!/undefined|null/.test(est),'blank address/website: left off');
cw=await page(await share(pq.id)); check(!/Westheimer|🌐|📍/.test(cw.document.getElementById('mainCard').textContent),'client page: left off when blank');

startScenario('D4','Logo and client page color','new');
const LOGO=png(30,12);
E('openSettings()'); await sleep(10); U.type($('xs-bizAddress'),'typed but not saved yet'); E(`setLogo('${LOGO}')`);
check($('xs-bizAddress').value==='typed but not saved yet','adding a logo keeps what you typed in other boxes');
check(!!d.querySelector('#xs-logo-cell img'),'logo preview shown');
U.type($('xs-bizAddress'),''); U.type($('xs-accentColor'),'#ff6600'); E('saveSettings()'); await sleep(30); E('closeSettings()');
check(E("getPricingData().bizLogo")===LOGO,'logo saved with the settings');
let pl=await job(320); est=await pdf(`generateSavedPDF('${pl.id}','estimate')`);
check(/\/Width 30\s*\/Height 12/.test(raw()),'estimate PDF uses the new logo (30×12 image inside)');
check(D.errs.length===0,'no errors drawing it',D.errs.slice(0,2));
tok=await share(pl.id); cw=await page(tok);
check(cw.document.querySelector('header img').getAttribute('src')===LOGO,'client page shows the logo');
const cs=cw.document.documentElement.style; check(cs.getPropertyValue('--blue')==='#ff6600'&&cs.getPropertyValue('--on-blue')==='#04162b','client page color #ff6600 with dark button text');
await setX({accentColor:'#1a237e'}); cw=await page(tok); check(cw.document.documentElement.style.getPropertyValue('--on-blue')==='#ffffff','dark color: white button text');
check(/color code/.test(await setX({accentColor:'blue'})),'a color that isn\'t a code is refused');
// a broken logo: falls back to the built-in one, the PDF still works
E("{const s=getPricingData();s.bizLogo='data:image/png;base64,AAAA';localStorage.setItem(PRICING_KEY,JSON.stringify(s));}");
const pb=await job(330); const k0=D.pdfs.length; E(`generateSavedPDF('${pb.id}','estimate')`); await sleep(40);
check(D.pdfs.length>k0&&!D.alerts.some(a=>/failed/.test(a)),'broken logo: built-in logo used, PDF still made');
E("{const s=getPricingData();s.bizLogo='';localStorage.setItem(PRICING_KEY,JSON.stringify(s));}");
await setX({accentColor:''}); cw=await page(tok); check(!cw.document.documentElement.style.getPropertyValue('--blue'),'blank color: built-in blue');

startScenario('D5','Invoice terms, due date, late fee note','new');
const today=new Date();
let pi=await job(400); inv=await pdf(`generateSavedPDF('${pi.id}','invoice')`);
check(inv.includes('Date: '+fmtD(today))&&/Due on receipt/.test(inv)&&!/per month/.test(inv),'default: dated today, "Due on receipt"',inv.slice(0,400));
await setX({invoiceTerms:'net15',lateFeeNote:'1.5% per month on past-due balances.'});
inv=await pdf(`generateSavedPDF('${pi.id}','invoice')`);
check(inv.includes('Due: '+fmtD(addDays(today,15))+' (Net 15)'),'Net 15: due 15 days from today',inv.slice(0,400));
check(/1\.5% per month on past-due balances\./.test(inv),'late payment note printed');
// marked Done 10 days ago: dated that day, due 15 days later
E(`setJobMeta('${pi.id}',{...getJobMeta('${pi.id}'),status:'done'})`); E(`{const m=getMeta();m['${pi.id}'].statusAt=Date.now()-10*864e5;saveMeta(m);}`);
const doneDay=new Date(Date.now()-10*864e5);
inv=await pdf(`generateSavedPDF('${pi.id}','invoice')`);
check(inv.includes('Date: '+fmtD(doneDay))&&inv.includes('Due: '+fmtD(addDays(doneDay,15))+' (Net 15)'),'done 10 days ago: dated that day, due 15 days later',inv.slice(0,400));
// receipts: no due line
rc=await pdf(`generateReceiptPDF('${pi.id}')`); check(!/Due:|Due on receipt/.test(rc),'receipt has no due line');
// paid in full: "Paid in full", no late note
E(`addPayment('${pi.id}',getProjectAmount(getProjects().find(x=>x.id==='${pi.id}')),'Cash','Oct 26, 2026')`); await sleep(30);
inv=await pdf(`generateSavedPDF('${pi.id}','invoice')`); check(/Paid in full/.test(inv)&&!/per month/.test(inv),'paid in full: "Paid in full", no late note');
// a client on Net 30
E(`openClientForm('${cid}')`); await sleep(10); U.pick($('cf-pay-terms'),'net30'); E('saveClientForm()'); await sleep(60);
let pn=await job(500); check(JSON.parse(pn.state.form.pricerData).payTerms==='net30','job keeps the client\'s Net 30');
inv=await pdf(`generateSavedPDF('${pn.id}','invoice')`); check(inv.includes('Due: '+fmtD(addDays(today,30))+' (Net 30)'),'client on Net 30: due in 30 days');
// the pricer's own "Download PDF" (invoice) uses the same terms
E(`editInPricer('${pn.id}')`); await sleep(30); const kk=D.pdfs.length; E("generatePricerPDF('invoice')"); await sleep(60);
const pinv=D.pdfs.length>kk?pdfText(D.pdfs.at(-1).buf).replace(/[ \t]+/g,' '):''; check(pinv.includes('(Net 30)'),'invoice from the pricer: same due date'); E('pricerCleanState=pricerSnapshot();closePricer()');
// overdue reminders follow the due date for net-terms jobs
E(`{const m=getMeta();m['${pn.id}']={...getJobMeta('${pn.id}'),status:'done',statusAt:Date.now()-20*864e5};saveMeta(m);}`);
E(`{const s=getPricingData();s.overdueBalanceDays=1;localStorage.setItem(PRICING_KEY,JSON.stringify(s));}`);
const remFor=id=>E('computeReminders()').filter(r=>r.type==='overdue'&&r.projectId===id);
check(E(`isJobCommitted('${pn.id}')`)&&remFor(pn.id).length===0,'Net 30, done 20 days ago: not overdue yet');
E(`{const m=getMeta();m['${pn.id}'].statusAt=Date.now()-35*864e5;saveMeta(m);}`);
check(remFor(pn.id).length===1&&/past due since/.test(remFor(pn.id)[0].message),'Net 30, done 35 days ago: "past due" reminder',JSON.stringify(remFor(pn.id)));

// a job on the default terms keeps the old rule (N days after saving)
check(remFor(pi.id).length===0,'paid job: no reminder');
console.log(`\nGROUP D  CHECKS ${R.checks}  PASSED ${R.passed}  FAILED ${R.fails.length}`); R.fails.forEach(f=>console.log(' FAIL',f.scen,f.what,f.detail));
console.log('errors',D.errs.slice(0,3),S.serverLog.slice(0,3)); process.exit();
