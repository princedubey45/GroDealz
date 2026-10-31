// routes/rfq.js
// ─────────────────────────────────────────────────────────────────────────────
// Routes for Customer Shopping Requirements & Merchant Quotation Engine (Module B)
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const BuyerRequest = require('../models/BuyerRequest');
const MerchantQuotation = require('../models/MerchantQuotation');
const Store = require('../models/Store');
const { auth, ownerOnly } = require('../middleware/auth');
const { parseCustomerRequirement } = require('../services/rfqParser');
const {
  validateAndCalculateQuote,
  rankQuotations,
  applyCounterOffer,
  reviseQuotation,
  acceptQuotationAndCreateOrder
} = require('../services/quotationEngine');

// ─── 1. NATURAL LANGUAGE REQUIREMENT PARSER ──────────────────────────────────
// POST /api/rfq/parse-prompt
router.post('/parse-prompt', (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ success: false, error: 'Requirement prompt text is required' });
    }

    const parsed = parseCustomerRequirement(prompt);
    res.json({ success: true, parsed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 2. CREATE NEW BUYER RFQ (Customer) ──────────────────────────────────────
// POST /api/rfq
router.post('/', auth, async (req, res) => {
  try {
    const {
      title,
      rawPrompt,
      items,
      budget,
      shareBudgetWithMerchants = true,
      deliveryAddress,
      deliveryDays,
      deliveryDeadline,
      rankingPriority = 'lowest_price'
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one grocery item is required' });
    }

    // Resolve deadline
    let resolvedDeadline = deliveryDeadline ? new Date(deliveryDeadline) : null;
    if (!resolvedDeadline || isNaN(resolvedDeadline.getTime())) {
      const days = Number(deliveryDays) || 2;
      resolvedDeadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const newRequest = new BuyerRequest({
      customer: req.user._id,
      title: title || `${items[0].quantity} ${items[0].unit || 'kg'} ${items[0].name}`,
      rawPrompt: rawPrompt || '',
      items: items.map(it => ({
        name: String(it.name).trim(),
        quantity: Math.max(0.1, Number(it.quantity) || 1),
        unit: String(it.unit || 'kg').trim(),
        preferredBrand: String(it.preferredBrand || '').trim(),
        qualityGrade: String(it.qualityGrade || '').trim(),
        notes: String(it.notes || '').trim()
      })),
      budget: budget ? Math.max(0, Number(budget)) : null,
      shareBudgetWithMerchants: Boolean(shareBudgetWithMerchants),
      deliveryAddress: deliveryAddress || { area: 'Imphal', city: 'Imphal' },
      deliveryDeadline: resolvedDeadline,
      rankingPriority: ['lowest_price', 'fastest_delivery', 'highest_rated', 'balanced'].includes(rankingPriority)
        ? rankingPriority
        : 'lowest_price',
      status: 'open'
    });

    await newRequest.save();

    // Broadcast to merchants room
    if (req.io) {
      req.io.to('merchants_rfq').emit('new_rfq_available', {
        requestId: newRequest.requestId,
        title: newRequest.title,
        itemsCount: newRequest.items.length,
        budget: newRequest.shareBudgetWithMerchants ? newRequest.budget : null,
        deadline: newRequest.deliveryDeadline,
        area: newRequest.deliveryAddress?.area || 'Imphal'
      });
    }

    res.status(201).json({ success: true, request: newRequest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 3. GET CURRENT USER'S RFQS (Customer) ───────────────────────────────────
// GET /api/rfq/my
router.get('/my', auth, async (req, res) => {
  try {
    const requests = await BuyerRequest.find({ customer: req.user._id })
      .sort({ createdAt: -1 })
      .populate('selectedQuotation');

    res.json({ success: true, count: requests.length, requests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 4. GET SINGLE RFQ DETAILS & RANKED QUOTATIONS ───────────────────────────
// GET /api/rfq/details/:id
router.get('/details/:id', auth, async (req, res) => {
  try {
    const query = req.params.id.startsWith('RFQ-')
      ? { requestId: req.params.id }
      : { _id: req.params.id };

    const request = await BuyerRequest.findOne(query)
      .populate('customer', 'name email phone')
      .populate('selectedQuotation');

    if (!request) {
      return res.status(404).json({ success: false, error: 'Requirement request not found' });
    }

    const isCustomer = req.user._id.toString() === request.customer._id.toString();

    // Fetch all submitted quotations for this request
    const rawQuotations = await MerchantQuotation.find({ request: request._id })
      .populate('store', 'name logo emoji location ratings stats')
      .populate('merchant', 'name email phone')
      .sort({ createdAt: -1 });

    if (isCustomer) {
      // Customer sees all competitor quotations, ranked dynamically
      const rankedQuotations = rankQuotations(rawQuotations, request.rankingPriority, request.budget);
      return res.json({
        success: true,
        isCustomer: true,
        request,
        quotations: rankedQuotations
      });
    }

    // If user is a merchant / store owner
    const merchantQuote = rawQuotations.find(q => q.merchant._id.toString() === req.user._id.toString());
    const safeRequest = request.toObject();
    if (!safeRequest.shareBudgetWithMerchants) {
      delete safeRequest.budget;
    }

    res.json({
      success: true,
      isCustomer: false,
      request: safeRequest,
      myQuotation: merchantQuote || null,
      totalQuotesCount: rawQuotations.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 5. UPDATE RANKING PRIORITY (Customer) ───────────────────────────────────
// POST /api/rfq/:id/priority
router.post('/:id/priority', auth, async (req, res) => {
  try {
    const { priority } = req.body;
    if (!['lowest_price', 'fastest_delivery', 'highest_rated', 'balanced'].includes(priority)) {
      return res.status(400).json({ success: false, error: 'Invalid priority option' });
    }

    const query = req.params.id.startsWith('RFQ-') ? { requestId: req.params.id } : { _id: req.params.id };
    const request = await BuyerRequest.findOne(query);

    if (!request || request.customer.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, error: 'Request not found or unauthorized' });
    }

    request.rankingPriority = priority;
    await request.save();

    res.json({ success: true, rankingPriority: request.rankingPriority });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 6. CANCEL RFQ (Customer) ────────────────────────────────────────────────
// POST /api/rfq/:id/cancel
router.post('/:id/cancel', auth, async (req, res) => {
  try {
    const query = req.params.id.startsWith('RFQ-') ? { requestId: req.params.id } : { _id: req.params.id };
    const request = await BuyerRequest.findOne(query);

    if (!request || request.customer.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, error: 'Request not found or unauthorized' });
    }

    if (request.status === 'accepted') {
      return res.status(400).json({ success: false, error: 'Cannot cancel request after an offer is accepted' });
    }

    request.status = 'cancelled';
    await request.save();

    // Also mark quotations cancelled/rejected
    await MerchantQuotation.updateMany({ request: request._id }, { $set: { status: 'rejected' } });

    res.json({ success: true, message: 'Request successfully cancelled' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 7. CUSTOMER COUNTER-OFFER ───────────────────────────────────────────────
// POST /api/rfq/quotes/:quoteId/counter
router.post('/quotes/:quoteId/counter', auth, async (req, res) => {
  try {
    const { proposedGrandTotal, customerNote } = req.body;
    const updatedQuote = await applyCounterOffer(req.params.quoteId, req.user._id, proposedGrandTotal, customerNote);

    if (req.io) {
      req.io.to(`rfq_${updatedQuote.request}`).emit('quote_update', {
        type: 'customer_countered',
        quotationId: updatedQuote.quotationId,
        counterOffer: updatedQuote.counterOffer
      });
    }

    res.json({ success: true, quotation: updatedQuote });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── 8. CUSTOMER ACCEPTS QUOTE & CONVERTS TO ORDER ───────────────────────────
// POST /api/rfq/quotes/:quoteId/accept
router.post('/quotes/:quoteId/accept', auth, async (req, res) => {
  try {
    const { deliveryAddress, paymentMethod = 'cod' } = req.body;
    const { quotation, order } = await acceptQuotationAndCreateOrder(
      req.params.quoteId,
      req.user._id,
      { address: deliveryAddress },
      paymentMethod
    );

    if (req.io) {
      req.io.to(`rfq_${quotation.request}`).emit('quote_update', {
        type: 'quote_accepted',
        quotationId: quotation.quotationId,
        orderId: order.orderId
      });
    }

    res.json({
      success: true,
      message: 'Quotation accepted and order created successfully',
      quotation,
      order
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── 9. MERCHANT: BROWSE OPEN RFQS ───────────────────────────────────────────
// GET /api/rfq/merchant/open
router.get('/merchant/open', auth, ownerOnly, async (req, res) => {
  try {
    // Open requests that haven't been completed or cancelled
    const openRequests = await BuyerRequest.find({
      status: { $in: ['open', 'quotes_received', 'negotiating'] },
      deliveryDeadline: { $gte: new Date() }
    })
      .sort({ createdAt: -1 })
      .populate('customer', 'name');

    // Find any quotations current merchant has already submitted
    const myQuotes = await MerchantQuotation.find({
      merchant: req.user._id,
      request: { $in: openRequests.map(r => r._id) }
    });

    const myQuotesMap = {};
    myQuotes.forEach(q => {
      myQuotesMap[q.request.toString()] = q;
    });

    // Mask budget if not shared
    const formatted = openRequests.map(r => {
      const obj = r.toObject();
      if (!obj.shareBudgetWithMerchants) {
        delete obj.budget;
        obj.budgetHidden = true;
      }
      obj.hasQuoted = Boolean(myQuotesMap[r._id.toString()]);
      obj.myQuote = myQuotesMap[r._id.toString()] || null;
      return obj;
    });

    res.json({ success: true, count: formatted.length, requests: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 10. MERCHANT: MY SUBMITTED QUOTATIONS ───────────────────────────────────
// GET /api/rfq/merchant/my-quotes
router.get('/merchant/my-quotes', auth, ownerOnly, async (req, res) => {
  try {
    const quotes = await MerchantQuotation.find({ merchant: req.user._id })
      .populate('request')
      .populate('store', 'name logo location ratings')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: quotes.length, quotations: quotes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 11. MERCHANT: SUBMIT ITEMIZED LINE-ITEM QUOTATION ───────────────────────
// POST /api/rfq/:id/quote
router.post('/:id/quote', auth, ownerOnly, async (req, res) => {
  try {
    const query = req.params.id.startsWith('RFQ-') ? { requestId: req.params.id } : { _id: req.params.id };
    const request = await BuyerRequest.findOne(query);

    if (!request) {
      return res.status(404).json({ success: false, error: 'Buyer request not found' });
    }

    if (!['open', 'quotes_received', 'negotiating'].includes(request.status)) {
      return res.status(400).json({ success: false, error: `Cannot submit quote for request with status "${request.status}"` });
    }

    // Resolve store: merchant must have a store, or provide storeId
    let storeId = req.body.storeId;
    if (!storeId) {
      const store = await Store.findOne({ owner: req.user._id });
      if (!store) {
        // Fallback: pick any store owned or first store in catalog for demo/testing
        const fallbackStore = await Store.findOne();
        if (!fallbackStore) {
          return res.status(400).json({ success: false, error: 'No active store found for merchant' });
        }
        storeId = fallbackStore._id;
      } else {
        storeId = store._id;
      }
    }

    // Check if merchant already quoted
    let existingQuote = await MerchantQuotation.findOne({
      request: request._id,
      merchant: req.user._id
    });

    const {
      lineItems,
      deliveryCharge = 0,
      tax = 0,
      proposedDeliveryDate,
      expiresHours = 24,
      stockConfirmed = true
    } = req.body;

    const calculated = validateAndCalculateQuote(lineItems, deliveryCharge, tax);

    // Delivery date defaults to request deadline or tomorrow
    const resolvedDelivery = proposedDeliveryDate
      ? new Date(proposedDeliveryDate)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const expiresAt = new Date(Date.now() + Number(expiresHours) * 60 * 60 * 1000);

    let quotation;
    if (existingQuote) {
      // Treat as revision
      quotation = await reviseQuotation(existingQuote._id, req.user._id, {
        lineItems: calculated.lineItems,
        deliveryCharge: calculated.deliveryCharge,
        tax: calculated.tax,
        proposedDeliveryDate: resolvedDelivery,
        expiresAt,
        stockConfirmed,
        merchantNote: req.body.notes || 'Updated quotation'
      });
    } else {
      quotation = new MerchantQuotation({
        request: request._id,
        store: storeId,
        merchant: req.user._id,
        lineItems: calculated.lineItems,
        itemsSubtotal: calculated.itemsSubtotal,
        deliveryCharge: calculated.deliveryCharge,
        tax: calculated.tax,
        grandTotal: calculated.grandTotal,
        stockConfirmed: Boolean(stockConfirmed),
        proposedDeliveryDate: resolvedDelivery,
        expiresAt,
        status: 'submitted'
      });

      await quotation.save();

      // Increment request quotes count
      request.quotesCount += 1;
      if (request.status === 'open') {
        request.status = 'quotes_received';
      }
      await request.save();
    }

    // Broadcast quote update
    if (req.io) {
      req.io.to(`rfq_${request._id}`).emit('quote_update', {
        type: 'new_quote',
        requestId: request.requestId,
        quotationId: quotation.quotationId,
        grandTotal: quotation.grandTotal
      });
    }

    res.status(201).json({ success: true, quotation });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── 12. MERCHANT: REVISE EXISTING QUOTATION ─────────────────────────────────
// PUT /api/rfq/quotes/:quoteId/revise
router.put('/quotes/:quoteId/revise', auth, ownerOnly, async (req, res) => {
  try {
    const updated = await reviseQuotation(req.params.quoteId, req.user._id, req.body);

    if (req.io) {
      req.io.to(`rfq_${updated.request}`).emit('quote_update', {
        type: 'merchant_revised',
        quotationId: updated.quotationId,
        grandTotal: updated.grandTotal
      });
    }

    res.json({ success: true, quotation: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
