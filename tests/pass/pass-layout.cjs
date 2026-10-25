// Real-browser layout check (phone 390px + computer 1440px) on the pass data.
const { chromium } = require('playwright-core'); const fs=require('fs');
const OUT='/tmp/claude-0/-home-user-inkable-dashboard/728f4646-ec24-5993-b4d8-07d699a2e852/scratchpad/pass-shots';
const R='/home/user/inkable-dashboard/netlify-deploy/';
const sync=JSON.parse(fs.readFileSync(__dirname+'/fn/pass-sync.json','utf8')); const pubs=JSON.parse(fs.readFileSync(__dirname+'/fn/pass-pubs.json','utf8'));
const jspdf=fs.readFileSync(__dirname+'/node_modules/jspdf/dist/jspdf.umd.min.js','utf8');
const token=Buffer.from(JSON.stringify({exp:Date.now()+86400000*30})).toString('base64url')+'.sig';
const results=[]; let checks=0, fails=0;
const ok=(c,m)=>{ checks++; if(!c){fails++; console.log('FAIL '+m);} };
const overflow=()=>{ const vw=innerWidth,out=[]; document.querySelectorAll('body *').forEach(el=>{ const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden')return; const r=el.getBoundingClientRect(); if(!r.width||!r.height)return;
  if(r.right>vw+1||r.left<-1){ let p=el.parentElement,clip=false; while(p&&p!==document.body){ const pcs=getComputedStyle(p); if(/(auto|scroll|hidden)/.test(pcs.overflowX)){ const pr=p.getBoundingClientRect(); if(pr.right<=vw+1&&pr.left>=-1){clip=true;break;} } p=p.parentElement; }
    if(!clip)out.push((el.id?'#'+el.id:el.tagName.toLowerCase()+(typeof el.className==='string'&&el.className?'.'+el.className.split(' ')[0]:''))+' '+Math.round(r.left)+'..'+Math.round(r.right)); } });
  return {pageWide:document.documentElement.scrollWidth>vw+1, out:out.slice(0,6)}; };
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
  const find=est=>sync.projects.find(p=>p.estNo===est);
  const ids={C05:pubs.C05.pid,B05:pubs.B05.pid,C08:pubs.C08.pid,R13:pubs.R13.pid};
  for(const [label,W,H] of [['phone',390,844],['computer',1440,900]]){
    const ctx=await b.newContext({viewport:{width:W,height:H},deviceScaleFactor:W<700?2:1,isMobile:W<700,hasTouch:W<700});
    const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await page.route('**/*',async r=>{ const u=new URL(r.request().url());
      if(u.hostname==='x.netlify.app'){
        if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:fs.readFileSync(R+'index.html','utf8')});
        if(u.pathname==='/proof.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(R+'proof.html','utf8')});
        if(u.pathname==='/api/sync-all')return r.fulfill({contentType:'application/json',body:JSON.stringify(sync)});
        if(u.pathname==='/api/proof-public'){ const t=u.searchParams.get('token'); const hit=Object.values(pubs).find(p=>p.token===t); return r.fulfill({contentType:'application/json',body:JSON.stringify(hit?hit.data:{error:'x'})}); }
        return r.fulfill({contentType:'application/json',body:r.request().postData()||'{}'}); }
      if(u.href.includes('jspdf'))return r.fulfill({contentType:'application/javascript',body:jspdf});
      return r.abort(); });
    await page.addInitScript(t=>{ try{localStorage.setItem('inkable_auth_token',t);}catch(e){} },token);
    const scenes=[
      ['projects',`switchTab('projects')`],
      ['job-page-wrap',`openJobPage('${ids.C05}')`],
      ['job-page-special-chars',`openJobPage('${ids.R13}')`],
      ['pricer-wrap',`editInPricer('${ids.C05}')`],
      ['pricer-3-items',`editInPricer('${ids.C08}')`],
      ['sales',`switchTab('sales')`],
      ['reports',`switchTab('reports')`],
      ['client-profile',`openClientProfile(getProjects().find(p=>p.id==='${ids.C05}').clientId)`],
    ];
    for(const [name,js] of scenes){
      await page.goto('https://x.netlify.app/'); await page.waitForTimeout(500);
      try{ await page.evaluate(js); }catch(e){ errs.push(name+': '+e.message); }
      await page.waitForTimeout(350);
      const o=await page.evaluate(overflow);
      ok(!o.pageWide&&!o.out.length,`${label} ${name}: nothing wider than the screen ${JSON.stringify(o.out)}`);
      if(['job-page-wrap','pricer-wrap','pricer-3-items','job-page-special-chars'].includes(name)||label==='phone')await page.screenshot({path:`${OUT}/${label}-${name}.png`});
    }
    for(const id of ['C05','B05']){
      await page.goto(`https://x.netlify.app/proof.html?token=${pubs[id].token}`); await page.waitForTimeout(600);
      await page.evaluate(()=>document.getElementById('estimateToggle')?.click()); await page.waitForTimeout(200);
      const o=await page.evaluate(overflow); ok(!o.pageWide&&!o.out.length,`${label} client page ${id}: nothing wider than the screen ${JSON.stringify(o.out)}`);
      await page.screenshot({path:`${OUT}/${label}-client-page-${id}.png`,fullPage:true});
    }
    ok(!errs.length,`${label}: no page errors ${JSON.stringify(errs.slice(0,3))}`);
    await ctx.close();
  }
  await b.close(); console.log(`LAYOUT CHECKS ${checks} FAILED ${fails}`);
})();
