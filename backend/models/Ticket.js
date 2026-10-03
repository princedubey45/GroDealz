const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  issueType: { type: String, enum: ['Order', 'Payment', 'Quality', 'Other'], required: true },
  status: { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Escalated'], default: 'Open' },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
  aiConfidence: { type: Number, default: 1.0 }, // If < 0.6, escalate to human
  intent: { type: String }, // Detected intent like REFUND, ORDER_INFO
  crmTicketId: { type: String }, // External CRM reference
  sensitiveDataEncrypted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema);
