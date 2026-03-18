/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, User, Dice5, RotateCcw, Home, Trophy, Share2, Copy, Check } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Constants ---
const COLORS = ['red', 'green', 'yellow', 'blue'] as const;
type Color = typeof COLORS[number];

interface Piece {
  id: number;
  color: Color;
  position: number; // -1 for home, 0-51 for track, 52-57 for home stretch, 58 for finish
  isFinished: boolean;
}

interface Player {
  id: string;
  name: string;
  color: Color;
  isBot: boolean;
}

// --- Ludo Logic Helpers ---
const BOARD_SIZE = 15;
const TRACK_LENGTH = 52;
const HOME_STRETCH_LENGTH = 6;

const START_POSITIONS: Record<Color, number> = {
  red: 1,
  green: 14,
  yellow: 27,
  blue: 40
};

const HOME_ENTRY: Record<Color, number> = {
  red: 51,
  green: 12,
  yellow: 25,
  blue: 38
};

// --- Components ---

const Dice = ({ value, rolling, onClick, disabled }: { value: number; rolling: boolean; onClick: () => void; disabled: boolean }) => {
  const renderDots = () => {
    const dots = [];
    const positions = [
      [false, false, false, false, true, false, false, false, false], // 1
      [true, false, false, false, false, false, false, false, true], // 2
      [true, false, false, false, true, false, false, false, true], // 3
      [true, false, true, false, false, false, true, false, true], // 4
      [true, false, true, false, true, false, true, false, true], // 5
      [true, false, true, true, false, true, true, false, true], // 6
    ][value - 1];

    return positions.map((active, i) => (
      <div key={i} className={cn("w-full h-full rounded-full", active ? "bg-slate-800" : "bg-transparent")} />
    ));
  };

  return (
    <div className="dice-container">
      <motion.div
        whileHover={!disabled ? { scale: 1.05 } : {}}
        whileTap={!disabled ? { scale: 0.95 } : {}}
        onClick={!disabled ? onClick : undefined}
        className={cn(
          "dice bg-white border-2 border-slate-200",
          rolling && "rolling",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {renderDots()}
      </motion.div>
    </div>
  );
};

export default function App() {
  const [mode, setMode] = useState<'MENU' | 'OFFLINE' | 'ONLINE_LOBBY' | 'ONLINE_GAME'>('MENU');
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('Player');
  const [players, setPlayers] = useState<Player[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [turn, setTurn] = useState<Color>('red');
  const [diceValue, setDiceValue] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [canRoll, setCanRoll] = useState(true);
  const [winner, setWinner] = useState<Color | null>(null);
  const [copied, setCopied] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);

  // Initialize Pieces
  const initPieces = () => {
    const initialPieces: Piece[] = [];
    COLORS.forEach(color => {
      for (let i = 0; i < 4; i++) {
        initialPieces.push({ id: i, color, position: -1, isFinished: false });
      }
    });
    setPieces(initialPieces);
  };

  useEffect(() => {
    initPieces();
  }, []);

  // --- Multiplayer Logic ---
  const joinOnlineRoom = (id: string) => {
    socketRef.current = io();
    socketRef.current.emit('join-room', id, playerName);
    
    socketRef.current.on('player-joined', (updatedPlayers) => {
      setPlayers(updatedPlayers);
      if (updatedPlayers.length >= 2) {
        setMode('ONLINE_GAME');
      }
    });

    socketRef.current.on('game-update', (action) => {
      handleGameAction(action, true);
    });

    setMode('ONLINE_LOBBY');
  };

  const handleGameAction = (action: any, isRemote = false) => {
    if (!isRemote && socketRef.current) {
      socketRef.current.emit('game-action', roomId, action);
    }

    if (action.type === 'ROLL') {
      setDiceValue(action.value);
      // Logic for movement would follow
    }
  };

  const rollDice = () => {
    if (!canRoll) return;
    setIsRolling(true);
    setCanRoll(false);

    setTimeout(() => {
      const newValue = Math.floor(Math.random() * 6) + 1;
      setDiceValue(newValue);
      setIsRolling(false);
      
      // Check if any move is possible
      const possibleMoves = pieces.filter(p => p.color === turn && canMove(p, newValue));
      
      if (possibleMoves.length === 0) {
        setTimeout(() => nextTurn(), 1000);
      } else if (possibleMoves.length === 1 && possibleMoves[0].position === -1 && newValue !== 6) {
         // Auto skip if only piece is at home and no 6
         setTimeout(() => nextTurn(), 1000);
      }
    }, 600);
  };

  const nextTurn = () => {
    const currentIndex = COLORS.indexOf(turn);
    const nextIndex = (currentIndex + 1) % 4;
    setTurn(COLORS[nextIndex]);
    setCanRoll(true);
  };

  const canMove = (piece: Piece, roll: number) => {
    if (piece.isFinished) return false;
    if (piece.position === -1) return roll === 6;
    if (piece.position >= 52) return piece.position + roll <= 58;
    return true;
  };

  const movePiece = (pieceId: number, color: Color) => {
    if (isRolling || turn !== color || canRoll) return;
    
    const pieceIndex = pieces.findIndex(p => p.id === pieceId && p.color === color);
    const piece = pieces[pieceIndex];
    
    if (!canMove(piece, diceValue)) return;

    const newPieces = [...pieces];
    let newPos = piece.position;

    if (piece.position === -1) {
      newPos = 0; // Enter track
    } else {
      newPos += diceValue;
    }

    // Check for win
    if (newPos === 58) {
      newPieces[pieceIndex] = { ...piece, position: newPos, isFinished: true };
      // Check if all pieces of this color are finished
      const colorFinished = newPieces.filter(p => p.color === color && p.isFinished).length === 4;
      if (colorFinished) setWinner(color);
    } else {
      newPieces[pieceIndex] = { ...piece, position: newPos };
      
      // Capturing logic (simplified)
      if (newPos < 52) {
        const globalPos = getGlobalPosition(color, newPos);
        newPieces.forEach((p, i) => {
          if (p.color !== color && p.position < 52 && p.position !== -1) {
            if (getGlobalPosition(p.color, p.position) === globalPos) {
              newPieces[i] = { ...p, position: -1 };
            }
          }
        });
      }
    }

    setPieces(newPieces);
    if (diceValue !== 6) {
      nextTurn();
    } else {
      setCanRoll(true);
    }
  };

  const getGlobalPosition = (color: Color, pos: number) => {
    if (pos === -1 || pos >= 52) return -1;
    return (START_POSITIONS[color] + pos) % TRACK_LENGTH;
  };

  const renderCell = (r: number, c: number) => {
    // Determine cell type and color
    let cellColor = 'bg-white';
    let isHome = false;
    let homeColor: Color | null = null;

    // Red Home
    if (r < 6 && c < 6) { cellColor = 'bg-red-500'; isHome = true; homeColor = 'red'; }
    // Green Home
    if (r < 6 && c > 8) { cellColor = 'bg-green-500'; isHome = true; homeColor = 'green'; }
    // Yellow Home
    if (r > 8 && c > 8) { cellColor = 'bg-yellow-400'; isHome = true; homeColor = 'yellow'; }
    // Blue Home
    if (r > 8 && c < 6) { cellColor = 'bg-blue-500'; isHome = true; homeColor = 'blue'; }

    // Center
    if (r >= 6 && r <= 8 && c >= 6 && c <= 8) cellColor = 'bg-slate-200';

    // Paths and Home Stretches
    if (r === 7 && c > 0 && c < 6) cellColor = 'bg-red-500';
    if (c === 7 && r > 0 && r < 6) cellColor = 'bg-green-500';
    if (r === 7 && c > 8 && c < 14) cellColor = 'bg-yellow-400';
    if (c === 7 && r > 8 && r < 14) cellColor = 'bg-blue-500';

    // Start positions
    if (r === 6 && c === 1) cellColor = 'bg-red-500';
    if (r === 1 && c === 8) cellColor = 'bg-green-500';
    if (r === 8 && c === 13) cellColor = 'bg-yellow-400';
    if (r === 13 && c === 6) cellColor = 'bg-blue-500';

    return (
      <div key={`${r}-${c}`} className={cn("ludo-cell border-[0.5px] border-slate-200", cellColor)}>
        {/* Render pieces in home */}
        {isHome && homeColor && (
          <div className="grid grid-cols-2 gap-2 p-4 w-full h-full bg-white/20 rounded-lg">
             {pieces.filter(p => p.color === homeColor && p.position === -1).map(p => (
               <div 
                key={p.id} 
                onClick={() => movePiece(p.id, p.color)}
                className={cn(
                  "piece", 
                  p.color === 'red' ? 'bg-red-600' : p.color === 'blue' ? 'bg-blue-600' : p.color === 'green' ? 'bg-green-600' : 'bg-yellow-500',
                  turn === p.color && !canRoll && diceValue === 6 && "active"
                )} 
               />
             ))}
          </div>
        )}
        
        {/* Render pieces on track (simplified mapping) */}
        {/* In a real implementation, we'd map track positions to grid coordinates */}
      </div>
    );
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {mode === 'MENU' && (
          <motion.div 
            key="menu"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center"
          >
            <div className="w-20 h-20 bg-red-500 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-red-200">
              <Dice5 className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-4xl font-black font-display tracking-tight mb-2">LUDO ROYALE</h1>
            <p className="text-slate-500 mb-10">Classic board game with a modern twist</p>

            <div className="space-y-4">
              <button 
                onClick={() => { setMode('OFFLINE'); initPieces(); }}
                className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95"
              >
                <User className="w-5 h-5" />
                PLAY OFFLINE
              </button>
              
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold text-slate-400"><span className="bg-white px-4">Or Online</span></div>
              </div>

              <div className="space-y-3">
                <input 
                  type="text" 
                  placeholder="Enter Player Name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none transition-all"
                />
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Room ID"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="flex-1 px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none transition-all"
                  />
                  <button 
                    onClick={() => roomId ? joinOnlineRoom(roomId) : setRoomId(Math.random().toString(36).substring(7))}
                    className="bg-blue-600 text-white px-6 rounded-2xl font-bold hover:bg-blue-500 transition-all"
                  >
                    {roomId ? 'JOIN' : 'CREATE'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {(mode === 'OFFLINE' || mode === 'ONLINE_GAME') && (
          <motion.div 
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-4xl flex flex-col lg:flex-row gap-8 items-center"
          >
            {/* Game Info Sidebar */}
            <div className="w-full lg:w-64 space-y-4 order-2 lg:order-1">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-4">Current Turn</h3>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-4 h-4 rounded-full",
                    turn === 'red' ? 'bg-red-500' : turn === 'blue' ? 'bg-blue-500' : turn === 'green' ? 'bg-green-500' : 'bg-yellow-400'
                  )} />
                  <span className="font-bold capitalize">{turn}'s Turn</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center gap-4">
                <Dice 
                  value={diceValue} 
                  rolling={isRolling} 
                  onClick={rollDice}
                  disabled={!canRoll}
                />
                <p className="text-xs text-slate-400 font-medium">
                  {canRoll ? "Tap to Roll" : "Move your piece"}
                </p>
              </div>

              {mode === 'ONLINE_GAME' && (
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-mono text-slate-600">{roomId}</span>
                  </div>
                  <button onClick={copyRoomId} className="p-2 hover:bg-slate-50 rounded-lg transition-colors">
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  </button>
                </div>
              )}

              <button 
                onClick={() => setMode('MENU')}
                className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 py-2 font-medium transition-colors"
              >
                <Home className="w-4 h-4" />
                Back to Menu
              </button>
            </div>

            {/* Ludo Board */}
            <div className="flex-1 w-full max-w-[600px] order-1 lg:order-2">
              <div className="ludo-board">
                {Array.from({ length: BOARD_SIZE }).map((_, r) => 
                  Array.from({ length: BOARD_SIZE }).map((_, c) => renderCell(r, c))
                )}
              </div>
            </div>
          </motion.div>
        )}

        {mode === 'ONLINE_LOBBY' && (
          <motion.div 
            key="lobby"
            className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center"
          >
            <Users className="w-16 h-16 text-blue-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-2">Waiting for Players...</h2>
            <p className="text-slate-500 mb-8">Share the room ID with your friends to start playing</p>
            
            <div className="bg-slate-50 p-6 rounded-2xl mb-8 flex items-center justify-between">
              <span className="text-2xl font-mono font-bold tracking-wider text-slate-800">{roomId}</span>
              <button onClick={copyRoomId} className="p-3 bg-white rounded-xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-all">
                {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-slate-400" />}
              </button>
            </div>

            <div className="space-y-3 mb-8">
              {players.map((p, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className={cn("w-3 h-3 rounded-full", p.color === 'red' ? 'bg-red-500' : p.color === 'blue' ? 'bg-blue-500' : p.color === 'green' ? 'bg-green-500' : 'bg-yellow-400')} />
                  <span className="font-bold">{p.name} {p.id === socketRef.current?.id && "(You)"}</span>
                </div>
              ))}
              {Array.from({ length: 4 - players.length }).map((_, i) => (
                <div key={i} className="p-3 border-2 border-dashed border-slate-100 rounded-xl text-slate-300 text-sm font-medium">
                  Waiting for player...
                </div>
              ))}
            </div>

            <button 
              onClick={() => setMode('MENU')}
              className="text-slate-400 font-bold hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Winner Modal */}
      <AnimatePresence>
        {winner && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-3xl p-10 text-center max-w-sm w-full"
            >
              <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-6" />
              <h2 className="text-3xl font-black font-display mb-2 uppercase tracking-tight">
                {winner} WINS!
              </h2>
              <p className="text-slate-500 mb-10">What a legendary game!</p>
              <button 
                onClick={() => { setWinner(null); setMode('MENU'); }}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95"
              >
                PLAY AGAIN
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
