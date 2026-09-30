// ai/budgetOptimizer.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz AI Budget Optimizer Engine (MongoDB Grounded)
// ─────────────────────────────────────────────────────────────────────────────
const Product = require('../models/Product');

/**
 * Optimize a cart or basket to fit strictly within a target budget.
 */
async function optimizeBasketBudget({ items = [], targetBudget = 500 }) {
  if (!items || items.length === 0) {
    return { success: false, message: 'Cart is empty', items: [], currentTotal: 0 };
  }

  // Populate product details if IDs were passed
  const hydratedItems = [];
  let originalTotal = 0;

  for (const item of items) {
    let prod = item.product;
    if (typeof prod === 'string' || !prod.name) {
      prod = await Product.findById(item.product || item._id).lean();
    }
    if (prod) {
      const qty = item.quantity || 1;
      const lineTotal = prod.price * qty;
      originalTotal += lineTotal;
      hydratedItems.push({
        productId: prod._id,
        name: prod.name,
        category: prod.category,
        price: prod.price,
        unit: prod.unit,
        emoji: prod.emoji || '🛒',
        quantity: qty,
        lineTotal,
        actionTaken: 'kept'
      });
    }
  }

  if (originalTotal <= targetBudget) {
    return {
      success: true,
      originalTotal,
      optimizedTotal: originalTotal,
      targetBudget,
      savings: 0,
      message: `Your current cart total (₹${originalTotal}) is already within your ₹${targetBudget} budget!`,
      items: hydratedItems
    };
  }

  // Sort items by line total descending (highest expense first)
  hydratedItems.sort((a, b) => b.lineTotal - a.lineTotal);

  let currentTotal = originalTotal;
  const modifications = [];

  // Pass 1: Look for cheaper alternatives in MongoDB in the same category
  for (const item of hydratedItems) {
    if (currentTotal <= targetBudget) break;

    const cheaperProd = await Product.findOne({
      category: item.category,
      price: { $lt: item.price },
      isActive: true,
      'stock.isAvailable': true
    }).sort({ price: 1 }).lean();

    if (cheaperProd) {
      const oldCost = item.lineTotal;
      const newCost = cheaperProd.price * item.quantity;
      const diff = oldCost - newCost;

      if (diff > 0) {
        item.productId = cheaperProd._id;
        item.name = cheaperProd.name;
        item.price = cheaperProd.price;
        item.unit = cheaperProd.unit;
        item.lineTotal = newCost;
        item.actionTaken = `Swapped ${item.name} for ${cheaperProd.name} (Saved ₹${diff})`;
        currentTotal -= diff;
        modifications.push(item.actionTaken);
      }
    }
  }

  // Pass 2: Reduce quantities or trim luxury items if still over budget
  let idx = 0;
  while (currentTotal > targetBudget && idx < hydratedItems.length) {
    const item = hydratedItems[idx];
    if (item.quantity > 1) {
      item.quantity -= 1;
      item.lineTotal = item.price * item.quantity;
      currentTotal -= item.price;
      item.actionTaken = `Reduced quantity to ${item.quantity} to save ₹${item.price}`;
      modifications.push(item.actionTaken);
    } else if (!['staples', 'vegetables'].includes(item.category)) {
      currentTotal -= item.lineTotal;
      item.actionTaken = `Removed non-essential ${item.name} to fit ₹${targetBudget} budget`;
      modifications.push(item.actionTaken);
      hydratedItems.splice(idx, 1);
      continue;
    }
    idx++;
  }

  return {
    success: true,
    originalTotal,
    optimizedTotal: currentTotal,
    targetBudget,
    totalSaved: originalTotal - currentTotal,
    modificationsCount: modifications.length,
    modifications,
    items: hydratedItems,
    action: {
      type: 'APPLY_OPTIMIZED_CART',
      items: hydratedItems.map(i => ({ productId: i.productId, quantity: i.quantity }))
    }
  };
}

module.exports = { optimizeBasketBudget };
