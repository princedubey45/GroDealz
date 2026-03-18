// src/pages/Dashboard.js
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import api from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

// ── Fix Leaflet default icon ──
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl:       require('leaflet/dist/images/marker-icon.png'),
  shadowUrl:     require('leaflet/dist/images/marker-shadow.png'),
});

// ── Custom colored marker ──
function makeIcon(color, size = 28) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:2px solid #080c09;
      box-shadow:0 2px 12px rgba(0,0,0,0.5)
    "></div>`,
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size],
    popupAnchor: [0, -(size + 4)]
  });
}

// ── My Store marker (pulsing green circle) ──
const myStoreIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:40px;height:40px">
    <div style="position:absolute;inset:0;background:rgba(74,222,128,0.25);border-radius:50%;animation:ping 1.5s infinite"></div>
    <div style="position:absolute;inset:6px;background:#4ade80;border-radius:50%;border:2px solid #080c09;display:flex;align-items:center;justify-content:center;font-size:13px">🏪</div>
  </div>`,
  iconSize:    [40, 40],
  iconAnchor:  [20, 20],
  popupAnchor: [0, -24]
});

// ── Recenter map helper ──
function RecenterMap({ lat, lng }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng], 14); }, [lat, lng]);
  return null;
}

// ── Nearby stores (fallback if no real data) ──
const NEARBY_STORES = [
  { id: 's1', name: 'GreenLeaf Grocers',   emoji: '🥬', color: '#fbbf24', lat: 24.822, lng: 93.942, area: 'Thangal Bazar', hours: '8am–9pm',  rating: 4.5, offers: [{ item: 'Tomatoes', price: '₹28/kg' }, { item: 'Onions', price: '₹22/kg' }, { item: 'Spinach', price: '₹25/250g' }] },
  { id: 's2', name: 'Daily Needs Store',   emoji: '🛒', color: '#60a5fa', lat: 24.810, lng: 93.931, area: 'Lamphel',       hours: '6am–11pm', rating: 4.2, offers: [{ item: 'Eggs (12)', price: '₹72' }, { item: 'Milk 1L', price: '₹52' }, { item: 'Bread', price: '₹38' }] },
  { id: 's3', name: 'NatureFresh Market',  emoji: '🌿', color: '#f472b6', lat: 24.826, lng: 93.928, area: 'Singjamei',     hours: '7am–9pm',  rating: 4.6, offers: [{ item: 'Organic Veggies Set', price: '₹180' }, { item: 'Farm Fruits', price: '₹120' }] },
  { id: 's4', name: 'Sunrise Provisions',  emoji: '🌅', color: '#fb923c', lat: 24.808, lng: 93.944, area: 'Porompat',      hours: '8am–10pm', rating: 4.3, offers: [{ item: 'Cooking Oil 1L', price: '₹145' }, { item: 'Atta 10kg', price: '₹380' }] },
  { id: 's5', name: 'City Fresh Mart',     emoji: '🏬', color: '#a78bfa', lat: 24.819, lng: 93.950, area: 'Keishampat',   hours: '7am–10pm', rating: 4.4, offers: [{ item: 'Rice 5kg', price: '₹320' }, { item: 'Dal 1kg', price: '₹90' }] },
];

// ── Sample nearby orders ──
const SAMPLE_ORDERS = [
  { id: '#ORD-2401', customer: 'Priya Sharma',  items: 'Rice, Dal, Sugar',        amount: '₹455', status: 'delivered' },
  { id: '#ORD-2402', customer: 'Rahul Singh',   items: 'Milk, Bread, Butter',     amount: '₹145', status: 'pending' },
  { id: '#ORD-2403', customer: 'Anjali Devi',   items: 'Tomatoes, Onions',        amount: '₹94',  status: 'delivered' },
  { id: '#ORD-2404', customer: 'Mohan Lal',     items: 'Eggs, Cooking Oil',       amount: '₹217', status: 'cancelled' },
  { id: '#ORD-2405', customer: 'Sunita Rani',   items: 'Atta, Sugar, Dal',        amount: '₹515', status: 'pending' },
  { id: '#ORD-2406', customer: 'Deepak Kumar',  items: 'Organic Veggies, Rice',   amount: '₹500', status: 'delivered' },
  { id: '#ORD-2407', customer: 'Kavita Devi',   items: 'Bread, Milk, Butter',     amount: '₹145', status: 'pending' },
  { id: '#ORD-2408', customer: 'Ratan Singh',   items: 'Cooking Oil, Onions',     amount: '₹167', status: 'cancelled' },
];

// ── Status badge styles ──
const STATUS_STYLE = {
  delivered: { bg: 'rgba(74,222,128,0.12)',  color: '#4ade80', border: 'rgba(74,222,128,0.3)',  label: '✅ Delivered' },
  pending:   { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', border: 'rgba(251,191,36,0.3)',  label: '⏳ Pending' },
  cancelled: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.3)', label: '❌ Cancelled' },
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>{label}</p>
      {payload.map(p => <p key={p.name} style={{ fontSize: 13, color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</p>)}
    </div>
  );
};

export default function Dashboard() {
  const { user }                          = useAuth();
  const { joinStore, notifications }      = useSocket();

  // State
  const [orders,          setOrders]          = useState([]);
  const [nearbyOrders,    setNearbyOrders]     = useState(SAMPLE_ORDERS);
  const [offers,          setOffers]           = useState(NEARBY_STORES.map(s => ({ ...s, visible: true })));
  const [selectedStore,   setSelectedStore]    = useState(null);
  const [highlightStore,  setHighlightStore]   = useState(null);
  const [orderFilter,     setOrderFilter]      = useState('all');
  const [loading,         setLoading]          = useState(true);
  const [myStore,         setMyStore]          = useState(null);
  const [stats,           setStats]            = useState({ orders: 0, revenue: 0, active: 0, stores: NEARBY_STORES.length + 1 });
  const [mapCenter,       setMapCenter]        = useState({ lat: 24.817, lng: 93.937 });

  const storeId = user?.storeId;

  useEffect(() => {
    if (storeId) {
      joinStore(storeId);
      api.get(`/stores/${storeId}`).then(r => setMyStore(r.data)).catch(() => {});
      api.get(`/orders/store/${storeId}?limit=20`)
        .then(r => {
          const o = r.data.orders || [];
          setOrders(o);
          const revenue = o.filter(x => x.status !== 'cancelled').reduce((s, x) => s + (x.pricing?.total || 0), 0);
          const active  = o.filter(x => ['placed','confirmed','preparing','out_for_delivery'].includes(x.status)).length;
          setStats(prev => ({ ...prev, orders: o.length, revenue, active }));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [storeId]);

  // Remove offer from panel
  const removeOffer = useCallback((storeId) => {
    setOffers(prev => prev.map(o => o.id === storeId ? { ...o, visible: false } : o));
  }, []);

  // Click store marker → highlight its offer card
  const handleMarkerClick = (store) => {
    setHighlightStore(store.id);
    setSelectedStore(store);
    setTimeout(() => {
      const el = document.getElementById(`offer-${store.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Remove nearby order
  const removeOrder = (id) => setNearbyOrders(prev => prev.filter(o => o.id !== id));

  // Filtered orders
  const filteredOrders = orderFilter === 'all'
    ? nearbyOrders
    : nearbyOrders.filter(o => o.status === orderFilter);

  const visibleOffers = offers.filter(o => o.visible);

  // Chart data for hourly orders
  const hourlyData = Array.from({ length: 12 }, (_, i) => ({
    hour: `${String(i * 2).padStart(2, '0')}:00`,
    orders: Math.round(Math.random() * 8),
  }));

  // ── STYLES ──
  const card    = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14 };
  const section = { ...card, display: 'flex', flexDirection: 'column', overflow: 'hidden' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'var(--font-body)' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
            📊 Store Dashboard
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            {myStore?.name || user?.name + "'s Store"} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/manage-products" style={{ background: 'var(--accent)', color: 'var(--bg)', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
            ➕ Add Products
          </Link>
          <Link to="/ai-insights" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text2)', padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
            🤖 AI Insights
          </Link>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { icon: '🏪', label: 'Nearby Stores',  value: stats.stores,                      color: 'var(--accent)' },
          { icon: '📦', label: "Today's Orders",  value: stats.orders,                      color: 'var(--blue)' },
          { icon: '⏳', label: 'Active Orders',   value: stats.active,                      color: 'var(--accent2)' },
          { icon: '💰', label: "Today's Revenue", value: `₹${stats.revenue.toLocaleString()}`, color: 'var(--purple)' },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: 18, display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${s.color}15`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5 }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── MAP + OFFERS + ORDERS (main 3-panel layout) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', gridTemplateRows: 'auto auto', gap: 14 }}>

        {/* ── MAP ── */}
        <div style={{ ...section, gridRow: '1 / 3', minHeight: 520 }}>
          <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--accent)' }}>🗺️</span> Nearby Stores Map
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>📍 Imphal, Manipur</span>
              <span style={{ fontSize: 10, background: 'rgba(74,222,128,0.1)', color: 'var(--accent)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 20, padding: '2px 9px', fontWeight: 700 }}>
                {NEARBY_STORES.length + 1} stores
              </span>
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text2)' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ade80' }}/> My Store
            </div>
            {NEARBY_STORES.slice(0, 4).map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text2)', cursor: 'pointer' }}
                onClick={() => handleMarkerClick(s)}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }}/> {s.name.split(' ')[0]}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, position: 'relative' }}>
            <MapContainer
              center={[mapCenter.lat, mapCenter.lng]}
              zoom={14}
              style={{ width: '100%', height: '100%', minHeight: 400 }}
              scrollWheelZoom={false}
            >
              <RecenterMap lat={mapCenter.lat} lng={mapCenter.lng} />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution="© CARTO"
              />

              {/* My store marker */}
              <Marker position={[24.817, 93.937]} icon={myStoreIcon}>
                <Popup>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#4ade80', marginBottom: 4 }}>
                      🏪 {myStore?.name || 'My Store'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ab8a2' }}>📍 {myStore?.location?.area || 'Imphal'}</div>
                    <div style={{ fontSize: 12, color: '#9ab8a2', marginTop: 3 }}>⭐ Your store location</div>
                  </div>
                </Popup>
              </Marker>

              {/* Nearby store markers */}
              {NEARBY_STORES.map(store => (
                <Marker
                  key={store.id}
                  position={[store.lat, store.lng]}
                  icon={makeIcon(store.color)}
                  eventHandlers={{ click: () => handleMarkerClick(store) }}
                >
                  <Popup>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: store.color, marginBottom: 5 }}>
                        {store.emoji} {store.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ab8a2', marginBottom: 2 }}>📍 {store.area}</div>
                      <div style={{ fontSize: 12, color: '#9ab8a2', marginBottom: 2 }}>🕐 {store.hours}</div>
                      <div style={{ fontSize: 12, color: '#9ab8a2', marginBottom: 8 }}>⭐ {store.rating}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#e2ede6', marginBottom: 4 }}>Offers:</div>
                      {store.offers.map((o, i) => (
                        <div key={i} style={{ fontSize: 11, color: '#9ab8a2', marginBottom: 2 }}>
                          • {o.item} — <span style={{ color: '#fbbf24', fontWeight: 600 }}>{o.price}</span>
                        </div>
                      ))}
                      <button
                        onClick={() => handleMarkerClick(store)}
                        style={{ marginTop: 8, background: store.color, color: '#080c09', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', width: '100%' }}
                      >
                        View in Panel →
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            {/* Map overlay info */}
            {selectedStore && (
              <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 999, background: 'rgba(22,30,23,0.95)', backdropFilter: 'blur(10px)', border: `1px solid ${selectedStore.color}`, borderRadius: 12, padding: '12px 16px', maxWidth: 220, animation: 'fadeIn 0.2s ease' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: selectedStore.color, marginBottom: 4 }}>{selectedStore.emoji} {selectedStore.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>🕐 {selectedStore.hours} · ⭐ {selectedStore.rating}</div>
                <button onClick={() => setSelectedStore(null)} style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            )}
          </div>
        </div>

        {/* ── OFFERS PANEL ── */}
        <div style={{ ...section, maxHeight: 300 }}>
          <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ color: 'var(--accent2)' }}>🏷️</span> Store Offers
            </div>
            <span style={{ fontSize: 10, background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 9px', color: 'var(--muted)' }}>
              {visibleOffers.length} offers
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
            {visibleOffers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 12 }}>All offers removed</div>
            ) : visibleOffers.map(store => (
              <div
                key={store.id}
                id={`offer-${store.id}`}
                style={{
                  background: highlightStore === store.id ? `${store.color}10` : 'var(--card2)',
                  border: `1px solid ${highlightStore === store.id ? store.color : 'var(--border)'}`,
                  borderRadius: 11, padding: '11px 13px', marginBottom: 8,
                  cursor: 'pointer', transition: 'all 0.2s', position: 'relative'
                }}
                onClick={() => setHighlightStore(store.id)}
              >
                {/* Remove button */}
                <button
                  onClick={(e) => { e.stopPropagation(); removeOffer(store.id); }}
                  style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 5, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  title="Remove offer"
                >✕</button>

                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6, paddingRight: 24 }}>
                  <span>{store.emoji}</span>
                  <span>{store.name}</span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {store.offers.map((o, i) => (
                    <div key={i} style={{ fontSize: 10.5, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--text2)' }}>
                      {o.item} <span style={{ color: '#fbbf24', fontWeight: 700 }}>{o.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── NEARBY ORDERS PANEL ── */}
        <div style={{ ...section, maxHeight: 280 }}>
          <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ color: 'var(--blue)' }}>📦</span> Nearby Orders
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {['all','delivered','pending','cancelled'].map(f => (
                <button key={f} onClick={() => setOrderFilter(f)}
                  style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 20, cursor: 'pointer', textTransform: 'capitalize',
                    background: orderFilter === f ? 'var(--accent)' : 'var(--card2)',
                    color: orderFilter === f ? 'var(--bg)' : 'var(--muted)',
                    border: `1px solid ${orderFilter === f ? 'var(--accent)' : 'var(--border)'}` }}
                >{f}</button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
            {filteredOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 12 }}>No {orderFilter} orders</div>
            ) : filteredOrders.map(order => {
              const st = STATUS_STYLE[order.status] || STATUS_STYLE.pending;
              return (
                <div key={order.id} style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 7, display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, alignItems: 'start', transition: 'all 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border2)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{order.id}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, margin: '2px 0' }}>👤 {order.customer}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 5 }}>{order.items}</div>
                    {/* Color-coded status badge */}
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                      {st.label}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fbbf24' }}>{order.amount}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── HOURLY CHART + REAL ORDERS TABLE ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Hourly Orders Chart */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, marginBottom: 14 }}>📈 Hourly Order Volume</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="hour" tick={{ fill: 'var(--muted)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 9 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="orders" fill="var(--accent)" radius={[4, 4, 0, 0]} name="Orders" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Real orders from backend */}
        <div style={{ ...card, padding: 20, overflow: 'hidden' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
            🧾 Your Store Orders
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{orders.length} total</span>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 180 }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 36 }} />)}
              </div>
            ) : orders.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '24px 0' }}>No orders yet for your store</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Order', 'Customer', 'Total', 'Status'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 8).map(o => {
                    const sc = { placed: '#60a5fa', confirmed: '#4ade80', preparing: '#fbbf24', out_for_delivery: '#a78bfa', delivered: '#4ade80', cancelled: '#f87171' };
                    return (
                      <tr key={o._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px', fontWeight: 700, color: 'var(--accent)', fontSize: 11 }}>{o.orderId}</td>
                        <td style={{ padding: '8px', color: 'var(--text2)' }}>{o.customer?.name || '—'}</td>
                        <td style={{ padding: '8px', fontWeight: 700, color: '#fbbf24' }}>₹{o.pricing?.total}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: `${sc[o.status] || '#888'}18`, color: sc[o.status] || 'var(--muted)', border: `1px solid ${sc[o.status] || '#888'}35`, textTransform: 'uppercase' }}>
                            {o.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── SOCKET LIVE NOTIFICATIONS ── */}
      {notifications.filter(n => !n.read).length > 0 && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 8000 }}>
          {notifications.filter(n => !n.read).slice(0, 3).map(n => (
            <div key={n.id} style={{ background: 'var(--card2)', border: '1px solid var(--accent)', borderRadius: 12, padding: '12px 16px', fontSize: 13, animation: 'fadeIn 0.3s ease', boxShadow: 'var(--shadow-lg)', maxWidth: 280 }}>
              <span style={{ marginRight: 8 }}>{n.type === 'new_order' ? '🛍️' : '📦'}</span>
              {n.type === 'new_order' ? `New order! ${n.itemCount} items · ₹${n.total}` : `Order ${n.orderId} → ${n.status}`}
            </div>
          ))}
        </div>
      )}

      {/* ping animation for my store marker */}
      <style>{`
        @keyframes ping {
          0%   { transform: scale(1);   opacity: 0.6; }
          70%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}