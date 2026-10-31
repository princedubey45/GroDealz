// src/pages/MerchantRFQ.js
// ─────────────────────────────────────────────────────────────────────────────
// Merchant Screen: Browse Nearby Customer RFQs & Submit Itemized Quotations
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import api from '../hooks/useApi';
import { useSocket } from '../context/SocketContext';
import styles from './MerchantRFQ.module.css';

export default function MerchantRFQ() {
  const { socket } = useSocket();

  const [activeTab, setActiveTab] = useState('open'); // 'open' | 'my_quotes'
  const [loading, setLoading] = useState(false);
  const [openRequests, setOpenRequests] = useState([]);
  const [myQuotations, setMyQuotations] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Quotation Submission Modal State
  const [quoteModal, setQuoteModal] = useState({
    open: false,
    rfq: null,
    isRevision: false,
    quoteId: null,
    lineItems: [],
    deliveryCharge: 50,
    tax: 0,
    proposedDeliveryDate: '',
    expiresHours: 24,
    stockConfirmed: true,
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // 1. Fetch Open RFQs
  const fetchOpenRfqs = async () => {
    try {
      setLoading(true);
      const res = await api.get('/rfq/merchant/open');
      if (res.data.success) {
        setOpenRequests(res.data.requests || []);
      }
    } catch (err) {
      console.error('Failed to fetch open RFQs:', err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch My Submitted Quotations
  const fetchMyQuotes = async () => {
    try {
      const res = await api.get('/rfq/merchant/my-quotes');
      if (res.data.success) {
        setMyQuotations(res.data.quotations || []);
      }
    } catch (err) {
      console.error('Failed to fetch merchant quotes:', err);
    }
  };

  useEffect(() => {
    fetchOpenRfqs();
    fetchMyQuotes();
  }, []);

  // 3. Socket real-time events for merchant alerts
  useEffect(() => {
    if (!socket) return;

    socket.emit('join_merchants_rfq');

    socket.on('new_rfq_available', (data) => {
      console.log('🔔 New customer RFQ available:', data);
      setSuccessMsg(`New Request Alert: "${data.title}" posted in ${data.area}!`);
      setTimeout(() => setSuccessMsg(''), 5000);
      fetchOpenRfqs();
    });

    socket.on('quote_update', (data) => {
      console.log('🔄 Quote update:', data);
      fetchMyQuotes();
      fetchOpenRfqs();
    });

    return () => {
      socket.off('new_rfq_available');
      socket.off('quote_update');
    };
  }, [socket]);

  // 4. Open Quotation Modal for a Request
  const handleOpenQuoteModal = (rfq, existingQuote = null) => {
    const isRevision = !!existingQuote;
    const defaultDelivery = rfq.deliveryDeadline
      ? new Date(rfq.deliveryDeadline).toISOString().slice(0, 16)
      : new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 16);

    // Build initial line items
    let initialLineItems = [];
    if (isRevision && existingQuote.lineItems?.length > 0) {
      initialLineItems = existingQuote.lineItems.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit || 'kg',
        unitPrice: item.unitPrice || 0,
        lineTotal: item.lineTotal || (item.quantity * (item.unitPrice || 0)),
        inStock: item.inStock !== false,
        brandOffered: item.brandOffered || '',
        notes: item.notes || ''
      }));
    } else {
      initialLineItems = (rfq.items || []).map((it, idx) => ({
        productName: it.name,
        quantity: it.quantity || 1,
        unit: it.unit || 'kg',
        unitPrice: 0,
        lineTotal: 0,
        inStock: true,
        brandOffered: it.preferredBrand || '',
        notes: ''
      }));
    }

    setQuoteModal({
      open: true,
      rfq,
      isRevision,
      quoteId: existingQuote?._id || null,
      lineItems: initialLineItems,
      deliveryCharge: isRevision ? existingQuote.deliveryCharge : 50,
      tax: isRevision ? existingQuote.tax : 0,
      proposedDeliveryDate: defaultDelivery,
      expiresHours: 24,
      stockConfirmed: isRevision ? existingQuote.stockConfirmed : true,
      notes: isRevision ? (existingQuote.counterOffer?.customerNote ? 'Revised to accommodate counter offer' : '') : ''
    });
  };

  // 5. Update line item in modal
  const handleLineItemChange = (idx, field, value) => {
    const updated = [...quoteModal.lineItems];
    updated[idx][field] = value;
    if (field === 'unitPrice' || field === 'quantity') {
      const q = Number(field === 'quantity' ? value : updated[idx].quantity) || 0;
      const p = Number(field === 'unitPrice' ? value : updated[idx].unitPrice) || 0;
      updated[idx].lineTotal = Math.round(q * p * 100) / 100;
    }
    setQuoteModal({ ...quoteModal, lineItems: updated });
  };

  // Computations for modal summary
  const subtotal = Math.round(quoteModal.lineItems.reduce((acc, it) => acc + (Number(it.lineTotal) || 0), 0) * 100) / 100;
  const deliveryCharge = Number(quoteModal.deliveryCharge) || 0;
  const tax = Number(quoteModal.tax) || 0;
  const grandTotal = Math.round((subtotal + deliveryCharge + tax) * 100) / 100;

  // 6. Submit Quotation
  const handleSubmitQuotation = async (e) => {
    e.preventDefault();
    if (quoteModal.lineItems.some(it => it.unitPrice <= 0)) {
      alert('Please provide a valid unit price for all requested items');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        lineItems: quoteModal.lineItems,
        deliveryCharge,
        tax,
        proposedDeliveryDate: new Date(quoteModal.proposedDeliveryDate),
        expiresHours: quoteModal.expiresHours,
        stockConfirmed: quoteModal.stockConfirmed,
        notes: quoteModal.notes
      };

      let res;
      if (quoteModal.isRevision && quoteModal.quoteId) {
        res = await api.put(`/rfq/quotes/${quoteModal.quoteId}/revise`, payload);
      } else {
        res = await api.post(`/rfq/${quoteModal.rfq.requestId || quoteModal.rfq._id}/quote`, payload);
      }

      if (res.data.success) {
        setSuccessMsg(quoteModal.isRevision ? 'Quotation revised successfully!' : 'Quotation submitted successfully!');
        setQuoteModal({ ...quoteModal, open: false });
        fetchOpenRfqs();
        fetchMyQuotes();
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit quotation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <div className={styles.title}>
              <span>🏪</span> Merchant Quotation Engine
            </div>
            <div className={styles.subtitle}>
              Review nearby buyer shopping requirements, submit transparent line-item bids, and manage customer negotiations.
            </div>
          </div>
          <div className={styles.tabButtons}>
            <button
              className={`${styles.tabBtn} ${activeTab === 'open' ? styles.tabBtnActive : ''}`}
              onClick={() => { setActiveTab('open'); fetchOpenRfqs(); }}
            >
              <span>📥</span> Open Buyer Requests ({openRequests.length})
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'my_quotes' ? styles.tabBtnActive : ''}`}
              onClick={() => { setActiveTab('my_quotes'); fetchMyQuotes(); }}
            >
              <span>📋</span> My Bids ({myQuotations.length})
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

      {/* ── TAB 1: OPEN REQUESTS FEED ── */}
      {activeTab === 'open' && (
        <div className={styles.requestsGrid}>
          {openRequests.length === 0 ? (
            <div className={styles.emptyState}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📬</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>No open requests in your area right now</div>
              <p style={{ marginTop: 6, fontSize: 14 }}>Keep this page open. As soon as a customer posts a shopping requirement, it will alert you in real time.</p>
            </div>
          ) : (
            openRequests.map(rfq => (
              <div key={rfq._id} className={styles.rfqCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <div className={styles.rfqId}>REQ #{rfq.requestId}</div>
                    <div className={styles.rfqTitle}>{rfq.title}</div>
                    <div className={styles.rfqMeta}>
                      <span>👤 Customer: {rfq.customer?.name || 'Verified Buyer'}</span>
                      <span>📍 Area: {rfq.deliveryAddress?.area || 'Imphal West'}</span>
                      <span>⏱️ Deadline: {new Date(rfq.deliveryDeadline).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <span>💬 Status: {rfq.status?.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <div>
                    {rfq.budget ? (
                      <span className={styles.budgetBadge}>
                        Target Budget: ₹{rfq.budget}
                      </span>
                    ) : (
                      <span className={styles.budgetPrivateBadge}>
                        🔒 Budget Private
                      </span>
                    )}
                  </div>
                </div>

                {/* Requested Products List */}
                <div className={styles.itemsBox}>
                  <div className={styles.itemsHeading}>Requested Products & Quantities</div>
                  <div className={styles.itemsList}>
                    {rfq.items.map((it, idx) => (
                      <div key={idx} className={styles.itemEntry}>
                        <span>
                          <strong>{it.quantity} {it.unit}</strong> — {it.name}
                          {it.preferredBrand && <span className={styles.itemSpec}> (Preferred: {it.preferredBrand})</span>}
                          {it.qualityGrade && <span className={styles.itemSpec}> [{it.qualityGrade}]</span>}
                        </span>
                        {it.notes && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Note: {it.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {rfq.rawPrompt && (
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 12 }}>
                    "{rfq.rawPrompt}"
                  </div>
                )}

                <div className={styles.cardFooter}>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                    {rfq.quotesCount} store{rfq.quotesCount === 1 ? '' : 's'} already quoted
                  </div>
                  <div>
                    {rfq.hasQuoted ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span className={styles.quotedAlreadyBadge}>
                          ✓ Quoted (₹{rfq.myQuote?.grandTotal})
                        </span>
                        <button
                          type="button"
                          className={styles.quoteBtn}
                          onClick={() => handleOpenQuoteModal(rfq, rfq.myQuote)}
                        >
                          ✎ Revise Quote
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.quoteBtn}
                        onClick={() => handleOpenQuoteModal(rfq)}
                      >
                        ⚡ Submit Line-Item Quotation
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB 2: MY SUBMITTED QUOTATIONS ── */}
      {activeTab === 'my_quotes' && (
        <div className={styles.requestsGrid}>
          {myQuotations.length === 0 ? (
            <div className={styles.emptyState}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏷️</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>No quotations submitted yet</div>
              <p style={{ marginTop: 6, fontSize: 14 }}>Browse open customer requests and submit your best bids.</p>
              <button
                className={styles.quoteBtn}
                style={{ margin: '14px auto 0' }}
                onClick={() => setActiveTab('open')}
              >
                Browse Open Requests
              </button>
            </div>
          ) : (
            myQuotations.map(quote => (
              <div key={quote._id} className={styles.rfqCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <div className={styles.rfqId}>QUOTE #{quote.quotationId} · REQ #{quote.request?.requestId}</div>
                    <div className={styles.rfqTitle}>{quote.request?.title || 'Custom Requirement'}</div>
                    <div className={styles.rfqMeta}>
                      <span>📅 Submitted: {new Date(quote.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <span>🚚 Proposed Delivery: {new Date(quote.proposedDeliveryDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <span style={{ color: quote.status === 'accepted' ? '#00e699' : quote.status === 'customer_countered' ? '#fbbf24' : 'var(--text)' }}>
                        ● {quote.status?.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent2, #ffaa00)' }}>
                      ₹{quote.grandTotal}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Items ₹{quote.itemsSubtotal} + Delivery ₹{quote.deliveryCharge}
                    </div>
                  </div>
                </div>

                {/* Customer Counter Offer Alert */}
                {quote.status === 'customer_countered' && quote.counterOffer?.proposedGrandTotal && (
                  <div className={styles.counterBanner}>
                    <strong>⚠️ Customer Counter-Offer Received!</strong>
                    <div style={{ marginTop: 4 }}>
                      Customer proposed: <strong>₹{quote.counterOffer.proposedGrandTotal}</strong>
                      {quote.counterOffer.customerNote && <span> — "{quote.counterOffer.customerNote}"</span>}
                    </div>
                  </div>
                )}

                {/* Line Items Table */}
                <div className={styles.itemsBox}>
                  <div className={styles.itemsHeading}>Quoted Line Items</div>
                  <div className={styles.itemsList}>
                    {quote.lineItems.map((item, idx) => (
                      <div key={idx} className={styles.itemEntry}>
                        <span>
                          <strong>{item.quantity} {item.unit}</strong> {item.productName}
                          {item.brandOffered && <span className={styles.itemSpec}> ({item.brandOffered})</span>}
                          {item.inStock ? ' · ✓ In Stock' : ' · ⚠️ Partial Stock'}
                        </span>
                        <span>
                          ₹{item.unitPrice}/{item.unit} = <strong>₹{item.lineTotal}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Quotation valid until {new Date(quote.expiresAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div>
                    {quote.status !== 'accepted' && quote.status !== 'rejected' && (
                      <button
                        type="button"
                        className={styles.quoteBtn}
                        onClick={() => handleOpenQuoteModal(quote.request, quote)}
                      >
                        {quote.status === 'customer_countered' ? '🤝 Respond & Revise Quote' : '✎ Edit Quotation'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── QUOTATION MODAL / DRAWER ── */}
      {quoteModal.open && (
        <div className={styles.modalBackdrop} onClick={() => setQuoteModal({ ...quoteModal, open: false })}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTitle}>
              {quoteModal.isRevision ? '✎ Revise Itemized Quotation' : '⚡ Submit Itemized Quotation'}
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              REQ #{quoteModal.rfq?.requestId} — {quoteModal.rfq?.title}
            </p>

            {/* If responding to counter offer */}
            {quoteModal.isRevision && quoteModal.rfq?.counterOffer?.proposedGrandTotal && (
              <div className={styles.counterBanner}>
                Customer proposed counter price: <strong>₹{quoteModal.rfq.counterOffer.proposedGrandTotal}</strong>
              </div>
            )}

            <form onSubmit={handleSubmitQuotation}>
              <div className={styles.lineItemsForm}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                  Itemized Pricing (Quote individual line items)
                </div>

                {quoteModal.lineItems.map((item, idx) => (
                  <div key={idx} className={styles.lineItemCard}>
                    <div className={styles.lineItemHeader}>
                      <span>{item.quantity} {item.unit} — {item.productName}</span>
                      <span style={{ color: 'var(--accent2)' }}>Line Total: ₹{item.lineTotal || 0}</span>
                    </div>

                    <div className={styles.lineItemGrid}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                          UNIT PRICE (₹ per {item.unit})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={styles.inputField}
                          placeholder="e.g. 91.20"
                          value={item.unitPrice || ''}
                          onChange={e => handleLineItemChange(idx, 'unitPrice', e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                          OFFERED BRAND / VARIANT
                        </label>
                        <input
                          type="text"
                          className={styles.inputField}
                          placeholder="e.g. Daawat Super"
                          value={item.brandOffered || ''}
                          onChange={e => handleLineItemChange(idx, 'brandOffered', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Delivery, Tax, and Expiry Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '14px 0' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
                    DELIVERY CHARGE (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className={styles.inputField}
                    value={quoteModal.deliveryCharge}
                    onChange={e => setQuoteModal({ ...quoteModal, deliveryCharge: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
                    TAX / GST (₹) (OPTIONAL)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className={styles.inputField}
                    value={quoteModal.tax}
                    onChange={e => setQuoteModal({ ...quoteModal, tax: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, margin: '14px 0' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
                    PROPOSED DELIVERY DATE & TIME
                  </label>
                  <input
                    type="datetime-local"
                    className={styles.inputField}
                    value={quoteModal.proposedDeliveryDate}
                    onChange={e => setQuoteModal({ ...quoteModal, proposedDeliveryDate: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
                    QUOTE VALIDITY
                  </label>
                  <select
                    className={styles.inputField}
                    value={quoteModal.expiresHours}
                    onChange={e => setQuoteModal({ ...quoteModal, expiresHours: Number(e.target.value) })}
                  >
                    <option value={12}>12 Hours</option>
                    <option value={24}>24 Hours</option>
                    <option value={48}>48 Hours</option>
                    <option value={72}>3 Days</option>
                  </select>
                </div>
              </div>

              {/* Stock Confirmation Checkbox */}
              <div style={{ margin: '14px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#fff', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={quoteModal.stockConfirmed}
                    onChange={e => setQuoteModal({ ...quoteModal, stockConfirmed: e.target.checked })}
                  />
                  I confirm all items are currently in stock and reserved for this quote
                </label>
              </div>

              {/* Live Calculation Summary */}
              <div className={styles.calcSummaryBox}>
                <div className={styles.summaryRow}>
                  <span>Products Subtotal:</span>
                  <span>₹{subtotal}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Delivery Fee:</span>
                  <span>₹{deliveryCharge}</span>
                </div>
                {tax > 0 && (
                  <div className={styles.summaryRow}>
                    <span>Tax:</span>
                    <span>₹{tax}</span>
                  </div>
                )}
                <div className={styles.grandTotalRow}>
                  <span>Grand Total to Customer:</span>
                  <span style={{ color: 'var(--accent)' }}>₹{grandTotal}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button
                  type="submit"
                  className={styles.quoteBtn}
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={submitting || subtotal <= 0}
                >
                  {submitting ? 'Submitting…' : quoteModal.isRevision ? 'Submit Revised Quotation' : 'Submit Quotation to Customer'}
                </button>
                <button
                  type="button"
                  className={styles.tabBtn}
                  style={{ border: '1px solid var(--border)' }}
                  onClick={() => setQuoteModal({ ...quoteModal, open: false })}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
