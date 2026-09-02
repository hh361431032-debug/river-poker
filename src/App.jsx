import React, { useCallback, useEffect, useRef, useState } from "react";
import { Users, LogOut, Copy, Check, Plus, DoorOpen, RefreshCw, Crown, MessageCircle, Send } from "lucide-react";
import { storage } from "./services/storage";
import { supabase } from "./services/supabase";
import Dealer from "./components/Dealer";
import ChatRoom from "./components/ChatRoom";

const SUITS = ["s", "h", "d", "c"];
const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_COLOR = { s: "#1E1A17", h: "#A12F3A", d: "#A12F3A", c: "#1E1A17" };
const SMALL_BLIND = 10, BIG_BLIND = 20, STARTING_CHIPS = 1000, MIN_PLAYERS = 2, MAX_PLAYERS = 8;
const HAND_NAMES = ["高牌", "一对", "两对", "三条", "顺子", "同花", "葫芦", "四条", "同花顺"];

function freshDeck(){ const d=[]; for(const s of SUITS) for(let r=2;r<=14;r++) d.push({r,s}); return d; }
function shuffle(deck){ const d=[...deck]; for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];} return d; }
function rankLabel(r){ return r===14?"A":r===13?"K":r===12?"Q":r===11?"J":r===10?"10":String(r); }
function simpleHash(str){ let h1=0xdeadbeef,h2=0x41c6ce57; for(let i=0;i<str.length;i++){const ch=str.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);} h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return(4294967296*(2097151&h2)+(h1>>>0)).toString(36); }
function genRoomCode(){ const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({length:5},()=>c[Math.floor(Math.random()*c.length)]).join(""); }
function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

function evaluate5(cards){
  const ranks=cards.map(c=>c.r).sort((a,b)=>b-a), suits=cards.map(c=>c.s), isFlush=suits.every(s=>s===suits[0]);
  const counts={}; for(const r of ranks) counts[r]=(counts[r]||0)+1;
  const byCount=Object.entries(counts).map(([r,c])=>[Number(r),c]).sort((a,b)=>(b[1]-a[1])||(b[0]-a[0]));
  const uniq=[...new Set(ranks)]; let straightHigh=null;
  if(uniq.length===5){ if(uniq[0]-uniq[4]===4) straightHigh=uniq[0]; else if(uniq.join(",")==="14,5,4,3,2") straightHigh=5; }
  if(straightHigh&&isFlush)return[8,straightHigh];
  if(byCount[0][1]===4)return[7,byCount[0][0],byCount[1][0]];
  if(byCount[0][1]===3&&byCount[1][1]===2)return[6,byCount[0][0],byCount[1][0]];
  if(isFlush)return[5,...ranks];
  if(straightHigh)return[4,straightHigh];
  if(byCount[0][1]===3)return[3,byCount[0][0],...byCount.slice(1).map(x=>x[0])];
  if(byCount[0][1]===2&&byCount[1][1]===2){const pairs=[byCount[0][0],byCount[1][0]].sort((a,b)=>b-a);return[2,...pairs,byCount[2][0]];}
  if(byCount[0][1]===2)return[1,byCount[0][0],...byCount.slice(1).map(x=>x[0])];
  return[0,...ranks];
}
function compareScore(a,b){ for(let i=0;i<Math.max(a.length,b.length);i++){const av=a[i]??0,bv=b[i]??0;if(av!==bv)return av-bv;}return 0; }
function combinations5(c){const o=[];for(let a=0;a<c.length;a++)for(let b=a+1;b<c.length;b++)for(let d=b+1;d<c.length;d++)for(let e=d+1;e<c.length;e++)for(let f=e+1;f<c.length;f++)o.push([c[a],c[b],c[d],c[e],c[f]]);return o;}
function bestScore(cards){if(cards.length<5)return[-1];let best=null;for(const combo of combinations5(cards)){const s=evaluate5(combo);if(!best||compareScore(s,best)>0)best=s;}return best;}
function nextSeat(room,from,fn){const n=room.players.length;for(let step=1;step<=n;step++){const i=(from+step)%n;if(fn(room.players[i]))return i;}return-1;}

function startHand(room){
  const r=deepClone(room);
  r.players=r.players.filter(p=>p.chips>0);
  if(r.players.length<2){r.stage="waiting";r.status="waiting";return r;}
  r.players.forEach(p=>Object.assign(p,{cards:[],folded:false,allIn:false,bet:0,totalContributed:0,hasActed:false,inHand:true}));
  r.deck=shuffle(freshDeck());r.community=[];r.pot=0;r.currentBet=0;r.minRaise=BIG_BLIND;r.log=[];r.handNumber=(r.handNumber||0)+1;r.status="playing";r.stage="preflop";
  r.dealerIndex=r.dealerIndex==null?0:(r.dealerIndex+1)%r.players.length;
  for(let i=0;i<2;i++)r.players.forEach(p=>p.cards.push(r.deck.pop()));
  const n=r.players.length;let sb,bb,first;
  if(n===2){sb=r.dealerIndex;bb=(r.dealerIndex+1)%n;first=sb;}else{sb=nextSeat(r,r.dealerIndex,()=>true);bb=nextSeat(r,sb,()=>true);first=nextSeat(r,bb,()=>true);}
  const blind=(idx,amount)=>{const p=r.players[idx],pay=Math.min(amount,p.chips);p.chips-=pay;p.bet+=pay;p.totalContributed+=pay;if(!p.chips)p.allIn=true;r.pot+=pay;};
  blind(sb,SMALL_BLIND);blind(bb,BIG_BLIND);r.currentBet=BIG_BLIND;r.turnIndex=first;r.log.push(`第 ${r.handNumber} 局开始，庄家：${r.players[r.dealerIndex].name}`);return r;
}
function awardSingle(r){const w=r.players.find(p=>p.inHand&&!p.folded);if(w){w.chips+=r.pot;r.log.push(`${w.name} 赢得彩池 ${r.pot} 筹码（其他玩家弃牌）`);}r.pot=0;r.stage="handover";}
function distributePots(r){
  const contributors=r.players.filter(p=>p.inHand&&p.totalContributed>0);
  const levels=[...new Set(contributors.map(p=>p.totalContributed))].sort((a,b)=>a-b);let prev=0;
  for(const level of levels){
    const eligible=contributors.filter(p=>p.totalContributed>=level),amount=(level-prev)*eligible.length;prev=level;if(amount<=0)continue;
    const contenders=eligible.filter(p=>!p.folded);if(!contenders.length)continue;
    const scored=contenders.map(p=>({p,score:bestScore([...p.cards,...r.community])})).sort((a,b)=>compareScore(b.score,a.score));
    const top=scored[0].score,winners=scored.filter(x=>compareScore(x.score,top)===0),share=Math.floor(amount/winners.length);
    winners.forEach((w,i)=>w.p.chips+=share+(i<amount-share*winners.length?1:0));
    r.log.push(`${winners.map(w=>w.p.name).join("、")} 以「${HAND_NAMES[top[0]]}」赢得 ${amount} 筹码`);
  }r.pot=0;r.stage="handover";
}
function contestants(r){return r.players.filter(p=>p.inHand&&!p.folded&&!p.allIn);}
function dealCommunity(r,n){r.deck.pop();for(let i=0;i<n;i++)r.community.push(r.deck.pop());}
function resetBets(r){r.players.forEach(p=>{p.bet=0;if(p.inHand&&!p.folded&&!p.allIn)p.hasActed=false;});r.currentBet=0;r.minRaise=BIG_BLIND;}
function advanceStage(r){
  const remaining=r.players.filter(p=>p.inHand&&!p.folded);if(remaining.length<=1){awardSingle(r);return r;}
  if(r.stage==="preflop"){resetBets(r);dealCommunity(r,3);r.stage="flop";}
  else if(r.stage==="flop"){resetBets(r);dealCommunity(r,1);r.stage="turn";}
  else if(r.stage==="turn"){resetBets(r);dealCommunity(r,1);r.stage="river";}
  else if(r.stage==="river"){distributePots(r);return r;}
  if(contestants(r).length<2)return advanceStage(r);
  r.turnIndex=nextSeat(r,r.dealerIndex,p=>p.inHand&&!p.folded&&!p.allIn);return r;
}
function applyAction(room,name,action,amount){
  const idx=room.players.findIndex(p=>p.name===name);if(idx<0||idx!==room.turnIndex)return room;const src=room.players[idx];if(!src.inHand||src.folded||src.allIn)return room;
  const r=deepClone(room),p=r.players[idx];
  if(action==="fold"){p.folded=true;p.hasActed=true;r.log.push(`${p.name} 弃牌`);}
  else if(action==="check"){if(r.currentBet>p.bet)return room;p.hasActed=true;r.log.push(`${p.name} 过牌`);}
  else if(action==="call"){const call=Math.min(r.currentBet-p.bet,p.chips);p.chips-=call;p.bet+=call;p.totalContributed+=call;r.pot+=call;if(!p.chips)p.allIn=true;p.hasActed=true;r.log.push(`${p.name} 跟注 ${call}`);}
  else if(action==="raise"){const raiseTo=Math.min(Number(amount)||0,p.bet+p.chips),delta=raiseTo-p.bet;if(delta<=0||raiseTo<=r.currentBet)return room;p.chips-=delta;p.bet=raiseTo;p.totalContributed+=delta;r.pot+=delta;if(!p.chips)p.allIn=true;const size=raiseTo-r.currentBet;r.currentBet=raiseTo;if(size>=r.minRaise)r.minRaise=size;r.players.forEach((pl,i)=>{if(i!==idx&&pl.inHand&&!pl.folded&&!pl.allIn)pl.hasActed=false;});p.hasActed=true;r.log.push(`${p.name} 加注到 ${raiseTo}`);}
  else return room;
  r.log=r.log.slice(-30);const remaining=r.players.filter(pl=>pl.inHand&&!pl.folded);if(remaining.length<=1){awardSingle(r);return r;}
  const acting=contestants(r),done=acting.length===0||acting.every(pl=>pl.hasActed&&pl.bet===r.currentBet);if(done)return advanceStage(r);
  r.turnIndex=nextSeat(r,idx,pl=>pl.inHand&&!pl.folded&&!pl.allIn);return r;
}

function PlayingCard({card,hidden=false,small=false,delay=0}){
  if(hidden||!card)return <div className={`card ${small?"small":""} back`} style={{animationDelay:`${delay}ms`}} />;
  const color=SUIT_COLOR[card.s];
  return <div className={`card ${small?"small":""} dealt`} style={{"--delay":`${delay}ms`,color}}>
    <span className="card-rank">{rankLabel(card.r)}</span><span className="card-suit">{SUIT_SYMBOL[card.s]}</span>
  </div>;
}

function AuthScreen({onLogin}){
  const [mode,setMode]=useState("login"),[username,setUsername]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const submit=async()=>{
    setError("");const u=username.trim();if(u.length<2||u.length>16)return setError("用户名需要 2–16 位");if(password.length<4)return setError("密码至少 4 位");
    setBusy(true);try{const res=await storage.get("poker:users");const users=res?JSON.parse(res.value):{};
      if(mode==="register"){if(users[u]){setError("用户名已被占用");setBusy(false);return;}users[u]={passwordHash:simpleHash(password),chips:STARTING_CHIPS};await storage.set("poker:users",JSON.stringify(users));onLogin(u);}
      else{if(!users[u]||users[u].passwordHash!==simpleHash(password)){setError("用户名或密码不正确");setBusy(false);return;}onLogin(u);}
    }catch{setError("操作失败，请重试");}setBusy(false);
  };
  return <div className="auth-wrap"><div className="auth-card">
    <div className="brand"><span>♠</span><h1>河畔牌局</h1></div><p>虚拟筹码德州扑克 · 2–8 人同桌</p>
    <div className="tabs"><button className={mode==="login"?"active":""} onClick={()=>setMode("login")}>登录</button><button className={mode==="register"?"active":""} onClick={()=>setMode("register")}>注册</button></div>
    <input placeholder="用户名" value={username} maxLength={16} onChange={e=>setUsername(e.target.value)}/>
    <input placeholder="密码" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
    {error&&<div className="error">{error}</div>}<button className="primary full" disabled={busy} onClick={submit}>{busy?"处理中…":mode==="login"?"登录":"注册并登录"}</button>
    <small>当前版本使用浏览器本地存储，仅供本机测试。联网版后续接入云端数据库。</small>
  </div></div>;
}

function Lobby({username,onEnterRoom,onLogout}){
  const [rooms,setRooms]=useState([]),[joinCode,setJoinCode]=useState(""),[newRoomName,setNewRoomName]=useState(""),[error,setError]=useState("");
  const refresh=useCallback(async()=>{const res=await storage.get("poker:rooms-index");setRooms(res?JSON.parse(res.value).filter(r=>r.status!=="closed"):[]);},[]);
  useEffect(()=>{refresh();const channel=supabase.channel("poker-lobby").on("postgres_changes",{event:"*",schema:"public",table:"poker_rooms"},refresh).subscribe();const t=setInterval(refresh,8000);return()=>{clearInterval(t);supabase.removeChannel(channel);};},[refresh]);
  const createRoom=async()=>{const code=genRoomCode(),room={code,name:newRoomName.trim()||`${username} 的牌桌`,hostName:username,status:"waiting",stage:"waiting",players:[{name:username,chips:STARTING_CHIPS,cards:[],folded:false,allIn:false,bet:0,totalContributed:0,hasActed:false,inHand:false}],dealerIndex:null,turnIndex:null,deck:[],community:[],pot:0,currentBet:0,minRaise:BIG_BLIND,log:[],handNumber:0};
    await storage.set(`poker:room:${code}`,JSON.stringify(room));const res=await storage.get("poker:rooms-index");const index=res?JSON.parse(res.value):[];index.push({code,name:room.name,hostName:username,playerCount:1,status:"waiting"});await storage.set("poker:rooms-index",JSON.stringify(index));onEnterRoom(code);};
  const joinRoom=async(raw)=>{setError("");const code=raw.trim().toUpperCase();const res=await storage.get(`poker:room:${code}`);if(!res)return setError("房间不存在");const room=JSON.parse(res.value);
    if(!room.players.some(p=>p.name===username)){if(room.players.length>=MAX_PLAYERS)return setError("房间已满");if(room.status==="playing")return setError("本局已开始，请等待下一局");room.players.push({name:username,chips:STARTING_CHIPS,cards:[],folded:false,allIn:false,bet:0,totalContributed:0,hasActed:false,inHand:false});await storage.set(`poker:room:${code}`,JSON.stringify(room));}
    onEnterRoom(code);};
  return <div className="page lobby"><header><div className="brand small-brand"><span>♠</span><h1>河畔牌局</h1></div><div className="user-area">{username}<button className="icon" onClick={onLogout}><LogOut size={16}/></button></div></header>
    <main className="lobby-grid">
      <section className="panel"><h2>创建新牌桌</h2><input placeholder="桌名（可选）" value={newRoomName} onChange={e=>setNewRoomName(e.target.value)}/><button className="primary full" onClick={createRoom}><Plus size={16}/>新建房间</button></section>
      <section className="panel"><h2>用房间号加入</h2><input placeholder="输入 5 位房间号" maxLength={5} value={joinCode} onChange={e=>setJoinCode(e.target.value)} onKeyDown={e=>e.key==="Enter"&&joinRoom(joinCode)}/><button className="secondary full" onClick={()=>joinRoom(joinCode)}><DoorOpen size={16}/>加入</button></section>
      {error&&<div className="error wide">{error}</div>}
      <section className="panel wide"><div className="panel-head"><h2>公开房间</h2><button className="icon" onClick={refresh}><RefreshCw size={15}/></button></div>
        {!rooms.length?<p className="muted">暂无房间，创建一个开始游戏吧。</p>:rooms.map(r=><div className="room-row" key={r.code}><div><b>{r.name}</b><small>房主 {r.hostName} · <Users size={12}/> {r.playerCount}/{MAX_PLAYERS} · {r.status==="playing"?"进行中":"等待中"} · {r.code}</small></div><button className="small-button" onClick={()=>joinRoom(r.code)}>加入</button></div>)}
      </section>
    </main></div>;
}

function WaitingRoom({room,username,onStart,onLeave}){
  const [copied,setCopied]=useState(false),isHost=room.hostName===username;
  const copy=async()=>{await navigator.clipboard?.writeText(`${location.href}?room=${room.code}`);setCopied(true);setTimeout(()=>setCopied(false),1500);};
  return <div className="wait-wrap"><div className="wait-card"><div className="brand"><span>♠</span><h1>{room.name}</h1></div>
    <div className="code-box">房间号 <b>{room.code}</b><button className="small-button" onClick={copy}>{copied?<Check size={14}/>:<Copy size={14}/>}{copied?"已复制":"复制链接"}</button></div>
    <p className="muted">联网版：把邀请链接发给朋友即可加入同一张牌桌，房间和聊天会实时同步。</p>
    <div className="players-list">{room.players.map(p=><div className="player-tile" key={p.name}>{p.name===room.hostName&&<Crown size={14}/>} {p.name}{p.name===username?"（你）":""}<small>{p.chips} 筹码</small></div>)}</div>
    {isHost?<button className="primary full" disabled={room.players.length<MIN_PLAYERS} onClick={onStart}>{room.players.length>=MIN_PLAYERS?"开始游戏":`至少需要 ${MIN_PLAYERS} 人`}</button>:<p className="muted">等待房主 {room.hostName} 开始游戏…</p>}
    <button className="ghost full" onClick={onLeave}>离开房间</button>
  </div></div>;
}

function seatPosition(i,n){const angle=Math.PI*2*i/n-Math.PI/2,rx=44,ry=40;return{left:`${50+rx*Math.cos(angle)}%`,top:`${50+ry*Math.sin(angle)}%`};}

function GameTable({room,username,onAction,onNextHand,onLeave}){
  const [raiseAmt,setRaiseAmt]=useState(room.currentBet+room.minRaise),[dealing,setDealing]=useState(false);
  useEffect(()=>setRaiseAmt(room.currentBet+Math.max(room.minRaise,BIG_BLIND)),[room.stage,room.currentBet,room.handNumber]);
  useEffect(()=>{setDealing(true);const t=setTimeout(()=>setDealing(false),900);return()=>clearTimeout(t);},[room.handNumber,room.stage]);
  const me=room.players.find(p=>p.name===username),myTurn=room.stage!=="handover"&&room.players[room.turnIndex]?.name===username&&me&&!me.folded&&!me.allIn,toCall=me?Math.max(0,room.currentBet-me.bet):0,n=room.players.length;
  return <div className="game-page">
    <div className="game-top"><div><b>{room.name}</b> · 第 {room.handNumber} 局 · <span className="stage">{room.stage}</span></div><button className="ghost-small" onClick={onLeave}>离开</button></div>
    <div className="game-layout">
      <main className="table-area">
        <Dealer room={room} dealing={dealing}/>
        <div className="poker-table">
          <div className="pot">彩池 {room.pot}{room.stage!=="handover"&&room.currentBet>0?` · 当前注 ${room.currentBet}`:""}</div>
          <div className="community">{room.community.map((c,i)=><PlayingCard key={i} card={c} delay={i*120}/>)}{Array.from({length:5-room.community.length}).map((_,i)=><PlayingCard key={"x"+i} hidden/>)}</div>
          {room.players.map((p,i)=>{const pos=seatPosition(i,n),turn=room.turnIndex===i&&room.stage!=="handover",meSeat=p.name===username;return <div className={`seat ${turn?"turn":""} ${p.folded?"folded":""}`} style={pos} key={p.name}>
            <div className="seat-name">{i===room.dealerIndex&&<span className="dealer-chip">D</span>}{p.name}{meSeat?"（你）":""}</div>
            <div className="seat-cards">{p.cards.length?p.cards.map((c,j)=><PlayingCard key={j} card={c} hidden={!meSeat&&room.stage!=="handover"} small delay={j*120}/>):<><PlayingCard hidden small/><PlayingCard hidden small/></>}</div>
            <small>{p.folded?"已弃牌":p.allIn?"ALL IN":`${p.chips} 筹码`}{p.bet>0?` · ${p.bet}`:""}</small>
          </div>;})}
        </div>
        <div className="game-log">{room.log.slice(-6).map((l,i)=><div key={i}>{l}</div>)}</div>
        {room.stage==="handover"?<div className="actions"><button className="primary" onClick={onNextHand}>开始下一局</button></div>:
          myTurn?<div className="actions"><button className="danger" onClick={()=>onAction("fold")}>弃牌</button><button className="secondary" onClick={()=>onAction(toCall===0?"check":"call")}>{toCall===0?"过牌":`跟注 ${toCall}`}</button><input type="number" value={raiseAmt} min={room.currentBet+room.minRaise} max={me.bet+me.chips} onChange={e=>setRaiseAmt(e.target.value)}/><button className="primary" onClick={()=>onAction("raise",raiseAmt)}>加注到</button></div>:
          <div className="wait-action">{me?.folded?"你已弃牌，等待本局结束…":me?.allIn?"你已全下，等待其他玩家…":`等待 ${room.players[room.turnIndex]?.name||"…"} 行动…`}</div>}
      </main>
      <ChatRoom roomCode={room.code} username={username} room={room}/>
    </div>
  </div>;
}

function RoomController({code,username,onLeaveLobby}){
  const [room,setRoom]=useState(null),busy=useRef(false);
  const load=useCallback(async()=>{const res=await storage.get(`poker:room:${code}`);if(res)setRoom(JSON.parse(res.value));},[code]);
  useEffect(()=>{
    load();
    const f=()=>load();
    window.addEventListener("river-poker-storage",f);
    const channel=supabase.channel(`poker-room-${code}`).on("postgres_changes",{event:"*",schema:"public",table:"poker_rooms",filter:`code=eq.${code}`},()=>load()).subscribe();
    const fallback=setInterval(load,5000);
    return()=>{clearInterval(fallback);window.removeEventListener("river-poker-storage",f);supabase.removeChannel(channel);};
  },[load,code]);
  const save=async(r)=>{setRoom(r);await storage.set(`poker:room:${code}`,JSON.stringify(r));const res=await storage.get("poker:rooms-index");const index=res?JSON.parse(res.value):[];const entry=index.find(x=>x.code===code);if(entry){entry.playerCount=r.players.length;entry.status=r.status;await storage.set("poker:rooms-index",JSON.stringify(index));}};
  const fresh=async(mutator)=>{if(busy.current)return;busy.current=true;try{const res=await storage.get(`poker:room:${code}`),current=res?JSON.parse(res.value):room,next=mutator(deepClone(current));if(next)await save(next);}finally{busy.current=false;}};
  const leave=async()=>{if(room){const r=deepClone(room);r.players=r.players.filter(p=>p.name!==username);if(!r.players.length){await storage.delete(`poker:room:${code}`);const res=await storage.get("poker:rooms-index");const index=res?JSON.parse(res.value):[];await storage.set("poker:rooms-index",JSON.stringify(index.filter(x=>x.code!==code)));}else{if(r.hostName===username)r.hostName=r.players[0].name;await save(r);}}onLeaveLobby();};
  if(!room)return <div className="page loading">加载房间中…</div>;
  if(room.status!=="playing"||room.stage==="waiting")return <WaitingRoom room={room} username={username} onStart={()=>fresh(startHand)} onLeave={leave}/>;
  return <GameTable room={room} username={username} onAction={(a,v)=>fresh(r=>applyAction(r,username,a,v))} onNextHand={()=>fresh(startHand)} onLeave={leave}/>;
}

export default function App(){
  const [username,setUsername]=useState(null),[roomCode,setRoomCode]=useState(null),[checking,setChecking]=useState(true);
  useEffect(()=>{(async()=>{const res=await storage.get("poker:session");if(res?.value)setUsername(res.value);setChecking(false);})();},[]);
  const login=async u=>{setUsername(u);await storage.set("poker:session",u);};
  const logout=async()=>{setUsername(null);setRoomCode(null);await storage.delete("poker:session");};
  useEffect(()=>{const code=new URLSearchParams(location.search).get("room");if(username&&code)setRoomCode(code.trim().toUpperCase());},[username]);
  if(checking)return <div className="page loading">正在进入河畔牌局…</div>;
  return <div className="app">{!username?<AuthScreen onLogin={login}/>:roomCode?<RoomController code={roomCode} username={username} onLeaveLobby={()=>setRoomCode(null)}/>:<Lobby username={username} onEnterRoom={setRoomCode} onLogout={logout}/>}</div>;
}