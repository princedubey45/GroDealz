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

  // Milestone 3: Approval System States
  const [proposal, setProposal] = useState(null);
  const [revalidating, setRevalidating] = useState(false);
  const [revalidateResult, setRevalidateResult] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Live Animated Store-Hopping Tour States
  const [currentTourIndex, setCurrentTourIndex] = useState(0);
  const [isTourPlaying, setIsTourPlaying] = useState(false);
  const [isTourMinimized, setIsTourMinimized] = useState(false);

  // Auto-play store tour steps
  useEffect(() => {
    let timer = null;
    const tour = agentData?.storeTour || [];
    if (isTourPlaying && tour.length > 0) {
      timer = setInterval(() => {
        setCurrentTourIndex(prev => {
          if (prev >= tour.length - 1) {
            setIsTourPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1400);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isTourPlaying, agentData]);

  // Load Razorpay checkout script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // Pre-flight stock & price revalidation
  const runRevalidation = async (propId) => {
    if (!propId) return;
    setRevalidating(true);
    try {
      const res = await api.post(`/proposals/${propId}/revalidate`);
      if (res.data?.success) {
        setRevalidateResult(res.data);
      }
    } catch (e) {
      console.error('Revalidation error:', e);
    } finally {
      setRevalidating(false);
    }
  };

  // Create persistent proposal in MongoDB
  const createOrUpdateProposal = async (data, stratKey) => {
    const stratData = data?.strategies?.[stratKey];
    if (!stratData) return;
    try {
      const res = await api.post('/proposals', {
        query,
        requirements: data.summary || {},
        selectedStrategy: stratKey,
        strategyData: stratData,
        allStrategies: data.strategies
      });
      if (res.data?.success && res.data?.proposal) {
        setProposal(res.data.proposal);
        runRevalidation(res.data.proposal.proposalId);
      }
    } catch (e) {
      // Guest or offline fallback
    }
  };

  // Fetch AI shopping agent recommendations
  const handleRunAgent = async (promptText = query) => {
    if (!promptText.trim()) return;
    setLoading(true);
    setIsTourPlaying(false);
    setNotification('');
    try {
      const res = await api.post('/ai/shopping-agent', { query: promptText });
      if (res.data?.success) {
        setAgentData(res.data);
        createOrUpdateProposal(res.data, activeStrategy);
        setCurrentTourIndex(0);
        setIsTourPlaying(true);
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

  // When active strategy changes, update persistent proposal
  useEffect(() => {
    if (agentData?.strategies?.[activeStrategy]) {
      createOrUpdateProposal(agentData, activeStrategy);
    }
  }, [activeStrategy]);

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

  // Customer Human-in-the-Loop Approval (Pre-flight verify + SHA-256 seal)
  const handleCustomerApprove = async () => {
    if (!currentStrategyData) return;

    if (!proposal) {
      // Direct checkout for guest
      await handleApproveAndCheckout();
      return;
    }

    setOrdering(true);
    setNotification('');

    try {
      const approveRes = await api.post(`/proposals/${proposal.proposalId}/approve`);
      if (approveRes.data?.success) {
        setProposal(prev => ({
          ...prev,
          status: 'approved',
          approvalRecord: approveRes.data.approvalRecord
        }));
        const hashShort = approveRes.data.approvalRecord?.snapshotHash?.slice(0, 10);
        setNotification(`🔒 Proposal approved & cryptographically sealed! (SHA-256: ${hashShort}...)`);
        
        // Proceed to multi-store order checkout
        await handleApproveAndCheckout();
      }
    } catch (err) {
      setNotification(`⚠️ Approval check: ${err.response?.data?.message || err.message}`);
      setOrdering(false);
    }
  };

  // Rejection with tweak suggestions
  const handleRejectProposal = async () => {
    if (!proposal) {
      setShowRejectModal(false);
      return;
    }

    try {
      await api.post(`/proposals/${proposal.proposalId}/reject`, {
        reason: rejectReason || 'Customer requested adjustments'
      });
      setShowRejectModal(false);
      setNotification('Plan rejected. Re-optimizing AI basket with your adjustments...');
      const updatedPrompt = `${query}. Adjustment: ${rejectReason || 'Adjust choices'}`;
      setQuery(updatedPrompt);
      setRejectReason('');
      handleRunAgent(updatedPrompt);
    } catch (e) {
      setShowRejectModal(false);
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

  const tour = agentData?.storeTour || [];
  const activeTourStep = tour[currentTourIndex] || tour[tour.length - 1] || null;

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
        <div className={styles.tourContainer}>
          <div className={styles.tourHeader}>
            <div className={styles.tourTitleGroup}>
              <span className={styles.liveBadge}>
                <span className={styles.pulseDot} /> LIVE AGENT MISSION
              </span>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.25rem' }}>Autonomous Shopping Run Initiated</h3>
            </div>
          </div>
          <div className={styles.routeTracker}>
            <div className={styles.routeTrackLine}>
              <div className={styles.waypointItem}>
                <div className={`${styles.waypointNode} ${styles.waypointActive}`}>
                  <span>🛵</span>
                  <span className={styles.agentAvatarBadge}>⚡</span>
                </div>
                <span className={styles.waypointName}>Route Engine</span>
                <span className={styles.waypointStopTag}>Plotting Path</span>
              </div>
              <div className={styles.routeConnectingLine}>
                <div className={styles.routeLineProgress} style={{ width: '45%' }} />
              </div>
              <div className={styles.waypointItem}>
                <div className={styles.waypointNode}>🏪</div>
                <span className={styles.waypointName}>Partner Shops</span>
                <span className={styles.waypointStopTag}>Visiting</span>
              </div>
              <div className={styles.routeConnectingLine}>
                <div className={styles.routeLineProgress} style={{ width: '15%' }} />
              </div>
              <div className={styles.waypointItem}>
                <div className={styles.waypointNode}>⚖️</div>
                <span className={styles.waypointName}>Unit Rates</span>
                <span className={styles.waypointStopTag}>Comparing</span>
              </div>
              <div className={styles.routeConnectingLine}>
                <div className={styles.routeLineProgress} style={{ width: '0%' }} />
              </div>
              <div className={styles.waypointItem}>
                <div className={styles.waypointNode}>🧺</div>
                <span className={styles.waypointName}>Basket Hub</span>
                <span className={styles.waypointStopTag}>Optimizing</span>
              </div>
            </div>
          </div>
          <div className={styles.hudCard}>
            <div className={styles.hudLeftPanel}>
              <div className={styles.hudStoreHeader}>
                <div className={styles.hudStoreIdentity}>
                  <div className={styles.hudStoreEmoji}>🤖</div>
                  <div>
                    <div className={styles.hudStoreName}>Autonomous Shopper Dispatched</div>
                    <div className={styles.hudStoreSub}>Scanning local partner store shelves in real-time...</div>
                  </div>
                </div>
              </div>
              <div className={styles.hudNarrationBox}>
                Analyzing natural language query, extracting dietary requirements, and routing store visits across available shops...
              </div>
            </div>
            <div className={styles.hudRightPanel}>
              <div className={styles.hudScannerHeader}>
                <span>Live Shelf Scanner</span>
                <span>Active</span>
              </div>
              <div className={styles.scannerBeam} />
              <div className={styles.terminalCard}>
                <div className={styles.terminalHeader}>
                  <div className={styles.terminalDots}>
                    <div className={styles.terminalDot} />
                    <div className={styles.terminalDot} />
                    <div className={styles.terminalDot} />
                  </div>
                  <span>Agent Telemetry</span>
                </div>
                <div className={styles.terminalLogLine}>
                  <span className={styles.terminalTime}>[LIVE]</span>
                  <span className={styles.terminalHighlight}>Connecting to multi-store discovery network...</span>
                </div>
                <div className={styles.terminalLogLine}>
                  <span className={styles.terminalTime}>[LIVE]</span>
                  <span>Fetching active inventory & unit pricing (₹/kg, ₹/L)...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : agentData?.strategies ? (
        <>
          {/* Live Animated Store-Hopping Tour Card */}
          {tour.length > 0 && (
            <div className={styles.tourContainer}>
              <div className={styles.tourHeader}>
                <div className={styles.tourTitleGroup}>
                  <span className={styles.liveBadge}>
                    <span className={styles.pulseDot} />
                    {isTourPlaying ? 'LIVE STORE TOUR' : 'STORE JOURNEY AUDIT'}
                  </span>
                  <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.2rem', fontWeight: 800 }}>
                    {isTourPlaying ? 'Autonomous Shopper Visiting Stores...' : 'Autonomous Shopping Journey & Picking Audit'}
                  </h3>
                </div>
                <div className={styles.tourControls}>
                  {isTourPlaying ? (
                    <>
                      <button className={styles.tourBtn} onClick={() => setIsTourPlaying(false)}>
                        ⏸ Pause
                      </button>
                      <button
                        className={`${styles.tourBtn} ${styles.tourBtnPrimary}`}
                        onClick={() => {
                          setCurrentTourIndex(tour.length - 1);
                          setIsTourPlaying(false);
                        }}
                      >
                        ⏩ Skip to Basket
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={`${styles.tourBtn} ${styles.tourBtnPrimary}`}
                        onClick={() => {
                          setCurrentTourIndex(0);
                          setIsTourPlaying(true);
                        }}
                      >
                        ▶ Replay Store Journey
                      </button>
                      <button
                        className={styles.tourBtn}
                        onClick={() => setIsTourMinimized(!isTourMinimized)}
                      >
                        {isTourMinimized ? '📂 Expand Tour' : '📁 Collapse'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!isTourMinimized && (
                <>
                  {/* Horizontal Waypoint Map with Moving Avatar */}
                  <div className={styles.routeTracker}>
                    <div className={styles.routeTrackLine}>
                      {/* Start Node */}
                      <div
                        className={`${styles.waypointItem} ${currentTourIndex === 0 ? styles.waypointActive : styles.waypointCompleted}`}
                        onClick={() => setCurrentTourIndex(0)}
                      >
                        <div className={styles.waypointNode}>
                          <span>🛵</span>
                          {currentTourIndex === 0 && <span className={styles.agentAvatarBadge}>📍</span>}
                        </div>
                        <span className={styles.waypointName}>Dispatch</span>
                        <span className={styles.waypointStopTag}>Start</span>
                      </div>

                      {/* Connecting line to first store */}
                      <div className={styles.routeConnectingLine}>
                        <div
                          className={styles.routeLineProgress}
                          style={{ width: currentTourIndex > 0 ? '100%' : '0%' }}
                        />
                      </div>

                      {/* Stores Visited Nodes */}
                      {(agentData.storesVisited || []).map((vStore, sIdx) => {
                        const isCurrentStoreActive = activeTourStep?.store?.id === vStore.store.id;
                        const hasPassed = tour.slice(0, currentTourIndex + 1).some(st => st.store?.id === vStore.store.id);

                        return (
                          <React.Fragment key={sIdx}>
                            <div
                              className={`${styles.waypointItem} ${isCurrentStoreActive ? styles.waypointActive : hasPassed ? styles.waypointCompleted : ''}`}
                              onClick={() => {
                                const firstStepIdx = tour.findIndex(st => st.store?.id === vStore.store.id);
                                if (firstStepIdx !== -1) setCurrentTourIndex(firstStepIdx);
                              }}
                            >
                              <div className={styles.waypointNode}>
                                <span>{vStore.store.emoji || '🏪'}</span>
                                {isCurrentStoreActive && <span className={styles.agentAvatarBadge}>🛵</span>}
                              </div>
                              <span className={styles.waypointName}>{vStore.store.name}</span>
                              <span className={styles.waypointStopTag}>Stop #{sIdx + 1} ({vStore.itemCount} items)</span>
                            </div>

                            <div className={styles.routeConnectingLine}>
                              <div
                                className={styles.routeLineProgress}
                                style={{ width: hasPassed && currentTourIndex > sIdx ? '100%' : '0%' }}
                              />
                            </div>
                          </React.Fragment>
                        );
                      })}

                      {/* Final Basket Node */}
                      <div
                        className={`${styles.waypointItem} ${currentTourIndex >= tour.length - 1 ? styles.waypointActive : ''}`}
                        onClick={() => setCurrentTourIndex(tour.length - 1)}
                      >
                        <div className={styles.waypointNode}>
                          <span>🎯</span>
                          {currentTourIndex >= tour.length - 1 && <span className={styles.agentAvatarBadge}>✓</span>}
                        </div>
                        <span className={styles.waypointName}>Final Basket</span>
                        <span className={styles.waypointStopTag}>Optimized</span>
                      </div>
                    </div>
                  </div>

                  {/* Heads-Up Display (HUD) Active Step Inspector */}
                  <div className={styles.hudCard}>
                    {/* Left Panel: Store Identity & Action Narration */}
                    <div className={styles.hudLeftPanel}>
                      <div>
                        <div className={styles.hudStoreHeader}>
                          <div className={styles.hudStoreIdentity}>
                            <div className={styles.hudStoreEmoji}>
                              {activeTourStep?.store?.emoji || activeTourStep?.icon || '🏪'}
                            </div>
                            <div>
                              <div className={styles.hudStoreName}>
                                {activeTourStep?.store?.name || activeTourStep?.title}
                              </div>
                              <div className={styles.hudStoreSub}>
                                {activeTourStep?.store?.area ? `📍 In Store Aisle · ${activeTourStep.store.area} · ⭐ ${activeTourStep.store.rating || 4.5}` : activeTourStep?.badge}
                              </div>
                            </div>
                          </div>
                          <span className={styles.liveBadge}>{activeTourStep?.badge || 'Tour Step'}</span>
                        </div>

                        <div className={styles.hudNarrationBox}>
                          {activeTourStep?.narration}
                        </div>
                      </div>

                      {/* Step scrubber */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                        <button
                          className={styles.tourBtn}
                          disabled={currentTourIndex <= 0}
                          onClick={() => setCurrentTourIndex(prev => Math.max(0, prev - 1))}
                        >
                          ◀ Prev
                        </button>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', flex: 1, textAlign: 'center' }}>
                          Step {currentTourIndex + 1} of {tour.length}
                        </span>
                        <button
                          className={styles.tourBtn}
                          disabled={currentTourIndex >= tour.length - 1}
                          onClick={() => setCurrentTourIndex(prev => Math.min(tour.length - 1, prev + 1))}
                        >
                          Next ▶
                        </button>
                      </div>
                    </div>

                    {/* Right Panel: Shelf Scanner & Price Comparison Radar */}
                    <div className={styles.hudRightPanel}>
                      <div className={styles.hudScannerHeader}>
                        <span>Shelf Inspection & Price Radar</span>
                        <span style={{ color: '#10b981' }}>
                          {activeTourStep?.type === 'inspect_and_pick' ? 'Item Selected' : 'Active'}
                        </span>
                      </div>
                      <div className={styles.scannerBeam} />

                      {activeTourStep?.item ? (
                        <div>
                          <div className={styles.hudItemCard}>
                            <div className={styles.hudItemLeft}>
                              <span className={styles.hudItemEmoji}>{activeTourStep.item.emoji}</span>
                              <div>
                                <div className={styles.hudItemTitle}>{activeTourStep.item.name}</div>
                                <div className={styles.hudItemDetail}>
                                  Qty: {activeTourStep.item.quantity} ({activeTourStep.item.unit}) • ₹{activeTourStep.item.price} / unit
                                </div>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>
                                ₹{activeTourStep.item.lineTotal}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                Normalized: ₹{activeTourStep.item.normalizedRate}/kg
                              </div>
                            </div>
                          </div>

                          {activeTourStep.comparison && (
                            <div className={styles.hudComparisonBox}>
                              <span>⚖️ vs {activeTourStep.comparison.alternativeStore}: ₹{activeTourStep.comparison.alternativePrice}</span>
                              <strong>{activeTourStep.comparison.savings > 0 ? `Saved ₹${activeTourStep.comparison.savings} at this shop` : 'Fresher Quality Choice'}</strong>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ padding: '16px 0', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>
                          {activeTourStep?.type === 'dispatch' && '🗺️ Route computed. Dispatched to local partner stores.'}
                          {activeTourStep?.type === 'arrival' && `🚪 Entered store entrance. Scanning shelves for verified stock...`}
                          {activeTourStep?.type === 'store_packed' && `🛍️ Bagged items from this shop. Moving to next destination...`}
                          {activeTourStep?.type === 'mission_complete' && `🎯 Complete! All items sourced and optimized.`}
                        </div>
                      )}

                      {/* Real-Time Terminal Log */}
                      <div className={styles.terminalCard} style={{ marginTop: '12px' }}>
                        <div className={styles.terminalHeader}>
                          <div className={styles.terminalDots}>
                            <div className={styles.terminalDot} />
                            <div className={styles.terminalDot} />
                            <div className={styles.terminalDot} />
                          </div>
                          <span>Autonomous Agent Event Log</span>
                        </div>
                        {tour.slice(0, currentTourIndex + 1).map((logStep, lIdx) => (
                          <div key={lIdx} className={styles.terminalLogLine}>
                            <span className={styles.terminalTime}>[{logStep.badge || 'STOP'}]</span>
                            <span className={lIdx === currentTourIndex ? styles.terminalHighlight : ''}>
                              {logStep.title}: {logStep.narration}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Metrics Bar */}
                  {agentData.tourMetrics && (
                    <div className={styles.tourMetricsBar}>
                      <div className={styles.tourMetricItem}>
                        <div className={styles.tourMetricVal}>{agentData.tourMetrics.totalStoresVisited}</div>
                        <div className={styles.tourMetricLabel}>Shops Visited</div>
                      </div>
                      <div className={styles.tourMetricItem}>
                        <div className={styles.tourMetricVal}>{agentData.tourMetrics.totalProductsScanned}</div>
                        <div className={styles.tourMetricLabel}>Products Scanned</div>
                      </div>
                      <div className={styles.tourMetricItem}>
                        <div className={styles.tourMetricVal}>{agentData.tourMetrics.averageStoreRating} ⭐</div>
                        <div className={styles.tourMetricLabel}>Avg Store Rating</div>
                      </div>
                      <div className={styles.tourMetricItem}>
                        <div className={styles.tourMetricVal} style={{ color: '#38bdf8' }}>
                          ₹{agentData.tourMetrics.totalSavingsDiscovered}
                        </div>
                        <div className={styles.tourMetricLabel}>Discovered Savings</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

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
                                <span style={{
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  color: '#10b981',
                                  fontSize: '0.72rem',
                                  fontWeight: '700',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  marginLeft: '8px',
                                  display: 'inline-block'
                                }}>
                                  🏪 Sourced at Stop #{sIdx + 1}
                                </span>
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

                {/* Milestone 3: Human-in-the-Loop Approval & Cryptographic Audit Card */}
                {proposal && (
                  <div className={styles.approvalAuditCard}>
                    <div className={styles.approvalHeader}>
                      <span className={styles.proposalIdTag}>📋 {proposal.proposalId}</span>
                      <span className={`${styles.approvalStatusBadge} ${proposal.status === 'approved' ? styles.statusApproved : styles.statusPending}`}>
                        {proposal.status === 'approved' ? '✓ Approved' : 'Pending Review'}
                      </span>
                    </div>

                    {/* Live Pre-flight Revalidation Indicator */}
                    {revalidating ? (
                      <div className={styles.revalidateBanner}>🔄 Re-validating live catalog & stock...</div>
                    ) : revalidateResult ? (
                      <div className={`${styles.revalidateBanner} ${revalidateResult.canApprove ? styles.revalidateOk : styles.revalidateWarn}`}>
                        {revalidateResult.canApprove
                          ? '✓ Pre-flight Verified: All items active & in stock'
                          : '⚠️ Discrepancy: Some items went out of stock'}
                      </div>
                    ) : null}

                    {/* SHA-256 Cryptographic Snapshot Hash */}
                    {proposal.approvalRecord?.snapshotHash ? (
                      <div className={styles.auditHashSnippet}>
                        🔒 <strong>SHA-256 Audit Seal:</strong> {proposal.approvalRecord.snapshotHash}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                        🛡️ Approving generates an immutable SHA-256 audit record to lock prices.
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className={styles.checkoutActions}>
                  <button
                    className={styles.btnCheckout}
                    onClick={handleCustomerApprove}
                    disabled={ordering || (revalidateResult && !revalidateResult.canApprove)}
                  >
                    {ordering ? 'Processing...' : (proposal?.status === 'approved' ? '⚡ Proceed to Payment' : '✓ Approve Plan & Checkout')}
                  </button>

                  {proposal?.status !== 'approved' && (
                    <button className={styles.btnReject} onClick={() => setShowRejectModal(true)}>
                      ✕ Reject / Request Adjustments
                    </button>
                  )}

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

      {/* Milestone 3: Rejection & Tweak Modal */}
      {showRejectModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 style={{ color: '#f8fafc', marginBottom: '8px' }}>Tweak Shopping Plan</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginBottom: '14px' }}>
              Tell the AI what you'd like adjusted (e.g. "Prefer organic milk", "Lower budget to ₹1,200"):
            </p>
            <textarea
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '10px',
                color: '#f8fafc',
                padding: '10px',
                minHeight: '80px',
                marginBottom: '14px',
                fontSize: '0.9rem'
              }}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter adjustment instructions..."
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '8px 14px' }}
                onClick={() => setShowRejectModal(false)}
              >
                Cancel
              </button>
              <button
                style={{ background: '#ef4444', border: 'none', color: '#fff', borderRadius: '8px', padding: '8px 16px', fontWeight: '700', cursor: 'pointer' }}
                onClick={handleRejectProposal}
              >
                Submit & Re-Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
