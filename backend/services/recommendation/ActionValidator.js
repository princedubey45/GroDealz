/**
 * ActionValidator enforces the strict boundary between AI proposals and database mutations.
 * AI never modifies the database directly. It creates an Action Payload which this service validates.
 */
class ActionValidator {
  
  /**
   * Validates an AI-proposed action before allowing domain execution.
   * @param {Object} actionPayload - e.g. { type: 'AddToCart', productId: '123', qty: 2 }
   * @param {Object} user - The authenticated user requesting the action
   */
  async validate(actionPayload, user) {
    if (!user) {
      throw new Error("Unauthorized: Cannot execute AI action without authenticated user.");
    }

    switch(actionPayload.type) {
      case 'AddToCart':
        // Mock verification: Ensure stock exists, price is correct, etc.
        if (actionPayload.qty <= 0) throw new Error("Invalid quantity.");
        // In reality, we'd query the DB to verify stock and price here.
        return true;
        
      case 'IssueRefund':
        // Ensure the AI isn't arbitrarily issuing refunds without a valid claim
        if (!actionPayload.claimId) throw new Error("Refunds require a valid QualityClaim ID.");
        return true;

      default:
        throw new Error(`Unknown AI action type: ${actionPayload.type}`);
    }
  }

  /**
   * Executes the action ONLY IF validation passes.
   */
  async execute(actionPayload, user) {
    await this.validate(actionPayload, user);
    console.log(`[Domain Execution] Executing validated AI action: ${actionPayload.type}`);
    // Dispatch to actual domain services here (e.g., CartService.addItem)
    return { success: true, action: actionPayload.type };
  }
}

module.exports = new ActionValidator();
