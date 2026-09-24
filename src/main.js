"use strict";
import { generateLevel } from "./levels/generate.js";
import { resolvePalette, normLight } from "./levels/palette.js";
import { pathStep } from "./ai/pathfinding.js";
const LEVEL_FILES=import.meta.glob("./data/levels/*.json",{eager:true});
const cv=document.getElementById('game'), ctx=cv.getContext('2d');
const mini=document.getElementById('mini'), mctx=mini.getContext('2d');
const overlay=document.getElementById('overlay'), scrollC=document.getElementById('scrollContent');
const msgEl=document.getElementById('msg'), dmgFlash=document.getElementById('dmgflash');
const hornFlash=document.getElementById('hornflash');
const wrap=document.getElementById('wrap'), crossEl=document.getElementById('cross');
const bossbar=document.getElementById('bossbar'), bossFill=bossbar.querySelector('.fill');

let RES_W=0,RES_H=0,img=null,buf=null,zbuf=null;
let RES_BASE_W=0,RES_BASE_H=0,RES_SCALE=1,RES_CSS_W=0,RES_CSS_H=0; // adaptive resolution
let RES_PINNED=false;
function resize(){
  const availW=Math.min(window.innerWidth,1280), availH=Math.min(window.innerHeight,760);
  RES_CSS_W=availW; RES_CSS_H=availH;
  const factor=Math.max(2,Math.ceil(availW/480));
  RES_BASE_W=Math.floor(availW/factor); RES_BASE_H=Math.floor(availH/factor);
  applyResolution();
}
function applyResolution(){
  RES_W=Math.max(120,Math.floor(RES_BASE_W*RES_SCALE));
  RES_H=Math.max(80,Math.floor(RES_BASE_H*RES_SCALE));
  cv.width=RES_W; cv.height=RES_H;
  cv.style.width=RES_CSS_W+'px'; cv.style.height=RES_CSS_H+'px';
  img=ctx.createImageData(RES_W,RES_H); buf=new Uint32Array(img.data.buffer);
  zbuf=new Float32Array(RES_W);
}
window.addEventListener('resize',resize); resize();
const PK=(r,g,b)=>(255<<24)|((b&255)<<16)|((g&255)<<8)|(r&255);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

/* ---------- textures ---------- */
const TT=64;
// accent (seam colour) is optional; default reproduces the old flat ×0.45 darken of the base.
function makeWall(br,bg,bb,accent){
  const a=new Uint32Array(TT*TT);
  for(let y=0;y<TT;y++)for(let x=0;x<TT;x++){
    let r=br,g=bg,b=bb; const n=(Math.random()*26-13); r+=n;g+=n;b+=n;
    const row=Math.floor(y/16), off=(row%2)?12:0;
    if((y%16<2)||(((x+off)%24)<2)){
      if(accent){r=accent[0];g=accent[1];b=accent[2];}
      else{r*=0.45;g*=0.45;b*=0.5;}
    }
    else{const v=Math.sin(x*0.6)*4;r+=v;g+=v;b+=v;}
    a[y*TT+x]=PK(clamp(r,0,255),clamp(g,0,255),clamp(b,0,255));
  } return a;
}
function makeFloor(br=20,bg=30,bb=27){
  const a=new Uint32Array(TT*TT);
  for(let y=0;y<TT;y++)for(let x=0;x<TT;x++){
    let r=br,g=bg,b=bb; const n=(Math.random()*18-9); r+=n;g+=n;b+=n;
    if((x%32<2)||(y%32<2)){r*=0.6;g*=0.6;b*=0.6;}
    if(Math.abs(((x*7+y*3)%37)-18)<1){r*=0.5;g*=0.5;b*=0.5;}
    a[y*TT+x]=PK(clamp(r,0,255),clamp(g,0,255),clamp(b,0,255));
  } return a;
}
const WALL_TEX=[null,makeWall(74,82,76),makeWall(92,42,52)];
const FLOOR_TEX=makeFloor();
// Build a per-level texture set + light cast from a resolved palette (see levels/palette.js).
function buildTextures(pal){
  return {
    wall:[null, makeWall(pal.wall[0],pal.wall[1],pal.wall[2],pal.accent),
                makeWall(pal.wall2[0],pal.wall2[1],pal.wall2[2],pal.accent)],
    floor: makeFloor(pal.floor[0],pal.floor[1],pal.floor[2]),
  };
}
// Current level's surfaces + lighting; default to the originals until a level loads.
let curWall=WALL_TEX, curFloor=FLOOR_TEX, curLight=[1,1,1], curFog=null;
function applyPalette(tint, partial){
  const pal=resolvePalette(tint, partial);
  const tx=buildTextures(pal);
  curWall=tx.wall; curFloor=tx.floor; curLight=normLight(pal.light); curFog=pal.fog;
  // elite hounds wear the fort's colours — body from the accent wall, ears from the light
  const eb=`rgb(${(pal.wall2[0]*0.55)|0},${(pal.wall2[1]*0.55)|0},${(pal.wall2[2]*0.55)|0})`;
  const ee=`rgb(${Math.min(255,pal.light[0])|0},${Math.min(255,pal.light[1])|0},${Math.min(255,pal.light[2])|0})`;
  SPR.elite=houndSprite(eb,ee,false); SPR.elite2=houndSprite(eb,ee,true);
  ambientStart(pal);
}
// Smooth wrapping value-noise tile for the drifting ceiling mist (built once).
const MIST=(()=>{
  const N=64; let a=new Float32Array(N*N);
  for(let i=0;i<N*N;i++)a[i]=Math.random();
  for(let pass=0;pass<3;pass++){const b=new Float32Array(N*N);
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){let s=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)s+=a[((y+dy+N)&63)*N+((x+dx+N)&63)];
      b[y*N+x]=s/9;} a=b;}
  const out=new Uint8Array(N*N);
  let mn=1,mx=0; for(let i=0;i<N*N;i++){if(a[i]<mn)mn=a[i];if(a[i]>mx)mx=a[i];}
  for(let i=0;i<N*N;i++)out[i]=(255*(a[i]-mn)/(mx-mn||1))|0;
  return out;
})();
// distance fog toward the level's mist colour — deepens the palette + hides the draw horizon
const FOG_D=15;
function fogAt(d){const f=d/FOG_D;return f<=0?0:Math.min(0.92,Math.pow(f,1.35));}

/* ---------- sprites ---------- */
function sprite(w,h,draw){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const cc=c.getContext('2d');cc.clearRect(0,0,w,h);draw(cc,w,h);
  const d=cc.getImageData(0,0,w,h);return {w,h,data:new Uint32Array(d.data.buffer)};
}
function rr(cc,x,y,w,h,r){cc.beginPath();cc.moveTo(x+r,y);cc.arcTo(x+w,y,x+w,y+h,r);cc.arcTo(x+w,y+h,x,y+h,r);cc.arcTo(x,y+h,x,y,r);cc.arcTo(x,y,x+w,y,r);cc.fill();}
function tri(cc,a,b,c,d,e,f){cc.beginPath();cc.moveTo(a,b);cc.lineTo(c,d);cc.lineTo(e,f);cc.closePath();cc.fill();}
function houndSprite(body,ear,alt){
  // two gallop frames: legs spread (alt=false) vs gathered under the body (alt=true)
  const lg=alt?[0.36,0.54]:[0.24,0.66], ly=alt?0.80:0.78;
  return sprite(48,48,(cc,w,h)=>{
    cc.fillStyle=body;rr(cc,w*0.22,h*0.42,w*0.56,h*0.40,7);
    cc.beginPath();cc.arc(w*0.5,h*0.40,w*0.20,0,7);cc.fill();
    cc.fillStyle=ear;tri(cc,w*0.34,h*0.30,w*0.26,h*0.12,w*0.46,h*0.24);tri(cc,w*0.66,h*0.30,w*0.74,h*0.12,w*0.54,h*0.24);
    cc.fillStyle=body;tri(cc,w*0.44,h*0.45,w*0.5,h*0.60,w*0.56,h*0.45);
    cc.fillStyle='#fff6d2';cc.beginPath();cc.arc(w*0.43,h*0.38,w*0.035,0,7);cc.arc(w*0.57,h*0.38,w*0.035,0,7);cc.fill();
    cc.fillStyle=body;rr(cc,w*lg[0],h*ly,w*0.10,h*(0.96-ly),3);rr(cc,w*lg[1],h*ly,w*0.10,h*(0.96-ly),3);
  });
}
const SPR={
  hound:houndSprite('#1c1f21','#a81818',false),
  hound2:houndSprite('#1c1f21','#a81818',true),
  white:houndSprite('#d7d2c4','#a81818',false),
  white2:houndSprite('#d7d2c4','#a81818',true),
  boss:sprite(64,64,(cc,w,h)=>{
    cc.fillStyle='#15110c';rr(cc,w*0.20,h*0.40,w*0.60,h*0.46,8);
    cc.beginPath();cc.arc(w*0.5,h*0.38,w*0.18,0,7);cc.fill();
    cc.strokeStyle='#6b5a3a';cc.lineWidth=w*0.03;cc.lineCap='round';
    [-1,1].forEach((s)=>{cc.beginPath();
      cc.moveTo(w*(0.5+0.10*s),h*0.26);cc.lineTo(w*(0.5+0.22*s),h*0.10);
      cc.moveTo(w*(0.5+0.16*s),h*0.18);cc.lineTo(w*(0.5+0.30*s),h*0.16);
      cc.moveTo(w*(0.5+0.13*s),h*0.21);cc.lineTo(w*(0.5+0.05*s),h*0.06);cc.stroke();});
    cc.fillStyle='#ff5a2a';cc.shadowColor='#ff7a3a';cc.shadowBlur=8;
    cc.beginPath();cc.arc(w*0.43,h*0.37,w*0.045,0,7);cc.arc(w*0.57,h*0.37,w*0.045,0,7);cc.fill();
    cc.shadowBlur=0;cc.fillStyle='#a81818';
    tri(cc,w*0.30,h*0.28,w*0.20,h*0.06,w*0.42,h*0.22);tri(cc,w*0.70,h*0.28,w*0.80,h*0.06,w*0.58,h*0.22);
    cc.fillStyle='#15110c';rr(cc,w*0.24,h*0.82,w*0.12,h*0.16,3);rr(cc,w*0.64,h*0.82,w*0.12,h*0.16,3);
  }),
  soul:sprite(40,40,(cc,w,h)=>{
    const g=cc.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
    g.addColorStop(0,'rgba(255,246,210,0.95)');g.addColorStop(0.4,'rgba(201,162,39,0.55)');g.addColorStop(1,'rgba(201,162,39,0)');
    cc.fillStyle=g;cc.beginPath();cc.arc(w/2,h/2,w/2,0,7);cc.fill();
    cc.fillStyle='rgba(255,250,230,0.95)';cc.beginPath();cc.arc(w/2,h*0.45,w*0.10,0,7);cc.fill();
  }),
  portal:sprite(48,64,(cc,w,h)=>{
    const g=cc.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
    g.addColorStop(0,'rgba(150,220,255,0.92)');g.addColorStop(0.5,'rgba(50,110,180,0.5)');g.addColorStop(1,'rgba(20,40,90,0)');
    cc.fillStyle=g;cc.save();cc.translate(w/2,h/2);cc.scale(0.6,1);cc.beginPath();cc.arc(0,0,w/2,0,7);cc.fill();cc.restore();
  }),
  flame:sprite(32,44,(cc,w,h)=>{
    const g=cc.createRadialGradient(w/2,h*0.6,0,w/2,h*0.6,w*0.6);
    g.addColorStop(0,'rgba(255,240,180,0.98)');g.addColorStop(0.35,'rgba(255,150,40,0.85)');
    g.addColorStop(0.7,'rgba(190,50,15,0.45)');g.addColorStop(1,'rgba(120,20,10,0)');
    cc.fillStyle=g;cc.beginPath();cc.ellipse(w/2,h*0.55,w*0.42,h*0.5,0,0,7);cc.fill();
    cc.fillStyle='rgba(255,250,225,0.95)';cc.beginPath();cc.ellipse(w/2,h*0.55,w*0.13,h*0.26,0,0,7);cc.fill();
    cc.fillStyle='#2a1d10';cc.fillRect(w*0.44,h*0.78,w*0.12,h*0.22);
  }),
  stone:sprite(40,48,(cc,w,h)=>{
    // cairn body — three stacked stones
    cc.fillStyle='#3a3d3a';rr(cc,w*0.12,h*0.62,w*0.76,h*0.34,8);
    cc.fillStyle='#4a4d48';rr(cc,w*0.22,h*0.40,w*0.56,h*0.30,7);
    cc.fillStyle='#525549';rr(cc,w*0.30,h*0.22,w*0.40,h*0.24,6);
    // mossy highlight
    cc.fillStyle='rgba(80,108,72,0.55)';cc.fillRect(w*0.16,h*0.62,w*0.20,h*0.04);
    cc.fillRect(w*0.58,h*0.40,w*0.16,h*0.03);
    // shadow at base
    cc.fillStyle='rgba(0,0,0,0.45)';cc.fillRect(w*0.10,h*0.94,w*0.80,h*0.05);
    // rune glow on top stone
    const g=cc.createRadialGradient(w/2,h*0.30,0,w/2,h*0.30,w*0.32);
    g.addColorStop(0,'rgba(255,236,160,0.95)');g.addColorStop(0.5,'rgba(201,162,39,0.55)');g.addColorStop(1,'rgba(201,162,39,0)');
    cc.fillStyle=g;cc.beginPath();cc.arc(w/2,h*0.30,w*0.30,0,7);cc.fill();
    // engraved rune (an awen-style ᚠ-like triple stroke)
    cc.strokeStyle='rgba(255,246,210,0.95)';cc.lineWidth=Math.max(1,w*0.04);cc.lineCap='round';
    cc.beginPath();cc.moveTo(w*0.42,h*0.40);cc.lineTo(w*0.5,h*0.20);cc.moveTo(w*0.5,h*0.20);cc.lineTo(w*0.58,h*0.40);cc.moveTo(w*0.5,h*0.20);cc.lineTo(w*0.5,h*0.42);cc.stroke();
  }),
  stoneRead:sprite(40,48,(cc,w,h)=>{
    cc.fillStyle='#2e312e';rr(cc,w*0.12,h*0.62,w*0.76,h*0.34,8);
    cc.fillStyle='#3a3d38';rr(cc,w*0.22,h*0.40,w*0.56,h*0.30,7);
    cc.fillStyle='#42453a';rr(cc,w*0.30,h*0.22,w*0.40,h*0.24,6);
    cc.fillStyle='rgba(60,80,55,0.45)';cc.fillRect(w*0.16,h*0.62,w*0.20,h*0.04);
    cc.fillStyle='rgba(0,0,0,0.45)';cc.fillRect(w*0.10,h*0.94,w*0.80,h*0.05);
    // faded rune
    cc.strokeStyle='rgba(180,170,140,0.45)';cc.lineWidth=Math.max(1,w*0.04);cc.lineCap='round';
    cc.beginPath();cc.moveTo(w*0.42,h*0.40);cc.lineTo(w*0.5,h*0.20);cc.moveTo(w*0.5,h*0.20);cc.lineTo(w*0.58,h*0.40);cc.moveTo(w*0.5,h*0.20);cc.lineTo(w*0.5,h*0.42);cc.stroke();
  }),
  herb:sprite(32,36,(cc,w,h)=>{
    // vigour herb — a glowing sprig of vervain
    const g=cc.createRadialGradient(w/2,h*0.5,0,w/2,h*0.5,w*0.55);
    g.addColorStop(0,'rgba(150,255,170,0.5)');g.addColorStop(1,'rgba(60,160,80,0)');
    cc.fillStyle=g;cc.beginPath();cc.arc(w/2,h*0.5,w*0.55,0,7);cc.fill();
    cc.strokeStyle='#3f8a4a';cc.lineWidth=w*0.06;cc.lineCap='round';
    cc.beginPath();cc.moveTo(w*0.5,h*0.88);cc.quadraticCurveTo(w*0.46,h*0.5,w*0.5,h*0.22);cc.stroke();
    cc.fillStyle='#6fce7d';
    [[0.36,0.42],[0.64,0.36],[0.34,0.60],[0.66,0.58]].forEach(([lx,ly])=>{
      cc.save();cc.translate(w*lx,h*ly);cc.rotate(lx<0.5?-0.7:0.7);
      cc.beginPath();cc.ellipse(0,0,w*0.13,w*0.06,0,0,7);cc.fill();cc.restore();});
    cc.fillStyle='#eafccf';cc.beginPath();cc.arc(w*0.5,h*0.20,w*0.07,0,7);cc.fill();
  }),
  ward:sprite(32,40,(cc,w,h)=>{
    // ward — a cold-blue rune orb
    const g=cc.createRadialGradient(w/2,h*0.45,0,w/2,h*0.45,w*0.6);
    g.addColorStop(0,'rgba(170,220,255,0.9)');g.addColorStop(0.5,'rgba(70,130,220,0.45)');g.addColorStop(1,'rgba(30,60,140,0)');
    cc.fillStyle=g;cc.beginPath();cc.arc(w/2,h*0.45,w*0.6,0,7);cc.fill();
    cc.strokeStyle='rgba(220,240,255,0.95)';cc.lineWidth=w*0.055;cc.lineCap='round';
    cc.beginPath();cc.arc(w/2,h*0.45,w*0.26,0,7);cc.stroke();
    cc.beginPath();cc.moveTo(w*0.5,h*0.24);cc.lineTo(w*0.5,h*0.66);cc.moveTo(w*0.36,h*0.38);cc.lineTo(w*0.64,h*0.52);cc.moveTo(w*0.64,h*0.38);cc.lineTo(w*0.36,h*0.52);cc.stroke();
  })
};

/* ---------- codex / journal ----------
 The codex is a flat map of id -> {branch, title, body, unlocked}.
 Entries are seeded once from level data + a fixed set of soul/boss entries, then
 merged with whatever the player has previously unlocked in localStorage. */
const CODEX={};
const BRANCHES=["I","II","III","IV"];
const BRANCH_TITLES={I:"Pwyll · The First Branch",II:"Branwen · The Second Branch",III:"Manawydan · The Third Branch",IV:"Math · The Fourth Branch"};
function codexSeed(){
  // Seed from lorestones in each level
  LEVELS.forEach((L,i)=>{
    (L.lore||[]).forEach(s=>{CODEX[s.id]={branch:BRANCHES[i],title:s.title,body:s.body,unlocked:false};});
    // boss entry
    if(L.boss&&L.boss.name){const id="boss_"+BRANCHES[i].toLowerCase();
      CODEX[id]={branch:BRANCHES[i],title:L.boss.name.split('·')[0].trim(),body:L.boss.death||"",unlocked:false};}
    // soul-pool entries — unlocked when that named soul is freed
    (L.soulPool||[]).forEach(s=>{
      CODEX[soulCodexId(BRANCHES[i],s.name)]={branch:BRANCHES[i],title:s.name,body:'"'+s.line+'"  — a shade in '+L.title,unlocked:false};
    });
  });
}
function codexLoad(){try{const raw=localStorage.getItem('annwn.codex');if(!raw)return;
  const data=JSON.parse(raw);if(!data)return;
  for(const k in data){if(CODEX[k])CODEX[k].unlocked=!!data[k];}}catch(e){}}
function codexSave(){try{const out={};for(const k in CODEX)if(CODEX[k].unlocked)out[k]=1;
  localStorage.setItem('annwn.codex',JSON.stringify(out));}catch(e){}}
function codexUnlock(id){if(!CODEX[id]||CODEX[id].unlocked)return false;CODEX[id].unlocked=true;codexSave();showCodexChip();return true;}
function soulCodexId(branch,name){return "soul_"+branch.toLowerCase()+"_"+name.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,32);}

/* ---------- bardic verses on intro & death ---------- */
const VERSES={
  death:[
    "The mist closes. The mist remembers. The mist forgets.",
    "Three blows of the horn, and none came.",
    "I went into Annwn, and Annwn into me.",
    "The crimson-eared pack is patient — it knows our names.",
    "Not by a single blow, this time. Not by a single blow.",
    "What was given in Glyn Cuch is taken at the ford.",
    "The cauldron's breath rose, and we were uncounted.",
    "Three songs of Taliesin would not unbind this mist."
  ]
};

/* ---------- levels — the Four Branches of the Mabinogi ----------
 The authored campaign is data: src/data/levels/*.json (unified schema, see levels/schema.js),
 ordered by filename. Edit the JSON, not this file — `npm run validate` checks winnability. */
const LEVELS=Object.keys(LEVEL_FILES).sort().map(k=>LEVEL_FILES[k].default||LEVEL_FILES[k]);

const KIND={hound:{hp:3,spd:1.3,dmg:9,reach:0.95,scale:0.62,tex:'hound'},
            white:{hp:2,spd:2.5,dmg:7,reach:0.9,scale:0.58,tex:'white'},
            elite:{hp:5,spd:1.5,dmg:11,reach:0.95,scale:0.68,tex:'elite'},
            boss:{hp:18,spd:1.15,dmg:16,reach:1.25,scale:1.28,tex:'boss'}};
let state="title",curLevel=0,map=[],MAP_W=0,MAP_H=0,LM=null,TORCHES=[];
// active level descriptor (legacy entry or normalized procedural schema) + endless-mode state
let LV=null,endless=false,endlessDepth=0,curSchema=null,pendingSchema=null;
// difficulty — scales damage taken and enemy speed; persisted across sessions
const DIFF={easy:{dmg:0.7,spd:0.9,label:'Hunted'},normal:{dmg:1,spd:1,label:'Otherworld'},hard:{dmg:1.4,spd:1.12,label:"Annwn's Due"}};
let difficulty='normal';
try{const _d=localStorage.getItem('annwn.diff');if(_d&&DIFF[_d])difficulty=_d;}catch(e){}
function setDifficulty(d){if(!DIFF[d])return;difficulty=d;try{localStorage.setItem('annwn.diff',d);}catch(e){}}
// campaign checkpoint — last branch reached + souls freed, so a run survives closing the tab
function saveCheckpoint(){if(endless)return;try{localStorage.setItem('annwn.save',JSON.stringify({lvl:curLevel,souls:totalSoulsFreed,diff:difficulty}));}catch(e){}}
function loadCheckpoint(){try{return JSON.parse(localStorage.getItem('annwn.save'));}catch(e){return null;}}
function clearCheckpoint(){try{localStorage.removeItem('annwn.save');}catch(e){}}
let souls=[],enemies=[],parts=[],exit=null,lorestones=[],totalSoulsFreed=0,soulsAtLevelStart=0,muzzle=0,lastShot=0,bobPhase=0;
let nearestStone=null,pickups=[];
const spriteList=[];
const player={x:2.5,y:2.5,a:0,hp:100,vig:100,horn:0,ward:0};
const HORN_COST=45, HORN_CD=2.6, HORN_R=4.3;
let shake=0, muted=false;
// combat-feel + run-summary state
let hitStop=0, swing=0, turnLean=0, prevA=0;
let killCount=0, loreReadCount=0, runTime=0;
let wildT=-1, howlT=9, moteT=0, emberT=0;
// persisted options — volume, look sensitivity, FOV, shake, flash reduction
const setting=(k,d)=>{try{const v=parseFloat(localStorage.getItem(k));return isNaN(v)?d:v;}catch(e){return d;}};
let MOUSE_SENS=setting('annwn.sens',0.0024);
let VOL=clamp(setting('annwn.vol',0.5),0,1);
let SHAKE_ON=setting('annwn.shake',1)>0;
let REDUCE_FLASH=setting('annwn.flashred',0)>0;
let FOV=clamp(setting('annwn.fov',60),50,100)*Math.PI/180, PLANE=Math.tan(FOV/2);
function setFov(deg){FOV=clamp(deg,50,100)*Math.PI/180;PLANE=Math.tan(FOV/2);try{localStorage.setItem('annwn.fov',deg+'');}catch(e){}}
function addShake(n){if(!SHAKE_ON)return;if(n>shake)shake=Math.min(16,n);}
function resetRunStats(){killCount=0;loreReadCount=0;runTime=0;}
const fmtTime=(s)=>{const m=(s/60)|0;return m+':'+String((s|0)%60).padStart(2,'0');};

function mkEnemy(x,y,kind){const k=KIND[kind];return {x:x+0.5,y:y+0.5,kind,hp:k.hp,maxhp:k.hp,alive:true,hurt:0,cool:0,d:99,phase:Math.random()*6,enraged:false,summonT:5,chargeCD:3,charge:0,chargeWind:0,stun:0,windup:0,alertT:0,dying:0,aggro:false,seen:0,tx:0,ty:0,step:null,pathCD:0};}
function buildLightmap(){
  LM=new Float32Array(MAP_W*MAP_H);
  for(let cy=0;cy<MAP_H;cy++)for(let cx=0;cx<MAP_W;cx++){
    if(map[cy][cx]>0)continue;
    let s=0; const px=cx+0.5,py=cy+0.5;
    for(const t of TORCHES){const _ddx=px-t.x,_ddy=py-t.y;const d=Math.sqrt(_ddx*_ddx+_ddy*_ddy); if(d<7&&los(px,py,t.x,t.y))s+=0.95/(1+0.55*d*d);}
    LM[cy*MAP_W+cx]=Math.min(1.05,s);
  }
}
function lmAt(x,y){const ix=x|0,iy=y|0;if(ix<0||iy<0||ix>=MAP_W||iy>=MAP_H)return 0;return LM[iy*MAP_W+ix];}
// Scatter runtime pickups on random open floor tiles well away from the start.
function scatterPickups(nHerb,nWard,sx,sy){
  pickups=[];
  const cells=[];
  for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++){
    if(map[y][x]!==0)continue;
    const dx=x+0.5-sx,dy=y+0.5-sy;
    if(dx*dx+dy*dy>16)cells.push([x+0.5,y+0.5]);
  }
  for(let k=cells.length-1;k>0;k--){const j=(Math.random()*(k+1))|0;const t=cells[k];cells[k]=cells[j];cells[j]=t;}
  for(let i=0;i<nHerb&&cells.length;i++){const c=cells.pop();pickups.push({x:c[0],y:c[1],kind:'herb',taken:false,ph:Math.random()*9});}
  for(let i=0;i<nWard&&cells.length;i++){const c=cells.pop();pickups.push({x:c[0],y:c[1],kind:'ward',taken:false,ph:Math.random()*9});}
}
// Campaign branch i — the authored JSON goes through the same loader as procedural levels.
function loadLevel(i){curLevel=i;loadSchemaLevel(LEVELS[i],'campaign');saveCheckpoint();}
// Load a unified-schema level into the runtime. mode: 'campaign' (authored branch, codex-aware,
// runtime pickups), 'endless' (procedural descent), or 'backdrop' (the quiet title-screen drift).
function loadSchemaLevel(schema,mode='endless'){
  const campaign=mode==='campaign';
  endless=!campaign;LV=schema;curSchema=schema;soulsAtLevelStart=totalSoulsFreed;
  schema.bossName=schema.boss&&schema.boss.name;schema.bossDeath=schema.boss&&schema.boss.death;
  map=schema.tiles.map(row=>row.slice());MAP_W=map[0].length;MAP_H=map.length;
  souls=[];enemies=[];exit=null;lorestones=[];nearestStone=null;
  for(let k=0;k<parts.length;k++)parts[k].life=0; // mark all pooled particles dead
  // shuffle a copy of the soul pool so each playthrough varies which named souls appear
  const pool=(schema.soulPool||[]).slice();
  for(let k=pool.length-1;k>0;k--){const j=(Math.random()*(k+1))|0;const t=pool[k];pool[k]=pool[j];pool[j]=t;}
  let poolIdx=0;const loreById={};(schema.lore||[]).forEach(l=>{loreById[l.id]=l;});
  let start={x:2.5,y:2.5,a:0};TORCHES=[];pickups=[];
  // named forts field elite hounds in their own colours — every third hound is promoted
  const namedFort=!campaign&&!!(schema.palette&&schema.title&&!/^The Endless Mist/.test(schema.title));
  let houndIdx=0;
  for(const e of schema.entities){
    if(e.type==='soul'){const named=pool[poolIdx%Math.max(1,pool.length)]||{name:"A wandering shade",line:"…"};poolIdx++;
      souls.push({x:e.x,y:e.y,freed:false,bob:Math.random()*6,name:named.name,line:named.line});}
    else if(e.type==='enemy'){
      let kind=e.kind;
      if(kind==='hound'&&namedFort&&(houndIdx++%3===2))kind='elite';
      enemies.push(mkEnemy(Math.floor(e.x),Math.floor(e.y),kind));}
    else if(e.type==='exit'){exit={x:e.x,y:e.y};}
    else if(e.type==='lorestone'){const s=loreById[e.ref];
      // campaign stones already in the codex stay read across runs
      if(s)lorestones.push({x:e.x,y:e.y,id:s.id,title:s.title,body:s.body,read:campaign&&!!(CODEX[s.id]&&CODEX[s.id].unlocked),ph:Math.random()*99});}
    else if(e.type==='torch'){TORCHES.push({x:e.x,y:e.y,ph:Math.random()*99});}
    else if(e.type==='pickup'){pickups.push({x:e.x,y:e.y,kind:e.kind,taken:false,ph:Math.random()*9});}
    else if(e.type==='start'){start={x:e.x,y:e.y,a:e.a||0};}
  }
  applyPalette(schema.tint, schema.palette);
  buildLightmap();
  if(campaign&&!pickups.length)scatterPickups(2,curLevel>=1?1:0,start.x,start.y);
  // the Wild Hunt rides once, partway through: Branch IV belongs to Gwyn ap Nudd, and deep in the mist
  if(campaign)wildT=(curLevel===3)?30+Math.random()*25:-1;
  else wildT=(mode==='endless'&&endlessDepth>=3)?25+Math.random()*30:-1;
  howlT=6+Math.random()*8;
  player.x=start.x;player.y=start.y;player.a=start.a;player.horn=0;player.ward=0;wardChip(false);
  document.getElementById('lvl').querySelector('.val').textContent=schema.name;
  // rename the boss bar for the current Branch
  const bossNm=bossbar.querySelector('.nm');if(bossNm)bossNm.textContent=schema.bossName||(campaign?'Boss':'Warden');
  mini.width=MAP_W*7;mini.height=MAP_H*7;updHUD();
}
// a quiet generated branch drifts behind the title menu — the mist is already alive
function loadBackdrop(){
  try{
    loadSchemaLevel(generateLevel({seed:(Math.random()*1e9)|0,width:23,height:23,style:'digger',
      counts:{souls:3,hounds:2,white:0,lore:1,herbs:0,wards:0}}),'backdrop');
  }catch(e){}
}
// Endless Mist — infinite, seeded, procedurally-generated branches that scale with depth.
let runSeed=0;
// turn an arbitrary seed string into a uint32 (FNV-1a) so players can share word-seeds
function hashSeed(s){s=String(s).trim();if(!s)return 0;const n=parseInt(s,10);if(String(n)===s&&n>0)return n>>>0;let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function genEndless(){
  const d=endlessDepth, size=Math.min(35,21+d*2);
  const styles=['digger','digger','uniform','cellular']; const style=styles[(runSeed+d)%styles.length];
  return generateLevel({seed:runSeed+d,width:size,height:size,style,counts:{
    souls:Math.min(8,2+d),hounds:Math.min(11,3+d),
    white:Math.min(4,((d-1)/2|0)),lore:3}});
}
function startEndless(seed){runSeed=(seed>>>0)||((Math.random()*1e9)>>>0);endless=true;endlessDepth=1;totalSoulsFreed=0;player.hp=100;player.vig=100;showEndlessStory(genEndless());}
function nextEndless(){document.exitPointerLock();endlessDepth++;player.hp=Math.min(100,player.hp+18);player.vig=100;showEndlessStory(genEndless());}
function showEndlessStory(lvl){state='story';pendingSchema=lvl;bossbar.classList.remove('show');
  const verse=lvl.verse?`<p style="font-family:'Cinzel',serif;font-style:normal;font-size:13px;letter-spacing:.18em;color:var(--gold);max-width:520px;margin:22px auto 12px;white-space:pre-line;line-height:1.7;text-transform:uppercase">${lvl.verse}</p>`:'';
  scrollC.innerHTML=`<h1 style="font-size:clamp(28px,5vw,52px)">The Endless Mist<span class="sub">Depth ${endlessDepth} · ${lvl.style} · run seed ${runSeed}</span></h1>
    ${verse}
    <p class="firstcap">${lvl.story}</p><button class="btn" id="goBtn">Descend</button>`;
  overlay.classList.remove('hidden');
  document.getElementById('goBtn').onclick=()=>{ensureAudio();loadSchemaLevel(pendingSchema);overlay.classList.add('hidden');state='play';sfxHorn();if(!IS_TOUCH)cv.requestPointerLock();};
}
function tileAt(x,y){const ix=x|0,iy=y|0;if(ix<0||iy<0||ix>=MAP_W||iy>=MAP_H)return 1;return map[iy][ix];}
// next walkable tile from (fx,fy) toward (tx,ty), routing around walls (ROT.js A*)
function aiNextStep(fx,fy,tx,ty){return pathStep((x,y)=>x>=0&&y>=0&&x<MAP_W&&y<MAP_H&&map[y][x]===0,fx,fy,tx,ty);}
function levelClear(){return souls.every(s=>s.freed)&&!enemies.some(e=>e.kind==='boss'&&e.alive);}

/* ---------- input ---------- */
const IS_TOUCH=('ontouchstart' in window)||(navigator.maxTouchPoints>0);
if(IS_TOUCH)document.body.classList.add('touch');
const keys={};
const touchMv={x:0,y:0,active:false,sprint:false};   // left stick (move)
const lookMv={x:0,y:0,active:false};                  // right stick (turn)
addEventListener('keydown',e=>{
  if(e.code==='Space'||e.code==='Tab')e.preventDefault();
  if(!e.repeat){
    if(state==='lore'){if(e.code==='KeyE'||e.code==='Escape'||e.code==='Enter'||e.code==='Space')closeLore();keys[e.code]=true;return;}
    if(e.code==='KeyF')soundHorn();
    else if(e.code==='KeyE')readStone();
    else if(e.code==='Tab'){if(state==='play')openCodex();else if(state==='codex')closeCodex();}
    else if(e.code==='Escape'||e.code==='KeyP'){if(state==='play')pauseGame();else if(state==='paused'||state==='codex')resumeOrClose();}
    else if(e.code==='KeyM')toggleMute();
  }
  keys[e.code]=true;
});
addEventListener('keyup',e=>{keys[e.code]=false;});
cv.addEventListener('click',()=>{if(!IS_TOUCH&&state==='play'&&!document.pointerLockElement)cv.requestPointerLock();});
addEventListener('mousemove',e=>{if(document.pointerLockElement===cv&&state==='play')player.a+=e.movementX*MOUSE_SENS;});
addEventListener('mousedown',e=>{if(IS_TOUCH)return;if(state!=='play'||document.pointerLockElement!==cv)return;if(e.button===2)soundHorn();else shoot();});
addEventListener('contextmenu',e=>{if(document.pointerLockElement===cv)e.preventDefault();});
document.addEventListener('pointerlockchange',()=>{if(!IS_TOUCH&&!document.pointerLockElement&&state==='play')pauseGame();});

/* ---------- touch input ---------- */
let TOUCH_TURN_RATE=4.0; // base rad/s at full right-stick extension; tuned by Turn Speed slider
function resumeOrClose(){if(state==='codex'){closeCodex();}else if(state==='lore'){closeLore();}else{resumeGame();}}
function startAudioOnce(){audioInit();ensureAudio();}
if(IS_TOUCH){
  const STICK_RADIUS=70;
  const SPRINT_FRAC=0.92;
  // restore persisted touch turn-speed
  try{const v=parseFloat(localStorage.getItem('annwn.touchSens'));if(v>0&&v<10)TOUCH_TURN_RATE=4.0*v;}catch(e){}
  // anchor positions in CSS px from each corner
  const ANCHOR_L={left:'80px',bottom:'120px'};
  const ANCHOR_R={right:'80px',bottom:'120px'};
  function placeAnchor(base,anchor){
    base.style.left=anchor.left||'';base.style.right=anchor.right||'';
    base.style.top=anchor.top||'';base.style.bottom=anchor.bottom||'';
    base.style.transform=''; // sticks at rest use CSS-corner anchoring, not the floating translate
  }
  function setKnob(knob,dx,dy){
    const mag=Math.sqrt(dx*dx+dy*dy);
    const r=Math.min(STICK_RADIUS,mag); const ang=Math.atan2(dy,dx);
    knob.style.left=(50+Math.cos(ang)*r/STICK_RADIUS*50)+'%';
    knob.style.top=(50+Math.sin(ang)*r/STICK_RADIUS*50)+'%';
  }
  function resetKnob(knob){knob.style.left='50%';knob.style.top='50%';}
  // make a stick: zone touch-area, base+knob DOM, anchor, label, and a state object to write into
  function makeStick(zone,base,knob,lbl,anchor,state,seenKey){
    placeAnchor(base,anchor);
    let touchId=null,cx=0,cy=0;
    const seen=()=>{try{return localStorage.getItem(seenKey)==='1';}catch(e){return false;}};
    const markSeen=()=>{try{localStorage.setItem(seenKey,'1');}catch(e){} if(lbl)lbl.classList.add('hide'); base.classList.add('faded');};
    if(seen()){if(lbl)lbl.classList.add('hide'); base.classList.add('faded');}
    zone.addEventListener('touchstart',e=>{
      e.preventDefault();startAudioOnce();
      if(touchId!==null)return;
      const t=e.changedTouches[0];touchId=t.identifier;cx=t.clientX;cy=t.clientY;
      // float base to touch point; CSS corner anchoring is dropped while active
      base.style.left=cx+'px';base.style.top=cy+'px';base.style.right='';base.style.bottom='';
      base.style.transform='translate(-50%,-50%)';
      base.classList.add('show');resetKnob(knob);
      state.active=true;state.x=0;state.y=0; if(state.hasOwnProperty('sprint'))state.sprint=false;
      markSeen();
      requestWakeLock();
    },{passive:false});
    zone.addEventListener('touchmove',e=>{
      e.preventDefault();
      for(const t of e.changedTouches){if(t.identifier!==touchId)continue;
        const dx=t.clientX-cx, dy=t.clientY-cy;
        const mag=Math.sqrt(dx*dx+dy*dy);
        const r=Math.min(STICK_RADIUS,mag); const k=mag>0?r/mag:0;
        state.x=dx*k/STICK_RADIUS; state.y=dy*k/STICK_RADIUS;
        if(state.hasOwnProperty('sprint'))state.sprint=(r/STICK_RADIUS)>SPRINT_FRAC;
        setKnob(knob,dx,dy);
      }
    },{passive:false});
    function end(e){
      for(const t of e.changedTouches){if(t.identifier!==touchId)continue;
        touchId=null;state.x=0;state.y=0;state.active=false;
        if(state.hasOwnProperty('sprint'))state.sprint=false;
        placeAnchor(base,anchor);base.classList.remove('show');resetKnob(knob);
      }
    }
    zone.addEventListener('touchend',end);zone.addEventListener('touchcancel',end);
  }
  makeStick(
    document.getElementById('stickArea'),
    document.getElementById('stickBase'),
    document.querySelector('#stickBase .stickKnob'),
    document.getElementById('stickLbl'),
    ANCHOR_L,touchMv,'annwn.seenMoveStick');
  makeStick(
    document.getElementById('stickAreaR'),
    document.getElementById('stickBaseR'),
    document.querySelector('#stickBaseR .stickKnob'),
    document.getElementById('stickLblR'),
    ANCHOR_R,lookMv,'annwn.seenTurnStick');
  // place the labels just below their anchors after layout
  function positionLabels(){
    const lblL=document.getElementById('stickLbl');
    const lblR=document.getElementById('stickLblR');
    if(lblL){lblL.style.left='80px';lblL.style.bottom='30px';}
    if(lblR){lblR.style.right='80px';lblR.style.left='auto';lblR.style.bottom='30px';lblR.style.transform='translateX(50%)';}
  }
  positionLabels();window.addEventListener('resize',positionLabels);
  // action buttons — touchstart for snappiness
  function bindBtn(id,fn){const el=document.getElementById(id);if(!el)return;
    const handler=e=>{e.preventDefault();e.stopPropagation();startAudioOnce();fn();};
    el.addEventListener('touchstart',handler,{passive:false});
    el.addEventListener('click',handler);
  }
  bindBtn('tStrike',()=>{if(state==='play'){shoot();haptic(8);}});
  bindBtn('tHorn',()=>{if(state==='play')soundHorn();});
  bindBtn('tRead',()=>{if(state==='play')readStone();});
  bindBtn('tPause',()=>{if(state==='play')pauseGame();else if(state==='paused'||state==='codex'||state==='lore')resumeOrClose();});
  bindBtn('tCodex',()=>{if(state==='play')openCodex();else if(state==='codex')closeCodex();});
}
function haptic(ms){if(navigator.vibrate){try{navigator.vibrate(ms);}catch(e){}}}
let wakeLock=null;
async function requestWakeLock(){if(wakeLock||!('wakeLock' in navigator))return;try{wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}catch(e){}}
function releaseWakeLock(){if(wakeLock&&wakeLock.release){try{wakeLock.release();}catch(e){}wakeLock=null;}}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='play')pauseGame();});

/* ---------- gamepad (twin-stick, rumble) ---------- */
const gpMv={x:0,y:0,active:false,sprint:false};
let gpActive=false, gpPrev=[], gpIndex=-1;
const GP_DEAD=0.18;
function gpRumble(ms,mag){
  if(gpIndex<0||!navigator.getGamepads)return;
  const gp=navigator.getGamepads()[gpIndex];
  const act=gp&&(gp.vibrationActuator||null);
  if(act&&act.playEffect){try{act.playEffect('dual-rumble',{duration:ms,strongMagnitude:mag,weakMagnitude:mag*0.5});}catch(e){}}
}
function pollGamepad(dt){
  if(!navigator.getGamepads)return;
  let gp=null;
  try{const gps=navigator.getGamepads();for(const g of gps){if(g&&g.connected){gp=g;break;}}}catch(e){return;}
  if(!gp){gpMv.active=false;gpIndex=-1;return;}
  gpIndex=gp.index;
  const ax=gp.axes||[], bt=gp.buttons||[];
  const lx=Math.abs(ax[0]||0)>GP_DEAD?ax[0]:0, ly=Math.abs(ax[1]||0)>GP_DEAD?ax[1]:0;
  const rx=Math.abs(ax[2]||0)>GP_DEAD?ax[2]:0;
  const pressed=(i)=>!!(bt[i]&&bt[i].pressed);
  const anyInput=lx||ly||rx||bt.some(b=>b&&b.pressed);
  if(anyInput)gpActive=true;
  if(state==='play'){
    gpMv.x=lx;gpMv.y=ly;gpMv.active=!!(lx||ly);
    gpMv.sprint=Math.sqrt(lx*lx+ly*ly)>0.92||pressed(10); // full tilt or L3
    if(rx)player.a+=rx*3.2*dt;
  } else gpMv.active=false;
  // edge-triggered buttons: A/RT strike (or activate menus), B/LT/RB horn, X read, Y codex, Start pause
  const edge=(i)=>pressed(i)&&!gpPrev[i];
  if(edge(9)){if(state==='play')pauseGame();else if(state==='paused'||state==='codex')resumeOrClose();}
  if(edge(0)||edge(7)){
    if(state==='play')shoot();
    else if(!overlay.classList.contains('hidden')){
      const b=scrollC.querySelector('.btn');
      if(b){startAudioOnce();b.click();}
    }
  }
  if(edge(1)||edge(6)||edge(5)){if(state==='play')soundHorn();}
  if(edge(2)){if(state==='play')readStone();else if(state==='lore')closeLore();}
  if(edge(3)){if(state==='play')openCodex();else if(state==='codex')closeCodex();}
  gpPrev=bt.map(b=>!!(b&&b.pressed));
}

/* ---------- audio ---------- */
let AC=null,master=null;
const NOISE_POOL={short:null,med:null,long:null,loop:null};
function audioInit(){if(AC)return;try{AC=new (window.AudioContext||window.webkitAudioContext)();
  master=AC.createGain();master.gain.value=muted?0:VOL;master.connect(AC.destination);
  // preallocate noise buffers used by sfxStrike/sfxHit so combat doesn't churn AudioBuffers
  NOISE_POOL.short=mkNoise(0.10);
  NOISE_POOL.med=mkNoise(0.16);
  NOISE_POOL.long=mkNoise(0.50);
  NOISE_POOL.loop=mkNoise(2.0);
}catch(e){}}
function ensureAudio(){if(AC&&AC.state==='suspended')AC.resume();}
function mkNoise(d){const n=(AC.sampleRate*d)|0,b=AC.createBuffer(1,n,AC.sampleRate),c=b.getChannelData(0);for(let i=0;i<n;i++)c[i]=Math.random()*2-1;return b;}
/* ambient bed — a per-level drone + wind, coloured by the palette, with two adaptive
   layers (hunt tension, boss dread) whose gains are lerped each frame toward targets */
let ambient=null;
function ambientStop(){if(!ambient)return;for(const n of ambient.nodes){try{if(n.stop)n.stop();}catch(e){}try{n.disconnect();}catch(e){}}ambient=null;}
function ambientStart(pal){
  if(!AC)return;
  ambientStop();
  try{
    const warmth=((pal.light[0]-pal.light[2])/255)||0; // >0 warm hall, <0 cold glass
    const nodes=[];
    const bed=AC.createGain();bed.gain.value=0.16;bed.connect(master);nodes.push(bed);
    // drone: two detuned lows through a lowpass, slow swell
    const f0=52-warmth*12;
    const df=AC.createBiquadFilter();df.type='lowpass';df.frequency.value=190;df.connect(bed);nodes.push(df);
    for(const det of [0,1.7]){
      const o=AC.createOscillator();o.type=det?'triangle':'sawtooth';o.frequency.value=f0+det;
      const g=AC.createGain();g.gain.value=det?0.22:0.16;
      o.connect(g);g.connect(df);o.start();nodes.push(o,g);
    }
    const dlfo=AC.createOscillator();dlfo.frequency.value=0.07;
    const dlg=AC.createGain();dlg.gain.value=0.05;
    dlfo.connect(dlg);dlg.connect(bed.gain);dlfo.start();nodes.push(dlfo,dlg);
    // wind: looped noise through a slowly-wandering bandpass
    const ws=AC.createBufferSource();ws.buffer=NOISE_POOL.loop;ws.loop=true;
    const wf=AC.createBiquadFilter();wf.type='bandpass';wf.frequency.value=420-warmth*120;wf.Q.value=0.8;
    const wg=AC.createGain();wg.gain.value=0.05;
    ws.connect(wf);wf.connect(wg);wg.connect(master);ws.start();nodes.push(ws,wf,wg);
    const wlfo=AC.createOscillator();wlfo.frequency.value=0.05;
    const wlg=AC.createGain();wlg.gain.value=160;
    wlfo.connect(wlg);wlg.connect(wf.frequency);wlfo.start();nodes.push(wlfo,wlg);
    // cold forts get a faint glassy shimmer high above the drone
    if(warmth<-0.05){
      const sh=AC.createOscillator();sh.type='sine';sh.frequency.value=f0*12;
      const sg=AC.createGain();sg.gain.value=0.012;
      sh.connect(sg);sg.connect(master);sh.start();nodes.push(sh,sg);
    }
    // hunt-tension layer: pulsing filtered saw, silent until the pack is on you
    const to=AC.createOscillator();to.type='sawtooth';to.frequency.value=f0*1.5;
    const tf=AC.createBiquadFilter();tf.type='bandpass';tf.frequency.value=340;
    const tt=AC.createGain();tt.gain.value=1;
    const tlfo=AC.createOscillator();tlfo.frequency.value=2.3;
    const tlg=AC.createGain();tlg.gain.value=0.5;
    const tensG=AC.createGain();tensG.gain.value=0;
    to.connect(tf);tf.connect(tt);tt.connect(tensG);tensG.connect(master);
    tlfo.connect(tlg);tlg.connect(tt.gain);
    to.start();tlfo.start();nodes.push(to,tf,tt,tlfo,tlg,tensG);
    // boss-dread layer: sub pound, silent until the warden is near
    const bo=AC.createOscillator();bo.type='sine';bo.frequency.value=36;
    const bt=AC.createGain();bt.gain.value=1;
    const blfo=AC.createOscillator();blfo.frequency.value=1.3;
    const blg=AC.createGain();blg.gain.value=0.6;
    const bossG=AC.createGain();bossG.gain.value=0;
    bo.connect(bt);bt.connect(bossG);bossG.connect(master);
    blfo.connect(blg);blg.connect(bt.gain);
    bo.start();blfo.start();nodes.push(bo,bt,blfo,blg,bossG);
    ambient={nodes,tensG,bossG,tensT:0,bossT:0};
  }catch(e){ambient=null;}
}
function updateAmbient(dt){
  if(!ambient)return;
  const hunted=enemies.some(e=>e.alive&&e.kind!=='boss'&&e.aggro&&e.seen>0);
  const boss=enemies.find(e=>e.kind==='boss'&&e.alive);
  ambient.tensT=hunted?0.045:0;
  ambient.bossT=(boss&&boss.d<13)?(boss.enraged?0.10:0.06):0;
  const k=Math.min(1,dt*2.2);
  try{
    ambient.tensG.gain.value+=(ambient.tensT-ambient.tensG.gain.value)*k;
    ambient.bossG.gain.value+=(ambient.bossT-ambient.bossG.gain.value)*k;
  }catch(e){}
}
/* spatial one-shots — route through a distance-attenuated gain and (where supported)
   a stereo panner derived from the sound's bearing relative to the view */
function spOut(x,y){
  if(x==null||!AC)return master;
  const dx=x-player.x,dy=y-player.y,d=Math.sqrt(dx*dx+dy*dy);
  const g=AC.createGain();g.gain.value=1/(1+0.09*d*d);
  if(AC.createStereoPanner){
    const p=AC.createStereoPanner();
    p.pan.value=clamp(Math.sin(Math.atan2(dy,dx)-player.a)*0.8,-1,1);
    g.connect(p);p.connect(master);
  } else g.connect(master);
  return g;
}
function sfxStrike(){if(!AC)return;const s=AC.createBufferSource();s.buffer=NOISE_POOL.med;const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=1700;const g=AC.createGain();const t=AC.currentTime;g.gain.setValueAtTime(0.22,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.16);s.connect(f).connect(g).connect(master);s.start();}
function sfxChime(x,y){if(!AC)return;const out=spOut(x,y);const t=AC.currentTime;[880,1320].forEach((fr,i)=>{const o=AC.createOscillator();o.type='sine';o.frequency.value=fr;const g=AC.createGain();const st=t+i*0.06;g.gain.setValueAtTime(0,st);g.gain.linearRampToValueAtTime(0.18,st+0.01);g.gain.exponentialRampToValueAtTime(0.001,st+0.6);o.connect(g).connect(out);o.start(st);o.stop(st+0.65);});}
function sfxHit(x,y){if(!AC)return;const out=spOut(x,y);const s=AC.createBufferSource();s.buffer=NOISE_POOL.short;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=600;const g=AC.createGain();const t=AC.currentTime;g.gain.setValueAtTime(0.3,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.1);s.connect(f).connect(g).connect(out);s.start();}
function sfxHurt(){if(!AC)return;const o=AC.createOscillator();o.type='square';const t=AC.currentTime;o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(60,t+0.2);const g=AC.createGain();g.gain.setValueAtTime(0.22,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.24);o.connect(g).connect(master);o.start();o.stop(t+0.26);}
function sfxHorn(){if(!AC)return;const t=AC.currentTime;const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=155;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=480;const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.16,t+0.15);g.gain.setValueAtTime(0.16,t+0.7);g.gain.exponentialRampToValueAtTime(0.001,t+1.5);o.connect(f).connect(g).connect(master);o.start(t);o.stop(t+1.6);}
function sfxRoar(x,y){if(!AC)return;const out=spOut(x,y);const t=AC.currentTime;const o=AC.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(95,t);o.frequency.exponentialRampToValueAtTime(48,t+0.8);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=320;const g=AC.createGain();g.gain.setValueAtTime(0.3,t);g.gain.exponentialRampToValueAtTime(0.001,t+1.0);o.connect(f).connect(g).connect(out);o.start(t);o.stop(t+1.1);}
function sfxDeath(){if(!AC)return;const t=AC.currentTime;const o=AC.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(220,t);o.frequency.exponentialRampToValueAtTime(40,t+1.2);const g=AC.createGain();g.gain.setValueAtTime(0.24,t);g.gain.exponentialRampToValueAtTime(0.001,t+1.3);o.connect(g).connect(master);o.start(t);o.stop(t+1.35);}
// a far-off hound cry — pitch-bent wail with vibrato, panned from the hound's position
function sfxHowl(x,y){if(!AC)return;const out=spOut(x,y);const t=AC.currentTime;
  [[0,0.16],[0.45,0.05]].forEach(([dl,amp])=>{
    const o=AC.createOscillator();o.type='triangle';
    o.frequency.setValueAtTime(300,t+dl);
    o.frequency.linearRampToValueAtTime(520,t+dl+0.5);
    o.frequency.linearRampToValueAtTime(240,t+dl+1.5);
    const v=AC.createOscillator();v.frequency.value=6;const vg=AC.createGain();vg.gain.value=14;
    v.connect(vg);vg.connect(o.frequency);
    const g=AC.createGain();g.gain.setValueAtTime(0,t+dl);
    g.gain.linearRampToValueAtTime(amp,t+dl+0.3);
    g.gain.exponentialRampToValueAtTime(0.001,t+dl+1.6);
    o.connect(g);g.connect(out);o.start(t+dl);o.stop(t+dl+1.7);v.start(t+dl);v.stop(t+dl+1.7);
  });}
// short alert yip when a hound first sights you
function sfxYip(x,y){if(!AC)return;const out=spOut(x,y);const t=AC.currentTime;const o=AC.createOscillator();o.type='triangle';o.frequency.setValueAtTime(480,t);o.frequency.linearRampToValueAtTime(720,t+0.09);const g=AC.createGain();g.gain.setValueAtTime(0.14,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.15);o.connect(g);g.connect(out);o.start(t);o.stop(t+0.16);}
// the ward shattering — bright glassy burst
function sfxWard(){if(!AC)return;const t=AC.currentTime;const s=AC.createBufferSource();s.buffer=NOISE_POOL.med;const f=AC.createBiquadFilter();f.type='highpass';f.frequency.value=2400;const g=AC.createGain();g.gain.setValueAtTime(0.3,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.4);s.connect(f).connect(g).connect(master);s.start();
  const o=AC.createOscillator();o.type='sine';o.frequency.setValueAtTime(1760,t);o.frequency.exponentialRampToValueAtTime(880,t+0.3);const og=AC.createGain();og.gain.setValueAtTime(0.12,t);og.gain.exponentialRampToValueAtTime(0.001,t+0.35);o.connect(og);og.connect(master);o.start(t);o.stop(t+0.4);}
// the Wild Hunt's horn — deeper and darker than Arawn's own
function sfxWildHorn(){if(!AC)return;const t=AC.currentTime;[98,147].forEach((fr,i)=>{const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=fr;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=360;const g=AC.createGain();g.gain.setValueAtTime(0,t+i*0.1);g.gain.linearRampToValueAtTime(0.14,t+i*0.1+0.3);g.gain.setValueAtTime(0.14,t+1.2);g.gain.exponentialRampToValueAtTime(0.001,t+2.4);o.connect(f).connect(g).connect(master);o.start(t+i*0.1);o.stop(t+2.5);});}

/* ---------- particles (ring-buffer pool, no GC) ---------- */
const PART_CAP=420; let partIdx=0;
for(let i=0;i<PART_CAP;i++)parts.push({x:0,y:0,z:0,vx:0,vy:0,vz:0,life:0,max:1,r:0,g:0,b:0,sz:0.05,grav:2.2});
function spawn(x,y,z,n,col,spd,up,life,grav=2.2,sz=0.05){
  for(let i=0;i<n;i++){const a=Math.random()*6.283,s=Math.random()*spd;
    const p=parts[partIdx];partIdx=(partIdx+1)%PART_CAP;
    p.x=x;p.y=y;p.z=z;p.vx=Math.cos(a)*s;p.vy=Math.sin(a)*s;p.vz=up*(0.4+Math.random());
    const l=life*(0.6+Math.random()*0.6);p.life=l;p.max=l;
    p.r=col[0];p.g=col[1];p.b=col[2];p.sz=sz;p.grav=grav;
  }
}
function spawnSoul(x,y){spawn(x,y,0.5,16,[230,200,90],0.7,1.4,0.8);}
function spawnHit(x,y,white){spawn(x,y,0.5,9,white?[210,205,190]:[150,20,20],1.0,0.7,0.45);}
function spawnSummon(x,y){spawn(x,y,0.5,22,[210,210,200],1.4,1.1,0.6);}
// ambient dressing — drifting mist motes tinted by the level fog, buoyant torch embers
function spawnMote(x,y){const f=curFog||[26,30,36];spawn(x,y,0.2+Math.random()*0.8,1,[Math.min(255,f[0]*3.2+40),Math.min(255,f[1]*3.2+40),Math.min(255,f[2]*3.2+40)],0.12,0.06,4.5,0.015,0.028);}
function spawnEmber(x,y){spawn(x,y,0.55,1,[255,150+Math.random()*60|0,40],0.16,0.4,1.1,-0.35,0.03);}
function updateParts(dt){for(let i=0;i<parts.length;i++){const p=parts[i];if(p.life<=0)continue;p.life-=dt;
  if(p.life<=0)continue;
  p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=p.grav*dt;p.vx*=0.96;p.vy*=0.96;}}

/* ---------- combat ---------- */
function shoot(){const now=performance.now();if(now-lastShot<280)return;lastShot=now;muzzle=0.1;swing=1;sfxStrike();
  let best=null,bestD=99;
  for(const e of enemies){if(!e.alive)continue;const dx=e.x-player.x,dy=e.y-player.y,dist=Math.sqrt(dx*dx+dy*dy);
    let ang=Math.atan2(dy,dx)-player.a;while(ang<-Math.PI)ang+=2*Math.PI;while(ang>Math.PI)ang-=2*Math.PI;
    const cone=(e.kind==='boss')?0.18:0.12;
    if(Math.abs(ang)<cone&&dist<bestD&&los(player.x,player.y,e.x,e.y)){best=e;bestD=dist;}}
  if(best){best.hp--;best.hurt=0.13;sfxHit(best.x,best.y);spawnHit(best.x,best.y,best.kind==='white');
    crossEl.classList.add('hit');setTimeout(()=>crossEl.classList.remove('hit'),110);
    gpRumble(60,0.4);
    // knock the target back along the strike line (bosses barely budge)
    const kb=best.kind==='boss'?0.06:0.3;
    const dx=best.x-player.x,dy=best.y-player.y,dl=Math.sqrt(dx*dx+dy*dy)||1;
    const nx=best.x+dx/dl*kb,ny=best.y+dy/dl*kb;
    if(tileAt(nx,best.y)===0)best.x=nx; if(tileAt(best.x,ny)===0)best.y=ny;
    if(best.hp<=0){best.alive=false;best.dying=0.7;killCount++;hitStop=0.09;
      spawnHit(best.x,best.y,best.kind==='white');
      if(best.kind==='boss'){const L=LV;flash((L&&L.bossDeath)||"The boss falls.");sfxRoar(best.x,best.y);spawnSummon(best.x,best.y);
        if(!endless)codexUnlock("boss_"+BRANCHES[curLevel].toLowerCase());}
      else if(best.kind==='elite')flash("An elite of the fort dissolves into mist.");
      else flash("A hound of Annwn falls.");}
    else hitStop=0.045;}}
function los(x0,y0,x1,y1){
  // grid-stepped DDA: walks tile boundaries in order, ~2x faster than fixed-step interp
  const dx=x1-x0, dy=y1-y0;
  const ddx=dx===0?1e30:Math.abs(1/dx), ddy=dy===0?1e30:Math.abs(1/dy);
  let mx=x0|0, my=y0|0;
  const stepX=dx<0?-1:1, stepY=dy<0?-1:1;
  let sX=dx<0?(x0-mx)*ddx:(mx+1-x0)*ddx;
  let sY=dy<0?(y0-my)*ddy:(my+1-y0)*ddy;
  const mxEnd=x1|0, myEnd=y1|0;
  for(let g=0;g<64;g++){
    if(mx===mxEnd&&my===myEnd)return true;
    if(sX<sY){sX+=ddx;mx+=stepX;}else{sY+=ddy;my+=stepY;}
    if(mx<0||my<0||mx>=MAP_W||my>=MAP_H)return false;
    if(map[my][mx]>0)return false;
  }
  return true;
}
function spawnHoundNear(b){for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]){
  const nx=b.x+dx,ny=b.y+dy;if(tileAt(nx,ny)===0){const e=mkEnemy(Math.floor(nx),Math.floor(ny),'white');e.x=nx;e.y=ny;enemies.push(e);spawnSummon(nx,ny);return;}}}
function soundHorn(){
  if(state!=='play'||player.horn>0||player.vig<HORN_COST)return;
  player.horn=HORN_CD; player.vig=Math.max(0,player.vig-HORN_COST);
  sfxHorn(); addShake(8);
  hornFlash.style.opacity=REDUCE_FLASH?0.4:0.85; setTimeout(()=>{hornFlash.style.opacity=0;},40);
  spawn(player.x,player.y,0.5,30,[235,205,95],2.4,0.7,0.7);
  let hit=0;
  for(const e of enemies){if(!e.alive)continue;const dx=e.x-player.x,dy=e.y-player.y,d=Math.sqrt(dx*dx+dy*dy);
    if(d<HORN_R&&los(player.x,player.y,e.x,e.y)){
      const boss=e.kind==='boss';
      e.stun=Math.max(e.stun,boss?(e.enraged?0:0.7):1.5);
      const kb=boss?0.35:1.0, ux=dx/(d||1), uy=dy/(d||1);
      const nx=e.x+ux*kb, ny=e.y+uy*kb;
      if(tileAt(nx,e.y)===0)e.x=nx; if(tileAt(e.x,ny)===0)e.y=ny;
      spawnHit(e.x,e.y,true); hit++;
    }}
  flash(hit?"You sound Arawn's horn — the pack recoils!":"Arawn's horn echoes through the empty mist.");
  updHUD();
}
function toggleMute(){muted=!muted;if(master)master.gain.value=muted?0:VOL;}
function setVolume(v){VOL=clamp(v,0,1);if(master&&!muted)master.gain.value=VOL;try{localStorage.setItem('annwn.vol',VOL+'');}catch(e){}}

function readStone(){
  if(state!=='play'||!nearestStone)return;
  const s=nearestStone;
  s.read=true;
  loreReadCount++;
  codexUnlock(s.id);
  sfxChime();
  nearestStone=null;
  const pr=document.getElementById('prompt');if(pr)pr.classList.remove('show');
  showLore(s.title,s.body);
}
function showLore(title,body){
  state='lore';document.exitPointerLock();bossbar.classList.remove('show');
  scrollC.innerHTML=`<div class="scroll" style="max-width:640px">
    <h1 style="font-size:clamp(22px,4vw,38px);color:var(--gold)">${title}<span class="sub">A stone in the mist</span></h1>
    <p class="firstcap">${body}</p>
    <button class="btn" id="loreOn">Walk On</button>
    <div class="ctrls" style="margin-top:14px"><b>E / Esc / Enter</b> — continue</div>
  </div>`;
  overlay.classList.remove('hidden');
  document.getElementById('loreOn').onclick=closeLore;
}
function closeLore(){if(state!=='lore')return;overlay.classList.add('hidden');state='play';if(!IS_TOUCH)cv.requestPointerLock();}
function showCodexChip(){const c=document.getElementById('codexchip');if(c){c.classList.add('show');clearTimeout(showCodexChip._t);showCodexChip._t=setTimeout(()=>c.classList.remove('show'),3200);}}

/* ---------- update ---------- */
const canWalk=(t)=>t===0||t===3; // secret walls (3) yield to the player alone
function update(dt){
  if(state!=='play')return;
  if(hitStop>0){hitStop-=dt;dt*=0.12;} // brief world-freeze on a landed strike
  runTime+=dt;
  const sprint=((keys['ShiftLeft']||keys['ShiftRight'])||(IS_TOUCH&&touchMv.sprint)||gpMv.sprint)&&player.vig>0;
  const spd=(sprint?4.2:2.6)*dt, rot=2.4*dt;
  let mvx=0,mvy=0;
  // A/D auto-mode: when mouse-look is engaged (pointer lock) they strafe like
  // a standard FPS; when it isn't, they turn like the arrow keys so casual
  // play feels intuitive without first clicking the canvas.
  const strafeMode=(document.pointerLockElement===cv)||gpActive;
  if(keys['KeyW']||keys['ArrowUp']){mvx+=Math.cos(player.a);mvy+=Math.sin(player.a);}
  if(keys['KeyS']||keys['ArrowDown']){mvx-=Math.cos(player.a);mvy-=Math.sin(player.a);}
  if(keys['KeyA']){if(strafeMode){mvx+=Math.cos(player.a-Math.PI/2);mvy+=Math.sin(player.a-Math.PI/2);}else{player.a-=rot;}}
  if(keys['KeyD']){if(strafeMode){mvx+=Math.cos(player.a+Math.PI/2);mvy+=Math.sin(player.a+Math.PI/2);}else{player.a+=rot;}}
  if(keys['KeyQ']){mvx+=Math.cos(player.a-Math.PI/2);mvy+=Math.sin(player.a-Math.PI/2);} // always-strafe-left for mouse-look users
  if(keys['ArrowLeft'])player.a-=rot; if(keys['ArrowRight'])player.a+=rot;
  if(IS_TOUCH){
    if(touchMv.active){
      // left stick: forward/strafe; screen-up is forward
      const fwd=-touchMv.y, str=touchMv.x;
      mvx+=Math.cos(player.a)*fwd+Math.cos(player.a+Math.PI/2)*str;
      mvy+=Math.sin(player.a)*fwd+Math.sin(player.a+Math.PI/2)*str;
    }
    if(lookMv.active){
      // right stick: turn rate proportional to horizontal extension
      player.a+=lookMv.x*TOUCH_TURN_RATE*dt;
    }
  }
  if(gpMv.active){
    const fwd=-gpMv.y, str=gpMv.x;
    mvx+=Math.cos(player.a)*fwd+Math.cos(player.a+Math.PI/2)*str;
    mvy+=Math.sin(player.a)*fwd+Math.sin(player.a+Math.PI/2)*str;
  }
  const ml=Math.sqrt(mvx*mvx+mvy*mvy);let moving=false;
  if(ml>0){const mag=Math.min(1,ml);mvx/=ml;mvy/=ml;moving=true;bobPhase+=dt*(sprint?14:9);
    const nx=player.x+mvx*spd*mag,ny=player.y+mvy*spd*mag;
    if(canWalk(tileAt(nx,player.y)))player.x=nx; if(canWalk(tileAt(player.x,ny)))player.y=ny;}
  // pushing through a secret wall reveals the hollow behind it
  {const px=player.x|0,py=player.y|0;
   if(px>=0&&py>=0&&px<MAP_W&&py<MAP_H&&map[py][px]===3){
     map[py][px]=0;buildLightmap();
     flash("A false wall — the mist hid a hollow.");sfxChime();addShake(3);
     spawn(player.x,player.y,0.5,14,[190,190,180],0.9,0.8,0.6);}}
  if(sprint&&moving)player.vig=Math.max(0,player.vig-38*dt); else player.vig=Math.min(100,player.vig+22*dt);
  if(player.horn>0)player.horn=Math.max(0,player.horn-dt);
  if(keys['Space'])shoot();

  for(const s of souls){if(s.freed)continue;s.bob+=dt*3;
    const _dxs=s.x-player.x,_dys=s.y-player.y;
    if(_dxs*_dxs+_dys*_dys<0.25){s.freed=true;totalSoulsFreed++;
      player.hp=Math.min(100,player.hp+8);
      const named=s.name?("You free "+s.name+" — “"+s.line+"”"):"A soul slips free of the mist.";
      flash(named);sfxChime(s.x,s.y);spawnSoul(s.x,s.y);updHUD();
      if(s.name&&!endless)codexUnlock(soulCodexId(BRANCHES[curLevel],s.name));
      if(levelClear())flash("The portal opens. Seek it.");}}
  // pickups — vervain herbs mend, ward orbs turn one blow
  for(const pk of pickups){if(pk.taken)continue;pk.ph+=dt*2.4;
    const _dxp=pk.x-player.x,_dyp=pk.y-player.y;
    if(_dxp*_dxp+_dyp*_dyp<0.22){pk.taken=true;
      if(pk.kind==='herb'){player.hp=Math.min(100,player.hp+25);flash("Vervain of the deep wood — your wounds close.");sfxChime(pk.x,pk.y);spawn(pk.x,pk.y,0.5,12,[120,230,130],0.6,1.1,0.7);}
      else{player.ward=1;wardChip(true);flash("A cold ward settles over you — one blow will be turned.");sfxChime(pk.x,pk.y);spawn(pk.x,pk.y,0.5,12,[140,190,255],0.6,1.1,0.7);}
      updHUD();}}
  // nearest unread lorestone (prompt the player to read)
  nearestStone=null;
  let bestD=0.49;
  for(const ls of lorestones){if(ls.read)continue;const dx=ls.x-player.x,dy=ls.y-player.y;const d=dx*dx+dy*dy;if(d<bestD){bestD=d;nearestStone=ls;}}
  const pr=document.getElementById('prompt');if(pr){if(nearestStone)pr.classList.add('show');else pr.classList.remove('show');}
  if(IS_TOUCH){const tr=document.getElementById('tRead');if(tr){if(nearestStone)tr.classList.add('show');else tr.classList.remove('show');}}

  for(const e of enemies){
    if(!e.alive){if(e.dying>0){e.dying-=dt;if(Math.random()<0.3)spawn(e.x,e.y,0.3+Math.random()*0.5,1,[200,205,200],0.35,0.6,0.5,0.3,0.04);}continue;}
    e.hurt=Math.max(0,e.hurt-dt);e.cool=Math.max(0,e.cool-dt);
    const dx=player.x-e.x,dy=player.y-e.y,d=Math.sqrt(dx*dx+dy*dy);e.d=d;
    if(e.stun>0){e.stun-=dt; if(Math.random()<0.25)spawn(e.x,e.y,0.5,1,[210,205,190],0.4,0.5,0.3); continue;}
    if(e.alertT>0){e.alertT-=dt;continue;}               // frozen mid-alert — the pack has seen you
    if(e.kind==='boss'){
      if(!e.enraged&&e.hp<=e.maxhp/2){e.enraged=true;const bnm=((LV&&LV.bossName)||'The boss').split('·')[0].trim();flash(bnm+" bellows — the pack answers!");sfxRoar(e.x,e.y);addShake(9);}
      e.summonT-=dt;
      if(e.enraged&&e.summonT<=0&&enemies.filter(x=>x.alive).length<9){e.summonT=6;spawnHoundNear(e);sfxRoar(e.x,e.y);}
      e.chargeCD-=dt;
      if(e.chargeWind>0){e.chargeWind-=dt;if(e.chargeWind<=0)e.charge=0.55;} // planted, telegraphing
      else if(e.charge>0)e.charge-=dt;
      else if(e.chargeCD<=0&&d>2&&d<8&&los(e.x,e.y,player.x,player.y)){e.chargeWind=0.38;e.chargeCD=4.5;sfxRoar(e.x,e.y);addShake(6);}
    }
    let mspd=KIND[e.kind].spd*DIFF[difficulty].spd; if(e.kind==='boss'){if(e.enraged)mspd*=1.3;if(e.charge>0)mspd*=2.3;}
    const sight=(e.kind==='boss')?13:8;
    const reach=KIND[e.kind].reach;
    // direct line-of-sight refreshes the hunt and the last-known player tile
    const seeP=d<sight&&los(e.x,e.y,player.x,player.y);
    if(seeP&&!e.aggro){e.alertT=0.3;sfxYip(e.x,e.y);}     // first sighting — a beat of warning
    if(seeP){e.aggro=true;e.seen=3;e.tx=player.x|0;e.ty=player.y|0;e.step=null;}
    else if(e.seen>0)e.seen=Math.max(0,e.seen-dt);
    // attack windup — the lunge is telegraphed, then lands only if you're still in reach
    if(e.windup>0){
      e.windup-=dt;
      if(e.windup<=0){
        if(d<reach*1.35){damage(KIND[e.kind].dmg);e.cool=(e.kind==='boss')?1.1:0.8;}
        else e.cool=0.35;
      }
      continue; // planted during the windup
    }
    const winding=(e.kind==='boss'&&e.chargeWind>0);
    if(!winding&&d>reach&&(seeP||(e.aggro&&e.seen>0))){
      let mvx=0,mvy=0;
      if(seeP){mvx=dx/d;mvy=dy/d;}                       // in sight: charge straight
      else{                                              // out of sight: path around walls
        e.pathCD-=dt;
        if(e.pathCD<=0||!e.step){e.pathCD=0.25;e.step=aiNextStep(e.x|0,e.y|0,e.tx,e.ty);}
        if(e.step){const sx=(e.step[0]+0.5)-e.x,sy=(e.step[1]+0.5)-e.y,sl=Math.hypot(sx,sy)||1;mvx=sx/sl;mvy=sy/sl;if(sl<0.15)e.step=null;}
        if((e.x|0)===e.tx&&(e.y|0)===e.ty)e.seen=0;       // reached last-known spot — give up
      }
      const es=mspd*dt,ex=e.x+mvx*es,ey=e.y+mvy*es;
      if(tileAt(ex,e.y)===0)e.x=ex; if(tileAt(e.x,ey)===0)e.y=ey; e.phase+=dt*mspd*3.2;}
    if(d<reach&&e.cool<=0&&e.windup<=0)e.windup=(e.kind==='boss')?0.32:0.24;}

  // the Wild Hunt — once, deep in the mist, the pack floods in from the edges
  if(wildT>0){wildT-=dt;if(wildT<=0)wildHunt();}
  // far-off howls — dread with a bearing
  howlT-=dt;
  if(howlT<=0){howlT=10+Math.random()*18;
    const packs=enemies.filter(e=>e.alive&&e.kind!=='boss'&&e.d>4);
    if(packs.length){const h=packs[(Math.random()*packs.length)|0];sfxHowl(h.x,h.y);}}
  // ambient dressing — mist motes around the player, embers off nearby torches
  moteT-=dt;
  if(moteT<=0){moteT=0.15;
    const a=Math.random()*6.283,r=2+Math.random()*5;
    const mx=player.x+Math.cos(a)*r,my=player.y+Math.sin(a)*r;
    if(tileAt(mx,my)===0)spawnMote(mx,my);}
  emberT-=dt;
  if(emberT<=0){emberT=0.22;
    for(const tr of TORCHES){const _dxt=tr.x-player.x,_dyt=tr.y-player.y;
      if(_dxt*_dxt+_dyt*_dyt<64&&Math.random()<0.35)spawnEmber(tr.x,tr.y);}}
  updateAmbient(dt);
  updateParts(dt);
  if(exit&&levelClear()){const _dxe=exit.x-player.x,_dye=exit.y-player.y;if(_dxe*_dxe+_dye*_dye<0.36)nextLevel();}
  if(muzzle>0)muzzle-=dt;
}
// Gwyn ap Nudd's riders — a one-time pack-flood event, announced by a horn not your own
function wildHunt(){
  wildT=-1;
  flash("A horn sounds that is not yours — the Wild Hunt rides!");
  sfxWildHorn();addShake(10);
  hornFlash.style.opacity=REDUCE_FLASH?0.3:0.7;setTimeout(()=>{hornFlash.style.opacity=0;},60);
  const cells=[];
  for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++){
    if(map[y][x]!==0)continue;
    const dx=x+0.5-player.x,dy=y+0.5-player.y,d2=dx*dx+dy*dy;
    if(d2>49&&d2<196)cells.push([x,y]);
  }
  for(let k=cells.length-1;k>0;k--){const j=(Math.random()*(k+1))|0;const t=cells[k];cells[k]=cells[j];cells[j]=t;}
  const room=Math.max(0,14-enemies.filter(e=>e.alive).length);
  const n=Math.min(room,4+(Math.random()*2|0),cells.length);
  for(let i=0;i<n;i++){const c=cells.pop();
    const e=mkEnemy(c[0],c[1],'white');
    e.aggro=true;e.seen=5;e.tx=player.x|0;e.ty=player.y|0;
    enemies.push(e);spawnSummon(e.x,e.y);}
}
function wardChip(on){const c=document.getElementById('wardchip');if(c)c.classList.toggle('show',!!on);}
function damage(n){
  if(player.ward>0){player.ward=0;wardChip(false);sfxWard();addShake(3);
    flash("The ward shatters — the blow is turned!");
    spawn(player.x,player.y,0.6,14,[150,200,255],1.2,0.9,0.5);
    return;}
  player.hp-=n*DIFF[difficulty].dmg;updHUD();sfxHurt();addShake(Math.min(9,2+n*0.4));gpRumble(140,0.8);
  dmgFlash.style.opacity=REDUCE_FLASH?0.35:0.9;setTimeout(()=>dmgFlash.style.opacity=0,110);
  if(IS_TOUCH)haptic(Math.min(40,12+n));
  if(player.hp<=0){player.hp=0;updHUD();die();}}
function nextLevel(){if(endless){nextEndless();return;}if(curLevel+1>=LEVELS.length){winGame();return;}document.exitPointerLock();showStory(curLevel+1);}

/* ---------- renderer ---------- */
const AMB=0.16, PR=10, PI_=0.85; // ambient, player torch range & intensity
function render(now){
  const L=LV;
  const t=now*0.001, flick=clamp(0.93+0.05*Math.sin(t*5)+0.02*Math.sin(t*13.3),0.85,1);
  const dirX=Math.cos(player.a),dirY=Math.sin(player.a);
  const planeX=-dirY*PLANE, planeY=dirX*PLANE;
  const bobPix=Math.sin(bobPhase)*RES_H*0.006;
  const HOR=(RES_H*0.5+bobPix)|0; const tint=curFog||L.tint;
  // ceiling (mist) — vertical gradient stirred by a drifting noise layer; the horizontal
  // offset tracks the view angle so the mist parallaxes as you turn
  const mOx=(now*0.0035+player.a*28), mOy=now*0.0016;
  for(let y=0;y<HOR;y++){const f=y/HOR;
    const r=(4+(tint[0]-4)*f)*flick,g=(7+(tint[1]-7)*f)*flick,b=(8+(tint[2]-8)*f)*flick;
    const o=y*RES_W; const my=(((y*0.55+mOy)|0)&63)*64;
    const depth=0.35+0.65*f; // mist churns hardest near the horizon
    for(let x=0;x<RES_W;x++){
      const n=MIST[my+(((x*0.42+mOx)|0)&63)];
      const k=1+depth*(n-128)*0.0022;
      buf[o+x]=PK(r*k,g*k,b*k);
    }}
  // Wall pass — DDA raycast per column; floor depth (perp) cached for the scanline floor pass below
  for(let x=0;x<RES_W;x++){
    const camX=2*x/RES_W-1;
    const rdx=dirX+planeX*camX, rdy=dirY+planeY*camX;
    let mapX=player.x|0,mapY=player.y|0;
    const ddx=Math.abs(1/rdx),ddy=Math.abs(1/rdy);
    let stepX,stepY,sideX,sideY;
    if(rdx<0){stepX=-1;sideX=(player.x-mapX)*ddx;}else{stepX=1;sideX=(mapX+1-player.x)*ddx;}
    if(rdy<0){stepY=-1;sideY=(player.y-mapY)*ddy;}else{stepY=1;sideY=(mapY+1-player.y)*ddy;}
    let side=0,hit=0,guard=0;
    while(guard++<64){if(sideX<sideY){sideX+=ddx;mapX+=stepX;side=0;}else{sideY+=ddy;mapY+=stepY;side=1;}
      const tv=(mapX<0||mapY<0||mapX>=MAP_W||mapY>=MAP_H)?1:map[mapY][mapX];if(tv>0){hit=tv;break;}}
    const perp=side===0?(sideX-ddx):(sideY-ddy);
    zbuf[x]=perp;
    const lineH=(RES_H/perp)|0;
    const dStart=HOR-(lineH>>1), dEnd=dStart+lineH;
    let wallX=side===0?player.y+perp*rdy:player.x+perp*rdx; wallX-=Math.floor(wallX);
    let texX=(wallX*TT)|0; if((side===0&&rdx>0)||(side===1&&rdy<0))texX=TT-texX-1;
    const tex=curWall[hit]||curWall[1];
    // lighting at wall: sample lightmap at the hit cell + player-torch proximity
    const hx=player.x+perp*rdx, hy=player.y+perp*rdy;
    // perp is distance along the ray-vector in tile units; rdx/rdy aren't unit but |(rdx,rdy)| varies with camX
    // we want world distance for the torch falloff, so use perp*sqrt(rdx^2+rdy^2)
    const rlen=Math.sqrt(rdx*rdx+rdy*rdy);
    const nx=rdx/rlen, ny=rdy/rlen;
    const stat=lmAt(hx-nx*0.08,hy-ny*0.08);
    const dpl=perp*rlen;
    const pl=PI_*Math.max(0,1-dpl/PR);
    let lin=AMB+stat+pl; const lit=stat+pl; lin=lin>1.25?1.25:lin;
    const w=lit/(lin+0.001);
    const sideShade=side===1?0.78:1;
    // distance fog folds into the light multipliers; the fog colour is a per-column constant
    const fogF=fogAt(dpl), fogK=1-fogF;
    const mR=lin*(1+0.10*w)*sideShade*flick*curLight[0]*fogK, mG=lin*(1-0.03*w)*sideShade*flick*curLight[1]*fogK, mB=lin*(1-0.18*w)*sideShade*flick*curLight[2]*fogK;
    const fAr=tint[0]*fogF*flick, fAg=tint[1]*fogF*flick, fAb=tint[2]*fogF*flick;
    const cStart=Math.max(0,dStart),cEnd=Math.min(RES_H,dEnd);
    const stepTex=TT/lineH; let texPos=(cStart-dStart)*stepTex;
    for(let y=cStart;y<cEnd;y++){const ty=(texPos)&(TT-1);texPos+=stepTex;const c=tex[ty*TT+texX];
      buf[y*RES_W+x]=PK((c&255)*mR+fAr,((c>>8)&255)*mG+fAg,((c>>16)&255)*mB+fAb);}
  }
  // Floor pass — scanline (row-major), march fx,fy across the row with constant step
  // Left edge ray = dir - plane; right edge ray = dir + plane.
  // At row y, rowDist = 0.5*RES_H / (y-HOR); fx = player + rowDist * leftEdgeRay; step per pixel = rowDist * (rightEdgeRay - leftEdgeRay) / RES_W = rowDist * 2*plane / RES_W
  const lrdx=dirX-planeX, lrdy=dirY-planeY;
  const stepPxX=2*planeX/RES_W, stepPxY=2*planeY/RES_W;
  for(let y=HOR+1;y<RES_H;y++){
    const rowDist=(0.5*RES_H)/(y-HOR);
    let fx=player.x+rowDist*lrdx, fy=player.y+rowDist*lrdy;
    const dxStep=rowDist*stepPxX, dyStep=rowDist*stepPxY;
    // player-torch falloff and fog are constant across the row (same distance)
    const plRow=PI_*Math.max(0,1-rowDist/PR);
    const fogF=fogAt(rowDist), fogK=1-fogF;
    const rKR=flick*curLight[0]*fogK, rKG=flick*curLight[1]*fogK, rKB=flick*curLight[2]*fogK;
    const fAr=tint[0]*fogF*flick, fAg=tint[1]*fogF*flick, fAb=tint[2]*fogF*flick;
    const o=y*RES_W;
    for(let x=0;x<RES_W;x++){
      // skip pixels covered by the wall in this column
      const perp=zbuf[x]; const lineH=(RES_H/perp)|0;
      const dEnd=HOR-(lineH>>1)+lineH;
      if(y<dEnd){fx+=dxStep;fy+=dyStep;continue;}
      const stp=lmAt(fx,fy);
      let lin=AMB+stp+plRow; const lit=stp+plRow; if(lin>1.25)lin=1.25;
      const ww=lit/(lin+0.001);
      const fR=lin*(1+0.10*ww)*rKR, fG=lin*(1-0.03*ww)*rKG, fB=lin*(1-0.18*ww)*rKB;
      const c=curFloor[((((fy-Math.floor(fy))*TT)|0)&(TT-1))*TT+((((fx-Math.floor(fx))*TT)|0)&(TT-1))];
      buf[o+x]=PK((c&255)*fR+fAr,((c>>8)&255)*fG+fAg,((c>>16)&255)*fB+fAb);
      fx+=dxStep;fy+=dyStep;
    }
  }

  // sprites + torch flames + lorestones (dying enemies linger while they dissolve)
  spriteList.length=0;
  for(const s of souls)if(!s.freed)spriteList.push({x:s.x,y:s.y,kind:'soul',ref:s});
  for(const e of enemies)if(e.alive||e.dying>0)spriteList.push({x:e.x,y:e.y,kind:e.kind,ref:e});
  for(const tr of TORCHES)spriteList.push({x:tr.x,y:tr.y,kind:'flame',ref:tr});
  for(const ls of lorestones)spriteList.push({x:ls.x,y:ls.y,kind:ls.read?'stoneRead':'stone',ref:ls});
  for(const pk of pickups)if(!pk.taken)spriteList.push({x:pk.x,y:pk.y,kind:pk.kind,ref:pk});
  if(exit&&levelClear())spriteList.push({x:exit.x,y:exit.y,kind:'portal',ref:null});
  const list=spriteList;
  for(const s of list){const _dx=s.x-player.x,_dy=s.y-player.y;s.d=Math.sqrt(_dx*_dx+_dy*_dy);}
  list.sort((a,b)=>b.d-a.d);
  for(const s of list)blit(s,zbuf,dirX,dirY,planeX,planeY,HOR,flick,now);

  renderParts(dirX,dirY,planeX,planeY,HOR,zbuf);
  ctx.putImageData(img,0,0);
  if(state!=='title')drawWeapon(); // the title backdrop is a camera drift, not a walker
}

function blit(sp,zbuf,dirX,dirY,planeX,planeY,HOR,flick,now){
  const sx=sp.x-player.x, sy=sp.y-player.y;
  const invDet=1/(planeX*dirY-dirX*planeY);
  const tX=invDet*(dirY*sx-dirX*sy);
  const tY=invDet*(-planeY*sx+planeX*sy);
  if(tY<=0.15)return;
  const NONKIND=sp.kind==='soul'||sp.kind==='portal'||sp.kind==='flame'||sp.kind==='stone'||sp.kind==='stoneRead'||sp.kind==='herb'||sp.kind==='ward';
  const selfLit=NONKIND&&sp.kind!=='stoneRead';
  const beast=sp.kind==='hound'||sp.kind==='white'||sp.kind==='boss'||sp.kind==='elite';
  let texKey=NONKIND?sp.kind:KIND[sp.kind].tex;
  // two-frame gallop for the pack — swap legs on the run phase
  if(sp.ref&&(sp.kind==='hound'||sp.kind==='white'||sp.kind==='elite')&&Math.sin(sp.ref.phase||0)>0&&SPR[texKey+'2'])texKey+='2';
  const tex=SPR[texKey];
  let scale=sp.kind==='soul'?0.5:sp.kind==='portal'?0.95:sp.kind==='flame'?0.42:(sp.kind==='stone'||sp.kind==='stoneRead')?0.58:sp.kind==='herb'?0.34:sp.kind==='ward'?0.4:KIND[sp.kind].scale;
  // animation
  let lift=0, sqz=1;
  if(sp.kind==='soul'&&sp.ref)lift=Math.sin(sp.ref.bob)*0.12;
  if((sp.kind==='herb'||sp.kind==='ward')&&sp.ref)lift=0.05+Math.sin(sp.ref.ph)*0.04;
  if(sp.kind==='flame'&&sp.ref){scale*=0.9+0.12*Math.sin(now*0.02+sp.ref.ph)+0.06*Math.random();}
  if(sp.ref&&beast){
    const ph=sp.ref.phase||0; lift=Math.abs(Math.sin(ph))*0.05; sqz=1+0.05*Math.sin(ph*2);}
  // dissolve-to-mist on death: sink, and drop pixels against a hash threshold
  const dieP=sp.ref&&beast&&!sp.ref.alive?clamp(1-sp.ref.dying/0.7,0,1):0;
  const screenX=((RES_W/2)*(1+tX/tY))|0;
  const h=Math.min(RES_H*4,Math.abs(RES_H/tY)*scale)|0;
  const w=(h*(tex.w/tex.h)*sqz)|0;
  if(h<=0||w<=0)return;
  const liftPx=lift*(RES_H/tY);
  let footDrop;
  if(sp.kind==='flame')footDrop=-h*0.55;      // mount flames up on the walls
  else if(sp.kind==='stoneRead')footDrop=h*0.20; // sit cairn on floor
  else if(sp.kind==='herb'||sp.kind==='ward')footDrop=h*0.30; // rest low on the floor
  else if(selfLit)footDrop=0;
  else footDrop=h*0.12;
  if(dieP>0)footDrop+=h*0.35*dieP;            // the slain sink as they dissolve
  const dStartY=(HOR-h*0.5+footDrop-liftPx)|0;
  // lighting for non-self-lit sprites
  let mR=1,mG=1,mB=1;
  if(!selfLit){const stat=lmAt(sp.x,sp.y); const pl=PI_*Math.max(0,1-sp.d/PR);
    let lin=AMB+stat+pl; const lit=stat+pl; lin=lin>1.25?1.25:lin; const ww=lit/(lin+0.001);
    mR=lin*(1+0.10*ww)*flick*curLight[0]; mG=lin*(1-0.03*ww)*flick*curLight[1]; mB=lin*(1-0.18*ww)*flick*curLight[2];}
  else if(sp.kind==='flame'){mR=curLight[0]; mG=curLight[1]; mB=curLight[2];} // torches take the level's light hue
  // distance fog — self-lit things glow through the mist at half strength
  const fogF=fogAt(sp.d||tY)*(selfLit?0.5:1), fogK=1-fogF;
  mR*=fogK;mG*=fogK;mB*=fogK;
  const fog=curFog||[26,30,36];
  const fAr=fog[0]*fogF*flick, fAg=fog[1]*fogF*flick, fAb=fog[2]*fogF*flick;
  const hurt=sp.ref&&sp.ref.hurt>0;
  const enr=sp.kind==='boss'&&sp.ref&&sp.ref.enraged;
  // telegraph pulse — winding up an attack, planting a charge, or the first-sighting alert
  const tele=sp.ref&&sp.ref.alive&&(sp.ref.windup>0||sp.ref.chargeWind>0||sp.ref.alertT>0)
    ?0.5+0.5*Math.sin(now*0.045):0;
  const dsx=(screenX-w/2)|0,dex=(screenX+w/2)|0;
  if(dex<=0||dsx>=RES_W)return; // off-screen cull
  if(dStartY+h<=0||dStartY>=RES_H)return;
  const y0=Math.max(0,dStartY),y1=Math.min(RES_H,dStartY+h);
  const stxStep=tex.w/w, styStep=tex.h/h;
  const stripeStart=Math.max(0,dsx), stripeEnd=Math.min(RES_W,dex);
  let texXf=(stripeStart-dsx)*stxStep;
  for(let stripe=stripeStart;stripe<stripeEnd;stripe++,texXf+=stxStep){
    if(tY>=zbuf[stripe])continue;
    const texX=texXf|0;
    let texYf=(y0-dStartY)*styStep;
    for(let y=y0;y<y1;y++,texYf+=styStep){const texY=texYf|0;
      if(dieP>0&&(((texX*53+texY*97)%64)/64)<dieP)continue; // dissolve holes
      const c=tex.data[texY*tex.w+texX]; if((c>>>24)<40)continue;
      let r=(c&255)*mR+fAr,g=((c>>8)&255)*mG+fAg,b=((c>>16)&255)*mB+fAb;
      if(enr){r=Math.min(255,r*1.15+30);g*=0.9;b*=0.85;}
      if(hurt){r=r+(255-r)*0.6;g*=0.4;b*=0.4;}
      if(tele>0){r=Math.min(255,r+tele*90);g=Math.min(255,g+tele*24);b*=1-tele*0.3;}
      buf[y*RES_W+stripe]=PK(r,g,b);
    }
  }
}

function renderParts(dirX,dirY,planeX,planeY,HOR,zbuf){
  const invDet=1/(planeX*dirY-dirX*planeY);
  for(const p of parts){
    if(p.life<=0)continue;
    const sx=p.x-player.x, sy=p.y-player.y;
    const tX=invDet*(dirY*sx-dirX*sy), tY=invDet*(-planeY*sx+planeX*sy);
    if(tY<=0.2)continue;
    const col=((RES_W/2)*(1+tX/tY))|0; if(col<0||col>=RES_W)continue;
    if(tY>=zbuf[col])continue;
    const floorY=HOR+(0.5*RES_H)/tY;
    const scrY=(floorY-(p.z*RES_H)/tY)|0;
    const sz=Math.max(1,(RES_H/tY)*p.sz)|0;
    const k=clamp(p.life/p.max,0,1);
    const r=p.r*(0.4+0.6*k),g=p.g*(0.4+0.6*k),b=p.b*(0.4+0.6*k);
    const c=PK(r,g,b);
    for(let yy=scrY;yy<scrY+sz;yy++){if(yy<0||yy>=RES_H)continue;const o=yy*RES_W;
      for(let xx=col;xx<col+sz;xx++){if(xx<0||xx>=RES_W)continue;buf[o+xx]=c;}}
  }
}

function drawWeapon(){
  // thrust arc: out fast, back slow — sin over the decaying swing timer
  const th=Math.sin(clamp(swing,0,1)*Math.PI);
  const bob=Math.sin(bobPhase)*RES_H*0.02*(1-th*0.7);
  const sway=Math.sin(bobPhase*0.5)*RES_W*0.006+turnLean*RES_W*0.02;
  const cx=RES_W*0.5+sway, baseY=RES_H+4+bob+th*RES_H*0.02;
  const lungeY=th*RES_H*0.10, lungeX=-th*RES_W*0.015;
  ctx.save();
  ctx.translate(0,0);
  ctx.strokeStyle='#2a1d10';ctx.lineWidth=RES_H*0.03;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(cx+RES_W*0.10,baseY);ctx.lineTo(cx-RES_W*0.02+lungeX,RES_H*0.45+bob-lungeY);ctx.stroke();
  const tx=cx-RES_W*0.02+lungeX, ty=RES_H*0.45+bob-lungeY;
  ctx.fillStyle=muzzle>0?'#ffe8a0':'#b8b2a0';
  ctx.beginPath();ctx.moveTo(tx,ty-RES_H*0.11);ctx.lineTo(tx-RES_W*0.028,ty+RES_H*0.02);ctx.lineTo(tx+RES_W*0.028,ty+RES_H*0.02);ctx.closePath();ctx.fill();
  ctx.fillStyle='#c9a98a';
  if(ctx.roundRect){ctx.beginPath();ctx.roundRect(cx+RES_W*0.045,baseY-RES_H*0.20,RES_W*0.11,RES_H*0.18,6);ctx.fill();}
  else ctx.fillRect(cx+RES_W*0.045,baseY-RES_H*0.20,RES_W*0.11,RES_H*0.18);
  if(muzzle>0){const g=ctx.createRadialGradient(tx,ty-RES_H*0.07,0,tx,ty-RES_H*0.07,RES_W*0.09);
    g.addColorStop(0,'rgba(255,230,160,.9)');g.addColorStop(1,'rgba(255,200,80,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(tx,ty-RES_H*0.07,RES_W*0.09,0,7);ctx.fill();}
  ctx.restore();
}

/* ---------- minimap ---------- */
function drawMini(){
  if(!map.length)return;const C=7;mctx.clearRect(0,0,mini.width,mini.height);
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){if(map[y][x]>0){mctx.fillStyle=map[y][x]===2?'rgba(150,70,80,.7)':'rgba(120,130,124,.55)';mctx.fillRect(x*C,y*C,C,C);}}
  for(const tr of TORCHES){mctx.fillStyle='rgba(255,150,40,.8)';mctx.fillRect(tr.x*C-1.5,tr.y*C-1.5,3,3);}
  for(const s of souls)if(!s.freed){mctx.fillStyle='#e8c24a';mctx.fillRect(s.x*C-2,s.y*C-2,4,4);}
  for(const pk of pickups)if(!pk.taken){mctx.fillStyle=pk.kind==='herb'?'#6fce7d':'#8ab8ff';mctx.fillRect(pk.x*C-1.5,pk.y*C-1.5,3,3);}
  for(const e of enemies)if(e.alive){mctx.fillStyle=e.kind==='boss'?'#ff5a2a':e.kind==='white'?'#e0ddd0':'#c92020';mctx.fillRect(e.x*C-2,e.y*C-2,4,4);}
  if(exit&&levelClear()){mctx.fillStyle='#5ab8ff';mctx.fillRect(exit.x*C-2,exit.y*C-2,5,5);}
  mctx.save();mctx.translate(player.x*C,player.y*C);mctx.rotate(player.a);
  mctx.fillStyle='#fff';mctx.beginPath();mctx.moveTo(5,0);mctx.lineTo(-3,-3);mctx.lineTo(-3,3);mctx.closePath();mctx.fill();mctx.restore();
}

/* ---------- HUD / screens ---------- */
function updHUD(){
  document.querySelector('#hp .val').textContent=Math.max(0,player.hp|0);
  document.querySelector('#hp .bar i').style.width=Math.max(0,player.hp)+'%';
  document.querySelector('#vig .val').textContent=player.vig|0;
  document.querySelector('#vig .bar i').style.width=player.vig+'%';
  const freed=souls.filter(s=>s.freed).length;
  document.querySelector('#soul .val').textContent=souls.length?(freed+'/'+souls.length):'0';
  const vigEl=document.getElementById('vig');
  if(player.horn<=0&&player.vig>=HORN_COST)vigEl.classList.add('ready'); else vigEl.classList.remove('ready');
  if(player.hp<30&&player.hp>0)wrap.classList.add('lowhp'); else wrap.classList.remove('lowhp');
}
let msgTimer=null;
// duration: if not given, scale by length (~55ms per char, min 1.6s, max 9s) so quotes and long lines stay readable
function flash(t,dur){if(dur==null)dur=Math.min(9000,Math.max(1600,t.length*55));msgEl.textContent=t;msgEl.classList.add('show');clearTimeout(msgTimer);msgTimer=setTimeout(()=>msgEl.classList.remove('show'),dur);}
function updBossBar(){const boss=enemies.find(e=>e.kind==='boss'&&e.alive);
  if(boss&&boss.d<13){bossbar.classList.add('show');bossbar.classList.toggle('rage',!!boss.enraged);bossFill.style.width=(boss.hp/boss.maxhp*100)+'%';}
  else bossbar.classList.remove('show');}

function showTitle(){state='title';bossbar.classList.remove('show');wrap.classList.remove('lowhp');
  const unlocked=Object.keys(CODEX).filter(k=>CODEX[k].unlocked).length;
  const total=Object.keys(CODEX).length;
  const cdxHint=unlocked>0?`<div style="font-family:'Cinzel',serif;font-size:11px;letter-spacing:.22em;color:var(--gold);margin-top:14px;text-transform:uppercase">Codex: ${unlocked} of ${total} fragments &nbsp;·&nbsp; <button class="tg" id="cdxBtn" style="margin-left:8px">Open</button></div>`:'';
  const save=loadCheckpoint();
  const contBtn=(save&&save.lvl>0&&LEVELS[save.lvl])?`<button class="btn" id="contBtn" style="margin-right:10px">Continue — Annwn ${LEVELS[save.lvl].name}</button>`:'';
  const diffRow=`<div class="setrow"><span>Trial</span>${Object.keys(DIFF).map(k=>`<button class="tg${k===difficulty?'':' off'}" data-diff="${k}">${DIFF[k].label}</button>`).join('')}</div>`;
  scrollC.innerHTML=`<h1>ANNWN<span class="sub">The Four Branches</span></h1>
    <p class="firstcap">Wearing the face of the Otherworld's king, you must walk the realm of the dead for a year and a day. Free the shades bound in its mist. Bear witness to the Four Branches of the Mabinogi. Find your way home.</p>
    ${contBtn}<button class="btn" id="startBtn">Enter the Mist</button>
    <button class="tg" id="endlessBtn" style="margin-left:10px">The Endless Mist</button>
    <input id="seedInput" placeholder="seed (optional)" style="margin-left:8px;width:120px;background:rgba(8,12,12,.6);border:1px solid rgba(201,162,39,.4);color:var(--bone);font-family:'Cinzel',serif;font-size:11px;letter-spacing:.1em;padding:7px 9px;border-radius:2px;vertical-align:middle">
    <div style="font-family:'Cinzel',serif;font-size:9px;letter-spacing:.2em;color:var(--mist);margin-top:8px;text-transform:uppercase">Enter a seed to share or replay a descent</div>
    ${diffRow}
    ${cdxHint}
    <div class="ctrls">${IS_TOUCH?`<b>Left stick</b> — move &nbsp;·&nbsp; push hard to run<br><b>Right stick</b> — turn<br><b>Strike / Horn / Read</b> — buttons on the right`:`<b>W S</b> / Up Down — walk &nbsp;·&nbsp; <b>A D</b> / Left Right — turn<br><b>Click canvas</b> — engage mouse-look (then A D strafe, Q strafes left)<br><b>Space / Click</b> — strike &nbsp;·&nbsp; <b>F</b> — horn &nbsp;·&nbsp; <b>E</b> — read &nbsp;·&nbsp; <b>Tab</b> — Codex &nbsp;·&nbsp; <b>Esc</b> — pause`}<br>Free every soul to open the deeper portal</div>`;
  overlay.classList.remove('hidden');
  document.getElementById('startBtn').onclick=()=>{audioInit();ensureAudio();clearCheckpoint();totalSoulsFreed=0;resetRunStats();player.hp=100;player.vig=100;loadLevel(0);showStory(0);};
  document.getElementById('endlessBtn').onclick=()=>{audioInit();ensureAudio();resetRunStats();const si=document.getElementById('seedInput');startEndless(hashSeed(si?si.value:''));};
  const cont=document.getElementById('contBtn');
  if(cont)cont.onclick=()=>{audioInit();ensureAudio();totalSoulsFreed=save.souls||0;resetRunStats();if(save.diff)setDifficulty(save.diff);player.hp=100;player.vig=100;loadLevel(save.lvl);overlay.classList.add('hidden');state='play';sfxHorn();if(!IS_TOUCH)cv.requestPointerLock();};
  scrollC.querySelectorAll('[data-diff]').forEach(b=>{b.onclick=()=>{setDifficulty(b.getAttribute('data-diff'));showTitle();};});
  const cb=document.getElementById('cdxBtn');if(cb)cb.onclick=openCodex;
}
function showStory(i){state='story';bossbar.classList.remove('show');const L=LEVELS[i];
  const verse=L.verse?`<p style="font-family:'Cinzel',serif;font-style:normal;font-size:13px;letter-spacing:.18em;color:var(--gold);max-width:520px;margin:22px auto 12px;white-space:pre-line;line-height:1.7;text-transform:uppercase">${L.verse}</p>`:'';
  const branchLine=L.branch?`<p style="font-family:'Cinzel',serif;font-size:11px;letter-spacing:.32em;color:var(--mist);margin-top:22px;text-transform:uppercase">${L.branch}</p>`:'';
  scrollC.innerHTML=`<h1 style="font-size:clamp(28px,5vw,52px)">Annwn ${L.name}<span class="sub">${L.title}</span></h1>
    ${branchLine}
    ${verse}
    <p class="firstcap">${L.story}</p><button class="btn" id="goBtn">Descend</button>`;
  overlay.classList.remove('hidden');
  document.getElementById('goBtn').onclick=()=>{ensureAudio();loadLevel(i);overlay.classList.add('hidden');state='play';sfxHorn();if(!IS_TOUCH)cv.requestPointerLock();};
}
// run summary — the tale of the descent, shown on death and homecoming
function runSummary(){
  const rows=[
    ['Souls freed',totalSoulsFreed],
    ['Hounds slain',killCount],
    ['Lore recovered',loreReadCount],
    ['Time in the mist',fmtTime(runTime)],
  ];
  if(endless){rows.unshift(['Depth reached',endlessDepth]);rows.push(['Run seed',runSeed+' — share it']);}
  else rows.unshift(['Branch',(LV&&LV.name)||'I']);
  return `<div class="runstats">${rows.map(([k,v])=>`<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
}
function die(){state='dead';document.exitPointerLock();sfxDeath();addShake(12);bossbar.classList.remove('show');wrap.classList.remove('lowhp');
  const verse=VERSES.death[(Math.random()*VERSES.death.length)|0];
  scrollC.innerHTML=`<h1 style="color:var(--blood)">SLAIN<span class="sub">The hounds drag you down</span></h1>
    <p style="font-family:'Cinzel',serif;font-style:normal;font-size:13px;letter-spacing:.20em;color:var(--gold);max-width:520px;margin:18px auto;text-transform:uppercase">"${verse}"</p>
    ${runSummary()}
    <p class="firstcap">The crimson-eared pack closes over you, and the mist takes its due. But Annwn does not let its borrowed king rest. Rise, and walk again.</p>
    <button class="btn" id="retryBtn">Walk Again</button>`;
  overlay.classList.remove('hidden');
  document.getElementById('retryBtn').onclick=()=>{ensureAudio();player.hp=100;player.vig=100;totalSoulsFreed=soulsAtLevelStart;if(endless&&curSchema)loadSchemaLevel(curSchema);else loadLevel(curLevel);overlay.classList.add('hidden');state='play';if(!IS_TOUCH)cv.requestPointerLock();};
}
let codexFrom='play';
function openCodex(){if(state!=='play'&&state!=='title')return;codexFrom=state;state='codex';document.exitPointerLock();renderCodex();overlay.classList.remove('hidden');}
function closeCodex(){if(state!=='codex')return;if(codexFrom==='title'){showTitle();return;}overlay.classList.add('hidden');state='play';if(!IS_TOUCH)cv.requestPointerLock();}
let codexActiveId=null;
function renderCodex(){
  const counts={I:0,II:0,III:0,IV:0},totals={I:0,II:0,III:0,IV:0};
  for(const k in CODEX){const e=CODEX[k];totals[e.branch]++;if(e.unlocked)counts[e.branch]++;}
  const totalAll=totals.I+totals.II+totals.III+totals.IV;
  const unlockedAll=counts.I+counts.II+counts.III+counts.IV;
  const cols=BRANCHES.map(b=>{
    const items=Object.keys(CODEX).filter(k=>CODEX[k].branch===b);
    const lis=items.map(k=>{const e=CODEX[k];const cls=e.unlocked?(k===codexActiveId?'entry active':'entry'):'entry locked';
      const lbl=e.unlocked?e.title:'??? — fragment lost in the mist';
      return `<div class="${cls}" data-id="${k}">${lbl}</div>`;}).join('');
    return `<div class="col"><h3>${BRANCH_TITLES[b]}<br><small style="color:var(--mist);font-size:9px;letter-spacing:.2em">${counts[b]}/${totals[b]}</small></h3>${lis}</div>`;
  }).join('');
  const active=codexActiveId&&CODEX[codexActiveId]&&CODEX[codexActiveId].unlocked?CODEX[codexActiveId]:null;
  const reader=active?`<div class="reader"><h2>${active.title}</h2><p>${active.body}</p></div>`:`<div class="reader empty"><p>Select an entry from the branches above. Read lorestones in the mist to unbind more passages.</p></div>`;
  scrollC.innerHTML=`<div class="codex"><h1 style="font-size:clamp(24px,4vw,40px)">CODEX<span class="sub">Of the Four Branches</span></h1>
    <div class="progress">${unlockedAll} of ${totalAll} fragments recovered</div>
    <div class="branches">${cols}</div>${reader}
    <button class="btn" id="closeCdx" style="margin-top:22px">${codexFrom==='title'?'Back':'Return to Annwn'}</button>
    <div class="ctrls" style="margin-top:14px"><b>Tab / Esc</b> — close</div></div>`;
  scrollC.querySelectorAll('.entry').forEach(el=>{el.onclick=()=>{const id=el.getAttribute('data-id');if(CODEX[id]&&CODEX[id].unlocked){codexActiveId=id;renderCodex();}};});
  const cb=document.getElementById('closeCdx');if(cb)cb.onclick=closeCodex;
}
function winGame(){state='win';document.exitPointerLock();sfxChime();bossbar.classList.remove('show');wrap.classList.remove('lowhp');clearCheckpoint();
  scrollC.innerHTML=`<h1 style="color:var(--gold)">HOMEWARD<span class="sub">The year is done</span></h1>
    ${runSummary()}
    <p class="firstcap">The Cauldron of Rebirth lies shattered, its cold fire quenched, and its keeper unhorsed. ${totalSoulsFreed} souls walk free of the mist. The borrowed crown lifts from your brow, and the grey gate of Annwn opens onto the green hills of Dyfed. You go home, Pwyll — Pwyll Pen Annwn, Head of the Otherworld, the friendship of Arawn won at last.</p>
    <button class="btn" id="againBtn">Begin Anew</button>`;
  overlay.classList.remove('hidden');
  document.getElementById('againBtn').onclick=()=>{totalSoulsFreed=0;updHUD();showTitle();};
}
function leaveToTitle(){wrap.classList.remove('lowhp');loadBackdrop();showTitle();}
function pauseGame(){if(state!=='play')return;state='paused';document.exitPointerLock();releaseWakeLock();showPause();}
function resumeGame(){if(state!=='paused')return;overlay.classList.add('hidden');state='play';if(!IS_TOUCH)cv.requestPointerLock();else requestWakeLock();}
function showPause(){
  // Touch users see a Turn Speed slider (right-stick rate multiplier 0.5x-2.0x).
  // Desktop users see Look Sensitivity (mouse rad/px).
  const sensRow=IS_TOUCH
    ?`<div class="setrow"><span>Turn Speed</span><input type="range" id="tsens" min="50" max="200" value="${Math.round((TOUCH_TURN_RATE/4.0)*100)}"></div>`
    :`<div class="setrow"><span>Look Sensitivity</span><input type="range" id="sens" min="8" max="60" value="${Math.round(MOUSE_SENS*10000)}"></div>`;
  const ctrlsHint=IS_TOUCH
    ?`<b>Left stick</b> — move (push hard to run) &nbsp;·&nbsp; <b>Right stick</b> — turn<br><b>Strike / Horn / Read</b> — buttons on the right &nbsp;·&nbsp; <b>📜</b> — Codex &nbsp;·&nbsp; <b>⏸</b> — pause`
    :`<b>F</b> / Right-click — sound Arawn's Horn &nbsp;·&nbsp; <b>E</b> — read stone &nbsp;·&nbsp; <b>Tab</b> — Codex &nbsp;·&nbsp; <b>Esc / P</b> — pause &nbsp;·&nbsp; <b>M</b> — mute`;
  scrollC.innerHTML=`<h1 style="font-size:clamp(28px,5vw,52px)">PAUSED<span class="sub">Annwn holds its breath</span></h1>
    <button class="btn" id="resumeBtn">Resume</button>
    <button class="tg" id="quitBtn" style="margin-left:10px">Leave to Title</button>
    ${sensRow}
    <div class="setrow"><span>Volume</span><input type="range" id="volSl" min="0" max="100" value="${Math.round(VOL*100)}"><button class="tg ${muted?'off':''}" id="muteBtn">${muted?'Muted':'On'}</button></div>
    <div class="setrow"><span>Field of View</span><input type="range" id="fovSl" min="50" max="100" value="${Math.round(FOV*180/Math.PI)}"><span style="opacity:.65" id="fovVal">${Math.round(FOV*180/Math.PI)}°</span></div>
    <div class="setrow"><span>Screen Shake</span><button class="tg ${SHAKE_ON?'':'off'}" id="shakeBtn">${SHAKE_ON?'On':'Off'}</button>
      <span>Reduce Flash</span><button class="tg ${REDUCE_FLASH?'':'off'}" id="flashBtn">${REDUCE_FLASH?'On':'Off'}</button></div>
    <div class="setrow"><span>Resolution</span><button class="tg ${RES_PINNED?'':'off'}" id="resPin">${RES_PINNED?'Pinned':'Adaptive'}</button><span style="opacity:.65">${(RES_SCALE*100|0)}% · ${RES_W}×${RES_H} · ${frameEMA.toFixed(1)}ms</span></div>
    <div class="ctrls" style="margin-top:26px">${ctrlsHint}<br><b>Gamepad</b> — sticks move/turn · A strike · B horn · X read · Y codex · Start pause</div>`;
  overlay.classList.remove('hidden');
  document.getElementById('resumeBtn').onclick=resumeGame;
  document.getElementById('quitBtn').onclick=leaveToTitle;
  const sensEl=document.getElementById('sens');if(sensEl)sensEl.oninput=e=>{MOUSE_SENS=(+e.target.value)/10000;try{localStorage.setItem('annwn.sens',MOUSE_SENS+'');}catch(err){}};
  const tsensEl=document.getElementById('tsens');if(tsensEl)tsensEl.oninput=e=>{const m=(+e.target.value)/100;TOUCH_TURN_RATE=4.0*m;try{localStorage.setItem('annwn.touchSens',m+'');}catch(err){}};
  document.getElementById('volSl').oninput=e=>{setVolume((+e.target.value)/100);};
  document.getElementById('fovSl').oninput=e=>{setFov(+e.target.value);const fv=document.getElementById('fovVal');if(fv)fv.textContent=Math.round(+e.target.value)+'°';};
  document.getElementById('shakeBtn').onclick=e=>{SHAKE_ON=!SHAKE_ON;try{localStorage.setItem('annwn.shake',SHAKE_ON?'1':'0');}catch(err){}e.target.textContent=SHAKE_ON?'On':'Off';e.target.classList.toggle('off',!SHAKE_ON);};
  document.getElementById('flashBtn').onclick=e=>{REDUCE_FLASH=!REDUCE_FLASH;try{localStorage.setItem('annwn.flashred',REDUCE_FLASH?'1':'0');}catch(err){}e.target.textContent=REDUCE_FLASH?'On':'Off';e.target.classList.toggle('off',!REDUCE_FLASH);};
  document.getElementById('muteBtn').onclick=e=>{toggleMute();e.target.textContent=muted?'Muted':'On';e.target.classList.toggle('off',muted);};
  document.getElementById('resPin').onclick=e=>{RES_PINNED=!RES_PINNED;e.target.textContent=RES_PINNED?'Pinned':'Adaptive';e.target.classList.toggle('off',!RES_PINNED);};
}

/* ---------- loop + adaptive resolution ---------- */
let last=performance.now();
let frameEMA=16, adaptHi=0, adaptLo=0;
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000);last=now;
  pollGamepad(dt);
  update(dt);
  // viewmodel timers run on real time so the swing completes through hit-stop
  if(swing>0)swing=Math.max(0,swing-dt*4.5);
  turnLean+=((player.a-prevA)/Math.max(dt,0.001)*0.12-turnLean)*Math.min(1,dt*10);
  turnLean=clamp(turnLean,-1,1);prevA=player.a;
  // the title screen drifts through a real generated level behind the menu
  if(state==='title'&&map.length){player.a+=dt*0.055;bobPhase+=dt*0.5;}
  if(map.length&&(state==='title'||state==='play'||state==='story'||state==='dead'||state==='win'||state==='paused'||state==='lore'||state==='codex')){
    render(now);drawMini();
    if(state==='play'){updHUD();updBossBar();} else bossbar.classList.remove('show');
  }
  if(shake>0.15){const a=Math.random()*6.283;cv.style.transform=`translate(${Math.cos(a)*shake}px,${Math.sin(a)*shake}px)`;shake*=0.86;}
  else if(shake!==0){shake=0;cv.style.transform='';}
  // touch UI is only useful while playing — hide it when any overlay is up
  if(IS_TOUCH){const menu=!overlay.classList.contains('hidden');if(menu!==document.body.classList.contains('menu'))document.body.classList.toggle('menu',menu);}
  // adaptive resolution — only while playing, and not when user has pinned
  if(state==='play'&&!RES_PINNED){
    const frame=performance.now()-now;
    frameEMA=frameEMA*0.93+frame*0.07;
    if(frameEMA>22){adaptHi+=dt;adaptLo=0;
      if(adaptHi>1&&RES_SCALE>0.55){RES_SCALE=Math.max(0.55,RES_SCALE-0.15);applyResolution();adaptHi=0;}
    } else if(frameEMA<13){adaptLo+=dt;adaptHi=0;
      if(adaptLo>2&&RES_SCALE<1){RES_SCALE=Math.min(1,RES_SCALE+0.15);applyResolution();adaptLo=0;}
    } else {adaptHi=0;adaptLo=0;}
  }
  requestAnimationFrame(loop);
}
codexSeed();codexLoad();
loadBackdrop();
showTitle();
requestAnimationFrame(loop);
