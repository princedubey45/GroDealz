// ai/intentExtractor.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz AI Engine - Hinglish + English NLP Intent & Entity Extractor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract structured intents, numerical parameters, dietary constraints,
 * and explicit shopping goals from English and Hinglish queries.
 */
function extractIntentAndEntities(query = '') {
  const text = query.trim().toLowerCase();
  
  const result = {
    rawQuery: query,
    intent: 'general',
    familySize: 2,         // default family size
    durationDays: 3,       // default duration in days
    budget: null,          // budget target in INR
    dietary: 'all',        // veg, non-veg, vegan, etc.
    shoppingGoal: 'weekly_grocery', // explicit shopping goal
    extractedKeywords: []
  };

  // 1. INTENT DETERMINATION
  if (/(plan|grocery plan|chahiye|khana plan|ration|bana do|shopping plan)/i.test(text) || /(people|log|din|days)/i.test(text)) {
    result.intent = 'shopping_plan';
  } else if (/(optimize|budget optimize|kam karo|reduce price|sasta|under budget)/i.test(text)) {
    result.intent = 'cart_optimize';
  } else if (/(missing|recipe|complete cart|complete basket|kya baki hai)/i.test(text)) {
    result.intent = 'basket_completion';
  } else if (/(weekly|recurring|refill|har hafte|repeat order|khatam hone wala)/i.test(text)) {
    result.intent = 'recurring_plan';
  } else if (/(compare|store compare|cheapest store|kahan sasta)/i.test(text)) {
    result.intent = 'price_compare';
  } else if (/(search|find|dikhao|healthy|breakfast|snack|dinner|party)/i.test(text)) {
    result.intent = 'product_search';
  }

  // 2. BUDGET EXTRACTION
  // Matches: "under 1000", "under ₹1000", "rs 500", "budget 1500", "1000 me", "1000 ke andar"
  const budgetMatch = text.match(/(?:under|budget|rs\.?|inr|₹|approx|\bme\b|\bke andar\b)\s*(\d{3,6})/i) ||
                      text.match(/(\d{3,6})\s*(?:rs|rupees|inr|₹|\bme\b|\bke andar\b)/i);
  if (budgetMatch) {
    result.budget = parseInt(budgetMatch[1], 10);
  }

  // 3. FAMILY SIZE / PEOPLE EXTRACTION
  // Matches: "4 people", "4 log", "for 4", "family of 5", "3 persons", "1 person"
  const familyMatch = text.match(/(\d{1,2})\s*(?:people|persons|log|members|family|person|bande)/i) ||
                      text.match(/(?:for|family of)\s*(\d{1,2})/i);
  if (familyMatch) {
    result.familySize = Math.max(1, parseInt(familyMatch[1], 10));
  }

  // 4. DURATION (DAYS) EXTRACTION
  // Matches: "3 days", "3 din", "1 week" (7), "2 weeks" (14), "1 month" (30)
  const monthMatch = text.match(/(\d{1,2})\s*(?:month|mahine|maheena)/i);
  const weekMatch  = text.match(/(\d{1,2})\s*(?:week|hafta|hafte)/i);
  const dayMatch   = text.match(/(\d{1,2})\s*(?:days?|din)/i);

  if (monthMatch) {
    result.durationDays = parseInt(monthMatch[1], 10) * 30;
  } else if (weekMatch) {
    result.durationDays = parseInt(weekMatch[1], 10) * 7;
  } else if (dayMatch) {
    result.durationDays = Math.max(1, parseInt(dayMatch[1], 10));
  } else if (/weekly|har hafte/i.test(text)) {
    result.durationDays = 7;
  }

  // 5. DIETARY PREFERENCE EXTRACTION
  if (/pure veg|vegetarian|shuddh shakahari|\bveg\b/i.test(text) && !/non.?veg/i.test(text)) {
    result.dietary = 'veg';
  } else if (/non.?veg|egg|chicken|fish|meat/i.test(text)) {
    result.dietary = 'non-veg';
  } else if (/vegan/i.test(text)) {
    result.dietary = 'vegan';
  }

  // 6. EXPLICIT SHOPPING GOAL UNDERSTANDING
  if (/party|celebration|mehman|guests|snacks/i.test(text)) {
    result.shoppingGoal = 'party';
  } else if (/healthy|weight loss|gym|fitness|diet|protein/i.test(text)) {
    result.shoppingGoal = 'healthy_shopping';
  } else if (/cheap|sasta|budget|saving|save money|under/i.test(text)) {
    result.shoppingGoal = 'budget_shopping';
  } else if (/quick|fast|instant|5 min|ready to eat|jald bazi/i.test(text)) {
    result.shoppingGoal = 'quick_meal';
  } else if (/weekly|hafta|refill|recurring|monthly/i.test(text)) {
    result.shoppingGoal = 'weekly_grocery';
  } else if (/meal prep|recipe|dinner plan|lunch plan|nashta|breakfast/i.test(text)) {
    result.shoppingGoal = 'meal_preparation';
  } else if (/replenish|khatam|refill/i.test(text)) {
    result.shoppingGoal = 'replenishment';
  } else if (result.familySize >= 3) {
    result.shoppingGoal = 'family_shopping';
  }

  return result;
}

module.exports = { extractIntentAndEntities };
