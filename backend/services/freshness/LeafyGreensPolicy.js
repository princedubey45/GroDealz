const FreshnessPolicy = require('./FreshnessPolicy');

class LeafyGreensPolicy extends FreshnessPolicy {
  evaluate(batch, latestInspection, customerFeedback) {
    const hoursSinceHarvest = this.calculateHoursSinceHarvest(batch.harvestDate);
    const score = latestInspection ? latestInspection.visualScore : 10;
    const complaints = customerFeedback ? customerFeedback.complaintRate : 0; // percentage e.g. 0.1 for 10%

    // 1. Check for high customer complaint rate
    if (complaints > 0.05) {
      return { status: 'Quality Concern', reason: 'High rate of customer quality claims reported.' };
    }

    // 2. Visual inspection failure
    if (score < 5) {
      return { status: 'Quality Concern', reason: 'Failed recent visual warehouse inspection.' };
    }

    // 3. Time-based rules specific to leafy greens
    if (hoursSinceHarvest <= 24 && score >= 9) {
      return { status: 'Very Fresh', reason: 'Harvested within the last 24 hours and passed inspection today.' };
    }
    
    if (hoursSinceHarvest <= 48 && score >= 7) {
      return { status: 'Fresh', reason: 'Harvested recently and verified in good condition.' };
    }

    if (hoursSinceHarvest > 48 && score >= 5) {
      return { status: 'Use Soon', reason: 'Best consumed within 1-2 days to maintain crispness.' };
    }

    return { status: 'Quality Concern', reason: 'Past optimal freshness window for leafy greens.' };
  }
}

module.exports = LeafyGreensPolicy;
