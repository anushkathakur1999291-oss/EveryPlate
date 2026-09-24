/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinDelivery: (deliveryId: string) => void;
  joinDonation: (donationId: string) => void;
}

export const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    if (!userId) { setTimeout(() => { setSocket(null); setIsConnected(false); }, 0); return; }
    const s = io('/', {
      auth: { userId },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      setIsConnected(true);
    });

    s.on('disconnect', () => {
      setIsConnected(false);
    });

    setTimeout(() => setSocket(s), 0);

    return () => {
      s.disconnect();
    };
  }, [userId]);

  const joinDelivery = (deliveryId: string) => {
    if (socket && deliveryId) {
      socket.emit('join:delivery', deliveryId);
    }
  };

  const joinDonation = (donationId: string) => {
    if (socket && donationId) {
      socket.emit('join:donation', donationId);
    }
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, joinDelivery, joinDonation }}>
      {children}
    </SocketContext.Provider>
  );
};

