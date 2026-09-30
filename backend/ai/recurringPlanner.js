// ai/recurringPlanner.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz AI Recurring Grocery Planner
// ─────────────────────────────────────────────────────────────────────────────
const Order = require('../models/Order');
const Product = require('../models/Product');

/**
 * Generate weekly / recurring replenishment list based on past order history.
 */
async function generateRecurringPlan(userId) {
  let userProductIds = [];

  if (userId) {
    const orders = await Order.find({ customer: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    orders.forEach(o => {
      o.items.forEach(item => {
        if (item.product) userProductIds.push(item.product.toString());
      });
    });
  }

  let products = [];
  if (userProductIds.length > 0) {
    products = await Product.find({
      _id: { $in: userProductIds },
      isActive: true,
      'stock.isAvailable': true
    }).lean();
  }

  // Fallback to top essential staples if user has no orders yet
  if (products.length < 4) {
    const defaultEssentials = await Product.find({
      category: { $in: ['dairy', 'staples', 'vegetables'] },
      isActive: true,
      'stock.isAvailable': true
    }).sort({ orderCount: -1 }).limit(6).lean();

    products = defaultEssentials;
  }

  const items = products.map(p => {
    let daysUntilRefill = 3;
    if (['dairy', 'bakery'].includes(p.category)) daysUntilRefill = 2;
    else if (['vegetables', 'fruits'].includes(p.category)) daysUntilRefill = 4;
    else if (['staples'].includes(p.category)) daysUntilRefill = 15;

    return {
      _id: p._id,
      name: p.name,
      category: p.category,
      price: p.price,
      mrp: p.mrp || p.price,
      unit: p.unit,
      emoji: p.emoji || '🛒',
      estimatedDaysLeft: daysUntilRefill,
      recommendedQty: 1,
      rationale: `Recurring essential item — estimated refill needed in ${daysUntilRefill} days.`
    };
  });

  return {
    success: true,
    totalItems: items.length,
    items,
    action: {
      type: 'ADD_BASKET_TO_CART',
      items: items.map(i => ({ productId: i._id, quantity: i.recommendedQty }))
    }
  };
}

module.exports = { generateRecurringPlan };
