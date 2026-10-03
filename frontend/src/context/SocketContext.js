// src/context/SocketContext.js
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);
export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:5000', {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect',    () => setConnected(true));
    newSocket.on('disconnect', () => setConnected(false));

    newSocket.on('order_update', (data) => {
      addNotification({ type: 'order', ...data });
    });

    newSocket.on('new_order', (data) => {
      addNotification({ type: 'new_order', ...data });
    });

    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, []);

  const addNotification = (notif) => {
    setNotifications(prev => [{ ...notif, id: Date.now(), read: false }, ...prev.slice(0, 19)]);
  };

  const trackOrder = (orderId) => {
    socket?.emit('track_order', orderId);
  };

  const joinStore = (storeId) => {
    socket?.emit('join_store', storeId);
  };

  const markRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <SocketContext.Provider value={{ socket, connected, notifications, unreadCount, trackOrder, joinStore, markRead }}>
      {children}
    </SocketContext.Provider>
  );
}
