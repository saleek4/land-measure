// Plan photo: find the outline of the plot in a picture (pure maths, synthetic pictures)
const TH=require('./helpers');
const fs=require('fs');
const html=fs.readFileSync(TH.root + '/index.html','utf8');
const m=html.match(/\/\/ <MATH>([\s\S]*?)\/\/ <\/MATH>/)[1];
const f=new Function(m+';return{planOutline}')();
let fail=0;const ok=(c,msg)=>{console.log((c?'PASS ':'FAIL ')+msg);if(!c)fail++};
let seed=5;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
function pic(w,h){return{w,h,g:new Uint8Array(w*h).map(()=>228+Math.floor(rnd()*14))}}
function dot(P,x,y,r,v){for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){const X=Math.round(x)+i,Y=Math.round(y)+j;if(X>=0&&Y>=0&&X<P.w&&Y<P.h&&i*i+j*j<=r*r+1)P.g[Y*P.w+X]=v}}
function line(P,a,b,r,v){const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);for(let k=0;k<=n;k++){const t=k/n;dot(P,a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,r,v)}}
function poly(P,V,r,v){for(let i=0;i<V.length;i++)line(P,V[i],V[(i+1)%V.length],r,v)}
// scribbles that look like numbers written next to the sides
function digits(P,x,y){for(let k=0;k<3;k++){line(P,[x+k*9,y],[x+k*9+5,y],1,70);line(P,[x+k*9+5,y],[x+k*9+5,y+10],1,70);line(P,[x+k*9+5,y+10],[x+k*9,y+10],1,70)}}
// how far each true corner is from the nearest found corner (in pixels) and how many corners were found
function check(res,V,W,H){if(!res)return{n:0,worst:1e9};const F=res.pts.map(p=>[p.x*W,p.y*H]);let worst=0;V.forEach(v=>{worst=Math.max(worst,Math.min(...F.map(q=>Math.hypot(q[0]-v[0],q[1]-v[1]))))});return{n:F.length,worst}}
// 1. a five-sided plot with two crosses and numbers around it
let P=pic(480,360);const V1=[[70,60],[390,48],[430,230],[250,320],[50,262]];
poly(P,V1,1,60);line(P,V1[0],V1[2],1,60);line(P,V1[0],V1[3],1,60);digits(P,200,36);digits(P,415,130);digits(P,60,300);digits(P,300,300);digits(P,30,150);digits(P,200,160);
let r=f.planOutline(P.g,P.w,P.h),c=check(r,V1,480,360);
ok(r&&c.n===5&&c.worst<12,'five sides found: '+c.n+' corners, worst '+c.worst.toFixed(1)+' px');
ok(r&&r.pts[0].x<.3&&r.pts[0].y<.3,'numbering starts at the top left corner');
{const F=r.pts;let a=0;for(let i=0;i<F.length;i++){const p=F[i],q=F[(i+1)%F.length];a+=p.x*q.y-q.x*p.y}ok(a>0,'corners are listed clockwise on the screen')}
// 2. the same with a small gap in one side
P=pic(480,360);poly(P,V1,1,60);dot(P,230,54,4,235);dot(P,236,54,4,235);
r=f.planOutline(P.g,P.w,P.h);c=check(r,V1,480,360);ok(r&&c.n===5&&c.worst<14,'a small gap in the line is closed: '+c.n+' corners, worst '+c.worst.toFixed(1));
// 3. an L shape (concave), thicker pen, light shadow gradient over the page
P=pic(480,360);const V3=[[80,60],[260,60],[260,180],[400,180],[400,300],[80,300]];poly(P,V3,2,50);
for(let y=0;y<360;y++)for(let x=0;x<480;x++)P.g[y*480+x]=Math.max(0,P.g[y*480+x]-Math.round(x/480*40));
r=f.planOutline(P.g,P.w,P.h);c=check(r,V3,480,360);ok(r&&c.n===6&&c.worst<14,'L shape: '+c.n+' corners, worst '+c.worst.toFixed(1));
// 4. a ten sided plot with a crowded top (like the real one): at most 12 corners come back
P=pic(480,640);const V4=[[300,150],[260,200],[330,215],[330,560],[170,555],[168,500],[165,300],[175,210],[220,208],[255,170]];poly(P,V4,1,60);
r=f.planOutline(P.g,P.w,P.h);ok(r&&r.pts.length>=6&&r.pts.length<=12,'a ten sided plot gives between 6 and 12 corners: '+(r&&r.pts.length));
// 5. an empty page or an open scribble gives nothing
P=pic(480,360);r=f.planOutline(P.g,P.w,P.h);ok(r===null,'an empty page gives no outline');
P=pic(480,360);line(P,[60,60],[400,60],1,60);line(P,[400,60],[420,300],1,60);r=f.planOutline(P.g,P.w,P.h);ok(r===null,'an open line (not closed) gives no outline');
process.exit(fail?1:0);
