// src/pages/Dashboard.js
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../hooks/useApi';
import { useAuth }   from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import s from './Dashboard.module.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl:       require('leaflet/dist/images/marker-icon.png'),
  shadowUrl:     require('leaflet/dist/images/marker-shadow.png'),
});

function makeIcon(color, size = 26) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #080c09;box-shadow:0 2px 12px rgba(0,0,0,0.5)"></div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size], popupAnchor: [0, -(size + 4)]
  });
}

const myStoreIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:38px;height:38px">
    <div style="position:absolute;inset:0;background:rgba(74,222,128,0.25);border-radius:50%;animation:ping 1.5s infinite"></div>
    <div style="position:absolute;inset:6px;background:#4ade80;border-radius:50%;border:2px solid #080c09;display:flex;align-items:center;justify-content:center;font-size:13px">🏪</div>
  </div>`,
  iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -22]
});

function RecenterMap({ lat, lng }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng], 14); }, [lat, lng]);
  return null;
}

const NEARBY_STORES = [
  { id:'s1', name:'GreenLeaf Grocers',  emoji:'🥬', color:'#fbbf24', lat:24.822, lng:93.942, area:'Thangal Bazar', hours:'8am–9pm',  rating:4.5, offers:[{item:'Tomatoes',price:'₹28/kg'},{item:'Onions',price:'₹22/kg'},{item:'Spinach',price:'₹25/250g'}] },
  { id:'s2', name:'Daily Needs Store',  emoji:'🛒', color:'#60a5fa', lat:24.810, lng:93.931, area:'Lamphel',       hours:'6am–11pm', rating:4.2, offers:[{item:'Eggs (12)',price:'₹72'},{item:'Milk 1L',price:'₹52'},{item:'Bread',price:'₹38'}] },
  { id:'s3', name:'NatureFresh Market', emoji:'🌿', color:'#f472b6', lat:24.826, lng:93.928, area:'Singjamei',     hours:'7am–9pm',  rating:4.6, offers:[{item:'Organic Veggies',price:'₹180'},{item:'Farm Fruits',price:'₹120'}] },
  { id:'s4', name:'Sunrise Provisions', emoji:'🌅', color:'#fb923c', lat:24.808, lng:93.944, area:'Porompat',      hours:'8am–10pm', rating:4.3, offers:[{item:'Cooking Oil 1L',price:'₹145'},{item:'Atta 10kg',price:'₹380'}] },
  { id:'s5', name:'City Fresh Mart',    emoji:'🏬', color:'#a78bfa', lat:24.819, lng:93.950, area:'Keishampat',    hours:'7am–10pm', rating:4.4, offers:[{item:'Rice 5kg',price:'₹320'},{item:'Dal 1kg',price:'₹90'}] },
];

const SAMPLE_ORDERS = [
  { id:'#ORD-2401', customer:'Priya Sharma',  items:'Rice, Dal, Sugar',      amount:'₹455', status:'delivered' },
  { id:'#ORD-2402', customer:'Rahul Singh',   items:'Milk, Bread, Butter',   amount:'₹145', status:'pending' },
  { id:'#ORD-2403', customer:'Anjali Devi',   items:'Tomatoes, Onions',      amount:'₹94',  status:'delivered' },
  { id:'#ORD-2404', customer:'Mohan Lal',     items:'Eggs, Cooking Oil',     amount:'₹217', status:'cancelled' },
  { id:'#ORD-2405', customer:'Sunita Rani',   items:'Atta, Sugar, Dal',      amount:'₹515', status:'pending' },
  { id:'#ORD-2406', customer:'Deepak Kumar',  items:'Organic Veggies, Rice', amount:'₹500', status:'delivered' },
  { id:'#ORD-2407', customer:'Kavita Devi',   items:'Bread, Milk, Butter',   amount:'₹145', status:'pending' },
  { id:'#ORD-2408', customer:'Ratan Singh',   items:'Cooking Oil, Onions',   amount:'₹167', status:'cancelled' },
];

const STATUS_STYLE = {
  delivered: { bg:'rgba(74,222,128,0.12)',  color:'#4ade80', border:'rgba(74,222,128,0.3)',  label:'✅ Delivered' },
  pending:   { bg:'rgba(251,191,36,0.12)',  color:'#fbbf24', border:'rgba(251,191,36,0.3)',  label:'⏳ Pending' },
  cancelled: { bg:'rgba(248,113,113,0.12)', color:'#f87171', border:'rgba(248,113,113,0.3)', label:'❌ Cancelled' },
};

const ORDER_STATUS_COLOR = {
  placed:'#60a5fa', confirmed:'#4ade80', preparing:'#fbbf24',
  out_for_delivery:'#a78bfa', delivered:'#4ade80', cancelled:'#f87171'
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--card2)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 12px' }}>
      <p style={{ fontSize:11, color:'var(--muted)', marginBottom:3 }}>{label}</p>
      {payload.map(p => <p key={p.name} style={{ fontSize:13, color:p.color, fontWeight:600 }}>{p.name}: {p.value}</p>)}
    </div>
  );
};

export default function Dashboard() {
  const { user }                     = useAuth();
  const { joinStore, notifications } = useSocket();

  const [orders,         setOrders]         = useState([]);
  const [nearbyOrders,   setNearbyOrders]   = useState(SAMPLE_ORDERS);
  const [offers,         setOffers]         = useState(NEARBY_STORES.map(st => ({ ...st, visible: true })));
  const [selectedStore,  setSelectedStore]  = useState(null);
  const [highlightStore, setHighlightStore] = useState(null);
  const [orderFilter,    setOrderFilter]    = useState('all');
  const [loading,        setLoading]        = useState(true);
  const [myStore,        setMyStore]        = useState(null);
  const [demand,         setDemand]         = useState(null);
  const [stats,          setStats]          = useState({ orders:0, revenue:0, active:0, stores: NEARBY_STORES.length + 1 });

  const storeId = user?.storeId;

  useEffect(() => {
    if (storeId) {
      joinStore(storeId);
      api.get(`/stores/${storeId}`).then(r => setMyStore(r.data)).catch(() => {});
      api.get(`/demand/store/${storeId}`).then(r => setDemand(r.data)).catch(() => {});
      api.get(`/orders/store/${storeId}?limit=20`)
        .then(r => {
          const o = r.data.orders || [];
          setOrders(o);
          const revenue = o.filter(x => x.status !== 'cancelled').reduce((sum, x) => sum + (x.pricing?.total || 0), 0);
          const active  = o.filter(x => ['placed','confirmed','preparing','out_for_delivery'].includes(x.status)).length;
          setStats(prev => ({ ...prev, orders: o.length, revenue, active }));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [storeId]);

  const removeOffer = useCallback((id) => {
    setOffers(prev => prev.map(o => o.id === id ? { ...o, visible: false } : o));
  }, []);

  const handleMarkerClick = (store) => {
    setHighlightStore(store.id);
    setSelectedStore(store);
    setTimeout(() => {
      const el = document.getElementById(`offer-${store.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const filteredOrders  = orderFilter === 'all' ? nearbyOrders : nearbyOrders.filter(o => o.status === orderFilter);
  const visibleOffers   = offers.filter(o => o.visible);
  const hourlyData      = Array.from({ length: 12 }, (_, i) => ({ hour: `${String(i*2).padStart(2,'0')}:00`, orders: Math.round(Math.random() * 10) }));

  const STAT_CARDS = [
    { icon:'🏪', label:'Nearby Stores',  value: stats.stores,                         color:'var(--accent)' },
    { icon:'📦', label:"Today's Orders", value: stats.orders,                          color:'var(--blue)' },
    { icon:'⏳', label:'Active Orders',  value: stats.active,                          color:'var(--accent2)' },
    { icon:'💰', label:'Revenue Today',  value: `₹${stats.revenue.toLocaleString()}`,  color:'var(--purple)' },
  ];

  return (
    <div className={s.page}>

      {/* HEADER */}
      <div className={s.header}>
        <div className={s.headerText}>
          <h1 className={s.title}>📊 Store Dashboard</h1>
          <p className={s.subtitle}>
            {myStore?.name || (user?.name + "'s Store")} · {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' })}
          </p>
        </div>
        <div className={s.headerBtns}>
          <Link to="/manage-products" className={s.btnPrimary}>➕ Add Products</Link>
          <Link to="/ai-insights"     className={s.btnSecondary}>🤖 Insights</Link>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className={s.statGrid}>
        {STAT_CARDS.map(card => (
          <div key={card.label} className={s.statCard}>
            <div className={s.statIcon} style={{ background:`${card.color}15`, color:card.color }}>{card.icon}</div>
            <div>
              <div className={s.statLabel}>{card.label}</div>
              <div className={s.statValue} style={{ color:card.color }}>{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* AI ALERT */}
      {demand?.staffRecommendation && (
        <div className={s.aiAlert}>
          <span className={s.aiAlertIcon}>🤖</span>
          <div>
            <div className={s.aiAlertTitle}>AI Recommendation</div>
            <div className={s.aiAlertSub}>{demand.staffRecommendation}</div>
          </div>
          <span className="badge badge-green" style={{ marginLeft:'auto', flexShrink:0 }}>Demand ML</span>
        </div>
      )}

      {/* MAIN PANELS GRID */}
      <div className={s.panelsGrid}>

        {/* MAP */}
        <div className={s.mapPanel}>
          <div className={s.mapHeader}>
            <div className={s.mapTitle}>🗺️ Nearby Stores Map</div>
            <div className={s.mapMeta}>
              📍 Imphal
              <span style={{ fontSize:10, background:'rgba(74,222,128,0.1)', color:'var(--accent)', border:'1px solid rgba(74,222,128,0.25)', borderRadius:20, padding:'2px 8px', fontWeight:700 }}>
                {NEARBY_STORES.length + 1} stores
              </span>
            </div>
          </div>

          <div className={s.mapLegend}>
            <div className={s.legendItem}><div className={s.legendDot} style={{ background:'#4ade80' }}/> My Store</div>
            {NEARBY_STORES.slice(0,4).map(st => (
              <div key={st.id} className={s.legendItem} onClick={() => handleMarkerClick(st)}>
                <div className={s.legendDot} style={{ background:st.color }}/> {st.name.split(' ')[0]}
              </div>
            ))}
          </div>

          <div className={s.mapContainer}>
            <MapContainer center={[24.817, 93.937]} zoom={14} style={{ width:'100%', height:'100%' }} scrollWheelZoom={false}>
              <RecenterMap lat={24.817} lng={93.937} />
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="© CARTO" />

              <Marker position={[24.817, 93.937]} icon={myStoreIcon}>
                <Popup>
                  <div style={{ fontWeight:700, fontSize:14, color:'#4ade80', marginBottom:4 }}>🏪 {myStore?.name || 'My Store'}</div>
                  <div style={{ fontSize:12, color:'#9ab8a2' }}>📍 {myStore?.location?.area || 'Imphal'}</div>
                </Popup>
              </Marker>

              {NEARBY_STORES.map(store => (
                <Marker key={store.id} position={[store.lat, store.lng]} icon={makeIcon(store.color)}
                  eventHandlers={{ click: () => handleMarkerClick(store) }}
                >
                  <Popup>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:store.color, marginBottom:5 }}>{store.emoji} {store.name}</div>
                      <div style={{ fontSize:12, color:'#9ab8a2', marginBottom:2 }}>📍 {store.area} · ⭐ {store.rating}</div>
                      <div style={{ fontSize:12, color:'#9ab8a2', marginBottom:8 }}>🕐 {store.hours}</div>
                      {store.offers.map((o,i) => (
                        <div key={i} style={{ fontSize:11, color:'#9ab8a2', marginBottom:2 }}>
                          • {o.item} — <span style={{ color:'#fbbf24', fontWeight:600 }}>{o.price}</span>
                        </div>
                      ))}
                      <button onClick={() => handleMarkerClick(store)}
                        style={{ marginTop:8, background:store.color, color:'#080c09', border:'none', borderRadius:6, padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', width:'100%' }}>
                        View in Panel →
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            {selectedStore && (
              <div className={s.mapOverlay} style={{ borderColor: selectedStore.color }}>
                <button className={s.mapOverlayClose} onClick={() => setSelectedStore(null)}>✕</button>
                <div className={s.mapOverlayName} style={{ color: selectedStore.color }}>{selectedStore.emoji} {selectedStore.name}</div>
                <div className={s.mapOverlaySub}>🕐 {selectedStore.hours} · ⭐ {selectedStore.rating}</div>
              </div>
            )}
          </div>
        </div>

        {/* OFFERS PANEL */}
        <div className={s.offersPanel}>
          <div className={s.panelHeader}>
            <div className={s.panelTitle}><span style={{ color:'var(--accent2)' }}>🏷️</span> Store Offers</div>
            <span className={s.panelCount}>{visibleOffers.length} offers</span>
          </div>
          <div className={s.panelBody}>
            {visibleOffers.length === 0
              ? <div style={{ textAlign:'center', padding:'20px 0', color:'var(--muted)', fontSize:12 }}>All offers removed</div>
              : visibleOffers.map(store => (
                <div key={store.id} id={`offer-${store.id}`}
                  className={`${s.offerCard} ${highlightStore === store.id ? s.offerCardHighlight : ''}`}
                  onClick={() => setHighlightStore(store.id)}
                >
                  <button className={s.offerRemoveBtn} onClick={e => { e.stopPropagation(); removeOffer(store.id); }}>✕</button>
                  <div className={s.offerStoreName}>{store.emoji} {store.name}</div>
                  <div className={s.offerItems}>
                    {store.offers.map((o,i) => (
                      <div key={i} className={s.offerItem}>{o.item} <span className={s.offerItemPrice}>{o.price}</span></div>
                    ))}
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* NEARBY ORDERS PANEL */}
        <div className={s.ordersPanel}>
          <div className={s.panelHeader}>
            <div className={s.panelTitle}><span style={{ color:'var(--blue)' }}>📦</span> Nearby Orders</div>
            <div className={s.orderFilters}>
              {['all','delivered','pending','cancelled'].map(f => (
                <button key={f} className={`${s.filterBtn} ${orderFilter===f ? s.filterActive : s.filterInactive}`}
                  onClick={() => setOrderFilter(f)}>{f}</button>
              ))}
            </div>
          </div>
          <div className={s.panelBody}>
            {filteredOrders.length === 0
              ? <div style={{ textAlign:'center', padding:'20px 0', color:'var(--muted)', fontSize:12 }}>No {orderFilter} orders</div>
              : filteredOrders.map(order => {
                const st = STATUS_STYLE[order.status] || STATUS_STYLE.pending;
                return (
                  <div key={order.id} className={s.orderCard}>
                    <div>
                      <div className={s.orderId}>{order.id}</div>
                      <div className={s.orderCustomer}>👤 {order.customer}</div>
                      <div className={s.orderItems}>{order.items}</div>
                      <span className={s.statusBadge} style={{ background:st.bg, color:st.color, border:`1px solid ${st.border}` }}>{st.label}</span>
                    </div>
                    <div className={s.orderAmount}>{order.amount}</div>
                  </div>
                );
              })
            }
          </div>
        </div>
      </div>

      {/* BOTTOM GRID */}
      <div className={s.bottomGrid}>

        <div className={s.chartCard}>
          <div className={s.chartTitle}>📈 Hourly Order Volume</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourlyData} margin={{ top:5, right:10, left:-20, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="hour" tick={{ fill:'var(--muted)', fontSize:9 }} />
              <YAxis tick={{ fill:'var(--muted)', fontSize:9 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="orders" fill="var(--accent)" radius={[4,4,0,0]} name="Orders" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={s.tableCard}>
          <div className={s.chartTitle}>
            🧾 Your Store Orders
            <span style={{ fontSize:11, color:'var(--muted)', fontWeight:400 }}>{orders.length} total</span>
          </div>
          <div className={s.tableWrap}>
            {loading ? (
              [1,2,3].map(i => <div key={i} className="skeleton" style={{ height:34, marginBottom:6 }}/>)
            ) : orders.length === 0 ? (
              <div style={{ textAlign:'center', color:'var(--muted)', fontSize:13, padding:'24px 0' }}>No orders yet</div>
            ) : (
              <table className={s.table}>
                <thead>
                  <tr>{['Order','Customer','Total','Status'].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {orders.slice(0,8).map(o => (
                    <tr key={o._id}>
                      <td style={{ fontWeight:700, color:'var(--accent)', fontSize:11 }}>{o.orderId}</td>
                      <td style={{ color:'var(--text2)' }}>{o.customer?.name || '—'}</td>
                      <td style={{ fontWeight:700, color:'#fbbf24' }}>₹{o.pricing?.total}</td>
                      <td>
                        <span style={{ fontSize:9.5, fontWeight:700, padding:'3px 7px', borderRadius:20, background:`${ORDER_STATUS_COLOR[o.status]||'#888'}18`, color:ORDER_STATUS_COLOR[o.status]||'var(--muted)', border:`1px solid ${ORDER_STATUS_COLOR[o.status]||'#888'}35`, textTransform:'uppercase' }}>
                          {o.status?.replace(/_/g,' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* LIVE NOTIFICATIONS */}
      {notifications.filter(n => !n.read).length > 0 && (
        <div className={s.notifications}>
          {notifications.filter(n => !n.read).slice(0,3).map(n => (
            <div key={n.id} className={s.notifToast}>
              <span style={{ marginRight:8 }}>{n.type==='new_order' ? '🛍️' : '📦'}</span>
              {n.type==='new_order' ? `New order! ${n.itemCount} items · ₹${n.total}` : `Order ${n.orderId} → ${n.status}`}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes ping {
          0%   { transform:scale(1);   opacity:0.6; }
          70%  { transform:scale(2.2); opacity:0; }
          100% { transform:scale(2.2); opacity:0; }
        }
      `}</style>
    </div>
  );
}