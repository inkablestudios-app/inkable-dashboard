// Test pass harness (Oct 25): a real Dashboard (jsdom) talking to the real
// server functions (PGlite database), a fake Stripe, the real client page,
// and PDF text read back with pdftotext. Nothing in the app is changed.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { JSDOM, VirtualConsole } from 'jsdom';

export const ROOT='/home/user/inkable-dashboard/netlify-deploy/';
const PGT='/tmp/claude-0/-home-user-inkable-dashboard/728f4646-ec24-5993-b4d8-07d699a2e852/scratchpad/pgt/';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const r2=n=>Math.round((+n+Number.EPSILON)*100)/100;
export const money=s=>parseFloat(String(s).replace(/[^0-9.\-]/g,''));

// ── results ────────────────────────────────────────────────────────────
export const R={checks:0,passed:0,fails:[],issues:[],scen:[]};
let cur=null;
export function startScenario(id,name,tier){ cur={id,name,tier,checks:0,fails:0}; R.scen.push(cur); }
export function check(cond,what,detail=''){
  R.checks++; if(cur)cur.checks++;
  if(cond){ R.passed++; return true; }
  if(cur)cur.fails++;
  R.fails.push({scen:cur?.id||'-',what,detail:String(detail).slice(0,400)});
  console.log(`  FAIL [${cur?.id}] ${what}${detail?' — '+String(detail).slice(0,300):''}`);
  return false;
}
// Things that are not a simple pass/fail (logic or coverage observations).
export function note(kind,text,scen){ R.issues.push({kind,text,scen:scen||cur?.id||'-'}); console.log(`  NOTE(${kind}) [${scen||cur?.id}] ${text}`); }
export const near=(a,b,t=0.005)=>Math.abs(a-b)<=t;

// ── database + server functions ───────────────────────────────────────
export async function bootServer(){
  const pg=new PGlite(); globalThis.__pg=pg;
  const M=ROOT+'netlify/database/migrations/';
  for(const f of ['001_initial_schema/migration.sql','002_auth/migration.sql','003_lead_source_migration.sql','004_expenses_migration.sql','005_exclusion_migration.sql','006_proof_shares_migration.sql','007_calendar_sync_migration.sql','008_estimate_visual_checkout_migration.sql','009_status_time_migration.sql','010_client_email_migration.sql','011_estimate_acceptance_migration.sql'])
    await pg.exec(fs.readFileSync(M+f,'utf8'));
  const H={};
  for(const n of ['clients','projects','job-meta','sync-all','proof-share','proof-public','pricing','create-checkout-session','stripe-webhook'])
    H[n]=(await import('./'+n+'.js')).default;
  process.env.STRIPE_SECRET_KEY='sk_test_x'; process.env.STRIPE_WEBHOOK_SECRET='whsec_t';
  const serverLog=[];
  const origErr=console.error; console.error=(...a)=>{ serverLog.push(a.map(String).join(' ')); };
  const route=async(url,opts={})=>{
    const u=new URL(url,'https://x.netlify.app'); const name=u.pathname.replace(/^\/api\//,'');
    if(!H[name]) return {ok:false,status:404,json:async()=>({error:'no route '+name}),text:async()=>''};
    const res=await H[name](new Request(u.href,{method:opts.method||'GET',body:opts.body,headers:opts.headers}));
    const txt=await res.text();
    return {ok:res.ok,status:res.status,json:async()=>JSON.parse(txt||'{}'),text:async()=>txt};
  };
  // fake Stripe (server functions call the global fetch)
  const S={}; let n=0; const created=[];
  globalThis.fetch=async(url,opts={})=>{
    url=String(url);
    let m=/checkout\/sessions\/([^/?]+)\/expire$/.exec(url);
    if(m){ const s=S[m[1]]; if(!s||s.status!=='open')return new Response(JSON.stringify({error:{message:'not open'}}),{status:400}); s.status='expired'; return new Response('{}'); }
    m=/checkout\/sessions\/([^/?]+)$/.exec(url);
    if(m&&!opts.method){ const s=S[m[1]]; if(!s)return new Response('{}',{status:404}); return new Response(JSON.stringify({id:s.id,status:s.status,payment_status:s.paid?'paid':'unpaid'})); }
    if(url.endsWith('/checkout/sessions')){ const p=new URLSearchParams(opts.body); const id='cs_'+(++n);
      let amount=0; for(let i=0;p.has(`line_items[${i}][price_data][unit_amount]`);i++)amount+=+p.get(`line_items[${i}][price_data][unit_amount]`)*(+p.get(`line_items[${i}][quantity]`)||1);
      S[id]={id,status:'open',paid:false,p,amount,base:+p.get('line_items[0][price_data][unit_amount]'),cardFee:p.get('metadata[card_fee]'),lines:[...p.keys()].filter(k=>/unit_amount/.test(k)).length,project:p.get('metadata[project_id]'),desc:p.get('metadata[description]'),name:p.get('line_items[0][price_data][product_data][name]'),email:p.get('customer_email')};
      created.push(S[id]); return new Response(JSON.stringify({id,url:'https://checkout.stripe.com/'+id})); }
    if(url.includes('/payment_intents/')){ const sid=(/pi_(cs_\d+)/.exec(url)||[])[1]; const s=S[sid]; const fee=s?Math.round(s.amount*0.029+30):300; return new Response(JSON.stringify({latest_charge:{balance_transaction:{fee}}})); }
    return new Response('{}',{status:404});
  };
  const stripe={S,created,
    // the client finishes paying on Stripe's page, then Stripe calls the webhook
    async pay(session){ session.paid=true; session.status='complete';
      const body=JSON.stringify({type:'checkout.session.completed',data:{object:{id:session.id,payment_intent:'pi_'+session.id,amount_total:session.amount,payment_status:'paid',metadata:{project_id:session.project,description:session.desc,...(session.cardFee?{card_fee:session.cardFee}:{})}}}});
      const t=Math.floor(Date.now()/1000); const sig=crypto.createHmac('sha256','whsec_t').update(t+'.'+body).digest('hex');
      const r=await H['stripe-webhook'](new Request('https://x/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':'t='+t+',v1='+sig},body}));
      return r.status; }};
  return {pg,H,route,stripe,serverLog,restoreConsole:()=>{console.error=origErr;}};
}

// ── Dashboard ─────────────────────────────────────────────────────────
export async function bootDashboard(server){
  const errs=[]; const vc=new VirtualConsole();
  vc.on('jsdomError',e=>{ const m=String(e.message||e); if(!/Not implemented: (navigation|window\.open|HTMLCanvas)|getContext/.test(m))errs.push(m); });
  vc.on('error',(...a)=>{ const m=a.map(String).join(' '); if(!/getContext|Not implemented/.test(m))errs.push('console.error: '+m); });
  const jspdf=fs.readFileSync(PGT+'node_modules/jspdf/dist/jspdf.umd.min.js','utf8');
  const alerts=[], confirms=[]; const pdfs=[];
  const dom=new JSDOM(fs.readFileSync(ROOT+'index.html','utf8'),{url:'https://x.netlify.app/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){
      w.eval(jspdf);
      w.fetch=server.route;
      w.matchMedia=()=>({matches:false,addListener(){},addEventListener(){}});
      w.HTMLCanvasElement.prototype.getContext=()=>null;
      w.alert=m=>alerts.push(String(m));
      w.confirm=m=>{ confirms.push(String(m)); return w.__confirmAnswer!==false; };
      w.URL.createObjectURL=()=>'blob:x'; w.URL.revokeObjectURL=()=>{};
      w.open=()=>({document:{write(h){ w.__printed=(w.__printed||'')+h; },close(){}},focus(){},print(){}});
      w.localStorage.setItem('inkable_auth_token',Buffer.from(JSON.stringify({exp:Date.now()+9e9})).toString('base64url')+'.s');
    }});
  const w=dom.window, d=w.document, E=x=>w.eval(x), $=id=>d.getElementById(id);
  await sleep(300);
  // capture PDFs that the app opens or downloads
  w.viewBlob=async(blob,title)=>{ pdfs.push({title,buf:Buffer.from(await blob.arrayBuffer())}); };
  w.jspdf.jsPDF.API.save=function(fname){ pdfs.push({title:'save:'+fname,buf:Buffer.from(this.output('arraybuffer'))}); return this; };
  return {dom,w,d,E,$,errs,alerts,confirms,pdfs};
}

let pdfN=0;
export function pdfText(buf){
  const f=path.join(PGT,'pass-tmp-'+process.pid+'-'+(pdfN++)+'.pdf'); fs.writeFileSync(f,buf);
  try{ return execFileSync('pdftotext',['-layout',f,'-'],{encoding:'utf8'}); } finally { fs.unlinkSync(f); }
}
// money amounts in a block of text, e.g. "$1,234.50" or "-$5.00"
export const amountsIn=t=>[...String(t).matchAll(/-?\$\s?[\d,]+\.\d{2}/g)].map(m=>money(m[0]));
// the amount printed on the same line as a label
export function lineAmount(text,label,last=false){
  const hits=String(text).split('\n').filter(l=>l.includes(label)).map(l=>amountsIn(l.slice(l.indexOf(label)+label.length))).filter(a=>a.length);
  if(!hits.length)return null; const a=last?hits[hits.length-1]:hits[0]; return a[a.length-1];
}

// ── filling the pricer like a person ──────────────────────────────────
export function ui(D){
  const {w,d,E}=D;
  const fire=(el,type)=>el.dispatchEvent(new w.Event(type,{bubbles:true}));
  const type=(el,v)=>{ if(!el)throw new Error('missing input'); el.focus?.(); el.value=String(v); fire(el,'input'); fire(el,'change'); };
  const pick=(el,v)=>{ if(!el)throw new Error('missing select'); if(![...el.options].some(o=>o.value===v))throw new Error(`no option "${v}" in ${el.className||el.id}`); el.value=v; fire(el,'change'); };
  const tick=(el,on)=>{ if(!el)throw new Error('missing checkbox'); if(el.checked!==!!on)el.click(); };
  const click=el=>{ if(!el)throw new Error('missing button'); el.click(); };
  return {fire,type,pick,tick,click};
}

// One item. Sizes: w/h numbers with wFt/hFt meaning "typed in feet".
export function fillItem(D,el,it){
  const {type,pick,tick,click}=ui(D); const q=s=>el.querySelector(s);
  if(it.desc!=null)type(q('.line-desc'),it.desc);
  if(it.vehicle){ click(q('.li-vehicle-toggle-btn')); type(q('.li-vehicle-info'),it.vehicle); }
  if(it.mode==='flat'){
    click(q('.li-pm-btn[data-pm="flat"]'));
    if(it.flat==='unit'){ click(q('.li-fm-btn[data-fm="unit"]')); type(q('.li-unit-price'),it.price); if(it.cost!=null)type(q('.li-unit-cost'),it.cost); }
    else { type(q('.li-total-price'),it.price); if(it.cost!=null)type(q('.li-total-cost'),it.cost); }
    type(q('.li-qty'),it.qty??1);
  }else{
    type(q('.li-qty'),it.qty??1);
    if(it.vinyl)pick(q('.li-vinyl'),it.vinyl);
    tick(q('.li-printed-chk'),it.printed!==false);
    pick(q('.li-lam'),it.lam||'No Laminate');
    // unit first, then the number (how you'd type "8 ft")
    if(it.wFt)click(q('.li-w-unit[data-unit="ft"]'));
    if(it.hFt)click(q('.li-h-unit[data-unit="ft"]'));
    type(q('.li-w'),it.w); type(q('.li-h'),it.h);
    if(it.sub&&it.sub!=='None'){
      pick(q('.li-sub'),it.sub);
      if(it.subW!=null){ tick(q('.li-sub-samesize'),false);
        if(it.subWFt)click(q('.li-subw-unit[data-unit="ft"]')); if(it.subHFt)click(q('.li-subh-unit[data-unit="ft"]'));
        type(q('.li-sub-w'),it.subW); type(q('.li-sub-h'),it.subH); }
      if(it.thick)type(q('.li-sub-thickness'),it.thick);
    }
  }
  if(it.design){ tick(q('.li-design-chk'),true); type(q('.li-design-hrs'),it.design.hrs||0); pick(q('.li-design-mins'),String(it.design.mins||0));
    if(it.design.level&&it.design.level!=='standard')click(q(`.li-design-level-toggle .li-lv-btn[data-lv="${it.design.level}"]`)); }
  if(it.install){ tick(q('.li-install-chk'),true);
    if(it.install.flat!=null){ click(q('.li-im-btn[data-installmode="flat"]')); type(q('.li-install-flat-price'),it.install.flat); if(it.install.cost!=null)type(q('.li-install-flat-cost'),it.install.cost); }
    else { type(q('.li-install-hrs'),it.install.hrs||0); pick(q('.li-install-mins'),String(it.install.mins||0));
      if(it.install.level&&it.install.level!=='standard')click(q(`.li-install-level-toggle .li-lv-btn[data-lv="${it.install.level}"]`)); } }
}
export function fillJob(D,job={}){
  const {type,pick,tick}=ui(D); const $=D.$;
  if(job.setupHrs!=null)type($('setupHrs'),job.setupHrs);
  if(job.setupMins!=null)pick($('setupMins'),String(job.setupMins));
  if(job.hardware!=null)type($('pricerHardware'),job.hardware);
  if(job.hardwareCost!=null)type($('pricerHardwareCost'),job.hardwareCost);
  if(job.subs!=null)type($('pricerSubs'),job.subs);
  if(job.subsCost!=null)type($('pricerSubsCost'),job.subsCost);
  if(job.disc){ pick($('discType'),job.disc.type); type($('discVal'),job.disc.val); }
  if(job.taxExempt)tick($('taxExemptChk'),true);
  if(job.minCharge!=null){ tick($('minChargeChk'),true); type($('minChargeVal'),job.minCharge); }
  if(job.fee===false)tick($('processingFeeChk'),false);
  if(job.depositPct!=null)type($('depositPctInput'),job.depositPct);
  if(job.notes)type($('pricerNotes'),job.notes);
  if(job.terms)type($('pricerTerms'),job.terms);
  if(job.desc)type($('pricerJobDesc'),job.desc);
}

// ── the expected price, worked out independently from the scenario ────
export const cent=n=>{ n=Number(n); if(!isFinite(n)||Math.abs(n)<1e-6)return 0; const v=Number(Math.round(Math.abs(n)+'e2')+'e-2'); return n<0?-v:v; };
export function expected(sc,rates,mats){
  const inches=(v,ft)=>Math.max(0,+v||0)*(ft?12:1);
  const qtyOf=v=>{ const q=parseFloat(v); return q>=1?q:1; };
  let items=0,design=0,install=0,raw=0,designBasis=0,installBasis=0; const lines=[];
  for(const it of sc.items){
    const qty=qtyOf(it.qty);
    let price=0,cost=0,sqft=0;
    if(it.mode==='flat'){
      if(it.flat==='unit'){ price=Math.max(0,+it.price||0)*qty; cost=Math.max(0,+it.cost||0)*qty; }
      else { price=Math.max(0,+it.price||0); cost=Math.max(0,+it.cost||0); }
    }else{
      sqft=inches(it.w,it.wFt)*inches(it.h,it.hFt)/144*qty;
      const subSqft=it.subW!=null?inches(it.subW,it.subWFt)*inches(it.subH,it.subHFt)/144*qty:sqft;
      const v=mats.vinyl[it.vinyl]??0, l=mats.laminate[it.lam||'No Laminate']??0, s=it.sub&&it.sub!=='None'?(mats.substrate[it.sub]??0):0;
      cost=(v+l+(it.printed!==false?rates.printCost:0))*sqft+s*subSqft; price=cost*rates.markup;
    }
    let dsg=0,ins=0;
    if(it.design){ const h=(+it.design.hrs||0)+(+it.design.mins||0)/60; dsg=h*rates.design[it.design.level||'standard']; designBasis+=h*rates.myCostDesign; }
    if(it.install){ if(it.install.flat!=null){ ins=+it.install.flat||0; installBasis+=+it.install.cost||0; }
      else { const h=(+it.install.hrs||0)+(+it.install.mins||0)/60; ins=h*rates.install[it.install.level||'standard']; installBasis+=h*rates.myCostInstall; } }
    items+=cent(price); design+=dsg; install+=ins; raw+=cost; lines.push({price:cent(price),priceRaw:price,sqft,cost,design:dsg,install:ins});
  }
  // Business rule: every shown amount is rounded to the cent first (half up),
  // and the totals are built from those rounded amounts.
  const j=sc.job||{};
  const setupH=(j.setupHrs!=null?+j.setupHrs:0)+(j.setupMins!=null?+j.setupMins:15)/60;
  const setup=cent(setupH*rates.setupRate), setupBasis=setupH*rates.myCostSetup;
  const hardware=cent(cent(Math.max(0,+j.hardware||0))+cent(Math.max(0,+j.subs||0))), hardwareBasis=Math.max(0,+j.hardwareCost||0)+Math.max(0,+j.subsCost||0);
  items=cent(items); design=cent(design); install=cent(install);
  const sub=cent(items+design+install+setup+hardware);
  let disc=0; if(j.disc){ const v=Math.max(0,+j.disc.val||0); disc=cent(j.disc.type==='pct'?sub*Math.min(100,v)/100:j.disc.type==='flat'?Math.min(v,sub):0); }
  let taxable=cent(sub-disc), minAdj=0;
  if(j.minCharge!=null&&taxable<+j.minCharge){ minAdj=cent(+j.minCharge-taxable); taxable=cent(taxable+minAdj); }
  const taxRate=sc.taxRate??rates.taxRate;
  const tax=j.taxExempt?0:cent(taxable*taxRate/100);
  const fee=j.fee===false?0:cent((taxable+tax)*rates.feeRate/100);
  const total=cent(taxable+tax+fee);
  const depPct=j.depositPct!=null?Math.min(100,+j.depositPct):rates.depositPct;
  const toCents=n=>Number(Math.round(Number(n)+'e2')+'e-2');
  return {lines,items,design,install,setup,hardware,sub,disc,minAdj,taxable,tax,fee,total,
    deposit:toCents(total*depPct/100),depPct,
    costs:{materials:r2(raw),design:r2(designBasis),install:r2(installBasis),setup:r2(setupBasis),hardware:r2(hardwareBasis)}};
}
export function ratesOf(E){
  const r=E('getRates()');
  return {markup:r.markup,printCost:r.printCost,setupRate:r.setupRate,myCostSetup:r.myCostSetup,myCostDesign:r.myCostDesign,myCostInstall:r.myCostInstall,
    design:{basic:r.designLevels.basic.rate,standard:r.designLevels.standard.rate,advanced:r.designLevels.advanced.rate},
    install:{basic:r.installLevels.basic.rate,standard:r.installLevels.standard.rate,advanced:r.installLevels.advanced.rate},
    taxRate:r.taxRate,feeRate:r.processingFeeRate,depositPct:r.depositPct};
}
export function matsOf(E){ return {vinyl:E('getVinyl()'),laminate:E('getLaminate()'),substrate:E('getSubstrate()')}; }
