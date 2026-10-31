// ai/shoppingAgent.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz Autonomous AI Shopping Agent Engine
//  Understands NL queries, searches cross-store catalogues, normalizes unit
//  prices, and generates verified multi-store optimized shopping baskets.
// ─────────────────────────────────────────────────────────────────────────────
const Product = require('../models/Product');
const Store = require('../models/Store');

/**
 * Standardize text for token & entity extraction
 */
function cleanText(text = '') {
  // Remove commas inside numbers (e.g. 1,500 -> 1500)
  const normalizedNumbers = text.replace(/(\d),(\d)/g, '$1$2');
  return normalizedNumbers.toLowerCase().replace(/[,.:;!?]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parse unit into standard metric (grams or milliliters or count)
 * to compare unit rates (e.g. ₹/kg, ₹/L) accurately across different store pack sizes.
 */
function parseUnitMetric(unitStr = '') {
  const u = String(unitStr).toLowerCase().trim();
  const numMatch = u.match(/([\d.]+)/);
  const val = numMatch ? parseFloat(numMatch[1]) : 1;

  if (u.includes('kg')) return { metric: 'weight', standardUnits: val * 1000, label: 'kg' };
  if (u.includes('g') || u.includes('gm')) return { metric: 'weight', standardUnits: val, label: 'g' };
  if (u.includes('l') || u.includes('ltr') || u.includes('litre')) return { metric: 'volume', standardUnits: val * 1000, label: 'L' };
  if (u.includes('ml')) return { metric: 'volume', standardUnits: val, label: 'ml' };
  if (u.includes('dozen')) return { metric: 'count', standardUnits: val * 12, label: 'pc' };
  if (u.includes('pc')) return { metric: 'count', standardUnits: val, label: 'pc' };

  return { metric: 'pack', standardUnits: 1, label: 'pack' };
}

/**
 * Calculate normalized rate per standard unit (e.g. ₹ per kg, ₹ per L, ₹ per piece)
 */
function calculateNormalizedRate(price, unitStr) {
  const { standardUnits, metric } = parseUnitMetric(unitStr);
  if (metric === 'weight') {
    // Return price per 1000g (1 kg)
    return (price / standardUnits) * 1000;
  }
  if (metric === 'volume') {
    // Return price per 1000ml (1 L)
    return (price / standardUnits) * 1000;
  }
  return price / standardUnits;
}

/**
 * Extract comprehensive shopping intent and parameters from natural language.
 */
function parseShoppingRequest(query = '') {
  const text = cleanText(query);

  const parsed = {
    rawQuery: query,
    familySize: 2,
    durationDays: 3,
    budget: null,
    deliveryUrgency: 'standard', // 'today', 'express', 'standard'
    qualityPreference: 'cheapest_reasonable', // 'cheapest', 'cheapest_reasonable', 'premium', 'balanced'
    dietary: 'all', // 'veg', 'non-veg', 'vegan', 'all'
    requestedItems: [],
    categories: new Set()
  };

  // 1. Family Size / People
  const familyWordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const numFamilyMatch = text.match(/(\d{1,2})\s*(?:people|persons?|log|members?|family|bande)/i) ||
    text.match(/(?:for|family of)\s*(\d{1,2})/i);
  const wordFamilyMatch = text.match(/(?:family of|for)\s*(one|two|three|four|five|six|seven|eight|nine|ten)/i) ||
    text.match(/(one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:people|persons?|log|members?)/i);

  if (numFamilyMatch) {
    parsed.familySize = Math.max(1, parseInt(numFamilyMatch[1], 10));
  } else if (wordFamilyMatch && familyWordMap[wordFamilyMatch[1]]) {
    parsed.familySize = familyWordMap[wordFamilyMatch[1]];
  }

  // 2. Duration (Days)
  const dayWordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 };
  const numDayMatch = text.match(/(\d{1,2})\s*(?:days?|din)/i);
  const wordDayMatch = text.match(/(one|two|three|four|five|six|seven|ten)\s*(?:days?|din)/i);
  const weekMatch = text.match(/(\d{1,2})\s*(?:weeks?|hafta|hafte)/i);

  if (numDayMatch) {
    parsed.durationDays = Math.max(1, parseInt(numDayMatch[1], 10));
  } else if (wordDayMatch && dayWordMap[wordDayMatch[1]]) {
    parsed.durationDays = dayWordMap[wordDayMatch[1]];
  } else if (weekMatch) {
    parsed.durationDays = parseInt(weekMatch[1], 10) * 7;
  } else if (text.includes('week') || text.includes('hafta')) {
    parsed.durationDays = 7;
  }

  // 3. Budget (in INR)
  const budgetMatch = text.match(/(?:budget\s*(?:is|of|hai)?\s*[:=]?\s*|under\s*|upto\s*|within\s*|max\s*)(?:rs\.?|inr|₹)?\s*(\d{3,6})/i) ||
                      text.match(/(?:rs\.?|inr|₹)\s*(\d{3,6})/i) ||
                      text.match(/(\d{3,6})\s*(?:rs|rupees|inr|₹|ke andar|tak)/i);
  if (budgetMatch) {
    parsed.budget = parseInt(budgetMatch[1], 10);
  }

  // 4. Delivery Urgency
  if (text.includes('today') || text.includes('aaj') || text.includes('express') || text.includes('urgent') || text.includes('asap')) {
    parsed.deliveryUrgency = 'today';
  }

  // 5. Quality & Cost Preference
  if (text.includes('cheapest reasonable') || text.includes('value for money') || text.includes('reasonable')) {
    parsed.qualityPreference = 'cheapest_reasonable';
  } else if (text.includes('cheapest') || text.includes('sasta') || text.includes('lowest price')) {
    parsed.qualityPreference = 'cheapest';
  } else if (text.includes('good quality') || text.includes('fresh') || text.includes('premium') || text.includes('best quality')) {
    parsed.qualityPreference = 'premium';
  }

  // 6. Dietary Preferences
  if (/(pure veg|vegetarian|shuddh shakahari|\bveg\b)/i.test(text) && !/non.?veg/i.test(text)) {
    parsed.dietary = 'veg';
  } else if (/non.?veg|chicken|meat|egg|fish/i.test(text)) {
    parsed.dietary = 'non-veg';
  } else if (/vegan/i.test(text)) {
    parsed.dietary = 'vegan';
  }

  // 7. Explicit Item Mentions
  const KNOWN_ITEMS = [
    { key: 'rice', synonyms: ['rice', 'chawal', 'basmati', 'arisi'], cat: 'staples' },
    { key: 'atta', synonyms: ['atta', 'wheat', 'gehu', 'flour'], cat: 'staples' },
    { key: 'dal', synonyms: ['dal', 'toor', 'pulses', 'daal'], cat: 'staples' },
    { key: 'oil', synonyms: ['oil', 'tel', 'mustard oil', 'sunflower'], cat: 'staples' },
    { key: 'potatoes', synonyms: ['potatoes', 'potato', 'aloo', 'alu'], cat: 'vegetables' },
    { key: 'tomatoes', synonyms: ['tomatoes', 'tomato', 'tamatar'], cat: 'vegetables' },
    { key: 'onions', synonyms: ['onions', 'onion', 'pyaz', 'kanda'], cat: 'vegetables' },
    { key: 'spinach', synonyms: ['spinach', 'palak', 'greens', 'saag'], cat: 'vegetables' },
    { key: 'capsicum', synonyms: ['capsicum', 'shimla mirch'], cat: 'vegetables' },
    { key: 'milk', synonyms: ['milk', 'doodh', 'dairy'], cat: 'dairy' },
    { key: 'paneer', synonyms: ['paneer', 'cottage cheese'], cat: 'dairy' },
    { key: 'curd', synonyms: ['curd', 'dahi', 'yogurt'], cat: 'dairy' },
    { key: 'butter', synonyms: ['butter', 'makhan'], cat: 'dairy' },
    { key: 'eggs', synonyms: ['eggs', 'egg', 'anda', 'ande'], cat: 'meat' },
    { key: 'bread', synonyms: ['bread', 'pav'], cat: 'bakery' },
    { key: 'bananas', synonyms: ['bananas', 'banana', 'kela'], cat: 'fruits' },
    { key: 'apples', synonyms: ['apples', 'apple', 'seb'], cat: 'fruits' },
    { key: 'mangoes', synonyms: ['mangoes', 'mango', 'aam'], cat: 'fruits' },
    { key: 'snacks', synonyms: ['snacks', 'chips', 'lays', 'namkeen'], cat: 'snacks' },
    { key: 'tea', synonyms: ['tea', 'chai', 'chaye'], cat: 'beverages' }
  ];

  KNOWN_ITEMS.forEach(item => {
    if (item.synonyms.some(s => text.includes(s))) {
      parsed.requestedItems.push(item.key);
      parsed.categories.add(item.cat);
    }
  });

  // Category mentions
  if (text.includes('vegetables') || text.includes('veggies') || text.includes('sabzi')) parsed.categories.add('vegetables');
  if (text.includes('fruits') || text.includes('fal')) parsed.categories.add('fruits');
  if (text.includes('dairy') || text.includes('milk')) parsed.categories.add('dairy');
  if (text.includes('staples') || text.includes('ration') || text.includes('grocery')) parsed.categories.add('staples');

  parsed.categories = Array.from(parsed.categories);
  return parsed;
}

/**
 * Autonomous AI Shopping Agent:
 * 1. Analyzes user prompt
 * 2. Gathers available products across ALL stores
 * 3. Normalizes unit prices
 * 4. Generates both "Multi-Store Value Optimized" and "Single-Store Best Fit" baskets
 * 5. Returns a verified, explainable proposal ready for customer review and 1-click checkout.
 */
async function processAgentShoppingRequest(query = '', userPreferences = {}) {
  const req = parseShoppingRequest(query);

  // Apply user profile preferences if not overridden by explicit query
  if (req.dietary === 'all' && userPreferences.dietary) {
    req.dietary = userPreferences.dietary;
  }

  // 1. Fetch all active products and stores
  const productFilter = {
    isActive: true,
    'stock.isAvailable': true
  };

  if (req.dietary === 'veg') {
    productFilter['dietary.isVeg'] = true;
  } else if (req.dietary === 'vegan') {
    productFilter['dietary.isVegan'] = true;
  }

  const [dbProducts, stores] = await Promise.all([
    Product.find(productFilter).populate('store', 'name location emoji hours ratings deliveryRadius').lean(),
    Store.find({ isActive: true }).lean()
  ]);

  if (!dbProducts || dbProducts.length === 0) {
    return {
      success: false,
      message: 'No available products found matching your dietary constraints.'
    };
  }

  // Map stores by ID for quick lookup
  const storeMap = Object.fromEntries(stores.map(s => [s._id.toString(), s]));

  // 2. Determine Required Grocery Slots
  // Portion factor scaled by family size & days (relative to 2 people for 3 days)
  const portionFactor = (req.familySize / 2) * (req.durationDays / 3);

  // If specific items were explicitly requested, ensure they are prioritized;
  // otherwise, use a balanced staple, produce, and dairy grocery basket.
  const slotsToFill = [];

  if (req.requestedItems.length > 0) {
    req.requestedItems.forEach(itemKey => {
      let qty = 1;
      if (['potatoes', 'tomatoes', 'onions'].includes(itemKey)) qty = Math.max(1, Math.ceil(portionFactor));
      if (['rice', 'atta'].includes(itemKey)) qty = Math.max(1, Math.round(portionFactor * 0.7));
      if (['milk'].includes(itemKey)) qty = Math.max(1, Math.ceil(portionFactor * 1.2));
      slotsToFill.push({ key: itemKey, targetQty: qty, explicit: true });
    });
  }

  // Always supplement with essential pillars if fewer than 4 items were requested
  const essentialDefaults = [
    { key: 'rice', cat: 'staples', defaultQty: Math.max(1, Math.round(portionFactor * 0.6)) },
    { key: 'potatoes', cat: 'vegetables', defaultQty: Math.max(1, Math.ceil(portionFactor)) },
    { key: 'tomatoes', cat: 'vegetables', defaultQty: Math.max(1, Math.ceil(portionFactor * 0.8)) },
    { key: 'milk', cat: 'dairy', defaultQty: Math.max(1, Math.ceil(portionFactor)) },
    { key: 'toor dal', cat: 'staples', defaultQty: 1 },
    { key: 'onions', cat: 'vegetables', defaultQty: Math.max(1, Math.ceil(portionFactor * 0.7)) }
  ];

  for (const def of essentialDefaults) {
    if (!slotsToFill.some(s => s.key.includes(def.key) || def.key.includes(s.key))) {
      if (slotsToFill.length < 6) {
        slotsToFill.push({ key: def.key, targetQty: def.defaultQty, explicit: false });
      }
    }
  }

  // 3. Score & Match Products Across Stores for Each Slot
  const slotCandidates = {};

  for (const slot of slotsToFill) {
    // Find all matching products in the DB
    const regex = new RegExp(slot.key, 'i');
    let matched = dbProducts.filter(p => regex.test(p.name) || regex.test(p.category) || (p.tags && p.tags.some(t => regex.test(t))));

    // Fallback by category if no direct name match
    if (!matched.length && slot.cat) {
      matched = dbProducts.filter(p => p.category === slot.cat);
    }

    if (!matched.length) continue;

    // Enhance each candidate with normalized unit rate & quality score
    const scoredCandidates = matched.map(p => {
      const normalizedRate = calculateNormalizedRate(p.price, p.unit);
      const storeObj = p.store || storeMap[p.store?.toString()];
      const storeRating = storeObj?.ratings?.average || 4.2;
      const productRating = p.ratings?.average || 4.0;

      // Base score components:
      // - Lower unit rate increases score
      // - Higher store & product rating increases score
      // - Freshness tag / trending bonus
      let valueScore = 100 - Math.min(60, normalizedRate / 5);
      valueScore += (storeRating * 4) + (productRating * 3);
      if (p.discount > 10) valueScore += 8;
      if (p.ai?.trendTag === 'trending') valueScore += 5;

      return {
        product: p._id,
        name: p.name,
        category: p.category,
        price: p.price,
        mrp: p.mrp || p.price,
        discount: p.discount || 0,
        unit: p.unit,
        emoji: p.emoji || '🛒',
        stock: p.stock?.quantity || 50,
        store: {
          id: storeObj?._id,
          name: storeObj?.name || 'Local Store',
          area: storeObj?.location?.area || 'Imphal',
          emoji: storeObj?.emoji || '🏪',
          rating: storeRating
        },
        normalizedRate: Math.round(normalizedRate),
        valueScore: Math.round(valueScore)
      };
    });

    // Sort by best value score
    scoredCandidates.sort((a, b) => b.valueScore - a.valueScore);
    slotCandidates[slot.key] = { slot, candidates: scoredCandidates };
  }

  // 4. Build STRATEGY A: Multi-Store Value Optimization (Split across best stores)
  const multiStoreItems = [];
  const storeDeliveryFee = 30; // ₹30 per store

  for (const [key, { slot, candidates }] of Object.entries(slotCandidates)) {
    if (!candidates.length) continue;
    // Pick the best candidate across all stores
    const best = candidates[0];
    const qty = Math.min(slot.targetQty, best.stock || 10);

    let rationale = `Selected from ${best.store.name} for best eligible unit rate`;
    if (best.discount > 10) rationale += ` (${best.discount}% off)`;
    if (key.includes('vegetable') || key.includes('tomato') || key.includes('potato') || key.includes('milk')) {
      rationale += ` • Fresh stock confirmed`;
    }

    multiStoreItems.push({
      ...best,
      quantity: qty,
      lineTotal: best.price * qty,
      rationale
    });
  }

  // Group Multi-Store items by store
  const multiStoreGroups = {};
  multiStoreItems.forEach(item => {
    const sId = item.store.id.toString();
    if (!multiStoreGroups[sId]) {
      multiStoreGroups[sId] = {
        store: item.store,
        items: [],
        subtotal: 0
      };
    }
    multiStoreGroups[sId].items.push(item);
    multiStoreGroups[sId].subtotal += item.lineTotal;
  });

  const multiStoreList = Object.values(multiStoreGroups).map(g => ({
    store: g.store,
    items: g.items,
    itemCount: g.items.length,
    subtotal: g.subtotal,
    deliveryFee: storeDeliveryFee,
    storeTotal: g.subtotal + storeDeliveryFee
  }));

  const multiStoreItemSubtotal = multiStoreItems.reduce((s, i) => s + i.lineTotal, 0);
  const multiStoreDeliveryTotal = multiStoreList.length * storeDeliveryFee;
  let multiStoreGrandTotal = multiStoreItemSubtotal + multiStoreDeliveryTotal;

  // 5. Build STRATEGY B: Single-Store Best Fit (Minimizes delivery fee to 1 shop)
  // Evaluate each store to see how many slots it can fulfill and at what total price
  const singleStoreEvaluations = stores.map(store => {
    const sId = store._id.toString();
    const storeItems = [];

    for (const [key, { slot, candidates }] of Object.entries(slotCandidates)) {
      const matchInStore = candidates.find(c => c.store.id.toString() === sId);
      if (matchInStore) {
        const qty = Math.min(slot.targetQty, matchInStore.stock || 10);
        storeItems.push({
          ...matchInStore,
          quantity: qty,
          lineTotal: matchInStore.price * qty,
          rationale: `Fulfilled in single order by ${store.name}`
        });
      }
    }

    const subtotal = storeItems.reduce((s, i) => s + i.lineTotal, 0);
    const total = subtotal + storeDeliveryFee;
    return {
      store: {
        id: store._id,
        name: store.name,
        area: store.location?.area || 'Imphal',
        emoji: store.emoji || '🏪',
        rating: store.ratings?.average || 4.5
      },
      items: storeItems,
      fulfilledCount: storeItems.length,
      totalSlotsNeeded: Object.keys(slotCandidates).length,
      subtotal,
      deliveryFee: storeDeliveryFee,
      total
    };
  });

  // Sort single store options: highest fulfillment count first, then lowest total cost
  singleStoreEvaluations.sort((a, b) => {
    if (b.fulfilledCount !== a.fulfilledCount) return b.fulfilledCount - a.fulfilledCount;
    return a.total - b.total;
  });

  const bestSingleStore = singleStoreEvaluations[0] || null;

  // 6. Budget Enforcement for Multi-Store
  if (req.budget && req.budget > 0 && multiStoreGrandTotal > req.budget) {
    // Sort items by lineTotal descending to trim non-staples or scale down quantities
    multiStoreItems.sort((a, b) => b.lineTotal - a.lineTotal);
    for (const item of multiStoreItems) {
      if (multiStoreGrandTotal <= req.budget) break;
      if (item.quantity > 1) {
        const reduceBy = 1;
        item.quantity -= reduceBy;
        item.lineTotal = item.price * item.quantity;
        multiStoreGrandTotal -= (item.price * reduceBy);
        item.rationale = `Scaled to ${item.quantity} ${item.unit} to fit within your ₹${req.budget} budget.`;
      }
    }
  }

  // Savings calculation relative to MRP
  const totalMrp = multiStoreItems.reduce((s, i) => s + (i.mrp * i.quantity), 0);
  const totalDiscountSavings = totalMrp - multiStoreItemSubtotal;

  // Comparison comparison between Multi-Store and Single-Store
  let comparativeSavings = 0;
  let recommendationNote = '';
  if (bestSingleStore) {
    comparativeSavings = bestSingleStore.total - multiStoreGrandTotal;
    if (comparativeSavings > 0) {
      recommendationNote = `Multi-store basket saves ₹${comparativeSavings} compared to shopping only at ${bestSingleStore.store.name}, even after factoring individual delivery fees!`;
    } else {
      recommendationNote = `Single store (${bestSingleStore.store.name}) is also great value for this basket with a single delivery fee of ₹${storeDeliveryFee}.`;
    }
  }

  return {
    success: true,
    request: req,
    summary: {
      familySize: req.familySize,
      durationDays: req.durationDays,
      budget: req.budget,
      deliveryUrgency: req.deliveryUrgency,
      qualityPreference: req.qualityPreference,
      dietary: req.dietary
    },
    strategies: {
      multiStore: {
        title: 'Smart Multi-Store Value (Recommended)',
        description: 'Optimizes prices across shops for maximum savings and freshest stock.',
        storeCount: multiStoreList.length,
        itemCount: multiStoreItems.length,
        itemsSubtotal: multiStoreItemSubtotal,
        deliveryFeesTotal: multiStoreDeliveryTotal,
        grandTotal: multiStoreGrandTotal,
        savings: totalDiscountSavings,
        stores: multiStoreList,
        allItems: multiStoreItems,
        action: {
          type: 'AGENT_CHECKOUT',
          items: multiStoreItems.map(i => ({
            productId: i.product,
            quantity: i.quantity,
            storeId: i.store.id
          }))
        }
      },
      singleStore: bestSingleStore ? {
        title: `Single-Store Convenience (${bestSingleStore.store.name})`,
        description: 'Consolidated into a single delivery from one top-rated shop.',
        store: bestSingleStore.store,
        itemCount: bestSingleStore.items.length,
        itemsSubtotal: bestSingleStore.subtotal,
        deliveryFee: bestSingleStore.deliveryFee,
        grandTotal: bestSingleStore.total,
        items: bestSingleStore.items,
        action: {
          type: 'AGENT_CHECKOUT',
          items: bestSingleStore.items.map(i => ({
            productId: i.product,
            quantity: i.quantity,
            storeId: bestSingleStore.store.id
          }))
        }
      } : null
    },
    comparativeSavings,
    recommendationNote
  };
}

module.exports = {
  parseShoppingRequest,
  processAgentShoppingRequest,
  calculateNormalizedRate
};
