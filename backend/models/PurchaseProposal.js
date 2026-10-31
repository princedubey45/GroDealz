// models/PurchaseProposal.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz Persistent Purchase Proposal & Approval Record Model
//  Stores generated AI shopping baskets, pre-flight verification status,
//  and immutable customer approval audits with SHA-256 snapshot hashing.
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const crypto   = require('crypto');

const proposalItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  store:    { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  name:     { type: String, required: true },
  price:    { type: Number, required: true },
  mrp:      Number,
  discount: Number,
  quantity: { type: Number, required: true, min: 1 },
  unit:     String,
  emoji:    String,
  subtotal: { type: Number, required: true },
  normalizedRate: Number,
  referenceUnit:  String
}, { _id: false });

const purchaseProposalSchema = new mongoose.Schema({
  proposalId: { 
    type: String, 
    unique: true, 
    required: true, 
    index: true 
  }, // e.g. PRP-20261031-0001
  customer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  status: {
    type: String,
    enum: ['pending_review', 'approved', 'rejected', 'expired', 'converted_to_order'],
    default: 'pending_review',
    index: true
  },
  requirements: {
    rawQuery: String,
    familySize: { type: Number, default: 2 },
    durationDays: { type: Number, default: 3 },
    budgetLimit: Number,
    deliveryUrgency: { type: String, default: 'today' },
    dietary: String,
    optimizationGoal: String
  },
  selectedStrategy: {
    type: String,
    enum: ['multiStore', 'singleStoreFastest', 'balanced'],
    default: 'multiStore'
  },
  strategiesSnapshot: mongoose.Schema.Types.Mixed,
  proposedItems: [proposalItemSchema],
  pricingSummary: {
    itemsSubtotal: { type: Number, required: true },
    deliveryFees:  { type: Number, required: true },
    totalAmount:   { type: Number, required: true },
    estimatedSavings: { type: Number, default: 0 }
  },
  storesInvolved: [{
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    name: String,
    deliveryFee: Number,
    itemsCount: Number,
    storeSubtotal: Number
  }],
  approvalRecord: {
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ipAddress:  String,
    userAgent:  String,
    snapshotHash: String // SHA-256 hash of (items + prices + quantities + stores)
  },
  rejectionRecord: {
    rejectedAt: Date,
    reason: String
  },
  convertedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  convertedGroupId: String,
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 2 * 60 * 60 * 1000), // 2-hour validity window
    index: { expires: 0 }
  }
}, { timestamps: true });

/**
 * Generate cryptographic SHA-256 snapshot hash of proposed items and pricing
 */
purchaseProposalSchema.methods.calculateSnapshotHash = function() {
  const payload = {
    proposalId: this.proposalId,
    customer: this.customer.toString(),
    selectedStrategy: this.selectedStrategy,
    items: this.proposedItems.map(i => ({
      product: i.product.toString(),
      store: i.store.toString(),
      price: i.price,
      quantity: i.quantity,
      subtotal: i.subtotal
    })),
    totalAmount: this.pricingSummary.totalAmount
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};

module.exports = mongoose.model('PurchaseProposal', purchaseProposalSchema);
