// routes/proposals.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz Purchase Proposals & Human-in-the-Loop Approval Endpoints
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const router   = express.Router();
const { auth } = require('../middleware/auth');
const PurchaseProposal = require('../models/PurchaseProposal');
const Product = require('../models/Product');
const Store   = require('../models/Store');

/**
 * Helper to generate sequential proposal ID
 */
async function generateProposalId() {
  const count = await PurchaseProposal.countDocuments();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `PRP-${dateStr}-${String(count + 1).padStart(4, '0')}`;
}

/**
 * POST /api/proposals
 * Persist AI shopping plan as an actionable proposal awaiting customer review
 */
router.post('/', auth, async (req, res) => {
  try {
    const {
      query,
      requirements = {},
      selectedStrategy = 'multiStore',
      strategyData,
      allStrategies
    } = req.body;

    if (!strategyData || !strategyData.stores) {
      return res.status(400).json({ success: false, message: 'Invalid strategy data provided' });
    }

    const proposalId = await generateProposalId();

    // Flatten items and populate store relations
    const proposedItems = [];
    const storesInvolved = [];

    for (const storeGroup of strategyData.stores) {
      const sObj = storeGroup.store || {};
      const sId = sObj.id || sObj._id;

      storesInvolved.push({
        store: sId,
        name: sObj.name || 'Store',
        deliveryFee: storeGroup.deliveryFee || 30,
        itemsCount: (storeGroup.items || []).length,
        storeSubtotal: storeGroup.storeSubtotal || 0
      });

      for (const it of (storeGroup.items || [])) {
        proposedItems.push({
          product: it.product || it.productId || it._id,
          store: sId,
          name: it.name,
          price: it.price,
          mrp: it.mrp || it.price,
          discount: it.discount || 0,
          quantity: it.quantity || 1,
          unit: it.unit || '1 pack',
          emoji: it.emoji || '🛒',
          subtotal: it.subtotal || it.lineTotal || (it.price * (it.quantity || 1)),
          normalizedRate: it.normalizedRate || it.price,
          referenceUnit: it.referenceUnit || 'pack'
        });
      }
    }

    const proposal = await PurchaseProposal.create({
      proposalId,
      customer: req.user._id,
      status: 'pending_review',
      requirements: {
        rawQuery: query || requirements.raw_query || '',
        familySize: requirements.family_size || requirements.familySize || 2,
        durationDays: requirements.duration_days || requirements.durationDays || 3,
        budgetLimit: requirements.budget_limit || requirements.budget || null,
        deliveryUrgency: requirements.delivery_urgency || requirements.deliveryUrgency || 'today',
        dietary: requirements.dietary || 'all',
        optimizationGoal: requirements.optimization_goal || requirements.optimizationGoal || 'balanced'
      },
      selectedStrategy,
      strategiesSnapshot: allStrategies || { [selectedStrategy]: strategyData },
      proposedItems,
      pricingSummary: {
        itemsSubtotal: strategyData.itemsSubtotal || strategyData.subtotal || 0,
        deliveryFees: strategyData.deliveryFees || strategyData.deliveryFeesTotal || 0,
        totalAmount: strategyData.grandTotal || strategyData.total || 0,
        estimatedSavings: strategyData.estimatedSavings || strategyData.savings || 0
      },
      storesInvolved
    });

    res.status(201).json({
      success: true,
      proposalId: proposal.proposalId,
      proposal
    });
  } catch (err) {
    console.error('Create Proposal Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/proposals/my
 * List proposals for current customer
 */
router.get('/my', auth, async (req, res) => {
  try {
    const proposals = await PurchaseProposal.find({ customer: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, count: proposals.length, proposals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/proposals/:id
 * Retrieve proposal details with populated store & product info
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const query = req.params.id.startsWith('PRP-') 
      ? { proposalId: req.params.id } 
      : { _id: req.params.id };

    const proposal = await PurchaseProposal.findOne({ ...query, customer: req.user._id })
      .populate('storesInvolved.store', 'name emoji location ratings')
      .populate('proposedItems.product', 'name emoji price stock unit')
      .lean();

    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found' });
    }

    res.json({ success: true, proposal });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/proposals/:id/revalidate
 * Live pre-flight check of prices and stock before approval
 */
router.post('/:id/revalidate', auth, async (req, res) => {
  try {
    const query = req.params.id.startsWith('PRP-') 
      ? { proposalId: req.params.id } 
      : { _id: req.params.id };

    const proposal = await PurchaseProposal.findOne({ ...query, customer: req.user._id });
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found' });
    }

    const productIds = proposal.proposedItems.map(i => i.product);
    const dbProducts = await Product.find({ _id: { $in: productIds } }).lean();
    const dbMap = Object.fromEntries(dbProducts.map(p => [p._id.toString(), p]));

    let changesDetected = false;
    let allAvailable = true;
    const itemStatuses = [];

    for (const item of proposal.proposedItems) {
      const dbProd = dbMap[item.product.toString()];
      if (!dbProd || !dbProd.isActive) {
        allAvailable = false;
        changesDetected = true;
        itemStatuses.push({
          product: item.product,
          name: item.name,
          status: 'unavailable',
          reason: 'Product no longer available in store'
        });
        continue;
      }

      const availableQty = dbProd.stock?.quantity || 0;
      const isStockSufficient = dbProd.stock?.isAvailable && (availableQty >= item.quantity);
      const isPriceChanged = dbProd.price !== item.price;

      if (!isStockSufficient) {
        allAvailable = false;
        changesDetected = true;
      }
      if (isPriceChanged) {
        changesDetected = true;
      }

      itemStatuses.push({
        product: item.product,
        name: item.name,
        currentPrice: dbProd.price,
        proposedPrice: item.price,
        priceChanged: isPriceChanged,
        availableStock: availableQty,
        requestedQuantity: item.quantity,
        stockSufficient: isStockSufficient,
        status: isStockSufficient ? (isPriceChanged ? 'price_changed' : 'verified_ok') : 'out_of_stock'
      });
    }

    res.json({
      success: true,
      proposalId: proposal.proposalId,
      canApprove: allAvailable,
      changesDetected,
      itemStatuses
    });
  } catch (err) {
    console.error('Proposal Revalidate Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/proposals/:id/approve
 * Human-in-the-loop approval: verifies pre-flight, seals immutable audit hash, and marks approved
 */
router.post('/:id/approve', auth, async (req, res) => {
  try {
    const query = req.params.id.startsWith('PRP-') 
      ? { proposalId: req.params.id } 
      : { _id: req.params.id };

    const proposal = await PurchaseProposal.findOne({ ...query, customer: req.user._id });
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found' });
    }

    if (proposal.status === 'approved') {
      return res.json({ 
        success: true, 
        message: 'Proposal already approved', 
        proposal,
        approvalRecord: proposal.approvalRecord 
      });
    }

    // 1. Pre-flight check: ensure stock is available
    const productIds = proposal.proposedItems.map(i => i.product);
    const dbProducts = await Product.find({ _id: { $in: productIds } }).lean();
    const dbMap = Object.fromEntries(dbProducts.map(p => [p._id.toString(), p]));

    for (const item of proposal.proposedItems) {
      const dbProd = dbMap[item.product.toString()];
      if (!dbProd || !dbProd.isActive || !dbProd.stock?.isAvailable || (dbProd.stock?.quantity < item.quantity)) {
        return res.status(400).json({
          success: false,
          message: `Cannot approve: "${item.name}" is out of stock. Please generate an updated plan.`,
          outOfStockProduct: item.name
        });
      }
    }

    // 2. Generate immutable cryptographic SHA-256 snapshot hash
    const snapshotHash = proposal.calculateSnapshotHash();

    // 3. Stamp immutable approval record
    proposal.status = 'approved';
    proposal.approvalRecord = {
      approvedAt: new Date(),
      approvedBy: req.user._id,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'GroDealz WebApp',
      snapshotHash
    };

    await proposal.save();

    res.json({
      success: true,
      message: 'Proposal approved successfully',
      proposalId: proposal.proposalId,
      status: proposal.status,
      approvalRecord: proposal.approvalRecord
    });
  } catch (err) {
    console.error('Proposal Approve Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/proposals/:id/reject
 * Customer explicit rejection with reason
 */
router.post('/:id/reject', auth, async (req, res) => {
  try {
    const { reason = 'Customer requested changes' } = req.body;
    const query = req.params.id.startsWith('PRP-') 
      ? { proposalId: req.params.id } 
      : { _id: req.params.id };

    const proposal = await PurchaseProposal.findOne({ ...query, customer: req.user._id });
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Proposal not found' });
    }

    proposal.status = 'rejected';
    proposal.rejectionRecord = {
      rejectedAt: new Date(),
      reason
    };

    await proposal.save();

    res.json({
      success: true,
      message: 'Proposal marked as rejected',
      proposalId: proposal.proposalId,
      status: proposal.status,
      rejectionRecord: proposal.rejectionRecord
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
