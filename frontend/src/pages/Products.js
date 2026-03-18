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
  const [filters,  setFilters]  = useState({
    category: sp.get('category') || 'all',
    sort: 'popular',
    dietary: 'all'
  });

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
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
    } finally { setLoading(false); }
  }, [page, filters, search]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const handleAdd = (p) => {
    addItem(p);
    setToast(`${p.emoji || '🛒'} ${p.name} added to cart!`);
    setTimeout(() => setToast(''), 2200);
    if (user) api.post('/recommendations/interact', { productId: p._id, action: 'cart' }).catch(()=>{});
  };

  const cardStyle = {
    background:'var(--card)', border:'1px solid var(--border)', borderRadius:14,
    padding:16, display:'flex', flexDirection:'column', position:'relative', cursor:'default',
    transition:'all 0.18s'
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Filters bar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <input
          style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'9px 14px', fontSize:13, color:'var(--text)', width:220 }}
          placeholder="🔍 Search products…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'9px 12px', fontSize:13, color:'var(--text)' }}
          value={filters.sort}
          onChange={e => setFilters({...filters, sort: e.target.value})}
        >
          {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'9px 12px', fontSize:13, color:'var(--text)' }}
          value={filters.dietary}
          onChange={e => setFilters({...filters, dietary: e.target.value})}
        >
          <option value="all">All Dietary</option>
          <option value="veg">Vegetarian 🥦</option>
          <option value="vegan">Vegan 🌱</option>
        </select>
        <div style={{ marginLeft:'auto', fontSize:13, color:'var(--muted)' }}>{total} products</div>
      </div>

      {/* Category chips */}
      <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
        {CATS.map(c => (
          <button
            key={c}
            onClick={() => setFilters({...filters, category: c})}
            style={{
              padding:'6px 14px', borderRadius:20, fontSize:12.5, fontWeight:600, cursor:'pointer',
              background: filters.category === c ? 'var(--accent)' : 'var(--card)',
              color: filters.category === c ? 'var(--bg)' : 'var(--text2)',
              border: `1px solid ${filters.category === c ? 'var(--accent)' : 'var(--border)'}`,
              transition:'all 0.15s'
            }}
          >{c === 'all' ? '🛒 All' : c.charAt(0).toUpperCase() + c.slice(1)}</button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:12 }}>
          {Array(12).fill(0).map((_,i) => <div key={i} className="skeleton" style={{ height:230 }}/>)}
        </div>
      ) : products.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--muted)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🔍</div>
          <div style={{ fontSize:16, fontWeight:600 }}>No products found</div>
          <div style={{ fontSize:13, marginTop:6 }}>Try adjusting filters or search term</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:12 }}>
          {products.map(p => (
            <div key={p._id} style={cardStyle}
              onMouseEnter={e => { e.currentTarget.style.borderColor='var(--border2)'; e.currentTarget.style.transform='translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)'; }}
            >
              {p.discount > 0 && <span className="badge badge-green" style={{ position:'absolute', top:10, left:10, zIndex:1 }}>{p.discount}%</span>}
              {p.ai?.trendTag === 'trending' && <span className="badge badge-yellow" style={{ position:'absolute', top:10, right:10, zIndex:1 }}>🔥</span>}
              <div style={{ fontSize:44, textAlign:'center', marginBottom:10 }}>{p.emoji || '🛒'}</div>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:3, lineHeight:1.3 }}>{p.name}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>{p.unit}</div>
              {p.dietary?.isVeg && <span className="badge badge-green" style={{ marginBottom:8, fontSize:9 }}>VEG</span>}
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
                <span style={{ fontSize:16, fontWeight:800, color:'var(--accent)' }}>₹{p.price}</span>
                {p.mrp > p.price && <span style={{ fontSize:11, color:'var(--muted)', textDecoration:'line-through' }}>₹{p.mrp}</span>}
              </div>
              <div style={{ fontSize:10.5, color:'var(--muted)', marginBottom:10 }}>
                ⭐ {p.ratings?.average?.toFixed(1) || '4.0'} ({p.ratings?.count || 0})
              </div>
              <button
                style={{ background:'var(--accent)', color:'var(--bg)', border:'none', borderRadius:8, padding:'8px', fontSize:13, fontWeight:700, width:'100%', marginTop:'auto', cursor:'pointer' }}
                onClick={() => handleAdd(p)}
              >+ Add to Cart</button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 24 && (
        <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:8 }}>
          {Array.from({ length: Math.ceil(total/24) }, (_,i) => (
            <button key={i} onClick={() => setPage(i+1)}
              style={{ width:34, height:34, borderRadius:8, background: page===i+1 ? 'var(--accent)' : 'var(--card)', color: page===i+1 ? 'var(--bg)' : 'var(--text2)', border:'1px solid var(--border)', fontSize:13, fontWeight:600, cursor:'pointer' }}
            >{i+1}</button>
          ))}
        </div>
      )}

      {toast && (
        <div style={{ position:'fixed', bottom:30, left:'50%', transform:'translateX(-50%)', background:'var(--card2)', border:'1px solid var(--accent)', color:'var(--text)', padding:'10px 22px', borderRadius:20, fontSize:13.5, boxShadow:'var(--shadow-lg)', animation:'fadeIn 0.3s ease', zIndex:9000 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
