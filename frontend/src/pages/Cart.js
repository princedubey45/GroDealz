// src/pages/Cart.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import useApi from '../hooks/useApi';

export default function Cart() {
  const api = useApi();
  const { items, addItem, addBasket, replaceCart, removeItem, updateQty, total, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [placing, setPlacing] = useState(false);
  const [address, setAddress] = useState(user?.addresses?.[0]?.street || '123 Main Street, Imphal');

  // AI State
  const [completions, setCompletions] = useState([]);
  const [targetBudget, setTargetBudget] = useState(500);
  const [optimizing, setOptimizing] = useState(false);
  const [optMessage, setOptMessage] = useState('');

  useEffect(() => {
    if (items.length > 0) {
      api.post('/ai/basket-completion', { items })
        .then(res => setCompletions(res.data.suggestions || []))
        .catch(() => setCompletions([]));
    } else {
      setCompletions([]);
    }
  }, [items.length]);

  const handleOptimizeBudget = async () => {
    if (!items.length) return;
    setOptimizing(true);
    setOptMessage('');
    try {
      const res = await api.post('/ai/optimize-budget', { items, targetBudget });
      if (res.data?.success && res.data.items) {
        replaceCart(res.data.items);
        setOptMessage(`🎉 Cart optimized! Subtotal: ₹${res.data.optimizedTotal} (Saved ₹${res.data.totalSaved || 0})`);
      }
    } catch (err) {
      setOptMessage('Unable to optimize budget.');
    } finally {
      setOptimizing(false);
    }
  };

  const placeOrder = async () => {
    if (!items.length) return;
    setPlacing(true);
    try {
      const storeId = items[0].store || '000000000000000000000001';
      await api.post('/orders', {
        items: items.map(i => ({ productId: i._id, quantity: i.qty })),
        storeId,
        deliveryAddress: address,
        paymentMethod: 'cod'
      });
      clearCart();
      navigate('/orders');
    } catch (err) {
      alert(err.response?.data?.message || 'Order failed');
    } finally { setPlacing(false); }
  };

  const card = { background:'var(--card, #1e293b)', border:'1px solid var(--border, #334155)', borderRadius:14, padding:18, marginBottom:12, color:'var(--text, #fff)' };
  const delivery = 30;

  if (!items?.length) return (
    <div style={{ textAlign:'center', padding:'80px 0', color:'var(--text, #fff)' }}>
      <div style={{ fontSize:64, marginBottom:16 }}>🛒</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:800, marginBottom:8 }}>Your cart is empty</div>
      <p style={{ color:'var(--muted)', marginBottom:20 }}>Add items manually or generate a plan with AI</p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button style={{ background:'#10b981', color:'#fff', padding:'11px 24px', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', border:'none' }} onClick={() => navigate('/products')}>Browse Products</button>
        <button style={{ background:'rgba(16,185,129,0.15)', color:'#10b981', border:'1px solid #10b981', padding:'11px 24px', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer' }} onClick={() => navigate('/ai-planner')}>🤖 AI Grocery Planner</button>
      </div>
    </div>
  );

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:20, alignItems:'start', color:'var(--text, #fff)' }}>
      {/* Items List & Basket Completion */}
      <div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:800, marginBottom:18 }}>🛒 Your Cart ({items?.length || 0} items)</div>
        {items.map(item => (
          <div key={item._id} style={{ ...card, display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ fontSize:40, width:56, textAlign:'center' }}>{item.emoji || '🛒'}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:14, marginBottom:3 }}>{item.name}</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>{item.unit}</div>
              <div style={{ fontSize:16, fontWeight:800, color:'#10b981', marginTop:4 }}>₹{item.price}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button style={{ width:28, height:28, borderRadius:8, background:'var(--card2, #334155)', border:'1px solid var(--border, #334155)', color:'var(--text)', fontSize:16, cursor:'pointer' }} onClick={() => updateQty(item._id, item.qty - 1)}>−</button>
              <span style={{ minWidth:20, textAlign:'center', fontWeight:700 }}>{item.qty}</span>
              <button style={{ width:28, height:28, borderRadius:8, background:'var(--card2, #334155)', border:'1px solid var(--border, #334155)', color:'var(--text)', fontSize:16, cursor:'pointer' }} onClick={() => updateQty(item._id, item.qty + 1)}>+</button>
            </div>
            <div style={{ fontWeight:700, fontSize:15, color:'#10b981', width:70, textAlign:'right' }}>₹{item.price * item.qty}</div>
            <button style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.2)', color:'#f87171', borderRadius:7, width:30, height:30, cursor:'pointer', fontSize:14 }} onClick={() => removeItem(item._id)}>✕</button>
          </div>
        ))}

        {/* 🧺 AI Basket Completion Panel */}
        {completions.length > 0 && (
          <div style={{ ...card, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', marginTop: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#10b981', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🧺 AI Basket Completion Suggestions</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Items commonly bought together with your recipes:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {completions.map(c => (
                <div key={c._id} style={{ background: 'var(--card, #1e293b)', border: '1px solid var(--border, #334155)', padding: 10, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{c.emoji} {c.name}</div>
                    <div style={{ fontSize: 10, color: '#10b981' }}>{c.rationale}</div>
                    <div style={{ fontWeight: 700, fontSize: 12, marginTop: 2 }}>₹{c.price}</div>
                  </div>
                  <button
                    style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    onClick={() => addItem(c, 1)}
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Order Summary & Budget Optimizer Widget */}
      <div>
        {/* 💰 AI Target Budget Optimizer Widget */}
        <div style={{ ...card, borderColor: 'rgba(16,185,129,0.3)', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#10b981', marginBottom: 8 }}>💰 AI Budget Optimizer</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Set target budget to optimize cart items & save money:</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="number"
              style={{ flex: 1, background: 'var(--card2, #334155)', border: '1px solid var(--border, #334155)', borderRadius: 8, padding: '7px 10px', color: 'var(--text)', fontSize: 13 }}
              value={targetBudget}
              onChange={e => setTargetBudget(e.target.value ? parseInt(e.target.value, 10) : 0)}
              placeholder="Budget ₹"
            />
            <button
              style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              onClick={handleOptimizeBudget}
              disabled={optimizing}
            >
              {optimizing ? '...' : 'Optimize'}
            </button>
          </div>
          {optMessage && <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>{optMessage}</div>}
        </div>

        {/* Order Summary */}
        <div style={card}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:17, fontWeight:800, marginBottom:16 }}>Order Summary</div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>Delivery Address</label>
            <input
              style={{ background:'var(--card2, #334155)', border:'1px solid var(--border, #334155)', borderRadius:9, padding:'9px 13px', fontSize:13, color:'var(--text)', width:'100%' }}
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
          </div>
          {[['Subtotal', `₹${total}`], ['Delivery fee', `₹${delivery}`], ['Discount', '₹0']].map(([l,v]) => (
            <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--text2)', marginBottom:8 }}>
              <span>{l}</span><span>{v}</span>
            </div>
          ))}
          <div style={{ borderTop:'1px solid var(--border, #334155)', paddingTop:12, display:'flex', justifyContent:'space-between', fontFamily:'var(--font-display)', fontSize:18, fontWeight:800, marginBottom:16 }}>
            <span>Total</span><span style={{ color:'#10b981' }}>₹{total + delivery}</span>
          </div>
          <div style={{ background:'rgba(16,185,129,0.05)', border:'1px solid rgba(16,185,129,0.15)', borderRadius:9, padding:'10px 13px', marginBottom:14, fontSize:12, color:'var(--text2)' }}>
            🤖 <strong>AI Estimate:</strong> ~25–30 min delivery · {items.length * 2 + 10} min prep time
          </div>
          <button
            style={{ width:'100%', background:'#10b981', color:'#fff', border:'none', borderRadius:10, padding:13, fontSize:15, fontWeight:800, cursor:'pointer', opacity: placing ? 0.6 : 1, fontFamily:'var(--font-display)' }}
            onClick={placeOrder} disabled={placing}
          >{placing ? 'Placing order…' : '🚀 Place Order (COD)'}</button>
        </div>
      </div>
    </div>
  );
}
