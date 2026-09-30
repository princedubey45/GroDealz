// src/pages/AIGroceryPlanner.js
import React, { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import useApi from '../hooks/useApi';
import styles from './AIGroceryPlanner.module.css';

export default function AIGroceryPlanner() {
  const api = useApi();
  const { addBasket } = useCart();

  const [query, setQuery] = useState('Plan groceries for 4 people under ₹1000 for 3 days');
  const [familySize, setFamilySize] = useState(4);
  const [durationDays, setDurationDays] = useState(3);
  const [budget, setBudget] = useState(1000);
  const [dietary, setDietary] = useState('all');
  const [shoppingGoal, setShoppingGoal] = useState('budget_shopping');

  const [loading, setLoading] = useState(false);
  const [planResult, setPlanResult] = useState(null);
  const [addedMessage, setAddedMessage] = useState('');

  const PRESETS = [
    "Plan groceries for 4 people under ₹1000 for 3 days",
    "Mujhe 2 log ke liye 7 din ka veg grocery chahiye under 1500",
    "Party snacks for 5 people under ₹500",
    "Healthy breakfast items for 2 people"
  ];

  const handleGeneratePlan = async (queryText = query) => {
    setLoading(true);
    setAddedMessage('');
    try {
      const res = await api.post('/ai/copilot', { message: queryText });
      if (res.data?.response?.plan) {
        setPlanResult(res.data.response.plan);
        if (res.data.response.plan.params) {
          setFamilySize(res.data.response.plan.params.familySize);
          setDurationDays(res.data.response.plan.params.durationDays);
          if (res.data.response.plan.params.budget) setBudget(res.data.response.plan.params.budget);
          if (res.data.response.plan.params.dietary) setDietary(res.data.response.plan.params.dietary);
          if (res.data.response.plan.params.shoppingGoal) setShoppingGoal(res.data.response.plan.params.shoppingGoal);
        }
      } else {
        // Fallback direct plan API call
        const directRes = await api.post('/ai/plan-groceries', {
          familySize,
          durationDays,
          budget,
          dietary,
          shoppingGoal
        });
        setPlanResult(directRes.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleGeneratePlan(query);
  }, []);

  const handleAddAllToCart = () => {
    if (!planResult || !planResult.basket) return;
    addBasket(planResult.basket);
    setAddedMessage(`🎉 Success! Added complete basket (${planResult.basket.length} items) to your cart!`);
    setTimeout(() => setAddedMessage(''), 4000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <div className={styles.badge}>
          <span>🤖 GroDealz AI Shopping Intelligence</span>
        </div>
        <h1 className={styles.title}>AI Grocery Planner & Copilot</h1>
        <p className={styles.subtitle}>
          Tell us your household size, budget, or natural language query in English or Hinglish — our AI generates an instant, MongoDB-grounded grocery basket optimized for your needs.
        </p>

        <div className={styles.queryBox}>
          <input
            type="text"
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGeneratePlan(query)}
            placeholder="e.g. Plan groceries for 4 people under ₹1000 for 3 days"
          />
          <button className={styles.btnPrimary} onClick={() => handleGeneratePlan(query)} disabled={loading}>
            {loading ? 'Generating...' : '✨ Generate Basket'}
          </button>
        </div>

        <div className={styles.presets}>
          {PRESETS.map((preset, idx) => (
            <button
              key={idx}
              className={styles.chip}
              onClick={() => {
                setQuery(preset);
                handleGeneratePlan(preset);
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        {/* Left Side: Parameters Form */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>⚙️ Planning Parameters</h3>

          <div className={styles.formGroup}>
            <label className={styles.label}>Household Size (People): {familySize}</label>
            <input
              type="range"
              min="1"
              max="10"
              value={familySize}
              onChange={(e) => setFamilySize(parseInt(e.target.value, 10))}
              style={{ width: '100%' }}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Duration (Days): {durationDays}</label>
            <select className={styles.select} value={durationDays} onChange={(e) => setDurationDays(parseInt(e.target.value, 10))}>
              <option value="1">1 Day</option>
              <option value="3">3 Days</option>
              <option value="7">1 Week (7 Days)</option>
              <option value="14">2 Weeks (14 Days)</option>
              <option value="30">1 Month (30 Days)</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Target Budget (₹):</label>
            <input
              type="number"
              className={styles.select}
              value={budget || ''}
              onChange={(e) => setBudget(e.target.value ? parseInt(e.target.value, 10) : '')}
              placeholder="e.g. 1000"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Dietary Preference:</label>
            <select className={styles.select} value={dietary} onChange={(e) => setDietary(e.target.value)}>
              <option value="all">All (No Restriction)</option>
              <option value="veg">Vegetarian Only</option>
              <option value="vegan">Vegan</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>AI Shopping Goal:</label>
            <select className={styles.select} value={shoppingGoal} onChange={(e) => setShoppingGoal(e.target.value)}>
              <option value="weekly_grocery">Weekly Grocery</option>
              <option value="family_shopping">Family Shopping</option>
              <option value="budget_shopping">Budget Shopping & Savings</option>
              <option value="healthy_shopping">Healthy & Nutrition Goal</option>
              <option value="party">Party & Celebration</option>
              <option value="meal_preparation">Meal Preparation & Cooking</option>
              <option value="quick_meal">Quick & Instant Meals</option>
              <option value="replenishment">Staples Replenishment</option>
            </select>
          </div>

          <button
            className={styles.btnSecondary}
            style={{ width: '100%', marginTop: '0.5rem' }}
            onClick={() => handleGeneratePlan(query)}
            disabled={loading}
          >
            Update Parameters & Regenerate
          </button>
        </div>

        {/* Right Side: Generated Basket */}
        <div className={styles.card}>
          {loading ? (
            <div style={{ padding: '3rem', textFillColor: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🤖</div>
              <p>Analyzing products in MongoDB & balancing your target budget...</p>
            </div>
          ) : planResult && planResult.basket ? (
            <>
              <div className={styles.basketHeader}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.4rem' }}>🧺 Recommended AI Basket</h2>
                  <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {planResult.basket.length} items grounded in stock • {planResult.params?.familySize || familySize} people / {planResult.params?.durationDays || durationDays} days
                  </span>
                </div>
                <div>
                  <div className={styles.basketTotal}>₹{planResult.totalPrice}</div>
                  {planResult.savings > 0 && (
                    <div style={{ fontSize: '0.8rem', color: '#10b981', textAlign: 'right' }}>
                      Save ₹{planResult.savings}
                    </div>
                  )}
                </div>
              </div>

              {addedMessage && (
                <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#10b981', padding: '12px 16px', borderRadius: '10px', marginBottom: '1.25rem', fontWeight: '600' }}>
                  {addedMessage}
                </div>
              )}

              <div className={styles.basketList}>
                {planResult.basket.map((item, idx) => (
                  <div key={idx} className={styles.basketItem}>
                    <div className={styles.itemInfo}>
                      <span className={styles.itemEmoji}>{item.emoji}</span>
                      <div>
                        <div className={styles.itemName}>
                          {item.name} <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>x {item.quantity} ({item.unit})</span>
                        </div>
                        <div className={styles.itemRationale}>✨ {item.rationale}</div>
                      </div>
                    </div>
                    <div className={styles.itemPrice}>
                      <div className={styles.lineTotal}>₹{item.lineTotal}</div>
                      <div className={styles.unitPrice}>₹{item.price} / unit</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className={styles.btnPrimary}
                  style={{ flex: 1, padding: '16px', fontSize: '1.05rem', justifyContent: 'center' }}
                  onClick={handleAddAllToCart}
                >
                  🛒 Add Complete Basket to Cart (1-Click)
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <p>Click "Generate Basket" to build an AI grocery plan.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
