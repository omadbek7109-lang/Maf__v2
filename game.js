/* S2S Mafia — game.js: interfeys + o'yin mantiqi (host hisoblaydi) */
(()=>{
'use strict';
const $=id=>document.getElementById(id),qa=s=>[...document.querySelectorAll(s)];
const THEMES=[['gothic','Qonli'],['neon','Neon'],['royal','Qasr'],['camp','Tabiat'],['space','Kosmik'],['rooftop','Tom']];
const R={mafia:['Mafia',"Tunda bir o'yinchini o'ldirasiz. Kunduzi sezdirmang."],doctor:['Doktor',"Har tun bir kishini o'limdan qutqarasiz."],sheriff:['Sherif',"Har tun bir kishining mafiyaligini tekshirasiz."],citizen:['Fuqaro',"Kunduzi ovoz berib mafiyani toping."]};
const NIGHT=30,DAY=60,now=()=>Date.now()+(Net.offset||0);
let room=null,S=null,role=null,sel=null,lastKey='',lastPhase=null,lastSeq=-1,busy=false,offs=[],fxOn=true,lastSec=-1;
const me={uid:null,name:''};
const hue=u=>{let h=0;for(const ch of String(u))h=(h*31+ch.charCodeAt(0))%360;return h};
let tt;const toast=m=>{const t=$('toast');t.textContent=m;t.classList.remove('hidden');clearTimeout(tt);tt=setTimeout(()=>t.classList.add('hidden'),2800)};
const go=n=>{qa('.screen').forEach(s=>s.classList.add('hidden'));$('screen-'+n).classList.remove('hidden');document.body.dataset.screen=n};
const lm=m=>{$('lobbyMsg').textContent=m};

/* ---------- Effektlar (zarrachalar + chaqmoq) ---------- */
const FX=(()=>{
  const c=$('fx'),g=c.getContext('2d');let W,H,th='gothic';const ps=[];
  const cfg={gothic:['220,30,50',1.6,0],neon:['90,230,255',-.4,.5],royal:['255,214,120',.35,.2],camp:['255,140,40',-1.1,.6],space:['190,225,255',.06,.05],rooftop:['255,170,80',-.7,.4]};
  const rs=()=>{W=c.width=innerWidth;H=c.height=innerHeight};addEventListener('resize',rs);rs();
  for(let i=0;i<45;i++)ps.push({x:Math.random()*W,y:Math.random()*H,r:1+Math.random()*2.4,s:.4+Math.random(),a:.3+Math.random()*.6});
  const loop=()=>{requestAnimationFrame(loop);if(document.hidden)return;g.clearRect(0,0,W,H);if(!fxOn)return;
    const[cl,vy,dx]=cfg[th];
    ps.forEach(p=>{p.y+=vy*p.s;p.x+=Math.sin(p.y/40+p.s)*dx;if(p.y>H+5)p.y=-5;if(p.y<-5)p.y=H+5;
      g.beginPath();g.fillStyle=`rgba(${cl},${p.a})`;g.arc(p.x,p.y,p.r,0,7);g.fill()})};
  loop();
  return{theme:t=>{th=t},flash(red){if(!fxOn)return;const f=document.querySelector('#scene .flash');f.classList.toggle('red',!!red);f.classList.remove('go');void f.offsetWidth;f.classList.add('go')}};
})();

/* ---------- Mavzu ---------- */
function setTheme(t){
  document.body.dataset.theme=t;FX.theme(t);try{localStorage.setItem('s2s-theme',t)}catch(e){}
  qa('[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
}
['lobbyThemes','themeGrid'].forEach(id=>THEMES.forEach(([k,n])=>{
  const b=document.createElement('button');b.type='button';b.dataset.t=k;b.className='chip';b.textContent=n;
  b.onclick=()=>{setTheme(k);A.play('click')};$(id).append(b)}));
let saved='gothic';try{saved=localStorage.getItem('s2s-theme')||'gothic'}catch(e){}
setTheme(THEMES.some(t=>t[0]===saved)?saved:'gothic');

/* ---------- Kirish (qonli animatsiya) ---------- */
for(let i=0;i<14;i++){const d=document.createElement('i');d.className='drip';
  d.style.cssText=`left:${3+i*7+Math.random()*4}%;width:${6+Math.random()*10}px;--h:${60+Math.random()*180}px;animation-delay:${Math.random()*4}s`;$('dripRow').append(d)}
$('btnEnter').onclick=()=>{A.init();A.play('blood');A.ambient(true);$('screen-intro').classList.add('flood');setTimeout(()=>go('lobby'),1100)};
$('btnMic').remove(); // ovozli aloqa (WebRTC) hali yo'q — soxta tugma qo'ymaymiz

Net.init().then(()=>{me.uid=Net.uid}).catch(e=>lm(e.message));

/* ---------- Lobbi ---------- */
async function enterRoom(fn){
  const nm=$('inpName').value.trim();
  if(nm.length<2)return lm("Ismingizni yozing (kamida 2 harf)");
  if(!me.uid)return lm("Ulanmoqda yoki Firebase sozlanmagan. Biroz kuting...");
  try{lm('...');me.name=nm;join(await fn(nm));lm('')}catch(e){lm(e.message||'Xatolik')}
}
$('btnCreate').onclick=()=>enterRoom(n=>Net.create(n));
$('btnJoin').onclick=()=>{const c=$('inpCode').value.trim();if(!/^\d{4}$/.test(c))return lm("Xona kodi 4 ta raqam");enterRoom(n=>Net.join(c,n))};

function join(code){
  room=code;S=null;role=null;sel=null;lastKey='';lastPhase=null;lastSeq=-1;$('chatLog').innerHTML='';
  offs=[Net.watch(code,onPub),Net.watchChat(code,m=>line('',m.n,m.t,m.u)),Net.watchRole(code,onRole),Net.watchRes(code,onRes)];
  go('room');
}
function leave(){
  offs.forEach(f=>f());offs=[];const c=room,s=S;room=null;S=null;role=null;
  if(c)Net.leave(c,s).catch(()=>{});
  Object.keys(seatEls).forEach(u=>{seatEls[u].remove();delete seatEls[u]});
  $('overlay').classList.add('hidden');$('sheet').classList.add('hidden');go('lobby');
}
function onPub(s){
  if(!s){if(room){toast('Xona yopildi');leave()}return}
  S=s;render();
}
function onRole(r){
  if(!r||role===r)return;role=r;
  overlay(R[r][0],R[r][1],r,'Davom etish');A.play('night');renderBar();
}
function onRes(t){if(t){line('sys','','🔎 '+t);toast(t)}}

/* ---------- Chizish ---------- */
const order=P=>Object.keys(P).sort((a,b)=>(P[a].at||0)-(P[b].at||0)||(a<b?-1:1));
const seatEls={};
function render(){
  const P=S.players||{},ids=order(P),n=ids.length,ph=S.phase,host=S.host===me.uid;
  $('roomId').textContent=room;$('playerCount').textContent=n+'/12';
  document.body.dataset.phase=ph==='day'?'day':'night';
  $('phaseUse').setAttribute('href',ph==='day'?'#i-sun':'#i-moon');
  $('phaseLabel').textContent=ph==='lobby'?'Kutilmoqda':ph==='over'?'Yakun':(ph==='day'?'Kun ':'Tun ')+S.day;
  $('tableText').textContent=ph==='lobby'?(n<4?'Kamida 4 kishi kerak':'Boshlashga tayyor'):ph==='over'?(S.winner==='mafia'?'Mafia yutdi':'Fuqarolar yutdi'):(S.msg||'');
  $('btnStart').classList.toggle('hidden',!(host&&ph==='lobby'&&n>=4));
  const key=ph+S.day;if(key!==lastKey){lastKey=key;sel=null}
  if(lastPhase!==null&&ph!==lastPhase&&ph!=='over'){
    FX.flash();
    if(ph==='night'){A.play('night');A.say("Tun boshlandi. Shahar uxlaydi.")}
    if(ph==='day'){A.play('day');A.say("Kun boshlandi. Hamma uyg'ondi.")}
  }
  lastPhase=ph;
  if((S.mseq||0)!==lastSeq){
    if(lastSeq!==-1&&S.msg){line('sys','','☾ '+S.msg);if(S.hit){A.play('kill');FX.flash(true)}}
    lastSeq=S.mseq||0;
  }
  if(ph==='over'&&!$('overlay').dataset.over){
    $('overlay').dataset.over=1;
    overlay(S.winner==='mafia'?'Mafia g\'alaba qildi':'Fuqarolar g\'alaba qildi',"Barcha rollar stolda ochiq ko'rsatildi.",S.winner==='mafia'?'mafia':'citizen','Lobbiga qaytish',true);
  }
  renderSeats();renderBar();renderList();
}
function renderSeats(){
  const P=S.players||{},ids=order(P),n=ids.length;
  Object.keys(seatEls).forEach(u=>{if(!P[u]){seatEls[u].remove();delete seatEls[u]}});
  ids.forEach((u,i)=>{
    let e=seatEls[u];
    if(!e){e=seatEls[u]=document.createElement('div');e.className='seat';
      e.innerHTML='<div class="av"><i class="num"></i><i class="crown"><svg class="ic"><use href="#i-crown"/></svg></i><b></b><i class="st"></i></div><div class="nm"></div>';
      e.onclick=()=>pick(u);$('seats').append(e)}
    const a=(-90+360*i/n)*Math.PI/180,p=P[u];
    e.style.left=(50+43*Math.cos(a))+'%';e.style.top=(50+41*Math.sin(a))+'%';e.style.setProperty('--h',hue(u));
    e.querySelector('.num').textContent=i+1;e.querySelector('b').textContent=(p.name[0]||'?').toUpperCase();
    const rv=S.reveal&&S.reveal[u];e.querySelector('.nm').textContent=p.name+(rv?' · '+R[rv][0]:'');
    e.classList.toggle('me',u===me.uid);e.classList.toggle('host',u===S.host);
    e.classList.toggle('dead',!p.alive);e.classList.toggle('pick',u===sel);
  });
}
function canAct(){
  const p=S&&S.players&&S.players[me.uid];if(!p||!p.alive)return false;
  return S.phase==='day'||(S.phase==='night'&&['mafia','doctor','sheriff'].includes(role));
}
function renderBar(){
  qa('.role-btn').forEach(b=>{const r=b.dataset.role;b.classList.toggle('on',r===role);b.classList.toggle('act',r===role&&!!S&&canAct())});
}
function renderList(){
  if(!S)return;const P=S.players||{};const ul=$('playerList');ul.innerHTML='';
  order(P).forEach((u,i)=>{
    const li=document.createElement('li');li.className=P[u].alive?'':'dead';
    const rv=S.reveal&&S.reveal[u];
    li.textContent=`${i+1}. ${P[u].name}${u===S.host?' 👑':''}${u===me.uid?' (siz)':''} — ${P[u].alive?'tirik':'o\'lgan'}${rv?' · '+R[rv][0]:''}`;
    ul.append(li);
  });
}
function pick(u){
  if(!S||S.phase==='lobby'||S.phase==='over')return;
  const P=S.players,p=P[me.uid];
  if(!p||!p.alive)return toast("Siz o'yindan chiqdingiz");
  if(!P[u].alive)return;
  if(S.phase==='night'){
    if(!['mafia','doctor','sheriff'].includes(role))return toast("Tunda faqat maxsus rollar harakat qiladi. Kuting...");
    if(u===me.uid&&role!=='doctor')return toast("O'zingizni tanlay olmaysiz");
  }else if(u===me.uid)return toast("O'zingizga ovoz bera olmaysiz");
  sel=u;Net.act(room,u).catch(e=>toast('Xatolik: '+e.message));A.play('click');
  toast((S.phase==='night'?'Tanlandi: ':'Ovoz berildi: ')+P[u].name);renderSeats();
}

/* ---------- Chat ---------- */
function line(cls,n,t,u){
  const d=document.createElement('div');d.className='ln '+cls;
  if(n){const b=document.createElement('b');b.textContent=n+': ';b.style.color=`hsl(${hue(u)} 80% 70%)`;d.append(b)}
  d.append(document.createTextNode(t));const L=$('chatLog');L.append(d);
  while(L.children.length>60)L.firstChild.remove();L.scrollTop=L.scrollHeight;
}
$('chatForm').onsubmit=e=>{e.preventDefault();const t=$('chatInput').value.trim();if(!t||!room)return;
  $('chatInput').value='';Net.chat(room,me.name,t).catch(()=>toast('Xabar yuborilmadi'))};

/* ---------- Panellar / tugmalar ---------- */
const TITLES={players:"O'yinchilar",cards:'Kartalar',settings:'Sozlamalar'};
function sheet(t){
  qa('.pane').forEach(p=>p.classList.add('hidden'));$('pane-'+t).classList.remove('hidden');
  $('sheetTitle').textContent=TITLES[t];$('sheet').classList.remove('hidden');
}
qa('.dock-btn').forEach(b=>b.onclick=()=>{
  A.play('click');const t=b.dataset.tab;
  if(t==='chat'){document.body.classList.toggle('chat-off');if(!document.body.classList.contains('chat-off'))$('chatInput').focus()}
  else sheet(t);
});
$('sheetClose').onclick=()=>$('sheet').classList.add('hidden');
$('btnSettings').onclick=()=>sheet('settings');
Object.entries(R).forEach(([k,[n,d]])=>{const c=document.createElement('div');c.className='rcard';c.innerHTML=`<h4></h4><p></p>`;c.firstChild.textContent=n;c.lastChild.textContent=d;$('cardList').append(c)});
qa('.role-btn').forEach(b=>b.onclick=()=>{A.play('click');const r=b.dataset.role;toast(R[r][0]+': '+R[r][1]+(role?(r===role?' (sizning rolingiz)':''):''))});
$('btnSound').onclick=()=>{$('soundUse').setAttribute('href',A.toggle()?'#i-mute':'#i-speaker')};
$('volRange').oninput=e=>A.setVol(+e.target.value);
$('chkAmbient').onchange=e=>A.ambient(e.target.checked);
$('chkFx').onchange=e=>{fxOn=e.target.checked};
$('btnCopy').onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(room).then(()=>toast('Kod nusxalandi: '+room),()=>toast('Kod: '+room))};
$('btnExit').onclick=()=>{if(confirm('Xonadan chiqasizmi?'))leave()};
$('btnStart').onclick=()=>start().catch(e=>toast('Xatolik: '+e.message));
$('overlayBtn').onclick=()=>{const o=$('overlay');o.classList.add('hidden');if(o.dataset.over){delete o.dataset.over;leave()}};
function overlay(title,text,r,btn,over){
  $('overlayTitle').textContent=title;$('overlayText').textContent=text;$('overlayBtn').textContent=btn;
  $('overlay').dataset.r=r;$('overlay').classList.remove('hidden');if(over)$('overlay').dataset.over=1;
}

/* ---------- Host: boshlash va hisoblash ---------- */
async function start(){
  const P=S.players,ids=Object.keys(P),n=ids.length;if(n<4)return;
  const sh=ids.slice().sort(()=>Math.random()-.5),m=Math.max(1,n>>2),rl={};
  sh.forEach((u,i)=>{rl[u]=i<m?'mafia':(i===m&&n>=5)?'doctor':(i===m+1&&n>=6)?'sheriff':'citizen'});
  const up={};ids.forEach(u=>{up['roles/'+u]=rl[u]});
  const mafs=ids.filter(u=>rl[u]==='mafia'),names=mafs.map(u=>P[u].name).join(', ');
  mafs.forEach(u=>{up['res/'+u]='Mafia jamoasi: '+names});
  await Net.update(room,up);
  await Net.update(room,{'pub/phase':'night','pub/day':1,'pub/endsAt':now()+NIGHT*1000,'pub/msg':"Shahar uxlaydi. Mafia uyg'ondi...",'pub/mseq':1,'pub/hit':false});
}
async function resolve(){
  if(busy||!S)return;busy=true;
  try{
    const P=S.players,al=Object.keys(P).filter(u=>P[u].alive);
    const rl=(await Net.val(room,'roles'))||{},ac=(await Net.val(room,'acts'))||{};
    const tally=(us,tie)=>{const c={};us.forEach(u=>{const t=ac[u];if(t&&P[t]&&P[t].alive)c[t]=(c[t]||0)+1});
      const m=Math.max(0,...Object.values(c)),top=Object.keys(c).filter(k=>c[k]===m);
      return(!m||(tie&&top.length>1))?null:top[Math.random()*top.length|0]};
    const by=r=>al.filter(u=>rl[u]===r),up={},day=S.day;let msg,dead=null,next;
    if(S.phase==='night'){
      const k=tally(by('mafia')),sv=tally(by('doctor')),ck=tally(by('sheriff'));
      if(k&&k!==sv){dead=k;msg=`Tunda ${P[k].name} o'ldirildi.`}
      else msg=k?"Doktor jonni saqlab qoldi. Hech kim o'lmadi.":"Tun tinch o'tdi.";
      if(ck)by('sheriff').forEach(s=>{up['res/'+s]=`${P[ck].name} — ${rl[ck]==='mafia'?'MAFIA!':'begunoh'}`});
      next='day';
    }else{
      const v=tally(al,true);
      if(v){dead=v;msg=`${P[v].name} xalq ovozi bilan chiqarildi. Roli: ${R[rl[v]][0]}.`}else msg="Ovozlar teng bo'ldi. Hech kim chiqarilmadi.";
      next='night';
    }
    if(dead)up['pub/players/'+dead+'/alive']=false;
    const left=al.filter(u=>u!==dead),mc=left.filter(u=>rl[u]==='mafia').length;
    const w=!mc?'citizens':(mc>=left.length-mc?'mafia':null);
    Object.assign(up,{acts:null,'pub/msg':msg,'pub/mseq':(S.mseq||0)+1,'pub/hit':!!dead});
    if(w)Object.assign(up,{'pub/phase':'over','pub/winner':w,'pub/reveal':rl,'pub/endsAt':0});
    else Object.assign(up,{'pub/phase':next,'pub/day':next==='night'?day+1:day,'pub/endsAt':now()+(next==='night'?NIGHT:DAY)*1000});
    await Net.update(room,up);
  }catch(e){console.error(e)}finally{setTimeout(()=>{busy=false},1500)}
}

/* ---------- Taymer ---------- */
setInterval(()=>{
  if(!S)return;
  const act=S.phase==='night'||S.phase==='day',l=Math.max(0,Math.ceil(((S.endsAt||0)-now())/1000));
  $('timer').textContent=act?`${String(l/60|0).padStart(2,'0')}:${String(l%60).padStart(2,'0')}`:'--:--';
  $('hud').classList.toggle('warn',act&&l<=10);
  if(act&&l<=10&&l>0&&l!==lastSec){lastSec=l;A.play('heart')}
  if(act&&l===0&&S.host===me.uid)resolve();
},500);

addEventListener('resize',()=>{if(S)renderSeats()});
})();
