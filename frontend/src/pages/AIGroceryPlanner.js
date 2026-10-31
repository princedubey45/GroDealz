// src/pages/AIGroceryPlanner.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import api from '../hooks/useApi';
import styles from './AIGroceryPlanner.module.css';

const PRESETS = [
  "Buy groceries for a family of four for three days. My budget is ₹1,500. Prefer fresh vegetables, good-quality rice, and the cheapest reasonable options. Deliver today.",
  "Buy 2 kg rice, 1 litre milk, 1 kg potatoes and 500 g tomatoes. Find the best value available near me.",
  "Mujhe 2 log ke liye 7 din ka veg grocery chahiye under 1500",
  "Party snacks and beverages for 5 people under ₹600"
];

export default function AIGroceryPlanner() {
  const { addBasket } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState(PRESETS[0]);
  const [loading, setLoading] = useState(false);
  const [agentData, setAgentData] = useState(null);
  const [activeStrategy, setActiveStrategy] = useState('multiStore'); // 'multiStore' | 'singleStore'
  const [deliveryAddress, setDeliveryAddress] = useState(user?.addresses?.[0]?.street || '123 Main Street, Paona Bazar, Imphal');
  const [paymentMethod, setPaymentMethod] = useState('online');
  const [ordering, setOrdering] = useState(false);
  const [notification, setNotification] = useState('');

  // Load Razorpay checkout script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // Fetch AI shopping agent recommendations
  const handleRunAgent = async (promptText = query) => {
    if (!promptText.trim()) return;
    setLoading(true);
    setNotification('');
    try {
      const res = await api.post('/ai/shopping-agent', { query: promptText });
      if (res.data?.success) {
        setAgentData(res.data);
      }
    } catch (err) {
      console.error('Agent generation failed:', err);
      setNotification('⚠️ Failed to generate AI plan. Please check connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleRunAgent(PRESETS[0]);
  }, []);

  const currentStrategyData = agentData?.strategies?.[activeStrategy];

  // 1-Click Customer-Approved Checkout (Razorpay + Multi-Store Order Creation)
  const handleApproveAndCheckout = async () => {
    if (!currentStrategyData) return;
    setOrdering(true);
    setNotification('');

    try {
      const itemsToOrder = (currentStrategyData.allItems || currentStrategyData.items || []).map(i => ({
        productId: i.product || i._id,
        quantity: i.quantity,
        storeId: i.store?.id || i.store?._id || i.store
      }));

      // Create multi-store order in backend
      const checkoutRes = await api.post('/orders/agent-checkout', {
        items: itemsToOrder,
        deliveryAddress,
        paymentMethod,
        deliveryNotes: `AI Shopping Agent Basket • ${agentData?.summary?.deliveryUrgency === 'today' ? 'Deliver Today' : 'Standard Delivery'}`
      });

      const { groupId, orders } = checkoutRes.data;

      if (paymentMethod === 'online') {
        // Initialize Razorpay order
        const rzpRes = await api.post('/payment/create-order', {
          groupId,
          orderIds: orders.map(o => o._id)
        });

        const { id, amount, currency, key } = rzpRes.data;

        const options = {
          key,
          amount,
          currency,
          name: "GroDealz",
          description: `AI Agent Order (${orders.length} stores)`,
          order_id: id,
          handler: async function (response) {
            try {
              const verifyRes = await api.post('/payment/verify', {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                groupId
              });

              if (verifyRes.data.success) {
                setNotification(`🎉 Payment verified! Successfully placed order across ${orders.length} store(s)!`);
                setTimeout(() => navigate('/orders'), 2000);
              }
            } catch (err) {
              setNotification('⚠️ Payment signature verification failed. View pending orders in Orders page.');
              setTimeout(() => navigate('/orders'), 2500);
            }
          },
          prefill: {
            name: user?.name || 'Customer',
            email: user?.email || 'customer@grodealz.com'
          },
          theme: { color: "#10b981" }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function () {
          setNotification('❌ Payment cancelled or failed. Your orders are saved in pending status.');
          setTimeout(() => navigate('/orders'), 2000);
        });
        rzp.open();
      } else {
        // Cash on Delivery
        setNotification(`🎉 Order placed successfully via Cash on Delivery! Group ID: ${groupId}`);
        setTimeout(() => navigate('/orders'), 2000);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setNotification(`⚠️ Checkout error: ${err.response?.data?.message || err.message}`);
    } finally {
      setOrdering(false);
    }
  };

  // Add entire basket to cart
  const handleAddToCart = () => {
    if (!currentStrategyData) return;
    const items = currentStrategyData.allItems || currentStrategyData.items || [];
    addBasket(items);
    setNotification(`🛒 Added ${items.length} items to your cart!`);
    setTimeout(() => setNotification(''), 4000);
  };

  return (
    <div className={styles.container}>
      {/* Hero Section */}
      <div className={styles.hero}>
        <div className={styles.badge}>
          <span>🤖 GRODEALZ · AI SHOPPING AGENT</span>
        </div>
        <h1 className={styles.title}>Autonomous AI Grocery Shopping</h1>
        <p className={styles.subtitle}>
          Describe what you need in plain English or Hinglish. Our AI searches across available shops, compares unit prices, verifies fresh stock, optimizes your basket, and prepares your order.
        </p>

        {/* Natural Language Prompt Input */}
        <div className={styles.queryBox}>
          <input
            type="text"
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRunAgent(query)}
            placeholder="e.g. Buy groceries for a family of four for three days. My budget is ₹1,500..."
          />
          <button className={styles.btnPrimary} onClick={() => handleRunAgent(query)} disabled={loading}>
            {loading ? '🧠 Finding Best Deals...' : '✨ Optimize Basket'}
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className={styles.presets}>
          {PRESETS.map((preset, idx) => (
            <button
              key={idx}
              className={styles.chip}
              onClick={() => {
                setQuery(preset);
                handleRunAgent(preset);
              }}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Extracted Intent & Constraint Badges */}
        {agentData?.summary && (
          <div className={styles.paramPills}>
            <div className={styles.paramPill}>
              👨‍👩‍👧‍👦 Family: <strong>{agentData.summary.familySize} Members</strong>
            </div>
            <div className={styles.paramPill}>
              📅 Duration: <strong>{agentData.summary.durationDays} Days</strong>
            </div>
            {agentData.summary.budget && (
              <div className={styles.paramPill}>
                💰 Target Budget: <strong>₹{agentData.summary.budget}</strong>
              </div>
            )}
            <div className={styles.paramPill}>
              ⚡ Delivery: <strong>{agentData.summary.deliveryUrgency === 'today' ? 'Today (Urgent)' : 'Standard'}</strong>
            </div>
            <div className={styles.paramPill}>
              🥗 Diet: <strong>{agentData.summary.dietary.toUpperCase()}</strong>
            </div>
            <div className={styles.paramPill}>
              🎯 Goal: <strong>{agentData.summary.qualityPreference.replace(/_/g, ' ')}</strong>
            </div>
          </div>
        )}
      </div>

      {notification && (
        <div style={{
          background: notification.includes('⚠️') || notification.includes('❌') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          border: `1px solid ${notification.includes('⚠️') || notification.includes('❌') ? '#ef4444' : '#10b981'}`,
          color: notification.includes('⚠️') || notification.includes('❌') ? '#fca5a5' : '#10b981',
          padding: '14px 18px',
          borderRadius: '12px',
          marginBottom: '1.5rem',
          fontWeight: '600',
          textAlign: 'center'
        }}>
          {notification}
        </div>
      )}

      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🤖</div>
          <h3 style={{ color: '#f8fafc', marginBottom: '8px' }}>Scanning Shop Catalogues & Comparing Prices...</h3>
          <p>Evaluating fresh vegetables, good-quality rice, unit rates, and delivery fees across shops.</p>
        </div>
      ) : agentData?.strategies ? (
        <>
          {/* Strategy Tabs */}
          <div className={styles.tabsContainer}>
            <button
              className={`${styles.tabBtn} ${activeStrategy === 'multiStore' ? styles.activeTab : ''}`}
              onClick={() => setActiveStrategy('multiStore')}
            >
              <span>🏪 Smart Multi-Store Value</span>
              <span className={styles.verifiedBadge}>Best Value</span>
            </button>
            {agentData.strategies.singleStore && (
              <button
                className={`${styles.tabBtn} ${activeStrategy === 'singleStore' ? styles.activeTab : ''}`}
                onClick={() => setActiveStrategy('singleStore')}
              >
                <span>📦 Single-Store Convenience ({agentData.strategies.singleStore.store?.name})</span>
              </button>
            )}
          </div>

          {/* AI Recommendation Alert */}
          {agentData.recommendationNote && (
            <div className={styles.savingsAlert}>
              <span>💡</span>
              <span>{agentData.recommendationNote}</span>
            </div>
          )}

          <div className={styles.grid}>
            {/* Left Column: Store-Grouped Basket */}
            <div>
              {activeStrategy === 'multiStore' ? (
                // Multi-Store Grouped View
                agentData.strategies.multiStore.stores.map((group, sIdx) => (
                  <div key={sIdx} className={styles.shopGroup}>
                    <div className={styles.shopHeader}>
                      <div className={styles.shopBadge}>
                        <span className={styles.shopEmoji}>{group.store.emoji}</span>
                        <div>
                          <div className={styles.shopName}>{group.store.name}</div>
                          <div className={styles.shopArea}>📍 {group.store.area} • ⭐ {group.store.rating}</div>
                        </div>
                      </div>
                      <div>
                        <div className={styles.shopSubtotal}>Subtotal: ₹{group.subtotal}</div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', textAlign: 'right' }}>
                          + ₹{group.deliveryFee} delivery
                        </div>
                      </div>
                    </div>

                    <div className={styles.itemsList}>
                      {group.items.map((item, iIdx) => (
                        <div key={iIdx} className={styles.basketItem}>
                          <div className={styles.itemLeft}>
                            <span className={styles.itemEmoji}>{item.emoji}</span>
                            <div>
                              <div className={styles.itemName}>
                                {item.name} <span className={styles.itemUnit}>· {item.quantity} ({item.unit})</span>
                              </div>
                              <div className={styles.itemRationale}>
                                ✨ {item.rationale}
                              </div>
                            </div>
                          </div>
                          <div className={styles.itemRight}>
                            <div className={styles.itemPrice}>₹{item.lineTotal}</div>
                            <div className={styles.unitRate}>₹{item.price} / unit</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                // Single Store View
                <div className={styles.shopGroup}>
                  <div className={styles.shopHeader}>
                    <div className={styles.shopBadge}>
                      <span className={styles.shopEmoji}>{agentData.strategies.singleStore.store?.emoji}</span>
                      <div>
                        <div className={styles.shopName}>{agentData.strategies.singleStore.store?.name}</div>
                        <div className={styles.shopArea}>📍 {agentData.strategies.singleStore.store?.area} • Single Delivery</div>
                      </div>
                    </div>
                    <div className={styles.shopSubtotal}>
                      Subtotal: ₹{agentData.strategies.singleStore.itemsSubtotal}
                    </div>
                  </div>

                  <div className={styles.itemsList}>
                    {agentData.strategies.singleStore.items.map((item, iIdx) => (
                      <div key={iIdx} className={styles.basketItem}>
                        <div className={styles.itemLeft}>
                          <span className={styles.itemEmoji}>{item.emoji}</span>
                          <div>
                            <div className={styles.itemName}>
                              {item.name} <span className={styles.itemUnit}>· {item.quantity} ({item.unit})</span>
                            </div>
                            <div className={styles.itemRationale}>✨ {item.rationale}</div>
                          </div>
                        </div>
                        <div className={styles.itemRight}>
                          <div className={styles.itemPrice}>₹{item.lineTotal}</div>
                          <div className={styles.unitRate}>₹{item.price} / unit</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Verified Order Summary & Checkout Card */}
            <div>
              <div className={styles.card}>
                <div className={styles.cardTitle}>
                  <span>📋 Order Summary</span>
                  <span className={styles.verifiedBadge}>🛡️ Verified Stock</span>
                </div>

                <div className={styles.summaryBox}>
                  <div className={styles.summaryRow}>
                    <span>Strategy:</span>
                    <strong style={{ color: '#f8fafc' }}>
                      {activeStrategy === 'multiStore' ? 'Multi-Store Value' : 'Single-Store'}
                    </strong>
                  </div>

                  <div className={styles.summaryRow}>
                    <span>Items Count:</span>
                    <span>{currentStrategyData.itemCount} items</span>
                  </div>

                  <div className={styles.summaryRow}>
                    <span>Products Subtotal:</span>
                    <span>₹{currentStrategyData.itemsSubtotal}</span>
                  </div>

                  <div className={styles.summaryRow}>
                    <span>
                      Delivery Fees ({activeStrategy === 'multiStore' ? `${currentStrategyData.storeCount} shops @ ₹30` : '1 shop'}):
                    </span>
                    <span>₹{activeStrategy === 'multiStore' ? currentStrategyData.deliveryFeesTotal : currentStrategyData.deliveryFee}</span>
                  </div>

                  {currentStrategyData.savings > 0 && (
                    <div className={styles.summaryRow} style={{ color: '#10b981' }}>
                      <span>Total Savings vs MRP:</span>
                      <strong>Save ₹{currentStrategyData.savings}</strong>
                    </div>
                  )}

                  <div className={styles.summaryTotalRow}>
                    <span>Total Cost:</span>
                    <span className={styles.totalAmount}>₹{currentStrategyData.grandTotal}</span>
                  </div>
                </div>

                {/* Delivery Address */}
                <div style={{ marginTop: '1.25rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#94a3b8' }}>
                    📍 Delivery Address:
                  </label>
                  <input
                    type="text"
                    className={styles.addressInput}
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Enter delivery address"
                  />
                </div>

                {/* Payment Method Selector */}
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#94a3b8' }}>
                    💳 Payment Method:
                  </label>
                  <div className={styles.paymentSelect}>
                    <div
                      className={`${styles.paymentOption} ${paymentMethod === 'online' ? styles.paymentOptionActive : ''}`}
                      onClick={() => setPaymentMethod('online')}
                    >
                      ⚡ Razorpay (UPI/Card)
                    </div>
                    <div
                      className={`${styles.paymentOption} ${paymentMethod === 'cod' ? styles.paymentOptionActive : ''}`}
                      onClick={() => setPaymentMethod('cod')}
                    >
                      💵 Cash on Delivery
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className={styles.checkoutActions}>
                  <button
                    className={styles.btnCheckout}
                    onClick={handleApproveAndCheckout}
                    disabled={ordering}
                  >
                    {ordering ? 'Placing Orders...' : '⚡ Customer-Approved Checkout'}
                  </button>

                  <button className={styles.btnCart} onClick={handleAddToCart}>
                    🛒 Add Basket to Cart
                  </button>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', marginTop: '1rem' }}>
                  🔒 Payments securely processed by Razorpay. All items verified directly in MongoDB catalog.
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.emptyState}>
          <p>Type what you need above and click "Optimize Basket".</p>
        </div>
      )}
    </div>
  );
}
