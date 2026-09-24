import { useContext, useEffect, useRef } from 'react';
import { SocketContext } from '../context/SocketContext';

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

/**
 * Reusable hook to subscribe to a Socket.io event with auto cleanup
 */
export function useSocketEvent(eventName: string, handler: (data: any) => void) {
  const { socket } = useSocket();
  const callback = useRef(handler);
  useEffect(() => { callback.current = handler; }, [handler]);
  useEffect(() => {
    if (!socket) return;
    const listener = (data: any) => callback.current(data);
    socket.on(eventName, listener);
    return () => { socket.off(eventName, listener); };
  }, [socket, eventName]);
}
