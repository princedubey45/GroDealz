/**
 * Base class for Freshness Policies.
 * Follows the Open/Closed Principle. To support a new product category, 
 * implement a new policy that extends this class rather than modifying the engine.
 */
class FreshnessPolicy {
  /**
   * Evaluates the freshness state of a batch.
   * @param {Object} batch - The InventoryBatch document
   * @param {Object} latestInspection - The most recent BatchInspection document
   * @param {Object} customerFeedback - Aggregated recent claims data
   * @returns {Object} { status: 'Very Fresh' | 'Fresh' | 'Use Soon' | 'Quality Concern', reason: String }
   */
  evaluate(batch, latestInspection, customerFeedback) {
    throw new Error('evaluate() must be implemented by the specific category policy.');
  }

  calculateHoursSinceHarvest(harvestDate) {
    return (Date.now() - new Date(harvestDate).getTime()) / (1000 * 60 * 60);
  }
}

module.exports = FreshnessPolicy;
