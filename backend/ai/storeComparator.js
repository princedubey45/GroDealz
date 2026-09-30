// ai/storeComparator.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz Intelligent Store & Product Comparison Engine
// ─────────────────────────────────────────────────────────────────────────────
const Product = require('../models/Product');
const Store   = require('../models/Store');

/**
 * Compare price, unit cost, and stock availability across stores for a given product or basket.
 */
async function compareStorePrices(productName = '') {
  if (!productName) {
    return { success: false, message: 'Product name required' };
  }

  const products = await Product.find({
    name: { $regex: productName, $options: 'i' },
    isActive: true
  }).populate('store', 'name location emoji hours rating').lean();

  if (!products || products.length === 0) {
    return { success: false, message: `No active products found matching "${productName}"` };
  }

  const comparisons = products.map(p => ({
    productId: p._id,
    productName: p.name,
    price: p.price,
    mrp: p.mrp || p.price,
    discount: p.discount || 0,
    unit: p.unit,
    stock: p.stock?.quantity || 0,
    isAvailable: p.stock?.isAvailable && (p.stock?.quantity > 0),
    store: {
      id: p.store?._id,
      name: p.store?.name || 'Local Store',
      area: p.store?.location?.area || 'Imphal',
      emoji: p.store?.emoji || '🏪'
    },
    valueScore: Math.round((p.discount * 1.5) + (p.ratings?.average ? p.ratings.average * 10 : 40))
  }));

  // Sort by lowest price first
  comparisons.sort((a, b) => a.price - b.price);

  const bestValue = comparisons[0];

  return {
    success: true,
    query: productName,
    totalStoresCompared: comparisons.length,
    bestValueStore: bestValue?.store?.name,
    lowestPrice: bestValue?.price,
    savingsText: bestValue?.discount > 0 ? `Save ${bestValue.discount}% at ${bestValue.store.name}` : 'Best price available',
    comparisons
  };
}

module.exports = { compareStorePrices };
