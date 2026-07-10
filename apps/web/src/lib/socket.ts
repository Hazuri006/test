'use client';

import { io, type Socket } from 'socket.io-client';
import { API_URL } from './utils';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      path: '/ws',
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
