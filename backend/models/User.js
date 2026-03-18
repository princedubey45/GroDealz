// models/User.js
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, enum: ['customer', 'owner', 'admin'], default: 'customer' },

  // Profile for AI personalization
  profile: {
    location: {
      lat:  { type: Number, default: 24.817 },
      lng:  { type: Number, default: 93.937 },
      area: { type: String, default: 'Imphal' }
    },
    preferences: {
      dietary: { type: String, enum: ['veg', 'non-veg', 'vegan', 'all'], default: 'all' },
      categories: [String],   // favourite categories
      priceRange: { type: String, enum: ['budget', 'mid', 'premium'], default: 'mid' }
    },
    orderHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
    // Collaborative Filtering – item interaction matrix
    itemInteractions: [{
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      score: Number,           // 1=viewed 3=added-to-cart 5=ordered
      updatedAt: Date
    }]
  },

  addresses: [{
    label:   String,
    street:  String,
    city:    String,
    pincode: String,
    isDefault: Boolean
  }],

  cart: [{
    product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 1 }
  }],

  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' }, // if owner
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
