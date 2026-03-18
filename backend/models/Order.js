// models/Order.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:      String,
  price:     Number,
  quantity:  { type: Number, required: true },
  subtotal:  Number
});

const orderSchema = new mongoose.Schema({
  orderId:   { type: String, unique: true }, // e.g. GRD-20240001
  customer:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  store:     { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  items:     [orderItemSchema],

  pricing: {
    subtotal:     Number,
    deliveryFee:  { type: Number, default: 30 },
    discount:     { type: Number, default: 0 },
    total:        Number
  },

  status: {
    type: String,
    enum: ['placed','confirmed','preparing','out_for_delivery','delivered','cancelled'],
    default: 'placed'
  },
  statusHistory: [{
    status:    String,
    timestamp: { type: Date, default: Date.now },
    note:      String
  }],

  delivery: {
    address:       String,
    lat:           Number,
    lng:           Number,
    riderName:     String,
    riderPhone:    String,
    estimatedTime: Number, // minutes
    actualTime:    Number
  },

  payment: {
    method: { type: String, enum: ['cod','online','wallet'], default: 'cod' },
    status: { type: String, enum: ['pending','paid','failed','refunded'], default: 'pending' },
    transactionId: String
  },

  // AI fields
  ai: {
    recommendedByAI:  Boolean,
    deliveryOptimized: Boolean,
    estimatedPrepTime: Number // minutes
  },

  rating:   { type: Number, min: 1, max: 5 },
  feedback: String
}, { timestamps: true });

// Auto-generate orderId
orderSchema.pre('save', async function(next) {
  if (!this.orderId) {
    const count = await this.constructor.countDocuments();
    this.orderId = `GRD-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
