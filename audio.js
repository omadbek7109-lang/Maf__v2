/* S2S Mafia — audio.js: Web Audio ovozlari (tashqi fayl yo'q) */
const A=(()=>{
let c,mg,nb,wg,vol=.6,mute=false,amb=false,tm;
const init=()=>{
  if(c){c.resume();return}
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  c=new C();mg=c.createGain();mg.gain.value=vol;mg.connect(c.destination);
  nb=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
  const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  const w=c.createBufferSource();w.buffer=nb;w.loop=true;
  const f=c.createBiquadFilter();f.type='bandpass';f.frequency.value=380;f.Q.value=.7;
  wg=c.createGain();wg.gain.value=amb?.08:0;
  const o=c.createOscillator(),og=c.createGain();o.frequency.value=.12;og.gain.value=.04;
  o.connect(og);og.connect(wg.gain);o.start();
  w.connect(f);f.connect(wg);wg.connect(mg);w.start();
};
const nz=(fr,q,du,g,ty='bandpass',dl=0)=>{
  if(!c)return;const s=c.createBufferSource();s.buffer=nb;
  const f=c.createBiquadFilter();f.type=ty;f.frequency.value=fr;f.Q.value=q;
  const v=c.createGain(),t=c.currentTime+dl;
  v.gain.setValueAtTime(.0001,t);v.gain.linearRampToValueAtTime(g,t+du*.2);v.gain.exponentialRampToValueAtTime(.001,t+du);
  s.connect(f);f.connect(v);v.connect(mg);s.start(t,Math.random());s.stop(t+du+.05);
};
const tn=(fr,du,g,ty='sine',to=null,dl=0)=>{
  if(!c)return;const o=c.createOscillator(),v=c.createGain(),t=c.currentTime+dl;
  o.type=ty;o.frequency.setValueAtTime(fr,t);if(to)o.frequency.exponentialRampToValueAtTime(to,t+du);
  v.gain.setValueAtTime(g,t);v.gain.exponentialRampToValueAtTime(.001,t+du);
  o.connect(v);v.connect(mg);o.start(t);o.stop(t+du+.05);
};
const bell=(f,dl=0,g=.18)=>[1,2.76,5.4].forEach((m,i)=>tn(f*m,2.4/(i+1),g/(i+1),'sine',null,dl));
const K={
  click:()=>tn(660,.06,.12,'square'),
  blood:()=>{[0,.45,.9].forEach((d,i)=>tn(220-i*30,.35,.25,'sine',70,d));nz(160,1,1.4,.25,'lowpass')},
  kill:()=>{nz(260,.7,.9,.5,'lowpass');tn(80,1,.5,'sawtooth',28)},
  night:()=>{bell(147,0,.2);tn(55,3,.25,'sine',40)},
  day:()=>{bell(523);bell(659,.25);bell(784,.5)},
  step:()=>{for(let i=0;i<5;i++)nz(420,2,.12,.14,'bandpass',i*.55)},
  creak:()=>tn(80,1.4,.09,'sawtooth',160),
  heart:()=>{tn(52,.2,.55,'sine',38);tn(48,.22,.45,'sine',34,.28)},
  whisper:()=>nz(2600,3,1.8,.05),
  far:()=>bell(196,0,.06)
};
const loop=()=>{
  clearTimeout(tm);if(!amb)return;
  tm=setTimeout(()=>{const k=['step','creak','whisper','heart','far'];play(k[Math.random()*k.length|0]);loop()},5000+Math.random()*9000);
};
const play=n=>{if(c&&!mute&&K[n])K[n]()};
return{
  init,play,
  ambient(b){amb=b;if(wg)wg.gain.value=b?.08:0;loop()},
  setVol(v){vol=v/100;if(mg)mg.gain.value=mute?0:vol},
  toggle(){mute=!mute;if(mg)mg.gain.value=mute?0:vol;return mute},
  say(t){ /* O'zbekcha ovoz faqat qurilmada uz ovozi bo'lsa ishlaydi */
    if(mute||!window.speechSynthesis)return;
    const v=speechSynthesis.getVoices().find(x=>/^uz/i.test(x.lang));if(!v)return;
    const u=new SpeechSynthesisUtterance(t);u.voice=v;u.lang=v.lang;u.rate=.9;speechSynthesis.speak(u);
  }
};
})();
