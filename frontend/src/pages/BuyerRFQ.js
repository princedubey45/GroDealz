// src/pages/BuyerRFQ.js
// ─────────────────────────────────────────────────────────────────────────────
// Customer Screen: Custom Shopping Requirements & Merchant Quotation Engine
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../hooks/useApi';
import { useSocket } from '../context/SocketContext';
import styles from './BuyerRFQ.module.css';

const DEFAULT_EXAMPLE = "I need 25 kg basmati rice for a hostel. My budget is ₹2,500. Delivery within two days.";

export default function BuyerRFQ() {
  const navigate = useNavigate();
  const { socket } = useSocket();

  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'my_requests'
  const [loading, setLoading] = useState(false);
  const [parseLoading, setParseLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form State
  const [promptText, setPromptText] = useState(DEFAULT_EXAMPLE);
  const [title, setTitle] = useState('25 kg Basmati Rice for Hostel');
  const [items, setItems] = useState([
    { name: 'Basmati Rice', quantity: 25, unit: 'kg', preferredBrand: 'India Gate / Fortune', qualityGrade: 'Premium', notes: '' }
  ]);
  const [budget, setBudget] = useState(2500);
  const [shareBudget, setShareBudget] = useState(true);
  const [deliveryDays, setDeliveryDays] = useState(2);
  const [deliveryAddress, setDeliveryAddress] = useState({
    street: 'Hostel Block B, DM College Road',
    area: 'Imphal West',
    city: 'Imphal',
    pincode: '795001'
  });
  const [rankingPriority, setRankingPriority] = useState('lowest_price');

  // Customer's existing RFQs list
  const [myRequests, setMyRequests] = useState([]);
  const [selectedRfqDetails, setSelectedRfqDetails] = useState({}); // map of requestId -> { request, quotations }
  const [expandedQuotes, setExpandedQuotes] = useState({});

  // Counter-offer modal state
  const [counterModal, setCounterModal] = useState({ open: false, quote: null, proposedTotal: '', note: '' });
  const [actionLoading, setActionLoading] = useState(false);

  // 1. Fetch user requests
  const fetchMyRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/rfq/my');
      if (res.data.success) {
        setMyRequests(res.data.requests);
        // Automatically fetch quotations for each open request
        res.data.requests.forEach(r => fetchRfqDetails(r.requestId || r._id));
      }
    } catch (err) {
      console.error('Error fetching RFQs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRfqDetails = async (id) => {
    try {
      const res = await api.get(`/rfq/details/${id}`);
      if (res.data.success) {
        setSelectedRfqDetails(prev => ({
          ...prev,
          [res.data.request.requestId || res.data.request._id]: res.data
        }));
      }
    } catch (err) {
      console.error('Error loading RFQ details:', err);
    }
  };

  useEffect(() => {
    fetchMyRequests();
  }, []);

  // Real-time socket listener
  useEffect(() => {
    if (!socket) return;

    socket.on('quote_update', (data) => {
      console.log('⚡ Real-time quote update received:', data);
      fetchMyRequests();
    });

    return () => {
      socket.off('quote_update');
    };
  }, [socket]);

  // 2. Parse Natural Language Requirement
  const handleParsePrompt = async () => {
    if (!promptText.trim()) return;
    try {
      setParseLoading(true);
      setErrorMsg('');
      const res = await api.post('/rfq/parse-prompt', { prompt: promptText });
      if (res.data.success && res.data.parsed) {
        const p = res.data.parsed;
        setTitle(p.title || 'Custom Grocery Requirement');
        if (p.items && p.items.length > 0) setItems(p.items);
        if (p.budget) setBudget(p.budget);
        if (p.deliveryDays) setDeliveryDays(p.deliveryDays);
        setSuccessMsg('AI parsed your shopping requirements into structured line items!');
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to parse requirements');
    } finally {
      setParseLoading(false);
    }
  };

  // 3. Item modification handlers
  const handleItemChange = (idx, field, value) => {
    const updated = [...items];
    updated[idx][field] = value;
    setItems(updated);
  };

  const handleAddItem = () => {
    setItems([...items, { name: '', quantity: 1, unit: 'kg', preferredBrand: '', qualityGrade: '', notes: '' }]);
  };

  const handleRemoveItem = (idx) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  // 4. Submit RFQ
  const handleCreateRfq = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (items.some(i => !i.name.trim() || i.quantity <= 0)) {
      setErrorMsg('Please specify a valid product name and quantity for each item');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        title: title || `${items[0].quantity} ${items[0].unit} ${items[0].name}`,
        rawPrompt: promptText,
        items,
        budget: budget ? Number(budget) : null,
        shareBudgetWithMerchants: shareBudget,
        deliveryDays: Number(deliveryDays) || 2,
        deliveryAddress,
        rankingPriority
      };

      const res = await api.post('/rfq', payload);
      if (res.data.success) {
        setSuccessMsg(`Requirement broadcasted! RFQ ID: ${res.data.request.requestId}`);
        setActiveTab('my_requests');
        fetchMyRequests();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to submit requirement');
    } finally {
      setLoading(false);
    }
  };

  // 5. Update Ranking Priority dynamically
  const handleChangePriority = async (requestId, newPriority) => {
    try {
      await api.post(`/rfq/${requestId}/priority`, { priority: newPriority });
      fetchRfqDetails(requestId);
    } catch (err) {
      console.error('Failed to change priority:', err);
    }
  };

  // 6. Submit Counter Offer
  const handleSendCounter = async () => {
    if (!counterModal.quote || !counterModal.proposedTotal) return;
    try {
      setActionLoading(true);
      const res = await api.post(`/rfq/quotes/${counterModal.quote._id}/counter`, {
        proposedGrandTotal: Number(counterModal.proposedTotal),
        customerNote: counterModal.note
      });
      if (res.data.success) {
        setCounterModal({ open: false, quote: null, proposedTotal: '', note: '' });
        setSuccessMsg('Counter-offer sent to merchant!');
        fetchMyRequests();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send counter offer');
    } finally {
      setActionLoading(false);
    }
  };

  // 7. Accept Quotation & Convert to Confirmed Order
  const handleAcceptQuote = async (quote) => {
    if (!window.confirm(`Accept quotation from ${quote.store?.name || 'merchant'} for ₹${quote.grandTotal}? This will confirm your order.`)) {
      return;
    }

    try {
      setActionLoading(true);
      const res = await api.post(`/rfq/quotes/${quote._id}/accept`, {
        deliveryAddress: `${deliveryAddress.street}, ${deliveryAddress.area}, ${deliveryAddress.city}`,
        paymentMethod: 'cod'
      });
      if (res.data.success) {
        alert(`Order confirmed successfully! Order ID: ${res.data.order?.orderId}`);
        navigate(`/orders/${res.data.order?._id}`);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to accept quotation');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <div className={styles.title}>
              <span>📝</span> Custom Shopping Requirements
            </div>
            <div className={styles.subtitle}>
              Post any custom or bulk grocery requirement. Nearby merchants compete and provide itemized quotations!
            </div>
          </div>
          <div className={styles.tabButtons}>
            <button
              className={`${styles.tabBtn} ${activeTab === 'new' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('new')}
            >
              <span>➕</span> Post Requirement
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'my_requests' ? styles.tabBtnActive : ''}`}
              onClick={() => { setActiveTab('my_requests'); fetchMyRequests(); }}
            >
              <span>📋</span> My Requests ({myRequests.length})
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: 'rgba(255, 75, 75, 0.15)', border: '1px solid #ff4b4b', padding: '12px 16px', borderRadius: 10, color: '#ff6b6b', marginBottom: 20 }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ background: 'rgba(0, 230, 153, 0.15)', border: '1px solid var(--accent)', padding: '12px 16px', borderRadius: 10, color: 'var(--accent)', marginBottom: 20 }}>
          {successMsg}
        </div>
      )}

      {/* ── TAB 1: POST NEW REQUIREMENT ── */}
      {activeTab === 'new' && (
        <form onSubmit={handleCreateRfq} className={styles.postCard}>
          {/* Natural Language Prompt Input */}
          <div className={styles.promptSection}>
            <label className={styles.promptLabel}>
              <span>What do you need? (Describe in plain English)</span>
              <button
                type="button"
                className={styles.exampleBtn}
                onClick={() => {
                  setPromptText(DEFAULT_EXAMPLE);
                  setTimeout(handleParsePrompt, 100);
                }}
              >
                ✨ Load Hostel Rice Example
              </button>
            </label>
            <div className={styles.promptInputArea}>
              <textarea
                className={styles.promptTextarea}
                value={promptText}
                onChange={e => setPromptText(e.target.value)}
                placeholder='e.g. "I need 25 kg basmati rice for a hostel. My budget is ₹2,500. Delivery within two days."'
              />
            </div>
            <div className={styles.parseRow}>
              <button
                type="button"
                className={styles.parseBtn}
                onClick={handleParsePrompt}
                disabled={parseLoading || !promptText.trim()}
              >
                {parseLoading ? '🤖 Extracting Items…' : '⚡ Extract with AI Parser'}
              </button>
            </div>
          </div>

          {/* Structured Items Table */}
          <div className={styles.itemsSection}>
            <div className={styles.sectionHeading}>
              <span>📦 Requested Products & Line Items</span>
              <button type="button" className={styles.addItemBtn} onClick={handleAddItem}>
                + Add Another Item
              </button>
            </div>

            {items.map((item, idx) => (
              <div key={idx} className={styles.itemRow}>
                <input
                  type="text"
                  className={styles.inputField}
                  placeholder="Product Name (e.g. Basmati Rice)"
                  value={item.name}
                  onChange={e => handleItemChange(idx, 'name', e.target.value)}
                  required
                />
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  className={styles.inputField}
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                  required
                />
                <select
                  className={styles.inputField}
                  value={item.unit}
                  onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                >
                  <option value="kg">kg</option>
                  <option value="g">grams (g)</option>
                  <option value="L">Litre (L)</option>
                  <option value="ml">ml</option>
                  <option value="pack">Pack / Bag</option>
                  <option value="pc">Pieces</option>
                </select>
                <input
                  type="text"
                  className={styles.inputField}
                  placeholder="Preferred Brand / Quality"
                  value={item.preferredBrand}
                  onChange={e => handleItemChange(idx, 'preferredBrand', e.target.value)}
                />
                <button
                  type="button"
                  className={styles.deleteItemBtn}
                  onClick={() => handleRemoveItem(idx)}
                  disabled={items.length <= 1}
                  title="Remove Item"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Budget, Deadline & Priority Controls */}
          <div className={styles.parametersGrid}>
            <div className={styles.paramCard}>
              <div className={styles.paramTitle}>💰 Target Budget (₹)</div>
              <input
                type="number"
                min="0"
                className={styles.inputField}
                placeholder="Target Budget (e.g. 2500)"
                value={budget || ''}
                onChange={e => setBudget(e.target.value ? Number(e.target.value) : '')}
              />
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={shareBudget}
                  onChange={e => setShareBudget(e.target.checked)}
                />
                Share budget with merchants
              </label>
            </div>

            <div className={styles.paramCard}>
              <div className={styles.paramTitle}>⏱️ Delivery Deadline</div>
              <select
                className={styles.inputField}
                value={deliveryDays}
                onChange={e => setDeliveryDays(Number(e.target.value))}
              >
                <option value={1}>Urgent — Within 24 Hours</option>
                <option value={2}>Standard — Within 2 Days</option>
                <option value={3}>Within 3 Days</option>
                <option value={7}>Flexible — Within a Week</option>
              </select>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                Expected: {new Date(Date.now() + deliveryDays * 86400000).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>

            <div className={styles.paramCard}>
              <div className={styles.paramTitle}>📍 Delivery Location</div>
              <input
                type="text"
                className={styles.inputField}
                placeholder="Street / Landmark"
                value={deliveryAddress.street}
                onChange={e => setDeliveryAddress({ ...deliveryAddress, street: e.target.value })}
              />
              <input
                type="text"
                className={styles.inputField}
                style={{ marginTop: 6 }}
                placeholder="Area (e.g. Imphal West)"
                value={deliveryAddress.area}
                onChange={e => setDeliveryAddress({ ...deliveryAddress, area: e.target.value })}
              />
            </div>

            <div className={styles.paramCard}>
              <div className={styles.paramTitle}>🎯 Offer Ranking Priority</div>
              <select
                className={styles.prioritySelect}
                value={rankingPriority}
                onChange={e => setRankingPriority(e.target.value)}
              >
                <option value="lowest_price">💰 Lowest Price (Minimum Total)</option>
                <option value="fastest_delivery">⚡ Fastest Delivery</option>
                <option value="highest_rated">⭐ Highest Rated Merchants</option>
                <option value="balanced">⚖️ Balanced (Best Overall Value)</option>
              </select>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                GroDealz will automatically rank competing merchant quotes by this priority.
              </div>
            </div>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Broadcasting Request…' : '🚀 Broadcast Request to Nearby Merchants'}
          </button>
        </form>
      )}

      {/* ── TAB 2: MY REQUESTS & QUOTATION COMPARISON ── */}
      {activeTab === 'my_requests' && (
        <div className={styles.requestsGrid}>
          {myRequests.length === 0 ? (
            <div className={styles.emptyState}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>No custom requests posted yet</div>
              <p style={{ marginTop: 6, fontSize: 14 }}>Post a custom requirement to receive competitive line-item bids from nearby stores.</p>
              <button
                className={styles.exampleBtn}
                style={{ marginTop: 14, padding: '8px 18px', fontSize: 14 }}
                onClick={() => setActiveTab('new')}
              >
                + Post Your First Requirement
              </button>
            </div>
          ) : (
            myRequests.map(rfq => {
              const details = selectedRfqDetails[rfq.requestId || rfq._id];
              const quotations = details?.quotations || [];

              return (
                <div key={rfq._id} className={styles.requestCard}>
                  <div className={styles.cardTop}>
                    <div>
                      <div className={styles.rfqId}>REQ #{rfq.requestId}</div>
                      <div className={styles.rfqTitle}>{rfq.title}</div>
                      <div className={styles.rfqMeta}>
                        <span>📦 {rfq.items.length} Product{rfq.items.length > 1 ? 's' : ''}</span>
                        {rfq.budget && <span>💰 Target Budget: ₹{rfq.budget}</span>}
                        <span>⏱️ Deadline: {new Date(rfq.deliveryDeadline).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>📍 {rfq.deliveryAddress?.area || 'Imphal'}</span>
                      </div>
                    </div>
                    <div>
                      <span className={`${styles.statusPill} ${
                        rfq.status === 'accepted' ? styles.statusAccepted :
                        rfq.status === 'quotes_received' ? styles.statusQuotes :
                        rfq.status === 'negotiating' ? styles.statusNegotiating : styles.statusOpen
                      }`}>
                        ● {rfq.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Requested Items Pill Badges */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
                    {rfq.items.map((it, idx) => (
                      <span key={idx} style={{ background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: 8, fontSize: 12.5, color: '#fff' }}>
                        {it.name}: <strong>{it.quantity} {it.unit}</strong> {it.preferredBrand ? `(${it.preferredBrand})` : ''}
                      </span>
                    ))}
                  </div>

                  {/* Quotations Comparison Matrix */}
                  <div className={styles.quotesMatrix}>
                    <div className={styles.matrixHeader}>
                      <div className={styles.matrixTitle}>
                        <span>🏪</span> Merchant Quotations ({quotations.length})
                      </div>

                      {/* Dynamic Priority Switcher */}
                      {quotations.length > 0 && (
                        <div className={styles.priorityPillGroup}>
                          <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center', marginRight: 4 }}>Rank By:</span>
                          {[
                            { key: 'lowest_price', label: '💰 Lowest Total' },
                            { key: 'fastest_delivery', label: '⚡ Fastest' },
                            { key: 'highest_rated', label: '⭐ Top Rated' },
                            { key: 'balanced', label: '⚖️ Best Value' }
                          ].map(p => (
                            <button
                              key={p.key}
                              className={`${styles.priorityPill} ${rfq.rankingPriority === p.key ? styles.priorityPillActive : ''}`}
                              onClick={() => handleChangePriority(rfq.requestId || rfq._id, p.key)}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {quotations.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 13.5 }}>
                        ⏳ Request broadcasted to nearby stores. Quotations will appear here in real-time as merchants respond.
                      </div>
                    ) : (
                      <div className={styles.quotesGrid}>
                        {quotations.map((q, qIdx) => {
                          const isWinner = qIdx === 0;
                          const isExpanded = expandedQuotes[q._id];

                          return (
                            <div
                              key={q._id}
                              className={`${styles.quoteCard} ${isWinner ? styles.quoteCardWinner : ''}`}
                            >
                              {q.rankBadge && (
                                <div className={styles.rankBadge}>
                                  ★ {q.rankBadge}
                                </div>
                              )}

                              <div>
                                <div className={styles.storeInfo}>
                                  <div className={styles.storeAvatar}>
                                    {q.store?.emoji || '🏪'}
                                  </div>
                                  <div>
                                    <div className={styles.storeName}>{q.store?.name || 'Local Grocery Store'}</div>
                                    <div className={styles.storeRating}>
                                      ★ {(q.store?.ratings?.average || 4.5).toFixed(1)} ({q.store?.ratings?.count || 12} reviews)
                                    </div>
                                  </div>
                                </div>

                                {/* Stock & Delivery Status */}
                                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
                                  <span style={{ color: q.stockConfirmed ? '#00e699' : '#f59e0b' }}>
                                    {q.stockConfirmed ? '✓ 100% In Stock' : '⚠️ Partial Stock'}
                                  </span>
                                  <span>
                                    🚚 Delivery: {new Date(q.proposedDeliveryDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>

                                {q.budgetStatus && (
                                  <div style={{ fontSize: 12, fontWeight: 700, color: q.budgetStatus.includes('Saves') ? '#00e699' : '#ffaa00', marginBottom: 8 }}>
                                    {q.budgetStatus}
                                  </div>
                                )}

                                {/* Line Items Breakdown Accordion */}
                                <div className={styles.lineItemsBox}>
                                  <div
                                    style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 600 }}
                                    onClick={() => setExpandedQuotes(prev => ({ ...prev, [q._id]: !prev[q._id] }))}
                                  >
                                    <span>Itemized Quote ({q.lineItems.length} items)</span>
                                    <span>{isExpanded ? '▲ Hide' : '▼ View Breakdown'}</span>
                                  </div>

                                  {isExpanded && (
                                    <div style={{ marginTop: 8 }}>
                                      {q.lineItems.map((item, idx) => (
                                        <div key={idx} className={styles.lineItemRow}>
                                          <div>
                                            <strong>{item.productName}</strong>
                                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                              {item.quantity} {item.unit} @ ₹{item.unitPrice}/{item.unit} {item.brandOffered ? `(${item.brandOffered})` : ''}
                                            </div>
                                          </div>
                                          <div style={{ fontWeight: 700 }}>₹{item.lineTotal}</div>
                                        </div>
                                      ))}
                                      <div className={styles.lineItemRow} style={{ color: 'var(--muted)', marginTop: 4 }}>
                                        <span>Delivery Charge</span>
                                        <span>{q.deliveryCharge > 0 ? `₹${q.deliveryCharge}` : 'FREE'}</span>
                                      </div>
                                      {q.tax > 0 && (
                                        <div className={styles.lineItemRow} style={{ color: 'var(--muted)' }}>
                                          <span>Tax / GST</span>
                                          <span>₹{q.tax}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Counter Offer Alert if active */}
                                {q.counterOffer?.proposedGrandTotal && (
                                  <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: 8, borderRadius: 8, fontSize: 12, margin: '8px 0', color: '#fbbf24' }}>
                                    💬 Counter Sent: ₹{q.counterOffer.proposedGrandTotal} ({q.status?.replace(/_/g, ' ')})
                                  </div>
                                )}
                              </div>

                              <div>
                                <div className={styles.quoteTotalRow}>
                                  <div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Grand Total</div>
                                    <div className={styles.quoteGrandTotal}>₹{q.grandTotal}</div>
                                  </div>
                                  <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>
                                    Expires in {Math.max(0, Math.round((new Date(q.expiresAt) - Date.now()) / 3600000))}h
                                  </div>
                                </div>

                                {rfq.status !== 'accepted' && (
                                  <div className={styles.quoteActions}>
                                    <button
                                      type="button"
                                      className={styles.acceptBtn}
                                      onClick={() => handleAcceptQuote(q)}
                                      disabled={actionLoading}
                                    >
                                      ✓ Accept & Order
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.counterBtn}
                                      onClick={() => setCounterModal({
                                        open: true,
                                        quote: q,
                                        proposedTotal: q.grandTotal > 50 ? q.grandTotal - 50 : q.grandTotal,
                                        note: ''
                                      })}
                                    >
                                      Counter
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── COUNTER OFFER MODAL ── */}
      {counterModal.open && counterModal.quote && (
        <div className={styles.modalBackdrop} onClick={() => setCounterModal({ open: false, quote: null, proposedTotal: '', note: '' })}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
              💬 Counter-Offer to {counterModal.quote.store?.name || 'Merchant'}
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              Current quoted price: <strong>₹{counterModal.quote.grandTotal}</strong>. Propose a revised total price for this order.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
                YOUR PROPOSED TOTAL (₹)
              </label>
              <input
                type="number"
                min="1"
                className={styles.inputField}
                value={counterModal.proposedTotal}
                onChange={e => setCounterModal({ ...counterModal, proposedTotal: e.target.value })}
                placeholder="e.g. 2300"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
                NOTE TO MERCHANT (OPTIONAL)
              </label>
              <textarea
                className={styles.inputField}
                rows="3"
                value={counterModal.note}
                onChange={e => setCounterModal({ ...counterModal, note: e.target.value })}
                placeholder="e.g. Can you do ₹2,300 if we arrange pickup or pay upfront?"
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className={styles.acceptBtn}
                style={{ flex: 1 }}
                onClick={handleSendCounter}
                disabled={actionLoading || !counterModal.proposedTotal}
              >
                {actionLoading ? 'Sending…' : 'Send Counter-Offer'}
              </button>
              <button
                type="button"
                className={styles.counterBtn}
                onClick={() => setCounterModal({ open: false, quote: null, proposedTotal: '', note: '' })}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
