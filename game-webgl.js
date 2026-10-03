import * as THREE from './vendor/three.module.js';
import { goalkeeperRL, mountLearningControls } from './goalkeeper-rl.js';
import { createOutfieldRoster, resetOutfieldRoster, updateTeamAI, CONTROLLED_SLOT, PLAYERS_PER_TEAM, FIELD_PLAYERS_PER_TEAM } from './match-ai.js';
import { applyBallFlightDamping, ballFitsGoalMouth, formatGoalAnnouncement, goalPlaneCrossing, AWAY_GOAL_LINE_Z, HOME_GOAL_LINE_Z, AWAY_GOAL_SCORE_PLANE_Z } from './match-rules.js';
import { closeModal, openModal } from './modal-focus.js';

const $ = (id) => document.getElementById(id);
const world = $('world');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07120f);
scene.fog = new THREE.Fog(0x07120f, 82, 176);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 260);
const gl = window.__footballWebGLContext;
const renderer = new THREE.WebGLRenderer({ canvas: gl.canvas, context: gl.context, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label', 'Góc nhìn 3D từ sau cầu thủ trên sân bóng');
world.appendChild(renderer.domElement);

const mat = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
function makeGrassTexture(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(512,512);let seed=8217;
  for(let i=0;i<image.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const n=((seed>>>24)-128)*.18;image.data[i]=205+n;image.data[i+1]=231+n;image.data[i+2]=193+n;image.data[i+3]=255;}
  ctx.putImageData(image,0,0);ctx.globalAlpha=.14;ctx.strokeStyle='#efffe1';ctx.lineWidth=1;
  for(let i=0;i<1500;i++){const x=(i*73)%512,y=(i*191)%512;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+1.5,y-5);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(5,8);texture.anisotropy=8;return texture;
}
function makeLightPoolTexture(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');
  const g=ctx.createRadialGradient(128,128,5,128,128,128);g.addColorStop(0,'rgba(232,255,194,.25)');g.addColorStop(.36,'rgba(194,239,158,.12)');g.addColorStop(1,'rgba(180,225,150,0)');ctx.fillStyle=g;ctx.fillRect(0,0,256,256);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
const grassTexture=makeGrassTexture();
const materials = {
  grass: mat(0x286238, 0.98,{map:grassTexture}), stripeA: mat(0x2d7040, 0.96,{map:grassTexture}), stripeB: mat(0x285f36, 0.96,{map:grassTexture}),
  line: new THREE.LineBasicMaterial({ color: 0xe7f0df, transparent: true, opacity: 0.84 }),
  concrete: mat(0x152522, 0.91), trim: mat(0x233b34, 0.83), roof: mat(0x10201c, 0.7),
  net: new THREE.LineBasicMaterial({ color: 0xd8e4d8, transparent: true, opacity: 0.3 }),
  white: mat(0xf4f5ed, 0.46), gold: mat(0xf0c85c, 0.48), blue: mat(0x176ad1, 0.57), red: mat(0xd94843, 0.58),
  skin: mat(0xc99065, 0.75), shortsBlue: mat(0x102f72, 0.72), shortsRed: mat(0x701e27, 0.72), boots: mat(0x101715, 0.8),
  black: mat(0x111815, 0.55), ballWhite: mat(0xf4f4e9, 0.47), ballBlack: mat(0x13201d, 0.52),
  keeper: mat(0xeee45d, 0.55), keeperHome: mat(0x64d8ad, 0.55), crowd0: mat(0xe0dfc7, 0.95), crowd1: mat(0x6c9a7c, 0.95), crowd2: mat(0xe2a667, 0.95), crowd3: mat(0x567eaa, 0.95), crowd4: mat(0x9b6972, 0.95),
  led: mat(0x9be56b,.4,{emissive:0x315e20,emissiveIntensity:.42}), trimBlue:mat(0x7ee4ff,.55,{emissive:0x12445a,emissiveIntensity:.3}), trimRed:mat(0xffb0a2,.62),
};
const hemi = new THREE.HemisphereLight(0xb9d8ea, 0x233820, 1.5);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xe8f3dc, 2.6);
keyLight.position.set(-21, 38, 18);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -52; keyLight.shadow.camera.right = 52;
keyLight.shadow.camera.top = 68; keyLight.shadow.camera.bottom = -68;
keyLight.shadow.bias = -0.0006;
scene.add(keyLight);
scene.add(keyLight.target);
const ambientGlow = new THREE.PointLight(0x9dd9a3, 72, 95, 1.8);
ambientGlow.position.set(0, 20, 5); scene.add(ambientGlow);

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const sphereGeo = new THREE.SphereGeometry(1, 18, 14);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
const group = new THREE.Group(); scene.add(group);
function box(parent, size, position, material, cast = false, receive = false) {
  const mesh = new THREE.Mesh(boxGeo, material);
  mesh.scale.set(size[0], size[1], size[2]); mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = cast; mesh.receiveShadow = receive; parent.add(mesh); return mesh;
}
function line(points, material = materials.line, parent = scene, loop = false) {
  const vertices = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const geom = loop ? new THREE.BufferGeometry().setFromPoints([...vertices, vertices[0]]) : new THREE.BufferGeometry().setFromPoints(vertices);
  const mesh = new THREE.Line(geom, material); parent.add(mesh); return mesh;
}
function cylinderBetween(parent, a, b, radius, material) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(cylinderGeo, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.scale.set(radius, direction.length(), radius);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true; parent.add(mesh); return mesh;
}

function buildField() {
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(70, 0.34, 110), materials.grass);
  foundation.position.set(0, -0.19, 0); foundation.receiveShadow = true; scene.add(foundation);
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(70, 0.018, 110 / stripes), i % 2 ? materials.stripeA : materials.stripeB);
    stripe.position.set(0, -0.014, -55 + (i + 0.5) * (110 / stripes)); stripe.receiveShadow = true; scene.add(stripe);
  }
  const y = 0.018, xmin = -34, xmax = 34, zmin = -54, zmax = 54;
  line([[xmin,y,zmin],[xmax,y,zmin],[xmax,y,zmax],[xmin,y,zmax]], materials.line, scene, true);
  line([[xmin,y,0],[xmax,y,0]], materials.line);
  const circle = [];
  for (let i = 0; i < 96; i++) { const t = Math.PI * 2 * i / 96; circle.push([Math.cos(t) * 9.15, y, Math.sin(t) * 9.15]); }
  line(circle, materials.line, scene, true);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18), materials.white); dot.rotation.x = -Math.PI / 2; dot.position.set(0, y + 0.005, 0); scene.add(dot);
  for (const side of [-1, 1]) {
    const x1 = -20.2, x2 = 20.2, z1 = side < 0 ? -54 : 34, z2 = side < 0 ? -34 : 54;
    line([[x1,y,z1],[x2,y,z1],[x2,y,z2],[x1,y,z2]], materials.line, scene, true);
    const bx1 = -9.3, bx2 = 9.3, bz1 = side < 0 ? -54 : 43.6, bz2 = side < 0 ? -43.6 : 54;
    line([[bx1,y,bz1],[bx2,y,bz1],[bx2,y,bz2],[bx1,y,bz2]], materials.line, scene, true);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.18, 14), materials.white);
    spot.rotation.x = -Math.PI / 2; spot.position.set(0,y + 0.005,side * 42.5); scene.add(spot);
    const arcPts = [];
    const centerZ = side < 0 ? -42.5 : 42.5;
    for (let i=0;i<=48;i++) { const a=(i/48)*Math.PI; const x=7.8*Math.cos(a), z=centerZ+(side<0?1:-1)*7.8*Math.sin(a); arcPts.push([x,y,z]); }
    line(arcPts, materials.line);
  }
  for (const x of [-34, 34]) for (const z of [-54,54]) {
    const pts=[]; for (let i=0;i<=12;i++){const a=(Math.PI/2)*(i/12);pts.push([x+Math.sign(x)*0.95*Math.sin(a),y,z+Math.sign(z)*0.95*(1-Math.cos(a))]);}
    line(pts, materials.line);
  }
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(280,280), mat(0x07120f, 1));
  outside.rotation.x=-Math.PI/2; outside.position.y=-0.42; scene.add(outside);
}

function addCrowd() {
  let seed = 72949; const random = () => { seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  const seats = [];
  for (const s of [-1,1]) for (let row=0;row<7;row++) for (let z=-53;z<=53;z+=1.65) {
    seats.push({x:s*(39.5+row*1.13), y:5.5+row*1.28, z:z+(random()-.5)*.5, scale:.78+random()*.42, color:Math.floor(random()*5)});
  }
  for (const s of [-1,1]) for (let row=0;row<7;row++) for (let x=-36;x<=36;x+=1.65) {
    seats.push({x:x+(random()-.5)*.5,y:5.5+row*1.28,z:s*(59.5+row*1.05),scale:.78+random()*.42,color:Math.floor(random()*5)});
  }
  const dummy = new THREE.Object3D();
  for (let c=0;c<5;c++) {
    const batch=seats.filter(s=>s.color===c);
    const bodies=new THREE.InstancedMesh(boxGeo,materials[`crowd${c}`],batch.length);
    const heads=new THREE.InstancedMesh(sphereGeo,materials.skin,batch.length);
    bodies.castShadow=false; heads.castShadow=false;
    batch.forEach((seat,i)=>{
      const w=.29*seat.scale,h=.48*seat.scale,d=.25*seat.scale;
      dummy.position.set(seat.x,seat.y,seat.z);dummy.rotation.set((random()-.5)*.12,(random()-.5)*.22,0);dummy.scale.set(w,h,d);dummy.updateMatrix();bodies.setMatrixAt(i,dummy.matrix);
      dummy.position.set(seat.x,seat.y+h*.86,seat.z-.005);dummy.rotation.set(0,0,0);dummy.scale.set(.13*seat.scale,.14*seat.scale,.13*seat.scale);dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);
    });
    bodies.instanceMatrix.needsUpdate=true;heads.instanceMatrix.needsUpdate=true;scene.add(bodies,heads);
  }
}

function buildStadium() {
  for (const side of [-1,1]) {
    box(scene,[13,1.35,119],[side*44,4.25,0],materials.concrete,false,true);
    for (let row=0;row<6;row++) {
      const x=side*(39.1+row*1.25), y=5.4+row*1.3;
      box(scene,[0.56,0.28,115],[x,y,0],row%2?materials.trim:materials.concrete,false,true);
    }
    box(scene,[14,1,119],[side*48.4,14.2,0],materials.roof,false,true);
    box(scene,[0.65,2,119],[side*41.1,16.5,0],materials.trim,false,false);
    box(scene,[.26,.18,116],[side*36.45,1.03,0],materials.led,false,false);
    box(scene,[.22,.16,113],[side*37.15,12.3,0],materials.led,false,false);
    for(const z of [-48,-24,0,24,48])box(scene,[1.2,15,1.5],[side*52,11.7,z],materials.roof,false,false);
    for(const z of [-48,-24,0,24,48])cylinderBetween(scene,[side*39,15,z],[side*51.5,21,z],.16,materials.trim);
  }
  for (const end of [-1,1]) {
    box(scene,[80,1.4,13],[0,4.2,end*62.5],materials.concrete,false,true);
    for(let row=0;row<6;row++) box(scene,[77,0.28,.6],[0,5.35+row*1.28,end*(57.6+row*1.22)],row%2?materials.trim:materials.concrete,false,true);
    box(scene,[82,1,14],[0,13.6,end*69.8],materials.roof,false,true);
    box(scene,[74,.17,.24],[0,1.02,end*55.4],materials.led,false,false);
    for(const x of [-34,-17,0,17,34])box(scene,[1.2,13,1.2],[x,10.5,end*70.5],materials.trim,false,false);
  }
  for (const z of [-53,0,53]) {
    const pts=[];
    for(let i=0;i<=48;i++){const a=Math.PI*i/48;pts.push([Math.cos(a)*50,20+Math.sin(a)*4,z]);}
    line(pts,new THREE.LineBasicMaterial({color:0x40564b,transparent:true,opacity:.72}));
  }
  // Tường chân khán đài, bảng LED màu lục và vài bảng điểm mảnh.
  for(const s of [-1,1]) box(scene,[.34,.8,112],[s*36.4,.35,0],mat(0x79bc56,.55,{emissive:0x173d18,emissiveIntensity:.35}),false,false);
  box(scene,[37,3,.7],[0,15.2,-70.2],mat(0x173629,.55,{emissive:0x0c2215,emissiveIntensity:.35}),false,false);
  box(scene,[37,.16,.22],[0,13.55,-69.75],materials.led,false,false);
  addCrowd();
  // Các vùng phản quang mềm cho mặt cỏ, bổ trợ cho chùm đèn pha và bóng đổ.
  const poolMat=new THREE.MeshBasicMaterial({map:makeLightPoolTexture(),color:0xc7f0a0,transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,blending:THREE.AdditiveBlending});
  for(const sx of [-1,1])for(const sz of [-1,1]){const pool=new THREE.Mesh(new THREE.PlaneGeometry(34,44),poolMat);pool.rotation.x=-Math.PI/2;pool.position.set(sx*17,.027,sz*24);scene.add(pool);}
  // Cột đèn và dãy đèn pha quanh bốn góc sân.
  for (const sx of [-1,1]) for (const sz of [-1,1]) {
    const x=sx*44,z=sz*43;
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.18,.34,23,8),materials.trim);pole.position.set(x,17,z);pole.castShadow=true;scene.add(pole);
    box(scene,[5.6,.42,1.05],[x,28.2,z],materials.roof,false,false);
    for(let i=0;i<5;i++){
      const lamp=new THREE.Mesh(sphereGeo,new THREE.MeshBasicMaterial({color:0xe8fff0}));lamp.scale.set(.22,.17,.22);lamp.position.set(x-2.1+i*1.05,28,z);scene.add(lamp);
    }
    const glow=new THREE.SpotLight(0xe7fff0,180,118,Math.PI/4.2,.58,1.5);glow.position.set(x,27.7,z);glow.target.position.set(-sx*8,0,-sz*10);scene.add(glow,glow.target);
  }
  const rooflights=new THREE.PointLight(0xa9d6bd,85,78,1.6);rooflights.position.set(0,19,-60);scene.add(rooflights);
  const backlight=new THREE.PointLight(0x6cc08b,68,78,1.65);backlight.position.set(0,19,60);scene.add(backlight);
}

function buildGoal(z, direction) {
  const goal = new THREE.Group(); scene.add(goal);
  const faceZ=z, depth=direction*3.8, width=8.35, barY=4.05;
  cylinderBetween(goal,[-width,0.17,faceZ],[-width,barY,faceZ],.16,materials.white);
  cylinderBetween(goal,[width,0.17,faceZ],[width,barY,faceZ],.16,materials.white);
  cylinderBetween(goal,[-width,barY,faceZ],[width,barY,faceZ],.16,materials.white);
  const netmat=materials.net;
  for(let i=0;i<=12;i++){
    const x=-width+2*width*i/12;
    line([[x,.18,faceZ],[x,.18,faceZ+depth],[x,barY,faceZ+depth]],netmat,goal);
  }
  for(let i=0;i<=7;i++){
    const y=.18+(barY-.18)*i/7;
    line([[-width,y,faceZ],[-width,y,faceZ+depth],[width,y,faceZ+depth],[width,y,faceZ]],netmat,goal);
  }
  for(let i=0;i<6;i++){const x=-width+2*width*i/6;line([[x,.18,faceZ],[x+2*width/6,barY,faceZ+depth]],netmat,goal);line([[x,barY,faceZ],[x+2*width/6,.18,faceZ+depth]],netmat,goal);}
  for(const s of [-1,1]) line([[s*width,.18,faceZ],[s*width,.18,faceZ+depth],[s*width,barY,faceZ+depth],[s*width,barY,faceZ]],netmat,goal);
  return goal;
}
buildField();
buildStadium();
buildGoal(-54.6,-1);buildGoal(54.6,1);

function makePlayer({shirt,shorts,skin=materials.skin,keeper=false,scale=1,number='7'}) {
  const root=new THREE.Group(); scene.add(root);root.scale.setScalar(scale);
  const shirtMat=shirt, shortsMat=shorts;
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.48,.78,4,9),shirtMat);body.position.y=1.38;body.castShadow=true;root.add(body);
  const trim=shirt===materials.blue?materials.trimBlue:shirt===materials.keeper?materials.gold:materials.trimRed;
  const collar=new THREE.Mesh(new THREE.TorusGeometry(.22,.045,5,14),trim);collar.rotation.x=Math.PI/2;collar.position.set(0,1.82,-.02);root.add(collar);
  const mark=document.createElement('canvas');mark.width=128;mark.height=128;const markCtx=mark.getContext('2d');
  markCtx.fillStyle='rgba(5,18,34,.68)';markCtx.beginPath();markCtx.roundRect(22,18,84,92,18);markCtx.fill();markCtx.strokeStyle=shirt===materials.blue?'#a3edff':shirt===materials.keeper?'#fff4ad':'#ffe0d5';markCtx.lineWidth=5;markCtx.stroke();
  markCtx.fillStyle='#fffdf0';markCtx.font='900 70px system-ui,sans-serif';markCtx.textAlign='center';markCtx.textBaseline='middle';markCtx.fillText(String(number),64,67);
  const numberTexture=new THREE.CanvasTexture(mark);numberTexture.colorSpace=THREE.SRGBColorSpace;
  const numberPatch=new THREE.Mesh(new THREE.PlaneGeometry(.34,.4),new THREE.MeshBasicMaterial({map:numberTexture,transparent:true,toneMapped:false,depthWrite:false}));numberPatch.position.set(0,1.39,.485);root.add(numberPatch);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.31,16,12),skin);head.position.y=2.37;head.castShadow=true;root.add(head);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.315,14,8,0,Math.PI*2,0,Math.PI*.46),materials.black);hair.position.y=2.43;hair.castShadow=true;root.add(hair);
  const arms=[],legs=[];
  for(const s of [-1,1]){
    const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.15,.57,3,7),shirtMat);arm.position.set(s*.57,1.46,0);arm.rotation.z=s*-.11;arm.castShadow=true;root.add(arm);arms.push(arm);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.15,10,8),skin);hand.position.set(s*.59,.99,0);root.add(hand);
    const thigh=new THREE.Mesh(new THREE.CapsuleGeometry(.21,.44,3,7),shortsMat);thigh.position.set(s*.28,.76,0);thigh.castShadow=true;root.add(thigh);
    const shin=new THREE.Mesh(new THREE.CapsuleGeometry(.145,.43,3,7),materials.white);shin.position.set(s*.28,.31,0);shin.castShadow=true;root.add(shin);legs.push(thigh,shin);
    const boot=new THREE.Mesh(new THREE.BoxGeometry(.27,.16,.46),materials.boots);boot.position.set(s*.28,.09,-.1);boot.castShadow=true;root.add(boot);
  }
  const stripe=new THREE.Mesh(new THREE.BoxGeometry(.1,.45,.03),trim);stripe.position.set(0,1.35,-.49);root.add(stripe);
  for(const s of [-1,1]){const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.22,12,9),shirtMat);shoulder.scale.set(1,.78,.9);shoulder.position.set(s*.4,1.79,0);root.add(shoulder);const shortTrim=new THREE.Mesh(new THREE.BoxGeometry(.05,.32,.03),trim);shortTrim.position.set(s*.3,.76,-.215);root.add(shortTrim);}
  root.userData={arms,legs,keeper};return root;
}
const player=makePlayer({shirt:materials.blue,shorts:materials.shortsBlue,number:'11'});
const homeRoster=createOutfieldRoster('home');
const playerState=homeRoster[CONTROLLED_SLOT];Object.assign(playerState,{x:0,z:31,homeX:0,homeZ:31,yaw:0,step:0,vx:0,vz:0});
const teammateStates=homeRoster.filter((_,i)=>i!==CONTROLLED_SLOT);
const teammates=teammateStates.map((state,i)=>makePlayer({shirt:materials.blue,shorts:materials.shortsBlue,number:String(i+2)}));
const defenderStates=createOutfieldRoster('away');
const defenders=defenderStates.map((state,i)=>makePlayer({shirt:materials.red,shorts:materials.shortsRed,number:String(i+2)}));
const goalkeeper=makePlayer({shirt:materials.keeper,shorts:materials.black,scale:.87,number:'1'});
const homeGoalkeeper=makePlayer({shirt:materials.keeperHome,shorts:materials.shortsBlue,scale:.87,number:'1'});
player.position.set(playerState.x,0,playerState.z);
teammates.forEach((mesh,i)=>{const s=teammateStates[i];mesh.position.set(s.x,0,s.z);mesh.rotation.y=s.yaw;});
defenders.forEach((mesh,i)=>{const s=defenderStates[i];mesh.position.set(s.x,0,s.z);mesh.rotation.y=s.yaw;});
goalkeeper.position.set(0,0,-51.4);homeGoalkeeper.position.set(0,0,51.4);
let keeperX=0,keeperStep=0,homeKeeperX=0,homeKeeperStep=0,keeperPolicyTarget=0,keeperReactiveTarget=0,keeperReactionWait=0,keeperReadTimer=0,keeperDiveTime=0,keeperDiveSide=0;

const ballGroup=new THREE.Group();scene.add(ballGroup);
const ballMesh=new THREE.Mesh(new THREE.SphereGeometry(.58,26,20),materials.ballWhite);ballMesh.castShadow=true;ballGroup.add(ballMesh);
const patchGeo=new THREE.CircleGeometry(.125,5);
const ballPatches=[];
for(let i=0;i<12;i++){
  const phi=Math.acos(1-2*(i+.5)/12),theta=i*2.4;
  const normal=new THREE.Vector3(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta));
  const patch=new THREE.Mesh(patchGeo,materials.ballBlack);patch.position.copy(normal.clone().multiplyScalar(.586));patch.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);ballGroup.add(patch);ballPatches.push(patch);
}
const ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.72,18),new THREE.MeshBasicMaterial({color:0x030806,transparent:true,opacity:.36,depthWrite:false}));ballShadow.rotation.x=-Math.PI/2;ballShadow.position.y=.022;scene.add(ballShadow);
const ball={x:0,z:29.7,h:.59,vx:0,vz:0,vy:0,gravity:17.5,curve:0,power:0,inFlight:false,shotTime:0,pickupDelay:0,goalResolved:false};

const game={active:false,paused:false,ended:false,score:0,time:90,charging:false,charge:0,shotMode:0,toastTime:0,lastWholeSecond:90,lastToast:''};
window.__footballMatchInfo=Object.freeze({mode:'11v11',playersPerTeam:PLAYERS_PER_TEAM,homeOutfield:FIELD_PLAYERS_PER_TEAM,awayOutfield:FIELD_PLAYERS_PER_TEAM,totalPlayers:PLAYERS_PER_TEAM*2});
const held=new Set(), virtual=new Set();
let lastFrame=performance.now(),frameScheduled=false;

function setToast(text){game.lastToast=text;game.toastTime=1.65;$('toast').textContent=text;$('toast').classList.add('visible');$('announcer').textContent=text;scheduleFrame();}
function hideToast(){if(game.toastTime<=0)$('toast').classList.remove('visible');}
function updateScore(){
  $('score').textContent=String(game.score);
  $('goals-left').textContent=String(Math.max(0,3-game.score));
  $('final-score').textContent=String(game.score);
  $('announcer').textContent=`Bạn đã ghi ${game.score} bàn. Còn ${Math.max(0,3-game.score)} bàn để thắng.`;
}
function clockText(seconds){const whole=Math.max(0,Math.ceil(seconds));return `${String(Math.floor(whole/60)).padStart(2,'0')}:${String(whole%60).padStart(2,'0')}`;}
function showResult(won){
  goalkeeperRL.discardShot();
  game.active=false;game.ended=true;game.paused=false;game.charging=false;
  $('pause-overlay').classList.add('hidden');$('pause-overlay').setAttribute('aria-hidden','true');closeModal($('pause-overlay'));
  $('result-overlay').classList.remove('hidden');$('result-overlay').setAttribute('aria-hidden','false');
  $('result-title').innerHTML=won?'BẠN<br><em>THẮNG!</em>':'HẾT<br><em>GIỜ RỒI</em>';
  $('result-eyebrow').innerHTML=won?'<span></span> CHIẾN THẮNG · ĐÊM CHUNG KẾT':'<span></span> HẾT GIỜ · ĐÊM CHUNG KẾT';
  $('result-message').textContent=won?'Bạn đã đánh bại thủ môn và thắp sáng sân vận động. Một trận đấu xuất sắc!':game.score?`Bạn đã ghi ${game.score} bàn. Thử lại để chạm mốc 3 bàn nhé!`:'Thủ môn giữ sạch lưới. Rê bóng sát hơn và nhắm vào góc xa trong lượt tới!';
  $('match-state').textContent=won?'CHIẾN THẮNG':'TRẬN ĐẤU KẾT THÚC';
  $('announcer').textContent=won?'Bạn thắng! Ghi được ba bàn.':'Trận đấu kết thúc.';
  openModal($('result-overlay'),$('restart-button'));
}
function resetPositions(){
  resetOutfieldRoster(homeRoster);resetOutfieldRoster(defenderStates);
  Object.assign(playerState,{x:0,z:31,homeX:0,homeZ:31,yaw:0,step:0,aimX:0,vx:0,vz:0,moving:false});
  player.position.set(0,0,31);player.rotation.y=0;
  teammateStates.forEach((s,i)=>{s.step=0;teammates[i].position.set(s.x,0,s.z);teammates[i].rotation.y=s.yaw;});
  defenderStates.forEach((s,i)=>{s.step=0;defenders[i].position.set(s.x,0,s.z);defenders[i].rotation.y=s.yaw;});
  keeperX=0;homeKeeperX=0;keeperPolicyTarget=0;keeperReactiveTarget=0;keeperReactionWait=0;keeperReadTimer=0;keeperDiveTime=0;keeperDiveSide=0;
  goalkeeper.position.set(0,0,-51.4);goalkeeper.rotation.z=0;homeGoalkeeper.position.set(0,0,51.4);homeGoalkeeper.rotation.z=0;goalkeeperRL.discardShot();
  Object.assign(ball,{x:0,z:29.7,h:.59,vx:0,vz:0,vy:0,gravity:17.5,curve:0,power:0,inFlight:false,shotTime:0,pickupDelay:0,goalResolved:false});
  game.charging=false;game.charge=0;$('power-wrap').classList.remove('visible');held.clear();virtual.clear();
}
function beginMatch(){
  closeModal($('pause-overlay'));closeModal($('result-overlay'));
  game.active=true;game.paused=false;game.ended=false;game.score=0;game.time=90;game.lastWholeSecond=90;game.toastTime=0;
  $('intro').classList.add('hidden');$('pause-overlay').classList.add('hidden');$('result-overlay').classList.add('hidden');
  for(const id of ['intro','pause-overlay','result-overlay'])$(id).setAttribute('aria-hidden','true');
  $('game-shell').focus({preventScroll:true});
  $('match-state').textContent='TRẬN ĐẤU ĐANG DIỄN RA';$('clock').textContent='01:30';
  updateScore();resetPositions();setToast('TRẬN ĐẤU BẮT ĐẦU — LÊN BÓNG!');
}
function pauseMatch(){
  if(!game.active||game.ended)return;
  game.active=false;game.paused=true;cancelShotCharge();$('power-wrap').classList.remove('visible');
  $('pause-overlay').classList.remove('hidden');$('pause-overlay').setAttribute('aria-hidden','false');openModal($('pause-overlay'),$('resume-button'));
}
function resumeMatch(){if(!game.paused)return;game.paused=false;game.active=true;$('pause-overlay').classList.add('hidden');$('pause-overlay').setAttribute('aria-hidden','true');closeModal($('pause-overlay'),$('pause-button'));lastFrame=performance.now();scheduleFrame();}
function togglePause(){if(game.active)pauseMatch();else if(game.paused)resumeMatch();}
function getInput(){
  const isDown=(...names)=>names.some(n=>held.has(n)||virtual.has(n));
  return {x:Number(isDown('KeyD','ArrowRight'))-Number(isDown('KeyA','ArrowLeft')),z:Number(isDown('KeyS','ArrowDown'))-Number(isDown('KeyW','ArrowUp')),sprint:isDown('ShiftLeft','ShiftRight','Sprint')};
}
const SHOT_MODES=[{name:'THƯỜNG',toast:'SÚT THƯỜNG: MẠNH VÀ THẲNG'},{name:'ĐẶT LÒNG',toast:'ĐẶT LÒNG: CHẬM HƠN, BÓNG XOÁY'},{name:'LỐP',toast:'SÚT LỐP: BÓNG BỔNG QUA TẦM VỚI'}];
function cycleShotMode(){game.shotMode=(game.shotMode+1)%SHOT_MODES.length;const label=SHOT_MODES[game.shotMode].name;$('shot-mode-button').textContent=`KIỂU: ${label}`;$('shot-mode-button').setAttribute('aria-label',`Đổi kiểu sút — hiện tại: ${label}`);$('announcer').textContent=SHOT_MODES[game.shotMode].toast;}
function beginCharge(){if(!game.active||game.paused||game.ended||game.charging)return;game.charging=true;game.charge=.05;$('power-wrap').classList.add('visible');}
function cancelShotCharge(){if(!game.charging)return;game.charging=false;game.charge=0;$('power-wrap').classList.remove('visible');$('power-fill').style.width='0%';}
function fireShot(){
  if(!game.charging)return;
  game.charging=false;$('power-wrap').classList.remove('visible');
  if(!game.active||game.paused)return;
  const dxPlayer=playerState.x-ball.x,dzPlayer=playerState.z-ball.z;
  if(Math.hypot(dxPlayer,dzPlayer)>3.8||ball.inFlight){setToast(ball.inFlight?'CHỜ BÓNG QUAY LẠI':'CHẠY TỚI SÁT BÓNG RỒI SÚT');return;}
  const input=getInput();const aimed=input.x!==0;
  const targetX=aimed?input.x*6.4:(keeperX>=0?-6.15:6.15);
  const dx=targetX-ball.x,dz=-55.1-ball.z,length=Math.hypot(dx,dz)||1;
  const charge=Math.min(1,game.charge/1.25),aimSign=input.x||Math.sign(dx)||1;let speed,vertical,gravity=17.5,curve=0;
  if(game.shotMode===1){speed=19+charge*5;vertical=3.4+charge*1.2;gravity=16;curve=aimSign*(.58+charge*.18);}
  else if(game.shotMode===2){speed=25+charge*3;gravity=6.4;}
  else{speed=23+charge*9;vertical=4.8+charge*2.1;}
  ball.vx=dx/length*speed;ball.vz=dz/length*speed;ball.gravity=gravity;ball.curve=curve;ball.power=charge;ball.goalResolved=false;
  if(game.shotMode===2){const t=Math.max(.2,(AWAY_GOAL_LINE_Z-ball.z)/ball.vz);ball.vy=(3.05+charge*.35-ball.h+.5*gravity*t*t)/t;}else ball.vy=vertical;
  const goalTime=(AWAY_GOAL_LINE_Z-ball.z)/ball.vz,predictedX=ball.x+ball.vx*goalTime+.5*ball.curve*goalTime*goalTime,keeperDecision=goalkeeperRL.beginShot({startX:ball.x,targetX:predictedX,power:charge});
  keeperPolicyTarget=keeperDecision.targetX;keeperReactiveTarget=keeperX;keeperReactionWait=.18+Math.random()*.12;keeperReadTimer=0;keeperDiveSide=0;keeperDiveTime=0;
  ball.inFlight=true;ball.shotTime=0;ball.pickupDelay=.72;
  playerState.yaw=Math.atan2(ball.vx,-ball.vz);player.rotation.y=playerState.yaw;
  setToast(game.shotMode===1?'ĐẶT LÒNG XOÁY!':game.shotMode===2?'SÚT LỐP!':charge>.72?'CÚ SÚT SẤM SÉT!':'DỨT ĐIỂM!');
  game.charge=0;
}
function scoreGoal(){
  goalkeeperRL.resolveShot('goal');
  game.score++;updateScore();setToast('VÀOOOO! KHÁN ĐÀI BÙNG NỔ!');$('announcer').textContent=formatGoalAnnouncement(game.score);
  ball.inFlight=false;ball.vx=ball.vz=ball.vy=0;
  if(game.score>=3){showResult(true);return;}
  resetPositions();playerState.x=0;playerState.z=27;playerState.homeZ=27;player.position.set(0,0,27);Object.assign(ball,{x:0,z:25.7,h:.59});keeperX=0;homeKeeperX=0;keeperPolicyTarget=0;keeperReactiveTarget=0;
}
function updatePlayer(dt,input,time){
  let ix=input.x,iz=input.z;const len=Math.hypot(ix,iz);if(len>1){ix/=len;iz/=len;}
  const close=defenderStates.some(d=>Math.hypot(d.x-playerState.x,d.z-playerState.z)<1.5),speed=(input.sprint?13.2:9.25)*(close?.86:1),blend=1-Math.exp(-dt*(len>.04?15:20));
  playerState.vx+=(ix*speed-playerState.vx)*blend;playerState.vz+=(iz*speed-playerState.vz)*blend;
  playerState.x=THREE.MathUtils.clamp(playerState.x+playerState.vx*dt,-31.2,31.2);
  playerState.z=THREE.MathUtils.clamp(playerState.z+playerState.vz*dt,-48,48);
  if(len>.04){const targetYaw=Math.atan2(ix,-iz);let diff=(targetYaw-playerState.yaw+Math.PI*3)%(Math.PI*2)-Math.PI;playerState.yaw+=diff*Math.min(1,dt*17);playerState.aimX=ix;}
  player.position.set(playerState.x,0,playerState.z);player.rotation.y=playerState.yaw;
  const moving=Math.hypot(playerState.vx,playerState.vz)>.55;playerState.step+=(moving?dt*(input.sprint?14:10):dt*2.5);
  const swing=moving?Math.sin(playerState.step)*.63:0;
  player.userData.legs[0].rotation.x=swing;player.userData.legs[1].rotation.x=-swing;
  player.userData.legs[2].rotation.x=-swing*.8;player.userData.legs[3].rotation.x=swing*.8;
  player.userData.arms[0].rotation.x=-swing*.52;player.userData.arms[1].rotation.x=swing*.52;
}
function updateTeamBrains(dt){
  const focus=ball.inFlight?ball:playerState,carrier=focus,possession=ball.inFlight?'neutral':'home',now=performance.now()/1000;
  const homeAllies=homeRoster;
  const homeBefore=homeRoster.map((agent)=>({...agent})),awayBefore=defenderStates.map((agent)=>({...agent}));
  updateTeamAI({roster:teammateStates,allies:homeAllies,opponents:awayBefore,ball:focus,carrier,possession,dt,now});
  updateTeamAI({roster:defenderStates,allies:defenderStates,opponents:homeBefore,ball:focus,carrier,possession,dt,now});
  teammateStates.forEach((s,i)=>{
    const mesh=teammates[i];mesh.position.set(s.x,0,s.z);mesh.rotation.y=s.yaw;
    const swing=s.moving?Math.sin(s.step)*.48:0;mesh.userData.legs.forEach((leg,j)=>leg.rotation.x=(j%2?-1:1)*swing);mesh.userData.arms.forEach((arm,j)=>arm.rotation.x=(j===0?-1:1)*swing*.42);
  });
  defenderStates.forEach((s,i)=>{
    const mesh=defenders[i];mesh.position.set(s.x,0,s.z);mesh.rotation.y=s.yaw;
    const swing=s.moving?Math.sin(s.step)*.5:0;mesh.userData.legs.forEach((leg,j)=>leg.rotation.x=(j%2?-1:1)*swing);mesh.userData.arms.forEach((arm,j)=>arm.rotation.x=(j===0?-1:1)*swing*.42);
  });
}
function updateKeeper(dt){
  if(ball.inFlight&&!ball.goalResolved&&ball.vz<-.1&&ball.z>AWAY_GOAL_LINE_Z){
    keeperReactionWait=Math.max(0,keeperReactionWait-dt);
    if(keeperReactionWait===0){keeperReadTimer-=dt;if(keeperReadTimer<=0){
      const time=THREE.MathUtils.clamp((AWAY_GOAL_LINE_Z-ball.z)/Math.max(2,-ball.vz),0,2.8),uncertainty=.3+time*.17+Math.abs(ball.curve)*.2+ball.power*.12;
      const observed=ball.x+ball.vx*time+.5*ball.curve*time*time+(Math.random()-.5)*2*uncertainty,previous=keeperReactiveTarget;
      keeperReactiveTarget=THREE.MathUtils.clamp(previous*.58+observed*.42,-6.9,6.9);keeperReadTimer=.11;
      if(ball.shotTime>.32&&Math.abs(keeperReactiveTarget-keeperX)>.8){keeperDiveSide=Math.sign(keeperReactiveTarget-keeperX);keeperDiveTime=.42;}
    }}
  }
  const anticipating=ball.inFlight&&keeperReactionWait>0,target=anticipating?keeperPolicyTarget:keeperReactiveTarget,speed=anticipating?3.2:5.4;
  keeperX+=THREE.MathUtils.clamp(target-keeperX,-speed*dt,speed*dt);keeperDiveTime=Math.max(0,keeperDiveTime-dt);
  goalkeeper.position.set(keeperX,0,-51.4);goalkeeper.rotation.y=0;goalkeeper.rotation.z=keeperDiveSide*.34*(keeperDiveTime/.42);keeperStep+=dt*5;
  goalkeeper.userData.legs.forEach((leg,j)=>leg.rotation.x=(j%2?1:-1)*Math.sin(keeperStep)*.15);
}
function updateHomeKeeper(dt){
  let target=ball.x*.2;
  if(ball.inFlight&&ball.vz>0){const t=THREE.MathUtils.clamp((HOME_GOAL_LINE_Z-ball.z)/Math.max(2,ball.vz),0,2.4);target=ball.x+ball.vx*t;}
  else if(playerState.z>8)target=ball.x*.32;
  target=THREE.MathUtils.clamp(target,-7.05,7.05);homeKeeperX+=THREE.MathUtils.clamp(target-homeKeeperX,-4.4*dt,4.4*dt);
  homeGoalkeeper.position.set(homeKeeperX,0,51.4);homeGoalkeeper.rotation.y=Math.PI;homeKeeperStep+=dt*4.5;
  homeGoalkeeper.userData.legs.forEach((leg,j)=>leg.rotation.x=(j%2?1:-1)*Math.sin(homeKeeperStep)*.12);
}
function resolveKeeperSave(crossing){
  const diving=keeperDiveTime>0&&Math.sign(crossing.x-keeperX)===keeperDiveSide,horizontalReach=diving?1.55:1.0,heightReach=diving?3.55:2.25;
  const gapX=Math.max(0,Math.abs(crossing.x-keeperX)-horizontalReach),gapY=Math.max(0,crossing.h-heightReach),missDistance=Math.hypot(gapX,gapY),saveChance=Math.max(.1,Math.min(.78,.76-missDistance*.46-(crossing.h>2.6?.12:0)));
  if(missDistance>.58||Math.random()>saveChance)return false;
  goalkeeperRL.resolveShot('save');ball.x=crossing.x;ball.z=crossing.z;ball.h=crossing.h;const side=Math.sign(crossing.x-playerState.x)||Math.sign(crossing.x-keeperX)||1;
  ball.x+=side*.34;ball.z=-53.4;ball.vx=side*(4.1+Math.abs(ball.vx)*.14);ball.vz=-Math.max(2.2,Math.abs(ball.vz)*.16);ball.vy=3.25;ball.gravity=13;ball.curve=0;ball.shotTime=0;ball.pickupDelay=.28;ball.goalResolved=true;setToast('THỦ MÔN CẢN PHÁ — BÓNG BẬT LỆCH!');return true;
}
function deflectFromDefender(){
  if(ball.vz>=0||ball.shotTime<.12)return false;
  for(let i=0;i<defenderStates.length;i++){const d=defenderStates[i];if(Math.hypot(ball.x-d.x,ball.z-d.z)<1.05&&ball.h<2.4){
    goalkeeperRL.discardShot();const side=Math.sign(ball.x-d.x)||(i%2?1:-1);ball.vx=side*(4.8+Math.abs(ball.vx)*.12);ball.vz=Math.abs(ball.vz)*.3;ball.vy=3.4;ball.gravity=13;ball.curve=0;ball.x+=side*.38;ball.z+=.25;ball.shotTime=0;ball.pickupDelay=.12;ball.goalResolved=true;setToast('HẬU VỆ CHẠM BÓNG — CÚ SÚT ĐỔI HƯỚNG!');return true;
  }}return false;
}
function updateBall(dt){
  if(!ball.inFlight){const forwardX=Math.sin(playerState.yaw),forwardZ=-Math.cos(playerState.yaw),carry=.62+Math.min(.34,Math.hypot(playerState.vx,playerState.vz)*.035),targetX=playerState.x+forwardX*carry,targetZ=playerState.z+forwardZ*carry,blend=1-Math.exp(-dt*14),oldX=ball.x,oldZ=ball.z;ball.x+=(targetX-ball.x)*blend;ball.z+=(targetZ-ball.z)*blend;ball.vx=(ball.x-oldX)/Math.max(dt,.001);ball.vz=(ball.z-oldZ)/Math.max(dt,.001);ball.h=.59;ball.vy=0;}
  else{
    const previousBall={x:ball.x,z:ball.z,h:ball.h};
    ball.shotTime+=dt;ball.pickupDelay=Math.max(0,ball.pickupDelay-dt);ball.vx+=ball.curve*dt;ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;ball.h+=ball.vy*dt;ball.vy-=ball.gravity*dt;applyBallFlightDamping(ball,dt);
    if(ball.h<.59){ball.h=.59;if(ball.vy< -1.7){ball.vy=-ball.vy*.32;ball.vx*=.82;ball.vz*=.82;}else ball.vy=0;}
    const touched=deflectFromDefender();
    const crossing=goalPlaneCrossing(previousBall,ball,AWAY_GOAL_SCORE_PLANE_Z);
    if(!touched&&crossing&&!ball.goalResolved){
      if(ballFitsGoalMouth(crossing)){if(!resolveKeeperSave(crossing)){scoreGoal();return;}}
      else{ball.x=crossing.x;ball.z=crossing.z;ball.h=crossing.h;goalkeeperRL.discardShot();ball.inFlight=false;setToast('CÚ SÚT LỆCH KHUNG THÀNH');}
    }
    if(ball.inFlight&&(Math.abs(ball.x)>34||ball.z>56||ball.shotTime>5.2)){goalkeeperRL.discardShot();ball.inFlight=false;setToast('BÓNG RA NGOÀI — NHẬN LẠI BÓNG');}
    if(ball.inFlight&&ball.pickupDelay===0&&Math.hypot(ball.x-playerState.x,ball.z-playerState.z)<1.85&&ball.h<1.2){goalkeeperRL.discardShot();ball.inFlight=false;ball.goalResolved=false;setToast('GIỮ ĐƯỢC BÓNG — TIẾP TỤC!');}
  }
  ballGroup.position.set(ball.x,ball.h,ball.z);ballGroup.rotation.x+=dt*(ball.inFlight?ball.vz*-.12:0);ballGroup.rotation.z+=dt*(ball.inFlight?ball.vx*.12:0);
  const altitude=Math.max(0,ball.h-.58);ballShadow.position.set(ball.x,.023+altitude*.001,ball.z);const sh=1+Math.min(2,altitude*.18);ballShadow.scale.set(sh,sh,sh);ballShadow.material.opacity=Math.max(.08,.34-altitude*.045);
  updateKeeper(dt);updateHomeKeeper(dt);
}
function updateGame(dt){
  if(game.toastTime>0){game.toastTime-=dt;hideToast();}
  if(game.charging){game.charge=Math.min(1.25,game.charge+dt);$('power-fill').style.width=`${Math.min(100,game.charge/1.25*100)}%`;}
  const input=getInput();updatePlayer(dt,input,performance.now()/1000);updateTeamBrains(dt);updateBall(dt);
  if(!game.active)return;
  game.time=Math.max(0,game.time-dt);const whole=Math.ceil(game.time);
  if(whole!==game.lastWholeSecond){$('clock').textContent=clockText(game.time);game.lastWholeSecond=whole;}
  if(game.time<=10&&whole>0){$('clock').classList.add('urgent');}else $('clock').classList.remove('urgent');
  if(game.time<=0)showResult(false);
}
const desiredCamera=new THREE.Vector3();const lookAt=new THREE.Vector3();
function scheduleFrame(){if(frameScheduled)return;frameScheduled=true;requestAnimationFrame(animate);}
function animate(now){
  frameScheduled=false;
  const dt=Math.min(.038,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  if(game.active){
    updateGame(dt);
    if(game.active){
      desiredCamera.set(playerState.x*.83,8.7,playerState.z+15.8);
      camera.position.lerp(desiredCamera,1-Math.exp(-dt*3.6));
      lookAt.set(playerState.x*.54,1.15,playerState.z-17.5);camera.lookAt(lookAt);
      renderer.render(scene,camera);
    }
  }else if(!game.paused&&!game.ended&&game.toastTime>0){game.toastTime-=dt;hideToast();}
  if(game.active||(!game.paused&&!game.ended&&game.toastTime>0))scheduleFrame();
}
function resize(){const width=world.clientWidth||window.innerWidth,height=world.clientHeight||window.innerHeight,pixelRatio=Math.min(window.devicePixelRatio||1,1.65);if(renderer.getPixelRatio()!==pixelRatio)renderer.setPixelRatio(pixelRatio);camera.aspect=width/height;camera.fov=width<650?61:55;camera.updateProjectionMatrix();renderer.setSize(width,height,false);}
window.addEventListener('resize',resize,{passive:true});resize();

mountLearningControls(()=>{keeperPolicyTarget=0;keeperReactiveTarget=0;setToast('ĐÃ XÓA BỘ NHỚ HỌC CỦA THỦ MÔN');});

$('start-button').addEventListener('click',beginMatch);
$('restart-button').addEventListener('click',beginMatch);
$('restart-pause-button').addEventListener('click',beginMatch);
$('resume-button').addEventListener('click',resumeMatch);
$('pause-button').addEventListener('click',togglePause);$('shot-mode-button').addEventListener('click',cycleShotMode);
function bindVirtualControl(button,key){
  const down=e=>{e.preventDefault();virtual.add(key);button.classList.add('pressed');if(Number.isInteger(e.pointerId)){try{button.setPointerCapture(e.pointerId);}catch{}}};
  const up=e=>{e.preventDefault();virtual.delete(key);button.classList.remove('pressed');};
  button.addEventListener('pointerdown',down);for(const ev of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(ev,up);
  button.addEventListener('keydown',e=>{if(e.code!=='Enter'&&e.code!=='Space')return;e.preventDefault();e.stopPropagation();if(!e.repeat)down(e);});
  button.addEventListener('keyup',e=>{if(e.code!=='Enter'&&e.code!=='Space')return;e.preventDefault();e.stopPropagation();up(e);});
}
for(const button of document.querySelectorAll('[data-key]'))bindVirtualControl(button,button.dataset.key);
bindVirtualControl($('sprint-button'),'Sprint');
const shootButton=$('shoot-button');
const pressShot=e=>{e.preventDefault();if(!game.active)return;shootButton.classList.add('pressed');if(Number.isInteger(e.pointerId)){try{shootButton.setPointerCapture(e.pointerId);}catch{}}beginCharge();};
const releaseShot=e=>{e.preventDefault();shootButton.classList.remove('pressed');fireShot();};
const cancelShot=e=>{e.preventDefault();shootButton.classList.remove('pressed');cancelShotCharge();};
shootButton.addEventListener('pointerdown',pressShot);shootButton.addEventListener('pointerup',releaseShot);shootButton.addEventListener('pointercancel',cancelShot);shootButton.addEventListener('lostpointercapture',cancelShot);
shootButton.addEventListener('keydown',e=>{if(e.code!=='Enter')return;e.preventDefault();e.stopPropagation();if(!e.repeat)pressShot(e);});
shootButton.addEventListener('keyup',e=>{if(e.code!=='Enter')return;e.preventDefault();e.stopPropagation();releaseShot(e);});
window.addEventListener('keydown',(e)=>{
  if(e.code==='Escape'){e.preventDefault();togglePause();return;}
  if(e.code==='KeyQ'&&!e.repeat){if(game.active){e.preventDefault();cycleShotMode();}return;}
  const control=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space'];
  if(!control.includes(e.code)||!game.active)return;
  e.preventDefault();held.add(e.code);
  if(e.code==='Space'&&!e.repeat)beginCharge();
});
window.addEventListener('keyup',(e)=>{
  held.delete(e.code);
  if(e.code==='Space'){e.preventDefault();fireShot();}
});
window.addEventListener('blur',()=>{held.clear();virtual.clear();cancelShotCharge();for(const button of document.querySelectorAll('.pressed'))button.classList.remove('pressed');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.active)pauseMatch();});
