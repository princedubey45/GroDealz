// ai/nlpChatbot.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz AI Shopping Copilot & NLP Chatbot Engine
// ─────────────────────────────────────────────────────────────────────────────
const Order   = require('../models/Order');
const Product = require('../models/Product');
const Store   = require('../models/Store');
const { extractIntentAndEntities } = require('./intentExtractor');
const { generateGroceryPlan }      = require('./groceryPlanner');
const { optimizeBasketBudget }     = require('./budgetOptimizer');
const { getBasketCompletions }     = require('./basketCompletion');
const { semanticProductSearch }    = require('./semanticSearch');
const { generateRecurringPlan }    = require('./recurringPlanner');
const { compareStorePrices }       = require('./storeComparator');
const { getRecommendations }       = require('./recommendationEngine');

async function handleOrderStatus(entities, userId) {
  try {
    const query = entities.orderId ? { orderId: entities.orderId } : { customer: userId };
    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(1).lean();

    if (!orders.length) {
      return { text: "I couldn't find any recent orders. Could you provide your order ID (e.g. GRD-000001)?", type: 'info' };
    }

    const o = orders[0];
    const statusEmoji = { placed: '📋', confirmed: '✅', preparing: '👨‍🍳', out_for_delivery: '🛵', delivered: '🎉', cancelled: '❌' };

    return {
      text: `**Order ${o.orderId}** ${statusEmoji[o.status] || '📦'}\n\nStatus: **${o.status.replace(/_/g, ' ').toUpperCase()}**\nTotal: ₹${o.pricing?.total || 0}`,
      type: 'order',
      orderId: o.orderId,
      status: o.status
    };
  } catch (err) {
    return { text: 'Unable to fetch order details right now.', type: 'error' };
  }
}

async function handleCancelOrder(entities, userId) {
  try {
    const query = entities.orderId ? { orderId: entities.orderId, customer: userId } : { customer: userId, status: { $in: ['placed', 'confirmed'] } };
    const order = await Order.findOne(query);

    if (!order) {
      return { text: "I couldn't find a cancellable active order.", type: 'warning' };
    }

    order.status = 'cancelled';
    order.statusHistory.push({ status: 'cancelled', note: 'Cancelled by customer via AI Copilot' });
    await order.save();

    return { text: `✅ Order **${order.orderId}** has been successfully cancelled.`, type: 'success' };
  } catch (err) {
    return { text: 'Unable to cancel order right now.', type: 'error' };
  }
}

async function processMessage(message, userId, storeId) {
  const extracted = extractIntentAndEntities(message);
  console.log('🤖 AI Extracted:', extracted);

  let response;

  switch (extracted.intent) {
    case 'shopping_plan': {
      const plan = await generateGroceryPlan({
        familySize: extracted.familySize,
        durationDays: extracted.durationDays,
        budget: extracted.budget,
        dietary: extracted.dietary,
        shoppingGoal: extracted.shoppingGoal
      });

      const budgetMsg = extracted.budget ? ` under ₹${extracted.budget}` : '';
      const itemsList = plan.basket.map(i => `• ${i.emoji} **${i.name}** (${i.quantity} ${i.unit}) – ₹${i.lineTotal}`).join('\n');

      response = {
        text: `🤖 **AI Grocery Plan Generated**\nFor **${extracted.familySize} people** / **${extracted.durationDays} days**${budgetMsg}\nShopping Goal: _${extracted.shoppingGoal.replace(/_/g, ' ')}_\n\n${itemsList}\n\n**Total Basket**: **₹${plan.totalPrice}** (Saved ₹${plan.savings})`,
        type: 'grocery_basket',
        plan: plan,
        action: plan.action
      };
      break;
    }

    case 'cart_optimize': {
      const opt = await optimizeBasketBudget({ targetBudget: extracted.budget || 500 });
      response = {
        text: `💰 **AI Budget Optimization**\nTarget Budget: ₹${extracted.budget || 500}\nOptimized Subtotal: **₹${opt.optimizedTotal}**\n\n${opt.message || 'Basket optimized to fit your budget.'}`,
        type: 'budget_optimization',
        optimization: opt,
        action: opt.action
      };
      break;
    }

    case 'basket_completion': {
      const completions = await getBasketCompletions();
      const list = completions.suggestions.map(s => `• ${s.emoji} **${s.name}** – ₹${s.price} (_${s.rationale}_)`).join('\n');
      response = {
        text: `🧺 **Basket Completion Recommendations**\nItems to complete your recipes:\n\n${list}`,
        type: 'basket_completion',
        suggestions: completions.suggestions
      };
      break;
    }

    case 'recurring_plan': {
      const recurring = await generateRecurringPlan(userId);
      const list = recurring.items.map(i => `• ${i.emoji} **${i.name}** – ₹${i.price} (_Refill in ~${i.estimatedDaysLeft} days_)`).join('\n');
      response = {
        text: `🔄 **Weekly Grocery Refill Plan**\nBased on your shopping history:\n\n${list}`,
        type: 'recurring_plan',
        plan: recurring,
        action: recurring.action
      };
      break;
    }

    case 'price_compare': {
      const comp = await compareStorePrices(extracted.rawQuery.replace(/(compare|price|store|sasta|cheapest)/gi, '').trim() || 'Milk');
      response = {
        text: comp.success
          ? `🏪 **Store Price Comparison** for "${comp.query}":\nBest Value: **${comp.bestValueStore}** (₹${comp.lowestPrice})\n${comp.savingsText}`
          : `No store comparisons found for your query.`,
        type: 'store_comparison',
        comparison: comp
      };
      break;
    }

    case 'product_search': {
      const searchRes = await semanticProductSearch(message);
      const list = searchRes.results.map(r => `• ${r.emoji || '🛒'} **${r.name}** – ₹${r.price}\n  _${r.aiExplanation}_`).join('\n\n');
      response = {
        text: `🔍 **Semantic AI Search Results**:\n\n${list}`,
        type: 'semantic_search',
        results: searchRes.results
      };
      break;
    }

    default: {
      if (/order|track|where/i.test(message)) {
        response = await handleOrderStatus(extracted, userId);
      } else if (/cancel/i.test(message)) {
        response = await handleCancelOrder(extracted, userId);
      } else {
        response = {
          text: `Hi! I'm **GroBot**, your AI Grocery Shopping Copilot! 🤖🛒\n\nTry asking me:\n• *"Plan groceries for 4 people under ₹1000 for 3 days"* (Hinglish: *"4 log ke liye 3 din ka grocery under 1000"*)\n• *"Find healthy breakfast items"*\n• *"Optimize my cart under ₹500"*\n• *"What items am I missing for tea?"*\n• *"Show weekly recurring refill list"*\n• *"Compare price of Basmati Rice"*`,
          type: 'general'
        };
      }
    }
  }

  return {
    intent: extracted.intent,
    extracted,
    response,
    timestamp: new Date()
  };
}

module.exports = { processMessage, classifyIntent: extractIntentAndEntities, extractEntities: extractIntentAndEntities };
