const mongoose = require('mongoose');

// Isolated model to log daily warehouse inspections for a batch
const batchInspectionSchema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryBatch', required: true },
  inspectedAt: { type: Date, default: Date.now },
  inspectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // The warehouse staff
  visualScore: { type: Number, min: 1, max: 10, required: true }, // 10 is perfectly fresh
  firmnessScore: { type: Number, min: 1, max: 10 },
  notes: { type: String },
  recommendedAction: { type: String, enum: ['None', 'Discount', 'Discard'], default: 'None' }
}, { timestamps: true });

module.exports = mongoose.model('BatchInspection', batchInspectionSchema);
