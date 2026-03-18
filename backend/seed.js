// seed.js – Run once: node seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('./models/User');
const Store    = require('./models/Store');
const Product  = require('./models/Product');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/grodeaz';

const STORES_DATA = [
  { name: 'FreshMart Central',   emoji: '🏪', location: { area: 'Paona Bazar',  lat: 24.817, lng: 93.937 }, categories: ['fruits','vegetables','dairy','staples'] },
  { name: 'GreenLeaf Grocers',   emoji: '🥬', location: { area: 'Thangal Bazar', lat: 24.822, lng: 93.942 }, categories: ['vegetables','fruits','organic'] },
  { name: 'Daily Needs Store',   emoji: '🛒', location: { area: 'Lamphel',       lat: 24.810, lng: 93.931 }, categories: ['dairy','bakery','snacks','household'] },
];

const PRODUCTS_SEED = [
  // Vegetables
  { name:'Tomatoes',       category:'vegetables', price:35,  mrp:45,  discount:22, unit:'500g', emoji:'🍅', dietary:{isVeg:true}, orderCount:450 },
  { name:'Onions',         category:'vegetables', price:28,  mrp:30,  discount:7,  unit:'1kg',  emoji:'🧅', dietary:{isVeg:true}, orderCount:520 },
  { name:'Potatoes',       category:'vegetables', price:32,  mrp:35,  discount:9,  unit:'1kg',  emoji:'🥔', dietary:{isVeg:true}, orderCount:490 },
  { name:'Spinach',        category:'vegetables', price:25,  mrp:30,  discount:17, unit:'250g', emoji:'🥬', dietary:{isVeg:true,isVegan:true}, orderCount:180 },
  { name:'Capsicum',       category:'vegetables', price:60,  mrp:70,  discount:14, unit:'500g', emoji:'🫑', dietary:{isVeg:true}, orderCount:140 },
  // Fruits
  { name:'Bananas',        category:'fruits',     price:45,  mrp:55,  discount:18, unit:'1 dozen', emoji:'🍌', dietary:{isVeg:true,isVegan:true}, orderCount:380 },
  { name:'Apples',         category:'fruits',     price:120, mrp:140, discount:14, unit:'500g', emoji:'🍎', dietary:{isVeg:true,isVegan:true}, orderCount:220 },
  { name:'Mangoes',        category:'fruits',     price:150, mrp:180, discount:17, unit:'500g', emoji:'🥭', dietary:{isVeg:true,isVegan:true}, orderCount:410, ai:{trendTag:'trending'} },
  // Dairy
  { name:'Full Cream Milk',category:'dairy',      price:52,  mrp:55,  discount:5,  unit:'1L',   emoji:'🥛', dietary:{isVeg:true}, orderCount:780 },
  { name:'Paneer',         category:'dairy',      price:95,  mrp:110, discount:14, unit:'200g', emoji:'🧀', dietary:{isVeg:true}, orderCount:340 },
  { name:'Butter',         category:'dairy',      price:55,  mrp:60,  discount:8,  unit:'100g', emoji:'🧈', dietary:{isVeg:true}, orderCount:290 },
  { name:'Curd',           category:'dairy',      price:45,  mrp:50,  discount:10, unit:'500g', emoji:'🥣', dietary:{isVeg:true}, orderCount:350 },
  // Staples
  { name:'Basmati Rice',   category:'staples',    price:320, mrp:370, discount:14, unit:'5kg',  emoji:'🍚', dietary:{isVeg:true,isVegan:true}, orderCount:620 },
  { name:'Atta (Wheat)',   category:'staples',    price:380, mrp:420, discount:10, unit:'10kg', emoji:'🌾', dietary:{isVeg:true,isVegan:true}, orderCount:550 },
  { name:'Toor Dal',       category:'staples',    price:95,  mrp:110, discount:14, unit:'1kg',  emoji:'🫘', dietary:{isVeg:true,isVegan:true}, orderCount:480 },
  { name:'Mustard Oil',    category:'staples',    price:145, mrp:165, discount:12, unit:'1L',   emoji:'🫙', dietary:{isVeg:true,isVegan:true}, orderCount:400 },
  // Snacks
  { name:'Lays Classic',   category:'snacks',     price:30,  mrp:35,  discount:14, unit:'52g',  emoji:'🥔', dietary:{isVeg:true}, orderCount:210 },
  { name:'Biscuits Pack',  category:'snacks',     price:42,  mrp:45,  discount:7,  unit:'250g', emoji:'🍪', dietary:{isVeg:true}, orderCount:280 },
  // Bakery
  { name:'Bread Loaf',     category:'bakery',     price:38,  mrp:42,  discount:10, unit:'400g', emoji:'🍞', dietary:{isVeg:true}, orderCount:430 },
  { name:'Eggs',           category:'meat',       price:72,  mrp:80,  discount:10, unit:'12pc', emoji:'🥚', dietary:{isVeg:false}, orderCount:590 },
  // Beverages
  { name:'Amul Lassi',     category:'beverages',  price:25,  mrp:28,  discount:11, unit:'200ml',emoji:'🥤', dietary:{isVeg:true}, orderCount:190 },
  { name:'Packaged Water', category:'beverages',  price:20,  mrp:20,  discount:0,  unit:'1L',   emoji:'💧', dietary:{isVeg:true,isVegan:true}, orderCount:670 },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Clear existing
  await Promise.all([User.deleteMany({}), Store.deleteMany({}), Product.deleteMany({})]);

  // Create owner user
  const owner = await User.create({
    name: 'Rajesh Singh', email: 'owner@grodeaz.com', password: 'owner123', role: 'owner'
  });

  // Create customer user
  const customer = await User.create({
    name: 'Priya Sharma', email: 'customer@grodeaz.com', password: 'customer123', role: 'customer',
    profile: { preferences: { dietary: 'veg', categories: ['vegetables','fruits','dairy'] } }
  });

  console.log('✅ Users created');

  // Create stores
  const stores = await Store.insertMany(STORES_DATA.map(s => ({ ...s, owner: owner._id, location: { ...s.location, city: 'Imphal' } })));
  console.log(`✅ ${stores.length} stores created`);

  // Create products (distribute across stores)
  const products = await Product.insertMany(
    PRODUCTS_SEED.map((p, i) => ({
      ...p,
      store: stores[i % stores.length]._id,
      description: `Fresh ${p.name} — quality guaranteed`,
      tags: [p.category, p.name.toLowerCase()],
      stock: { quantity: 100, isAvailable: true },
      ai: { demandScore: 40 + Math.round(Math.random() * 50), trendTag: p.ai?.trendTag || 'stable', predictedDemand: Math.round(Math.random() * 20) },
      ratings: { average: 4 + Math.random(), count: Math.round(Math.random() * 200) }
    }))
  );
  console.log(`✅ ${products.length} products created`);

  // Update owner's storeId
  await User.findByIdAndUpdate(owner._id, { storeId: stores[0]._id });

  console.log('\n🎉 Seed complete!');
  console.log('Owner login:    owner@grodeaz.com / owner123');
  console.log('Customer login: customer@grodeaz.com / customer123');
  mongoose.disconnect();
}

seed().catch(err => { console.error(err); mongoose.disconnect(); });
