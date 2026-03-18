// src/pages/StoreFinder.js
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../hooks/useApi';

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'), iconUrl: require('leaflet/dist/images/marker-icon.png'), shadowUrl: require('leaflet/dist/images/marker-shadow.png') });

function makeMarkerIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #0f1310;box-shadow:0 2px 10px rgba(0,0,0,0.5)"></div>`,
    iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -32]
  });
}

const COLORS = ['#4ade80','#fbbf24','#60a5fa','#f472b6','#fb923c','#a78bfa'];

export default function StoreFinder() {
  const [stores,  setStores]  = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/stores').then(r => setStores(r.data)).finally(() => setLoading(false));
  }, []);

  // Fallback stores for display when backend is not running
  const displayStores = stores.length ? stores : [
    { _id:'1', name:'FreshMart Central',   emoji:'🏪', location:{ lat:24.817, lng:93.937, area:'Paona Bazar' },   hours:{open:'07:00',close:'22:00'}, ratings:{average:4.8}, categories:['vegetables','dairy'] },
    { _id:'2', name:'GreenLeaf Grocers',   emoji:'🥬', location:{ lat:24.822, lng:93.942, area:'Thangal Bazar' }, hours:{open:'08:00',close:'21:00'}, ratings:{average:4.5}, categories:['organic','fruits'] },
    { _id:'3', name:'Daily Needs Store',   emoji:'🛒', location:{ lat:24.810, lng:93.931, area:'Lamphel' },       hours:{open:'06:00',close:'23:00'}, ratings:{average:4.2}, categories:['dairy','snacks'] },
    { _id:'4', name:'NatureFresh Market',  emoji:'🌿', location:{ lat:24.826, lng:93.928, area:'Singjamei' },     hours:{open:'07:00',close:'21:00'}, ratings:{average:4.6}, categories:['organic','vegetables'] },
    { _id:'5', name:'Sunrise Provisions',  emoji:'🌅', location:{ lat:24.808, lng:93.944, area:'Porompat' },      hours:{open:'08:00',close:'22:00'}, ratings:{average:4.3}, categories:['staples','beverages'] },
  ];

  const cardStyle = (id) => ({
    background: selected?._id === id ? 'rgba(74,222,128,0.06)' : 'var(--card)',
    border: `1px solid ${selected?._id === id ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
    transition: 'all 0.15s'
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <div>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:800, marginBottom:4 }}>🗺️ Find Stores</h1>
        <p style={{ fontSize:13, color:'var(--text2)' }}>Browse nearby grocery stores in Imphal and view their offers</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:16, height:520 }}>
        {/* Store list */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, overflowY:'auto' }}>
          {displayStores.map((store, i) => (
            <div key={store._id} style={cardStyle(store._id)} onClick={() => setSelected(store)}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                <span style={{ fontSize:24 }}>{store.emoji || '🏪'}</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:13.5 }}>{store.name}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>📍 {store.location?.area || store.location?.city}</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                {store.categories?.slice(0,3).map(c => (
                  <span key={c} className="badge badge-blue" style={{ fontSize:9 }}>{c}</span>
                ))}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text2)' }}>
                <span>🕐 {store.hours?.open} – {store.hours?.close}</span>
                <span>⭐ {store.ratings?.average?.toFixed(1) || '4.5'}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Map */}
        <div style={{ borderRadius:16, overflow:'hidden', border:'1px solid var(--border)' }}>
          <MapContainer
            center={[24.817, 93.937]}
            zoom={14}
            style={{ width:'100%', height:'100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='© CARTO'
            />
            {displayStores.map((store, i) => (
              store.location?.lat && (
                <Marker
                  key={store._id}
                  position={[store.location.lat, store.location.lng]}
                  icon={makeMarkerIcon(COLORS[i % COLORS.length])}
                  eventHandlers={{ click: () => setSelected(store) }}
                >
                  <Popup>
                    <div>
                      <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:14, color:'var(--accent)', marginBottom:6 }}>
                        {store.emoji} {store.name}
                      </div>
                      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:3 }}>📍 {store.location.area}</div>
                      <div style={{ fontSize:12, color:'var(--text2)', marginBottom:3 }}>🕐 {store.hours?.open} – {store.hours?.close}</div>
                      <div style={{ fontSize:12, color:'var(--text2)' }}>⭐ {store.ratings?.average?.toFixed(1) || '4.5'}</div>
                    </div>
                  </Popup>
                </Marker>
              )
            ))}
          </MapContainer>
        </div>
      </div>

      {/* Selected store detail */}
      {selected && (
        <div style={{ background:'var(--card)', border:'1px solid var(--accent)', borderRadius:16, padding:22, animation:'fadeIn 0.25s ease' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:14 }}>
            <span style={{ fontSize:40 }}>{selected.emoji || '🏪'}</span>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:20 }}>{selected.name}</div>
              <div style={{ fontSize:13, color:'var(--text2)' }}>📍 {selected.location?.area} · ⭐ {selected.ratings?.average?.toFixed(1)} · 🕐 {selected.hours?.open}–{selected.hours?.close}</div>
            </div>
            <button onClick={() => setSelected(null)} style={{ marginLeft:'auto', background:'var(--card2)', border:'1px solid var(--border)', color:'var(--muted)', width:30, height:30, borderRadius:8, cursor:'pointer', fontSize:14 }}>✕</button>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {selected.categories?.map(c => <span key={c} className="badge badge-green">{c}</span>)}
          </div>
          <div style={{ marginTop:14, background:'rgba(74,222,128,0.04)', border:'1px solid rgba(74,222,128,0.15)', borderRadius:10, padding:12, fontSize:13, color:'var(--text2)' }}>
            🤖 <strong>AI Note:</strong> Based on demand prediction, this store is likely to have high traffic during evening hours (6–9 PM). Order early for faster delivery!
          </div>
        </div>
      )}
    </div>
  );
}
