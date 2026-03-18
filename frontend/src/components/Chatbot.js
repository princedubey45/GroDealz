// src/components/Chatbot.js
import React, { useState, useRef, useEffect } from 'react';
import api from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';

const QUICK_ACTIONS = [
  { label: '📦 My Orders',     msg: 'Where is my order?' },
  { label: '🛒 Suggest Food',  msg: 'Suggest me some items for dinner' },
  { label: '🏪 Store Hours',   msg: 'Is the store open right now?' },
  { label: '💰 Veg Deals',     msg: 'Suggest vegetarian items on discount' },
];

function MarkdownText({ text }) {
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g,     '<del>$1</del>')
    .replace(/\n/g,             '<br/>');
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function Chatbot({ onClose }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([
    {
      id: 1, role: 'bot',
      text: `👋 Hey${user ? ' ' + user.name.split(' ')[0] : ''}! I'm **GroBot**, your AI assistant.\n\nI can help you:\n• **Track or cancel orders**\n• **Get personalised recommendations**\n• **Check prices & store hours**\n\nWhat can I do for you today?`,
      type: 'greeting'
    }
  ]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput('');

    const userMsg = { id: Date.now(), role: 'user', text: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const { data } = await api.post('/chatbot/message', { message: msg });
      setMessages(prev => [...prev, {
        id:       Date.now() + 1,
        role:     'bot',
        text:     data.response.text,
        type:     data.response.type,
        products: data.response.products,
        intent:   data.intent
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: 'bot',
        text: 'Sorry, I had trouble connecting. Please try again! 🔄',
        type: 'error'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const typeColor = { greeting:'#4ade80', order:'#60a5fa', recommendations:'#a78bfa', price:'#fbbf24', complaint:'#f87171', error:'#f87171', success:'#4ade80' };

  return (
    <div style={styles.overlay}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.botAvatar}>🤖</div>
          <div>
            <div style={styles.botName}>GroBot</div>
            <div style={styles.botSub}>NLP-Powered Assistant</div>
          </div>
        </div>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
      </div>

      {/* AI tag strip */}
      <div style={styles.tagStrip}>
        <span style={styles.tag}>NLP Intent Classifier</span>
        <span style={styles.tag}>Entity Extraction</span>
        <span style={styles.tag}>Context-Aware</span>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {messages.map(m => (
          <div key={m.id} style={{ ...styles.msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'bot' && <div style={styles.avatarSmall}>🤖</div>}
            <div style={{
              ...styles.bubble,
              background: m.role === 'user' ? '#4ade80' : 'var(--card2)',
              color:       m.role === 'user' ? 'var(--bg)' : 'var(--text)',
              borderColor: m.role === 'bot'  ? (typeColor[m.type] || 'var(--border)') : 'transparent',
              borderWidth: '1px', borderStyle: 'solid',
              borderTopLeftRadius:  m.role === 'bot'  ? 4 : 14,
              borderTopRightRadius: m.role === 'user' ? 4 : 14,
              maxWidth: '82%'
            }}>
              <MarkdownText text={m.text} />

              {/* Product chips for recommendations */}
              {m.products && m.products.length > 0 && (
                <div style={styles.productChips}>
                  {m.products.map(p => (
                    <div key={p._id} style={styles.productChip}>
                      <span style={{ fontSize: 18 }}>{p.emoji || '🛒'}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#fbbf24' }}>₹{p.price}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {m.intent && (
                <div style={styles.intentTag}>🧠 Intent: {m.intent.replace(/_/g,' ')}</div>
              )}
            </div>
            {m.role === 'user' && <div style={styles.userAvatarSmall}>{user?.name?.[0] || 'U'}</div>}
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.msgRow, justifyContent: 'flex-start' }}>
            <div style={styles.avatarSmall}>🤖</div>
            <div style={{ ...styles.bubble, background: 'var(--card2)', border: '1px solid var(--border)' }}>
              <div style={styles.typing}>
                <span/><span/><span/>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      <div style={styles.quickActions}>
        {QUICK_ACTIONS.map(a => (
          <button key={a.label} style={styles.quickBtn} onClick={() => send(a.msg)}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={styles.inputArea}>
        <input
          style={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder='Ask me anything… "Where is my order?"'
        />
        <button
          style={{ ...styles.sendBtn, opacity: input.trim() ? 1 : 0.5 }}
          onClick={() => send()}
          disabled={!input.trim() || loading}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    bottom: 24, right: 24,
    width: 360,
    height: 560,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 9999,
    overflow: 'hidden',
    animation: 'fadeIn 0.3s cubic-bezier(.34,1.56,.64,1)'
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px',
    background: 'var(--card)',
    borderBottom: '1px solid var(--border)'
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  botAvatar: {
    width: 38, height: 38,
    background: 'linear-gradient(135deg,#4ade80,#22c55e)',
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20
  },
  botName: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text)' },
  botSub: { fontSize: 10, color: 'var(--muted)', letterSpacing: 1 },
  closeBtn: {
    background: 'var(--card2)', border: '1px solid var(--border)',
    color: 'var(--muted)', width: 28, height: 28, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, cursor: 'pointer'
  },
  tagStrip: {
    display: 'flex', gap: 6, padding: '7px 14px',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(74,222,128,0.03)'
  },
  tag: {
    fontSize: 9, letterSpacing: 0.5,
    background: 'rgba(74,222,128,0.1)',
    color: 'var(--accent)',
    border: '1px solid rgba(74,222,128,0.2)',
    borderRadius: 20, padding: '2px 8px'
  },
  messages: { flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  bubble: { padding: '10px 13px', borderRadius: 14, fontSize: 13, lineHeight: 1.6, maxWidth: '82%' },
  avatarSmall: {
    width: 26, height: 26, background: 'var(--accent-dim)',
    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, flexShrink: 0
  },
  userAvatarSmall: {
    width: 26, height: 26,
    background: 'linear-gradient(135deg,#4ade80,#22c55e)',
    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: 'var(--bg)', flexShrink: 0
  },
  productChips: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 },
  productChip: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '6px 10px'
  },
  intentTag: {
    marginTop: 8, fontSize: 9, color: 'var(--muted)',
    background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '2px 7px',
    display: 'inline-block', letterSpacing: 0.5
  },
  typing: {
    display: 'flex', gap: 4, alignItems: 'center', padding: '4px 2px',
  },
  quickActions: {
    display: 'flex', gap: 6, padding: '8px 12px',
    borderTop: '1px solid var(--border)', flexWrap: 'wrap'
  },
  quickBtn: {
    fontSize: 11, fontWeight: 500,
    background: 'var(--card2)', border: '1px solid var(--border)',
    color: 'var(--text2)', borderRadius: 20, padding: '5px 10px',
    cursor: 'pointer', transition: 'all 0.15s',
    whiteSpace: 'nowrap'
  },
  inputArea: {
    display: 'flex', gap: 8, padding: '10px 12px',
    borderTop: '1px solid var(--border)'
  },
  input: {
    flex: 1,
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 10, padding: '9px 13px',
    fontSize: 13, color: 'var(--text)'
  },
  sendBtn: {
    background: 'var(--accent)', color: 'var(--bg)',
    border: 'none', borderRadius: 10,
    width: 38, height: 38,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 700, flexShrink: 0,
    transition: 'opacity 0.15s'
  }
};
