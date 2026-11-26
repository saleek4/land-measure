const TH=require('./helpers');
const fs=require('fs');
const html=fs.readFileSync(TH.root + '/index.html','utf8');
const m=html.match(/\/\/ <MATH>([\s\S]*?)\/\/ <\/MATH>/)[1];
const f=new Function(m+';return{tapeSolve,tapeCross,tapeRot,tapeOrient,tapeCorners,toXY,fromXY,fpAlign,fpCheckPair,fpCheckTol,polyArea,crossInside}')();
let fail=0;const ok=(c,msg)=>{console.log((c?'PASS ':'FAIL ')+msg);if(!c)fail++};
const near=(a,b,t)=>Math.abs(a-b)<=t, D=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// a real pentagon (counter-clockwise), the "truth" on the ground
const truth=[{x:0,y:0},{x:60,y:-5},{x:75,y:40},{x:30,y:62},{x:-8,y:35}];
const sides=truth.map((p,i)=>D(p,truth[(i+1)%5]));
const diags=f.tapeCross(5,0).map(c=>D(truth[c[0]],truth[c[1]]));
const tp=f.tapeSolve(sides,diags,0); // tape shape, own frame
ok(tp.ok&&near(tp.area,Math.abs(f.polyArea(truth)),1e-6),'tape shape has the true area');
// the GPS draft: the truth moved, turned and jittered by a few metres
const th=37*Math.PI/180,c=Math.cos(th),s=Math.sin(th),jit=[[2,-3],[-3,2],[1,4],[-2,-2],[3,1]];
const draft=truth.map((p,i)=>({x:120+p.x*c-p.y*s+jit[i][0],y:-40+p.x*s+p.y*c+jit[i][1]}));
const al=f.fpAlign(tp.P,draft);
ok(!al.flip,'same turn direction: no mirror');
ok(al.rms<4.5,'tape shape sits on the draft within the jitter (rms '+al.rms.toFixed(2)+' m)');
ok(near(Math.abs(f.polyArea(al.P)),tp.area,1e-6),'aligning keeps the area exactly');
ok(al.P.every((p,i)=>near(D(p,al.P[(i+1)%5]),sides[i],1e-6)),'aligning keeps every side length');
ok(near(al.turn,37+Math.atan2(-5,60)*180/Math.PI,5),'turn found: '+al.turn.toFixed(1)+' degrees (draft turned 37, side 1 of the truth is at -4.8)');
// a draft walked the other way round (clockwise): the tape shape is mirrored onto it
const cw=draft.slice().reverse(),sidesCw=cw.map((p,i)=>D(p,cw[(i+1)%5]));
const dCw=f.tapeCross(5,0).map(c=>D(cw[c[0]],cw[c[1]])),tcw=f.tapeSolve(sidesCw,dCw,0);
const al2=f.fpAlign(tcw.P,cw);
ok(f.polyArea(cw)<0&&f.polyArea(al2.P)<0,'clockwise draft gets a clockwise tape shape');
ok(al2.rms<0.5,'clockwise draft fits closely (rms '+al2.rms.toFixed(3)+' m)');
// mirror in tapeCorners flips the shape
const lat0=11.05,lon0=76.07,a=f.tapeCorners(tp.P,lat0,lon0,90,false),b=f.tapeCorners(tp.P,lat0,lon0,90,true);
const A=f.toXY(a,lat0,lon0),B=f.toXY(b,lat0,lon0);
ok(f.polyArea(A)*f.polyArea(B)<0&&near(Math.abs(f.polyArea(A)),Math.abs(f.polyArea(B)),1e-3),'mirror option reverses the turn direction and keeps the area');
// check cross: not one of the fan crosses, not a side, inside the plot, the longest such
const ck=f.fpCheckPair(truth,0);
const fan=f.tapeCross(5,0).map(c=>Math.min(c[0],c[1])+'-'+Math.max(c[0],c[1]));
ok(ck&&fan.indexOf(Math.min(ck.a,ck.b)+'-'+Math.max(ck.a,ck.b))<0,'check cross is not one of the crosses already taped: '+(ck.a+1)+'-'+(ck.b+1));
ok(Math.abs(ck.a-ck.b)!==1&&!(ck.a===0&&ck.b===4),'check cross is not a side');
ok(ck.inside&&near(ck.len,D(truth[ck.a],truth[ck.b]),1e-9),'check cross stays inside the plot');
const sq=[{x:0,y:0},{x:30,y:0},{x:30,y:20},{x:0,y:20}];
const cs=f.fpCheckPair(sq,0);
ok(cs.a===1&&cs.b===3,'square, hub 1: the check cross is 2-4');
ok(f.fpCheckPair(sq.slice(0,3),0)===null,'a triangle has no cross to check');
// an L-shaped plot: the check cross must not run outside
const L=[{x:0,y:0},{x:40,y:0},{x:40,y:15},{x:15,y:15},{x:15,y:40},{x:0,y:40}];
const cl=f.fpCheckPair(L,0);
ok(cl&&cl.inside,'L-shaped plot: the check cross stays inside ('+(cl.a+1)+'-'+(cl.b+1)+')');
// every cross measured exactly agrees with the check: prediction from the tape shape equals the truth
ok(near(D(tp.P[ck.a],tp.P[ck.b]),D(truth[ck.a],truth[ck.b]),1e-6),'a correct tape set predicts the check cross exactly');
ok(near(f.fpCheckTol(30),0.30,1e-9)&&near(f.fpCheckTol(0),0.15,1e-9),'check tolerance 0.15 m + 0.5 %');
console.log(fail?'SOME FAILED':'ALL PASS');process.exit(fail?1:0);
