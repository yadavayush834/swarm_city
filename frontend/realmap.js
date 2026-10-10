// OMNIMIND Real Map — Google-Maps-style rescue over true OSM streets.
// Base tiles: CARTO Voyager (OSM data). Overlay: live A*/CSP drone sim.
// No autostart: map loads idle, you press Run Rescue.
if(typeof L==='undefined') throw new Error('leaflet missing');
const $ = id => document.getElementById(id);
const logEl = $('log');
function log(m){ const d=document.createElement('div'); d.textContent=m; logEl.prepend(d); while(logEl.children.length>60) logEl.lastChild.remove(); }
let seed = 11;
function rnd(){ seed = (seed*1664525 + 1013904223) >>> 0; return seed/4294967296; }

// legend: 0 road, 1 building, 2 rubble, 3 fire, 4 victim, 5 shelter, 6 park
const ROAD=0, BLD=1, RUB=2, FIRE=3, VIC=4, SHEL=5, PARK=6;
let N=20, grid=[], bbox=null, place='';
let robots=[], victims=[], shelters=[];
let running=false, steps=0, cost=0, rescued=0;

const map = L.map('rmap', {zoomControl:true, attributionControl:true});
const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  {maxZoom:19, attribution:'© OpenStreetMap contributors, Esri, HERE, Garmin'});
const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  {maxZoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'});
let tilesWarned=false;
esri.on('tileerror', ()=>{
  if(!tilesWarned){ tilesWarned=true; map.removeLayer(esri); osm.addTo(map); log('street tiles blocked — OSM fallback'); }
});
esri.addTo(map);

function cellLatLng(fx, fy){ // float grid coords -> [lat, lon]
  const [s,w,n,e] = bbox;
  return [n - ((fx+0.5)/N)*(n-s), w + ((fy+0.5)/N)*(e-w)];
}
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
function giantComponent(){
  const seen=new Set(); let best=new Set();
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){
    const k=i*N+j;
    if(seen.has(k)||!passable(i,j)) continue;
    const cur=new Set([k]), st=[[i,j]]; seen.add(k);
    while(st.length){ const [x,y]=st.pop();
      for(const [nx,ny] of neigh(x,y)){ const kk=nx*N+ny;
        if(!seen.has(kk)){ seen.add(kk); cur.add(kk); st.push([nx,ny]); } } }
    if(cur.size>best.size) best=cur;
  }
  return best;
}

function divIcon(cls, html, color){
  return L.divIcon({className:'', html:`<div class="mk ${cls}"${color?` style="--c:${color}"`:''}>${html}</div>`, iconSize:null});
}
function clearLayers(){ map.eachLayer(l=>{ if(l!==esri&&l!==osm) map.removeLayer(l); }); }

function wipeHazards(){
  for(let i=0;i<N;i++) for(let j=0;j<N;j++)
    if(grid[i][j]===VIC||grid[i][j]===FIRE||grid[i][j]===RUB) grid[i][j]=ROAD;
}
// top up hazards to density targets (keeps hazards embedded in map files)
function topUpHazards(){
  const have=k=>{ let c=0; for(let i=0;i<N;i++) for(let j=0;j<N;j++) if(grid[i][j]===k) c++; return c; };
  const giant=giantComponent();
  const put=(kind,target)=>{
    let need=target-have(kind),guard=0;
    while(need>0&&guard<N*N*40){
      guard++;
      const x=1+((rnd()*(N-2))|0), y=1+((rnd()*(N-2))|0);
      if(grid[x][y]===ROAD&&giant.has(x*N+y)){ grid[x][y]=kind; need--; }
    }
  };
  put(VIC,Math.round(N*N/50)); put(FIRE,Math.round(N*N/40)); put(RUB,Math.round(N*N/28));
  indexHazards();
  steps=0; cost=0; rescued=0;
}
function indexHazards(){
  victims=[]; let k=0;
  for(let i=0;i<N;i++) for(let j=0;j<N;j++)
    if(grid[i][j]===VIC) victims.push({x:i,y:j,id:k++,carried:false,saved:false,marker:null});
}
function rebuildMarkers(){
  clearLayers();
  for(const s of shelters)
    L.marker(cellLatLng(s.x,s.y), {icon:divIcon('shel','H'), interactive:false}).addTo(map);
  for(const v of victims){
    v.marker=L.marker(cellLatLng(v.x,v.y), {icon:divIcon('vic','!'), interactive:false}).addTo(map);
  }
  for(let i=0;i<N;i++) for(let j=0;j<N;j++)
    if(grid[i][j]===FIRE)
      L.marker(cellLatLng(i,j), {icon:divIcon('fire','F'), interactive:false}).addTo(map);
  for(const r of robots){
    r.marker=L.marker(cellLatLng(r.fx,r.fy), {icon:divIcon('drone','R',r.color), zIndexOffset:500}).addTo(map);
    r.line=L.polyline([], {color:r.color, weight:3, opacity:0.9}).addTo(map);
  }
  updateStats();
}
function spawnDrones(){
  const colors=['#38bdf8','#f472b6','#a3e635'];
  robots=shelters.slice(0,3).map((s,i)=>({id:i,x:s.x,y:s.y,fx:s.x,fy:s.y,
    path:[],target:null,carry:null,wait:0,color:colors[i%3],marker:null,line:null}));
}

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
    if(bv){
      r.target=bv.id; r.path=bp.slice(1);
      log(`drone ${r.id} -> victim ${bv.id} (${algo}, cost ${bd})`);
      drawPath(r);
    }
  }
}
function drawPath(r){
  if(!r.line) return;
  if($('showPath').checked&&r.path.length)
    r.line.setLatLngs([cellLatLng(r.fx,r.fy),...r.path.map(([x,y])=>cellLatLng(x,y))]);
  else r.line.setLatLngs([]);
}
function nearestShelter(r){
  return shelters.reduce((a,b)=>mh([r.x,r.y],[a.x,a.y])<mh([r.x,r.y],[b.x,b.y])?a:b);
}
function update(dt){
  assign();
  const spd=(1+($('speed').valueAsNumber||10)*0.45);
  for(const r of robots){
    if(r.wait>0){ r.wait-=dt; continue; }
    if(!r.path.length){
      const v=victims.find(v=>v.id===r.target&&!v.saved);
      if(v&&!v.carried&&r.x===v.x&&r.y===v.y&&r.carry===null){
        v.carried=true; if(v.marker) map.removeLayer(v.marker);
        r.carry=v.id; r.target=null; r.wait=0.8;
        const s=nearestShelter(r);
        const {path}=search([r.x,r.y],[s.x,s.y],$('algo').value);
        r.path=path.slice(1); drawPath(r);
        log(`picked victim ${v.id}, heading to shelter`);
      } else if(r.carry!==null&&shelters.some(s=>s.x===r.x&&s.y===r.y)){
        victims=victims.filter(v=>v.id!==r.carry);
        log(`RESCUED victim ${r.carry}`);
        r.carry=null; rescued++;
        if(!victims.length){ log('ALL VICTIMS RESCUED'); running=false; $('run').textContent='Run Rescue'; }
        updateStats();
      }
      continue;
    }
    const [nx,ny]=r.path[0];
    const dx=nx-r.fx, dy=ny-r.fy, d=Math.hypot(dx,dy), step=spd*dt;
    if(d<=step){ r.fx=nx; r.fy=ny; r.x=nx; r.y=ny; r.path.shift(); cost+=tileCost(nx,ny); steps++; drawPath(r); updateStats(); }
    else { r.fx+=dx/d*step; r.fy+=dy/d*step; }
    r.marker.setLatLng(cellLatLng(r.fx,r.fy));
  }
}
function updateStats(){
  $('stRescued').textContent=rescued;
  $('stSteps').textContent=steps;
  $('stCost').textContent=cost;
  $('stVictims').textContent=victims.filter(v=>!v.saved&&!v.carried).length;
}

let lastT=performance.now();
function loop(){
  requestAnimationFrame(loop);
  const now=performance.now(), dt=Math.min((now-lastT)/1000,0.05);
  lastT=now;
  if(running) update(dt);
}

async function loadMap(url){
  document.getElementById('loader').style.display='flex';
  try{
    const r=await fetch(url);
    if(!r.ok) throw new Error('http '+r.status);
    const m=await r.json();
    const n=m.n||Math.round(Math.sqrt(m.grid.length));
    if(!m.grid||m.grid.length!==n) throw new Error('bad grid');
    running=false; $('run').textContent='Run Rescue';
    N=n; grid=m.grid.map(row=>row.slice());
    bbox=m.meta&&m.meta.bbox?[m.meta.bbox[0],m.meta.bbox[1],m.meta.bbox[2],m.meta.bbox[3]]:[28.63,77.21,28.64,77.22];
    place=(m.meta&&m.meta.place)||url;
    shelters=[];
    for(let i=0;i<N;i++) for(let j=0;j<N;j++) if(grid[i][j]===SHEL) shelters.push({x:i,y:j});
    if(shelters.length<3)
      for(const [x,y] of [[1,1],[N-2,N-2],[1,N-2]])
        if(shelters.length<3&&grid[x][y]!==SHEL){ grid[x][y]=SHEL; shelters.push({x,y}); }
    topUpHazards();
    spawnDrones();
    rebuildMarkers();
    map.fitBounds([[bbox[0],bbox[1]],[bbox[2],bbox[3]]]);
    log(`loaded ${place}: ${victims.length} victims — press Run Rescue`);
  }catch(e){ log('map load failed: '+url); }
  document.getElementById('loader').style.display='none';
}

$('run').onclick=()=>{ running=!running; $('run').textContent=running?'Pause':'Run Rescue'; log(running?'rescue started':'paused'); };
$('stop').onclick=()=>{ running=false; $('run').textContent='Run Rescue'; wipeHazards(); topUpHazards(); spawnDrones(); rebuildMarkers(); };
$('newCity').onclick=()=>{ running=false; $('run').textContent='Run Rescue'; wipeHazards(); topUpHazards(); spawnDrones(); rebuildMarkers(); log('new hazards scattered — press Run Rescue'); };
$('showPath').onchange=()=>robots.forEach(drawPath);
$('mapSel').onchange=e=>loadMap(e.target.value);
// accent theme switcher (persisted)
(function(){
  const dots=[...document.querySelectorAll('.tdot')];
  const apply=t=>{ document.body.dataset.theme=t; try{localStorage.setItem('swarm-theme',t);}catch(e){}
    dots.forEach(x=>x.classList.toggle('active',x.dataset.t===t)); };
  dots.forEach(b=>b.onclick=()=>apply(b.dataset.t));
  let saved='midnight'; try{ saved=localStorage.getItem('swarm-theme')||'midnight'; }catch(e){}
  apply(saved);
})();
(function boot(){
  const q=new URLSearchParams(location.search);
  const url=q.get('map')||($('mapSel')&&$('mapSel').value)||'maps/olddelhi.json';
  if($('mapSel')) $('mapSel').value=url;
  loadMap(url).then(loop);
})();
