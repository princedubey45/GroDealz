import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

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

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/tickets', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (res.ok) setTickets(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMessages = async (ticketId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/tickets/${ticketId}/messages`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (res.ok) {
        setMessages(data);
        if (socket) socket.emit('join_ticket', ticketId);
      }
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
      const res = await fetch('http://localhost:5000/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ issueType, initialMessage: newTicketMessage, isSecure })
      });
      const data = await res.json();
      if (res.ok) {
        setTickets([data.ticket, ...tickets]);
        setNewTicketMessage('');
      }
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
      sender: 'User'
    });
    setInputText('');
  };

  return (
    <div style={{ padding: 20, display: 'flex', gap: 20, height: '80vh', color: 'var(--text)' }}>
      {/* Sidebar for Tickets */}
      <div style={{ flex: 1, backgroundColor: 'var(--card)', borderRadius: 12, padding: 20, overflowY: 'auto' }}>
        <h3>Support Tickets (CRM Synced)</h3>
        
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tickets.map(t => (
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
              <div style={{ fontWeight: 'bold' }}>{t.issueType} Issue</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Status: <span style={{ color: t.status === 'Escalated' ? 'red' : 'var(--accent)' }}>{t.status}</span></div>
              {t.crmTicketId && <div style={{ fontSize: 10, color: '#888' }}>CRM ID: {t.crmTicketId}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 2, backgroundColor: 'var(--card)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeTicket ? (
          <>
            <div style={{ padding: 20, borderBottom: '1px solid var(--border)', fontWeight: 'bold' }}>
              Chatting about {activeTicket.issueType} 
              {activeTicket.status === 'Escalated' && <span style={{ color: 'red', marginLeft: 10 }}>(Agent joining soon...)</span>}
            </div>
            
            <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.sender === 'User' ? 'flex-end' : 'flex-start',
                  backgroundColor: m.sender === 'User' ? 'var(--accent)' : 'var(--bg)',
                  color: m.sender === 'User' ? '#000' : 'var(--text)',
                  padding: '10px 14px',
                  borderRadius: 12,
                  maxWidth: '70%'
                }}>
                  <div style={{ fontSize: 10, marginBottom: 4, opacity: 0.7 }}>{m.sender}</div>
                  <div>{m.text}</div>
                </div>
              ))}
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
  );
}
