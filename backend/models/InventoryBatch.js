const mongoose = require('mongoose');

// An isolated model mapping Products to specific Harvest/Arrival Batches
const inventoryBatchSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  batchCode: { type: String, required: true, unique: true }, // e.g., 'TMT-20231024-A'
  origin: { type: String, required: true }, // e.g., 'Local Farm, Imphal'
  harvestDate: { type: Date, required: true },
  arrivalDate: { type: Date, default: Date.now },
  storageCondition: { type: String, enum: ['Ambient', 'Chilled', 'Frozen'], default: 'Ambient' },
  initialQuantity: { type: Number, required: true },
  currentQuantity: { type: Number, required: true },
  isExhausted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('InventoryBatch', inventoryBatchSchema);
