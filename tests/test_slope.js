const TH=require('./helpers');
const fs=require('fs');
const html=fs.readFileSync(TH.root + '/index.html','utf8');
const m=html.match(/\/\/ <MATH>([\s\S]*?)\/\/ <\/MATH>/)[1];
const f=new Function(m+';return{toXY,fromXY,analyze,averageSamples,processWalk,slopeFit,compass8}')();
let fail=0;const ok=(c,msg)=>{console.log((c?'PASS ':'FAIL ')+msg);if(!c)fail++};
function rnd(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
const lat0=11.05,lon0=76.07;
function plot(W,H,deg,dirNorthUphill,zNoise,altAcc){
  const g=Math.tan(deg*Math.PI/180);
  return [[0,0],[W,0],[W,H],[0,H]].map(([x,y])=>{const p=f.fromXY(x,y,lat0,lon0);const z=100+g*(dirNorthUphill?y:x)+rnd()*zNoise;return{lat:p.lat,lon:p.lon,acc:2,alt:z,altAcc:altAcc}});
}
// 1. noiseless 20 deg slope, uphill to north -> downhill south, factor 1/cos20
let a=f.analyze(plot(100,100,20,true,0,3),'corners');
ok(a.slope.ok&&a.slope.detectable,'20deg detected (noiseless)');
ok(Math.abs(a.slope.slopeDeg-20)<0.6,'slope='+a.slope.slopeDeg.toFixed(2));
ok(Math.abs(a.surface/a.area-1/Math.cos(20*Math.PI/180))<0.003,'surface/area='+(a.surface/a.area).toFixed(4)+' expect '+(1/Math.cos(20*Math.PI/180)).toFixed(4));
ok(f.compass8(a.slope.aspect)==='S','downhill S, aspect='+a.slope.aspect.toFixed(0));
// uphill east -> downhill west
a=f.analyze(plot(100,100,15,false,0,3),'corners');ok(f.compass8(a.slope.aspect)==='W','east-uphill -> downhill W ('+a.slope.aspect.toFixed(0)+')');
// 2. noisy altitude (sigma 2 m, reported 4 m), 50x50 m plot, 25 deg: repeated trials
let errs=[],det=0;for(let i=0;i<300;i++){const r=f.analyze(plot(50,50,25,true,2,4),'corners');if(r.slope.detectable){det++;errs.push(r.surface/r.area)}}
const mean=errs.reduce((s,v)=>s+v,0)/errs.length,truth=1/Math.cos(25*Math.PI/180);
console.log('25deg 50m noisy: detected',det,'/300 mean factor',mean.toFixed(3),'truth',truth.toFixed(3));
ok(det>240&&Math.abs(mean-truth)<0.04,'steep slope usually detected with mean factor near truth');
// 3. flat land with noise: should mostly be "not detectable", and factor never far above 1
let falseDet=0,maxF=1,sumF=0;for(let i=0;i<500;i++){const r=f.analyze(plot(50,50,0,true,2,4),'corners');if(r.slope.detectable)falseDet++;maxF=Math.max(maxF,r.surface/r.area);sumF+=r.surface/r.area}
console.log('flat noisy: false detections',falseDet,'/500, max factor',maxF.toFixed(3),'mean factor',(sumF/500).toFixed(4));
ok(falseDet<60&&sumF/500<1.01,'flat land: few false slopes, mean bias <1%');
// 4. no altitude
a=f.analyze(plot(50,50,0,true,0,3).map(c=>({lat:c.lat,lon:c.lon,acc:c.acc})),'corners');ok(!a.slope.ok&&a.surface===a.area,'no altitude -> no slope, surface=area');
// 5. collinear points do not crash
const line=[[0,0],[10,0],[20,0],[30,0]].map(([x,y])=>{const p=f.fromXY(x,y,lat0,lon0);return{lat:p.lat,lon:p.lon,acc:2,alt:100+x*0.1,altAcc:3}});
const P=f.toXY(line,lat0,lon0);ok(f.slopeFit(line,P).ok===false,'collinear -> not ok');
// 6. averageSamples carries altitude
const smp=[];for(let i=0;i<20;i++){const p=f.fromXY(rnd(),rnd(),lat0,lon0);smp.push({lat:p.lat,lon:p.lon,acc:3,alt:50+rnd()*2,altAcc:4,ts:i})}
const av=f.averageSamples(smp);ok(Math.abs(av.alt-50)<2&&av.altAcc===4,'averaged alt='+av.alt.toFixed(2)+' altAcc='+av.altAcc);
// 7. walk on a 20deg hillside with altitude carries through
function walk(W,H,deg){const g=Math.tan(deg*Math.PI/180),out=[],per=[[0,0],[W,0],[W,H],[0,H],[0,0]];let ts=0;for(let s=0;s<4;s++){const[p,q]=[per[s],per[s+1]],L=Math.hypot(q[0]-p[0],q[1]-p[1]);for(let d=0;d<L;d+=1.2){const x=p[0]+(q[0]-p[0])*d/L,y=p[1]+(q[1]-p[1])*d/L,e=f.fromXY(x+rnd(),y+rnd(),lat0,lon0);out.push({lat:e.lat,lon:e.lon,acc:3,alt:200+g*y+rnd()*2,altAcc:4,ts:ts++})}}return out}
const w=f.processWalk(walk(150,120,20)),aw=f.analyze(w,'walk');
ok(aw.slope.ok&&aw.slope.detectable&&Math.abs(aw.slope.slopeDeg-20)<3,'walk-mode slope='+(aw.slope.slopeDeg||0).toFixed(1)+' deg');
console.log(fail?'FAILURES '+fail:'ALL PASS');process.exit(fail?1:0);
