// models/BuyerRequest.js
// ─────────────────────────────────────────────────────────────────────────────
// Customer Custom Shopping Requirement / RFQ Model
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const requestedItemSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  quantity:       { type: Number, required: true, min: 0.1, default: 1 },
  unit:           { type: String, default: 'kg', trim: true },
  preferredBrand: { type: String, trim: true, default: '' },
  qualityGrade:   { type: String, trim: true, default: '' },
  notes:          { type: String, trim: true, default: '' }
}, { _id: false });

const buyerRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    uppercase: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  rawPrompt: {
    type: String,
    trim: true,
    default: ''
  },
  items: {
    type: [requestedItemSchema],
    validate: [v => Array.isArray(v) && v.length > 0, 'At least one item is required']
  },
  budget: {
    type: Number,
    min: 0,
    default: null
  },
  shareBudgetWithMerchants: {
    type: Boolean,
    default: true
  },
  deliveryAddress: {
    street:  { type: String, default: '' },
    area:    { type: String, default: 'Imphal' },
    city:    { type: String, default: 'Imphal' },
    pincode: { type: String, default: '' },
    lat:     { type: Number, default: 24.817 },
    lng:     { type: Number, default: 93.937 }
  },
  deliveryDeadline: {
    type: Date,
    required: true
  },
  rankingPriority: {
    type: String,
    enum: ['lowest_price', 'fastest_delivery', 'highest_rated', 'balanced'],
    default: 'lowest_price'
  },
  status: {
    type: String,
    enum: ['open', 'quotes_received', 'negotiating', 'accepted', 'cancelled', 'expired'],
    default: 'open',
    index: true
  },
  quotesCount: {
    type: Number,
    default: 0
  },
  selectedQuotation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MerchantQuotation',
    default: null
  },
  convertedOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  }
}, { timestamps: true });

// Auto-generate requestId before validation if missing
buyerRequestSchema.pre('validate', function(next) {
  if (!this.requestId) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.requestId = `RFQ-${today}-${rand}`;
  }
  next();
});

module.exports = mongoose.model('BuyerRequest', buyerRequestSchema);
