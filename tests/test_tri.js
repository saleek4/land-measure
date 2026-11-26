// Tape / sketch lengths with ANY set of crosses (not only a fan from one corner): checks and solver
const TH=require('./helpers');
const fs=require('fs');
const html=fs.readFileSync(TH.root + '/index.html','utf8');
const m=html.match(/\/\/ <MATH>([\s\S]*?)\/\/ <\/MATH>/)[1];
const f=new Function(m+';return{tapeSolve,tapeSolveTri,tapeTriCheck,tapeCross,tapeRot,tapeOrient,polyArea,tapeKey}')();
let fail=0;const ok=(c,msg)=>{console.log((c?'PASS ':'FAIL ')+msg);if(!c)fail++};
const near=(a,b,t)=>Math.abs(a-b)<=t, D=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// ---- checks ----
let c=f.tapeTriCheck(6,[[0,2],[0,3],[0,4]]);ok(c.ok&&c.ears.length===4,'fan from corner 1 of 6 is accepted (4 triangles)');
c=f.tapeTriCheck(6,[[0,2],[2,4],[0,4]]);ok(c.ok,'a triangle inside a hexagon (1-3, 3-5, 1-5) is accepted');
c=f.tapeTriCheck(6,[[0,3],[1,4],[2,5]]);ok(!c.ok&&/cut through each other/.test(c.err),'crossing crosses are refused: '+c.err);
c=f.tapeTriCheck(6,[[0,2],[0,3]]);ok(!c.ok&&c.more===1&&/Choose 1 more cross: 6 corners need 3/.test(c.err),'too few: '+c.err);
c=f.tapeTriCheck(5,[[0,2],[0,3],[1,3]]);ok(!c.ok,'too many / crossing refused: '+c.err);
c=f.tapeTriCheck(5,[[0,1],[0,3]]);ok(!c.ok&&/already joined by a side/.test(c.err)&&/1 and 2/.test(c.err),'a side is not a cross: '+c.err);
c=f.tapeTriCheck(5,[[0,4],[0,3]]);ok(!c.ok&&/already joined/.test(c.err),'corner 1 to the last corner is a side');
c=f.tapeTriCheck(5,[[0,2],[2,0]]);ok(!c.ok&&/twice/.test(c.err),'the same cross twice is refused: '+c.err);
ok(f.tapeTriCheck(3,[]).ok&&f.tapeTriCheck(4,[[1,3]]).ok,'triangle needs no cross, a four-sided plot needs one (either one)');
// ---- random convex polygons, random triangulations ----
let seed=777;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
function convex(n){const a=[];for(let i=0;i<n;i++)a.push(2*Math.PI*(i+0.15+0.7*rnd())/n);a.sort((x,y)=>x-y);return a.map(t=>({x:70*Math.cos(t),y:40*Math.sin(t)}))}
function randTri(i,j,out){if(j-i<2)return;const k=i+1+Math.floor(rnd()*(j-i-1));if(k-i>=2)out.push([i,k]);if(j-k>=2)out.push([k,j]);randTri(i,k,out);randTri(k,j,out)}
let allOk=true,worstD=0,worstA=0,cnt=0;
for(let n=4;n<=12;n++)for(let t=0;t<6;t++){
  const P=convex(n);if(f.polyArea(P)<0)P.reverse();
  const crs=[];randTri(0,n-1,crs);
  const sides=P.map((p,i)=>D(p,P[(i+1)%n])),lens=crs.map(q=>D(P[q[0]],P[q[1]]));
  const r=f.tapeSolveTri(sides,crs,lens);cnt++;
  if(!r.ok||crs.length!==n-3){allOk=false;console.log('  bad',n,JSON.stringify(crs),r.err);continue}
  worstA=Math.max(worstA,Math.abs(r.area-Math.abs(f.polyArea(P))));
  const Q=f.tapeOrient(r.P);let w=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)w=Math.max(w,Math.abs(D(Q[i],Q[j])-D(P[i],P[j])));worstD=Math.max(worstD,w);
}
ok(allOk,cnt+' random plots (4 to 12 corners, random crosses) all solve');
ok(worstA<1e-6,'area matches the real shape (worst '+worstA.toExponential(1)+')');
ok(worstD<1e-6,'every corner-to-corner distance matches the real shape (worst '+worstD.toExponential(1)+')');
// ---- a fan gives the same answer as the old solver (the user's 8-corner sketch) ----
const sk={s:[31.70,59.12,33.0,19.04,13.65,9.95,22.80,100.3],x:[21.5,27.22,88.5,92.86,38.10]},h=4;
const old=f.tapeSolve(f.tapeRot(sk.s,h),sk.x,h),nw=f.tapeSolveTri(sk.s,f.tapeCross(8,h),sk.x);
ok(old.ok&&nw.ok&&near(old.area,nw.area,1e-6),'fan from corner 5: new solver = old solver ('+(nw.area/40.4686).toFixed(2)+' cent)');
// ---- concave L shape with crosses from two different corners ----
const L=[{x:0,y:0},{x:40,y:0},{x:40,y:10},{x:10,y:10},{x:10,y:40},{x:0,y:40}];
const Lc=[[0,2],[0,3],[3,5]];const Ls=L.map((p,i)=>D(p,L[(i+1)%6])),Ll=Lc.map(q=>D(L[q[0]],L[q[1]]));
const lr=f.tapeSolveTri(Ls,Lc,Ll);ok(lr.ok&&near(lr.area,Math.abs(f.polyArea(L)),1e-6)&&!lr.warn,'L shape with crosses from two different corners (1-3, 1-4, 4-6): area '+(lr.area||0).toFixed(2)+' = '+Math.abs(f.polyArea(L)));
// ---- messages ----
let r=f.tapeSolveTri([10,10,10,10],[[0,2]],[]);ok(!r.ok&&/cross from corner 1 to corner 3/.test(r.err),'missing length is asked for with real numbers: '+r.err);
r=f.tapeSolveTri([10,10,10,10],[[0,2]],[40]);ok(!r.ok&&/do not close up/.test(r.err),'impossible length refused: '+r.err);
r=f.tapeSolveTri([10,0,10,10],[[0,2]],[12]);ok(!r.ok,'zero side refused');
console.log(fail?fail+' FAILED':'all passed');process.exit(fail?1:0);
