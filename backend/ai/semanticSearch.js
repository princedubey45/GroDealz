// ai/semanticSearch.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz AI Semantic Product Search Engine
// ─────────────────────────────────────────────────────────────────────────────
const Product = require('../models/Product');

// Concept mapping dictionary for English & Hinglish
const CONCEPT_MAP = {
  breakfast: ['milk', 'bread', 'butter', 'bananas', 'eggs', 'curd'],
  nashta: ['milk', 'bread', 'butter', 'bananas', 'eggs', 'curd'],
  healthy: ['bananas', 'apples', 'spinach', 'milk', 'curd', 'toor dal'],
  gym: ['eggs', 'full cream milk', 'paneer', 'bananas'],
  protein: ['paneer', 'eggs', 'toor dal', 'full cream milk'],
  dinner: ['basmati rice', 'atta', 'toor dal', 'paneer', 'tomatoes', 'onions'],
  khana: ['basmati rice', 'atta', 'toor dal', 'paneer', 'tomatoes', 'onions'],
  snacks: ['lays classic', 'biscuits pack', 'amul lassi'],
  chaye: ['full cream milk', 'biscuits pack'],
  tea: ['full cream milk', 'biscuits pack'],
  quick: ['bread loaf', 'lays classic', 'amul lassi', 'eggs']
};

/**
 * Perform semantic search by extracting concepts and querying MongoDB.
 */
async function semanticProductSearch(queryText = '') {
  const query = queryText.toLowerCase().trim();
  if (!query) {
    return { results: [], conceptDetected: null };
  }

  // 1. Check for concept matches
  const matchedKeywords = new Set();
  let matchedConceptLabel = null;

  for (const [concept, keywords] of Object.entries(CONCEPT_MAP)) {
    if (query.includes(concept)) {
      matchedConceptLabel = concept;
      keywords.forEach(kw => matchedKeywords.add(kw));
    }
  }

  // 2. Build DB query
  let dbQuery = { isActive: true, 'stock.isAvailable': true };

  if (matchedKeywords.size > 0) {
    const regexArray = Array.from(matchedKeywords).map(kw => new RegExp(kw, 'i'));
    dbQuery.$or = [
      { name: { $in: regexArray } },
      { category: { $in: regexArray } },
      { tags: { $in: regexArray } }
    ];
  } else {
    // Standard text or regex search fallback
    dbQuery.$or = [
      { name: { $regex: query, $options: 'i' } },
      { category: { $regex: query, $options: 'i' } },
      { tags: { $regex: query, $options: 'i' } }
    ];
  }

  const products = await Product.find(dbQuery).limit(10).lean();

  const results = products.map(p => ({
    ...p,
    aiExplanation: matchedConceptLabel
      ? `Matches "${queryText}" concept as a top ${matchedConceptLabel} choice.`
      : `Matched by name/category search.`
  }));

  return {
    query: queryText,
    conceptDetected: matchedConceptLabel,
    totalResults: results.length,
    results
  };
}

module.exports = { semanticProductSearch };
