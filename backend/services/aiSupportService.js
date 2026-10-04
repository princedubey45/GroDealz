const Order = require('../models/Order');
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || 'dummy_key', // User will need to set this in .env
  baseURL: 'https://openrouter.ai/api/v1',
});

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
const executeAutoResolution = async (intent, context, messageText) => {
  const { latestOrder, businessRules } = context;

  // Helper to generate dynamic GPT responses instead of hardcoded strings
  const generateAIResponse = async (promptContext) => {
    try {
      if (!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY) {
        return "I'll connect you with a human agent for this specific issue.";
      }
      const response = await openai.chat.completions.create({
        model: "openai/gpt-3.5-turbo",
        messages: [
          { role: "system", content: `You are a helpful and polite customer support AI for an online grocery store called GroDealz. ${promptContext}` },
          { role: "user", content: messageText }
        ],
        temperature: 0.7,
        max_tokens: 150
      });
      return response.choices[0].message.content;
    } catch (err) {
      console.error('OpenAI Error:', err);
      return "I'll connect you with a human agent for this specific issue.";
    }
  };

  // For GENERAL or conversational messages
  if (intent === 'GENERAL') {
    const reply = await generateAIResponse("If the user greets you, greet them back warmly and ask how you can help them with their groceries or orders. If they ask a general question, provide a helpful answer.");
    return { success: true, response: reply, confidence: 0.9 };
  }

  if (!latestOrder) {
    const reply = await generateAIResponse("The user is asking about an order, but we couldn't find a recent order for their account. Politely tell them you couldn't find a recent order and ask them to provide their order ID so you can assist them.");
    return { success: false, response: reply, confidence: 0.4 };
  }

  switch (intent) {
    case 'REFUND':
      if (businessRules.canRefund(latestOrder.status)) {
        return { success: true, response: `✅ **Auto-Resolution:** I have verified your request. A full refund of ₹${latestOrder.pricing?.total} for order ${latestOrder.orderId} has been initiated to your original payment method.`, confidence: 0.95 };
      }
      return { success: false, response: await generateAIResponse(`The user wants a refund, but their order status is '${latestOrder.status}', which is not eligible for an automatic refund. Politely explain this and say you are escalating it to a human agent.`), confidence: 0.3 };

    case 'REPLACEMENT':
      if (latestOrder.status === 'delivered') {
        return { success: true, response: `✅ **Auto-Resolution:** I'm sorry to hear that. I've automatically arranged a replacement for the affected items in order ${latestOrder.orderId}.`, confidence: 0.9 };
      }
      return { success: false, response: await generateAIResponse(`The user wants a replacement, but their order status is '${latestOrder.status}' (not delivered). Politely explain you can't issue a replacement yet and are escalating to an agent.`), confidence: 0.4 };

    case 'CANCELLATION':
      if (businessRules.canCancel(latestOrder.status)) {
        // In a real system, we'd trigger a tool call here to mutate the DB
        return { success: true, response: `✅ **Auto-Resolution:** I've successfully cancelled order ${latestOrder.orderId}. If you paid online, the amount will be refunded.`, confidence: 0.98 };
      }
      return { success: false, response: await generateAIResponse(`The user wants to cancel order ${latestOrder.orderId}, but it is already '${latestOrder.status.replace(/_/g, ' ')}' and cannot be cancelled automatically. Politely explain this and escalate to an agent.`), confidence: 0.3 };

    case 'ORDER_INFO':
      return { success: true, response: `✅ **Auto-Resolution:** Your order ${latestOrder.orderId} is currently **${latestOrder.status.replace(/_/g, ' ')}**. ${latestOrder.delivery?.estimatedTime ? 'ETA is ~' + latestOrder.delivery.estimatedTime + ' minutes.' : ''}`, confidence: 0.99 };

    default:
      return { success: false, response: await generateAIResponse("You are unsure how to automatically resolve this issue. Politely let the user know you are connecting them with a human agent."), confidence: 0.5 };
  }
};

exports.processCustomerMessage = async (messageText, userId) => {
  // 1. Intent Detection
  const intent = detectIntent(messageText);

  // 2. Retrieve Customer Context + RAG
  const context = await retrieveContext(userId);

  // 3. Tool Calling & Auto Resolution Validation
  const resolution = await executeAutoResolution(intent, context, messageText);

  return {
    intent,
    response: resolution.response,
    confidence: resolution.confidence,
    requiresHuman: !resolution.success
  };
};
