// ai/recommendationEngine.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz AI Recommendation Engine
//  Implements:
//    1. Collaborative Filtering  – user-item interaction matrix
//    2. Content-Based Filtering  – product feature vectors
//    3. Context-Aware Scoring    – time of day, dietary prefs, location
// ─────────────────────────────────────────────────────────────────────────────
const User    = require('../models/User');
const Product = require('../models/Product');
const Order   = require('../models/Order');

// ─── COSINE SIMILARITY ───────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  const dot   = a.reduce((s, v, i) => s + v * b[i], 0);
  const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

// ─── BUILD FEATURE VECTOR ────────────────────────────────────────────────────
// Dimensions: [price_norm, isVeg, isVegan, popularity, demandScore, ...categoryOHE]
const CATEGORIES = ['fruits','vegetables','dairy','snacks','beverages','staples','bakery','meat','personal_care','household'];

function buildFeatureVector(product) {
  const price_norm     = Math.min(product.price / 1000, 1);
  const isVeg          = product.dietary?.isVeg ? 1 : 0;
  const isVegan        = product.dietary?.isVegan ? 1 : 0;
  const popularity     = Math.min((product.orderCount || 0) / 500, 1);
  const demandScore    = (product.ai?.demandScore || 50) / 100;
  const discount_norm  = (product.discount || 0) / 100;

  const categoryOHE = CATEGORIES.map(c =>
    (product.category?.toLowerCase() === c || product.subcategory?.toLowerCase() === c) ? 1 : 0
  );

  return [price_norm, isVeg, isVegan, popularity, demandScore, discount_norm, ...categoryOHE];
}

// ─── COLLABORATIVE FILTERING ─────────────────────────────────────────────────
async function collaborativeFiltering(userId, limit = 10) {
  try {
    const targetUser = await User.findById(userId).lean();
    if (!targetUser) return [];

    const targetInteractions = targetUser.profile?.itemInteractions || [];
    if (!targetInteractions.length) return [];

    // Build target user vector: productId → score
    const targetVector = {};
    targetInteractions.forEach(i => { targetVector[i.productId.toString()] = i.score; });

    // Find similar users (all users who have interactions)
    const allUsers = await User.find({
      _id: { $ne: userId },
      'profile.itemInteractions.0': { $exists: true }
    }).lean().limit(200);

    // Compute similarity scores between target and all other users
    const userSimilarities = allUsers.map(u => {
      const uVector = {};
      (u.profile?.itemInteractions || []).forEach(i => { uVector[i.productId.toString()] = i.score; });

      // Build common key space
      const allKeys = [...new Set([...Object.keys(targetVector), ...Object.keys(uVector)])];
      const v1 = allKeys.map(k => targetVector[k] || 0);
      const v2 = allKeys.map(k => uVector[k] || 0);

      return { user: u, similarity: cosineSimilarity(v1, v2), vector: uVector };
    }).filter(x => x.similarity > 0.1).sort((a, b) => b.similarity - a.similarity).slice(0, 20);

    if (!userSimilarities.length) return [];

    // Weighted sum of item scores from similar users
    const itemScores = {};
    const itemWeights = {};

    userSimilarities.forEach(({ user: u, similarity, vector }) => {
      Object.entries(vector).forEach(([productId, score]) => {
        if (!targetVector[productId]) { // Only unseen items
          itemScores[productId]  = (itemScores[productId]  || 0) + score * similarity;
          itemWeights[productId] = (itemWeights[productId] || 0) + similarity;
        }
      });
    });

    // Normalize
    const ranked = Object.entries(itemScores)
      .map(([productId, score]) => ({ productId, score: score / (itemWeights[productId] || 1) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const productIds = ranked.map(r => r.productId);
    const products   = await Product.find({ _id: { $in: productIds }, isActive: true }).lean();

    return products.map(p => ({
      ...p,
      _recommendType: 'collaborative',
      _score: ranked.find(r => r.productId === p._id.toString())?.score || 0
    }));

  } catch (err) {
    console.error('Collaborative filtering error:', err.message);
    return [];
  }
}

// ─── CONTENT-BASED FILTERING ─────────────────────────────────────────────────
async function contentBasedFiltering(userId, limit = 10) {
  try {
    const user = await User.findById(userId).lean();
    if (!user) return [];

    const interactions = user.profile?.itemInteractions || [];
    if (!interactions.length) return [];

    // Get user's interacted products
    const interactedIds   = interactions.map(i => i.productId);
    const interactedProds = await Product.find({ _id: { $in: interactedIds } }).lean();

    // Build user profile vector (weighted average of liked products)
    const totalScore = interactions.reduce((s, i) => s + i.score, 0);
    const userProfileVec = interactedProds.reduce((acc, prod) => {
      const interaction = interactions.find(i => i.productId.toString() === prod._id.toString());
      const weight = (interaction?.score || 1) / totalScore;
      const vec    = buildFeatureVector(prod);
      return acc.map((v, i) => v + vec[i] * weight);
    }, new Array(CATEGORIES.length + 6).fill(0));

    // Get all available products (excluding already interacted)
    const allProducts = await Product.find({
      _id: { $nin: interactedIds },
      isActive: true
    }).lean().limit(500);

    // Score each product by similarity to user profile
    const scored = allProducts.map(p => ({
      product: p,
      score:   cosineSimilarity(userProfileVec, buildFeatureVector(p))
    })).sort((a, b) => b.score - a.score).slice(0, limit);

    return scored.map(({ product, score }) => ({
      ...product,
      _recommendType: 'content-based',
      _score: score
    }));

  } catch (err) {
    console.error('Content-based filtering error:', err.message);
    return [];
  }
}

// ─── CONTEXT-AWARE SCORING ───────────────────────────────────────────────────
function contextAwareScore(product, context) {
  let bonus = 0;

  // Time of day bonus
  const hour = context.hour ?? new Date().getHours();
  const peaks = product.ai?.seasonalPeaks || [];
  if (peaks.includes(hour)) bonus += 0.15;

  // Morning boost for dairy/bakery
  if (hour >= 6 && hour <= 10 && ['dairy','bakery'].includes(product.category)) bonus += 0.1;
  // Afternoon snacks
  if (hour >= 14 && hour <= 17 && product.category === 'snacks') bonus += 0.1;
  // Evening dinner items
  if (hour >= 18 && hour <= 21 && ['vegetables','staples','meat'].includes(product.category)) bonus += 0.12;

  // Dietary preference match
  if (context.dietary === 'veg' && product.dietary?.isVeg)    bonus += 0.1;
  if (context.dietary === 'vegan' && product.dietary?.isVegan) bonus += 0.15;

  // Trending products
  if (product.ai?.trendTag === 'trending') bonus += 0.1;

  // Discount appeal
  if (product.discount >= 20) bonus += 0.05;

  return bonus;
}

// ─── MAIN RECOMMENDATION FUNCTION ────────────────────────────────────────────
async function getRecommendations(userId, options = {}) {
  const { limit = 20, strategy = 'hybrid', context = {} } = options;
  const hour    = context.hour    ?? new Date().getHours();
  const dietary = context.dietary ?? 'all';

  try {
    let recommendations = [];

    if (strategy === 'collaborative' || strategy === 'hybrid') {
      const collab = await collaborativeFiltering(userId, 15);
      recommendations.push(...collab);
    }

    if (strategy === 'content' || strategy === 'hybrid') {
      const content = await contentBasedFiltering(userId, 15);
      // Deduplicate
      const existingIds = new Set(recommendations.map(r => r._id.toString()));
      recommendations.push(...content.filter(p => !existingIds.has(p._id.toString())));
    }

    // Fallback: popular products if no recommendations
    if (recommendations.length < 5) {
      const popular = await Product.find({ isActive: true })
        .sort({ orderCount: -1, 'ratings.average': -1 })
        .limit(20).lean();
      const existingIds = new Set(recommendations.map(r => r._id.toString()));
      recommendations.push(...popular.filter(p => !existingIds.has(p._id.toString()))
        .map(p => ({ ...p, _recommendType: 'popular', _score: 0.3 })));
    }

    // Apply context-aware scoring
    recommendations = recommendations.map(p => ({
      ...p,
      _finalScore: (p._score || 0.3) + contextAwareScore(p, { hour, dietary })
    }));

    // Sort by final score
    recommendations.sort((a, b) => b._finalScore - a._finalScore);

    return recommendations.slice(0, limit);

  } catch (err) {
    console.error('Recommendation error:', err.message);
    return [];
  }
}

// ─── UPDATE USER INTERACTIONS ─────────────────────────────────────────────────
async function recordInteraction(userId, productId, action) {
  const scoreMap = { view: 1, cart: 3, purchase: 5, wishlist: 2 };
  const score    = scoreMap[action] || 1;

  try {
    const user = await User.findById(userId);
    if (!user) return;

    const existing = user.profile.itemInteractions.find(
      i => i.productId.toString() === productId.toString()
    );

    if (existing) {
      existing.score = Math.min(existing.score + score, 10);
      existing.updatedAt = new Date();
    } else {
      user.profile.itemInteractions.push({ productId, score, updatedAt: new Date() });
    }

    // Keep only top 200 interactions
    if (user.profile.itemInteractions.length > 200) {
      user.profile.itemInteractions.sort((a, b) => b.score - a.score);
      user.profile.itemInteractions = user.profile.itemInteractions.slice(0, 200);
    }

    await user.save();
  } catch (err) {
    console.error('recordInteraction error:', err.message);
  }
}

module.exports = { getRecommendations, recordInteraction, buildFeatureVector };
