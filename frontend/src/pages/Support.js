import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../hooks/useApi';

export default function Support() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [tickets, setTickets] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [issueType, setIssueType] = useState('Order');
  const [newTicketMessage, setNewTicketMessage] = useState('');
  const [isSecure, setIsSecure] = useState(false);
  const [viewMode, setViewMode] = useState('Customer'); // 'Customer' or 'Agent'
  const [feedback, setFeedback] = useState({});

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const res = await api.get('/tickets');
      setTickets(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMessages = async (ticketId) => {
    try {
      const res = await api.get(`/tickets/${ticketId}/messages`);
      setMessages(res.data);
      if (socket) socket.emit('join_ticket', ticketId);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!socket) return;
    socket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    return () => socket.off('receive_message');
  }, [socket]);

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/tickets', { issueType, initialMessage: newTicketMessage, isSecure });
      setTickets([res.data.ticket, ...tickets]);
      setNewTicketMessage('');
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeTicket || !socket) return;
    
    socket.emit('send_message', {
      ticketId: activeTicket._id,
      text: inputText,
      sender: viewMode === 'Agent' ? 'Human Agent' : 'User'
    });
    setInputText('');
  };

  const submitFeedback = (ticketId, rating) => {
    setFeedback({ ...feedback, [ticketId]: rating });
    alert(`Feedback submitted for ticket ${ticketId}. Thank you!`);
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20, height: '80vh', color: 'var(--text)' }}>
      {/* View Toggle */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => setViewMode('Customer')} style={{ padding: '8px 16px', borderRadius: 8, background: viewMode === 'Customer' ? 'var(--accent)' : 'var(--card2)', color: viewMode === 'Customer' ? '#000' : 'var(--text)', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Customer View</button>
        <button onClick={() => setViewMode('Agent')} style={{ padding: '8px 16px', borderRadius: 8, background: viewMode === 'Agent' ? '#f87171' : 'var(--card2)', color: viewMode === 'Agent' ? '#fff' : 'var(--text)', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Agent Dashboard</button>
      </div>

      <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0 }}>
        {/* Sidebar for Tickets */}
        <div style={{ flex: 1, backgroundColor: 'var(--card)', borderRadius: 12, padding: 20, overflowY: 'auto' }}>
          <h3>{viewMode === 'Agent' ? 'Escalated CRM Tickets' : 'My Support Tickets'}</h3>
          
          {viewMode === 'Customer' && (
            <form onSubmit={handleCreateTicket} style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select value={issueType} onChange={(e) => setIssueType(e.target.value)} style={{ padding: 10, borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <option>Order</option>
            <option>Payment</option>
            <option>Quality</option>
            <option>Other</option>
          </select>
          <textarea 
            placeholder="Describe your issue..." 
            value={newTicketMessage} 
            onChange={(e) => setNewTicketMessage(e.target.value)}
            style={{ padding: 10, borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', minHeight: 60 }}
            required
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={isSecure} onChange={(e) => setIsSecure(e.target.checked)} />
            Mask Sensitive Info (e.g. Card details)
          </label>
              <button type="submit" style={{ padding: 10, borderRadius: 8, background: 'var(--accent)', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                Create Ticket
              </button>
            </form>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(viewMode === 'Agent' ? tickets.filter(t => t.status === 'Escalated' || t.status === 'Resolved') : tickets).map(t => (
            <div 
              key={t._id} 
              onClick={() => { setActiveTicket(t); fetchMessages(t._id); }}
              style={{ 
                padding: 12, 
                borderRadius: 8, 
                border: '1px solid var(--border)', 
                cursor: 'pointer',
                backgroundColor: activeTicket?._id === t._id ? 'var(--bg)' : 'transparent'
              }}
            >
                <div style={{ fontWeight: 'bold' }}>{t.issueType} Issue {t.intent ? `[${t.intent}]` : ''}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Status: <span style={{ color: t.status === 'Escalated' ? '#f87171' : t.status === 'Resolved' ? 'var(--accent)' : 'var(--blue)' }}>{t.status}</span></div>
                {t.aiConfidence && <div style={{ fontSize: 10, color: '#888' }}>AI Confidence: {(t.aiConfidence * 100).toFixed(0)}%</div>}
                {t.crmTicketId && <div style={{ fontSize: 10, color: '#888' }}>CRM ID: {t.crmTicketId}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 2, backgroundColor: 'var(--card)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeTicket ? (
          <>
            <div style={{ padding: 20, borderBottom: '1px solid var(--border)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                Chatting about {activeTicket.issueType} 
                {activeTicket.status === 'Escalated' && <span style={{ color: '#f87171', marginLeft: 10 }}>(Agent joining soon...)</span>}
                {activeTicket.status === 'Resolved' && <span style={{ color: 'var(--accent)', marginLeft: 10 }}>(Auto-Resolved)</span>}
              </div>
              {viewMode === 'Agent' && activeTicket.status === 'Escalated' && (
                <button onClick={() => alert('Resolution flow started in CRM')} style={{ background: '#f87171', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                  Resolve via CRM
                </button>
              )}
            </div>
            
            <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map((m, i) => {
                const isMine = m.sender === (viewMode === 'Agent' ? 'Human Agent' : 'User');
                const isAI = m.sender === 'AI';
                return (
                  <div key={i} style={{
                    alignSelf: isMine ? 'flex-end' : 'flex-start',
                    backgroundColor: isMine ? 'var(--accent)' : isAI ? 'rgba(74,222,128,0.1)' : 'var(--bg)',
                    color: isMine ? '#000' : 'var(--text)',
                    border: isAI ? '1px solid rgba(74,222,128,0.2)' : 'none',
                    padding: '10px 14px',
                    borderRadius: 12,
                    maxWidth: '70%'
                  }}>
                    <div style={{ fontSize: 10, marginBottom: 4, opacity: 0.7, color: isAI ? 'var(--accent)' : 'inherit' }}>{m.sender}</div>
                    <div dangerouslySetInnerHTML={{ __html: m.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                  </div>
                );
              })}
              
              {/* Customer Feedback Prompt */}
              {viewMode === 'Customer' && activeTicket.status === 'Resolved' && !feedback[activeTicket._id] && (
                <div style={{ alignSelf: 'center', backgroundColor: 'var(--card2)', padding: 15, borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center', marginTop: 10 }}>
                  <div style={{ fontSize: 13, marginBottom: 10 }}>How was your support experience?</div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button onClick={() => submitFeedback(activeTicket._id, 'good')} style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer' }}>👍 Great</button>
                    <button onClick={() => submitFeedback(activeTicket._id, 'bad')} style={{ background: '#f87171', color: '#000', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer' }}>👎 Poor</button>
                  </div>
                </div>
              )}
              {viewMode === 'Customer' && feedback[activeTicket._id] && (
                <div style={{ alignSelf: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>✓ Feedback recorded</div>
              )}
            </div>

            <form onSubmit={handleSendMessage} style={{ padding: 20, borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type your message..."
                style={{ flex: 1, padding: 12, borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
              />
              <button type="submit" style={{ padding: '0 20px', borderRadius: 8, background: 'var(--accent)', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                Send
              </button>
            </form>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
            Select a ticket to view chat
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
