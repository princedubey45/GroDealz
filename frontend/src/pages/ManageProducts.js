// src/pages/ManageProducts.js
import React, { useEffect, useState } from 'react';
import api from '../hooks/useApi';

const CATEGORIES = [
  'vegetables','fruits','dairy','staples',
  'snacks','bakery','beverages','meat','household'
];

const EMOJIS = {
  vegetables:'🥦', fruits:'🍎', dairy:'🥛',
  staples:'🌾', snacks:'🍿', bakery:'🍞',
  beverages:'🥤', meat:'🥚', household:'🧹'
};

const EMPTY = {
  name:'', category:'vegetables', price:'', mrp:'',
  discount:'0', unit:'1 kg', emoji:'🥦',
  description:'', dietary:'veg', stock:'100'
};

export default function ManageProducts() {
  const [products, setProducts] = useState([]);
  const [form,     setForm]     = useState(EMPTY);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/products?sort=newest&limit=50')
      .then(r => setProducts(r.data.products || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleCategoryChange = (cat) => {
    setForm(f => ({ ...f, category: cat, emoji: EMOJIS[cat] || '🛒' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) return;
    setSaving(true);
    try {
      await api.post('/products', {
        ...form,
        price:    parseFloat(form.price),
        mrp:      parseFloat(form.mrp || form.price),
        discount: parseInt(form.discount || 0),
        stock:    parseInt(form.stock || 100),
      });
      showToast(`✅ ${form.emoji} ${form.name} added!`);
      setForm(EMPTY);
      setShowForm(false);
      load();
    } catch (err) {
      showToast('❌ ' + (err.response?.data?.message || 'Failed to add product'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remove "${name}" from your store?`)) return;
    await api.delete(`/products/${id}`);
    showToast(`🗑️ ${name} removed`);
    load();
  };

  // Styles
  const card   = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:20 };
  const input  = { background:'var(--card2)', border:'1px solid var(--border)', borderRadius:9, padding:'9px 13px', fontSize:13, color:'var(--text)', width:'100%', boxSizing:'border-box' };
  const label  = { fontSize:11, color:'var(--muted)', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:1 };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:800 }}>🛍️ Manage Products</h1>
          <p style={{ fontSize:13, color:'var(--text2)', marginTop:3 }}>Add fruits, vegetables and all your store items here</p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          style={{ background:'var(--accent)', color:'var(--bg)', padding:'10px 20px', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer' }}
        >
          {showForm ? '✕ Close' : '+ Add Product'}
        </button>
      </div>

      {/* ADD PRODUCT FORM */}
      {showForm && (
        <div style={{ ...card, border:'1px solid var(--accent)', animation:'fadeIn 0.25s ease' }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:17, marginBottom:18 }}>
            {form.emoji} Add New Product
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

              {/* Product Name */}
              <div style={{ gridColumn:'1/-1' }}>
                <label style={label}>Product Name *</label>
                <input style={input} placeholder="e.g. Fresh Tomatoes, Alphonso Mango…"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>

              {/* Category */}
              <div>
                <label style={label}>Category *</label>
                <select style={input} value={form.category}
                  onChange={e => handleCategoryChange(e.target.value)}
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{EMOJIS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Unit */}
              <div>
                <label style={label}>Unit / Pack Size</label>
                <select style={input} value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                >
                  {['250g','500g','1 kg','2 kg','5 kg','1 pc','6 pc','12 pc','250ml','500ml','1L','1 dozen','1 bunch'].map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              {/* Price */}
              <div>
                <label style={label}>Selling Price (₹) *</label>
                <input style={input} type="number" placeholder="e.g. 45"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  min="1" required
                />
              </div>

              {/* MRP */}
              <div>
                <label style={label}>MRP / Original Price (₹)</label>
                <input style={input} type="number" placeholder="e.g. 55"
                  value={form.mrp}
                  onChange={e => setForm(f => ({ ...f, mrp: e.target.value }))}
                  min="1"
                />
              </div>

              {/* Discount */}
              <div>
                <label style={label}>Discount (%)</label>
                <input style={input} type="number" placeholder="e.g. 20"
                  value={form.discount}
                  onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
                  min="0" max="90"
                />
              </div>

              {/* Stock */}
              <div>
                <label style={label}>Stock Quantity</label>
                <input style={input} type="number" placeholder="e.g. 100"
                  value={form.stock}
                  onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                  min="0"
                />
              </div>

              {/* Emoji */}
              <div>
                <label style={label}>Emoji Icon</label>
                <input style={input} placeholder="e.g. 🍅"
                  value={form.emoji}
                  onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                  maxLength={2}
                />
              </div>

              {/* Dietary */}
              <div>
                <label style={label}>Dietary Type</label>
                <select style={input} value={form.dietary}
                  onChange={e => setForm(f => ({ ...f, dietary: e.target.value }))}
                >
                  <option value="veg">🟢 Vegetarian</option>
                  <option value="vegan">🌱 Vegan</option>
                  <option value="non-veg">🔴 Non-Vegetarian</option>
                </select>
              </div>

              {/* Description */}
              <div style={{ gridColumn:'1/-1' }}>
                <label style={label}>Description (optional)</label>
                <input style={input} placeholder="e.g. Farm-fresh tomatoes from local farms"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>

            {/* Preview */}
            <div style={{ marginTop:18, background:'var(--card2)', border:'1px solid var(--border)', borderRadius:12, padding:14, display:'flex', alignItems:'center', gap:14 }}>
              <span style={{ fontSize:44 }}>{form.emoji || '🛒'}</span>
              <div>
                <div style={{ fontWeight:700, fontSize:15 }}>{form.name || 'Product Name'}</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>{form.unit} · {form.category}</div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
                  <span style={{ fontSize:17, fontWeight:800, color:'var(--accent)' }}>₹{form.price || '—'}</span>
                  {form.mrp && <span style={{ fontSize:12, color:'var(--muted)', textDecoration:'line-through' }}>₹{form.mrp}</span>}
                  {form.discount > 0 && <span style={{ fontSize:11, background:'rgba(74,222,128,0.12)', color:'var(--accent)', border:'1px solid rgba(74,222,128,0.25)', borderRadius:20, padding:'1px 7px', fontWeight:700 }}>{form.discount}% off</span>}
                </div>
              </div>
              <span style={{ marginLeft:'auto', fontSize:11, background: form.dietary==='veg'?'rgba(74,222,128,0.12)':form.dietary==='vegan'?'rgba(96,165,250,0.12)':'rgba(248,113,113,0.12)', color: form.dietary==='veg'?'var(--accent)':form.dietary==='vegan'?'var(--blue)':'var(--accent3)', border:'1px solid currentColor', borderRadius:20, padding:'3px 10px', fontWeight:700 }}>
                {form.dietary === 'veg' ? '🟢 VEG' : form.dietary === 'vegan' ? '🌱 VEGAN' : '🔴 NON-VEG'}
              </span>
            </div>

            <div style={{ display:'flex', gap:10, marginTop:16 }}>
              <button type="submit" disabled={saving}
                style={{ flex:1, background:'var(--accent)', color:'var(--bg)', padding:13, borderRadius:10, fontSize:15, fontWeight:800, cursor:'pointer', opacity: saving ? 0.6 : 1, fontFamily:'var(--font-display)' }}
              >
                {saving ? 'Adding…' : `${form.emoji} Add to Store`}
              </button>
              <button type="button" onClick={() => setForm(EMPTY)}
                style={{ background:'var(--card2)', border:'1px solid var(--border)', color:'var(--text2)', padding:'13px 20px', borderRadius:10, fontSize:14, cursor:'pointer' }}
              >Reset</button>
            </div>
          </form>
        </div>
      )}

      {/* PRODUCT LIST */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:15 }}>Your Products</div>
          <span style={{ fontSize:12, color:'var(--muted)' }}>{products.length} items</span>
        </div>

        {loading ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10 }}>
            {Array(6).fill(0).map((_,i) => <div key={i} className="skeleton" style={{ height:180 }}/>)}
          </div>
        ) : products.length === 0 ? (
          <div style={{ textAlign:'center', padding:'50px 0', color:'var(--muted)' }}>
            <div style={{ fontSize:52, marginBottom:12 }}>🛒</div>
            <div style={{ fontWeight:600, fontSize:15, marginBottom:6 }}>No products yet</div>
            <div style={{ fontSize:13 }}>Click "Add Product" above to add your first item</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10 }}>
            {products.map(p => (
              <div key={p._id} style={{ background:'var(--card2)', border:'1px solid var(--border)', borderRadius:12, padding:14, display:'flex', flexDirection:'column', position:'relative' }}>
                <div style={{ fontSize:40, textAlign:'center', marginBottom:8 }}>{p.emoji || '🛒'}</div>
                {p.discount > 0 && (
                  <span style={{ position:'absolute', top:8, left:8, fontSize:9, fontWeight:700, background:'rgba(74,222,128,0.12)', color:'var(--accent)', border:'1px solid rgba(74,222,128,0.25)', borderRadius:20, padding:'2px 7px' }}>
                    {p.discount}% off
                  </span>
                )}
                <div style={{ fontSize:12.5, fontWeight:700, marginBottom:2, lineHeight:1.3 }}>{p.name}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6 }}>{p.unit} · {p.category}</div>
                <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:10 }}>
                  <span style={{ fontSize:15, fontWeight:800, color:'var(--accent)' }}>₹{p.price}</span>
                  {p.mrp > p.price && <span style={{ fontSize:11, color:'var(--muted)', textDecoration:'line-through' }}>₹{p.mrp}</span>}
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', marginBottom:10 }}>
                  📦 Stock: {p.stock?.quantity ?? '—'} · 🛒 {p.orderCount} orders
                </div>
                <button
                  onClick={() => handleDelete(p._id, p.name)}
                  style={{ marginTop:'auto', background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', color:'var(--accent3)', borderRadius:8, padding:'6px', fontSize:12, fontWeight:600, cursor:'pointer' }}
                >
                  🗑️ Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:30, left:'50%', transform:'translateX(-50%)', background:'var(--card2)', border:'1px solid var(--accent)', color:'var(--text)', padding:'10px 24px', borderRadius:20, fontSize:13.5, boxShadow:'var(--shadow-lg)', zIndex:9000, animation:'fadeIn 0.3s ease' }}>
          {toast}
        </div>
      )}
    </div>
  );
}