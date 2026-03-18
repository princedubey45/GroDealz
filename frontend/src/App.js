// src/App.js
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider }          from './context/CartContext';
import { SocketProvider }        from './context/SocketContext';
import Layout                    from './components/Layout';
const ManageProducts = lazy(() => import('./pages/ManageProducts'));
import './index.css';

// Lazy-loaded pages
const Home          = lazy(() => import('./pages/Home'));
const Products      = lazy(() => import('./pages/Products'));
const Cart          = lazy(() => import('./pages/Cart'));
const Orders        = lazy(() => import('./pages/Orders'));
const OrderDetail   = lazy(() => import('./pages/OrderDetail'));
const Dashboard     = lazy(() => import('./pages/Dashboard'));
const Login         = lazy(() => import('./pages/Login'));
const Register      = lazy(() => import('./pages/Register'));
const AIInsights    = lazy(() => import('./pages/AIInsights'));
const StoreFinder   = lazy(() => import('./pages/StoreFinder'));

const Loader = () => (
  <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:16 }}>
    <div style={{ width:40,height:40,border:'3px solid var(--border)',borderTop:'3px solid var(--accent)',borderRadius:'50%',animation:'spin 0.8s linear infinite' }}/>
    <span style={{ color:'var(--muted)',fontSize:13 }}>Loading GroDealz…</span>
  </div>
);

function PrivateRoute({ children, ownerOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user)   return <Navigate to="/login" replace />;
  if (ownerOnly && !['owner','admin'].includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <CartProvider>
            <Suspense fallback={<Loader />}>
              <Routes>
                <Route path="/login"    element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route element={<Layout />}>
                  <Route path="/"         element={<Home />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/stores"   element={<StoreFinder />} />
                  <Route path="/cart"     element={<PrivateRoute><Cart /></PrivateRoute>} />
                  <Route path="/orders"   element={<PrivateRoute><Orders /></PrivateRoute>} />
                  <Route path="/orders/:id" element={<PrivateRoute><OrderDetail /></PrivateRoute>} />
                  <Route path="/dashboard" element={<PrivateRoute ownerOnly><Dashboard /></PrivateRoute>} />
                  <Route path="/ai-insights" element={<PrivateRoute ownerOnly><AIInsights /></PrivateRoute>} />
                  <Route path="/manage-products" element={<PrivateRoute ownerOnly><ManageProducts /></PrivateRoute>} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </CartProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
