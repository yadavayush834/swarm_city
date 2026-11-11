export function randomSource(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const key=([x,z])=>`${x},${z}`;
const distance=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
export const SCENARIOS={riverside:{name:'Riverside district',description:'Mixed city blocks, river crossings and open parks.',victims:12,fires:5},downtown:{name:'Downtown response',description:'Dense urban blocks and a larger rescue operation.',victims:18,fires:8},parkland:{name:'Parkland evacuation',description:'Open green spaces with scattered rescue objectives.',victims:10,fires:3}};
export function createCity(seed=42,scenario='riverside'){
 const rng=randomSource(seed),n=26,config=SCENARIOS[scenario]||SCENARIOS.riverside;
 const grid=Array.from({length:n},(_,z)=>Array.from({length:n},(_,x)=>{if(scenario==='riverside'&&x>=20&&x<=22)return z%5===0?0:2;return x%5===0||z%5===0||x===n-1||z===n-1?0:1;}));
 const stations=[[0,0],[25,0],[0,25],[25,25]],available=[];
 for(let z=0;z<n;z++)for(let x=0;x<n;x++)if(grid[z][x]===0&&!stations.some(s=>distance(s,[x,z])<4))available.push([x,z]);
 for(let i=available.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[available[i],available[j]]=[available[j],available[i]];}
 const victims=available.splice(0,config.victims).map((p,i)=>({id:i+1,x:p[0],z:p[1],state:'waiting',drone:null}));
 const fires=available.splice(0,config.fires).map((p,i)=>({id:i,x:p[0],z:p[1]}));
 const blocks=[];for(let z=0;z<25;z+=5)for(let x=0;x<25;x+=5){if(scenario==='riverside'&&x===20)continue;blocks.push({x,z,park:rng()<(scenario==='parkland'?.48:.16),height:2+rng()*(scenario==='downtown'?8:5),style:Math.floor(rng()*4)});}
 return {n,seed,scenario,grid,stations,victims,fires,blocks};
}
export function findRoute(city,start,goal,algorithm='astar'){
 if(!['astar','bfs','ucs','greedy'].includes(algorithm))throw Error('Unknown algorithm');
 const {grid,n,fires}=city;
 const walk=p=>p[0]>=0&&p[1]>=0&&p[0]<n&&p[1]<n&&grid[p[1]][p[0]]===0;
 if(!walk(start)||!walk(goal))return{path:[],cost:Infinity,expanded:0};
 const hazard=p=>1+fires.reduce((v,f)=>v+(distance([f.x,f.z],p)<=1?5:0),0);
 const open=[{p:start,g:0,score:0}],best=new Map([[key(start),0]]),parents=new Map(),closed=new Set();let expanded=0;
 while(open.length){if(algorithm!=='bfs')open.sort((a,b)=>a.score-b.score);const cur=open.shift(),k=key(cur.p);if(closed.has(k))continue;closed.add(k);expanded++;
  if(k===key(goal)){const path=[goal];let step=k;while(parents.has(step)){const p=parents.get(step);path.unshift(p);step=key(p);}return{path,cost:path.slice(1).reduce((sum,p)=>sum+hazard(p),0),expanded};}
  for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const p=[cur.p[0]+dx,cur.p[1]+dz];if(!walk(p)||closed.has(key(p)))continue;const g=cur.g+(algorithm==='bfs'?1:hazard(p));if(g>=(best.get(key(p))??Infinity))continue;best.set(key(p),g);parents.set(key(p),cur.p);let score=algorithm==='greedy'?distance(p,goal):g+(algorithm==='astar'?distance(p,goal):0);open.push({p,g,score});}
 }
 return{path:[],cost:Infinity,expanded};
}
export class Mission{
 constructor(seed=42,scenario='riverside'){this.reset(seed,scenario);}
 reset(seed=this.city?.seed??42,scenario=this.city?.scenario??'riverside'){
  this.city=createCity(seed,scenario);this.algorithm='astar';this.speed=1;this.weather='clear';this.status='standby';this.elapsed=0;this.distance=0;this.routeCost=0;this.expanded=0;this.rescued=0;this.events=[];this.eventId=0;
  this.drones=this.city.stations.map((p,i)=>({id:i+1,name:`Drone ${String(i+1).padStart(2,'0')}`,x:p[0],z:p[1],gx:p[0],gz:p[1],home:p,battery:100,state:'ready',path:[],route:[],routeIndex:0,target:null,carrying:null,saved:0,distance:0,heading:0,wait:0}));
  this.log('Fleet ready. Waiting for deployment.','system');
 }
 log(message,type='info'){this.events.unshift({id:++this.eventId,time:this.elapsed,message,type});this.events=this.events.slice(0,100);}
 start(){if(this.status==='complete')return;this.status='running';this.log(this.elapsed?'Mission resumed.':'Mission started. Fleet deployed.');}
 pause(){if(this.status==='running'){this.status='paused';this.log('Mission paused. Drones holding position.');}}
 setAlgorithm(a){if(!['astar','bfs','ucs','greedy'].includes(a))return;this.algorithm=a;this.log(`Routing changed to ${a==='astar'?'A*':a.toUpperCase()}.`);}
 route(drone,goal){const result=findRoute(this.city,[drone.gx,drone.gz],goal,this.algorithm);this.expanded+=result.expanded;this.routeCost+=Number.isFinite(result.cost)?result.cost:0;drone.path=result.path.slice(1);drone.route=result.path;drone.routeIndex=0;return result.path.length>0;}
 assign(d){const choices=this.city.victims.filter(v=>v.state==='waiting'&&v.drone===null).sort((a,b)=>distance([d.gx,d.gz],[a.x,a.z])-distance([d.gx,d.gz],[b.x,b.z]));
  for(const v of choices){if(this.route(d,[v.x,v.z])){d.target=v.id;v.drone=d.id;d.state='responding';this.log(`${d.name} assigned to person ${String(v.id).padStart(2,'0')}.`);return;}}
  if(d.gx!==d.home[0]||d.gz!==d.home[1]){this.route(d,d.home);d.state='returning';}else d.state='ready';
 }
 tick(realDt){if(this.status!=='running')return;const dt=Math.min(realDt,.1)*this.speed;this.elapsed+=dt;
  for(const d of this.drones){if(d.wait>0){d.wait-=dt;continue;}
   if(!d.path.length){
    if(d.state==='responding'){const v=this.city.victims.find(v=>v.id===d.target);v.state='carried';d.carrying=v.id;d.target=null;d.state='transporting';d.wait=.65;const dest=[...this.city.stations].sort((a,b)=>distance([d.gx,d.gz],a)-distance([d.gx,d.gz],b))[0];this.route(d,dest);this.log(`${d.name} picked up person ${String(v.id).padStart(2,'0')}.`);continue;}
    if(d.state==='transporting'){const v=this.city.victims.find(v=>v.id===d.carrying);v.state='safe';d.carrying=null;d.saved++;this.rescued++;d.battery=Math.max(10,d.battery-1);d.wait=.5;d.state='ready';this.log(`Person ${String(v.id).padStart(2,'0')} delivered to safety.`,'rescue');if(this.rescued===this.city.victims.length){this.status='complete';this.log('Mission complete. Everyone is safe.','rescue');for(const unit of this.drones)unit.state='complete';break;}continue;}
    if(d.state==='returning')d.state='ready';
    if(d.battery<35&&this.city.stations.some(p=>p[0]===d.gx&&p[1]===d.gz)){d.state='charging';d.battery=Math.min(100,d.battery+dt*14);if(d.battery<95)continue;d.state='ready';}
    this.assign(d);
   }
   if(d.path.length){const next=d.path[0],dx=next[0]-d.x,dz=next[1]-d.z,dist=Math.hypot(dx,dz),step=dt*(this.weather==='rain'?1.5:2.1);d.heading=Math.atan2(dx,dz);const travel=Math.min(dist,step);d.battery=Math.max(0,d.battery-travel*.14);d.distance+=travel*12;this.distance+=travel*12;
    if(dist<=step){d.x=d.gx=next[0];d.z=d.gz=next[1];d.path.shift();d.routeIndex++;}else{d.x+=dx/dist*step;d.z+=dz/dist*step;}
   }
  }
 }
 report(){return {app:'Swarm City',version:2,scenario:this.city.scenario,seed:this.city.seed,status:this.status,algorithm:this.algorithm,weather:this.weather,elapsedSeconds:+this.elapsed.toFixed(2),rescued:this.rescued,total:this.city.victims.length,distanceMeters:Math.round(this.distance),searchNodesExpanded:this.expanded,drones:this.drones.map(({id,saved,distance,battery})=>({id,saved,distanceMeters:Math.round(distance),batteryPercent:Math.round(battery)})),events:this.events};}
}
