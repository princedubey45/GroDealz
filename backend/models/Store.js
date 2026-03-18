// models/Store.js
const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  description: String,
  logo:        String,
  emoji:       String,

  location: {
    address:   String,
    area:      String,
    city:      { type: String, default: 'Imphal' },
    pincode:   String,
    lat:       Number,
    lng:       Number
  },

  hours: {
    open:  { type: String, default: '07:00' },
    close: { type: String, default: '22:00' },
    isOpen: { type: Boolean, default: true }
  },

  categories: [String],

  ratings: {
    average: { type: Number, default: 4.5 },
    count:   { type: Number, default: 0 }
  },

  stats: {
    totalOrders:   { type: Number, default: 0 },
    todayOrders:   { type: Number, default: 0 },
    todayRevenue:  { type: Number, default: 0 },
    avgDelivery:   { type: Number, default: 25 } // minutes
  },

  // AI demand predictions
  demandForecast: [{
    hour:     Number,
    predicted: Number,
    actual:   Number,
    date:     Date
  }],

  deliveryRadius: { type: Number, default: 5 }, // km
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Store', storeSchema);
