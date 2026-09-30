/**
 * ClaimEvaluator determines how a QualityClaim should be resolved.
 * It strictly separates the business process of claims from standard product reviews.
 */
class ClaimEvaluator {
  /**
   * Evaluates a claim based on order validity, evidence, and customer history.
   * @param {Object} claim - The QualityClaim document
   * @param {Object} customerProfile - The User document including claim history stats
   * @returns {Object} Resolution strategy e.g. { action: 'Instant Refund', requireManual: false }
   */
  evaluate(claim, customerProfile) {
    const isSmallClaim = claim.claimAmount < 150; // Threshold for instant resolution
    const hasEvidence = claim.evidencePhotos && claim.evidencePhotos.length > 0;
    const isGoodCustomer = customerProfile.claimRate < 0.05; // Less than 5% of orders have claims

    // 1. Fast-track small, clear claims for trusted customers
    if (isSmallClaim && isGoodCustomer) {
      if (claim.issueType === 'Spoiled' || claim.issueType === 'Bruised') {
        // Even without photos, if it's a small amount and a trusted customer, instant refund.
        return { action: 'Wallet Credit', requireManual: false, reason: 'Trusted customer fast-track.' };
      }
    }

    // 2. High severity requires manual review if no photo evidence
    if (claim.issueType === 'Spoiled' && !hasEvidence) {
       return { action: 'Manual Review', requireManual: true, reason: 'High severity issue requires photo evidence or manual review.' };
    }

    // 3. Default to manual review for large claims or unusual patterns
    if (!isSmallClaim || !isGoodCustomer) {
      return { action: 'Manual Review', requireManual: true, reason: 'Claim exceeds auto-resolve threshold or customer flag.' };
    }

    // Default conservative action
    return { action: 'Wallet Credit', requireManual: false, reason: 'Standard resolution.' };
  }
}

module.exports = new ClaimEvaluator();
