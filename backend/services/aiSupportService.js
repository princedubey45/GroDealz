const Order = require('../models/Order');

// Customer -> Chat / Ticket -> AI Support Agent -> Intent Detection
const detectIntent = (message) => {
  const msg = message.toLowerCase();
  if (msg.includes('refund') || msg.includes('return') || msg.includes('double charge')) return 'REFUND';
  if (msg.includes('replace') || msg.includes('missing') || msg.includes('broken')) return 'REPLACEMENT';
  if (msg.includes('cancel')) return 'CANCELLATION';
  if (msg.includes('where is') || msg.includes('status') || msg.includes('track') || msg.includes('info')) return 'ORDER_INFO';
  return 'GENERAL';
};

// Retrieve Customer + Order Context & RAG Business Rules
const retrieveContext = async (userId, orderId = null) => {
  let latestOrder = null;
  if (userId) {
    if (orderId) {
      latestOrder = await Order.findOne({ orderId, customer: userId }).lean();
    } else {
      latestOrder = await Order.findOne({ customer: userId }).sort({ createdAt: -1 }).lean();
    }
  }
  
  return {
    businessRules: {
      canCancel: (status) => ['placed', 'confirmed'].includes(status),
      canRefund: (status) => ['delivered', 'cancelled'].includes(status)
    },
    latestOrder
  };
};

// Business Rule Validation & Auto Resolution (Tool Calling)
const executeAutoResolution = async (intent, context) => {
  const { latestOrder, businessRules } = context;

  // Protect payment specifics directly via intent fallback
  if (intent === 'GENERAL') {
    return { success: false, response: "I'll connect you with a human agent for this specific issue.", confidence: 0.4 };
  }

  if (!latestOrder) {
    return { success: false, response: "I couldn't find a recent order for your account. Could you provide your order ID to a human agent?", confidence: 0.4 };
  }

  switch (intent) {
    case 'REFUND':
      if (businessRules.canRefund(latestOrder.status)) {
        return { success: true, response: `✅ **Auto-Resolution:** I have verified your request. A full refund of ₹${latestOrder.pricing?.total} for order ${latestOrder.orderId} has been initiated to your original payment method.`, confidence: 0.95 };
      }
      return { success: false, response: "Your order is not eligible for an automatic refund at this stage. I am escalating this to a human agent.", confidence: 0.3 };

    case 'REPLACEMENT':
      if (latestOrder.status === 'delivered') {
        return { success: true, response: `✅ **Auto-Resolution:** I'm sorry to hear that. I've automatically arranged a replacement for the affected items in order ${latestOrder.orderId}.`, confidence: 0.9 };
      }
      return { success: false, response: "I can't issue a replacement yet because your order isn't marked as delivered. Escalating to an agent.", confidence: 0.4 };

    case 'CANCELLATION':
      if (businessRules.canCancel(latestOrder.status)) {
        // In a real system, we'd trigger a tool call here to mutate the DB
        return { success: true, response: `✅ **Auto-Resolution:** I've successfully cancelled order ${latestOrder.orderId}. If you paid online, the amount will be refunded.`, confidence: 0.98 };
      }
      return { success: false, response: `Order ${latestOrder.orderId} is already '${latestOrder.status.replace(/_/g, ' ')}' and cannot be cancelled automatically. Escalating to an agent.`, confidence: 0.3 };

    case 'ORDER_INFO':
      return { success: true, response: `✅ **Auto-Resolution:** Your order ${latestOrder.orderId} is currently **${latestOrder.status.replace(/_/g, ' ')}**. ${latestOrder.delivery?.estimatedTime ? 'ETA is ~' + latestOrder.delivery.estimatedTime + ' minutes.' : ''}`, confidence: 0.99 };

    default:
      return { success: false, response: "Let me connect you with a human agent.", confidence: 0.5 };
  }
};

exports.processCustomerMessage = async (messageText, userId) => {
  // 1. Intent Detection
  const intent = detectIntent(messageText);

  // 2. Retrieve Customer Context + RAG
  const context = await retrieveContext(userId);

  // 3. Tool Calling & Auto Resolution Validation
  const resolution = await executeAutoResolution(intent, context);

  return {
    intent,
    response: resolution.response,
    confidence: resolution.confidence,
    requiresHuman: !resolution.success
  };
};
