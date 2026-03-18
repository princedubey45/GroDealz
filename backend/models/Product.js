// models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: String,
  category:    { type: String, required: true },
  subcategory: String,
  tags:        [String],

  price:        { type: Number, required: true },
  mrp:          { type: Number },
  discount:     { type: Number, default: 0 }, // percentage

  unit:         { type: String, default: '1 pc' }, // 500g, 1L, etc.
  images:       [String],
  emoji:        String, // for UI display

  dietary: {
    isVeg:    { type: Boolean, default: true },
    isVegan:  { type: Boolean, default: false },
    isGlutenFree: Boolean
  },

  stock: {
    quantity:   { type: Number, default: 100 },
    unit:       String,
    lowThreshold: { type: Number, default: 10 },
    isAvailable: { type: Boolean, default: true }
  },

  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },

  ratings: {
    average: { type: Number, default: 0 },
    count:   { type: Number, default: 0 }
  },

  // AI / Demand Prediction metadata
  ai: {
    demandScore:    { type: Number, default: 50 },   // 0–100
    predictedDemand: { type: Number, default: 0 },   // units next hour
    trendTag:       { type: String, enum: ['trending','stable','declining','new'], default: 'stable' },
    seasonalPeaks:  [Number],   // hours (0-23) when demand is high
    // Content-based filtering vector
    featureVector:  [Number]    // normalized feature embedding
  },

  orderCount:  { type: Number, default: 0 },
  viewCount:   { type: Number, default: 0 },
  isActive:    { type: Boolean, default: true }
}, { timestamps: true });

productSchema.index({ category: 1, store: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Product', productSchema);
