import React, { useEffect, useRef, useState } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import { supabase } from '../services/supabase';

export default function ChatRoom({ roomCode, username, room }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase
        .from('poker_messages')
        .select('id,username,text,created_at')
        .eq('room_code', roomCode)
        .order('created_at', { ascending: true })
        .limit(100);
      if (!error && alive) setMessages(data || []);
    };

    load();
    const channel = supabase
      .channel(`poker-chat-${roomCode}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'poker_messages', filter: `room_code=eq.${roomCode}`,
      }, payload => {
        if (!alive) return;
        setMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new].slice(-100));
      })
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [roomCode]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const { error } = await supabase.from('poker_messages').insert({
      room_code: roomCode,
      username,
      text,
    });
    if (!error) setInput('');
    setSending(false);
  };

  const fmt = (time) => new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <aside className="chat-panel">
      <div className="chat-title"><MessageCircle size={17}/> 房间聊天 <span>{room?.players?.length || 0} 人</span></div>
      <div className="chat-messages">
        {messages.length === 0 && <div className="chat-empty">暂时还没有消息，来当第一个说话的人吧。</div>}
        {messages.map(m => (
          <div className={`chat-message ${m.username === username ? 'mine' : ''}`} key={m.id}>
            <div className="chat-meta"><b>{m.username}</b><span>{fmt(m.created_at)}</span></div>
            <div className="chat-bubble">{m.text}</div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>
      <div className="chat-input-row">
        <input value={input} maxLength={120} placeholder="说点什么…" onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}/>
        <button onClick={send} disabled={sending} title="发送"><Send size={17}/></button>
      </div>
    </aside>
  );
}
