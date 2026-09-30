// src/pages/Products.js
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../hooks/useApi';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

const CATS = ['all','vegetables','fruits','dairy','staples','snacks','bakery','beverages','meat','household'];
const SORTS = [
  { value:'popular',    label:'Most Popular' },
  { value:'newest',     label:'Newest' },
  { value:'price_asc',  label:'Price: Low→High' },
  { value:'price_desc', label:'Price: High→Low' },
  { value:'discount',   label:'Best Discount' },
];

const SEMANTIC_PRESETS = [
  "healthy breakfast items",
  "subah ka nashta",
  "quick dinner options",
  "high protein diet",
  "party snacks"
];

export default function Products() {
  const { addItem }  = useCart();
  const { user }     = useAuth();
  const [sp, setSp]  = useSearchParams();
  const [products, setProducts] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState('');
  const [toast,    setToast]    = useState('');
  const [isSemantic, setIsSemantic] = useState(false);

  const [filters, setFilters]  = useState({
    category: sp.get('category') || 'all',
    sort: 'popular',
    dietary: 'all'
  });

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      if (isSemantic && search.trim()) {
        const { data } = await api.get(`/ai/semantic-search?q=${encodeURIComponent(search)}`);
        setProducts(data.results || []);
        setTotal(data.results?.length || 0);
      } else {
        const params = new URLSearchParams({
          page, limit: 24,
          sort: filters.sort,
          ...(filters.category !== 'all' && { category: filters.category }),
          ...(filters.dietary !== 'all'  && { dietary: filters.dietary }),
          ...(search && { search })
        });
        const { data } = await api.get(`/products?${params}`);
        setProducts(data.products || []);
        setTotal(data.total || 0);
      }
    } finally { setLoading(false); }
  }, [page, filters, search, isSemantic]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const handleSemanticClick = (query) => {
    setSearch(query);
    setIsSemantic(true);
    setPage(1);
  };

  const handleAdd = (p) => {
    addItem(p);
    setToast(`${p.emoji || '🛒'} ${p.name} added to cart!`);
    setTimeout(() => setToast(''), 2200);
    if (user) api.post('/recommendations/interact', { productId: p._id, action: 'cart' }).catch(()=>{});
  };

  const cardStyle = {
    background:'var(--card, #1e293b)', border:'1px solid var(--border, #334155)', borderRadius:14,
    padding:16, display:'flex', flexDirection:'column', position:'relative', cursor:'default',
    transition:'all 0.18s'
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Search & Semantic Header */}
      <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '16px', borderRadius: 14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom: 10 }}>
          <input
            style={{ background:'var(--card, #1e293b)', border:'1px solid var(--border, #334155)', borderRadius:10, padding:'10px 14px', fontSize:13, color:'var(--text)', flex: 1, minWidth: 220 }}
            placeholder="🔍 Natural language or product search (e.g. 'healthy breakfast items', 'subah ka nashta')"
            value={search}
            onChange={e => { setSearch(e.target.value); setIsSemantic(false); setPage(1); }}
          />
          <button
            style={{ background: isSemantic ? '#10b981' : 'var(--card2, #334155)', color: '#fff', border: '1px solid #10b981', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            onClick={() => { setIsSemantic(true); fetchProducts(); }}
          >
            🤖 AI Semantic Search
          </button>
        </div>

        {/* Quick Semantic Tags */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Try AI Queries:</span>
          {SEMANTIC_PRESETS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => handleSemanticClick(preset)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border, #334155)', color: '#10b981', borderRadius: 12, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              ✨ {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Filters bar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <select
          style={{ background:'var(--card, #1e293b)', border:'1px solid var(--border, #334155)', borderRadius:10, padding:'9px 12px', fontSize:13, color:'var(--text)' }}
          value={filters.sort}
          onChange={e => { setIsSemantic(false); setFilters({...filters, sort: e.target.value}); }}
        >
          {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          style={{ background:'var(--card, #1e293b)', border:'1px solid var(--border, #334155)', borderRadius:10, padding:'9px 12px', fontSize:13, color:'var(--text)' }}
          value={filters.dietary}
          onChange={e => { setIsSemantic(false); setFilters({...filters, dietary: e.target.value}); }}
        >
          <option value="all">All Dietary</option>
          <option value="veg">Vegetarian 🥦</option>
          <option value="vegan">Vegan 🌱</option>
        </select>
        <div style={{ marginLeft:'auto', fontSize:13, color:'var(--muted)' }}>{total} products found</div>
      </div>

      {/* Category chips */}
      <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
        {CATS.map(c => (
          <button
            key={c}
            onClick={() => { setIsSemantic(false); setFilters({...filters, category: c}); }}
            style={{
              padding:'6px 14px', borderRadius:20, fontSize:12.5, fontWeight:600, cursor:'pointer',
              background: filters.category === c ? '#10b981' : 'var(--card, #1e293b)',
              color: filters.category === c ? '#fff' : 'var(--text2)',
              border: `1px solid ${filters.category === c ? '#10b981' : 'var(--border, #334155)'}`,
              transition:'all 0.15s'
            }}
          >{c === 'all' ? '🛒 All' : c.charAt(0).toUpperCase() + c.slice(1)}</button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
          {Array(12).fill(0).map((_,i) => <div key={i} className="skeleton" style={{ height:240, borderRadius: 14 }}/>)}
        </div>
      ) : products.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--muted)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🔍</div>
          <div style={{ fontSize:16, fontWeight:600 }}>No products found</div>
          <div style={{ fontSize:13, marginTop:6 }}>Try adjusting filters or search term</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
          {products.map(p => (
            <div key={p._id} style={cardStyle}>
              {p.discount > 0 && <span style={{ position:'absolute', top:10, left:10, zIndex:1, background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6 }}>{p.discount}% OFF</span>}
              <div style={{ fontSize:44, textAlign:'center', marginBottom:10 }}>{p.emoji || '🛒'}</div>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:3, lineHeight:1.3 }}>{p.name}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6 }}>{p.unit}</div>

              {p.aiExplanation && (
                <div style={{ fontSize: 10, color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '3px 6px', borderRadius: 5, marginBottom: 8 }}>
                  ✨ {p.aiExplanation}
                </div>
              )}

              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, marginTop: 'auto' }}>
                <span style={{ fontSize:16, fontWeight:800, color:'#10b981' }}>₹{p.price}</span>
                {p.mrp > p.price && <span style={{ fontSize:11, color:'var(--muted)', textDecoration:'line-through' }}>₹{p.mrp}</span>}
              </div>
              <button
                style={{ background:'#10b981', color:'#fff', border:'none', borderRadius:8, padding:'8px', fontSize:13, fontWeight:700, width:'100%', cursor:'pointer' }}
                onClick={() => handleAdd(p)}
              >+ Add to Cart</button>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div style={{ position:'fixed', bottom:30, left:'50%', transform:'translateX(-50%)', background:'var(--card2, #1e293b)', border:'1px solid #10b981', color:'var(--text)', padding:'10px 22px', borderRadius:20, fontSize:13.5, boxShadow:'0 10px 30px rgba(0,0,0,0.5)', zIndex:9000 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
