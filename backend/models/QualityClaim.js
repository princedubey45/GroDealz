const mongoose = require('mongoose');

const qualityClaimSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryBatch' }, // Link to specific batch
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  issueType: { 
    type: String, 
    enum: ['Spoiled', 'Damaged', 'Bruised', 'Overripe', 'Underripe', 'Wilted', 'Wrong Product', 'Quality Not As Expected'], 
    required: true 
  },
  description: { type: String },
  evidencePhotos: [{ type: String }], // Array of URLs (Optional but recommended)
  status: { type: String, enum: ['Submitted', 'Evaluating', 'Approved', 'Rejected', 'Resolved'], default: 'Submitted' },
  resolution: { type: String, enum: ['Instant Refund', 'Wallet Credit', 'Replacement', 'Manual Review', 'None'], default: 'None' },
  claimAmount: { type: Number, required: true },
}, { timestamps: true });

module.exports = mongoose.model('QualityClaim', qualityClaimSchema);
