// src/pages/Cart.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';

export default function Cart() {
  const { items, removeItem, updateQty, total, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [placing, setPlacing] = useState(false);
  const [address, setAddress] = useState(user?.addresses?.[0]?.street || '123 Main Street, Imphal');

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

  const card = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:18, marginBottom:12 };
  const delivery = 30;

  if (!items.length) return (
    <div style={{ textAlign:'center', padding:'80px 0' }}>
      <div style={{ fontSize:64, marginBottom:16 }}>🛒</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:800, marginBottom:8 }}>Your cart is empty</div>
      <p style={{ color:'var(--text2)', marginBottom:20 }}>Add some items to get started</p>
      <button style={{ background:'var(--accent)', color:'var(--bg)', padding:'11px 24px', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer' }} onClick={() => navigate('/products')}>Browse Products</button>
    </div>
  );

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:20, alignItems:'start' }}>
      {/* Items */}
      <div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:800, marginBottom:18 }}>🛒 Your Cart ({items.length} items)</div>
        {items.map(item => (
          <div key={item._id} style={{ ...card, display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ fontSize:40, width:56, textAlign:'center' }}>{item.emoji || '🛒'}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:14, marginBottom:3 }}>{item.name}</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>{item.unit}</div>
              <div style={{ fontSize:16, fontWeight:800, color:'var(--accent)', marginTop:4 }}>₹{item.price}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button style={{ width:28, height:28, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:16, cursor:'pointer' }} onClick={() => updateQty(item._id, item.qty - 1)}>−</button>
              <span style={{ minWidth:20, textAlign:'center', fontWeight:700 }}>{item.qty}</span>
              <button style={{ width:28, height:28, borderRadius:8, background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text)', fontSize:16, cursor:'pointer' }} onClick={() => updateQty(item._id, item.qty + 1)}>+</button>
            </div>
            <div style={{ fontWeight:700, fontSize:15, color:'var(--accent2)', width:70, textAlign:'right' }}>₹{item.price * item.qty}</div>
            <button style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.2)', color:'var(--accent3)', borderRadius:7, width:30, height:30, cursor:'pointer', fontSize:14 }} onClick={() => removeItem(item._id)}>✕</button>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div style={card}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:17, fontWeight:800, marginBottom:16 }}>Order Summary</div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>Delivery Address</label>
          <input
            style={{ background:'var(--card2)', border:'1px solid var(--border)', borderRadius:9, padding:'9px 13px', fontSize:13, color:'var(--text)', width:'100%' }}
            value={address}
            onChange={e => setAddress(e.target.value)}
          />
        </div>
        {[['Subtotal', `₹${total}`], ['Delivery fee', `₹${delivery}`], ['Discount', '₹0']].map(([l,v]) => (
          <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--text2)', marginBottom:8 }}>
            <span>{l}</span><span>{v}</span>
          </div>
        ))}
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:12, display:'flex', justifyContent:'space-between', fontFamily:'var(--font-display)', fontSize:18, fontWeight:800, marginBottom:16 }}>
          <span>Total</span><span style={{ color:'var(--accent)' }}>₹{total + delivery}</span>
        </div>
        <div style={{ background:'rgba(74,222,128,0.05)', border:'1px solid rgba(74,222,128,0.15)', borderRadius:9, padding:'10px 13px', marginBottom:14, fontSize:12, color:'var(--text2)' }}>
          🤖 <strong>AI Estimate:</strong> ~25–30 min delivery · {items.length * 2 + 10} min prep time
        </div>
        <button
          style={{ width:'100%', background:'var(--accent)', color:'var(--bg)', borderRadius:10, padding:13, fontSize:15, fontWeight:800, cursor:'pointer', opacity: placing ? 0.6 : 1, fontFamily:'var(--font-display)' }}
          onClick={placeOrder} disabled={placing}
        >{placing ? 'Placing order…' : '🚀 Place Order (COD)'}</button>
      </div>
    </div>
  );
}
