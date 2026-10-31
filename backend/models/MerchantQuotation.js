// models/MerchantQuotation.js
// ─────────────────────────────────────────────────────────────────────────────
// Itemized Merchant Line-Item Quotation Model
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const quotationLineItemSchema = new mongoose.Schema({
  itemIndex:    { type: Number, required: true },
  productName:  { type: String, required: true, trim: true },
  quantity:     { type: Number, required: true, min: 0.1 },
  unit:         { type: String, default: 'kg', trim: true },
  unitPrice:    { type: Number, required: true, min: 0 },
  lineTotal:    { type: Number, required: true, min: 0 },
  inStock:      { type: Boolean, default: true },
  brandOffered: { type: String, trim: true, default: '' },
  notes:        { type: String, trim: true, default: '' }
}, { _id: false });

const revisionHistorySchema = new mongoose.Schema({
  revisedAt:      { type: Date, default: Date.now },
  itemsSubtotal:  { type: Number, required: true },
  deliveryCharge: { type: Number, default: 0 },
  tax:            { type: Number, default: 0 },
  grandTotal:     { type: Number, required: true },
  merchantNote:   { type: String, default: '' },
  lineItems:      [quotationLineItemSchema]
}, { _id: false });

const merchantQuotationSchema = new mongoose.Schema({
  quotationId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    uppercase: true
  },
  request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BuyerRequest',
    required: true,
    index: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true
  },
  merchant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  lineItems: {
    type: [quotationLineItemSchema],
    validate: [v => Array.isArray(v) && v.length > 0, 'Quotation must include at least one line item']
  },
  itemsSubtotal: {
    type: Number,
    required: true,
    min: 0
  },
  deliveryCharge: {
    type: Number,
    default: 0,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  grandTotal: {
    type: Number,
    required: true,
    min: 0
  },
  stockConfirmed: {
    type: Boolean,
    default: true
  },
  proposedDeliveryDate: {
    type: Date,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['submitted', 'customer_countered', 'merchant_revised', 'accepted', 'rejected', 'expired'],
    default: 'submitted',
    index: true
  },
  counterOffer: {
    proposedGrandTotal: { type: Number, default: null },
    customerNote:       { type: String, default: '' },
    counteredAt:        { type: Date, default: null }
  },
  revisionHistory: [revisionHistorySchema],
  rankScore: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Auto-generate quotationId before validation if missing
merchantQuotationSchema.pre('validate', function(next) {
  if (!this.quotationId) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.quotationId = `QUO-${today}-${rand}`;
  }
  next();
});

module.exports = mongoose.model('MerchantQuotation', merchantQuotationSchema);
