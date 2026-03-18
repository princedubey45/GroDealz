// ai/nlpChatbot.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz NLP Chatbot Engine
//  Implements intent classification + entity extraction (rule-based NLP)
//  Intents handled:
//    - order_status    → "Where is my order?"
//    - cancel_order    → "Cancel order #GRD-000123"
//    - recommend       → "Suggest food for dinner"
//    - price_query     → "How much is onion?"
//    - store_hours     → "Is the store open?"
//    - complaint       → "My order was wrong"
//    - greeting        → "Hi / Hello"
//    - farewell        → "Bye"
//    - human_agent     → "Talk to human"
// ─────────────────────────────────────────────────────────────────────────────
const Order   = require('../models/Order');
const Product = require('../models/Product');
const Store   = require('../models/Store');
const { getRecommendations } = require('./recommendationEngine');

// ─── INTENT PATTERNS ────────────────────────────────────────────────────────
const INTENTS = [
  {
    name: 'order_status',
    patterns: [
      /where\s+(is|are)\s+(my|the)\s+order/i,
      /track\s+(my\s+)?order/i,
      /order\s+status/i,
      /when\s+will\s+(my\s+)?order\s+(arrive|come|deliver)/i,
      /delivery\s+status/i,
      /(my\s+)?order\s+#?[a-z]{3}-\d+/i,
      /GRD-\d+/i
    ]
  },
  {
    name: 'cancel_order',
    patterns: [
      /cancel\s+(my\s+)?order/i,
      /i\s+want\s+to\s+cancel/i,
      /please\s+cancel/i,
      /cancel\s+#?[a-z]{3}-\d+/i
    ]
  },
  {
    name: 'recommend',
    patterns: [
      /suggest\s+(me\s+)?(some\s+)?(food|items?|grocery|products?)/i,
      /what\s+should\s+i\s+(buy|order|get)/i,
      /recommend/i,
      /what('s|\s+is)\s+popular/i,
      /best\s+(selling|items?|products?)/i,
      /show\s+me\s+deals/i,
      /any\s+(good\s+)?offers/i
    ]
  },
  {
    name: 'price_query',
    patterns: [
      /how\s+much\s+(is|are|does|do)/i,
      /price\s+(of|for)/i,
      /what('s|\s+is)\s+the\s+(cost|price)/i,
      /cost\s+(of|for)/i
    ]
  },
  {
    name: 'store_hours',
    patterns: [
      /is\s+(the\s+)?store\s+open/i,
      /store\s+hours?/i,
      /when\s+do\s+(you\s+)?open/i,
      /opening\s+time/i,
      /closing\s+time/i
    ]
  },
  {
    name: 'complaint',
    patterns: [
      /wrong\s+(item|order|product)/i,
      /missing\s+item/i,
      /damaged|broken|expired/i,
      /not\s+delivered/i,
      /refund/i,
      /complaint/i,
      /problem\s+with\s+(my\s+)?order/i
    ]
  },
  {
    name: 'greeting',
    patterns: [
      /^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy)/i,
      /^namaste/i
    ]
  },
  {
    name: 'farewell',
    patterns: [
      /^(bye|goodbye|see\s+you|thanks?(\s+a\s+lot)?|thank\s+you|ok\s+bye)/i
    ]
  },
  {
    name: 'human_agent',
    patterns: [
      /talk\s+to\s+(a\s+)?(human|person|agent|support)/i,
      /connect\s+(me\s+)?to\s+(a\s+)?(human|agent)/i,
      /speak\s+to\s+(a\s+)?person/i,
      /customer\s+(support|service|care)/i
    ]
  }
];

// ─── ENTITY EXTRACTION ───────────────────────────────────────────────────────
function extractEntities(message) {
  const entities = {};

  // Order ID
  const orderMatch = message.match(/GRD-\d{3,8}/i) ||
                     message.match(/#(\d{3,8})/);
  if (orderMatch) entities.orderId = orderMatch[0].toUpperCase().replace('#','');

  // Product name (simple noun extraction after keyword)
  const priceMatch = message.match(/(?:price of|how much is|cost of)\s+(.{2,30}?)(?:\?|$)/i);
  if (priceMatch) entities.productName = priceMatch[1].trim();

  // Meal time context
  if (/breakfast|morning/i.test(message)) entities.mealTime = 'breakfast';
  else if (/lunch/i.test(message))        entities.mealTime = 'lunch';
  else if (/dinner|evening/i.test(message)) entities.mealTime = 'dinner';
  else if (/snack/i.test(message))        entities.mealTime = 'snack';

  // Dietary preference
  if (/veg(etarian)?(?!\s*non)/i.test(message)) entities.dietary = 'veg';
  if (/non.?veg/i.test(message))               entities.dietary = 'non-veg';
  if (/vegan/i.test(message))                  entities.dietary = 'vegan';

  return entities;
}

// ─── CLASSIFY INTENT ────────────────────────────────────────────────────────
function classifyIntent(message) {
  for (const intent of INTENTS) {
    for (const pattern of intent.patterns) {
      if (pattern.test(message)) return intent.name;
    }
  }
  return 'unknown';
}

// ─── RESPONSE HANDLERS ───────────────────────────────────────────────────────
async function handleOrderStatus(entities, userId) {
  try {
    const query = entities.orderId
      ? { orderId: entities.orderId }
      : { customer: userId };

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(1)
      .populate('items.product', 'name')
      .lean();

    if (!orders.length) {
      return {
        text: "I couldn't find any recent orders. Could you provide your order ID (e.g. GRD-000001)?",
        type: 'info'
      };
    }

    const o = orders[0];
    const statusEmoji = {
      placed:           '📋', confirmed: '✅', preparing: '👨‍🍳',
      out_for_delivery: '🛵', delivered: '🎉', cancelled:  '❌'
    };

    const itemNames = o.items.map(i => i.name || i.product?.name || 'item').join(', ');

    return {
      text: `**Order ${o.orderId}** ${statusEmoji[o.status] || '📦'}\n\nStatus: **${o.status.replace(/_/g, ' ').toUpperCase()}**\nItems: ${itemNames}\nTotal: ₹${o.pricing?.total || 0}${o.delivery?.estimatedTime ? `\nEstimated delivery: ~${o.delivery.estimatedTime} mins` : ''}`,
      type:    'order',
      orderId: o.orderId,
      status:  o.status
    };
  } catch (err) {
    return { text: 'Unable to fetch order details right now. Please try again.', type: 'error' };
  }
}

async function handleCancelOrder(entities, userId) {
  try {
    const query = entities.orderId
      ? { orderId: entities.orderId, customer: userId }
      : { customer: userId, status: { $in: ['placed', 'confirmed'] } };

    const order = await Order.findOne(query).sort({ createdAt: -1 });

    if (!order) {
      return {
        text: entities.orderId
          ? `Order ${entities.orderId} not found or doesn't belong to your account.`
          : "I couldn't find a cancellable order. Orders can only be cancelled before they're being prepared.",
        type: 'warning'
      };
    }

    if (!['placed', 'confirmed'].includes(order.status)) {
      return {
        text: `Sorry, order **${order.orderId}** is already **${order.status}** and cannot be cancelled. Please contact support for assistance.`,
        type: 'warning'
      };
    }

    order.status = 'cancelled';
    order.statusHistory.push({ status: 'cancelled', note: 'Cancelled by customer via chatbot' });
    await order.save();

    if (global.io) {
      global.io.to(`order_${order._id}`).emit('order_update', { status: 'cancelled', orderId: order.orderId });
    }

    return {
      text: `✅ Order **${order.orderId}** has been successfully cancelled. If you paid online, a refund will be processed within 3–5 business days.`,
      type: 'success'
    };
  } catch (err) {
    return { text: 'Unable to cancel order right now. Please try again or contact support.', type: 'error' };
  }
}

async function handleRecommend(entities, userId) {
  try {
    const context = {
      hour:    new Date().getHours(),
      dietary: entities.dietary
    };

    const recs = await getRecommendations(userId, { limit: 5, context });

    if (!recs.length) {
      const popular = await Product.find({ isActive: true }).sort({ orderCount: -1 }).limit(5).lean();
      const names   = popular.map(p => `${p.emoji || '🛒'} **${p.name}** – ₹${p.price}`).join('\n');
      return { text: `Here are our **top picks** right now:\n\n${names}`, type: 'recommendations', products: popular };
    }

    const mealMsg = entities.mealTime ? ` for **${entities.mealTime}**` : '';
    const names   = recs.slice(0, 5).map(p => `${p.emoji || '🛒'} **${p.name}** – ₹${p.price}${p.discount ? ` ~~₹${p.mrp}~~ (${p.discount}% off)` : ''}`).join('\n');

    return {
      text: `Based on your preferences${mealMsg}, here are my **AI recommendations**:\n\n${names}\n\n_Powered by collaborative + content-based filtering_`,
      type: 'recommendations',
      products: recs.slice(0, 5)
    };
  } catch (err) {
    return { text: 'Let me suggest our bestsellers for you! Check out the Products page for today\'s top deals.', type: 'info' };
  }
}

async function handlePriceQuery(entities) {
  try {
    if (!entities.productName) {
      return { text: 'Which product would you like the price for? E.g., "How much is onion?" or "Price of rice".', type: 'info' };
    }

    const products = await Product.find({
      $text: { $search: entities.productName }
    }).limit(3).lean();

    if (!products.length) {
      const fallback = await Product.find({
        name: { $regex: entities.productName, $options: 'i' }
      }).limit(3).lean();

      if (!fallback.length) return { text: `I couldn't find "${entities.productName}". Try searching on the Products page.`, type: 'info' };
      const lines = fallback.map(p => `${p.emoji || '🛒'} **${p.name}** (${p.unit}) – ₹${p.price}`).join('\n');
      return { text: `Here are the prices for "${entities.productName}":\n\n${lines}`, type: 'price', products: fallback };
    }

    const lines = products.map(p =>
      `${p.emoji || '🛒'} **${p.name}** (${p.unit}) – ₹${p.price}${p.discount ? ` ~~₹${p.mrp}~~ (${p.discount}% off)` : ''}`
    ).join('\n');

    return { text: `Prices for **"${entities.productName}"**:\n\n${lines}`, type: 'price', products };

  } catch (err) {
    return { text: 'Unable to fetch prices right now. Please check the Products page.', type: 'error' };
  }
}

async function handleStoreHours(storeId) {
  try {
    const store = await Store.findById(storeId).lean();
    if (!store) return { text: 'Store information not available.', type: 'info' };

    const now    = new Date();
    const hour   = now.getHours();
    const openH  = parseInt(store.hours.open.split(':')[0]);
    const closeH = parseInt(store.hours.close.split(':')[0]);
    const isOpen = hour >= openH && hour < closeH;

    return {
      text: `**${store.name}** is currently **${isOpen ? '🟢 OPEN' : '🔴 CLOSED'}**.\n\nStore Hours: ${store.hours.open} – ${store.hours.close}\nLocation: ${store.location?.area || store.location?.address}\n${isOpen ? `We close at ${store.hours.close}. Happy shopping! 🛒` : `We open at ${store.hours.open} tomorrow. See you then!`}`,
      type: 'store_info'
    };
  } catch (err) {
    return { text: 'Store information is temporarily unavailable.', type: 'error' };
  }
}

// ─── GREETING ────────────────────────────────────────────────────────────────
function handleGreeting(userName) {
  const hour = new Date().getHours();
  const timeGreet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const responses = [
    `${timeGreet}${userName ? ', ' + userName : ''}! 👋 I'm **GroBot**, your AI shopping assistant. How can I help you today?\n\nI can help you:\n• 📦 Track your order\n• ❌ Cancel an order\n• 🛒 Get personalized recommendations\n• 💰 Check prices\n• 🏪 Store information`,
    `Hello${userName ? ' ' + userName : ''}! 😊 Welcome to GroDealz! What can I help you with today?`,
    `Hey there! I'm GroBot 🤖. Ask me anything — orders, prices, recommendations — I've got you covered!`
  ];
  return { text: responses[Math.floor(Math.random() * responses.length)], type: 'greeting' };
}

function handleFarewell() {
  const responses = [
    'Thank you for shopping with GroDealz! Have a great day! 🛒✨',
    'Goodbye! Your next order is just a tap away. See you soon! 👋',
    'Take care! Don\'t forget — we deliver in 30 mins! 🚀'
  ];
  return { text: responses[Math.floor(Math.random() * responses.length)], type: 'farewell' };
}

function handleComplaint() {
  return {
    text: `I'm really sorry to hear about your experience 😔. Here's how we can help:\n\n1. **Wrong/Missing item** — We'll redeliver or refund within 24 hours\n2. **Damaged product** — Full refund, no questions asked\n3. **Late delivery** — ₹50 store credit applied automatically\n\nPlease share your **Order ID** and I'll escalate this right away, or type **"talk to human"** to connect with our support team.`,
    type: 'complaint'
  };
}

function handleHumanAgent() {
  return {
    text: `Connecting you to a human agent... ⏳\n\nWhile you wait:\n📞 **Call:** +91-385-2441234\n📧 **Email:** support@grodeaz.com\n💬 **WhatsApp:** +91-9876543210\n\nAvailable: 8 AM – 10 PM, Mon–Sat`,
    type: 'handoff'
  };
}

function handleUnknown(message) {
  return {
    text: `I'm not sure I understood that. Here are some things I can help with:\n\n• "**Where is my order?**"\n• "**Cancel order GRD-000123**"\n• "**Suggest vegetarian dinner items**"\n• "**How much is tomato?**"\n• "**Is the store open?**"\n\nOr type **"talk to human"** for live support.`,
    type: 'unknown'
  };
}

// ─── MAIN PROCESS MESSAGE ─────────────────────────────────────────────────────
async function processMessage(message, userId, storeId) {
  const intent   = classifyIntent(message);
  const entities = extractEntities(message);

  console.log(`🤖 Intent: ${intent} | Entities:`, entities);

  let response;
  switch (intent) {
    case 'order_status':  response = await handleOrderStatus(entities, userId);       break;
    case 'cancel_order':  response = await handleCancelOrder(entities, userId);       break;
    case 'recommend':     response = await handleRecommend(entities, userId);         break;
    case 'price_query':   response = await handlePriceQuery(entities);                break;
    case 'store_hours':   response = await handleStoreHours(storeId);                 break;
    case 'complaint':     response = handleComplaint();                               break;
    case 'greeting':      response = handleGreeting();                                break;
    case 'farewell':      response = handleFarewell();                                break;
    case 'human_agent':   response = handleHumanAgent();                              break;
    default:              response = handleUnknown(message);
  }

  return { intent, entities, response, timestamp: new Date() };
}

module.exports = { processMessage, classifyIntent, extractEntities };
