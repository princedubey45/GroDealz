# GroDealz – AI-Powered Grocery Platform (MERN Stack)

A full-stack grocery delivery platform built with the **MERN stack**, featuring a complete **AI engine** including recommendation systems, demand prediction, and an NLP chatbot — inspired by Blinkit.

---

## 🏗️ Architecture

```
grodeaz/
├── backend/                    # Node.js + Express + MongoDB
│   ├── server.js               # Main server, Socket.IO, cron jobs
│   ├── models/
│   │   ├── User.js             # User model with interaction matrix
│   │   ├── Product.js          # Product model with AI metadata
│   │   ├── Order.js            # Order model with status tracking
│   │   └── Store.js            # Store model with demand forecasts
│   ├── routes/
│   │   ├── auth.js             # Register, login, preferences
│   │   ├── products.js         # CRUD + view tracking
│   │   ├── orders.js           # Place, track, update orders
│   │   ├── recommendations.js  # AI recommendations API
│   │   ├── chatbot.js          # NLP chatbot messages
│   │   ├── stores.js           # Store management
│   │   └── demand.js           # Demand prediction API
│   ├── ai/
│   │   ├── recommendationEngine.js   # ⭐ Collaborative + Content-Based Filtering
│   │   ├── demandPrediction.js       # ⭐ Time-Series + Regression ML
│   │   └── nlpChatbot.js            # ⭐ NLP Intent Classifier + Entity Extraction
│   ├── middleware/
│   │   └── auth.js             # JWT authentication
│   └── seed.js                 # Database seeder
│
└── frontend/                   # React.js
    └── src/
        ├── context/
        │   ├── AuthContext.js   # Auth state + JWT
        │   ├── CartContext.js   # Cart with localStorage persistence
        │   └── SocketContext.js # Real-time Socket.IO connection
        ├── components/
        │   ├── Layout.js        # Sidebar + topbar + notifications
        │   └── Chatbot.js       # 💬 AI Chatbot widget
        ├── pages/
        │   ├── Home.js          # Landing + AI recommendations
        │   ├── Products.js      # Shop with filters
        │   ├── Cart.js          # Cart + checkout
        │   ├── Orders.js        # Order history
        │   ├── OrderDetail.js   # Live order tracking
        │   ├── Dashboard.js     # Store owner dashboard
        │   ├── AIInsights.js    # 🤖 AI metrics + charts
        │   ├── StoreFinder.js   # Leaflet map + stores
        │   ├── Login.js
        │   └── Register.js
        └── hooks/
            └── useApi.js        # Axios instance with JWT interceptor
```

---

## 🤖 AI Features

### 1. Recommendation System
**File:** `backend/ai/recommendationEngine.js`

| Algorithm | Description |
|-----------|-------------|
| **Collaborative Filtering** | Builds user-item interaction matrix, computes cosine similarity between users, recommends items liked by similar users |
| **Content-Based Filtering** | Creates 16-dimensional product feature vectors (price, category, dietary, demand score), builds weighted user taste profile, recommends by cosine similarity |
| **Context-Aware Scoring** | Boosts scores based on time of day (breakfast items in morning, dinner items in evening), dietary preference match, trending status |
| **Hybrid Ensemble** | Combines all three for final ranked recommendations |

**Interaction Tracking:** view (+1), cart (+3), purchase (+5) — updates in real-time

---

### 2. Demand Prediction (ML)
**File:** `backend/ai/demandPrediction.js`

| Technique | Description |
|-----------|-------------|
| **Exponential Smoothing** | α=0.4, smooths hourly order history to reduce noise |
| **Linear Regression (GD)** | Multi-variate: `demand = f(hour, dayOfWeek, isWeekend)` — gradient descent trained on 7-day history |
| **Hourly Seasonality** | 24 pre-computed multipliers (e.g. 1.8× at 7 PM, 0.1× at 3 AM) |
| **Ensemble Forecast** | Average of time-series + regression for final hourly prediction |

**Operational outputs:**
- Staff scheduling recommendations
- Advance food preparation alerts
- Low-stock replenishment warnings
- Promotional suggestions for declining items

**Cron job:** Runs every hour, updates all products in bulk via `Model.bulkWrite()`

---

### 3. NLP Chatbot
**File:** `backend/ai/nlpChatbot.js`

| Component | Details |
|-----------|---------|
| **Intent Classifier** | 9 classes via regex pattern matching: `order_status`, `cancel_order`, `recommend`, `price_query`, `store_hours`, `complaint`, `greeting`, `farewell`, `human_agent` |
| **Entity Extraction** | Order IDs (`GRD-XXXXXX`), product names, meal time (breakfast/lunch/dinner), dietary preference (veg/vegan/non-veg) |
| **Context Handlers** | Live DB queries for real order status, actual order cancellation, product price lookups, store hours |
| **AI Integration** | Recommendation intent triggers the full AI recommendation engine with context |

---

## 🛠️ Installation

### Prerequisites
- Node.js ≥ 18
- MongoDB (local or Atlas)
- npm or yarn

### 1. Clone & Setup

```bash
git clone <repo-url>
cd grodeaz
```

### 2. Backend Setup

```bash
cd backend
npm install

# Configure environment
cp .env.example .env
# Edit .env: set MONGO_URI, JWT_SECRET

# Seed the database
npm run seed

# Start development server
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend
npm install

# Start React app
npm start
```

### 4. Access the app

| URL | Description |
|-----|-------------|
| `http://localhost:3000` | Frontend |
| `http://localhost:5000/api` | Backend API |
| `http://localhost:5000/api/health` | Health check |

---

## 🔑 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Customer | `customer@grodeaz.com` | `customer123` |
| Store Owner | `owner@grodeaz.com` | `owner123` |

---

## 📡 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login |
| `GET`  | `/api/auth/me` | Get current user |
| `PUT`  | `/api/auth/preferences` | Update dietary/preferences |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/products` | List products (filters: category, dietary, sort, search) |
| `GET`  | `/api/products/:id` | Single product |
| `POST` | `/api/products/:id/view` | Record view (for AI) |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/orders` | Place new order |
| `GET`  | `/api/orders/my` | User's orders |
| `GET`  | `/api/orders/:id` | Single order |
| `PATCH`| `/api/orders/:id/status` | Update status (owner) |
| `GET`  | `/api/orders/store/:storeId` | Store orders (owner) |

### AI Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/recommendations` | Get AI recommendations |
| `POST` | `/api/recommendations/interact` | Record interaction |
| `GET`  | `/api/recommendations/trending` | Trending products |
| `POST` | `/api/chatbot/message` | Send chatbot message |
| `GET`  | `/api/demand/store/:id` | Store demand summary |
| `GET`  | `/api/demand/product/:id` | Product demand forecast |
| `GET`  | `/api/demand/trending-products` | Products by demand score |
| `POST` | `/api/demand/run` | Manually trigger demand prediction |

---

## 🔌 Real-Time (Socket.IO)

```javascript
// Client: track an order
socket.emit('track_order', orderId);
socket.on('order_update', ({ status, orderId }) => { /* update UI */ });

// Store owner: receive new orders
socket.emit('join_store', storeId);
socket.on('new_order', ({ orderId, total, itemCount }) => { /* notify */ });
```

---

## 🧩 Technologies

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Recharts, Leaflet |
| Backend | Node.js, Express 4, Socket.IO |
| Database | MongoDB, Mongoose |
| Auth | JWT (jsonwebtoken), bcryptjs |
| AI/ML | Custom implementations (no external ML libs) |
| Real-time | Socket.IO (WebSockets) |
| Scheduling | node-cron (hourly demand prediction) |
| Maps | Leaflet + OpenStreetMap / CartoDB Dark |

---

## 📄 License
MIT
