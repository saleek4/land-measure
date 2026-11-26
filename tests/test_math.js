const TH=require('./helpers');
const fs=require('fs');
const html=fs.readFileSync(TH.root + '/index.html','utf8');
const m=html.match(/\/\/ <MATH>([\s\S]*?)\/\/ <\/MATH>/)[1];
const f=new Function(m+';return{toXY,fromXY,dist,shoelace,analyze,averageSamples,processWalk,haAre,UNIT,selfCross,radii}')();
let fail=0;const ok=(c,msg)=>{console.log((c?'PASS ':'FAIL ')+msg);if(!c)fail++};
const near=(a,b,t)=>Math.abs(a-b)<=t;
// 1. 100x100 m square near Malappuram (11.05N, 76.07E)
const lat0=11.05,lon0=76.07;
const sq=[[0,0],[100,0],[100,100],[0,100]].map(([x,y])=>{const g=f.fromXY(x,y,lat0,lon0);return{lat:g.lat,lon:g.lon,acc:2}});
const a=f.analyze(sq,'corners');
ok(near(a.area,10000,1),'square 100x100 area='+a.area.toFixed(3));
ok(near(a.per,400,0.01),'perimeter='+a.per.toFixed(3));
ok(!a.cross,'square not self-crossing');
// sigma sanity: 4 corners, acc 2 -> sigma_axis 1.333, g2 = (200^2... |p_{i+1}-p_{i-1}|=141.42 -> 20000/4=5000 ; var=4*1.7778*5000
const expectSig=Math.sqrt(4*(2/1.5)**2*5000);
ok(near(a.sig,expectSig,0.01),'sigma='+a.sig.toFixed(2)+' expect '+expectSig.toFixed(2));
// 2. bow-tie
const bt=[[0,0],[10,10],[10,0],[0,10]].map(([x,y])=>{const g=f.fromXY(x,y,lat0,lon0);return{lat:g.lat,lon:g.lon,acc:2}});
ok(f.analyze(bt,'corners').cross===true,'bow-tie detected');
// 3. units
const acre=4046.8564224;
ok(near(f.UNIT.cent.f(acre),100,1e-9),'1 acre = 100 cent');
ok(near(f.UNIT.sqft.f(acre),43560,0.01),'1 acre = 43560 sq ft: '+f.UNIT.sqft.f(acre));
const k=f.haAre(23456.7);ok(k.ha===2&&k.are===34&&near(k.m2,56.7,1e-6),'haAre '+JSON.stringify(k));
// 4. geodesic cross-check with spherical-excess free formula on a larger plot (5 acre-ish, irregular)
const irr=[[0,0],[210,15],[260,160],[120,230],[-20,140]].map(([x,y])=>{const g=f.fromXY(x,y,lat0,lon0);return{lat:g.lat,lon:g.lon,acc:2}});
const ai=f.analyze(irr,'corners');
// reference shoelace in plain xy
let s=0;const pts=[[0,0],[210,15],[260,160],[120,230],[-20,140]];for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];s+=p[0]*q[1]-q[0]*p[1]}
ok(near(ai.area,Math.abs(s)/2,2),'irregular area '+ai.area.toFixed(2)+' vs '+(Math.abs(s)/2));
// 5. averageSamples: noisy samples around truth
function rnd(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
const truth={lat:lat0,lon:lon0};const smp=[];
for(let i=0;i<30;i++){const e=f.fromXY(rnd()*2,rnd()*2,lat0,lon0);smp.push({lat:e.lat,lon:e.lon,acc:2+Math.random()*3,ts:i})}
const av=f.averageSamples(smp);const err=f.dist(truth,av);
ok(err<2.5,'averaged corner error '+err.toFixed(2)+' m, acc est '+av.acc.toFixed(2));
// 6. walk: 60x40 rectangle with noise 1.5 m, 1 sample per ~1.2 m
function walkRect(W,H,noise,step){const out=[];const per=[[0,0],[W,0],[W,H],[0,H],[0,0]];let ts=0;
 for(let s=0;s<4;s++){const[a,b]=[per[s],per[s+1]];const L=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let d=0;d<L;d+=step){const x=a[0]+(b[0]-a[0])*d/L,y=a[1]+(b[1]-a[1])*d/L;const g=f.fromXY(x+rnd()*noise,y+rnd()*noise,lat0,lon0);out.push({lat:g.lat,lon:g.lon,acc:3,ts:ts++})}}return out}
for(const [W,H,noise] of [[60,40,0.5],[60,40,1.5],[200,150,1.5]]){
 const w=f.processWalk(walkRect(W,H,noise,1.2));
 const aw=f.analyze(w,'walk');
 const t=W*H;
 console.log('walk',W,'x',H,'noise',noise,'vertices',w.length,'area',aw.area.toFixed(1),'true',t,'err%',((aw.area/t-1)*100).toFixed(2),'sig%',(aw.rel*100).toFixed(2));
 ok(Math.abs(aw.area/t-1)<(W>100?0.03:0.08),'walk area within tolerance');
}
console.log(fail?('FAILURES '+fail):'ALL PASS');process.exit(fail?1:0);
