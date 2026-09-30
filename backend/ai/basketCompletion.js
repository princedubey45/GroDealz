// ai/basketCompletion.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz Data-Driven Basket Completion Engine
// ─────────────────────────────────────────────────────────────────────────────
const Product = require('../models/Product');

// Data-driven recipe / item association dictionary
const RECIPE_COMPLETION_MAP = {
  pasta: ['capsicum', 'tomatoes', 'paneer'],
  tea: ['full cream milk', 'biscuits pack'],
  bread: ['butter', 'full cream milk'],
  rice: ['toor dal', 'mustard oil', 'ghee'],
  atta: ['toor dal', 'potatoes', 'paneer'],
  tomatoes: ['onions', 'potatoes'],
  eggs: ['bread loaf', 'butter'],
  bananas: ['apples', 'full cream milk']
};

/**
 * Analyze items in current cart and return missing related recipe/co-purchased products.
 */
async function getBasketCompletions(cartItems = []) {
  if (!cartItems || cartItems.length === 0) {
    return { suggestions: [], missingRecipePairs: [] };
  }

  // Extract cart product names lowercased
  const cartProductNames = cartItems.map(item => {
    const name = typeof item.product === 'object' ? item.product.name : item.name || '';
    return name.toLowerCase();
  });

  const cartProductIds = cartItems.map(item => {
    return typeof item.product === 'object' ? item.product._id.toString() : item.product?.toString() || '';
  });

  const missingTargets = new Set();
  const rationaleMap = {};

  // Check each cart item against recipe dictionary
  for (const cartName of cartProductNames) {
    for (const [triggerKeyword, targetItems] of Object.entries(RECIPE_COMPLETION_MAP)) {
      if (cartName.includes(triggerKeyword)) {
        for (const target of targetItems) {
          // If target item is not already in cart, flag as missing
          const alreadyInCart = cartProductNames.some(cn => cn.includes(target));
          if (!alreadyInCart) {
            missingTargets.add(target);
            rationaleMap[target] = `Completes your recipe with ${cartName.split(' ')[0]}`;
          }
        }
      }
    }
  }

  if (missingTargets.size === 0) {
    // Fallback co-purchase rules (e.g., if buying veggies, suggest dairy/staples)
    missingTargets.add('full cream milk');
    rationaleMap['full cream milk'] = 'Popular daily essential frequently bought together';
  }

  // Query DB for missing products
  const regexArray = Array.from(missingTargets).map(t => new RegExp(t, 'i'));
  const recommendedProducts = await Product.find({
    isActive: true,
    'stock.isAvailable': true,
    _id: { $nin: cartProductIds },
    $or: regexArray.map(rgx => ({ name: rgx }))
  }).limit(4).lean();

  const suggestions = recommendedProducts.map(p => {
    // Find matching rationale
    const matchedKey = Object.keys(rationaleMap).find(k => p.name.toLowerCase().includes(k));
    return {
      _id: p._id,
      name: p.name,
      category: p.category,
      price: p.price,
      mrp: p.mrp || p.price,
      unit: p.unit,
      emoji: p.emoji || '🛒',
      rationale: rationaleMap[matchedKey] || 'Frequently purchased together'
    };
  });

  return {
    missingCount: suggestions.length,
    suggestions
  };
}

module.exports = { getBasketCompletions, RECIPE_COMPLETION_MAP };
