/**
 * Base interface for Recommendation Strategies (OCP Pattern)
 */
class RecommendationStrategy {
  score(product, context) {
    throw new Error('score() must be implemented.');
  }
}

class FreshnessStrategy extends RecommendationStrategy {
  score(product, context) {
    // If context prefers max freshness, boost score based on product.freshnessState
    if (context.preferences.includes('max_freshness') && product.freshnessState === 'Very Fresh') {
      return 10;
    }
    if (product.freshnessState === 'Use Soon') {
      return -5; // Penalize products that expire soon
    }
    return 0;
  }
}

class BudgetStrategy extends RecommendationStrategy {
  score(product, context) {
    if (context.preferences.includes('save_money') && product.price < context.averagePrice) {
      return 10;
    }
    return 0;
  }
}

/**
 * Core Recommendation Engine that combines multiple strategies.
 */
class RecommendationEngine {
  constructor() {
    this.strategies = [
      new FreshnessStrategy(),
      new BudgetStrategy(),
      // new DietaryStrategy() can be added here without modifying the engine
    ];
  }

  recommend(products, context) {
    return products.map(product => {
      let totalScore = 0;
      let reasons = [];

      for (const strategy of this.strategies) {
        const score = strategy.score(product, context);
        totalScore += score;
        if (score > 5) reasons.push(`Boosted by ${strategy.constructor.name}`);
      }

      return {
        ...product,
        recommendationScore: totalScore,
        whyRecommended: reasons.join(', ') || 'Standard recommendation'
      };
    }).sort((a, b) => b.recommendationScore - a.recommendationScore);
  }
}

module.exports = new RecommendationEngine();
