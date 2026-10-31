// services/catalogSeeder.js
// ─────────────────────────────────────────────────────────────────────────────
// Ensures active multi-store grocery partners & essential catalog exist in MongoDB.
// ─────────────────────────────────────────────────────────────────────────────
const Store = require('../models/Store');
const Product = require('../models/Product');
const User = require('../models/User');

const STORES_DATA = [
  {
    name: 'FreshMart Central',
    emoji: '🏪',
    location: { area: 'Paona Bazar', city: 'Imphal', lat: 24.817, lng: 93.937 },
    categories: ['fruits', 'vegetables', 'dairy', 'staples'],
    ratings: { average: 4.6, count: 185 },
    isActive: true
  },
  {
    name: 'GreenLeaf Grocers',
    emoji: '🥬',
    location: { area: 'Thangal Bazar', city: 'Imphal', lat: 24.822, lng: 93.942 },
    categories: ['vegetables', 'fruits', 'organic'],
    ratings: { average: 4.8, count: 240 },
    isActive: true
  },
  {
    name: 'Daily Needs Store',
    emoji: '🛒',
    location: { area: 'Lamphel', city: 'Imphal', lat: 24.810, lng: 93.931 },
    categories: ['dairy', 'bakery', 'snacks', 'household'],
    ratings: { average: 4.4, count: 120 },
    isActive: true
  }
];

const PRODUCTS_SEED = [
  // Vegetables
  { name: 'Tomatoes', category: 'vegetables', price: 35, mrp: 45, discount: 22, unit: '500g', emoji: '🍅', dietary: { isVeg: true, isVegan: true }, storeIdx: 1 },
  { name: 'Onions', category: 'vegetables', price: 28, mrp: 30, discount: 7, unit: '1kg', emoji: '🧅', dietary: { isVeg: true, isVegan: true }, storeIdx: 1 },
  { name: 'Potatoes', category: 'vegetables', price: 32, mrp: 35, discount: 9, unit: '1kg', emoji: '🥔', dietary: { isVeg: true, isVegan: true }, storeIdx: 0 },
  { name: 'Spinach', category: 'vegetables', price: 25, mrp: 30, discount: 17, unit: '250g', emoji: '🥬', dietary: { isVeg: true, isVegan: true }, storeIdx: 1 },
  { name: 'Capsicum', category: 'vegetables', price: 60, mrp: 70, discount: 14, unit: '500g', emoji: '🫑', dietary: { isVeg: true, isVegan: true }, storeIdx: 1 },

  // Fruits
  { name: 'Bananas', category: 'fruits', price: 45, mrp: 55, discount: 18, unit: '1 dozen', emoji: '🍌', dietary: { isVeg: true, isVegan: true }, storeIdx: 1 },
  { name: 'Apples', category: 'fruits', price: 120, mrp: 140, discount: 14, unit: '500g', emoji: '🍎', dietary: { isVeg: true, isVegan: true }, storeIdx: 0 },
  { name: 'Mangoes', category: 'fruits', price: 150, mrp: 180, discount: 17, unit: '500g', emoji: '🥭', dietary: { isVeg: true, isVegan: true }, storeIdx: 1 },

  // Dairy
  { name: 'Full Cream Milk', category: 'dairy', price: 52, mrp: 55, discount: 5, unit: '1L', emoji: '🥛', dietary: { isVeg: true }, storeIdx: 0 },
  { name: 'Paneer', category: 'dairy', price: 95, mrp: 110, discount: 14, unit: '200g', emoji: '🧀', dietary: { isVeg: true }, storeIdx: 2 },
  { name: 'Butter', category: 'dairy', price: 55, mrp: 60, discount: 8, unit: '100g', emoji: '🧈', dietary: { isVeg: true }, storeIdx: 2 },
  { name: 'Curd', category: 'dairy', price: 45, mrp: 50, discount: 10, unit: '500g', emoji: '🥣', dietary: { isVeg: true }, storeIdx: 2 },

  // Staples
  { name: 'Basmati Rice', category: 'staples', price: 320, mrp: 370, discount: 14, unit: '5kg', emoji: '🍚', dietary: { isVeg: true, isVegan: true }, storeIdx: 0 },
  { name: 'Atta (Wheat)', category: 'staples', price: 380, mrp: 420, discount: 10, unit: '10kg', emoji: '🌾', dietary: { isVeg: true, isVegan: true }, storeIdx: 0 },
  { name: 'Toor Dal', category: 'staples', price: 95, mrp: 110, discount: 14, unit: '1kg', emoji: '🫘', dietary: { isVeg: true, isVegan: true }, storeIdx: 0 },
  { name: 'Mustard Oil', category: 'staples', price: 145, mrp: 165, discount: 12, unit: '1L', emoji: '🫙', dietary: { isVeg: true, isVegan: true }, storeIdx: 0 },

  // Bakery & Snacks
  { name: 'Bread Loaf', category: 'bakery', price: 38, mrp: 42, discount: 10, unit: '400g', emoji: '🍞', dietary: { isVeg: true }, storeIdx: 2 },
  { name: 'Eggs', category: 'meat', price: 72, mrp: 80, discount: 10, unit: '12pc', emoji: '🥚', dietary: { isVeg: false }, storeIdx: 2 },
  { name: 'Lays Classic', category: 'snacks', price: 30, mrp: 35, discount: 14, unit: '52g', emoji: '🥔', dietary: { isVeg: true }, storeIdx: 2 },
  { name: 'Biscuits Pack', category: 'snacks', price: 42, mrp: 45, discount: 7, unit: '250g', emoji: '🍪', dietary: { isVeg: true }, storeIdx: 2 }
];

async function ensureGroceryCatalog(force = false) {
  try {
    // Check if staple products exist
    const stapleMatches = await Product.countDocuments({
      name: { $regex: /rice|tomato|potato|milk/i },
      isActive: true,
      'stock.isAvailable': true
    });

    if (stapleMatches >= 4 && !force) {
      return { status: 'already_populated', stapleMatches };
    }

    console.log(`🌱 Grocery staples count is ${stapleMatches}. Auto-seeding core partner stores and catalog...`);

    // 1. Ensure Store Owner
    let owner = await User.findOne({ role: 'owner' });
    if (!owner) {
      owner = await User.create({
        name: 'Rajesh Singh',
        email: 'owner@grodealz.com',
        password: 'owner123',
        role: 'owner'
      });
    }

    // 2. Ensure Partner Stores
    const createdStores = [];
    for (const sData of STORES_DATA) {
      let store = await Store.findOne({ name: sData.name });
      if (!store) {
        store = await Store.create({ ...sData, owner: owner._id });
        console.log(`  ✓ Created store: ${store.name}`);
      } else {
        // Ensure active
        if (!store.isActive) {
          store.isActive = true;
          await store.save();
        }
      }
      createdStores.push(store);
    }

    // 3. Ensure Products
    let createdCount = 0;
    for (const pData of PRODUCTS_SEED) {
      const assignedStore = createdStores[pData.storeIdx % createdStores.length];
      let product = await Product.findOne({ name: pData.name, store: assignedStore._id });

      if (!product) {
        await Product.create({
          name: pData.name,
          category: pData.category,
          price: pData.price,
          mrp: pData.mrp,
          discount: pData.discount,
          unit: pData.unit,
          emoji: pData.emoji,
          dietary: pData.dietary,
          store: assignedStore._id,
          description: `Fresh ${pData.name} — verified quality`,
          tags: [pData.category, pData.name.toLowerCase()],
          stock: { quantity: 100, isAvailable: true },
          isActive: true,
          ratings: { average: 4.2 + (createdCount % 5) * 0.1, count: 60 + createdCount * 5 }
        });
        createdCount++;
      } else if (!product.isActive || !product.stock?.isAvailable) {
        product.isActive = true;
        product.stock = { quantity: 100, isAvailable: true };
        await product.save();
      }
    }

    console.log(`✅ Grocery catalogue initialized with ${createdStores.length} stores and ${createdCount} products!`);
    return {
      status: 'seeded',
      storesCount: createdStores.length,
      newProductsCreated: createdCount
    };
  } catch (err) {
    console.error('Error in ensureGroceryCatalog:', err);
    return { status: 'error', error: err.message };
  }
}

module.exports = {
  ensureGroceryCatalog,
  STORES_DATA,
  PRODUCTS_SEED
};
