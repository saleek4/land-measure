// Estimating a length from the drawing: scale, how far it can be off, and the corner error that carries it to the map result
const TH=require('./helpers');
const fs=require('fs');
const html=fs.readFileSync(TH.root + '/index.html','utf8');
const m=html.match(/\/\/ <MATH>([\s\S]*?)\/\/ <\/MATH>/)[1];
const f=new Function(m+';return{skScale,skEstRel,estAcc,analyze,fromXY}')();
let fail=0;const ok=(c,msg)=>{console.log((c?'PASS ':'FAIL ')+msg);if(!c)fail++};
const near=(a,b,t)=>Math.abs(a-b)<=t;
let s=f.skScale([{len:33,d:378},{len:38.1,d:448}]);
ok(s&&s.n===2&&near(s.k,0.0861,0.0005),'two lengths: scale is the middle of the two ratios ('+(s&&s.k.toFixed(4))+')');
ok(s.spread<0.02,'the two ratios agree to within 2% (spread '+s.spread.toFixed(3)+')');
ok(near(s.k*289,24.9,0.3),'a side drawn 289 units long comes out about 24.9 m');
s=f.skScale([{len:10,d:100},{len:20,d:100},{len:30,d:100}]);
ok(near(s.k,0.2,1e-9)&&near(s.spread,0.5,1e-9),'three lengths: the median is used, spread is half the range over the median');
ok(f.skScale([])===null&&f.skScale([{len:0,d:5},{len:5,d:0}])===null,'nothing usable: no scale');
ok(f.skScale([{len:12,d:100}]).spread===0,'one length: spread is 0');
ok(f.skEstRel({n:1,spread:0})===0.06,'one length to compare with: 6% error');
ok(f.skEstRel({n:3,spread:0.01})===0.03,'a good match: 3% at least');
ok(near(f.skEstRel({n:3,spread:0.12}),0.12,1e-9),'a loose match: the spread is the error');
// corner error: analyze() on corners with that acc reports the area error we asked for
const P=[{x:0,y:0},{x:24,y:0},{x:24,y:40},{x:0,y:40}];
for(const sig of [5,14.5,60]){
  const acc=f.estAcc(P,sig),C=P.map(p=>{const g=f.fromXY(p.x,p.y,10,76);return{lat:g.lat,lon:g.lon,acc:acc,src:'tape'}});
  const a=f.analyze(C,'corners',[]);
  ok(near(a.sig,sig,sig*0.02),'estAcc for '+sig+' m² gives acc '+acc.toFixed(2)+' m and analyze() reports ±'+a.sig.toFixed(2));
}
ok(f.estAcc(P,0)===0&&f.estAcc([],5)===0,'no error asked for / no polygon: 0');
process.exit(fail?1:0);
