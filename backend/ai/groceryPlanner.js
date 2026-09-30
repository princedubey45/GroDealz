// ai/groceryPlanner.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz AI Grocery Planner Engine (MongoDB Grounded)
// ─────────────────────────────────────────────────────────────────────────────
const Product = require('../models/Product');
const { generateExplanation } = require('./aiExplainer');

/**
 * Generate a grocery plan strictly grounded in existing active products in MongoDB.
 *
 * Pipeline:
 * User Requirements -> Category Ratios -> Query MongoDB -> Filter Stock/Active -> Score & Select -> Budget Optimisation -> Final Basket
 */
async function generateGroceryPlan({
  familySize = 2,
  durationDays = 3,
  budget = null,
  dietary = 'all',
  shoppingGoal = 'family_shopping',
  userHistory = []
}) {
  // 1. Fetch available products from MongoDB
  const query = {
    isActive: true,
    'stock.isAvailable': true
  };

  if (dietary === 'veg') {
    query['dietary.isVeg'] = true;
  } else if (dietary === 'vegan') {
    query['dietary.isVegan'] = true;
  }

  const dbProducts = await Product.find(query).lean();

  if (!dbProducts || dbProducts.length === 0) {
    return {
      success: false,
      message: 'No active in-stock products found matching your dietary filter.',
      basket: [],
      totalPrice: 0
    };
  }

  // 2. Define Category Base Ratios (scaled by familySize and durationDays)
  // Base daily unit multiplier per person
  const factor = (familySize / 2) * (durationDays / 3);

  // Preferred categories to include for a balanced basket
  const categoryTargets = [
    { category: 'staples',    minItems: 2, maxItems: 3, weight: 0.35 },
    { category: 'vegetables', minItems: 2, maxItems: 4, weight: 0.25 },
    { category: 'dairy',      minItems: 1, maxItems: 3, weight: 0.20 },
    { category: 'fruits',     minItems: 1, maxItems: 2, weight: 0.10 },
    { category: 'bakery',     minItems: 0, maxItems: 2, weight: 0.05 },
    { category: 'meat',       minItems: 0, maxItems: 2, weight: 0.05 },
    { category: 'snacks',     minItems: 0, maxItems: 2, weight: 0.05 }
  ];

  // 3. Score and group DB products by category
  const scoredProducts = dbProducts.map(p => {
    let score = p.ai?.demandScore || 50;
    if (p.orderCount) score += Math.min(30, p.orderCount / 20);

    // Boost if user previously purchased
    if (userHistory.includes(p._id.toString())) {
      score += 25;
    }

    // Boost for trending items
    if (p.ai?.trendTag === 'trending') {
      score += 15;
    }

    // Shopping goal adjustments
    if (shoppingGoal === 'healthy_shopping' && ['vegetables', 'fruits'].includes(p.category)) {
      score += 20;
    }
    if (shoppingGoal === 'budget_shopping' && p.discount > 10) {
      score += 20;
    }

    return { ...p, score };
  });

  // Group by category
  const byCategory = {};
  scoredProducts.forEach(p => {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p);
  });

  // Sort products within each category by score descending
  Object.keys(byCategory).forEach(cat => {
    byCategory[cat].sort((a, b) => b.score - a.score);
  });

  // 4. Build Initial Candidate Basket
  const basket = [];
  let currentTotal = 0;

  for (const target of categoryTargets) {
    const availableInCat = byCategory[target.category] || [];
    if (availableInCat.length === 0) continue;

    const countToPick = Math.min(target.maxItems, availableInCat.length);
    for (let i = 0; i < countToPick; i++) {
      const prod = availableInCat[i];

      // Calculate quantity based on product type and factor
      let qty = 1;
      if (['vegetables', 'dairy', 'staples'].includes(prod.category)) {
        qty = Math.ceil(factor);
      } else if (durationDays > 5) {
        qty = Math.ceil(factor * 0.8);
      }

      // Respect max stock available
      const stockAvailable = prod.stock?.quantity || 50;
      qty = Math.min(qty, stockAvailable);

      if (qty > 0) {
        const lineTotal = prod.price * qty;
        basket.push({
          product: prod._id,
          name: prod.name,
          category: prod.category,
          price: prod.price,
          mrp: prod.mrp || prod.price,
          unit: prod.unit,
          emoji: prod.emoji || '🛒',
          quantity: qty,
          lineTotal: lineTotal,
          stock: stockAvailable,
          rationale: generateExplanation(prod, { familySize, durationDays, budget, shoppingGoal })
        });
        currentTotal += lineTotal;
      }
    }
  }

  // 5. Budget Constraint Solver / Optimization
  if (budget && budget > 0 && currentTotal > budget) {
    // Sort basket items by price per unit descending (highest cost contribution first)
    basket.sort((a, b) => b.lineTotal - a.lineTotal);

    let idx = 0;
    while (currentTotal > budget && idx < basket.length) {
      const item = basket[idx];
      // Reduce quantity if > 1
      if (item.quantity > 1) {
        item.quantity -= 1;
        item.lineTotal = item.price * item.quantity;
        currentTotal -= item.price;
        item.rationale = `Adjusted to ${item.quantity} ${item.unit} to fit within your ₹${budget} budget limit.`;
      } else {
        // If non-essential (not staples or main veg), remove item
        if (!['staples', 'vegetables'].includes(item.category)) {
          currentTotal -= item.lineTotal;
          basket.splice(idx, 1);
          continue; // do not increment idx since array shifted
        }
      }
      idx++;
    }
  }

  return {
    success: true,
    params: { familySize, durationDays, budget, dietary, shoppingGoal },
    itemCount: basket.length,
    totalPrice: currentTotal,
    savings: basket.reduce((acc, item) => acc + ((item.mrp - item.price) * item.quantity), 0),
    basket,
    action: {
      type: 'ADD_BASKET_TO_CART',
      items: basket.map(b => ({ productId: b.product, quantity: b.quantity }))
    }
  };
}

module.exports = { generateGroceryPlan };
