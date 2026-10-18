from pathlib import Path

code = r'''/* S2S Mafia — game.js
   Firebase mavjud bo‘lsa online rejim, ulanmasa lokal DEMO rejimi.
   net.js va Firebase konfiguratsiyasiga tegmaydi.
*/
(()=>{
'use strict';

const $ = id => document.getElementById(id);
const qa = s => [...document.querySelectorAll(s)];
const THEMES = [
  ['gothic','Qonli'], ['neon','Neon'], ['royal','Qasr'],
  ['camp','Tabiat'], ['space','Kosmik'], ['rooftop','Tom']
];
const ROLES = {
  mafia: ['Mafia', "Tunda bir o‘yinchini tanlang. Kunduzi o‘zingizni sezdirmang."],
  doctor: ['Doktor', "Har tun bir kishini himoya qiling."],
  sheriff: ['Sherif', "Har tun bir kishining rolini tekshiring."],
  citizen: ['Fuqaro', "Kunduzi ovoz berib mafiyani toping."]
};
const NIGHT_SECONDS = 30, DAY_SECONDS = 60, MAX_PLAYERS = 12;
const now = () => Date.now() + ((window.Net && Net.offset) || 0);

let room = null, S = null, role = null, selected = null;
let lastKey = '', lastPhase = null, lastSeq = -1, busy = false;
let offs = [], fxOn = true, lastSec = -1, initError = '';
let mode = 'starting'; // online | demo | starting
let demoRooms = Object.create(null), demoTimer = null;
let toastTimer = null;
const me = { uid: null, name: '' };
const seatEls = Object.create(null);
const hue = value => {
  let h = 0;
  for (const ch of String(value)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};
const toast = message => {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
};
const go = name => {
  qa('.screen').forEach(screen => screen.classList.add('hidden'));
  const target = $('screen-' + name);
  if (target) target.classList.remove('hidden');
  document.body.dataset.screen = name;
};
const lobbyMessage = message => { if ($('lobbyMsg')) $('lobbyMsg').textContent = message; };
const escapeText = value => String(value ?? '');

const A = window.A || {
  init(){}, play(){}, ambient(){}, say(){}, toggle(){return false;}, setVol(){}
};

/* Effects */
const FX = (() => {
  const canvas = $('fx');
  if (!canvas) return {theme(){}, flash(){}};
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return {theme(){}, flash(){}};
  let width = 0, height = 0, theme = 'gothic';
  const particles = [];
  const configs = {
    gothic: ['220,30,50', 1.2, 0], neon: ['90,230,255', -.4, .5],
    royal: ['255,214,120', .35, .2], camp: ['255,140,40', -1.1, .6],
    space: ['190,225,255', .06, .05], rooftop: ['255,170,80', -.7, .4]
  };
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  window.addEventListener('resize', resize); resize();
  for (let i = 0; i < 48; i++) particles.push({
    x: Math.random()*width, y: Math.random()*height,
    r: .7 + Math.random()*2, speed: .3 + Math.random(), alpha: .25 + Math.random()*.55
  });
  const loop = () => {
    requestAnimationFrame(loop);
    if (document.hidden || !ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!fxOn) return;
    const [color, velocity, drift] = configs[theme] || configs.gothic;
    for (const p of particles) {
      p.y += velocity * p.speed;
      p.x += Math.sin(p.y/42 + p.speed) * drift;
      if (p.y > height + 5) p.y = -5;
      if (p.y < -5) p.y = height + 5;
      ctx.beginPath(); ctx.fillStyle = `rgba(${color},${p.alpha})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
    }
  };
  loop();
  return {
    theme(value){ theme = value; },
    flash(red = false) {
      if (!fxOn) return;
      const flash = document.querySelector('#scene .flash');
      if (!flash) return;
      flash.classList.toggle('red', !!red);
      flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    }
  };
})();

/* Themes */
function setTheme(theme) {
  if (!THEMES.some(item => item[0] === theme)) theme = 'gothic';
  document.body.dataset.theme = theme;
  FX.theme(theme);
  try { localStorage.setItem('s2s-theme', theme); } catch (_) {}
  qa('[data-t]').forEach(button => button.classList.toggle('on', button.dataset.t === theme));
}
['lobbyThemes', 'themeGrid'].forEach(id => {
  const parent = $(id);
  if (!parent) return;
  THEMES.forEach(([key, label]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.t = key; button.className = 'chip';
    button.textContent = label;
    button.addEventListener('click', () => { setTheme(key); A.play('click'); });
    parent.append(button);
  });
});
let savedTheme = 'gothic';
try { savedTheme = localStorage.getItem('s2s-theme') || 'gothic'; } catch (_) {}
setTheme(savedTheme);

/* Intro animation */
if ($('dripRow')) {
  for (let i = 0; i < 14; i++) {
    const drop = document.createElement('i');
    drop.className = 'drip';
    drop.style.cssText = `left:${3+i*7+Math.random()*4}%;width:${6+Math.random()*10}px;--h:${60+Math.random()*180}px;animation-delay:${Math.random()*4}s`;
    $('dripRow').append(drop);
  }
}
if ($('btnEnter')) $('btnEnter').addEventListener('click', () => {
  A.init(); A.play('blood'); A.ambient(true);
  $('screen-intro')?.classList.add('flood');
  setTimeout(() => go('lobby'), 750);
});
/* WebRTC voice is not implemented yet: remove misleading mic button. */
$('btnMic')?.remove();

/* Demo helpers */
function makeDemoRoom(name) {
  let code;
  do { code = String(1000 + Math.floor(Math.random()*9000)); }
  while (demoRooms[code]);
  const hostId = me.uid || 'demo-host-' + Math.random().toString(36).slice(2,8);
  me.uid = hostId;
  const players = {};
  players[hostId] = { name, alive: true, at: now() };
  const demoNames = ['Azizbek','Bekzod','Sardor','Ziyod','Jasur','Kamron','Nodir','Shahzod','Davron','Madina','Asilbek'];
  const count = 5 + Math.floor(Math.random()*4);
  for (let i=0; i<count && Object.keys(players).length<MAX_PLAYERS; i++) {
    const id = 'bot-' + i;
    players[id] = {name: demoNames[i % demoNames.length], alive:true, at:now()+i+1, bot:true};
  }
  demoRooms[code] = {
    host: hostId, phase:'lobby', day:0, mseq:0, endsAt:0, msg:'Demo xona tayyor.',
    players, roles:{}, acts:{}, chat:[], demo:true
  };
  return code;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function demoSnapshot() {
  const source = demoRooms[room];
  return source ? clone(source) : null;
}
function updateDemo(mutator) {
  const source = demoRooms[room];
  if (!source) return;
  mutator(source);
  S = demoSnapshot();
  render();
}
function addDemoChat(name, text, uid = me.uid) {
  if (!room || !demoRooms[room]) return;
  const source = demoRooms[room];
  source.chat = source.chat || [];
  source.chat.push({n:name, t:text, u:uid, at:now()});
  source.chat = source.chat.slice(-60);
  line('', name, text, uid);
}
function startDemoGame() {
  if (!S || !room) return;
  updateDemo(source => {
    const ids = Object.keys(source.players);
    if (ids.length < 4) throw new Error('O‘yinni boshlash uchun kamida 4 kishi kerak.');
    const shuffled = ids.slice().sort(() => Math.random() - .5);
    const mafiaCount = Math.max(1, Math.floor(ids.length/4));
    source.roles = {};
    shuffled.forEach((id, index) => {
      source.roles[id] = index < mafiaCount ? 'mafia' :
        (index === mafiaCount && ids.length >= 5) ? 'doctor' :
        (index === mafiaCount+1 && ids.length >= 6) ? 'sheriff' : 'citizen';
    });
    role = source.roles[me.uid] || 'citizen';
    source.phase = 'night'; source.day = 1;
    source.endsAt = now() + NIGHT_SECONDS*1000;
    source.msg = 'Shahar uxlaydi. Tun boshlandi.';
    source.mseq = (source.mseq||0)+1; source.hit = false;
    source.reveal = null; source.winner = null;
    source.acts = {};
    source.chat = source.chat || [];
  });
  showRoleCard();
}
function showRoleCard() {
  if (!role || !ROLES[role]) return;
  overlay(ROLES[role][0], ROLES[role][1], role, 'Tushunarli');
  A.play('night');
}
function resolveDemo() {
  if (busy || !S || !room || mode !== 'demo' || !['night','day'].includes(S.phase)) return;
  busy = true;
  try {
    updateDemo(source => {
      const players = source.players, roles = source.roles || {}, acts = source.acts || {};
      const alive = Object.keys(players).filter(id => players[id].alive);
      const countVotes = (voters, tieAllowed) => {
        const counts = {};
        voters.forEach(id => {
          const target = acts[id];
          if (target && players[target] && players[target].alive) counts[target] = (counts[target]||0)+1;
        });
        const max = Math.max(0, ...Object.values(counts));
        const leaders = Object.keys(counts).filter(id => counts[id] === max);
        if (!max || (tieAllowed && leaders.length > 1)) return null;
        return leaders[Math.floor(Math.random()*leaders.length)];
      };
      let dead = null, message, next;
      if (source.phase === 'night') {
        const mafia = alive.filter(id => roles[id] === 'mafia');
        const target = mafia.length ? (acts[mafia[0]] || alive.find(id => id !== mafia[0] && !players[id].bot)) : null;
        const doctor = alive.find(id => roles[id] === 'doctor');
        const protectedId = doctor ? acts[doctor] : null;
        const hit = target && target !== protectedId ? target : null;
        if (hit && players[hit]) { dead = hit; message = `Tunda ${players[hit].name} o‘ldirildi.`; }
        else message = target ? 'Doktor jonni saqlab qoldi. Hech kim o‘lmadi.' : 'Tun tinch o‘tdi.';
        const sheriff = alive.find(id => roles[id] === 'sheriff');
        if (sheriff && target) source.privateResult = `Tekshiruv: ${players[target].name} — ${roles[target] === 'mafia' ? 'MAFIA!' : 'begunoh'}`;
        next = 'day';
      } else {
        const votes = {};
        alive.forEach(id => {
          let target = acts[id];
          if (!target && players[id].bot) {
            const mafiaId = alive.find(pid => roles[pid] === 'mafia');
            target = mafiaId && Math.random() < .4 ? mafiaId : alive[Math.floor(Math.random()*alive.length)];
          }
          if (target && players[target] && players[target].alive) votes[target] = (votes[target]||0)+1;
        });
        const max = Math.max(0, ...Object.values(votes));
        const leaders = Object.keys(votes).filter(id => votes[id] === max);
        const voted = max && leaders.length === 1 ? leaders[0] : null;
        if (voted) { dead = voted; message = `${players[voted].name} ovoz bilan chiqarildi. Roli: ${ROLES[roles[voted] || 'citizen'][0]}.`; }
        else message = 'Ovozlar teng bo‘ldi. Hech kim chiqarilmadi.';
        next = 'night';
      }
      if (dead && players[dead]) players[dead].alive = false;
      const left = alive.filter(id => id !== dead);
      const mafiaLeft = left.filter(id => roles[id] === 'mafia').length;
      const winner = mafiaLeft === 0 ? 'citizens' :
        (mafiaLeft >= left.length-mafiaLeft ? 'mafia' : null);
      source.acts = {};
      source.msg = message; source.mseq = (source.mseq||0)+1; source.hit = !!dead;
      if (winner) {
        source.phase = 'over'; source.winner = winner; source.reveal = clone(roles); source.endsAt = 0;
      } else {
        source.phase = next; source.day = next === 'night' ? source.day+1 : source.day;
        source.endsAt = now() + (next === 'night' ? NIGHT_SECONDS : DAY_SECONDS)*1000;
      }
    });
  } catch (error) { console.error(error); }
  finally { setTimeout(() => { busy = false; }, 700); }
}

/* Initialize network if configured; otherwise demo mode is ready. */
(async () => {
  try {
    if (!window.Net || !Net.ok) throw new Error('Firebase konfiguratsiyasi kiritilmagan');
    await Net.init();
    me.uid = Net.uid;
    mode = 'online';
    lobbyMessage('Online rejim tayyor.');
  } catch (error) {
    initError = error?.message || 'Firebase ulanmagan';
    mode = 'demo';
    me.uid = 'demo-' + Math.random().toString(36).slice(2,10);
    lobbyMessage('DEMO rejimi: onlayn ulanish yo‘q, dizaynni sinashingiz mumkin.');
  }
})();

/* Lobby / enter */
async function enterRoom(createOrJoin) {
  const name = ($('inpName')?.value || '').trim();
  if (name.length < 2) return lobbyMessage('Ismingizni yozing (kamida 2 harf).');
  if (mode === 'starting') return lobbyMessage('Bir necha soniya kuting...');
  me.name = name;
  try {
    lobbyMessage('');
    if (mode === 'demo') {
      const code = await createOrJoin(name);
      join(code);
      return;
    }
    const code = await createOrJoin(name);
    join(code);
  } catch (error) {
    lobbyMessage(error?.message || 'Xatolik yuz berdi.');
  }
}
if ($('btnCreate')) $('btnCreate').addEventListener('click', () => enterRoom(name => {
  if (mode === 'demo') return makeDemoRoom(name);
  return Net.create(name);
}));
if ($('btnJoin')) $('btnJoin').addEventListener('click', () => {
  const code = ($('inpCode')?.value || '').trim();
  if (!/^\d{4}$/.test(code)) return lobbyMessage('Xona kodi 4 ta raqam bo‘lishi kerak.');
  enterRoom(name => {
    if (mode === 'demo') {
      if (!demoRooms[code]) throw new Error('Demo rejimida boshqa qurilmadagi xonaga ulanib bo‘lmaydi. Yangi demo xona yarating.');
      const source = demoRooms[code];
      if (Object.keys(source.players).length >= MAX_PLAYERS) throw new Error('Xona to‘la (12/12).');
      source.players[me.uid] = {name, alive:true, at:now()};
      return code;
    }
    return Net.join(code, name);
  });
});

function join(code) {
  room = String(code); S = null; role = null; selected = null;
  lastKey = ''; lastPhase = null; lastSeq = -1; busy = false;
  $('chatLog').innerHTML = '';
  Object.keys(seatEls).forEach(id => { seatEls[id].remove(); delete seatEls[id]; });
  if (mode === 'demo') {
    const source = demoRooms[room];
    if (!source) { lobbyMessage('Demo xona topilmadi.'); return; }
    S = demoSnapshot();
    (S.chat || []).forEach(message => line('', message.n, message.t, message.u));
    go('room'); render();
    return;
  }
  offs = [
    Net.watch(room, onPublic),
    Net.watchChat(room, message => line('', message.n, message.t, message.u)),
    Net.watchRole(room, onRole),
    Net.watchRes(room, onResult)
  ];
  go('room');
}
function leave() {
  offs.forEach(unsubscribe => { try { unsubscribe(); } catch (_) {} });
  offs = [];
  const oldRoom = room, oldState = S;
  if (mode === 'online' && oldRoom) Net.leave(oldRoom, oldState).catch(() => {});
  room = null; S = null; role = null; selected = null;
  Object.keys(seatEls).forEach(id => { seatEls[id].remove(); delete seatEls[id]; });
  $('overlay')?.classList.add('hidden'); $('sheet')?.classList.add('hidden');
  document.body.classList.remove('chat-off');
  go('lobby');
}
function onPublic(state) {
  if (!state) { if (room) { toast('Xona yopildi'); leave(); } return; }
  S = state; render();
}
function onRole(value) {
  if (!value || role === value) return;
  role = value;
  if (ROLES[role]) overlay(ROLES[role][0], ROLES[role][1], role, 'Tushunarli');
  A.play('night'); renderBar();
}
function onResult(value) {
  if (value) { line('sys', '', '🔎 ' + value); toast(value); }
}

/* Room render */
const order = players => Object.keys(players || {}).sort((a,b) =>
  ((players[a].at||0)-(players[b].at||0)) || (a < b ? -1 : 1));
function render() {
  if (!S || !room) return;
  const players = S.players || {}, ids = order(players), count = ids.length;
  const isHost = S.host === me.uid;
  $('roomId').textContent = room;
  $('playerCount').textContent = count + '/' + MAX_PLAYERS;
  document.body.dataset.phase = S.phase === 'day' ? 'day' : 'night';
  $('phaseUse')?.setAttribute('href', S.phase === 'day' ? '#i-sun' : '#i-moon');
  $('phaseLabel').textContent = S.phase === 'lobby' ? 'Kutilmoqda' :
    S.phase === 'over' ? 'Yakun' : (S.phase === 'day' ? 'Kun ' : 'Tun ') + S.day;
  $('tableText').textContent = S.phase === 'lobby'
    ? (count < 4 ? 'Kamida 4 kishi kerak' : 'Boshlashga tayyor')
    : S.phase === 'over' ? (S.winner === 'mafia' ? 'Mafia g‘alaba qildi' : 'Fuqarolar g‘alaba qildi')
    : (S.msg || 'Mafia');
  $('btnStart').classList.toggle('hidden', !(isHost && S.phase === 'lobby' && count >= 4));
  const key = S.phase + ':' + S.day;
  if (key !== lastKey) { lastKey = key; selected = null; }
  if (lastPhase !== null && S.phase !== lastPhase && S.phase !== 'over') {
    FX.flash();
    if (S.phase === 'night') { A.play('night'); A.say('Tun boshlandi. Shahar uxlaydi.'); }
    if (S.phase === 'day') { A.play('day'); A.say('Kun boshlandi. Hamma uyg‘ondi.'); }
  }
  lastPhase = S.phase;
  if ((S.mseq || 0) !== lastSeq) {
    if (lastSeq !== -1 && S.msg) {
      line('sys', '', '☾ ' + S.msg);
      if (S.hit) { A.play('kill'); FX.flash(true); }
    }
    lastSeq = S.mseq || 0;
  }
  if (S.phase === 'over' && !$('overlay').dataset.over) {
    $('overlay').dataset.over = '1';
    overlay(S.winner === 'mafia' ? 'Mafia g‘alaba qildi' : 'Fuqarolar g‘alaba qildi',
      'O‘yin tugadi. Rollar ochildi.', S.winner === 'mafia' ? 'mafia' : 'citizen',
      'Lobbiga qaytish', true);
  }
  renderSeats(); renderBar(); renderPlayerList();
}
function renderSeats() {
  const players = S?.players || {}, ids = order(players), count = ids.length;
  Object.keys(seatEls).forEach(id => {
    if (!players[id]) { seatEls[id].remove(); delete seatEls[id]; }
  });
  ids.forEach((id, index) => {
    let element = seatEls[id];
    if (!element) {
      element = seatEls[id] = document.createElement('div');
      element.className = 'seat';
      element.innerHTML = '<div class="av"><i class="num"></i><i class="crown"><svg class="ic"><use href="#i-crown"></use></svg></i><b></b><i class="st"></i></div><div class="nm"></div>';
      element.addEventListener('click', () => pick(id));
      $('seats').append(element);
    }
    const angle = (-90 + 360*index/Math.max(count,1))*Math.PI/180;
    element.style.left = (50 + 43*Math.cos(angle)) + '%';
    element.style.top = (50 + 41*Math.sin(angle)) + '%';
    element.style.setProperty('--h', hue(id));
    element.querySelector('.num').textContent = index+1;
    element.querySelector('b').textContent = (players[id].name || '?').slice(0,1).toUpperCase();
    const revealedRole = S.reveal && S.reveal[id];
    element.querySelector('.nm').textContent = (players[id].name || 'O‘yinchi') +
      (revealedRole && ROLES[revealedRole] ? ' · ' + ROLES[revealedRole][0] : '');
    element.classList.toggle('me', id === me.uid);
    element.classList.toggle('host', id === S.host);
    element.classList.toggle('dead', !players[id].alive);
    element.classList.toggle('pick', id === selected);
  });
}
function canAct() {
  const player = S?.players?.[me.uid];
  if (!player || !player.alive || !S) return false;
  return S.phase === 'day' || (S.phase === 'night' && ['mafia','doctor','sheriff'].includes(role));
}
function renderBar() {
  qa('.role-btn').forEach(button => {
    const r = button.dataset.role;
    button.classList.toggle('on', r === role);
    button.classList.toggle('act', r === role && canAct());
  });
}
function renderPlayerList() {
  if (!S) return;
  const players = S.players || {}, list = $('playerList');
  list.innerHTML = '';
  order(players).forEach((id, index) => {
    const item = document.createElement('li');
    item.className = players[id].alive ? '' : 'dead';
    const revealedRole = S.reveal && S.reveal[id];
    item.textContent = `${index+1}. ${players[id].name || 'O‘yinchi'}${id===S.host?' 👑':''}${id===me.uid?' (siz)':''} — ${players[id].alive?'tirik':'o‘lgan'}${revealedRole&&ROLES[revealedRole]?' · '+ROLES[revealedRole][0]:''}`;
    list.append(item);
  });
}
function pick(id) {
  if (!S || S.phase === 'lobby' || S.phase === 'over') return;
  const players = S.players || {}, player = players[me.uid];
  if (!player || !player.alive) return toast('Siz o‘yindan chiqdingiz.');
  if (!players[id] || !players[id].alive) return;
  if (S.phase === 'night') {
    if (!['mafia','doctor','sheriff'].includes(role)) return toast('Tunda maxsus rol harakat qiladi.');
    if (id === me.uid && role !== 'doctor') return toast('O‘zingizni tanlay olmaysiz.');
  } else if (id === me.uid) return toast('O‘zingizga ovoz bera olmaysiz.');
  selected = id;
  if (mode === 'demo') {
    demoRooms[room].acts[me.uid] = id;
    S = demoSnapshot();
  } else {
    Net.act(room, id).catch(error => toast('Xatolik: ' + error.message));
  }
  A.play('click');
  toast((S.phase === 'night' ? 'Tanlandi: ' : 'Ovoz berildi: ') + players[id].name);
  renderSeats();
}

/* Chat */
function line(cls, name, text, uid) {
  const log = $('chatLog');
  if (!log) return;
  const row = document.createElement('div');
  row.className = 'ln ' + (cls || '');
  if (name) {
    const bold = document.createElement('b');
    bold.textContent = name + ': ';
    bold.style.color = `hsl(${hue(uid)} 80% 70%)`;
    row.append(bold);
  }
  row.append(document.createTextNode(escapeText(text)));
  log.append(row);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
if ($('chatForm')) $('chatForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('chatInput'), text = input.value.trim();
  if (!text || !room || !me.name) return;
  input.value = '';
  if (mode === 'demo') addDemoChat(me.name, text, me.uid);
  else Net.chat(room, me.name, text).catch(() => toast('Xabar yuborilmadi.'));
});

/* Panels */
const TITLES = {players:'O‘yinchilar', cards:'Kartalar', settings:'Sozlamalar'};
function openSheet(tab) {
  qa('.pane').forEach(pane => pane.classList.add('hidden'));
  $('pane-' + tab)?.classList.remove('hidden');
  $('sheetTitle').textContent = TITLES[tab] || 'Panel';
  $('sheet').classList.remove('hidden');
}
qa('.dock-btn').forEach(button => button.addEventListener('click', () => {
  A.play('click');
  const tab = button.dataset.tab;
  if (tab === 'chat') {
    document.body.classList.toggle('chat-off');
    if (!document.body.classList.contains('chat-off')) $('chatInput')?.focus();
  } else openSheet(tab);
}));
$('sheetClose')?.addEventListener('click', () => $('sheet').classList.add('hidden'));
$('btnSettings')?.addEventListener('click', () => openSheet('settings'));
Object.entries(ROLES).forEach(([key, [name, description]]) => {
  const card = document.createElement('div');
  card.className = 'rcard';
  const heading = document.createElement('h4'); heading.textContent = name;
  const paragraph = document.createElement('p'); paragraph.textContent = description;
  card.append(heading, paragraph); $('cardList')?.append(card);
});
qa('.role-btn').forEach(button => button.addEventListener('click', () => {
  A.play('click');
  const key = button.dataset.role;
  if (role) toast(ROLES[key][0] + ': ' + ROLES[key][1] + (key === role ? ' (sizning rolingiz)' : ''));
  else toast(ROLES[key][0] + ': ' + ROLES[key][1]);
}));
$('btnSound')?.addEventListener('click', () => {
  const muted = A.toggle();
  $('soundUse')?.setAttribute('href', muted ? '#i-mute' : '#i-speaker');
});
$('volRange')?.addEventListener('input', event => A.setVol(+event.target.value));
$('chkAmbient')?.addEventListener('change', event => A.ambient(event.target.checked));
$('chkFx')?.addEventListener('change', event => { fxOn = event.target.checked; });
$('btnCopy')?.addEventListener('click', async () => {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(room); toast('Kod nusxalandi: ' + room); }
    else toast('Xona kodi: ' + room);
  } catch (_) { toast('Xona kodi: ' + room); }
});
$('btnExit')?.addEventListener('click', () => { if (confirm('Xonadan chiqasizmi?')) leave(); });
$('btnStart')?.addEventListener('click', () => {
  if (mode === 'demo') { try { startDemoGame(); } catch (error) { toast(error.message); } }
  else startOnlineGame().catch(error => toast('Xatolik: ' + error.message));
});
$('overlayBtn')?.addEventListener('click', () => {
  const overlayElement = $('overlay');
  overlayElement.classList.add('hidden');
  if (overlayElement.dataset.over) {
    delete overlayElement.dataset.over;
    if (mode === 'demo' && room && demoRooms[room]) {
      const source = demoRooms[room];
      source.phase = 'lobby'; source.day = 0; source.endsAt = 0; source.winner = null;
      source.roles = {}; source.acts = {}; source.reveal = null; source.msg = 'Yangi o‘yin uchun tayyor.';
      Object.values(source.players).forEach(player => player.alive = true);
      role = null; S = demoSnapshot(); render();
    } else leave();
  }
});

/* Online host logic */
async function startOnlineGame() {
  if (!S || !room) return;
  const players = S.players || {}, ids = Object.keys(players), count = ids.length;
  if (count < 4) return toast('Kamida 4 o‘yinchi kerak.');
  const shuffled = ids.slice().sort(() => Math.random() - .5);
  const mafiaCount = Math.max(1, Math.floor(count/4)), roles = {}, updates = {};
  shuffled.forEach((id, index) => {
    roles[id] = index < mafiaCount ? 'mafia' :
      (index === mafiaCount && count >= 5) ? 'doctor' :
      (index === mafiaCount+1 && count >= 6) ? 'sheriff' : 'citizen';
  });
  ids.forEach(id => { updates['roles/'+id] = roles[id]; });
  const mafiaNames = ids.filter(id => roles[id] === 'mafia').map(id => players[id].name).join(', ');
  ids.filter(id => roles[id] === 'mafia').forEach(id => { updates['res/'+id] = 'Mafia jamoasi: ' + mafiaNames; });
  await Net.update(room, updates);
  await Net.update(room, {
    'pub/phase':'night', 'pub/day':1, 'pub/endsAt':now()+NIGHT_SECONDS*1000,
    'pub/msg':'Shahar uxlaydi. Mafia uyg‘ondi...', 'pub/mseq':(S.mseq||0)+1, 'pub/hit':false
  });
}
async function resolveOnline() {
  if (busy || !S || !room) return;
  busy = true;
  try {
    const players = S.players || {}, alive = Object.keys(players).filter(id => players[id].alive);
    const roles = (await Net.val(room, 'roles')) || {};
    const acts = (await Net.val(room, 'acts')) || {};
    const tally = (voters, tieAllowed) => {
      const counts = {};
      voters.forEach(id => {
        const target = acts[id];
        if (target && players[target] && players[target].alive) counts[target] = (counts[target]||0)+1;
      });
      const max = Math.max(0, ...Object.values(counts));
      const leaders = Object.keys(counts).filter(id => counts[id] === max);
      return (!max || (tieAllowed && leaders.length > 1)) ? null : leaders[Math.floor(Math.random()*leaders.length)];
    };
    let dead = null, message, next;
    if (S.phase === 'night') {
      const target = tally(alive.filter(id => roles[id] === 'mafia'), false);
      const saved = tally(alive.filter(id => roles[id] === 'doctor'), false);
      const checked = tally(alive.filter(id => roles[id] === 'sheriff'), false);
      if (target && target !== saved) { dead = target; message = `Tunda ${players[target].name} o‘ldirildi.`; }
      else message = target ? 'Doktor jonni saqlab qoldi. Hech kim o‘lmadi.' : 'Tun tinch o‘tdi.';
      if (checked) alive.filter(id => roles[id] === 'sheriff').forEach(id => {
        Net.update(room, {['res/'+id]:`${players[checked].name} — ${roles[checked]==='mafia'?'MAFIA!':'begunoh'}`}).catch(()=>{});
      });
      next = 'day';
    } else {
      dead = tally(alive, true);
      message = dead ? `${players[dead].name} xalq ovozi bilan chiqarildi. Roli: ${ROLES[roles[dead]]?.[0] || 'noma’lum'}.`
        : 'Ovozlar teng bo‘ldi. Hech kim chiqarilmadi.';
      next = 'night';
    }
    const updates = {};
    if (dead) updates['pub/players/'+dead+'/alive'] = false;
    const survivors = alive.filter(id => id !== dead);
    const mafiaCount = survivors.filter(id => roles[id] === 'mafia').length;
    const winner = mafiaCount === 0 ? 'citizens' : (mafiaCount >= survivors.length-mafiaCount ? 'mafia' : null);
    updates.acts = null;
    updates['pub/msg'] = message; updates['pub/mseq'] = (S.mseq||0)+1; updates['pub/hit'] = !!dead;
    if (winner) {
      updates['pub/phase'] = 'over'; updates['pub/winner'] = winner;
      updates['pub/reveal'] = roles; updates['pub/endsAt'] = 0;
    } else {
      updates['pub/phase'] = next;
      updates['pub/day'] = next === 'night' ? S.day+1 : S.day;
      updates['pub/endsAt'] = now() + (next === 'night' ? NIGHT_SECONDS : DAY_SECONDS)*1000;
    }
    await Net.update(room, updates);
  } catch (error) { console.error(error); toast('O‘yin holatini yangilashda xatolik.'); }
  finally { setTimeout(() => { busy = false; }, 1200); }
}

/* Timer */
setInterval(() => {
  if (!S || !room) return;
  const active = S.phase === 'night' || S.phase === 'day';
  const seconds = Math.max(0, Math.ceil(((S.endsAt||0)-now())/1000));
  $('timer').textContent = active
    ? `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`
    : '--:--';
  $('hud')?.classList.toggle('warn', active && seconds <= 10);
  if (active && seconds <= 10 && seconds > 0 && seconds !== lastSec) { lastSec = seconds; A.play('heart'); }
  if (active && seconds === 0 && S.host === me.uid) {
    if (mode === 'demo') resolveDemo();
    else resolveOnline();
  }
}, 500);
window.addEventListener('resize', () => { if (S) renderSeats(); });
})();'''

path = Path("/mnt/data/game.js")
path.write_text(code, encoding="utf-8")
print(f"Fayl tayyor: {path} ({len(code.splitlines())} qator)")
