// controllers/aiController.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz AI Controller - Endpoint Handlers & Safety Validation
// ─────────────────────────────────────────────────────────────────────────────
const Product = require('../models/Product');
const { processMessage }           = require('../ai/nlpChatbot');
const { generateGroceryPlan }      = require('../ai/groceryPlanner');
const { getBasketCompletions }     = require('../ai/basketCompletion');
const { optimizeBasketBudget }     = require('../ai/budgetOptimizer');
const { semanticProductSearch }    = require('../ai/semanticSearch');
const { generateRecurringPlan }    = require('../ai/recurringPlanner');
const { compareStorePrices }       = require('../ai/storeComparator');

/**
 * 🛡️ Safety & Reliability Backend Business Logic Validation
 * Ensures LLM / AI outputs do NOT bypass database safety.
 */
async function validateAndVerifyBasket(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: 'Basket items array is empty' };
  }

  const verifiedItems = [];
  let totalCalculatedPrice = 0;

  for (const item of items) {
    const pId = item.productId || item.product || item._id;
    const requestedQty = Math.max(1, parseInt(item.quantity || 1, 10));

    const dbProduct = await Product.findById(pId).lean();

    if (!dbProduct) {
      return { valid: false, error: `Product ID ${pId} not found in database.` };
    }

    if (!dbProduct.isActive) {
      return { valid: false, error: `Product "${dbProduct.name}" is currently inactive.` };
    }

    if (!dbProduct.stock?.isAvailable || dbProduct.stock?.quantity < requestedQty) {
      return { valid: false, error: `Product "${dbProduct.name}" out of stock (Available: ${dbProduct.stock?.quantity || 0}).` };
    }

    const lineTotal = dbProduct.price * requestedQty;
    totalCalculatedPrice += lineTotal;

    verifiedItems.push({
      product: dbProduct._id,
      name: dbProduct.name,
      price: dbProduct.price,
      mrp: dbProduct.mrp || dbProduct.price,
      unit: dbProduct.unit,
      emoji: dbProduct.emoji || '🛒',
      quantity: requestedQty,
      lineTotal
    });
  }

  return {
    valid: true,
    totalPrice: totalCalculatedPrice,
    verifiedItems
  };
}

// REST Handlers
async function copilot(req, res) {
  try {
    const { message, storeId } = req.body;
    const userId = req.user?._id;
    const result = await processMessage(message, userId, storeId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function planGroceries(req, res) {
  try {
    const { familySize, durationDays, budget, dietary, shoppingGoal } = req.body;
    const result = await generateGroceryPlan({
      familySize: parseInt(familySize || 2, 10),
      durationDays: parseInt(durationDays || 3, 10),
      budget: budget ? parseInt(budget, 10) : null,
      dietary,
      shoppingGoal
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function basketCompletion(req, res) {
  try {
    const cartItems = req.body.items || [];
    const result = await getBasketCompletions(cartItems);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function optimizeBudget(req, res) {
  try {
    const { items, targetBudget } = req.body;
    const result = await optimizeBasketBudget({ items, targetBudget: parseInt(targetBudget || 500, 10) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function semanticSearch(req, res) {
  try {
    const query = req.query.q || req.body.query || '';
    const result = await semanticProductSearch(query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function recurringPlan(req, res) {
  try {
    const userId = req.user?._id;
    const result = await generateRecurringPlan(userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function storeComparison(req, res) {
  try {
    const productName = req.query.product || req.body.productName || 'Milk';
    const result = await compareStorePrices(productName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function validateBasket(req, res) {
  try {
    const { items } = req.body;
    const validation = await validateAndVerifyBasket(items);
    res.json(validation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  copilot,
  planGroceries,
  basketCompletion,
  optimizeBudget,
  semanticSearch,
  recurringPlan,
  storeComparison,
  validateBasket,
  validateAndVerifyBasket
};
