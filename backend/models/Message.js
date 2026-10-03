const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
  sender: { type: String, enum: ['User', 'Agent', 'AI'], required: true },
  text: { type: String, required: true },
  isSecure: { type: Boolean, default: false } // e.g. for PII/payment data masking
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
