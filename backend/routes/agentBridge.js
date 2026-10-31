// routes/agentBridge.js
// ─────────────────────────────────────────────────────────────────────────────
//  GroDealz Node.js <-> Python LangGraph Agent Discovery Bridge
//  Exposes high-performance internal querying for product catalogs, active stores,
//  and real-time stock/price verification.
// ─────────────────────────────────────────────────────────────────────────────
const router  = require('express').Router();
const Product = require('../models/Product');
const Store   = require('../models/Store');

// Internal bridge security token (optional shared secret header)
const AGENT_BRIDGE_SECRET = process.env.AGENT_BRIDGE_SECRET || 'grodealz_agent_internal_secret';

const verifyInternalBridge = (req, res, next) => {
  const secretHeader = req.headers['x-agent-bridge-secret'];
  // Allow localhost loopback calls or valid secret header
  const isLoopback = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
  if (isLoopback || secretHeader === AGENT_BRIDGE_SECRET || process.env.NODE_ENV !== 'production') {
    return next();
  }
  return res.status(403).json({ error: 'Unauthorized internal bridge access' });
};

router.use(verifyInternalBridge);

/**
 * GET /api/agent-bridge/products/search
 * Search across active catalog products with store population
 */
router.get('/products/search', async (req, res) => {
  try {
    const { q, category, storeId, limit = 50 } = req.query;
    const filter = {
      isActive: true,
      'stock.isAvailable': true,
      'stock.quantity': { $gt: 0 }
    };

    if (category) {
      filter.category = new RegExp(`^${category.trim()}$`, 'i');
    }

    if (storeId) {
      filter.store = storeId;
    }

    if (q && q.trim()) {
      const term = q.trim();
      const regex = new RegExp(term, 'i');
      filter.$or = [
        { name: regex },
        { tags: regex },
        { subcategory: regex },
        { description: regex }
      ];
    }

    const products = await Product.find(filter)
      .populate('store', 'name emoji location ratings stats hours')
      .limit(parseInt(limit, 10))
      .lean();

    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (err) {
    console.error('Agent Bridge Products Search Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/agent-bridge/stores/active
 * Get all active stores with operational hours & rating
 */
router.get('/stores/active', async (req, res) => {
  try {
    const stores = await Store.find({ isActive: true })
      .select('name description emoji location hours categories ratings stats')
      .lean();

    res.json({
      success: true,
      count: stores.length,
      stores
    });
  } catch (err) {
    console.error('Agent Bridge Stores Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/agent-bridge/inventory/check
 * Real-time atomic verification of stock & prices for a proposed item list
 */
router.post('/inventory/check', async (req, res) => {
  try {
    const { items = [] } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Items array is required' });
    }

    const productIds = items.map(i => i.productId || i.product || i._id);
    const dbProducts = await Product.find({ _id: { $in: productIds } })
      .populate('store', 'name')
      .lean();
    
    const dbMap = Object.fromEntries(dbProducts.map(p => [p._id.toString(), p]));

    const results = items.map(reqItem => {
      const pId = (reqItem.productId || reqItem.product || reqItem._id).toString();
      const dbProd = dbMap[pId];
      const reqQty = Math.max(1, parseInt(reqItem.quantity || 1, 10));

      if (!dbProd) {
        return {
          productId: pId,
          name: reqItem.name || 'Unknown',
          available: false,
          reason: 'Product not found'
        };
      }

      const inStock = dbProd.isActive && dbProd.stock?.isAvailable && (dbProd.stock?.quantity >= reqQty);

      return {
        productId: pId,
        name: dbProd.name,
        price: dbProd.price,
        currentStock: dbProd.stock?.quantity || 0,
        available: inStock,
        reason: inStock ? 'OK' : 'Insufficient stock or inactive',
        store: {
          id: dbProd.store?._id || dbProd.store,
          name: dbProd.store?.name || 'Local Store'
        }
      };
    });

    const allAvailable = results.every(r => r.available);

    res.json({
      success: true,
      allAvailable,
      items: results
    });
  } catch (err) {
    console.error('Agent Bridge Inventory Check Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
