// src/components/Layout.js
import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth }   from '../context/AuthContext';
import { useCart }   from '../context/CartContext';
import { useSocket } from '../context/SocketContext';
import Chatbot       from './Chatbot';
import styles        from './Layout.module.css';

const NAV = [
  { to: '/',           icon: '⚡', label: 'Home',       public: true },
  { to: '/products',   icon: '🛒', label: 'Shop',       public: true },
  { to: '/stores',     icon: '🗺️', label: 'Stores',     public: true },
  { to: '/cart',       icon: '🧺', label: 'Cart',       public: false },
  { to: '/orders',     icon: '📦', label: 'Orders',     public: false },
  { to: '/dashboard',  icon: '📊', label: 'Dashboard',  owner: true },
  { to: '/ai-insights',icon: '🤖', label: 'AI Insights',owner: true },
  { to: '/manage-products', icon: '➕', label: 'Add Products', owner: true },
];

export default function Layout() {
  const { user, logout }   = useAuth();
  const { itemCount }      = useCart();
  const { connected, unreadCount, notifications, markRead } = useSocket();
  const location           = useLocation();
  const navigate           = useNavigate();
  const [showNotif, setShowNotif] = useState(false);
  const [chatOpen, setChatOpen]   = useState(false);

  const isOwner = user && ['owner','admin'].includes(user.role);

  const visibleNav = NAV.filter(n => {
    if (n.owner)  return isOwner;
    if (!n.public) return !!user;
    return true;
  });

  return (
    <div className={styles.app}>
      {/* ── SIDEBAR ── */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <span className={styles.logoText}>Gro<span>Dealz</span></span>
          <span className={styles.logoTag}>AI Powered</span>
        </div>

        <nav className={styles.nav}>
          {visibleNav.map(n => (
            <Link
              key={n.to}
              to={n.to}
              className={`${styles.navItem} ${location.pathname === n.to ? styles.active : ''}`}
            >
              <span className={styles.navIcon}>{n.icon}</span>
              <span>{n.label}</span>
              {n.to === '/cart' && itemCount > 0 && (
                <span className={styles.navBadge}>{itemCount}</span>
              )}
            </Link>
          ))}
        </nav>

        {/* AI Feature Pills */}
        <div className={styles.aiPills}>
          <div className={styles.pillTitle}>AI Features</div>
          <div className={styles.pill}><span>🧠</span> Collaborative Filter</div>
          <div className={styles.pill}><span>📐</span> Content-Based Filter</div>
          <div className={styles.pill}><span>📈</span> Demand Prediction</div>
          <div className={styles.pill}><span>💬</span> NLP Chatbot</div>
        </div>

        {user ? (
          <div className={styles.userSection}>
            <div className={styles.avatar}>{user.name[0].toUpperCase()}</div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user.name}</div>
              <div className={styles.userRole}>{user.role}</div>
            </div>
            <button className={styles.logoutBtn} onClick={() => { logout(); navigate('/login'); }} title="Logout">⏏</button>
          </div>
        ) : (
          <div className={styles.authButtons}>
            <Link to="/login"    className={styles.btnLogin}>Login</Link>
            <Link to="/register" className={styles.btnRegister}>Sign Up</Link>
          </div>
        )}
      </aside>

      {/* ── MAIN ── */}
      <div className={styles.main}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <div className={`${styles.liveIndicator} ${connected ? styles.live : styles.offline}`}>
              <span className={styles.dot}/>
              {connected ? 'Live' : 'Offline'}
            </div>
            <div className={styles.locationTag}>📍 Imphal, Manipur</div>
          </div>

          <div className={styles.topbarRight}>
            {/* Notifications */}
            <div className={styles.notifWrapper}>
              <button
                className={styles.iconBtn}
                onClick={() => setShowNotif(s => !s)}
              >
                🔔
                {unreadCount > 0 && <span className={styles.notifBubble}>{unreadCount}</span>}
              </button>
              {showNotif && (
                <div className={styles.notifDropdown}>
                  <div className={styles.notifHeader}>Notifications</div>
                  {notifications.length === 0 ? (
                    <div className={styles.notifEmpty}>No notifications yet</div>
                  ) : notifications.slice(0, 6).map(n => (
                    <div
                      key={n.id}
                      className={`${styles.notifItem} ${!n.read ? styles.unread : ''}`}
                      onClick={() => markRead(n.id)}
                    >
                      <span>{n.type === 'order' ? '📦' : '🛍️'}</span>
                      <span>{n.type === 'order' ? `Order ${n.orderId} → ${n.status}` : `New order: ${n.itemCount} items`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart */}
            <Link to="/cart" className={styles.iconBtn}>
              🛒
              {itemCount > 0 && <span className={styles.notifBubble}>{itemCount}</span>}
            </Link>

            {/* Chatbot toggle */}
            <button
              className={`${styles.chatBtn} ${chatOpen ? styles.chatBtnActive : ''}`}
              onClick={() => setChatOpen(s => !s)}
              title="AI Chat Assistant"
            >
              💬 GroBot
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>

      {/* ── CHATBOT ── */}
      {chatOpen && <Chatbot onClose={() => setChatOpen(false)} />}
    </div>
  );
}
