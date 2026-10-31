// services/rfqParser.js
// ─────────────────────────────────────────────────────────────────────────────
// Natural Language Parser for Customer Custom Requirements / RFQs
// ─────────────────────────────────────────────────────────────────────────────

function cleanText(text = '') {
  const normalizedNumbers = text.replace(/(\d),(\d)/g, '$1$2');
  return normalizedNumbers.toLowerCase().replace(/[,.:;!?]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parses user requirements in plain English/Hinglish into structured RFQ items,
 * target budget, and delivery deadline.
 */
function parseCustomerRequirement(query = '') {
  const text = cleanText(query);

  const result = {
    title: '',
    items: [],
    budget: null,
    deliveryDays: 2,
    deliveryDeadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    preferredBrand: '',
    notes: query
  };

  const normalizedQuery = query.replace(/(\d),(\d)/g, '$1$2');

  // 1. Extract Target Budget
  const budgetMatch = normalizedQuery.match(/(?:budget\s*(?:is|of|hai)?\s*[:=]?\s*|under\s*|upto\s*|within\s*|max\s*)(?:rs\.?|inr|₹)?\s*(\d{2,7})/i) ||
                      normalizedQuery.match(/(?:rs\.?|inr|₹)\s*(\d{2,7})/i) ||
                      normalizedQuery.match(/(\d{2,7})\s*(?:rs|rupees|inr|₹|ke andar|tak)/i);
  if (budgetMatch) {
    result.budget = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
  }

  // 2. Extract Delivery Deadline / Duration (Days)
  const daysMatch = text.match(/within\s*(\d{1,2})\s*days?/i) ||
                    text.match(/(\d{1,2})\s*days?/i) ||
                    text.match(/in\s*(\d{1,2})\s*days?/i) ||
                    text.match(/(\d{1,2})\s*din/i);

  if (text.includes('today') || text.includes('aaj') || text.includes('urgent') || text.includes('asap')) {
    result.deliveryDays = 1;
  } else if (text.includes('tomorrow') || text.includes('kal')) {
    result.deliveryDays = 1;
  } else if (daysMatch) {
    result.deliveryDays = Math.max(1, parseInt(daysMatch[1], 10));
  } else if (text.includes('two days') || text.includes('2 days')) {
    result.deliveryDays = 2;
  } else if (text.includes('week') || text.includes('hafta')) {
    result.deliveryDays = 7;
  }

  result.deliveryDeadline = new Date(Date.now() + result.deliveryDays * 24 * 60 * 60 * 1000);

  // 3. Extract Items, Quantities, and Units
  // Regex pattern matching: <number> <unit> <product_name> or <product_name> <number> <unit>
  // e.g. "25 kg basmati rice", "2 litre mustard oil", "10kg atta", "500g tomatoes"
  const itemPattern = /(\d+(?:\.\d+)?)\s*(kg|g|gm|grams?|kilo|litres?|liter|ltr|l|ml|pack|packs|packets?|dozen|pcs?|pieces?)\s+([a-zA-Z\s]+?)(?=\s+(?:for|within|in|under|budget|my|delivery|with|and|,|\.|$))/gi;
  
  let match;
  while ((match = itemPattern.exec(query)) !== null) {
    const qty = parseFloat(match[1]);
    let unit = match[2].toLowerCase();
    if (['kilo', 'kilogram', 'kilograms'].includes(unit)) unit = 'kg';
    if (['g', 'gm', 'gram', 'grams'].includes(unit)) unit = 'g';
    if (['litre', 'liter', 'ltr', 'litres'].includes(unit)) unit = 'L';
    if (['pieces', 'piece', 'pcs'].includes(unit)) unit = 'pc';

    let name = match[3].trim();
    // Clean up trailing conjunctions
    name = name.replace(/\b(and|with|for|under)\b.*$/i, '').trim();

    if (name.length > 1) {
      result.items.push({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        quantity: qty,
        unit,
        preferredBrand: '',
        qualityGrade: '',
        notes: ''
      });
    }
  }

  // Fallback: If no regex pattern matched, extract common grocery staples
  if (result.items.length === 0) {
    const knownStaples = [
      { key: 'basmati rice', name: 'Basmati Rice', defaultQty: 25, unit: 'kg' },
      { key: 'rice', name: 'Rice', defaultQty: 10, unit: 'kg' },
      { key: 'atta', name: 'Atta (Wheat)', defaultQty: 10, unit: 'kg' },
      { key: 'toor dal', name: 'Toor Dal', defaultQty: 2, unit: 'kg' },
      { key: 'dal', name: 'Pulses / Dal', defaultQty: 2, unit: 'kg' },
      { key: 'mustard oil', name: 'Mustard Oil', defaultQty: 2, unit: 'L' },
      { key: 'oil', name: 'Cooking Oil', defaultQty: 2, unit: 'L' },
      { key: 'milk', name: 'Milk', defaultQty: 2, unit: 'L' },
      { key: 'potatoes', name: 'Potatoes', defaultQty: 5, unit: 'kg' },
      { key: 'tomatoes', name: 'Tomatoes', defaultQty: 2, unit: 'kg' },
      { key: 'onions', name: 'Onions', defaultQty: 5, unit: 'kg' },
      { key: 'sugar', name: 'Sugar', defaultQty: 5, unit: 'kg' }
    ];

    for (const staple of knownStaples) {
      if (text.includes(staple.key)) {
        // Look for preceding number
        const numRegex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:kg|g|l|ltr|litre|pack)?\\s*${staple.key}`, 'i');
        const numMatch = query.match(numRegex);
        const qty = numMatch ? parseFloat(numMatch[1]) : staple.defaultQty;

        result.items.push({
          name: staple.name,
          quantity: qty,
          unit: staple.unit,
          preferredBrand: '',
          qualityGrade: '',
          notes: ''
        });
        break;
      }
    }
  }

  // Fallback default if still empty
  if (result.items.length === 0) {
    result.items.push({
      name: query.slice(0, 40).trim() || 'Custom Grocery Requirement',
      quantity: 1,
      unit: 'pack',
      preferredBrand: '',
      qualityGrade: '',
      notes: ''
    });
  }

  // Generate Title
  if (result.items.length > 0) {
    const primary = result.items[0];
    result.title = `${primary.quantity} ${primary.unit} ${primary.name}`;
    if (result.items.length > 1) {
      result.title += ` + ${result.items.length - 1} more item${result.items.length > 2 ? 's' : ''}`;
    }
  } else {
    result.title = 'Custom Grocery Request';
  }

  return result;
}

module.exports = {
  parseCustomerRequirement
};
