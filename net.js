/* S2S Mafia — net.js: Firebase (anonim kirish + Realtime Database)
   1) Firebase konsolida: Authentication → Anonymous yoqing; Realtime Database yarating.
   2) Quyidagi FIREBASE_CONFIG ga o'z kalitlaringizni qo'ying (Project settings → Web app).
   3) Realtime Database → Rules ga shuni qo'ying:
{"rules":{"rooms":{"$c":{
 "pub":{".read":"auth!=null",
   ".write":"auth!=null && (!data.exists() || data.child('host').val()===auth.uid)",
   "players":{"$u":{".write":"auth!=null && $u===auth.uid"}}},
 "roles":{".read":"auth!=null && root.child('rooms/'+$c+'/pub/host').val()===auth.uid",
   ".write":"auth!=null && root.child('rooms/'+$c+'/pub/host').val()===auth.uid",
   "$u":{".read":"auth!=null && $u===auth.uid"}},
 "acts":{".read":"auth!=null && root.child('rooms/'+$c+'/pub/host').val()===auth.uid",
   ".write":"auth!=null && root.child('rooms/'+$c+'/pub/host').val()===auth.uid",
   "$u":{".write":"auth!=null && $u===auth.uid"}},
 "res":{".write":"auth!=null && root.child('rooms/'+$c+'/pub/host').val()===auth.uid",
   "$u":{".read":"auth!=null && $u===auth.uid"}},
 "chat":{".read":"auth!=null",".write":"auth!=null"}
}}}}
   Firebase web kalitlari maxfiy emas, lekin xavfsizlik Rules orqali ta'minlanadi. */
const FIREBASE_CONFIG={apiKey:"",authDomain:"",databaseURL:"",projectId:"",appId:""};

const Net=(()=>{
let db,uid=null;
const ref=p=>db.ref(p),TS=()=>firebase.database.ServerValue.TIMESTAMP;
return{
  offset:0,
  get uid(){return uid},
  get ok(){return !!FIREBASE_CONFIG.apiKey},
  async init(){
    if(!this.ok)throw new Error("net.js ichiga Firebase kalitlarini kiriting");
    firebase.initializeApp(FIREBASE_CONFIG);db=firebase.database();
    uid=(await firebase.auth().signInAnonymously()).user.uid;
    db.ref('.info/serverTimeOffset').on('value',s=>{this.offset=s.val()||0});
  },
  async create(name){
    for(let i=0;i<8;i++){
      const code=String(1000+(Math.random()*9000|0));
      if((await ref(`rooms/${code}/pub`).get()).exists())continue;
      await ref(`rooms/${code}/pub`).set({host:uid,phase:'lobby',day:0,mseq:0,endsAt:0});
      await ref(`rooms/${code}/pub/players/${uid}`).set({name,alive:true,at:TS()});
      return code;
    }
    throw new Error("Xona yaratib bo'lmadi, qayta urining");
  },
  async join(code,name){
    const s=await ref(`rooms/${code}/pub`).get();
    if(!s.exists())throw new Error("Bunday xona topilmadi");
    const v=s.val(),P=v.players||{};
    if(!P[uid]){
      if(v.phase!=='lobby')throw new Error("O'yin allaqachon boshlangan");
      if(Object.keys(P).length>=12)throw new Error("Xona to'la (12/12)");
      await ref(`rooms/${code}/pub/players/${uid}`).set({name,alive:true,at:TS()});
    }
    return code;
  },
  async leave(code,S){
    if(!code||!S||S.phase!=='lobby')return;
    if(S.host===uid)await ref(`rooms/${code}/pub`).remove();
    else await ref(`rooms/${code}/pub/players/${uid}`).remove();
  },
  watch(code,cb){const r=ref(`rooms/${code}/pub`);r.on('value',s=>cb(s.val()));return()=>r.off()},
  watchRole(code,cb){const r=ref(`rooms/${code}/roles/${uid}`);r.on('value',s=>cb(s.val()));return()=>r.off()},
  watchRes(code,cb){const r=ref(`rooms/${code}/res/${uid}`);r.on('value',s=>cb(s.val()));return()=>r.off()},
  watchChat(code,cb){const r=ref(`rooms/${code}/chat`).limitToLast(40);r.on('child_added',s=>cb(s.val()));return()=>r.off()},
  chat(code,n,t){return ref(`rooms/${code}/chat`).push({n,t,u:uid})},
  act(code,t){return ref(`rooms/${code}/acts/${uid}`).set(t)},
  val(code,p){return ref(`rooms/${code}/${p}`).get().then(s=>s.val())},
  update(code,u){return ref(`rooms/${code}`).update(u)}
};
})();
