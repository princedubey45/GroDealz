// ai/demandPrediction.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz Demand Prediction Engine
//  Implements:
//    1. Time Series Forecasting  (moving average + trend decomposition)
//    2. Linear Regression        (multi-variate demand prediction)
//    3. Seasonal Pattern Mining
//  Use cases:
//    - Restaurants prepare food in advance
//    - Reduce waiting time
//    - Optimize delivery staff scheduling
// ─────────────────────────────────────────────────────────────────────────────
const Order   = require('../models/Order');
const Product = require('../models/Product');
const Store   = require('../models/Store');

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function mean(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function stddev(arr) {
  const m  = mean(arr);
  const sq = arr.map(v => (v - m) ** 2);
  return Math.sqrt(mean(sq));
}

// ─── LINEAR REGRESSION (Ordinary Least Squares) ──────────────────────────────
// Fits: demand = w0 + w1*hour + w2*dayOfWeek + w3*isWeekend + w4*temperature
function linearRegression(X, y) {
  const n = X.length;
  if (n < 3) return { predict: () => 1, coefficients: [] };

  // Add bias column
  const Xb = X.map(row => [1, ...row]);
  const m  = Xb[0].length;

  // Normal equation: w = (Xb^T Xb)^-1 Xb^T y
  // Simplified for small feature sets with iterative gradient descent
  let weights = new Array(m).fill(0);
  const lr     = 0.0001;
  const epochs = 1000;

  for (let e = 0; e < epochs; e++) {
    const grad = new Array(m).fill(0);
    for (let i = 0; i < n; i++) {
      const pred = Xb[i].reduce((s, v, j) => s + v * weights[j], 0);
      const err  = pred - y[i];
      Xb[i].forEach((v, j) => { grad[j] += err * v; });
    }
    weights = weights.map((w, j) => w - (lr / n) * grad[j]);
  }

  return {
    weights,
    predict: (features) => {
      const row = [1, ...features];
      return Math.max(0, row.reduce((s, v, j) => s + v * (weights[j] || 0), 0));
    }
  };
}

// ─── EXPONENTIAL SMOOTHING (time series) ────────────────────────────────────
function exponentialSmoothing(series, alpha = 0.3) {
  if (!series.length) return [];
  const smoothed = [series[0]];
  for (let i = 1; i < series.length; i++) {
    smoothed.push(alpha * series[i] + (1 - alpha) * smoothed[i - 1]);
  }
  return smoothed;
}

// ─── MOVING AVERAGE ──────────────────────────────────────────────────────────
function movingAverage(series, window = 3) {
  return series.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = series.slice(start, i + 1);
    return mean(slice);
  });
}

// ─── PREDICT DEMAND FOR NEXT N HOURS ────────────────────────────────────────
function forecastNextHours(historicalHourly, n = 24) {
  if (historicalHourly.length < 2) return Array(n).fill(1);

  const smoothed  = exponentialSmoothing(historicalHourly, 0.4);
  const averaged  = movingAverage(smoothed, 3);

  // Compute trend
  const len   = averaged.length;
  const trend = len > 1 ? (averaged[len - 1] - averaged[0]) / len : 0;

  return Array.from({ length: n }, (_, i) => {
    const base       = averaged[len - 1] + trend * (i + 1);
    const seasonalIdx = (new Date().getHours() + i) % 24;
    // Apply hourly seasonality pattern
    const hourFactor = HOURLY_MULTIPLIERS[seasonalIdx] || 1;
    return Math.max(0, Math.round(base * hourFactor));
  });
}

// Typical grocery demand multipliers per hour (0-23)
const HOURLY_MULTIPLIERS = [
  0.3, 0.2, 0.15, 0.1, 0.1, 0.3, // 00-05: night/early
  0.8, 1.2, 1.4, 1.1, 0.9, 1.0,   // 06-11: morning rush
  1.2, 1.0, 0.9, 0.8, 0.9, 1.1,   // 12-17: afternoon
  1.5, 1.8, 1.6, 1.2, 0.8, 0.5    // 18-23: evening peak
];

// ─── MAIN PREDICTION FUNCTION ────────────────────────────────────────────────
async function predictDemandForProduct(productId, storeId) {
  try {
    const now    = new Date();
    const past7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Get past orders for this product
    const orders = await Order.find({
      store:        storeId,
      createdAt:    { $gte: past7d },
      status:       { $in: ['delivered', 'confirmed', 'preparing'] },
      'items.product': productId
    }).lean();

    // Build hourly demand series (last 7 days, 168 data points)
    const hourlyCounts = new Array(168).fill(0);
    orders.forEach(order => {
      const hourIdx = Math.floor((now - new Date(order.createdAt)) / (1000 * 60 * 60));
      if (hourIdx < 168) {
        const item = order.items.find(i => i.product.toString() === productId.toString());
        if (item) hourlyCounts[167 - hourIdx] += item.quantity;
      }
    });

    // Forecast next 24 hours
    const forecast = forecastNextHours(hourlyCounts, 24);

    // Multi-variate regression features: [hour, dayOfWeek, isWeekend]
    const X = hourlyCounts.map((_, i) => {
      const dt         = new Date(now - (167 - i) * 3600000);
      const hour       = dt.getHours();
      const dayOfWeek  = dt.getDay();
      const isWeekend  = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;
      return [hour, dayOfWeek, isWeekend];
    });
    const regModel    = linearRegression(X, hourlyCounts);
    const nextHourFeatures = [now.getHours() + 1, now.getDay(), (now.getDay() % 6 === 0) ? 1 : 0];
    const regressionNext   = Math.round(regModel.predict(nextHourFeatures));

    // Ensemble: average time-series + regression
    const predictedNextHour = Math.round((forecast[0] + regressionNext) / 2);

    // Compute demand score (0-100) based on recent trend
    const recentAvg  = mean(hourlyCounts.slice(-24));
    const overallAvg = mean(hourlyCounts);
    const demandScore = Math.min(100, Math.round((recentAvg / (overallAvg || 1)) * 50));

    // Detect trend
    const early  = mean(hourlyCounts.slice(0, 56));
    const middle = mean(hourlyCounts.slice(56, 112));
    const recent = mean(hourlyCounts.slice(112));
    let trendTag = 'stable';
    if (recent > middle * 1.2 && middle > early * 1.1)  trendTag = 'trending';
    else if (recent < middle * 0.8 && middle < early * 0.9) trendTag = 'declining';

    return {
      productId,
      predictedNextHour,
      forecast24h:   forecast,
      demandScore,
      trendTag,
      peakHours:     HOURLY_MULTIPLIERS
        .map((v, i) => ({ hour: i, mult: v }))
        .filter(h => h.mult >= 1.4)
        .map(h => h.hour),
      recommendation: buildOperationalRecommendation(predictedNextHour, trendTag, recentAvg)
    };

  } catch (err) {
    console.error('Demand prediction error:', err.message);
    return null;
  }
}

function buildOperationalRecommendation(predicted, trend, avgDemand) {
  const recs = [];

  if (predicted > avgDemand * 1.5)
    recs.push({ type: 'staff',    msg: 'Consider adding 1–2 extra delivery riders for the next hour.' });
  if (trend === 'trending')
    recs.push({ type: 'stock',    msg: 'Demand is rising — replenish stock proactively.' });
  if (predicted > 10)
    recs.push({ type: 'kitchen',  msg: `Prepare ~${predicted} units in advance to reduce wait time.` });
  if (trend === 'declining')
    recs.push({ type: 'promo',    msg: 'Sales are declining. Consider a limited-time discount to boost orders.' });

  return recs;
}

// ─── RUN PREDICTION FOR ALL PRODUCTS (CRON JOB) ─────────────────────────────
async function runDemandPrediction() {
  try {
    const products = await Product.find({ isActive: true }).select('_id store ai').lean();
    const updates  = [];

    for (const product of products) {
      const result = await predictDemandForProduct(product._id, product.store);
      if (result) {
        updates.push({
          updateOne: {
            filter: { _id: product._id },
            update: {
              'ai.demandScore':     result.demandScore,
              'ai.predictedDemand': result.predictedNextHour,
              'ai.trendTag':        result.trendTag,
              'ai.seasonalPeaks':   result.peakHours
            }
          }
        });
      }
    }

    if (updates.length) await Product.bulkWrite(updates);
    console.log(`✅ Demand prediction updated for ${updates.length} products`);
    return { updated: updates.length };

  } catch (err) {
    console.error('runDemandPrediction error:', err.message);
    throw err;
  }
}

// ─── STORE-LEVEL DEMAND SUMMARY ──────────────────────────────────────────────
async function getStoreDemandSummary(storeId) {
  try {
    const now    = new Date();
    const today  = new Date(now.setHours(0, 0, 0, 0));

    const orders = await Order.find({
      store:     storeId,
      createdAt: { $gte: today }
    }).lean();

    const hourlyOrders = new Array(24).fill(0);
    orders.forEach(o => {
      const h = new Date(o.createdAt).getHours();
      hourlyOrders[h]++;
    });

    const forecast = forecastNextHours(hourlyOrders, 6);
    const peakHour = forecast.reduce((maxIdx, v, i, arr) => v > arr[maxIdx] ? i : maxIdx, 0);

    return {
      todayOrders:     orders.length,
      hourlyDistribution: hourlyOrders,
      forecast6h:      forecast,
      peakHourNext6:   (now.getHours() + peakHour) % 24,
      staffRecommendation: forecast[0] > 10 ? 'High demand — full staff recommended' :
                           forecast[0] > 5  ? 'Moderate demand — standard staff'    :
                                              'Low demand — minimal staff sufficient'
    };
  } catch (err) {
    console.error('getStoreDemandSummary error:', err.message);
    return null;
  }
}

module.exports = { predictDemandForProduct, runDemandPrediction, getStoreDemandSummary };
