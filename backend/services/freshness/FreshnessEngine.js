const LeafyGreensPolicy = require('./LeafyGreensPolicy');
// Note: Other policies like DairyPolicy, FruitsPolicy would be imported here

/**
 * FreshnessEngine calculates the current freshness state of an inventory batch.
 * It uses the Strategy Pattern (OCP) to delegate category-specific rules to individual policies.
 */
class FreshnessEngine {
  constructor() {
    // Registry of policies mapped to Product Categories
    this.policies = {
      'Vegetables-Leafy': new LeafyGreensPolicy(),
      // 'Dairy': new DairyPolicy(),
      // 'Fruits': new FruitsPolicy(),
    };
  }

  /**
   * Determine the freshness status of a batch
   * @param {Object} batch - The InventoryBatch document
   * @param {Object} productCategory - The category string from the Product
   * @param {Object} latestInspection - The latest BatchInspection document
   * @param {Object} customerFeedback - Aggregated data from QualityClaims
   */
  assessFreshness(batch, productCategory, latestInspection, customerFeedback = { complaintRate: 0 }) {
    const policy = this.policies[productCategory];
    
    if (!policy) {
      // Fallback to a default policy if category isn't explicitly defined
      return { status: 'Fresh', reason: 'Standard quality checks passed.' };
    }

    return policy.evaluate(batch, latestInspection, customerFeedback);
  }
}

module.exports = new FreshnessEngine();
