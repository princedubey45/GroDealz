// ai/aiExplainer.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz AI Explainer - Generates human-readable rationales
// ─────────────────────────────────────────────────────────────────────────────

function generateExplanation(product, context = {}) {
  const { familySize, durationDays, budget, shoppingGoal } = context;
  const reasons = [];

  // Goal / Category contextual reasons
  if (product.category === 'staples') {
    reasons.push(`Essential staple item for ${familySize || 2}-person household`);
  } else if (product.category === 'vegetables') {
    reasons.push('Fresh daily produce item for healthy cooking');
  } else if (product.category === 'dairy') {
    reasons.push('Core daily essential');
  }

  // Price & Budget context
  if (product.discount && product.discount > 10) {
    reasons.push(`Great value with ${product.discount}% discount`);
  } else if (budget && product.price <= budget * 0.15) {
    reasons.push(`Budget-friendly item (₹${product.price})`);
  }

  // Shopping goal context
  if (shoppingGoal === 'healthy_shopping' && product.dietary?.isVeg) {
    reasons.push('Matches your healthy nutrition goal');
  } else if (shoppingGoal === 'budget_shopping') {
    reasons.push('Optimized for cost savings');
  }

  // Popularity / Demand tag
  if (product.orderCount > 300) {
    reasons.push('Top seller among local shoppers');
  } else if (product.ai?.trendTag === 'trending') {
    reasons.push('Currently trending in your area');
  }

  if (reasons.length === 0) {
    return `Recommended based on your ${shoppingGoal || 'grocery'} preferences and current stock.`;
  }

  return reasons.slice(0, 2).join(' • ');
}

module.exports = { generateExplanation };
