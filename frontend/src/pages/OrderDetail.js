// src/pages/OrderDetail.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../hooks/useApi';
import { useSocket } from '../context/SocketContext';

const STATUS_STEPS = [
  { key:'placed',           icon:'📋', label:'Order Placed' },
  { key:'confirmed',        icon:'✅', label:'Confirmed' },
  { key:'preparing',        icon:'👨‍🍳', label:'Preparing' },
  { key:'out_for_delivery', icon:'🛵', label:'Out for Delivery' },
  { key:'delivered',        icon:'🎉', label:'Delivered' },
];

export default function OrderDetail() {
  const { id }         = useParams();
  const navigate       = useNavigate();
  const { trackOrder } = useSocket();
  const [order, setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/orders/${id}`)
      .then(r => { setOrder(r.data); trackOrder(r.data._id); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="skeleton" style={{ height: 400, borderRadius: 18 }} />;
  if (!order)  return <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Order not found</div>;

  const curStep = STATUS_STEPS.findIndex(s => s.key === order.status);

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => navigate('/orders')} style={{ background:'var(--card)', border:'1px solid var(--border)', color:'var(--text2)', padding:'7px 14px', borderRadius:9, fontSize:13, cursor:'pointer' }}>← Back</button>
        <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:800 }}>Order {order.orderId}</div>
      </div>

      {/* Status tracker */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:18, padding:24 }}>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:15, marginBottom:20 }}>📍 Live Order Status</div>
        {order.status === 'cancelled' ? (
          <div style={{ textAlign:'center', padding:20, color:'var(--accent3)', fontWeight:700, fontSize:16 }}>❌ This order was cancelled</div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            {STATUS_STEPS.map((step, i) => (
              <div key={step.key} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, flex:1 }}>
                <div style={{
                  width:42, height:42, borderRadius:'50%',
                  background: i <= curStep ? 'var(--accent)' : 'var(--card2)',
                  border: `2px solid ${i <= curStep ? 'var(--accent)' : 'var(--border)'}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:18, transition:'all 0.3s',
                  boxShadow: i === curStep ? '0 0 16px rgba(74,222,128,0.4)' : 'none'
                }}>{step.icon}</div>
                <div style={{ fontSize:10, fontWeight: i === curStep ? 700 : 500, color: i <= curStep ? 'var(--accent)' : 'var(--muted)', textAlign:'center' }}>{step.label}</div>
                {i < STATUS_STEPS.length - 1 && (
                  <div style={{ position:'absolute', width:`calc(100% / ${STATUS_STEPS.length} - 50px)`, height:2, background: i < curStep ? 'var(--accent)' : 'var(--border)', top:21, left:'50%', zIndex:0, transition:'background 0.3s' }}/>
                )}
              </div>
            ))}
          </div>
        )}
        {order.delivery?.estimatedTime && order.status !== 'delivered' && order.status !== 'cancelled' && (
          <div style={{ marginTop:18, background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.2)', borderRadius:10, padding:'10px 14px', fontSize:13, color:'var(--text2)' }}>
            🤖 <strong>AI Estimate:</strong> ~{order.delivery.estimatedTime} min delivery · Prep time ~{order.ai?.estimatedPrepTime} min
          </div>
        )}
      </div>

      {/* Items */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:18, padding:24 }}>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:15, marginBottom:14 }}>🛒 Items Ordered</div>
        {order.items?.map(item => (
          <div key={item._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontSize:30 }}>{item.product?.emoji || '🛒'}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:14 }}>{item.name}</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Qty: {item.quantity} × ₹{item.price}</div>
            </div>
            <div style={{ fontWeight:700, color:'var(--accent2)' }}>₹{item.subtotal}</div>
          </div>
        ))}
        <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:6 }}>
          {[['Subtotal', order.pricing?.subtotal], ['Delivery fee', order.pricing?.deliveryFee]].map(([l,v]) => (
            <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--text2)' }}>
              <span>{l}</span><span>₹{v}</span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'var(--font-display)', fontSize:17, fontWeight:800, borderTop:'1px solid var(--border)', paddingTop:10, marginTop:4 }}>
            <span>Total</span><span style={{ color:'var(--accent)' }}>₹{order.pricing?.total}</span>
          </div>
        </div>
      </div>

      {/* Delivery info */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:18, padding:24 }}>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:15, marginBottom:12 }}>📦 Delivery Details</div>
        <div style={{ fontSize:13, color:'var(--text2)', display:'flex', flexDirection:'column', gap:8 }}>
          <div>📍 <strong>Address:</strong> {order.delivery?.address}</div>
          <div>💳 <strong>Payment:</strong> {order.payment?.method?.toUpperCase()} – {order.payment?.status}</div>
          {order.delivery?.riderName && <div>🛵 <strong>Rider:</strong> {order.delivery.riderName}</div>}
        </div>
      </div>
    </div>
  );
}
