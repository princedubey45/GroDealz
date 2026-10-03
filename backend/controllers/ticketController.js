const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const crmService = require('../services/crmService');

// Stub for AI processing
const analyzeMessageWithAI = async (messageText, issueType) => {
  // If the message contains payment-sensitive keywords, escalate to human agent immediately
  const sensitiveKeywords = ['payment', 'stolen', 'double charge', 'charged twice', 'refund', 'card', 'upi', 'fraud'];
  const isSensitive = sensitiveKeywords.some(keyword => messageText.toLowerCase().includes(keyword));

  if (isSensitive) {
    return { response: "I see this is a sensitive payment or refund issue. I will escalate this to a human agent immediately to ensure your data is secure.", confidence: 0.3 };
  }
  return { response: "Thank you for reaching out. We are looking into your " + issueType + " issue.", confidence: 0.9 };
};

exports.createTicket = async (req, res) => {
  try {
    const { issueType, initialMessage, isSecure } = req.body;
    
    // Create Ticket
    const ticket = new Ticket({
      user: req.user ? req.user._id : '641a0b5a3e1b1234567890ab', // Mock if no auth
      issueType,
      status: 'Open'
    });
    await ticket.save();

    // Create Initial Message
    const msg = new Message({
      ticket: ticket._id,
      sender: 'User',
      text: initialMessage,
      isSecure
    });
    await msg.save();

    // Push to CRM
    const crmRes = await crmService.syncTicketToCRM(ticket);
    ticket.crmTicketId = crmRes.crmId;
    await ticket.save();

    // AI auto-reply
    const aiAnalysis = await analyzeMessageWithAI(initialMessage, issueType);
    let newStatus = ticket.status;
    
    if (aiAnalysis.confidence < 0.6) {
      newStatus = 'Escalated';
      ticket.status = newStatus;
      ticket.aiConfidence = aiAnalysis.confidence;
      await ticket.save();
    }

    const aiMsg = new Message({
      ticket: ticket._id,
      sender: 'AI',
      text: aiAnalysis.response
    });
    await aiMsg.save();

    res.status(201).json({ ticket, messages: [msg, aiMsg] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTickets = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : '641a0b5a3e1b1234567890ab';
    const tickets = await Ticket.find({ user: userId }).sort({ createdAt: -1 });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTicketMessages = async (req, res) => {
  try {
    const messages = await Message.find({ ticket: req.params.id }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
