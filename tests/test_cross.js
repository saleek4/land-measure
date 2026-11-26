const TH=require('./helpers');
const fs=require('fs');
const html=fs.readFileSync(TH.root + '/index.html','utf8');
const m=html.match(/\/\/ <MATH>([\s\S]*?)\/\/ <\/MATH>/)[1];
const f=new Function(m+';return{tapeSolve,tapeCross,tapeRot,tapeOrient,tapeBestHub,crossInside,triMin,polyArea}')();
let fail=0;const ok=(c,msg)=>{console.log((c?'PASS ':'FAIL ')+msg);if(!c)fail++};
const near=(a,b,t)=>Math.abs(a-b)<=t, D=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
ok(f.tapeCross(3,0).length===0&&f.tapeCross(4,0).length===1&&f.tapeCross(5,0).length===2&&f.tapeCross(8,0).length===5,'cross count is corners - 3');
ok(JSON.stringify(f.tapeCross(5,3))==='[[3,0],[3,1]]','hub 4 of 5 gives crosses 4-1 and 4-2');
// irregular pentagon: every hub reproduces the same shape and area
const pent=[{x:0,y:0},{x:60,y:-5},{x:75,y:40},{x:30,y:62},{x:-8,y:35}];
const A0=Math.abs(f.polyArea(pent)),sides=pent.map((p,i)=>D(p,pent[(i+1)%5]));
for(let h=0;h<5;h++){
  const diags=f.tapeCross(5,h).map(c=>D(pent[c[0]],pent[c[1]])),n=5;
  const r=f.tapeSolve(f.tapeRot(sides,h),diags,h);
  ok(r.ok&&near(r.area,A0,1e-6),'hub '+(h+1)+': area '+r.area.toFixed(3)+' = '+A0.toFixed(3));
  const P=new Array(n);r.P.forEach((p,k)=>{P[(h+k)%n]=p});const Q=f.tapeOrient(P);
  let worst=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)worst=Math.max(worst,Math.abs(D(Q[i],Q[j])-D(pent[i],pent[j])));
  ok(worst<1e-6&&near(Q[0].x,0,1e-9)&&near(Q[0].y,0,1e-9)&&near(Q[1].y,0,1e-9)&&Q[1].x>0,'hub '+(h+1)+': all distances match the real shape, side 1 along +x (worst '+worst.toExponential(1)+')');
}
// messages use the real corner numbers
let r=f.tapeSolve(f.tapeRot(sides,2),[],2);ok(!r.ok&&/from point 3 to point 5/.test(r.err),'missing cross is asked for with real numbers: '+r.err);
r=f.tapeSolve([10,10,10,10],[],0);ok(!r.ok&&r.need===2&&/from point 1 to point 3/.test(r.err),'old call (no hub) unchanged: '+r.err);
r=f.tapeSolve([10,10,10,10],[25]);ok(!r.ok,'impossible lengths still rejected');
// best hub: L shape
const L=[{x:0,y:0},{x:40,y:0},{x:40,y:10},{x:10,y:10},{x:10,y:40},{x:0,y:40}];
let b=f.tapeBestHub(L);ok(b.ok&&f.tapeCross(6,b.hub).every(c=>f.crossInside(L,c[0],c[1])),'L shape: best hub '+(b.hub+1)+' keeps all crosses inside (min angle '+b.minAng.toFixed(1)+')');
// U shape: hub 1 would cross the notch, best hub must avoid it
const U=[{x:0,y:0},{x:30,y:0},{x:30,y:30},{x:20,y:30},{x:20,y:10},{x:10,y:10},{x:10,y:30},{x:0,y:30}];
ok(!f.tapeCross(8,0).every(c=>f.crossInside(U,c[0],c[1])),'U shape: crosses from corner 1 cross the notch');
b=f.tapeBestHub(U);ok(!b.ok||f.tapeCross(8,b.hub).every(c=>f.crossInside(U,c[0],c[1])),'U shape: best hub '+(b.hub+1)+' ok='+b.ok);
// thin triangles: hub choice avoids the sliver
const S=[{x:0,y:0},{x:100,y:0},{x:100,y:2},{x:50,y:30},{x:0,y:2}];
b=f.tapeBestHub(S);const worst0=(()=>{let ma=180;for(let k=1;k<=3;k++)ma=Math.min(ma,f.triMin(S[0],S[k],S[k+1]));return ma})();
ok(b.minAng>=worst0-1e-9,'sliver shape: best hub '+(b.hub+1)+' min angle '+b.minAng.toFixed(1)+' >= hub 1 '+worst0.toFixed(1));
b=f.tapeBestHub([{x:0,y:0},{x:40,y:0},{x:40,y:25},{x:0,y:25}]);ok(b.ok&&b.hub===0,'rectangle: all hubs equal, first corner kept');
console.log(fail?'FAILED':'ALL PASS');process.exit(fail?1:0);
