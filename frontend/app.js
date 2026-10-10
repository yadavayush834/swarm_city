// OMNIMIND Swarm City — real animated city + rescue sim (no deps)
const N = 20, TILE = 640 / N;
const cv = document.getElementById('city'), ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);
const logEl = $('log');
function log(m){ const d=document.createElement('div'); d.textContent=m; logEl.prepend(d); }

// seeded rng
let seed = 7;
function rnd(){ seed = (seed*1664525 + 1013904223) >>> 0; return seed/4294967296; }

let grid, robots, victims, shelters, running=false, animT=0, steps=0, cost=0, rescued=0;

function genCity(){
  seed = (Math.random()*1e9)|0;
  // 0 road, 1 building, 2 rubble, 3 fire, 4 victim, 5 shelter, 6 park
  grid = Array.from({length:N},()=>Array(N).fill(1));
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){
    if(i%5===0 || j%5===0) grid[i][j]=0; // roads
    else if(rnd()<0.08) grid[i][j]=6;
  }
  const free = ()=>{ for(let k=0;k<200;k++){ const x=1+((rnd()*(N-2))|0), y=1+((rnd()*(N-2))|0); if(grid[x][y]===1||grid[x][y]===0) return [x,y]; } return [1,1]; };
  shelters=[]; victims=[];
  [[1,1],[N-2,N-2],[1,N-2]].forEach(([x,y])=>{ grid[x][y]=5; shelters.push({x,y}); });
  for(let k=0;k<14;k++){ const [x,y]=free(); if(grid[x][y]!==5) grid[x][y]=2; }
  for(let k=0;k<10;k++){ const [x,y]=free(); if(grid[x][y]!==5) grid[x][y]=3; }
  for(let k=0;k<8;k++){ const [x,y]=free(); grid[x][y]=4; victims.push({x,y,id:k,saved:false}); }
  robots = shelters.map((s,i)=>({x:s.x,y:s.y,path:[],target:null,carry:null,color:['#38bdf8','#f472b6','#a3e635'][i%3]}));
  steps=0;cost=0;rescued=0; updateStats();
  $('stVictims').textContent=victims.length;
  log(`new city: ${victims.length} victims, ${shelters.length} shelters`);
}

function passable(x,y){ return x>=0&&y>=0&&x<N&&y<N&&grid[x][y]!==1&&grid[x][y]!==2; }
function tileCost(x,y){ return grid[x][y]===3?5:1; }
function neigh(x,y){ const o=[]; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if(passable(x+dx,y+dy)) o.push([x+dx,y+dy]); return o; }
function h(a,b){ return Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]); }

function search(start, goal, algo){
  const key = p=>p[0]*N+p[1];
  if(algo==='bfs'){
    const q=[[start,[start]]], seen=new Set([key(start)]);
    while(q.length){ const [n,path]=q.shift(); if(n[0]===goal[0]&&n[1]===goal[1]) return {path,cost:path.length};
      for(const nb of neigh(n[0],n[1])) if(!seen.has(key(nb))){seen.add(key(nb)); q.push([nb,path.concat([nb])]);} }
    return {path:[],cost:0};
  }
  // A*/UCS/Greedy
  const open=[[0,0,start,[start]]]; const best={[key(start)]:0};
  const hw = algo==='ucs'?0:1, gw = algo==='greedy'?0:1;
  while(open.length){
    open.sort((a,b)=>a[0]-b[0]);
    const [f,g,n,path]=open.shift();
    if(n[0]===goal[0]&&n[1]===goal[1]) return {path,cost:g};
    for(const nb of neigh(n[0],n[1])){
      const ng=g+tileCost(nb[0],nb[1])*gw;
      const k=key(nb);
      if(!(k in best)||ng<best[k]){best[k]=ng; open.push([ng+h(nb,goal)*hw,ng,nb,path.concat([nb])]);}
    }
  }
  return {path:[],cost:0};
}

// CSP: assign nearest free victim to each idle robot (min-conflict greedy)
function assign(){
  const algo=$('algo').value;
  for(const r of robots){
    if(r.path.length||r.carry!==null) continue;
    let bv=null,bd=1e9,bp=[];
    for(const v of victims){
      if(v.saved||robots.some(o=>o!==r&&o.target===v.id)) continue;
      const {path,cost:c}=search([r.x,r.y],[v.x,v.y],algo);
      if(path.length&&c<bd){bd=c;bv=v;bp=path;}
    }
    if(bv){ r.target=bv.id; r.path=bp.slice(1); log(`robot -> victim ${bv.id} (${algo}, cost ${bd})`); }
  }
}

function stepSim(){
  assign();
  for(const r of robots){
    if(!r.path.length){
      // at victim? pick up. at shelter? drop.
      const v=victims.find(v=>v.id===r.target&&!v.saved);
      if(v&&r.x===v.x&&r.y===v.y&&!r.carry){ r.carry=v.id; v.saved='carried'; r.target=null;
        const s=shelters.reduce((a,b)=>h([r.x,r.y],[a.x,a.y])<h([r.x,r.y],[b.x,b.y])?a:b);
        const {path}=search([r.x,r.y],[s.x,s.y],$('algo').value); r.path=path.slice(1); log(`picked victim ${v.id}, heading to shelter`); }
      else if(r.carry!==null){
        const onShel=shelters.some(s=>s.x===r.x&&s.y===r.y);
        if(onShel){ const v2=victims.find(v=>v.id===r.carry); if(v2) v2.saved=true; log(`RESCUED victim ${r.carry}`); r.carry=null; rescued++; grid[r.x][r.y]=5; }
      }
      continue;
    }
    const [nx,ny]=r.path.shift(); cost+=tileCost(nx,ny); steps++;
    r.x=nx;r.y=ny;
    if(grid[nx][ny]===3&&Math.random()<0.3){ grid[nx][ny]=0; log('fire extinguished'); }
  }
  victims=victims.filter(v=>v.saved!==true);
  $('stVictims').textContent=victims.filter(v=>v.saved!=='carried').length;
  updateStats();
  if(!victims.length){ log('ALL VICTIMS RESCUED'); running=false; $('run').textContent='Run Rescue'; }
}

function updateStats(){ $('stRescued').textContent=rescued; $('stSteps').textContent=steps; $('stCost').textContent=cost; }

function draw(t){
  ctx.clearRect(0,0,640,640);
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){
    const x=j*TILE,y=i*TILE,v=grid[i][j];
    if(v===0){ ctx.fillStyle='#1a2340'; ctx.fillRect(x,y,TILE,TILE);
      ctx.strokeStyle='#2b3a68'; ctx.setLineDash([4,4]); ctx.beginPath();
      ctx.moveTo(x+TILE/2,y); ctx.lineTo(x+TILE/2,y+TILE); ctx.moveTo(x,y+TILE/2); ctx.lineTo(x+TILE,y+TILE/2); ctx.stroke(); ctx.setLineDash([]); }
    else if(v===1){ ctx.fillStyle='#26314f'; ctx.fillRect(x+1,y+1,TILE-2,TILE-2);
      ctx.fillStyle='#3b4a74'; for(let w=0;w<3;w++) for(let k=0;k<3;k++) ctx.fillRect(x+5+w*8,y+5+k*8,4,4); }
    else if(v===6){ ctx.fillStyle='#14532d'; ctx.fillRect(x,y,TILE,TILE); }
    else if(v===2){ ctx.fillStyle='#27272a'; ctx.fillRect(x,y,TILE,TILE); ctx.fillStyle='#52525b';
      ctx.fillRect(x+4,y+8,8,6); ctx.fillRect(x+14,y+14,10,7); }
    else if(v===3){ const f=Math.sin(t/120+i+j)*4; ctx.fillStyle='#7c2d12'; ctx.fillRect(x,y,TILE,TILE);
      ctx.fillStyle='#f97316'; ctx.beginPath(); ctx.arc(x+TILE/2,y+TILE/2,9+f*.4,0,7); ctx.fill();
      ctx.fillStyle='#fde047'; ctx.beginPath(); ctx.arc(x+TILE/2,y+TILE/2,4,0,7); ctx.fill(); }
    else if(v===4){ ctx.fillStyle='#0f172a'; ctx.fillRect(x,y,TILE,TILE);
      const p=6+Math.sin(t/200)*2; ctx.fillStyle='#ef4444'; ctx.beginPath(); ctx.arc(x+TILE/2,y+TILE/2,p,0,7); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center'; ctx.fillText('!',x+TILE/2,y+TILE/2+4); }
    else if(v===5){ ctx.fillStyle='#052e16'; ctx.fillRect(x,y,TILE,TILE); ctx.fillStyle='#22c55e';
      ctx.font='bold 14px sans-serif'; ctx.textAlign='center'; ctx.fillText('H',x+TILE/2,y+TILE/2+5); }
  }
  if($('showPath').checked) for(const r of robots){
    if(r.path.length>1){ ctx.strokeStyle=r.color; ctx.lineWidth=2; ctx.beginPath();
      ctx.moveTo(r.y*TILE+TILE/2,r.x*TILE+TILE/2);
      for(const [px,py] of r.path) ctx.lineTo(py*TILE+TILE/2,px*TILE+TILE/2);
      ctx.stroke(); }
  }
  for(const r of robots){
    const x=r.y*TILE+TILE/2,y=r.x*TILE+TILE/2;
    ctx.fillStyle=r.color; ctx.beginPath(); ctx.arc(x,y,9,0,7); ctx.fill();
    ctx.fillStyle='#0b1020'; ctx.font='bold 10px sans-serif'; ctx.textAlign='center'; ctx.fillText(r.carry!==null?'V':'R',x,y+3);
  }
}

function loop(t){ draw(t||0); if(running){ animT++; const sp=21-$('speed').value; if(animT%sp===0) stepSim(); } requestAnimationFrame(loop); }

$('newCity').onclick=()=>{ genCity(); };
$('run').onclick=()=>{ running=!running; $('run').textContent=running?'Pause':'Run Rescue'; log(running?'rescue started':'paused'); };
$('stop').onclick=()=>{ running=false; $('run').textContent='Run Rescue'; genCity(); };
genCity(); requestAnimationFrame(loop);
// autostart for screenshots / demos: open index.html?run=1
if(new URLSearchParams(location.search).get('run')==='1'){
  setTimeout(()=>{ if(!$('run')) return; $('run').click(); }, 400);
}
