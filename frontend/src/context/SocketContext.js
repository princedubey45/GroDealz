// src/context/SocketContext.js
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);
export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }) {
  const socketRef  = useRef(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const socket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:5000', {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('order_update', (data) => {
      addNotification({ type: 'order', ...data });
    });

    socket.on('new_order', (data) => {
      addNotification({ type: 'new_order', ...data });
    });

    socketRef.current = socket;
    return () => socket.disconnect();
  }, []);

  const addNotification = (notif) => {
    setNotifications(prev => [{ ...notif, id: Date.now(), read: false }, ...prev.slice(0, 19)]);
  };

  const trackOrder = (orderId) => {
    socketRef.current?.emit('track_order', orderId);
  };

  const joinStore = (storeId) => {
    socketRef.current?.emit('join_store', storeId);
  };

  const markRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <SocketContext.Provider value={{ connected, notifications, unreadCount, trackOrder, joinStore, markRead }}>
      {children}
    </SocketContext.Provider>
  );
}
