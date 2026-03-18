// src/pages/Home.js
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import styles from './Home.module.css';

function ProductCard({ product, onAdd }) {
  return (
    <div className={styles.productCard}>
      <div className={styles.productEmoji}>{product.emoji || '🛒'}</div>
      {product.discount > 0 && (
        <span className={`badge badge-green ${styles.discountBadge}`}>{product.discount}% off</span>
      )}
      {product.ai?.trendTag === 'trending' && (
        <span className={`badge badge-yellow ${styles.trendBadge}`}>🔥 Hot</span>
      )}
      <div className={styles.productName}>{product.name}</div>
      <div className={styles.productUnit}>{product.unit}</div>
      <div className={styles.productPriceRow}>
        <span className={styles.price}>₹{product.price}</span>
        {product.mrp && product.mrp > product.price && (
          <span className={styles.mrp}>₹{product.mrp}</span>
        )}
      </div>
      {product._recommendType && (
        <div className={styles.aiTag}>
          🤖 {product._recommendType === 'collaborative' ? 'Users like you' :
               product._recommendType === 'content-based' ? 'Based on taste' : 'Popular'}
        </div>
      )}
      <button className={styles.addBtn} onClick={() => onAdd(product)}>+ Add</button>
    </div>
  );
}

function Section({ title, icon, tag, children, loading }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          <span>{icon}</span>
          {title}
          {tag && <span className={`badge badge-purple`} style={{ marginLeft: 8 }}>{tag}</span>}
        </div>
        <Link to="/products" className={styles.seeAll}>See all →</Link>
      </div>
      {loading ? (
        <div className={styles.skeletonRow}>
          {Array(5).fill(0).map((_, i) => <div key={i} className={`skeleton ${styles.skeletonCard}`} />)}
        </div>
      ) : (
        <div className={styles.productRow}>{children}</div>
      )}
    </section>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { addItem } = useCart();
  const [recommended, setRecommended] = useState([]);
  const [trending,    setTrending]    = useState([]);
  const [popular,     setPopular]     = useState([]);
  const [loadRec,     setLoadRec]     = useState(true);
  const [loadTrend,   setLoadTrend]   = useState(true);
  const [toast,       setToast]       = useState('');

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '☀️ Good morning' : hour < 17 ? '🌤️ Good afternoon' : '🌙 Good evening';

  useEffect(() => {
    // Trending (public)
    api.get('/demand/trending-products')
      .then(r => setTrending(r.data.slice(0, 8)))
      .finally(() => setLoadTrend(false));

    // Popular (public fallback)
    api.get('/products?sort=popular&limit=8')
      .then(r => setPopular(r.data.products || []));

    // AI Recommendations (auth)
    if (user) {
      api.get('/recommendations?strategy=hybrid&limit=10')
        .then(r => setRecommended(r.data.recommendations || []))
        .finally(() => setLoadRec(false));
    } else {
      setLoadRec(false);
    }
  }, [user]);

  const handleAdd = (product) => {
    addItem(product);
    setToast(`${product.emoji || '🛒'} ${product.name} added!`);
    setTimeout(() => setToast(''), 2500);
    if (user) api.post('/recommendations/interact', { productId: product._id, action: 'cart' }).catch(() => {});
  };

  const CATEGORIES = [
    { label:'Vegetables', emoji:'🥦', cat:'vegetables' },
    { label:'Fruits',     emoji:'🍎', cat:'fruits' },
    { label:'Dairy',      emoji:'🥛', cat:'dairy' },
    { label:'Staples',    emoji:'🌾', cat:'staples' },
    { label:'Snacks',     emoji:'🍿', cat:'snacks' },
    { label:'Bakery',     emoji:'🍞', cat:'bakery' },
    { label:'Beverages',  emoji:'🥤', cat:'beverages' },
    { label:'Meat & Eggs',emoji:'🥚', cat:'meat' },
  ];

  return (
    <div className={styles.page}>
      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroGreeting}>{greeting}{user ? `, ${user.name.split(' ')[0]}` : ''}!</div>
          <h1 className={styles.heroTitle}>Fresh groceries,<br/>delivered in <span>30 mins</span></h1>
          <p className={styles.heroSub}>AI-powered recommendations tailored to your taste, time, and location.</p>
          <div className={styles.heroBtns}>
            <Link to="/products" className={styles.heroBtnPrimary}>🛒 Shop Now</Link>
            <Link to="/stores"   className={styles.heroBtnSecondary}>🗺️ Find Stores</Link>
          </div>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.heroStat}><span>12+</span><p>Nearby Stores</p></div>
          <div className={styles.heroStat}><span>30</span><p>Min Delivery</p></div>
          <div className={styles.heroStat}><span>500+</span><p>Products</p></div>
          <div className={styles.heroStat}><span>AI</span><p>Powered</p></div>
        </div>
      </div>

      {/* Category pills */}
      <div className={styles.categories}>
        {CATEGORIES.map(c => (
          <Link key={c.cat} to={`/products?category=${c.cat}`} className={styles.catPill}>
            <span>{c.emoji}</span>
            {c.label}
          </Link>
        ))}
      </div>

      {/* AI Recommendation Banner */}
      {user && (
        <div className={styles.aiBanner}>
          <div className={styles.aiBannerIcon}>🧠</div>
          <div>
            <div className={styles.aiBannerTitle}>AI is learning your preferences</div>
            <div className={styles.aiBannerSub}>
              Using <strong>Collaborative Filtering</strong> + <strong>Content-Based Filtering</strong> — recommendations improve with every order.
            </div>
          </div>
          <div className={styles.aiBannerBadges}>
            <span className="badge badge-green">Collab. Filter</span>
            <span className="badge badge-purple">Content Filter</span>
            <span className="badge badge-blue">Time-Aware</span>
          </div>
        </div>
      )}

      {/* Sections */}
      {user && (
        <Section title="Recommended For You" icon="🤖" tag="AI Picks" loading={loadRec}>
          {recommended.map(p => <ProductCard key={p._id} product={p} onAdd={handleAdd} />)}
        </Section>
      )}

      <Section title="Trending Now" icon="🔥" tag="Demand ML" loading={loadTrend}>
        {trending.map(p => <ProductCard key={p._id} product={p} onAdd={handleAdd} />)}
      </Section>

      <Section title="Most Popular" icon="⭐" loading={false}>
        {popular.map(p => <ProductCard key={p._id} product={p} onAdd={handleAdd} />)}
      </Section>

      {/* Toast */}
      {toast && (
        <div className={styles.toast}>{toast}</div>
      )}
    </div>
  );
}
