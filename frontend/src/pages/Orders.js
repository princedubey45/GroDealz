// src/pages/Orders.js
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../hooks/useApi';
import { useSocket } from '../context/SocketContext';

const STATUS_STEPS = ['placed','confirmed','preparing','out_for_delivery','delivered'];
const STATUS_COLOR = { placed:'var(--blue)', confirmed:'var(--accent)', preparing:'var(--accent2)', out_for_delivery:'var(--purple)', delivered:'var(--accent)', cancelled:'var(--accent3)' };

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const { trackOrder } = useSocket();

  useEffect(() => {
    api.get('/orders/my').then(r => { setOrders(r.data); r.data.forEach(o => trackOrder(o._id)); }).finally(() => setLoading(false));
  }, []);

  const card = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:20, marginBottom:12 };

  if (loading) return <div style={{ display:'flex', flexDirection:'column', gap:10 }}>{Array(3).fill(0).map((_,i)=><div key={i} className="skeleton" style={{ height:120 }}/>)}</div>;
  if (!orders.length) return (
    <div style={{ textAlign:'center', padding:'80px 0' }}>
      <div style={{ fontSize:64, marginBottom:16 }}>📦</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:800, marginBottom:8 }}>No orders yet</div>
      <Link to="/products" style={{ background:'var(--accent)', color:'var(--bg)', padding:'11px 24px', borderRadius:10, fontSize:14, fontWeight:700, display:'inline-block', marginTop:8 }}>Start Shopping</Link>
    </div>
  );

  return (
    <div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:800, marginBottom:20 }}>📦 My Orders</div>
      {orders.map(o => (
        <Link key={o._id} to={`/orders/${o._id}`} style={{ textDecoration:'none' }}>
          <div style={{ ...card, transition:'all 0.15s' }} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border2)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
              <div>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:15 }}>{o.orderId}</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{new Date(o.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:18, fontWeight:800, color:'var(--accent2)' }}>₹{o.pricing?.total}</div>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20, background:`${STATUS_COLOR[o.status]}18`, color:STATUS_COLOR[o.status], border:`1px solid ${STATUS_COLOR[o.status]}40`, textTransform:'uppercase', letterSpacing:0.5 }}>
                  {o.status?.replace(/_/g,' ')}
                </span>
              </div>
            </div>
            <div style={{ fontSize:12.5, color:'var(--text2)' }}>
              {o.items?.map(i => `${i.name} × ${i.quantity}`).join(' · ')}
            </div>
            {o.status !== 'cancelled' && o.status !== 'delivered' && (
              <div style={{ marginTop:12, display:'flex', gap:4 }}>
                {STATUS_STEPS.map((st, i) => (
                  <div key={st} style={{ flex:1, height:3, borderRadius:3, background: STATUS_STEPS.indexOf(o.status) >= i ? 'var(--accent)' : 'var(--border)', transition:'background 0.3s' }}/>
                ))}
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
