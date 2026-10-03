import { goalkeeperRL, mountLearningControls } from './goalkeeper-rl.js';
import { createOutfieldRoster, resetOutfieldRoster, updateTeamAI, CONTROLLED_SLOT, PLAYERS_PER_TEAM, FIELD_PLAYERS_PER_TEAM } from './match-ai.js';

const $ = (id) => document.getElementById(id);
const world = $('world');
const canvas = document.createElement('canvas');
canvas.setAttribute('aria-label', 'Góc nhìn phối cảnh 3D trên sân bóng');
world.appendChild(canvas);
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
let width=0,height=0,dpr=1,focal=600;
const colors={
  grass:'#246238',stripeA:'#2a6c3d',stripeB:'#205a32',line:'rgba(244,249,232,.86)',
  stand:'#122722',stand2:'#1a332c',stand3:'#243c33',roof:'#10201c',led:'#91dc61',
  crowd:['#d9e4dc','#6c9a7c','#e2a667','#567eaa','#9b6972','#d75450','#e6d954'],
  blue:'#176bd0',shortBlue:'#103272',red:'#d44842',shortRed:'#761f2b',keeper:'#eee45d',homeKeeper:'#64d8ad',
  skin:'#c99169',hair:'#201d19',boot:'#111714',ball:'#f5f4eb',ballSpot:'#18201c',
};
const field={minX:-34,maxX:34,minZ:-54,maxZ:54};
const keys=new Set(),virtual=new Set();
const homeRoster=createOutfieldRoster('home');
const player=homeRoster[CONTROLLED_SLOT];Object.assign(player,{x:0,z:31,homeX:0,homeZ:31,yaw:0,step:0,vx:0,vz:0,moving:false});
const teammateStates=homeRoster.filter((_,i)=>i!==CONTROLLED_SLOT);
const defenders=createOutfieldRoster('away');
const keeper={x:0,z:-51.4,step:0,diveTime:0,diveSide:0};
const homeKeeper={x:0,z:51.4,step:0,diveTime:0,diveSide:0};
window.__footballMatchInfo=Object.freeze({mode:'11v11',playersPerTeam:PLAYERS_PER_TEAM,homeOutfield:FIELD_PLAYERS_PER_TEAM,awayOutfield:FIELD_PLAYERS_PER_TEAM,totalPlayers:PLAYERS_PER_TEAM*2});
let keeperPolicyTarget=0,keeperReactiveTarget=0,keeperReactionWait=0,keeperReadTimer=0;
const ball={x:0,z:29.7,h:.59,vx:0,vz:0,vy:0,gravity:17.5,curve:0,inFlight:false,shotTime:0,pickupDelay:0,rotation:0};
const game={active:false,paused:false,ended:false,score:0,time:90,charging:false,charge:0,shotMode:0,toastTime:0,lastWhole:90};
let lastFrame=performance.now();
const rand=(()=>{let s=72613;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};})();
const crowd=[];
for(const side of [-1,1])for(let row=0;row<6;row++)for(let z=-53;z<=53;z+=2.15){crowd.push({x:side*(39.3+row*1.2),y:5.8+row*1.27,z:z+(rand()-.5)*.55,shirt:Math.floor(rand()*colors.crowd.length),s:.72+rand()*.48,wave:rand()<.13});}
for(const side of [-1,1])for(let row=0;row<6;row++)for(let x=-35;x<=35;x+=2.05){crowd.push({x:x+(rand()-.5)*.5,y:5.8+row*1.27,z:side*(59+row*1.12),shirt:Math.floor(rand()*colors.crowd.length),s:.72+rand()*.48,wave:rand()<.13});}
crowd.sort((a,b)=>a.z-b.z);
const stars=Array.from({length:95},()=>({x:rand(),y:rand()*.47,r:.3+rand()*1.1,a:.16+rand()*.42}));
const grassTufts=Array.from({length:900},()=>({x:-33+rand()*66,z:-53+rand()*106,len:.14+rand()*.34,lean:(rand()-.5)*.13}));

function resize(){
  const r=world.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);dpr=Math.min(window.devicePixelRatio||1,1.75);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;ctx.setTransform(dpr,0,0,dpr,0,0);
  focal=(height/2)/Math.tan((width<650?61:55)*Math.PI/360);
}
window.addEventListener('resize',resize,{passive:true});resize();
function normalize(v){const l=Math.hypot(v.x,v.y,v.z)||1;return{x:v.x/l,y:v.y/l,z:v.z/l};}
function cross(a,b){return{x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x};}
function cameraBasis(){
  const pos={x:player.x*.83,y:game.active?8.7:9.4,z:player.z+15.8};
  const target={x:player.x*.54,y:1.15,z:player.z-17.5};
  const forward=normalize({x:target.x-pos.x,y:target.y-pos.y,z:target.z-pos.z});
  const right=normalize(cross(forward,{x:0,y:1,z:0}));
  const up=normalize(cross(right,forward));
  return {pos,forward,right,up};
}
let basis;
function project(x,y,z){
  const rx=x-basis.pos.x,ry=y-basis.pos.y,rz=z-basis.pos.z;
  const depth=rx*basis.forward.x+ry*basis.forward.y+rz*basis.forward.z;
  if(depth<1)return null;
  const scale=focal/depth;
  const cx=rx*basis.right.x+ry*basis.right.y+rz*basis.right.z;
  const cy=rx*basis.up.x+ry*basis.up.y+rz*basis.up.z;
  return{x:width*.5+cx*scale,y:height*.5-cy*scale,scale,depth};
}
function pathWorld(points,fill=null,stroke=null,lineWidth=1,close=false){
  const p=points.map(v=>project(v[0],v[1],v[2]));if(p.some(v=>!v))return;
  ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);if(close)ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
}
function lineWorld(points,color=colors.line,lw=1){pathWorld(points,null,color,lw,false);}
function polygonScreen(points,fill,stroke=null,lw=1){
  if(points.some(p=>!p))return;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}
}
function drawBackground(){
  const sky=ctx.createLinearGradient(0,0,0,height*.74);sky.addColorStop(0,'#07111b');sky.addColorStop(.52,'#102b30');sky.addColorStop(1,'#172e28');ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
  const haze=ctx.createRadialGradient(width*.52,height*.36,0,width*.52,height*.36,width*.62);haze.addColorStop(0,'rgba(84,145,118,.16)');haze.addColorStop(1,'rgba(4,12,11,0)');ctx.fillStyle=haze;ctx.fillRect(0,0,width,height*.78);
  for(const s of stars){ctx.globalAlpha=s.a;ctx.fillStyle='#d7efdc';ctx.beginPath();ctx.arc(s.x*width,s.y*height,s.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  // Dãy mái khán đài và ánh đèn pha xa.
  pathWorld([[-58,18,-66],[-48,27,-68],[0,30,-72],[48,27,-68],[58,18,-66]],null,'rgba(129,165,145,.45)',2);
  pathWorld([[-58,18,66],[-48,27,68],[0,30,72],[48,27,68],[58,18,66]],null,'rgba(129,165,145,.32)',2);
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=sx*44,z=sz*43,p=project(x,27.4,z);if(!p)continue;
    const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,Math.max(18,p.scale*7));glow.addColorStop(0,'rgba(235,255,239,.34)');glow.addColorStop(1,'rgba(185,231,201,0)');ctx.fillStyle=glow;ctx.fillRect(p.x-Math.max(18,p.scale*7),p.y-Math.max(18,p.scale*7),Math.max(36,p.scale*14),Math.max(36,p.scale*14));
    for(let i=0;i<5;i++){const lp=project(x-2+i,z===43?27.5:27.5,z);if(lp){ctx.fillStyle='rgba(240,255,237,.92)';ctx.beginPath();ctx.arc(lp.x,lp.y,Math.max(.8,lp.scale*.15),0,Math.PI*2);ctx.fill();}}
  }
}
function drawStadium(){
  // Mái, dầm chịu lực và các tầng khán đài tạo đường viền sân có chiều sâu.
  pathWorld([[-41,2,-55],[41,2,-55],[41,17,-73],[-41,17,-73]],'#132923');
  pathWorld([[-50,3,55],[50,3,55],[50,16,73],[-50,16,73]],'#10231e');
  pathWorld([[-43,17,-72],[-36,21,-76],[0,23,-78],[36,21,-76],[43,17,-72]],null,'rgba(147,186,158,.56)',2.1);
  pathWorld([[-48,16,71],[-39,20,75],[0,22,77],[39,20,75],[48,16,71]],null,'rgba(128,167,143,.4)',1.8);
  for(let row=0;row<7;row++){
    const y=5+row*1.25,z1=-57-row*.95,z2=-55-row*.95;
    pathWorld([[-40,y,z1],[40,y,z1],[40,y+.38,z2],[-40,y+.38,z2]],row%2?'#1b342b':'#223b30');
    const zA=55+row*.95,zB=57+row*.95;
    pathWorld([[-40,y,zA],[40,y,zA],[40,y+.38,zB],[-40,y+.38,zB]],row%2?'#1b342b':'#223b30');
  }
  for(const side of [-1,1]){
    pathWorld([[side*35,0,-56],[side*40,4,-56],[side*40,17,-74],[side*35,12,-60]],'#142923');
    pathWorld([[side*35,0,56],[side*40,4,56],[side*40,16,74],[side*35,11,60]],'#10231e');
    for(let row=0;row<7;row++){
      const x1=side*(37+row*.95),x2=side*(38+row*.95),y=5+row*1.25;
      pathWorld([[x1,y,-54],[x1,y,54],[x2,y+.35,54],[x2,y+.35,-54]],row%2?'#1b342b':'#223b30');
    }
  }
  // Khán giả nhiều dáng áo, đầu và tay để khán đài bớt cảm giác như các ô màu phẳng.
  for(const c of crowd){const p=project(c.x,c.y,c.z);if(!p)continue;const s=p.scale*c.s;if(s<.48||p.x<-9||p.x>width+9||p.y<-9||p.y>height+9)continue;
    const shirt=colors.crowd[c.shirt];ctx.globalAlpha=Math.min(.98,.62+p.scale*.055);
    ctx.fillStyle='rgba(0,0,0,.26)';ctx.fillRect(p.x-s*.38,p.y+s*.43,s*.76,s*.12);
    ctx.fillStyle=shirt;ctx.beginPath();ctx.moveTo(p.x-s*.33,p.y-s*.06);ctx.lineTo(p.x-s*.25,p.y-s*.12);ctx.lineTo(p.x+s*.25,p.y-s*.12);ctx.lineTo(p.x+s*.34,p.y+s*.43);ctx.lineTo(p.x-s*.34,p.y+s*.43);ctx.closePath();ctx.fill();
    ctx.strokeStyle=shirt;ctx.lineWidth=Math.max(.45,s*.13);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x-s*.26,p.y-s*.02);ctx.lineTo(p.x-s*.38,p.y+s*.26);ctx.moveTo(p.x+s*.26,p.y-s*.02);ctx.lineTo(p.x+s*.38,p.y+s*.26);ctx.stroke();
    const head=ctx.createRadialGradient(p.x-s*.06,p.y-s*.29,0,p.x,p.y-s*.25,s*.23);head.addColorStop(0,'#efd0aa');head.addColorStop(1,'#ab795c');ctx.fillStyle=head;ctx.beginPath();ctx.arc(p.x,p.y-s*.25,s*.22,0,Math.PI*2);ctx.fill();
    if(c.wave){ctx.strokeStyle=shirt;ctx.lineWidth=Math.max(.45,s*.11);ctx.beginPath();ctx.moveTo(p.x+s*.34,p.y-s*.02);ctx.lineTo(p.x+s*.4,p.y-s*.42);ctx.stroke();}
  }ctx.globalAlpha=1;
  // Bảng LED quanh đường pitch.
  pathWorld([[-36,.3,-54],[36,.3,-54],[36,.8,-54],[-36,.8,-54]],'#315631');
  pathWorld([[-36,.3,54],[36,.3,54],[36,.8,54],[-36,.8,54]],'#315631');
  pathWorld([[-36,.82,-54],[36,.82,-54],[36,1.05,-54],[-36,1.05,-54]],'rgba(196,239,112,.45)');
  pathWorld([[-36,.82,54],[36,.82,54],[36,1.05,54],[-36,1.05,54]],'rgba(196,239,112,.34)');
  for(let i=0;i<22;i++){
    const x=-33+i*3.1;lineWorld([[x,.83,-54],[x+1.3,.83,-54]],'rgba(191,247,105,.72)',1.1);lineWorld([[x,.83,54],[x+1.3,.83,54]],'rgba(191,247,105,.62)',1.1);
  }
}
function drawField(){
  pathWorld([[-37,-.28,-58],[37,-.28,-58],[37,-.28,58],[-37,-.28,58]],'#101d17');
  pathWorld([[-35,-.08,-55],[35,-.08,-55],[35,-.08,55],[-35,-.08,55]],'#1c482a');
  for(let i=0;i<10;i++){
    const z1=-55+i*11,z2=z1+11;pathWorld([[-34,-.01,z1],[34,-.01,z1],[34,-.01,z2],[-34,-.01,z2]],i%2?colors.stripeA:colors.stripeB);
  }
  ctx.beginPath();
  for(const tuft of grassTufts){const a=project(tuft.x,.012,tuft.z),b=project(tuft.x+tuft.lean,.012,tuft.z-tuft.len);if(a&&b){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}}
  ctx.strokeStyle='rgba(190,231,146,.25)';ctx.lineWidth=.72;ctx.stroke();
  // Ánh đèn pha phủ thành các vùng sáng mềm trên cỏ thay vì một mặt sân đồng màu.
  for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const p=project(sx*18,.035,sz*27);if(!p)continue;const radius=Math.min(260,Math.max(44,p.scale*19));const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);glow.addColorStop(0,'rgba(224,255,186,.15)');glow.addColorStop(.52,'rgba(177,233,137,.07)');glow.addColorStop(1,'rgba(140,205,112,0)');ctx.fillStyle=glow;ctx.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);}
  lineWorld([[-34,.025,-54],[34,.025,-54],[34,.025,54],[-34,.025,54],[-34,.025,-54]],colors.line,1.3);
  lineWorld([[-34,.025,0],[34,.025,0]],colors.line,1.2);
  const circle=[];for(let i=0;i<=64;i++){const a=i*Math.PI*2/64;circle.push([Math.cos(a)*9.15,.025,Math.sin(a)*9.15]);}lineWorld(circle,colors.line,1.25);
  for(const side of [-1,1]){
    const pz=side<0?-54:34,boxz=side<0?-43.6:43.6;
    lineWorld([[-20.2,.025,pz],[20.2,.025,pz],[20.2,.025,side<0?-34:54],[-20.2,.025,side<0?-34:54],[-20.2,.025,pz]],colors.line,1.15);
    lineWorld([[-9.3,.025,pz],[9.3,.025,pz],[9.3,.025,boxz],[-9.3,.025,boxz],[-9.3,.025,pz]],colors.line,1.1);
    const arc=[];for(let i=0;i<=34;i++){const a=Math.PI*i/34;arc.push([Math.cos(a)*7.8,.025,(side<0?-42.5:42.5)+(side<0?1:-1)*7.8*Math.sin(a)]);}lineWorld(arc,colors.line,1);
    const dot=project(0,.03,side*42.5);if(dot){ctx.fillStyle='#eff3e5';ctx.beginPath();ctx.arc(dot.x,dot.y,Math.max(.7,dot.scale*.18),0,Math.PI*2);ctx.fill();}
  }
}
function drawGoal(z,depth){
  const w=8.35,h=4.05,back=z+depth;
  pathWorld([[-w,.16,z],[w,.16,z],[w,h,z],[-w,h,z]],'rgba(222,239,222,.08)');
  ctx.save();ctx.shadowColor='rgba(222,255,223,.7)';ctx.shadowBlur=8;
  const post=(x)=>lineWorld([[x,.12,z],[x,h,z]],'rgba(255,255,247,.98)',Math.max(2,2.8));
  post(-w);post(w);lineWorld([[-w,h,z],[w,h,z]],'rgba(255,255,247,.98)',2.9);ctx.restore();
  for(let i=0;i<=14;i++){const x=-w+2*w*i/14;lineWorld([[x,.15,z],[x,.15,back],[x,h,back]],'rgba(226,244,230,.45)',.9);}
  for(let j=0;j<=8;j++){const y=.15+(h-.15)*j/8;lineWorld([[-w,y,z],[-w,y,back],[w,y,back],[w,y,z]],'rgba(226,244,230,.43)',.9);}
  for(let i=0;i<7;i++){const x=-w+2*w*i/7;lineWorld([[x,.2,z],[x+2*w/7,h,back]],'rgba(219,240,225,.16)',.65);lineWorld([[x,h,z],[x+2*w/7,.2,back]],'rgba(219,240,225,.16)',.65);}
  for(const s of [-1,1])lineWorld([[s*w,.15,z],[s*w,.15,back],[s*w,h,back],[s*w,h,z]],'rgba(240,249,238,.55)',1.1);
}
function drawFloodlights(){
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=sx*44,z=sz*43;lineWorld([[x,0,z],[x,28,z]],'rgba(94,125,105,.84)',2.1);lineWorld([[x-3,28,z],[x+3,28,z]],'rgba(146,180,151,.8)',1.8);
    const p=project(x,28,z);if(!p)continue;for(let i=-2;i<=2;i++){const q=project(x+i*1.1,28,z);if(q){ctx.fillStyle='#f1fff0';ctx.shadowColor='#d9ffe2';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(q.x,q.y,Math.max(1.1,q.scale*.19),0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}}
  }
}
function drawHumanoid(entity,type,now){
  const blue=type==='player'||type==='teammate';
  const shirt=blue?colors.blue:type==='keeper'?colors.keeper:type==='home-keeper'?colors.homeKeeper:colors.red;
  const shorts=blue||type==='home-keeper'?colors.shortBlue:colors.shortRed;
  const z=entity.z,x=entity.x,phase=entity.step||now*2;
  const shadow=project(x,.035,z);if(!shadow)return;
  const s=shadow.scale;if(shadow.x<-80||shadow.x>width+80||shadow.y<-100||shadow.y>height+90)return;
  const depthAlpha=Math.max(.4,Math.min(1,s/9));
  const shade=ctx.createRadialGradient(shadow.x,shadow.y,0,shadow.x,shadow.y,s*.82);shade.addColorStop(0,`rgba(1,8,5,${.38*depthAlpha})`);shade.addColorStop(1,'rgba(1,8,5,0)');ctx.fillStyle=shade;ctx.beginPath();ctx.ellipse(shadow.x,shadow.y,s*.88,s*.32,0,0,Math.PI*2);ctx.fill();
  const run=entity.moving?Math.sin(phase)*.42:Math.sin(phase)*.08;
  const leftFoot=project(x-.22+run*.25,.15,z-.07+run*.15),rightFoot=project(x+.22-run*.25,.15,z-.07-run*.15);
  if(leftFoot&&rightFoot){ctx.strokeStyle=colors.boot;ctx.lineWidth=Math.max(1.8,s*.15);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(leftFoot.x,leftFoot.y);ctx.lineTo(leftFoot.x+leftFoot.scale*.17,leftFoot.y-leftFoot.scale*.08);ctx.moveTo(rightFoot.x,rightFoot.y);ctx.lineTo(rightFoot.x+rightFoot.scale*.17,rightFoot.y-rightFoot.scale*.08);ctx.stroke();}
  for(const side of [-1,1]){
    const legSwing=run*side,hip=project(x+side*.24,.82,z),knee=project(x+side*.25+legSwing*.13,.46,z),ankle=project(x+side*.27+legSwing*.3,.17,z-.04);
    if(hip&&knee&&ankle){ctx.strokeStyle=shorts;ctx.lineWidth=Math.max(2.2,s*.22);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(hip.x,hip.y);ctx.lineTo(knee.x,knee.y);ctx.stroke();ctx.strokeStyle='#d9e0d6';ctx.lineWidth=Math.max(1.8,s*.15);ctx.beginPath();ctx.moveTo(knee.x,knee.y);ctx.lineTo(ankle.x,ankle.y);ctx.stroke();ctx.strokeStyle='rgba(197,250,88,.82)';ctx.lineWidth=Math.max(.6,s*.035);ctx.beginPath();ctx.moveTo(knee.x-s*.07,knee.y);ctx.lineTo(knee.x+s*.07,knee.y);ctx.stroke();}
    const shoulder=project(x+side*.48,1.58,z),hand=project(x+side*.54-run*.23,1.02,z-.02);
    if(shoulder&&hand){ctx.strokeStyle=shirt;ctx.lineWidth=Math.max(2.2,s*.19);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(shoulder.x,shoulder.y);ctx.lineTo(hand.x,hand.y);ctx.stroke();const hp=project(x+side*.54-run*.23,.96,z-.02);if(hp){ctx.fillStyle=colors.skin;ctx.beginPath();ctx.arc(hp.x,hp.y,Math.max(1.3,hp.scale*.14),0,Math.PI*2);ctx.fill();}}
  }
  const shortsTop=project(x,1.0,z),shortsBottom=project(x,.64,z),bodyTop=project(x,2.12,z),bodyBottom=project(x,1.0,z),head=project(x,2.48,z),neck=project(x,2.22,z);
  if(shortsTop&&shortsBottom){const ww=shortsTop.scale*.56;ctx.fillStyle=shorts;ctx.beginPath();ctx.moveTo(shortsTop.x-ww*.5,shortsTop.y);ctx.lineTo(shortsTop.x+ww*.5,shortsTop.y);ctx.lineTo(shortsBottom.x+ww*.45,shortsBottom.y);ctx.lineTo(shortsBottom.x-ww*.45,shortsBottom.y);ctx.closePath();ctx.fill();}
  if(bodyTop&&bodyBottom){
    const ww=bodyTop.scale*.91;const grad=ctx.createLinearGradient(bodyTop.x-ww/2,0,bodyTop.x+ww/2,0);
    grad.addColorStop(0,type==='player'?'#073d8b':type==='keeper'?'#bdb53b':'#8d292a');grad.addColorStop(.18,type==='player'?'#1767c5':type==='keeper'?'#ddd653':'#c94239');grad.addColorStop(.52,shirt);grad.addColorStop(.84,type==='player'?'#3485e9':type==='keeper'?'#faf08a':'#ef6957');grad.addColorStop(1,type==='player'?'#1552a2':type==='keeper'?'#bcb23d':'#932f32');
    ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(bodyTop.x-ww*.38,bodyTop.y);ctx.quadraticCurveTo(bodyTop.x,bodyTop.y-bodyTop.scale*.11,bodyTop.x+ww*.38,bodyTop.y);ctx.lineTo(bodyBottom.x+ww*.47,bodyBottom.y);ctx.quadraticCurveTo(bodyBottom.x,bodyBottom.y+bodyBottom.scale*.09,bodyBottom.x-ww*.47,bodyBottom.y);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(248,255,246,.28)';ctx.lineWidth=Math.max(.65,s*.035);ctx.beginPath();ctx.moveTo(bodyTop.x,bodyTop.y+bodyTop.scale*.13);ctx.lineTo(bodyBottom.x,bodyBottom.y-bodyBottom.scale*.1);ctx.stroke();
    const collar=project(x,2.04,z);if(collar){ctx.strokeStyle=type==='player'?'#a9e8ff':'rgba(255,255,255,.7)';ctx.lineWidth=Math.max(.7,s*.055);ctx.beginPath();ctx.ellipse(collar.x,collar.y,ww*.14,Math.max(1,collar.scale*.09),0,0,Math.PI*2);ctx.stroke();}
    if(type==='player'){const badge=project(x,1.54,z);if(badge){ctx.fillStyle='rgba(245,250,242,.95)';ctx.font=`900 ${Math.max(4,s*.22)}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('7',badge.x,badge.y);}}
  }
  if(neck&&head){const skin=ctx.createRadialGradient(head.x-head.scale*.1,head.y-head.scale*.1,0,head.x,head.y,head.scale*.32);skin.addColorStop(0,'#f0c39b');skin.addColorStop(1,'#9e684f');ctx.fillStyle=skin;ctx.fillRect(neck.x-head.scale*.1,head.y+head.scale*.14,head.scale*.2,neck.y-head.y);const radius=head.scale*.31;ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(head.x,head.y,radius*.77,radius,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=colors.hair;ctx.beginPath();ctx.ellipse(head.x,head.y-radius*.23,radius*.8,radius*.49,0,Math.PI,Math.PI*2);ctx.fill();}
}
function drawBall(){
  const sh=project(ball.x,.025,ball.z);if(sh){const radius=Math.max(1.1,.67*sh.scale);ctx.fillStyle=`rgba(1,5,3,${Math.max(.11,.34-Math.max(0,ball.h-.6)*.06)})`;ctx.beginPath();ctx.ellipse(sh.x,sh.y,radius*1.3,radius*.46,0,0,Math.PI*2);ctx.fill();}
  const p=project(ball.x,ball.h,ball.z);if(!p)return;const r=Math.max(2,.58*p.scale);
  const g=ctx.createRadialGradient(p.x-r*.35,p.y-r*.42,Math.max(.3,r*.08),p.x,p.y,r);g.addColorStop(0,'#ffffff');g.addColorStop(.66,'#e8eee7');g.addColorStop(1,'#8a978e');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(23,35,29,.58)';ctx.lineWidth=Math.max(.55,r*.035);ctx.stroke();
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ball.rotation);ctx.beginPath();ctx.arc(0,0,r*.88,0,Math.PI*2);ctx.clip();
  const pent=(cx,cy,pr,rot)=>{ctx.beginPath();for(let i=0;i<5;i++){const a=rot-Math.PI/2+i*Math.PI*2/5,x=cx+Math.cos(a)*pr,y=cy+Math.sin(a)*pr;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();};
  ctx.fillStyle=colors.ballSpot;pent(0,0,r*.22,.1);for(let i=0;i<5;i++){const a=-Math.PI/2+i*Math.PI*2/5;pent(Math.cos(a)*r*.58,Math.sin(a)*r*.58,r*.16,a+.2);}
  ctx.strokeStyle='rgba(31,42,34,.52)';ctx.lineWidth=Math.max(.55,r*.035);for(let i=0;i<5;i++){const a=-Math.PI/2+i*Math.PI*2/5;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.21,Math.sin(a)*r*.21);ctx.quadraticCurveTo(Math.cos(a+.35)*r*.42,Math.sin(a+.35)*r*.42,Math.cos(a)*r*.75,Math.sin(a)*r*.75);ctx.stroke();}
  ctx.restore();ctx.save();ctx.translate(p.x,p.y);ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=Math.max(.6,r*.045);ctx.beginPath();ctx.arc(-r*.12,-r*.13,r*.69,Math.PI*1.08,Math.PI*1.72);ctx.stroke();ctx.restore();
}
function render(now){
  basis=cameraBasis();drawBackground();drawStadium();drawField();drawGoal(-54.6,-3.8);drawGoal(54.6,3.8);drawFloodlights();
  const actors=[...teammateStates.map(d=>({entity:d,type:'teammate'})),...defenders.map(d=>({entity:d,type:'defender'})),{entity:keeper,type:'keeper'},{entity:homeKeeper,type:'home-keeper'},{entity:player,type:'player'}];
  actors.sort((a,b)=>a.entity.z-b.entity.z);for(const a of actors)drawHumanoid(a.entity,a.type,now/1000);
  drawBall();
  const vg=ctx.createLinearGradient(0,0,0,height);vg.addColorStop(0,'rgba(0,0,0,.13)');vg.addColorStop(.5,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.16)');ctx.fillStyle=vg;ctx.fillRect(0,0,width,height);
}
function setToast(text){game.toastTime=1.65;$('toast').textContent=text;$('toast').classList.add('visible');$('announcer').textContent=text;}
function hideToast(){if(game.toastTime<=0)$('toast').classList.remove('visible');}
function timeText(s){const n=Math.max(0,Math.ceil(s));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
function updateScore(){ $('score').textContent=String(game.score);$('goals-left').textContent=String(Math.max(0,3-game.score));$('final-score').textContent=String(game.score); }
function showResult(won){
  goalkeeperRL.discardShot();
  game.active=false;game.ended=true;game.paused=false;game.charging=false;
  $('pause-overlay').classList.add('hidden');$('pause-overlay').setAttribute('aria-hidden','true');$('result-overlay').classList.remove('hidden');$('result-overlay').setAttribute('aria-hidden','false');
  $('result-title').innerHTML=won?'BẠN<br><em>THẮNG!</em>':'HẾT<br><em>GIỜ RỒI</em>';
  $('result-eyebrow').innerHTML=won?'<span></span> CHIẾN THẮNG · ĐÊM CHUNG KẾT':'<span></span> HẾT GIỜ · ĐÊM CHUNG KẾT';
  $('result-message').textContent=won?'Bạn đã đánh bại thủ môn và thắp sáng sân vận động. Một trận đấu xuất sắc!':game.score?`Bạn đã ghi ${game.score} bàn. Thử lại để chạm mốc 3 bàn nhé!`:'Thủ môn giữ sạch lưới. Rê bóng sát hơn và nhắm vào góc xa trong lượt tới!';
  $('match-state').textContent=won?'CHIẾN THẮNG':'TRẬN ĐẤU KẾT THÚC';$('announcer').textContent=won?'Bạn thắng! Ghi được ba bàn.':'Trận đấu kết thúc.';$('restart-button').focus({preventScroll:true});
}
function resetPositions(){
  resetOutfieldRoster(homeRoster);resetOutfieldRoster(defenders);
  Object.assign(player,{x:0,z:31,homeX:0,homeZ:31,yaw:0,step:0,vx:0,vz:0,moving:false});
  keeper.x=0;homeKeeper.x=0;keeperPolicyTarget=0;keeperReactiveTarget=0;keeperReactionWait=0;keeperReadTimer=0;keeper.diveTime=0;keeper.diveSide=0;homeKeeper.diveTime=0;goalkeeperRL.discardShot();
  Object.assign(ball,{x:0,z:29.7,h:.59,vx:0,vz:0,vy:0,gravity:17.5,curve:0,inFlight:false,shotTime:0,pickupDelay:0,rotation:0,goalResolved:false});
  keys.clear();virtual.clear();game.charging=false;game.charge=0;$('power-wrap').classList.remove('visible');
}
function beginMatch(){
  game.active=true;game.paused=false;game.ended=false;game.score=0;game.time=90;game.lastWhole=90;game.toastTime=0;
  for(const id of ['intro','pause-overlay','result-overlay']){$(id).classList.add('hidden');$(id).setAttribute('aria-hidden','true');}
  $('match-state').textContent='TRẬN ĐẤU ĐANG DIỄN RA';$('clock').textContent='01:30';$('clock').classList.remove('urgent');updateScore();resetPositions();setToast('TRẬN ĐẤU BẮT ĐẦU — LÊN BÓNG!');
}
function pauseMatch(){if(!game.active||game.ended)return;game.active=false;game.paused=true;game.charging=false;$('power-wrap').classList.remove('visible');$('pause-overlay').classList.remove('hidden');$('pause-overlay').setAttribute('aria-hidden','false');$('resume-button').focus({preventScroll:true});}
function resumeMatch(){if(!game.paused)return;game.paused=false;game.active=true;$('pause-overlay').classList.add('hidden');$('pause-overlay').setAttribute('aria-hidden','true');$('pause-button').focus({preventScroll:true});lastFrame=performance.now();}
function togglePause(){if(game.active)pauseMatch();else if(game.paused)resumeMatch();}
function inputState(){const has=(...n)=>n.some(k=>keys.has(k)||virtual.has(k));return{x:Number(has('KeyD','ArrowRight'))-Number(has('KeyA','ArrowLeft')),z:Number(has('KeyS','ArrowDown'))-Number(has('KeyW','ArrowUp')),sprint:has('ShiftLeft','ShiftRight','Sprint')};}
const SHOT_MODES=[{name:'THƯỜNG',toast:'SÚT THƯỜNG: MẠNH VÀ THẲNG'},{name:'ĐẶT LÒNG',toast:'ĐẶT LÒNG: CHẬM HƠN, BÓNG XOÁY'},{name:'LỐP',toast:'SÚT LỐP: BÓNG BỔNG QUA TẦM VỚI'}];
function cycleShotMode(){game.shotMode=(game.shotMode+1)%SHOT_MODES.length;const label=SHOT_MODES[game.shotMode].name;$('shot-mode-button').textContent=`KIỂU: ${label}`;$('shot-mode-button').setAttribute('aria-label',`Đổi kiểu sút — hiện tại: ${label}`);$('announcer').textContent=SHOT_MODES[game.shotMode].toast;}
function beginCharge(){if(!game.active||game.paused||game.ended||game.charging)return;game.charging=true;game.charge=.05;$('power-wrap').classList.add('visible');}
function fireShot(){
  if(!game.charging)return;game.charging=false;$('power-wrap').classList.remove('visible');if(!game.active||game.paused)return;
  if(Math.hypot(player.x-ball.x,player.z-ball.z)>3.8||ball.inFlight){setToast(ball.inFlight?'CHỜ BÓNG QUAY LẠI':'CHẠY TỚI SÁT BÓNG RỒI SÚT');return;}
  const input=inputState(),targetX=input.x?input.x*6.4:(keeper.x>=0?-6.15:6.15),dx=targetX-ball.x,dz=-55.1-ball.z,len=Math.hypot(dx,dz)||1;
  const charge=Math.min(1,game.charge/1.25),aimSign=input.x||Math.sign(dx)||1;let speed,vertical,gravity=17.5,curve=0;
  if(game.shotMode===1){speed=19+charge*5;vertical=3.4+charge*1.2;gravity=16;curve=aimSign*(.58+charge*.18);}
  else if(game.shotMode===2){speed=25+charge*3;gravity=6.4;}
  else{speed=23+charge*9;vertical=4.8+charge*2.1;}
  ball.vx=dx/len*speed;ball.vz=dz/len*speed;ball.gravity=gravity;ball.curve=curve;ball.power=charge;ball.goalResolved=false;
  if(game.shotMode===2){const t=Math.max(.2,(-54.6-ball.z)/ball.vz);ball.vy=(3.05+charge*.35-ball.h+.5*gravity*t*t)/t;}else ball.vy=vertical;
  const goalTime=(-54.6-ball.z)/ball.vz,predictedX=ball.x+ball.vx*goalTime+.5*ball.curve*goalTime*goalTime,keeperDecision=goalkeeperRL.beginShot({startX:ball.x,targetX:predictedX,power:charge});
  keeperPolicyTarget=keeperDecision.targetX;keeperReactiveTarget=keeper.x;keeperReactionWait=.18+Math.random()*.12;keeperReadTimer=0;keeper.diveTime=0;keeper.diveSide=0;
  ball.inFlight=true;ball.shotTime=0;ball.pickupDelay=.72;ball.rotation=0;
  player.yaw=Math.atan2(ball.vx,-ball.vz);setToast(game.shotMode===1?'ĐẶT LÒNG XOÁY!':game.shotMode===2?'SÚT LỐP!':charge>.72?'CÚ SÚT SẤM SÉT!':'DỨT ĐIỂM!');game.charge=0;
}
function scoreGoal(){
  goalkeeperRL.resolveShot('goal');
  game.score++;updateScore();setToast('VÀOOOO! KHÁN ĐÀI BÙNG NỔ!');ball.inFlight=false;ball.vx=ball.vz=ball.vy=0;
  if(game.score>=3){showResult(true);return;}
  resetPositions();Object.assign(player,{x:0,z:27,homeZ:27});Object.assign(ball,{x:0,z:25.7,h:.59});keeper.x=0;homeKeeper.x=0;keeperPolicyTarget=0;keeperReactiveTarget=0;
}
function updatePlayer(dt,input){
  let ix=input.x,iz=input.z,len=Math.hypot(ix,iz);if(len>1){ix/=len;iz/=len;}
  const close=defenders.some(d=>Math.hypot(d.x-player.x,d.z-player.z)<1.5),speed=(input.sprint?13.2:9.25)*(close?.86:1),blend=1-Math.exp(-dt*(len>.04?15:20));
  player.vx+=(ix*speed-player.vx)*blend;player.vz+=(iz*speed-player.vz)*blend;
  player.x=Math.max(-31.2,Math.min(31.2,player.x+player.vx*dt));player.z=Math.max(-48,Math.min(48,player.z+player.vz*dt));
  if(len>.04){const yaw=Math.atan2(ix,-iz),diff=(yaw-player.yaw+Math.PI*3)%(Math.PI*2)-Math.PI;player.yaw+=diff*Math.min(1,dt*17);}
  player.moving=Math.hypot(player.vx,player.vz)>.55;player.step+=dt*(player.moving?(input.sprint?14:10):2.5);
}
function updateTeamBrains(dt){
  const focus=ball.inFlight?ball:player,carrier=focus,possession=ball.inFlight?'neutral':'home',now=performance.now()/1000;
  updateTeamAI({roster:teammateStates,allies:homeRoster,opponents:defenders,ball:focus,carrier,possession,dt,now});
  updateTeamAI({roster:defenders,allies:defenders,opponents:homeRoster,ball:focus,carrier,possession,dt,now});
}
function updateKeeper(dt){
  if(ball.inFlight&&!ball.goalResolved&&ball.vz<-.1&&ball.z>-54.6){
    keeperReactionWait=Math.max(0,keeperReactionWait-dt);
    if(keeperReactionWait===0){keeperReadTimer-=dt;if(keeperReadTimer<=0){
      const time=Math.max(0,Math.min(2.8,(-54.6-ball.z)/Math.max(2,-ball.vz))),uncertainty=.3+time*.17+Math.abs(ball.curve)*.2+(ball.power||0)*.12;
      const observed=ball.x+ball.vx*time+.5*ball.curve*time*time+(Math.random()-.5)*2*uncertainty,previous=keeperReactiveTarget;
      keeperReactiveTarget=Math.max(-6.9,Math.min(6.9,previous*.58+observed*.42));keeperReadTimer=.11;
      if(ball.shotTime>.32&&Math.abs(keeperReactiveTarget-keeper.x)>.8){keeper.diveSide=Math.sign(keeperReactiveTarget-keeper.x);keeper.diveTime=.42;}
    }}
  }
  const anticipating=ball.inFlight&&keeperReactionWait>0,target=anticipating?keeperPolicyTarget:keeperReactiveTarget,speed=anticipating?3.2:5.4;
  keeper.x+=Math.max(-speed*dt,Math.min(speed*dt,target-keeper.x));keeper.diveTime=Math.max(0,keeper.diveTime-dt);keeper.step+=dt*4;
}
function updateHomeKeeper(dt){
  let target=ball.x*.2;if(ball.inFlight&&ball.vz>0){const t=Math.max(0,Math.min(2.4,(54.6-ball.z)/Math.max(2,ball.vz)));target=ball.x+ball.vx*t;}else if(player.z>8)target=ball.x*.32;
  target=Math.max(-7.05,Math.min(7.05,target));homeKeeper.x+=Math.max(-4.4*dt,Math.min(4.4*dt,target-homeKeeper.x));homeKeeper.z=51.4;homeKeeper.step+=dt*4.5;
}
function resolveKeeperSave(){
  const diving=keeper.diveTime>0&&Math.sign(ball.x-keeper.x)===keeper.diveSide,horizontalReach=diving?1.55:1.0,heightReach=diving?3.55:2.25;
  const gapX=Math.max(0,Math.abs(ball.x-keeper.x)-horizontalReach),gapY=Math.max(0,ball.h-heightReach),missDistance=Math.hypot(gapX,gapY),saveChance=Math.max(.1,Math.min(.78,.76-missDistance*.46-(ball.h>2.6?.12:0)));
  if(missDistance>.58||Math.random()>saveChance)return false;
  goalkeeperRL.resolveShot('save');const side=Math.sign(ball.x-player.x)||Math.sign(ball.x-keeper.x)||1;
  ball.x+=side*.34;ball.z=-53.4;ball.vx=side*(4.1+Math.abs(ball.vx)*.14);ball.vz=-Math.max(2.2,Math.abs(ball.vz)*.16);ball.vy=3.25;ball.gravity=13;ball.curve=0;ball.shotTime=0;ball.pickupDelay=.28;ball.goalResolved=true;setToast('THỦ MÔN CẢN PHÁ — BÓNG BẬT LỆCH!');return true;
}
function deflectFromDefender(){
  if(ball.vz>=0||ball.shotTime<.12)return false;
  for(let i=0;i<defenders.length;i++){const d=defenders[i];if(Math.hypot(ball.x-d.x,ball.z-d.z)<1.05&&ball.h<2.4){
    goalkeeperRL.discardShot();const side=Math.sign(ball.x-d.x)||(i%2?1:-1);ball.vx=side*(4.8+Math.abs(ball.vx)*.12);ball.vz=Math.abs(ball.vz)*.3;ball.vy=3.4;ball.gravity=13;ball.curve=0;ball.x+=side*.38;ball.z+=.25;ball.shotTime=0;ball.pickupDelay=.12;ball.goalResolved=true;setToast('HẬU VỆ CHẠM BÓNG — CÚ SÚT ĐỔI HƯỚNG!');return true;
  }}return false;
}
function updateBall(dt){
  if(!ball.inFlight){const fx=Math.sin(player.yaw),fz=-Math.cos(player.yaw),carry=.62+Math.min(.34,Math.hypot(player.vx,player.vz)*.035),targetX=player.x+fx*carry,targetZ=player.z+fz*carry,blend=1-Math.exp(-dt*14),oldX=ball.x,oldZ=ball.z;ball.x+=(targetX-ball.x)*blend;ball.z+=(targetZ-ball.z)*blend;ball.vx=(ball.x-oldX)/Math.max(dt,.001);ball.vz=(ball.z-oldZ)/Math.max(dt,.001);ball.h=.59;ball.vy=0;}
  else{
    ball.shotTime+=dt;ball.pickupDelay=Math.max(0,ball.pickupDelay-dt);ball.vx+=ball.curve*dt;ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;ball.h+=ball.vy*dt;ball.vy-=ball.gravity*dt;
    ball.vx*=Math.pow(.999,dt*60);ball.vz*=Math.pow(.999,dt*60);
    if(ball.h<.59){ball.h=.59;if(ball.vy< -1.7){ball.vy=-ball.vy*.32;ball.vx*=.82;ball.vz*=.82;}else ball.vy=0;}
    const touched=deflectFromDefender();
    if(!touched&&ball.vz<0&&ball.z<=-54.6&&!ball.goalResolved){
      if(Math.abs(ball.x)<7.95&&ball.h<4){if(!resolveKeeperSave()){scoreGoal();return;}}
      else if(ball.z<-58.6){goalkeeperRL.discardShot();ball.inFlight=false;setToast('CÚ SÚT LỆCH KHUNG THÀNH');}
    }
    if(ball.inFlight&&(Math.abs(ball.x)>34||ball.z>56||ball.shotTime>5.2)){goalkeeperRL.discardShot();ball.inFlight=false;setToast('BÓNG RA NGOÀI — NHẬN LẠI BÓNG');}
    if(ball.inFlight&&ball.pickupDelay===0&&Math.hypot(ball.x-player.x,ball.z-player.z)<1.85&&ball.h<1.2){goalkeeperRL.discardShot();ball.inFlight=false;ball.goalResolved=false;setToast('GIỮ ĐƯỢC BÓNG — TIẾP TỤC!');}
  }
  ball.rotation+=dt*Math.hypot(ball.vx,ball.vz)*.08;updateKeeper(dt);updateHomeKeeper(dt);
}
function update(dt){
  if(game.toastTime>0){game.toastTime-=dt;hideToast();}
  if(game.charging){game.charge=Math.min(1.25,game.charge+dt);$('power-fill').style.width=`${Math.min(100,game.charge/1.25*100)}%`;}
  const input=inputState();updatePlayer(dt,input);updateTeamBrains(dt);updateBall(dt);
  if(!game.active)return;game.time=Math.max(0,game.time-dt);const whole=Math.ceil(game.time);
  if(whole!==game.lastWhole){$('clock').textContent=timeText(game.time);game.lastWhole=whole;}
  if(game.time<=10&&whole>0)$('clock').classList.add('urgent');else $('clock').classList.remove('urgent');if(game.time<=0)showResult(false);
}
function frame(now){const dt=Math.min(.038,Math.max(0,(now-lastFrame)/1000));lastFrame=now;if(game.active)update(dt);else if(game.toastTime>0){game.toastTime-=dt;hideToast();}render(now);requestAnimationFrame(frame);}
requestAnimationFrame(frame);

mountLearningControls(()=>{keeperPolicyTarget=0;setToast('ĐÃ XÓA BỘ NHỚ HỌC CỦA THỦ MÔN');});

$('start-button').addEventListener('click',beginMatch);$('restart-button').addEventListener('click',beginMatch);$('restart-pause-button').addEventListener('click',beginMatch);$('resume-button').addEventListener('click',resumeMatch);$('pause-button').addEventListener('click',togglePause);$('shot-mode-button').addEventListener('click',cycleShotMode);
for(const button of document.querySelectorAll('[data-key]')){
  const key=button.dataset.key;const down=e=>{e.preventDefault();virtual.add(key);button.classList.add('pressed');try{button.setPointerCapture(e.pointerId);}catch{}};const up=e=>{e.preventDefault();virtual.delete(key);button.classList.remove('pressed');};
  button.addEventListener('pointerdown',down);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
}
const sprint=$('sprint-button');sprint.addEventListener('pointerdown',e=>{e.preventDefault();virtual.add('Sprint');sprint.classList.add('pressed');try{sprint.setPointerCapture(e.pointerId);}catch{}});for(const ev of ['pointerup','pointercancel','lostpointercapture'])sprint.addEventListener(ev,()=>{virtual.delete('Sprint');sprint.classList.remove('pressed');});
const shoot=$('shoot-button');shoot.addEventListener('pointerdown',e=>{e.preventDefault();if(game.active){shoot.classList.add('pressed');try{shoot.setPointerCapture(e.pointerId);}catch{}beginCharge();}});for(const ev of ['pointerup','pointercancel','lostpointercapture'])shoot.addEventListener(ev,e=>{e.preventDefault();shoot.classList.remove('pressed');fireShot();});
window.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();togglePause();return;}if(e.code==='KeyQ'&&!e.repeat){e.preventDefault();cycleShotMode();return;}const c=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space'];if(!c.includes(e.code)||!game.active)return;e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat)beginCharge();});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'){e.preventDefault();fireShot();}});
window.addEventListener('blur',()=>{keys.clear();virtual.clear();if(game.charging)fireShot();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.active)pauseMatch();});
