const TH=require('./helpers');
const fs=require('fs'),cp=require('child_process');
const html=fs.readFileSync(TH.root + '/index.html','utf8');
const m=html.match(/\/\/ <MATH>([\s\S]*?)\/\/ <\/MATH>/)[1];
const f=new Function(m+';return{toXY,fromXY,analyze,splitCompute,splitIdeas,tapeSolve,tapeSigma,tapeCorners,kmlOf,pdfFromJpeg,netArea,polyArea,clipHP,UNIT}')();
let fail=0;const ok=(c,msg)=>{console.log((c?'PASS ':'FAIL ')+msg);if(!c)fail++};
const near=(a,b,t)=>Math.abs(a-b)<=t;
const rect=(w,h)=>[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
const R=rect(40,25),sumA=r=>r.parts.reduce((a,p)=>a+p.area,0);
// equal halves, parallel to side 0 and perpendicular to side 0
let r=f.splitCompute(R,[],{dir:'par',ref:0,n:2});
ok(r.ok&&near(r.parts[0].area,500,1e-3)&&near(r.parts[1].area,500,1e-3),'par halves 500/500');
ok(r.cuts.length===1&&near(r.cuts[0].len,40,1e-3),'par cut length 40 ('+(r.cuts[0]&&r.cuts[0].len)+')');
r=f.splitCompute(R,[],{dir:'perp',ref:0,n:2});
ok(r.ok&&near(r.parts[0].area,500,1e-3)&&near(r.cuts[0].len,25,1e-3),'perp halves, cut length 25');
r=f.splitCompute(R,[],{dir:'perp',ref:0,n:3});
ok(r.parts.length===3&&r.parts.every(p=>near(p.area,1000/3,1e-3))&&r.cuts.length===2,'3 equal strips');
r=f.splitCompute(R,[],{dir:'par',ref:0,ratio:[1,3]});
ok(near(r.parts[0].area,250,1e-3)&&near(r.parts[1].area,750,1e-3),'ratio 1:3');
r=f.splitCompute(R,[],{dir:'par',ref:0,widths:[3]});
ok(near(r.parts[0].area,120,1e-3)&&near(r.parts[1].area,880,1e-3),'3 m road strip = 120 m2');
r=f.splitCompute(R,[],{dir:'par',ref:0,areas:[300]});
ok(near(r.parts[0].area,300,1e-3)&&near(r.parts[1].area,700,1e-3),'cut off 300 m2');
ok(!f.splitCompute(R,[],{dir:'par',ref:0,areas:[1200]}).ok,'shares bigger than the plot are rejected');
ok(!f.splitCompute(R,[],{dir:'par',ref:0,widths:[30]}).ok,'strip wider than the plot is rejected');
// fan from corner 0 on a rectangle: equal halves = the diagonal
r=f.splitCompute(R,[],{dir:'fan',ref:0,n:2});
ok(r.ok&&near(r.parts[0].area,500,1e-3)&&near(r.cuts[0].len,Math.hypot(40,25),1e-3),'fan halves are cut along the diagonal ('+r.cuts[0].len.toFixed(3)+')');
r=f.splitCompute(R,[],{dir:'fan',ref:0,n:3});
ok(r.parts.every(p=>near(p.area,1000/3,1e-3))&&near(sumA(r),1000,1e-6),'fan thirds');
// clockwise polygon gives the same
const CW=R.slice().reverse();
r=f.splitCompute(CW,[],{dir:'fan',ref:3,n:2});
ok(r.ok&&near(r.parts[0].area,500,1e-3),'clockwise polygon fan halves');
r=f.splitCompute(CW,[],{dir:'par',ref:1,n:2});
ok(r.ok&&near(r.parts[0].area,500,1e-3),'clockwise polygon par halves');
// concave L shape: total area 1200-400
const Lp=[{x:0,y:0},{x:40,y:0},{x:40,y:15},{x:20,y:15},{x:20,y:30},{x:0,y:30}];
const Ltot=Math.abs(f.polyArea(Lp));
for(const dir of ['par','perp']){for(let ref=0;ref<6;ref++){r=f.splitCompute(Lp,[],{dir,ref,n:2});if(!r.ok||!near(r.parts[0].area,Ltot/2,1e-3)||!near(sumA(r),Ltot,1e-3)){ok(false,'L shape '+dir+' ref '+ref);}}}
ok(true,'L shape halves for every side, both directions');
// holes
const hole=[{x:5,y:5},{x:15,y:5},{x:15,y:15},{x:5,y:15}];
r=f.splitCompute(R,[hole],{dir:'perp',ref:0,n:2});
ok(near(r.total,900,1e-6)&&near(r.parts[0].area,450,1e-3)&&near(r.parts[1].area,450,1e-3),'holes: net area 900 split 450/450');
ok(near(r.cuts[0].a.x,22,0.01),'holes: cut moves to x=22 ('+r.cuts[0].a.x.toFixed(3)+')');
// ideas
const ideas=f.splitIdeas(R,[]);
ok(ideas.length===6&&ideas.every(i=>near(sumA(i.res),1000,1e-3)),'6 ideas for a rectangle, parts add up to the plot ('+ideas.map(i=>i.id).join(',')+')');
// tape
let t=f.tapeSolve([40,25,40,25],[Math.hypot(40,25)]);
ok(t.ok&&near(t.area,1000,1e-6)&&near(t.per,130,1e-6),'tape rectangle 40x25 -> 1000 m2');
t=f.tapeSolve([3,4,5],[]);ok(t.ok&&near(t.area,6,1e-9),'tape 3-4-5 triangle');
t=f.tapeSolve([10,10,10,10],[25]);ok(!t.ok,'impossible lengths rejected: '+t.err);
t=f.tapeSolve([10,10,10,10],[]);ok(!t.ok&&t.need===2,'missing diagonal asked for');
// pentagon from known polygon
const pent=[{x:0,y:0},{x:30,y:0},{x:40,y:20},{x:15,y:35},{x:-5,y:18}];
const sides=pent.map((p,i)=>Math.hypot(pent[(i+1)%5].x-p.x,pent[(i+1)%5].y-p.y)),d2=Math.hypot(pent[2].x,pent[2].y),d3=Math.hypot(pent[3].x,pent[3].y);
t=f.tapeSolve(sides,[d2,d3]);ok(t.ok&&near(t.area,Math.abs(f.polyArea(pent)),1e-6),'tape pentagon area '+t.area.toFixed(3)+' = '+Math.abs(f.polyArea(pent)).toFixed(3));
const sg=f.tapeSigma([40,25,40,25],[Math.hypot(40,25)]);ok(sg>1&&sg<15,'tape sigma '+sg.toFixed(2)+' m2 on 1000 m2');
const tc=f.tapeCorners(f.tapeSolve([40,25,40,25],[Math.hypot(40,25)]).P,11.05,76.07,70);
const an=f.analyze(tc,'corners');ok(near(an.area,1000,2)&&an.sig<an.area*0.01,'tape corners on the map: area '+an.area.toFixed(2)+', error '+(an.rel*100).toFixed(2)+'%');
// bearing check: first side points along 70 degrees (clockwise from north)
const xy=f.toXY(tc,11.05,76.07),brg=((Math.atan2(xy[1].x-xy[0].x,xy[1].y-xy[0].y)*180/Math.PI)+360)%360;ok(near(brg,70,0.01),'first side bearing '+brg.toFixed(3));
// analyze with holes
const sq=[[0,0],[100,0],[100,100],[0,100]].map(([x,y])=>{const g=f.fromXY(x,y,11.05,76.07);return{lat:g.lat,lon:g.lon,acc:2}});
const hh=[[10,10],[30,10],[30,30],[10,30]].map(([x,y])=>{const g=f.fromXY(x,y,11.05,76.07);return{lat:g.lat,lon:g.lon,acc:1}});
const a2=f.analyze(sq,'corners',[hh]),a1=f.analyze(sq,'corners');
ok(near(a2.net,9600,1)&&near(a2.holeArea,400,0.5)&&near(a1.net,a1.area,1e-9)&&a2.sig>a1.sig,'analyze net area with a 20x20 hole: '+a2.net.toFixed(1));
// KML + PDF
const kml=f.kmlOf([{name:'A & B',place:'X',notes:'n',corners:sq.map((c,i)=>i==1?Object.assign({},c,{note:'stone'}):c),holes:[{corners:hh}],mode:'corners'}]);
fs.writeFileSync(TH.tmp('t.kml'),kml);
const jpg=new Uint8Array(fs.readFileSync(TH.fixture('test.jpg')));
fs.writeFileSync(TH.tmp('t.pdf'),Buffer.from(f.pdfFromJpeg(jpg,300,200,595,842)));
console.log(cp.execFileSync('python3',['-c','import sys,xml.etree.ElementTree as E;t=E.parse(sys.argv[1]);print("KML parsed, placemarks:",len(t.getroot().findall(".//{http://www.opengis.net/kml/2.2}Placemark")))',TH.tmp('t.kml')]).toString().trim());
const info=cp.execFileSync('pdfinfo',[TH.tmp('t.pdf')]).toString();ok(/Pages:\s+1/.test(info)&&/595(\.\d+)? x 842/.test(info),'PDF opens in pdfinfo: '+info.split('\n').filter(l=>/Pages|Page size/.test(l)).join(' | '));
cp.execFileSync('pdftoppm',['-r','40','-png',TH.tmp('t.pdf'),TH.tmp('tpdf')]);ok(fs.existsSync(TH.tmp('tpdf-1.png')),'PDF renders to an image');
console.log(fail?'SOME FAILED':'ALL PASS');process.exit(fail?1:0);
