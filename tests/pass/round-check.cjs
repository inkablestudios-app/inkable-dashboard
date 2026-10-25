// How often do the app's three rounding methods disagree on a job total?
// PDF/Dashboard: n.toFixed(2)   client page: toLocaleString   server/Stripe: Math.round(n+'e2')
let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
const toCents=n=>Number(Math.round(Number(n)+'e2')+'e-2');
let N=200000, totalPdfVsStripe=0, totalPageVsStripe=0, taxPdfVsTrue=0, partsVsTotal=0, depositSplit=0;
for(let i=0;i<N;i++){
  const sqft=Math.round(rnd()*400*16)/16, mat=[0.41,0.48,0.5,0.86,2.5,0.22][i%6]+(rnd()<0.5?0.42:0);
  const items=(mat+0.15)*sqft*2.5, design=[0,40,65,85][i%4]*Math.round(rnd()*8)/4, install=[0,40,65,85][(i>>2)%4]*Math.round(rnd()*16)/4;
  const taxable=items+design+install+10, tax=taxable*0.0825, fee=(taxable+tax)*0.029, total=taxable+tax+fee;
  const pdf=total.toFixed(2), page=total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).replace(/,/g,''), stripe=toCents(total).toFixed(2);
  if(pdf!==stripe)totalPdfVsStripe++; if(page!==stripe)totalPageVsStripe++;
  if(tax.toFixed(2)!==toCents(tax).toFixed(2))taxPdfVsTrue++;
  if((+taxable.toFixed(2)+ +tax.toFixed(2)+ +fee.toFixed(2)).toFixed(2)!==pdf)partsVsTotal++;
  const dep=toCents(total*0.5), rest=toCents(total-dep); if(toCents(dep+rest)!==toCents(total))depositSplit++;
}
const pct=x=>(x/N*100).toFixed(2)+'%';
console.log('jobs simulated',N);
console.log('PDF total ≠ Stripe full charge  ',totalPdfVsStripe,pct(totalPdfVsStripe));
console.log('client page total ≠ Stripe      ',totalPageVsStripe,pct(totalPageVsStripe));
console.log('PDF tax rounded the wrong way    ',taxPdfVsTrue,pct(taxPdfVsTrue));
console.log('PDF rows do not add up to total  ',partsVsTotal,pct(partsVsTotal));
console.log('deposit + rest ≠ total           ',depositSplit,pct(depositSplit));
