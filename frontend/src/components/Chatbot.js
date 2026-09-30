// src/components/Chatbot.js
import React, { useState, useRef, useEffect } from 'react';
import api from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const QUICK_ACTIONS = [
  { label: '🤖 Plan Grocery (4 log / 3 din)', msg: 'Mujhe 4 log ke liye 3 din ka grocery chahiye under 1000' },
  { label: '💰 Optimize Budget',             msg: 'Optimize my cart under ₹500' },
  { label: '🥗 Healthy Breakfast',           msg: 'Healthy breakfast items dikhao' },
  { label: '📦 My Orders',                   msg: 'Where is my order?' },
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
  const { addBasket } = useCart();

  const [messages, setMessages] = useState([
    {
      id: 1, role: 'bot',
      text: `👋 Hey${user ? ' ' + user.name.split(' ')[0] : ''}! I'm **GroBot**, your AI Grocery Shopping Copilot.\n\nI can help you:\n• **Plan groceries** in English & Hinglish (*"4 log ke liye 3 din ka grocery under 1000"*)\n• **Build 1-click smart cart baskets**\n• **Optimize cart to your budget**\n• **Check missing recipe items & prices**`,
      type: 'greeting'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [addedMessageId, setAddedMessageId] = useState(null);
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
      const { data } = await api.post('/ai/copilot', { message: msg });
      const res = data.response;
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'bot',
        text: res.text,
        type: res.type,
        products: res.products || res.suggestions,
        plan: res.plan,
        action: res.action,
        intent: data.intent
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: 'bot',
        text: 'Sorry, I had trouble connecting to the AI engine. Please try again! 🔄',
        type: 'error'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPlanToCart = (msgId, plan) => {
    if (!plan || !plan.basket) return;
    addBasket(plan.basket);
    setAddedMessageId(msgId);
    setTimeout(() => setAddedMessageId(null), 3000);
  };

  const typeColor = { greeting:'#4ade80', grocery_basket:'#10b981', order:'#60a5fa', recommendations:'#a78bfa', price:'#fbbf24', complaint:'#f87171', error:'#f87171', success:'#4ade80' };

  return (
    <div style={styles.overlay}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.botAvatar}>🤖</div>
          <div>
            <div style={styles.botName}>GroBot AI Copilot</div>
            <div style={styles.botSub}>Hinglish + English Intelligence</div>
          </div>
        </div>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
      </div>

      {/* AI tag strip */}
      <div style={styles.tagStrip}>
        <span style={styles.tag}>Hinglish NLP</span>
        <span style={styles.tag}>DB Grounded</span>
        <span style={styles.tag}>1-Click Smart Cart</span>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {messages.map(m => (
          <div key={m.id} style={{ ...styles.msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'bot' && <div style={styles.avatarSmall}>🤖</div>}
            <div style={{
              ...styles.bubble,
              background: m.role === 'user' ? '#10b981' : 'var(--card2)',
              color: m.role === 'user' ? '#fff' : 'var(--text)',
              borderColor: m.role === 'bot' ? (typeColor[m.type] || 'var(--border)') : 'transparent',
              borderWidth: '1px', borderStyle: 'solid',
              borderTopLeftRadius: m.role === 'bot' ? 4 : 14,
              borderTopRightRadius: m.role === 'user' ? 4 : 14,
              maxWidth: '85%'
            }}>
              <MarkdownText text={m.text} />

              {/* 1-Click Cart Button for Generated AI Basket */}
              {m.plan && m.plan.basket && (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={() => handleAddPlanToCart(m.id, m.plan)}
                    style={styles.addCartBtn}
                  >
                    {addedMessageId === m.id ? '✅ Added to Cart!' : `🛒 Add Complete Basket to Cart (₹${m.plan.totalPrice})`}
                  </button>
                </div>
              )}

              {/* Product chips */}
              {m.products && m.products.length > 0 && !m.plan && (
                <div style={styles.productChips}>
                  {m.products.map((p, idx) => (
                    <div key={p._id || idx} style={styles.productChip}>
                      <span style={{ fontSize: 18 }}>{p.emoji || '🛒'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#10b981' }}>₹{p.price}</div>
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
          placeholder='Ask in English/Hinglish… "4 log ke liye 3 din ka grocery"'
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
    width: 380,
    height: 580,
    background: 'var(--surface, #0f172a)',
    border: '1px solid var(--border, #334155)',
    borderRadius: 20,
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 9999,
    overflow: 'hidden'
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px',
    background: 'var(--card, #1e293b)',
    borderBottom: '1px solid var(--border, #334155)'
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  botAvatar: {
    width: 38, height: 38,
    background: 'linear-gradient(135deg,#10b981,#059669)',
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20
  },
  botName: { fontWeight: 700, fontSize: 14, color: 'var(--text, #f8fafc)' },
  botSub: { fontSize: 10, color: 'var(--muted, #94a3b8)', letterSpacing: 0.5 },
  closeBtn: {
    background: 'var(--card2, #334155)', border: 'none',
    color: 'var(--muted, #cbd5e1)', width: 28, height: 28, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, cursor: 'pointer'
  },
  tagStrip: {
    display: 'flex', gap: 6, padding: '7px 14px',
    borderBottom: '1px solid var(--border, #334155)',
    background: 'rgba(16,185,129,0.05)'
  },
  tag: {
    fontSize: 9, fontWeight: 600,
    background: 'rgba(16,185,129,0.15)',
    color: '#10b981',
    border: '1px solid rgba(16,185,129,0.2)',
    borderRadius: 20, padding: '2px 8px'
  },
  messages: { flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  bubble: { padding: '10px 13px', borderRadius: 14, fontSize: 13, lineHeight: 1.6, maxWidth: '85%' },
  avatarSmall: {
    width: 26, height: 26, background: '#10b981',
    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, flexShrink: 0
  },
  userAvatarSmall: {
    width: 26, height: 26,
    background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0
  },
  addCartBtn: {
    width: '100%',
    background: '#10b981',
    color: '#fff',
    border: 'none',
    padding: '8px 12px',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer'
  },
  productChips: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 },
  productChip: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border, #334155)',
    borderRadius: 8, padding: '6px 10px'
  },
  intentTag: {
    marginTop: 8, fontSize: 9, color: 'var(--muted, #94a3b8)',
    background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '2px 7px',
    display: 'inline-block'
  },
  typing: { display: 'flex', gap: 4, alignItems: 'center', padding: '4px 2px' },
  quickActions: {
    display: 'flex', gap: 6, padding: '8px 12px',
    borderTop: '1px solid var(--border, #334155)', flexWrap: 'wrap'
  },
  quickBtn: {
    fontSize: 11, fontWeight: 500,
    background: 'var(--card2, #1e293b)', border: '1px solid var(--border, #334155)',
    color: 'var(--text, #f8fafc)', borderRadius: 20, padding: '5px 10px',
    cursor: 'pointer', transition: 'all 0.15s',
    whiteSpace: 'nowrap'
  },
  inputArea: {
    display: 'flex', gap: 8, padding: '10px 12px',
    borderTop: '1px solid var(--border, #334155)'
  },
  input: {
    flex: 1,
    background: 'var(--card, #1e293b)',
    border: '1px solid var(--border, #334155)',
    borderRadius: 10, padding: '9px 13px',
    fontSize: 13, color: 'var(--text, #f8fafc)'
  },
  sendBtn: {
    background: '#10b981', color: '#fff',
    border: 'none', borderRadius: 10,
    width: 38, height: 38,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 700, flexShrink: 0,
    cursor: 'pointer'
  }
};
