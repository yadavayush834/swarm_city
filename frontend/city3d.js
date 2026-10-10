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

// ---------- city model (same legend as sim/city.py + maps) ----------
// 0 road, 1 building, 2 rubble, 3 fire, 4 victim, 5 shelter, 6 park
let N = 20, CELL = 2, HALF = N*CELL/2;
function setWorldSize(n){ N=n; CELL=40/n; HALF=N*CELL/2; }
const ROAD=0, BLD=1, RUB=2, FIRE=3, VIC=4, SHEL=5, PARK=6;
let grid=[], robots=[], victims=[], shelters=[], fires=[];
let running=false, steps=0, cost=0, rescued=0;
// live backend link (?live=1 -> ws://host:8130, falls back to local sim)
const live={active:false,ws:null,seq:0,badge:$('liveBadge')};
function setLive(on){
  live.active=on;
  live.badge.textContent=on?'LIVE • BACKEND':'LOCAL SIM';
  live.badge.classList.toggle('live',on);
}
// weather + time of day
const rain={on:false,pts:null,vel:null,n:900};
const dn={t:0.78,auto:true,period:240};

function genModel(){
  seed = (Math.random()*1e9)|0;
  _giant=null;
  grid = Array.from({length:N},()=>Array(N).fill(BLD));
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){
    if(i%5===0||j%5===0) grid[i][j]=ROAD;
    else if(rnd()<0.08) grid[i][j]=PARK;
  }
  const free=()=>{ for(let k=0;k<300;k++){ const x=1+((rnd()*(N-2))|0), y=1+((rnd()*(N-2))|0); if(grid[x][y]===BLD||grid[x][y]===ROAD) return [x,y]; } return [2,2]; };
  shelters=[]; victims=[]; fires=[];
  [[1,1],[N-2,N-2],[1,N-2]].forEach(([x,y])=>{ grid[x][y]=SHEL; shelters.push({x,y}); });
  for(let k=0;k<14;k++){ const [x,y]=free(); if(grid[x][y]!==SHEL) grid[x][y]=RUB; }
  for(let k=0;k<10;k++){ const [x,y]=free(); if(grid[x][y]!==SHEL){ grid[x][y]=FIRE; fires.push([x,y]); } }
  for(let k=0;k<8;k++){ const [x,y]=free(); grid[x][y]=VIC; victims.push({x,y,id:k,carried:false,saved:false}); }
  steps=0; cost=0; rescued=0;
}
// scatter hazards onto free cells (roadsOnly keeps real-map streets intact;
// on real maps, only the giant connected component is used so every
// victim/fire is reachable by the drones)
let _giant=null;
function giantComponent(){
  const seen=new Set(); let best=new Set();
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){
    const k=i*N+j;
    if(seen.has(k)||!passable(i,j)) continue;
    const cur=new Set([k]), st=[[i,j]];
    seen.add(k);
    while(st.length){
      const [x,y]=st.pop();
      for(const [nx,ny] of neigh(x,y)){
        const kk=nx*N+ny;
        if(!seen.has(kk)){ seen.add(kk); cur.add(kk); st.push([nx,ny]); }
      }
    }
    if(cur.size>best.size) best=cur;
  }
  return best;
}
function scatter(kind,count,roadsOnly=false){
  if(roadsOnly&&!_giant) _giant=giantComponent();
  let placed=0,guard=0;
  while(placed<count&&guard<N*N*30){
    guard++;
    const x=1+((rnd()*(N-2))|0), y=1+((rnd()*(N-2))|0);
    if(roadsOnly&&!_giant.has(x*N+y)) continue;
    const ok=roadsOnly?grid[x][y]===ROAD:(grid[x][y]===BLD||grid[x][y]===ROAD);
    if(ok){ grid[x][y]=kind; placed++; }
  }
}
function ensureShelters(){
  let n=grid.flat().filter(v=>v===SHEL).length;
  for(const [x,y] of [[1,1],[N-2,N-2],[1,N-2]]){
    if(n>=3) break;
    if(grid[x][y]!==SHEL){ grid[x][y]=SHEL; n++; }
  }
}
function indexModel(){
  shelters=[];
  for(let i=0;i<N;i++) for(let j=0;j<N;j++) if(grid[i][j]===SHEL) shelters.push({x:i,y:j});
  victims=[];
  let k=0;
  for(let i=0;i<N;i++) for(let j=0;j<N;j++)
    if(grid[i][j]===VIC) victims.push({x:i,y:j,id:k++,carried:false,saved:false});
  fires=[];
  for(let i=0;i<N;i++) for(let j=0;j<N;j++) if(grid[i][j]===FIRE) fires.push([i,j]);
  steps=0; cost=0; rescued=0;
}
// load a real-map / exported grid (?map=maps/cp.json), then top up hazards
async function loadMap(url){
  const r=await fetch(url);
  if(!r.ok) throw new Error('http '+r.status);
  const m=await r.json();
  const n=m.n||Math.round(Math.sqrt(m.grid.length));
  if(!m.grid||m.grid.length!==n||m.grid[0].length!==n) throw new Error('bad grid');
  seed=(Math.random()*1e9)|0;
  _giant=null;
  setWorldSize(n);
  grid=m.grid.map(row=>row.slice());
  ensureShelters();
  const have=k=>grid.flat().filter(v=>v===k).length;
  scatter(VIC,Math.max(0,Math.round(N*N/50)-have(VIC)),true);
  scatter(FIRE,Math.max(0,Math.round(N*N/40)-have(FIRE)),true);
  scatter(RUB,Math.max(0,Math.round(N*N/28)-have(RUB)),true);
  indexModel();
  buildWorld();
  const place=(m.meta&&m.meta.place)||url;
  log(`loaded map ${place}: ${victims.length} victims, ${shelters.length} shelters`);
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

const hemi=new THREE.HemisphereLight(0x8fb4ff, 0x1a1430, 0.55);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xffd9a0, 1.15);
moon.position.set(-30,42,18);
moon.castShadow = true;
moon.shadow.mapSize.set(1024,1024);
moon.shadow.camera.left=-32; moon.shadow.camera.right=32;
moon.shadow.camera.top=32; moon.shadow.camera.bottom=-32;
scene.add(moon);
scene.add(new THREE.AmbientLight(0x334, 0.4));

// stars
let starsMat=null;
{
  const g=new THREE.BufferGeometry(), pts=[];
  for(let i=0;i<400;i++){ const t=rnd()*Math.PI*2, p=rnd()*Math.PI*0.45, r=220;
    pts.push(r*Math.cos(t)*Math.cos(p), r*Math.sin(p)+10, r*Math.sin(t)*Math.cos(p)); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts,3));
  starsMat=new THREE.PointsMaterial({color:0xaFC4ff,size:0.7,fog:false,transparent:true,opacity:0.8});
  scene.add(new THREE.Points(g, starsMat));
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
      const h=(2+rnd()*4.5)*CELL/2, m=sideMats[(rnd()*sideMats.length)|0];
      const b=new THREE.Mesh(new THREE.BoxGeometry(CELL*0.8,h,CELL*0.8),
        [m,m,roofMat,roofMat,m,m]);
      b.position.set(x,h/2,z); b.castShadow=true; b.receiveShadow=true; world.add(b);
      box(CELL*0.86,0.15,CELL*0.86,roofMat,x,0.07,z,false); // foundation
    } else if(v===PARK){
      box(CELL*0.9,0.12,CELL*0.9,parkMat,x,0.06,z,false);
      const BS=CELL/2;
      for(let k=0;k<2;k++){
        const tx=x+(rnd()-0.5)*1.2*BS, tz=z+(rnd()-0.5)*1.2*BS;
        const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.06*BS,0.09*BS,0.5*BS,6),trunkMat);
        trunk.position.set(tx,0.35*BS,tz); trunk.castShadow=true; world.add(trunk);
        const leaf=new THREE.Mesh(new THREE.ConeGeometry(0.42*BS,1.0*BS,7),leafMat);
        leaf.position.set(tx,1.0*BS,tz); leaf.castShadow=true; world.add(leaf);
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
  // street lamps along roads (density scales with map size)
  const poleMat=new THREE.MeshStandardMaterial({color:0x0f172a,roughness:0.7});
  const LS=Math.max(4,Math.round(N/5)), LO=0.7*CELL/2, PH=3*Math.max(0.6,CELL/2);
  for(let i=0;i<N;i+=LS) for(let j=0;j<N;j+=LS){
    for(const [lx,lz] of [[i,j]]){
      if(!passable(lx,lz)) continue;
      const [x,z]=cellXZ(lx,lz);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.07,PH,6),poleMat);
      pole.position.set(x+LO,PH/2,z+LO); pole.castShadow=true; world.add(pole);
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.12,8,8),
        new THREE.MeshBasicMaterial({color:0xffe9a8}));
      lamp.position.set(x+LO,PH+0.05,z+LO); world.add(lamp);
      glowSprite(0xffdf9e,1.6,x+LO,PH+0.05,z+LO).material.opacity=0.35;
    }
  }
  // fire point lights (pool of 4, reassigned to first fires)
  for(let k=0;k<Math.min(4,fires.length);k++){
    const L=new THREE.PointLight(0xff7a1a,30,14,1.8);
    const f=fires[k]; const [x,z]=cellXZ(f[0],f[1]); L.position.set(x,1.6,z);
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
  const spd=(2+($('speed').valueAsNumber||10)*0.9)*(rain.on?0.85:1);
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

// ---------- live backend link (?live=1 -> ws://host:8130) ----------
function liveSend(o){ if(live.ws&&live.ws.readyState===1) live.ws.send(JSON.stringify(o)); }
function liveConnect(){
  const url='ws://'+location.hostname+':8130';
  log('connecting to live backend '+url+' … (start it: python3 bridge/server.py)');
  let opened=false;
  const ws=new WebSocket(url);
  live.ws=ws;
  const giveUp=setTimeout(()=>{ if(!opened){ try{ws.close();}catch(e){} log('bridge unreachable — local sim'); } },3000);
  ws.onopen=()=>{
    opened=true; clearTimeout(giveUp); setLive(true);
    log('LIVE: streaming the real Python ai/* sim (A*, CSP, Kalman, fuzzy)');
    if(new URLSearchParams(location.search).get('run')==='1') liveSend({cmd:'run'});
  };
  ws.onmessage=ev=>{
    let m; try{ m=JSON.parse(ev.data); }catch(e){ return; }
    if(m.type==='map') liveApplyMap(m);
    else if(m.type==='state') liveApplyState(m);
  };
  ws.onclose=()=>{
    clearTimeout(giveUp);
    if(live.active){ setLive(false); log('bridge lost — back to local sim'); genModel(); buildWorld(); }
  };
  ws.onerror=()=>{ /* onclose handles fallback */ };
}
function liveApplyMap(m){
  if(m.n!==N) setWorldSize(m.n);
  grid=m.grid.map(r=>r.slice());
  indexModel();
  buildWorld();
  live.seq=0;
  log(`live map: ${victims.length} victims, ${shelters.length} shelters`);
}
function liveApplyState(m){
  // globals feed minimap + visuals uniformly in both modes
  victims=m.victims.map(v=>({x:v.x,y:v.y,id:v.id,carried:v.st==='carried',saved:false}));
  fires=m.fires.map(f=>[f[0],f[1]]);
  // fire visuals reconcile
  const keep=new Set(fires.map(f=>f[0]*1000+f[1]));
  for(let k=flameGroups.length-1;k>=0;k--){
    const f=flameGroups[k];
    if(!keep.has(f.cell[0]*1000+f.cell[1])){
      world.remove(f.grp);
      flameGroups.splice(k,1);
      const si=smokeSys.findIndex(s=>s.cell[0]===f.cell[0]&&s.cell[1]===f.cell[1]);
      if(si>=0) smokeSys.splice(si,1);
      grid[f.cell[0]][f.cell[1]]=ROAD;
    }
  }
  // victim visuals reconcile
  const ids=new Set(victims.map(v=>v.id));
  for(const [id,rec] of [...victimMeshes]){
    const v=victims.find(v=>v.id===id);
    if(!v){ world.remove(rec.grp); victimMeshes.delete(id); }
    else if(v.carried&&!rec.cargo){ rec.cargo=true; rec.grp.scale.setScalar(0.8); }
  }
  // drones (server ids match row-major shelter order, same as indexModel)
  for(const sd of m.drones){
    const r=robots[sd.id];
    if(!r) continue;
    const [tx,tz]=cellXZ(sd.fx,sd.fy);
    r.sv={x:tx,z:tz};
    r.path=(sd.path||[]).map(p=>[p[0],p[1]]);
    r.carry=sd.carry; r.target=sd.target;
    r.x=sd.gx; r.y=sd.gy;
  }
  drawPaths();
  rescued=m.stats.rescued; steps=m.stats.steps; cost=m.stats.cost;
  updateStats();
  $('stVictims').textContent=m.stats.left;
  if(typeof m.running==='boolean'&&m.running!==running){
    running=m.running; $('run').textContent=running?'Pause':'Run Rescue';
  }
  for(const [seq,msg] of (m.events||[])){
    if(seq>live.seq){ live.seq=seq; log(msg); }
  }
}
// smooth-follow server drone positions (Kalman-filtered on the backend)
function liveInterpolate(dt){
  for(const r of robots){
    for(const rot of r.mesh.rotors) rot.rotation.y+=dt*30;
    if(!r.sv) continue;
    const dx=r.sv.x-r.fx, dz=r.sv.z-r.fz, d=Math.hypot(dx,dz);
    if(d>1e-4){
      r.mesh.grp.rotation.y=Math.atan2(dx,dz);
      const s=Math.min(d,14*dt);
      r.fx+=dx/d*s; r.fz+=dz/d*s;
    }
    const ty=5.2+Math.sin(performance.now()/600+r.x)*0.15;
    r.fy+=(ty-r.fy)*Math.min(1,dt*3);
    r.mesh.grp.position.set(r.fx,r.fy,r.fz);
    if(r.carry!==null){
      const rec=victimMeshes.get(r.carry);
      if(rec) rec.grp.position.set(r.fx,r.fy-0.75,r.fz);
    }
  }
}

// ---------- weather: rain + day/night cycle ----------
function buildRain(){
  const pos=new Float32Array(rain.n*3); rain.vel=new Float32Array(rain.n);
  for(let k=0;k<rain.n;k++){
    pos[k*3]=(rnd()-0.5)*70; pos[k*3+1]=rnd()*26; pos[k*3+2]=(rnd()-0.5)*70;
    rain.vel[k]=22+rnd()*10;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  rain.pts=new THREE.Points(g,new THREE.PointsMaterial({color:0x9db8dd,size:0.16,transparent:true,opacity:0.55,depthWrite:false}));
  rain.pts.visible=false; rain.pts.frustumCulled=false;
  scene.add(rain.pts);
}
function tickRain(dt){
  if(!rain.on||!rain.pts) return;
  const p=rain.pts.geometry.attributes.position;
  for(let k=0;k<rain.n;k++){
    let y=p.getY(k)-rain.vel[k]*dt;
    if(y<0){ y=26; p.setX(k,(rnd()-0.5)*70); p.setZ(k,(rnd()-0.5)*70); }
    p.setY(k,y);
  }
  p.needsUpdate=true;
}
const SKY_NIGHT=new THREE.Color(0x0b1020), SKY_DAY=new THREE.Color(0x8fc3e8);
const _sky=new THREE.Color();
function applyDayNight(dt){
  if(dn.auto) dn.t=(dn.t+dt/dn.period)%1;
  const dl=clamp(Math.sin(dn.t*Math.PI*2-Math.PI/2)*0.5+0.5,0,1); // 0 night .. 1 noon
  _sky.lerpColors(SKY_NIGHT,SKY_DAY,dl);
  scene.background.copy(_sky); scene.fog.color.copy(_sky);
  hemi.intensity=0.35+0.65*dl;
  moon.intensity=0.25+1.1*Math.max(dl,0.18);
  moon.color.setHex(dl>0.5?0xfff4e0:0xffd9a0);
  const a=dn.t*Math.PI*2;
  moon.position.set(Math.cos(a)*35,Math.sin(a)*40+8,18);
  starsMat.opacity=0.85*(1-dl);
}

// ---------- tactical minimap ----------
const mm=$('minimap'), mmc=mm.getContext('2d');
let mmAcc=1;
function drawMinimap(){
  const S=mm.width, c=S/N;
  mmc.fillStyle='#070c22'; mmc.fillRect(0,0,S,S);
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){
    const v=grid[i]&&grid[i][j];
    mmc.fillStyle=v===ROAD?'#1a2340':v===BLD?'#3b4a74':v===RUB?'#52525b':v===PARK?'#14532d':v===SHEL?'#14532d':'#1a2340';
    mmc.fillRect(j*c,i*c,Math.ceil(c),Math.ceil(c));
  }
  for(const [x,y] of fires){ mmc.fillStyle='#f97316'; mmc.fillRect(y*c,x*c,Math.ceil(c),Math.ceil(c)); }
  for(const v of victims){
    if(v.carried||v.saved) continue;
    mmc.fillStyle='#ef4444'; mmc.beginPath();
    mmc.arc((v.y+0.5)*c,(v.x+0.5)*c,Math.max(1.5,c*0.4),0,7); mmc.fill();
  }
  for(const s of shelters){ mmc.strokeStyle='#22c55e'; mmc.strokeRect(s.y*c+0.5,s.x*c+0.5,c-1,c-1); }
  // drones use grid coords (r.x/r.y) in both local and live modes
  mmc.fillStyle='#22d3ee';
  for(const r of robots){ mmc.beginPath(); mmc.arc((r.y+0.5)*c,(r.x+0.5)*c,Math.max(2,c*0.45),0,7); mmc.fill(); }
  mmc.strokeStyle='#fff'; mmc.lineWidth=1;
  for(const r of robots){ mmc.beginPath(); mmc.arc((r.y+0.5)*c,(r.x+0.5)*c,Math.max(3,c*0.6),0,7); mmc.stroke(); }
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
  if(live.active) liveInterpolate(dt);
  else if(running) update(dt);
  tickRain(dt);
  applyDayNight(dt);
  mmAcc+=dt; if(mmAcc>0.5){ mmAcc=0; drawMinimap(); }
  tickVisuals(dt,t);
  controls.update();
  renderer.render(scene,camera);
}

// ---------- UI ----------
$('newCity').onclick=()=>{
  if(live.active){ liveSend({cmd:'newcity'}); return; }
  genModel(); buildWorld(); log(`new city: ${victims.length} victims, ${shelters.length} shelters`);
};
$('run').onclick=()=>{
  if(live.active){ liveSend({cmd:running?'pause':'run'}); return; }
  running=!running; $('run').textContent=running?'Pause':'Run Rescue'; log(running?'rescue started':'paused');
};
$('stop').onclick=()=>{
  if(live.active){ liveSend({cmd:'pause'}); return; }
  running=false; $('run').textContent='Run Rescue'; genModel(); buildWorld();
};
$('algo').onchange=e=>{ if(live.active) liveSend({cmd:'set-algo',algo:e.target.value}); };
$('speed').onchange=e=>{ if(live.active) liveSend({cmd:'set-speed',speed:e.target.valueAsNumber}); };
$('rainTgl').onclick=()=>{
  rain.on=!rain.on; if(rain.pts) rain.pts.visible=rain.on;
  $('rainTgl').textContent='Rain: '+(rain.on?'on':'off');
  log(rain.on?'rain: local drones fly 15% slower':'rain stopped');
};
$('dnTgl').onclick=()=>{ dn.auto=!dn.auto; $('dnTgl').textContent='Day/night: '+(dn.auto?'on':'off'); };
$('loadMapBtn').onclick=()=>{
  if(live.active){ log('maps are local-mode: reload without ?live to use them'); return; }
  const u=($('mapUrl').value||'').trim();
  if(u) loadMap(u).catch(e=>log('map load failed: '+u));
};
$('showPath').onchange=drawPaths;
$('shadowTgl').onchange=e=>{ renderer.shadowMap.enabled=e.target.checked; moon.castShadow=e.target.checked; };
$('viewOrbit').onclick=()=>{ camera.position.set(27,25,27); controls.target.set(0,0,0); controls.autoRotate=true; };
$('viewTop').onclick=()=>{ camera.position.set(0,52,0.01); controls.target.set(0,0,0); controls.autoRotate=false; };
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

// ---------- boot ----------
buildRain();
genModel();
buildWorld();
log(`new city: ${victims.length} victims, ${shelters.length} shelters`);
const Q=new URLSearchParams(location.search);
if(Q.get('dn')){ const p=parseFloat(Q.get('dn')); if(!isNaN(p)) dn.t=((p%1)+1)%1; }
if(Q.get('rain')==='1'){ rain.on=true; if(rain.pts) rain.pts.visible=true; $('rainTgl').textContent='Rain: on'; }
if(Q.get('map')&&!Q.has('live')) loadMap(Q.get('map')).catch(e=>log('map load failed, using generated city'));
if(Q.has('live')) liveConnect();
else if(Q.get('run')==='1'){
  for(let k=0;k<70;k++){ if(!victims.length) break; update(0.5); }
  running=true; $('run').textContent='Pause'; log('rescue started');
}
document.getElementById('loader').style.display='none';
clearTimeout(window.__bootTimer);
window.__city3d_booted=true;
loop();
