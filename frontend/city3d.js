// OMNIMIND Swarm City 3D — Three.js disaster-response sim (no build step)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const logEl = $('log');
function log(m){ const d = document.createElement('div'); d.textContent = m; logEl.prepend(d); while(logEl.children.length>60) logEl.lastChild.remove(); }
let seed = 7;
function rnd(){ seed = (seed*1664525 + 1013904223) >>> 0; return seed/4294967296; }
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// ---------- city model (same rules as 2D sim) ----------
const N = 20, CELL = 2, HALF = N*CELL/2;
const ROAD=0, BLD=1, RUB=2, FIRE=3, VIC=4, SHEL=5, PARK=6;
let grid=[], robots=[], victims=[], shelters=[], fires=[];
let running=false, steps=0, cost=0, rescued=0;

function genModel(){
  seed = (Math.random()*1e9)|0;
  grid = Array.from({length:N},()=>Array(N).fill(BLD));
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){
    if(i%5===0||j%5===0) grid[i][j]=ROAD;
    else if(rnd()<0.08) grid[i][j]=PARK;
  }
  const free=()=>{ for(let k=0;k<300;k++){ const x=1+((rnd()*(N-2))|0), y=1+((rnd()*(N-2))|0); if(grid[x][y]===BLD||grid[x][y]===ROAD) return [x,y]; } return [2,2]; };
  shelters=[]; victims=[]; fires=[];
  [[1,1],[N-2,N-2],[1,N-2]].forEach(([x,y])=>{ grid[x][y]=SHEL; shelters.push({x,y}); });
  for(let k=0;k<14;k++){ const [x,y]=free(); if(grid[x][y]!==SHEL) grid[x][y]=RUB; }
  for(let k=0;k<10;k++){ const [x,y]=free(); if(grid[x][y]!==SHEL){ grid[x][y]=FIRE; fires.push({x,y}); } }
  for(let k=0;k<8;k++){ const [x,y]=free(); grid[x][y]=VIC; victims.push({x,y,id:k,carried:false,saved:false}); }
  steps=0; cost=0; rescued=0;
}
const cellXZ=(x,y)=>[ (y+0.5)*CELL-HALF, (x+0.5)*CELL-HALF ]; // col->x, row->z
function passable(x,y){ return x>=0&&y>=0&&x<N&&y<N&&grid[x][y]!==BLD&&grid[x][y]!==RUB; }
function tileCost(x,y){ return grid[x][y]===FIRE?5:1; }
function neigh(x,y){ const o=[]; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if(passable(x+dx,y+dy)) o.push([x+dx,y+dy]); return o; }
function mh(a,b){ return Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]); }
function search(start, goal, algo){
  const key=p=>p[0]*N+p[1];
  if(algo==='bfs'){
    const q=[[start,[start]]], seen=new Set([key(start)]);
    while(q.length){ const [n,path]=q.shift(); if(n[0]===goal[0]&&n[1]===goal[1]) return {path,cost:path.length};
      for(const nb of neigh(n[0],n[1])) if(!seen.has(key(nb))){ seen.add(key(nb)); q.push([nb,path.concat([nb])]); } }
    return {path:[],cost:0};
  }
  const open=[[0,0,start,[start]]], best={[key(start)]:0};
  const hw=algo==='ucs'?0:1, gw=algo==='greedy'?0:1;
  while(open.length){
    open.sort((a,b)=>a[0]-b[0]);
    const [,g,n,path]=open.shift();
    if(n[0]===goal[0]&&n[1]===goal[1]) return {path,cost:g};
    for(const nb of neigh(n[0],n[1])){
      const ng=g+tileCost(nb[0],nb[1])*gw, k=key(nb);
      if(!(k in best)||ng<best[k]){ best[k]=ng; open.push([ng+mh(nb,goal)*hw,ng,nb,path.concat([nb])]); }
    }
  }
  return {path:[],cost:0};
}

// ---------- three.js setup ----------
const container = $('scene-container');
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// ?fast=1 for weak GPUs / headless screenshots: no shadows, pixelRatio 1
if(new URLSearchParams(location.search).get('fast')==='1'){
  renderer.shadowMap.enabled=false;
  renderer.setPixelRatio(1);
}
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 70, 160);

const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 500);
camera.position.set(27,25,27);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0,0,0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI*0.495;
controls.autoRotate = true; controls.autoRotateSpeed = 0.5;
controls.addEventListener('start', ()=>{ controls.autoRotate = false; });

scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1430, 0.55));
const moon = new THREE.DirectionalLight(0xffd9a0, 1.15);
moon.position.set(-30,42,18);
moon.castShadow = true;
moon.shadow.mapSize.set(1024,1024);
moon.shadow.camera.left=-32; moon.shadow.camera.right=32;
moon.shadow.camera.top=32; moon.shadow.camera.bottom=-32;
scene.add(moon);
scene.add(new THREE.AmbientLight(0x334, 0.4));

// stars
{
  const g=new THREE.BufferGeometry(), pts=[];
  for(let i=0;i<400;i++){ const t=rnd()*Math.PI*2, p=rnd()*Math.PI*0.45, r=220;
    pts.push(r*Math.cos(t)*Math.cos(p), r*Math.sin(p)+10, r*Math.sin(t)*Math.cos(p)); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts,3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({color:0xaFC4ff,size:0.7,fog:false,transparent:true,opacity:0.8})));
}

// ---------- canvas textures ----------
function canvasTex(w,h,draw){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}
const glowTex = canvasTex(64,64,(g)=>{
  const r=g.createRadialGradient(32,32,2,32,32,30);
  r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(0.4,'rgba(255,255,255,.45)'); r.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=r; g.fillRect(0,0,64,64);
});
function facadeTex(base, litRatio){
  return canvasTex(64,128,(g)=>{
    g.fillStyle=base; g.fillRect(0,0,64,128);
    for(let y=6;y<122;y+=12) for(let x=6;x<58;x+=10){
      g.fillStyle=rnd()<litRatio?'#ffd37a':'#131c33';
      g.fillRect(x,y,6,8);
    }
  });
}
const facades=[facadeTex('#3a4666',.45),facadeTex('#46536e',.35),facadeTex('#2e3a58',.5),facadeTex('#54465e',.3)];
const roofMat=new THREE.MeshStandardMaterial({color:0x1c2338,roughness:0.95});
const sideMats=facades.map(t=>new THREE.MeshStandardMaterial({map:t,roughness:0.85}));
function groundTexture(){
  const S=1024, c=S/N;
  return canvasTex(S,S,(g)=>{
    g.fillStyle='#232c49'; g.fillRect(0,0,S,S); // sidewalks / blocks base
    for(let i=0;i<N;i++) for(let j=0;j<N;j++){
      const x=j*c, y=i*c;
      if(grid[i][j]===PARK){ g.fillStyle='#14532d'; g.fillRect(x,y,c,c); }
      else if(grid[i][j]===ROAD){ g.fillStyle='#11162c'; g.fillRect(x,y,c,c); }
    }
    // lane dashes along roads
    g.fillStyle='#e2e8f0';
    for(let i=0;i<N;i+=5) for(let j=0;j<N;j+=2){ g.fillRect(j*c+c/2-1.5, i*c+c/2-1.5, 3, c*0.7); }
    for(let j=0;j<N;j+=5) for(let i=0;i<N;i+=2){ g.fillRect(j*c+c/2-1.5, i*c+c/2-1.5, c*0.7, 3); }
  });
}

// ---------- world building ----------
const world=new THREE.Group(); scene.add(world);
const droneLights=[], fireLights=[];
let flameGroups=[], smokeSys=[], pathLines=[], victimMeshes=new Map(), droneMeshes=[];

function clearWorld(){
  world.traverse(o=>{ if(o.geometry) o.geometry.dispose(); });
  world.clear();
  flameGroups=[]; smokeSys=[]; pathLines=[]; victimMeshes=new Map(); droneMeshes=[];
  droneLights.length=0; fireLights.length=0;
}
function box(w,h,d,mat,x,y,z,shadow=true){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m.position.set(x,y,z); m.castShadow=shadow; m.receiveShadow=true; world.add(m); return m;
}
function glowSprite(color,scale,x,y,z){
  const m=new THREE.SpriteMaterial({map:glowTex,color,transparent:true,opacity:0.85,depthWrite:false,blending:THREE.AdditiveBlending});
  const s=new THREE.Sprite(m); s.scale.set(scale,scale,1); s.position.set(x,y,z); world.add(s); return s;
}

function buildWorld(){
  clearWorld();
  // ground
  const gt=groundTexture();
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(N*CELL,N*CELL),
    new THREE.MeshStandardMaterial({map:gt,roughness:1}));
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; world.add(ground);
  // base slab under city
  const slab=new THREE.Mesh(new THREE.BoxGeometry(N*CELL+2,1,N*CELL+2),
    new THREE.MeshStandardMaterial({color:0x0d1330,roughness:1}));
  slab.position.y=-0.55; world.add(slab);

  const parkMat=new THREE.MeshStandardMaterial({color:0x166534,roughness:1});
  const trunkMat=new THREE.MeshStandardMaterial({color:0x4a2f1d,roughness:1});
  const leafMat=new THREE.MeshStandardMaterial({color:0x15803d,roughness:0.9});
  const rubMat=new THREE.MeshStandardMaterial({color:0x57534e,roughness:1});
  const rubMat2=new THREE.MeshStandardMaterial({color:0x44403c,roughness:1});

  for(let i=0;i<N;i++) for(let j=0;j<N;j++){
    const [x,z]=cellXZ(i,j), v=grid[i][j];
    if(v===BLD){
      const h=2+rnd()*4.5, m=sideMats[(rnd()*sideMats.length)|0];
      const b=new THREE.Mesh(new THREE.BoxGeometry(CELL*0.8,h,CELL*0.8),
        [m,m,roofMat,roofMat,m,m]);
      b.position.set(x,h/2,z); b.castShadow=true; b.receiveShadow=true; world.add(b);
      box(CELL*0.86,0.15,CELL*0.86,roofMat,x,0.07,z,false); // foundation
    } else if(v===PARK){
      box(CELL*0.9,0.12,CELL*0.9,parkMat,x,0.06,z,false);
      for(let k=0;k<2;k++){
        const tx=x+(rnd()-0.5)*1.2, tz=z+(rnd()-0.5)*1.2;
        const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.09,0.5,6),trunkMat);
        trunk.position.set(tx,0.35,tz); trunk.castShadow=true; world.add(trunk);
        const leaf=new THREE.Mesh(new THREE.ConeGeometry(0.42,1.0,7),leafMat);
        leaf.position.set(tx,1.0,tz); leaf.castShadow=true; world.add(leaf);
      }
    } else if(v===RUB){
      const p=box(CELL*0.85,0.35,CELL*0.85,rubMat,x,0.17,z);
      p.rotation.y=rnd()*0.6;
      for(let k=0;k<3;k++){
        const s=box(0.5+rnd()*0.7,0.3,0.5+rnd()*0.5,k%2?rubMat:rubMat2,
          x+(rnd()-0.5)*0.9,0.45+rnd()*0.35,z+(rnd()-0.5)*0.9);
        s.rotation.set((rnd()-0.5)*0.7,rnd()*3,(rnd()-0.5)*0.7);
      }
    } else if(v===FIRE){ addFire(i,j,x,z); }
    else if(v===VIC){ addVictim(i,j,x,z); }
    else if(v===SHEL){ addShelter(x,z); }
  }
  // street lamps along roads
  const poleMat=new THREE.MeshStandardMaterial({color:0x0f172a,roughness:0.7});
  for(let i=0;i<N;i+=4) for(let j=0;j<N;j+=5){
    for(const [lx,lz] of [[i,j]]){
      if(!passable(lx,lz)) continue;
      const [x,z]=cellXZ(lx,lz);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.07,3,6),poleMat);
      pole.position.set(x+0.7,1.5,z+0.7); pole.castShadow=true; world.add(pole);
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.12,8,8),
        new THREE.MeshBasicMaterial({color:0xffe9a8}));
      lamp.position.set(x+0.7,3.05,z+0.7); world.add(lamp);
      glowSprite(0xffdf9e,1.6,x+0.7,3.05,z+0.7).material.opacity=0.35;
    }
  }
  // fire point lights (pool of 4, reassigned to first fires)
  for(let k=0;k<Math.min(4,fires.length);k++){
    const L=new THREE.PointLight(0xff7a1a,30,14,1.8);
    const f=fires[k]; const [x,z]=cellXZ(f.x,f.y); L.position.set(x,1.6,z);
    world.add(L); fireLights.push(L);
  }
  buildDrones();
  updateStats();
}

function addFire(i,j,x,z){
  const grp=new THREE.Group(); grp.position.set(x,0,z); grp.userData.isFire=true; world.add(grp);
  const charMat=new THREE.MeshStandardMaterial({color:0x1c0f08,roughness:1});
  const bed=new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.85,0.25,9),charMat);
  bed.position.y=0.12; bed.receiveShadow=true; grp.add(bed);
  const flameMat=new THREE.MeshBasicMaterial({color:0xff8c1a,transparent:true,opacity:0.92});
  const coreMat=new THREE.MeshBasicMaterial({color:0xffe45e,transparent:true,opacity:0.95});
  const flame=new THREE.Mesh(new THREE.ConeGeometry(0.45,1.5,8),flameMat);
  flame.position.y=1.0; grp.add(flame);
  const core=new THREE.Mesh(new THREE.ConeGeometry(0.22,0.9,8),coreMat);
  core.position.y=0.85; grp.add(core);
  const glow=glowSprite(0xff7b1c,3.4,0,1.2,0); grp.add(glow);
  // smoke particles
  const n=14, pos=new Float32Array(n*3), vel=[];
  for(let k=0;k<n;k++){ pos[k*3]=(rnd()-0.5)*0.5; pos[k*3+1]=1.5+rnd()*2; pos[k*3+2]=(rnd()-0.5)*0.5;
    vel.push(0.4+rnd()*0.5); }
  const sg=new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const smoke=new THREE.Points(sg,new THREE.PointsMaterial({color:0x555566,size:0.55,transparent:true,opacity:0.5,depthWrite:false}));
  grp.add(smoke);
  flameGroups.push({grp,flame,core,glow,cell:[i,j],t:rnd()*10});
  smokeSys.push({pts:smoke,vel,n,cell:[i,j]});
}

function addVictim(i,j,x,z){
  const grp=new THREE.Group(); grp.position.set(x,0,z); world.add(grp);
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.28,12,12),
    new THREE.MeshStandardMaterial({color:0xef4444,emissive:0x991111,emissiveIntensity:0.9,roughness:0.4}));
  body.position.y=0.5; body.castShadow=true; grp.add(body);
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.45,0.62,24),
    new THREE.MeshBasicMaterial({color:0xff5555,transparent:true,opacity:0.8,side:THREE.DoubleSide,depthWrite:false}));
  ring.rotation.x=-Math.PI/2; ring.position.y=0.06; grp.add(ring);
  const vglow=glowSprite(0xff4444,1.6,0,0.7,0); grp.add(vglow);
  const v=victims.find(v=>v.x===i&&v.y===j);
  victimMeshes.set(v?v.id:-1, {grp,body,ring});
}

function addShelter(x,z){
  const padMat=new THREE.MeshStandardMaterial({color:0x14532d,roughness:0.8,emissive:0x0a3d1f,emissiveIntensity:0.5});
  box(CELL*0.95,0.15,CELL*0.95,padMat,x,0.07,z,false);
  const tentMat=new THREE.MeshStandardMaterial({color:0xf8fafc,roughness:0.6});
  const tent=new THREE.Mesh(new THREE.ConeGeometry(0.75,0.9,4),tentMat);
  tent.position.set(x-0.3,0.6,z); tent.rotation.y=Math.PI/4; tent.castShadow=true; world.add(tent);
  const crossMat=new THREE.MeshBasicMaterial({color:0xdc2626});
  const c1=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.1,0.02),crossMat);
  c1.position.set(x-0.3,0.62,z+0.55); c1.rotation.y=Math.PI/4; world.add(c1);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.32,9,10,1,true),
    new THREE.MeshBasicMaterial({color:0x4ade80,transparent:true,opacity:0.28,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
  beam.position.set(x+0.55,4.5,z-0.4); world.add(beam);
  glowSprite(0x4ade80,2.2,x+0.55,0.6,z-0.4);
}

function makeDrone(color){
  const grp=new THREE.Group();
  const bodyMat=new THREE.MeshStandardMaterial({color:0x1e293b,roughness:0.4,metalness:0.6});
  const accent=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.7,roughness:0.4});
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.22,0.7),bodyMat);
  body.castShadow=true; grp.add(body);
  const stripe=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.08,0.2),accent);
  stripe.position.y=0.02; grp.add(stripe);
  const rotors=[];
  const armMat=new THREE.MeshStandardMaterial({color:0x334155,roughness:0.5,metalness:0.5});
  for(const [sx,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    const arm=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.06,0.08),armMat);
    arm.position.set(sx*0.42,0.1,sz*0.42); arm.rotation.y=sx*sz*Math.PI/4; grp.add(arm);
    const rot=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.02,14),
      new THREE.MeshStandardMaterial({color:0x94a3b8,transparent:true,opacity:0.5,roughness:0.3}));
    rot.position.set(sx*0.62,0.16,sz*0.62); grp.add(rot); rotors.push(rot);
    const strobe=new THREE.Mesh(new THREE.SphereGeometry(0.05,6,6),
      new THREE.MeshBasicMaterial({color:sx>0?0xff3333:0x33ff77}));
    strobe.position.set(sx*0.62,0.1,sz*0.62); grp.add(strobe);
  }
  const eye=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,8),
    new THREE.MeshBasicMaterial({color:0x9df2ff}));
  eye.position.set(0,-0.05,0.38); grp.add(eye);
  const L=new THREE.PointLight(color,6,9,1.8); L.position.y=-0.3; grp.add(L);
  droneLights.push(L);
  return {grp,rotors};
}

function buildDrones(){
  const colors=[0x38bdf8,0xf472b6,0xa3e635];
  robots=shelters.map((s,i)=>{
    const [x,z]=cellXZ(s.x,s.y);
    const d=makeDrone(colors[i%3]);
    d.grp.position.set(x,5.5,z); world.add(d.grp);
    return {x:s.x,y:s.y,fx:x,fz:z,fy:5.5,path:[],target:null,carry:null,wait:0,color:'#'+colors[i%3].toString(16).padStart(6,'0'),mesh:d,phase:'cruise'};
  });
  drawPaths();
}

function drawPaths(){
  for(const l of pathLines){ world.remove(l); l.geometry.dispose(); }
  pathLines=[];
  if(!$('showPath').checked) return;
  for(const r of robots){
    if(r.path.length<1) continue;
    const pts=[new THREE.Vector3(r.fx,r.fy,r.fz)];
    for(const [cx,cy] of r.path){ const [x,z]=cellXZ(cx,cy); pts.push(new THREE.Vector3(x,r.fy,z)); }
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({color:r.color,transparent:true,opacity:0.85}));
    world.add(line); pathLines.push(line);
  }
}

// ---------- sim (continuous-time) ----------
function assign(){
  const algo=$('algo').value;
  for(const r of robots){
    if(r.path.length||r.carry!==null||r.wait>0) continue;
    let bv=null,bd=1e9,bp=[];
    for(const v of victims){
      if(v.saved||v.carried||robots.some(o=>o!==r&&o.target===v.id)) continue;
      const {path,cost:c}=search([r.x,r.y],[v.x,v.y],algo);
      if(path.length&&c<bd){ bd=c; bv=v; bp=path; }
    }
    if(bv){ r.target=bv.id; r.path=bp.slice(1); log(`drone -> victim ${bv.id} (${algo}, cost ${bd})`); drawPaths(); }
  }
}
function nearestShelter(r){
  return shelters.reduce((a,b)=>mh([r.x,r.y],[a.x,a.y])<mh([r.x,r.y],[b.x,b.y])?a:b);
}
// pickup / drop when a drone sits on its target cell with no path.
// Runs BEFORE assign() so we never log a redundant 0-cost assignment.
function handleArrival(r){
  const v=victims.find(v=>v.id===r.target&&!v.saved);
  if(v&&!v.carried&&r.x===v.x&&r.y===v.y&&r.carry===null){
    // pick up
    v.carried=true; r.carry=v.id; r.target=null; r.wait=0.8;
    const rec=victimMeshes.get(v.id);
    if(rec){ rec.cargo=true; rec.grp.scale.setScalar(0.8); }
    const s=nearestShelter(r);
    const {path}=search([r.x,r.y],[s.x,s.y],$('algo').value);
    r.path=path.slice(1);
    log(`picked victim ${v.id}, heading to shelter`);
    drawPaths();
    return true;
  } else if(r.carry!==null){
    if(shelters.some(s=>s.x===r.x&&s.y===r.y)){
      const v2=victims.find(v=>v.id===r.carry);
      if(v2){ v2.saved=true; const rec2=victimMeshes.get(v2.id); if(rec2){ world.remove(rec2.grp); victimMeshes.delete(v2.id); } }
      log(`RESCUED victim ${r.carry}`);
      r.carry=null; rescued++;
      victims=victims.filter(v=>!v.saved);
      updateStats();
      if(!victims.length){ log('ALL VICTIMS RESCUED'); running=false; $('run').textContent='Run Rescue'; }
    }
    return true;
  }
  return false;
}
function update(dt){
  for(const r of robots){
    if(r.wait<=0&&!r.path.length) handleArrival(r);
  }
  assign();
  const spd=2+($('speed').valueAsNumber||10)*0.9;
  for(const r of robots){
    // spin rotors always
    for(const rot of r.mesh.rotors) rot.rotation.y+=dt*30;
    if(r.wait>0){ r.wait-=dt; continue; }
    if(!r.path.length){
      handleArrival(r);
      continue;
    }
    const [nx,ny]=r.path[0];
    const [tx,tz]=cellXZ(nx,ny);
    const dx=tx-r.fx, dz=tz-r.fz, d=Math.hypot(dx,dz);
    const step=spd*dt;
    // face travel direction
    if(d>1e-4) r.mesh.grp.rotation.y=Math.atan2(dx,dz);
    if(d<=step){
      r.fx=tx; r.fz=tz; r.x=nx; r.y=ny; r.path.shift();
      cost+=tileCost(nx,ny); steps++;
      if(grid[nx][ny]===FIRE&&r.carry===null&&rnd()<0.35){
        grid[nx][ny]=ROAD; extinguishFire(nx,ny); log('fire extinguished by water drop');
      }
      drawPaths(); updateStats();
    } else { r.fx+=dx/d*step; r.fz+=dz/d*step; }
    // carried victim rides below
    // altitude: cruise high, dip when idle over target handled by wait phases (kept simple)
    const targetY=5.2+Math.sin(performance.now()/600+r.x)*0.15;
    r.fy+=(targetY-r.fy)*Math.min(1,dt*3);
    r.mesh.grp.position.set(r.fx,r.fy,r.fz);
    if(r.carry!==null){
      const rec=victimMeshes.get(r.carry);
      if(rec) rec.grp.position.set(r.fx,r.fy-0.75,r.fz);
    }
  }
}
function extinguishFire(nx,ny){
  flameGroups=flameGroups.filter(f=>!(f.cell[0]===nx&&f.cell[1]===ny));
  smokeSys=smokeSys.filter(s=>!(s.cell[0]===nx&&s.cell[1]===ny));
  // rebuild fire visuals: easiest is to remove group children at that cell
  const [x,z]=cellXZ(nx,ny);
  for(let k=world.children.length-1;k>=0;k--){
    const o=world.children[k];
    if(o.isGroup&&Math.abs(o.position.x-x)<0.1&&Math.abs(o.position.z-z)<0.1&&o.position.y===0){
      // victim groups also sit at y=0 — only remove if it has flame cone: check userData
      if(o.userData.isFire) world.remove(o);
    }
  }
}
function updateStats(){
  $('stRescued').textContent=rescued;
  $('stSteps').textContent=steps;
  $('stCost').textContent=cost;
  $('stVictims').textContent=victims.filter(v=>!v.saved&&!v.carried).length;
}

// ---------- per-frame visuals ----------
function tickVisuals(dt,t){
  for(const f of flameGroups){
    f.t+=dt;
    const s=1+Math.sin(f.t*13)*0.12+Math.sin(f.t*29)*0.06;
    f.flame.scale.set(s,1+Math.sin(f.t*17)*0.18,s);
    f.core.scale.set(s,1+Math.cos(f.t*21)*0.15,s);
    f.glow.material.opacity=0.7+Math.sin(f.t*11)*0.2;
  }
  for(const s of smokeSys){
    const p=s.pts.geometry.attributes.position;
    for(let k=0;k<s.n;k++){
      let y=p.getY(k)+s.vel[k]*dt;
      if(y>5.5){ y=1.4; p.setX(k,(rnd()-0.5)*0.5); p.setZ(k,(rnd()-0.5)*0.5); }
      p.setY(k,y);
      p.setX(k,p.getX(k)+Math.sin(t/700+k)*dt*0.3);
    }
    p.needsUpdate=true;
  }
  for(const [,rec] of victimMeshes){
    if(rec.cargo) continue;
    const s=1+Math.sin(t/300)*0.12;
    rec.ring.scale.set(s,s,1);
    rec.body.position.y=0.5+Math.sin(t/400)*0.06;
  }
  fireLights.forEach((L,i)=>{ L.intensity=26+Math.sin(t/90+i*2)*8; });
}

// ---------- main loop ----------
const clock=new THREE.Clock();
function loop(){
  requestAnimationFrame(loop);
  const dt=Math.min(clock.getDelta(),0.05), t=performance.now();
  if(running) update(dt);
  tickVisuals(dt,t);
  controls.update();
  renderer.render(scene,camera);
}

// ---------- UI ----------
$('newCity').onclick=()=>{ genModel(); buildWorld(); log(`new city: ${victims.length} victims, ${shelters.length} shelters`); };
$('run').onclick=()=>{ running=!running; $('run').textContent=running?'Pause':'Run Rescue'; log(running?'rescue started':'paused'); };
$('stop').onclick=()=>{ running=false; $('run').textContent='Run Rescue'; genModel(); buildWorld(); };
$('showPath').onchange=drawPaths;
$('shadowTgl').onchange=e=>{ renderer.shadowMap.enabled=e.target.checked; moon.castShadow=e.target.checked; };
$('viewOrbit').onclick=()=>{ camera.position.set(27,25,27); controls.target.set(0,0,0); controls.autoRotate=true; };
$('viewTop').onclick=()=>{ camera.position.set(0,52,0.01); controls.target.set(0,0,0); controls.autoRotate=false; };
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

// ---------- boot ----------
genModel();
buildWorld();
log(`new city: ${victims.length} victims, ${shelters.length} shelters`);
if(new URLSearchParams(location.search).get('run')==='1'){
  for(let k=0;k<70;k++){ if(!victims.length) break; update(0.5); }
  running=true; $('run').textContent='Pause'; log('rescue started');
}
document.getElementById('loader').style.display='none';
clearTimeout(window.__bootTimer);
window.__city3d_booted=true;
loop();
