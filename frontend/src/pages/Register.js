// src/pages/Register.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import s from './Auth.module.css';

export default function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', password: '',
    role: 'customer', dietary: 'all',
    storeName: '', storeArea: ''
  });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await register(form);
      navigate(user.role === 'owner' ? '/dashboard' : '/');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logo}>Gro<span>Dealz</span></div>
        <h1 className={s.title}>Create account</h1>
        <p className={s.sub}>Join to get AI-powered grocery deals</p>

        {error && <div className={s.error}>{error}</div>}

        <form onSubmit={handle} className={s.form}>
          <input className={s.input} placeholder="Full name"
            value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />

          <input className={s.input} type="email" placeholder="Email"
            value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />

          <input className={s.input} type="password" placeholder="Password (min 6 chars)"
            value={form.password} onChange={e => setForm({...form, password: e.target.value})} required minLength={6} />

          <select className={s.select} value={form.role}
            onChange={e => setForm({...form, role: e.target.value})}>
            <option value="customer">👤 Customer</option>
            <option value="owner">🏪 Store Owner</option>
          </select>

          <select className={s.select} value={form.dietary}
            onChange={e => setForm({...form, dietary: e.target.value})}>
            <option value="all">🍽️ All (No preference)</option>
            <option value="veg">🥦 Vegetarian</option>
            <option value="vegan">🌱 Vegan</option>
            <option value="non-veg">🍗 Non-Vegetarian</option>
          </select>

          {/* Extra fields for store owner */}
          {form.role === 'owner' && (
            <>
              <div style={{ background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.2)', borderRadius:10, padding:'12px 14px', fontSize:12.5, color:'var(--text2)' }}>
                🏪 A store will be automatically created for you
              </div>
              <input className={s.input} placeholder="Store name (e.g. Raj Fresh Mart)"
                value={form.storeName} onChange={e => setForm({...form, storeName: e.target.value})} />
              <input className={s.input} placeholder="Store area (e.g. Paona Bazar, Imphal)"
                value={form.storeArea} onChange={e => setForm({...form, storeArea: e.target.value})} />
            </>
          )}

          <button className={s.btn} disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className={s.switch}>Have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}