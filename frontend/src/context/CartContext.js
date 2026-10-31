// src/context/CartContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('grd_cart') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('grd_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (product, qty = 1) => {
    setItems(prev => {
      const existing = prev.find(i => i._id === product._id);
      if (existing) return prev.map(i => i._id === product._id ? { ...i, qty: i.qty + qty } : i);
      return [...prev, {
        ...product,
        qty,
        store: product.store?._id || product.store?.id || product.store,
        storeName: product.store?.name || product.storeName,
        storeEmoji: product.store?.emoji || product.storeEmoji
      }];
    });
  };

  const addBasket = (basketItems = []) => {
    setItems(prev => {
      let updated = [...prev];
      for (const item of basketItems) {
        const prodId = item._id || item.productId || item.product;
        const existingIdx = updated.findIndex(i => i._id === prodId);
        const qtyToAdd = item.quantity || item.qty || 1;
        const storeId = item.store?.id || item.store?._id || item.store;

        if (existingIdx > -1) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            qty: updated[existingIdx].qty + qtyToAdd,
            store: updated[existingIdx].store || storeId
          };
        } else {
          updated.push({
            _id: prodId,
            name: item.name,
            price: item.price,
            mrp: item.mrp || item.price,
            unit: item.unit,
            emoji: item.emoji || '🛒',
            qty: qtyToAdd,
            store: storeId,
            storeName: item.store?.name,
            storeEmoji: item.store?.emoji
          });
        }
      }
      return updated;
    });
  };

  const replaceCart = (basketItems = []) => {
    const formatted = basketItems.map(item => ({
      _id: item._id || item.productId || item.product,
      name: item.name,
      price: item.price,
      mrp: item.mrp || item.price,
      unit: item.unit,
      emoji: item.emoji || '🛒',
      qty: item.quantity || item.qty || 1,
      store: item.store?.id || item.store?._id || item.store,
      storeName: item.store?.name,
      storeEmoji: item.store?.emoji
    }));
    setItems(formatted);
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i._id !== id));

  const updateQty = (id, qty) => {
    if (qty < 1) { removeItem(id); return; }
    setItems(prev => prev.map(i => i._id === id ? { ...i, qty } : i));
  };

  const clearCart = () => setItems([]);

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const itemCount = items.reduce((s, i) => s + i.qty, 0);

  return (
    <CartContext.Provider value={{ items, addItem, addBasket, replaceCart, removeItem, updateQty, clearCart, total, itemCount }}>
      {children}
    </CartContext.Provider>
  );
}

// src/context/SocketContext.js — in separate export below
