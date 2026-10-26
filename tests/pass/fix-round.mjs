import * as L from './pass-lib.mjs';
const S=await L.bootServer(); const D=await L.bootDashboard(S); const {E,w}=D;
const out=w.eval(`(()=>{
  let seed=11; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  const toCents=n=>Number(Math.round(Number(n)+'e2')+'e-2');
  let bad={rows:0,total:0,tax:0,fee:0,stripe:0,nonCent:0}, N=20000;
  const isCent=v=>Math.abs(v*100-Math.round(v*100))<1e-6;
  for(let i=0;i<N;i++){
    const lines=Array.from({length:1+Math.floor(rnd()*4)},()=>({matTotal:rnd()*500,designCost:rnd()<0.3?rnd()*200:0,installCost:rnd()<0.3?rnd()*300:0}));
    const o={setupTotal:[0,10,20,40][i%4]*rnd(),hardware:rnd()<0.3?Math.round(rnd()*5000)/100:0,subs:rnd()<0.2?Math.round(rnd()*50000)/100:0,
      dtype:['none','pct','flat'][i%3],dval:[0,10,Math.round(rnd()*80)][i%3],minCharge:rnd()<0.2,minChargeVal:[25,50,175][i%3],
      taxExempt:rnd()<0.1,taxRate:[8.25,8.5,6.25][i%3],feeOn:rnd()<0.8,feeRate:2.9};
    const m=priceJob(lines,o);
    const rows=cents(m.totalMat+m.designTotal+m.totalInstall+m.setupTotal+m.hardwareTotal);
    if(Math.abs(rows-m.sub)>0.0001||Math.abs(cents(m.sub-m.disc+m.minChargeAdj)-m.taxable)>0.0001)bad.rows++;
    if(Math.abs(cents(m.taxable+m.tax+m.processingFee)-m.total)>0.0001)bad.total++;
    if(!o.taxExempt&&Math.abs(m.tax-toCents(m.taxable*o.taxRate/100))>0.0001)bad.tax++;
    if(o.feeOn&&Math.abs(m.processingFee-toCents((m.taxable+m.tax)*o.feeRate/100))>0.0001)bad.fee++;
    if(Math.abs(toCents(m.total)-m.total)>0.0001)bad.stripe++;
    if(![m.totalMat,m.sub,m.disc,m.taxable,m.tax,m.processingFee,m.total,...m.lineData.map(l=>l.matTotal)].every(isCent))bad.nonCent++;
  }
  return {N,bad};
})()`);
console.log(JSON.stringify(out)); process.exit();
