/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, User, Dice5, RotateCcw, Home, Trophy, Share2, Copy, Check, MessageSquare, Smile, Home as HomeIcon, ArrowLeft } from 'lucide-react';
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
  coins: number;
  avatar: string;
}

const START_POSITIONS: Record<Color, number> = {
  red: 1,
  green: 14,
  yellow: 27,
  blue: 40
};

// Safe spots on the 52-cell track
const SAFE_SPOTS = [1, 9, 14, 22, 27, 35, 40, 48];

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
      <div key={i} className={cn("w-2 h-2 rounded-full", active ? "bg-slate-800" : "bg-transparent")} />
    ));
  };

  return (
    <motion.div
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={!disabled ? onClick : undefined}
      className={cn(
        "w-12 h-12 bg-white border-2 border-slate-200 rounded-xl grid grid-cols-3 grid-rows-3 p-2 gap-1 shadow-md cursor-pointer",
        rolling && "animate-bounce",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {renderDots()}
    </motion.div>
  );
};

const PlayerAvatar = ({ player, isActive, diceValue, isRolling, onRoll }: { player: Player; isActive: boolean; diceValue: number; isRolling: boolean; onRoll: () => void }) => {
  return (
    <div className={cn("flex items-center gap-3", player.color === 'blue' || player.color === 'yellow' ? 'flex-row-reverse' : 'flex-row')}>
      <div className="relative">
        <div className={cn("avatar-ring w-16 h-16 overflow-hidden border-2", isActive ? "border-white" : "border-transparent")}>
          <img src={player.avatar} alt={player.name} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
        </div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 coin-badge">
          <span className="text-yellow-200">●</span> {player.coins}
        </div>
        {isActive && (
          <div className="absolute -top-2 -right-2 flex gap-1">
            <div className="bg-white p-1 rounded-full shadow-sm"><MessageSquare className="w-3 h-3 text-slate-600" /></div>
            <div className="bg-white p-1 rounded-full shadow-sm"><Smile className="w-3 h-3 text-slate-600" /></div>
          </div>
        )}
      </div>
      
      {isActive && (
        <div className="flex items-center gap-2">
          {player.color === 'blue' || player.color === 'yellow' ? (
            <>
              <Dice value={diceValue} rolling={isRolling} onClick={onRoll} disabled={!isActive} />
              <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[12px] border-r-white drop-shadow-sm" />
            </>
          ) : (
            <>
              <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[12px] border-l-white drop-shadow-sm" />
              <Dice value={diceValue} rolling={isRolling} onClick={onRoll} disabled={!isActive} />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [isMobile, setIsMobile] = useState(true);
  const [mode, setMode] = useState<'MENU' | 'OFFLINE' | 'ONLINE_LOBBY' | 'ONLINE_GAME'>('MENU');
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('Player' + Math.floor(Math.random() * 1000));
  const [players, setPlayers] = useState<Player[]>([
    { id: '1', name: 'Player 1', color: 'red', isBot: false, coins: 1000, avatar: 'https://picsum.photos/seed/p1/100' },
    { id: '2', name: 'Player 2', color: 'green', isBot: false, coins: 1000, avatar: 'https://picsum.photos/seed/p2/100' },
    { id: '3', name: 'Player 3', color: 'yellow', isBot: false, coins: 1000, avatar: 'https://picsum.photos/seed/p3/100' },
    { id: '4', name: 'Player 4', color: 'blue', isBot: false, coins: 1000, avatar: 'https://picsum.photos/seed/p4/100' },
  ]);
  const [onlinePlayers, setOnlinePlayers] = useState<any[]>([]);
  const [myColor, setMyColor] = useState<Color | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [turn, setTurn] = useState<Color>('red');
  const [diceValue, setDiceValue] = useState(6);
  const [isRolling, setIsRolling] = useState(false);
  const [canRoll, setCanRoll] = useState(true);
  const [winner, setWinner] = useState<Color | null>(null);
  const [copied, setCopied] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);

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

  const rollDice = () => {
    if (!canRoll) return;
    if (mode === 'ONLINE_GAME' && turn !== myColor) return;

    setIsRolling(true);
    setCanRoll(false);

    setTimeout(() => {
      const newValue = Math.floor(Math.random() * 6) + 1;
      setDiceValue(newValue);
      setIsRolling(false);
      
      if (mode === 'ONLINE_GAME') {
        socketRef.current?.emit('game-action', roomId, { type: 'ROLL', value: newValue, turn });
      }

      const possibleMoves = pieces.filter(p => p.color === turn && canMove(p, newValue));
      if (possibleMoves.length === 0) {
        setTimeout(() => nextTurn(), 1000);
      }
    }, 600);
  };

  const nextTurn = () => {
    const currentIndex = COLORS.indexOf(turn);
    const nextIndex = (currentIndex + 1) % 4;
    const nextColor = COLORS[nextIndex];
    setTurn(nextColor);
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
    if (mode === 'ONLINE_GAME' && turn !== myColor) return;
    
    const pieceIndex = pieces.findIndex(p => p.id === pieceId && p.color === color);
    const piece = pieces[pieceIndex];
    if (!canMove(piece, diceValue)) return;

    if (mode === 'ONLINE_GAME') {
      socketRef.current?.emit('game-action', roomId, { type: 'MOVE', pieceId, color, diceValue });
    }

    executeMove(pieceId, color, diceValue);
  };

  const executeMove = (pieceId: number, color: Color, roll: number) => {
    const pieceIndex = pieces.findIndex(p => p.id === pieceId && p.color === color);
    const piece = pieces[pieceIndex];
    const newPieces = [...pieces];
    let newPos = piece.position === -1 ? 0 : piece.position + roll;

    if (newPos === 58) {
      newPieces[pieceIndex] = { ...piece, position: newPos, isFinished: true };
      if (newPieces.filter(p => p.color === color && p.isFinished).length === 4) setWinner(color);
    } else {
      newPieces[pieceIndex] = { ...piece, position: newPos };
    }

    setPieces(newPieces);
    if (roll !== 6) nextTurn(); else setCanRoll(true);
  };

  const joinOnlineRoom = () => {
    if (!roomId || !playerName) return;
    socketRef.current = io();
    socketRef.current.emit('join-room', roomId, playerName);

    socketRef.current.on('player-joined', (roomPlayers: any[]) => {
      setOnlinePlayers(roomPlayers);
      const me = roomPlayers.find(p => p.id === socketRef.current?.id);
      if (me) setMyColor(me.color);
    });

    socketRef.current.on('player-left', (roomPlayers: any[]) => {
      setOnlinePlayers(roomPlayers);
    });

    socketRef.current.on('game-update', (action: any) => {
      if (action.type === 'ROLL') {
        setIsRolling(true);
        setTimeout(() => {
          setDiceValue(action.value);
          setIsRolling(false);
          // Check if the current turn player has any moves
          const possibleMoves = pieces.filter(p => p.color === action.turn && canMove(p, action.value));
          if (possibleMoves.length === 0) {
            setTimeout(() => nextTurn(), 1000);
          }
        }, 600);
      } else if (action.type === 'MOVE') {
        executeMove(action.pieceId, action.color, action.diceValue);
      } else if (action.type === 'START_GAME') {
        setMode('ONLINE_GAME');
        initPieces();
      }
    });

    setMode('ONLINE_LOBBY');
  };

  const startOnlineGame = () => {
    socketRef.current?.emit('game-action', roomId, { type: 'START_GAME' });
    setMode('ONLINE_GAME');
    initPieces();
  };

  const renderGrid = () => {
    const cells = [];
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        // Home Areas
        if (r < 6 && c < 6) {
          if (r === 0 && c === 0) cells.push(<div key="red-home" className="home-area bg-red-600" style={{ gridArea: '1 / 1 / 7 / 7' }}>
            {pieces.filter(p => p.color === 'red' && p.position === -1).map(p => (
              <div key={p.id} className="home-inner"><div onClick={() => movePiece(p.id, 'red')} className={cn("piece bg-red-500", turn === 'red' && !canRoll && diceValue === 6 && "active")} /></div>
            ))}
          </div>);
          continue;
        }
        if (r < 6 && c > 8) {
          if (r === 0 && c === 9) cells.push(<div key="green-home" className="home-area bg-green-600" style={{ gridArea: '1 / 10 / 7 / 16' }}>
            {pieces.filter(p => p.color === 'green' && p.position === -1).map(p => (
              <div key={p.id} className="home-inner"><div onClick={() => movePiece(p.id, 'green')} className={cn("piece bg-green-500", turn === 'green' && !canRoll && diceValue === 6 && "active")} /></div>
            ))}
          </div>);
          continue;
        }
        if (r > 8 && c < 6) {
          if (r === 9 && c === 0) cells.push(<div key="blue-home" className="home-area bg-blue-600" style={{ gridArea: '10 / 1 / 16 / 7' }}>
            {pieces.filter(p => p.color === 'blue' && p.position === -1).map(p => (
              <div key={p.id} className="home-inner"><div onClick={() => movePiece(p.id, 'blue')} className={cn("piece bg-blue-500", turn === 'blue' && !canRoll && diceValue === 6 && "active")} /></div>
            ))}
          </div>);
          continue;
        }
        if (r > 8 && c > 8) {
          if (r === 9 && c === 9) cells.push(<div key="yellow-home" className="home-area bg-yellow-500" style={{ gridArea: '10 / 10 / 16 / 16' }}>
            {pieces.filter(p => p.color === 'yellow' && p.position === -1).map(p => (
              <div key={p.id} className="home-inner"><div onClick={() => movePiece(p.id, 'yellow')} className={cn("piece bg-yellow-400", turn === 'yellow' && !canRoll && diceValue === 6 && "active")} /></div>
            ))}
          </div>);
          continue;
        }

        // Center Home
        if (r >= 6 && r <= 8 && c >= 6 && c <= 8) {
          if (r === 6 && c === 6) cells.push(
            <div key="center" className="center-home" style={{ gridArea: '7 / 7 / 10 / 10' }}>
              <div className="center-triangle border-l-[50px] border-l-red-500 border-t-[50px] border-t-transparent border-b-[50px] border-b-transparent left-0" />
              <div className="center-triangle border-r-[50px] border-r-yellow-400 border-t-[50px] border-t-transparent border-b-[50px] border-b-transparent right-0" />
              <div className="center-triangle border-t-[50px] border-t-green-500 border-l-[50px] border-l-transparent border-r-[50px] border-r-transparent top-0" />
              <div className="center-triangle border-b-[50px] border-b-blue-500 border-l-[50px] border-l-transparent border-r-[50px] border-r-transparent bottom-0" />
              <div className="center-house"><HomeIcon className="w-6 h-6 text-emerald-500" /></div>
            </div>
          );
          continue;
        }

        // Paths
        let cellClass = "ludo-cell";
        if ((r === 7 && c > 0 && c < 6) || (r === 6 && c === 1)) cellClass += " bg-red-500";
        if ((c === 7 && r > 0 && r < 6) || (r === 1 && c === 8)) cellClass += " bg-green-500";
        if ((r === 7 && c > 8 && c < 14) || (r === 8 && c === 13)) cellClass += " bg-yellow-400";
        if ((c === 7 && r > 8 && r < 14) || (r === 13 && c === 6)) cellClass += " bg-blue-500";

        // Safe Spots
        const isSafe = (r === 6 && c === 1) || (r === 8 && c === 2) || (r === 1 && c === 6) || (r === 2 && c === 8) || (r === 8 && c === 13) || (r === 6 && c === 12) || (r === 13 && c === 8) || (r === 12 && c === 6);
        if (isSafe) cellClass += " safe-star";

        // Arrows
        if (r === 6 && c === 1) cellClass += " arrow rotate-180";
        if (r === 1 && c === 8) cellClass += " arrow rotate-90";
        if (r === 8 && c === 13) cellClass += " arrow rotate-0";
        if (r === 13 && c === 6) cellClass += " arrow -rotate-90";

        cells.push(<div key={`${r}-${c}`} className={cellClass} />);
      }
    }
    return cells;
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4">
      {mode === 'MENU' ? (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-10 text-center shadow-2xl max-w-sm w-full">
          <Dice5 className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h1 className="text-4xl font-black mb-8 tracking-tighter text-slate-900">LUDO ROYALE</h1>
          <div className="space-y-4">
            <button onClick={() => { setMode('OFFLINE'); initPieces(); }} className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-red-200 active:scale-95 transition-all">LOCAL PLAY</button>
            <button onClick={() => setMode('ONLINE_LOBBY')} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-blue-200 active:scale-95 transition-all">ONLINE PLAY</button>
          </div>
        </motion.div>
      ) : mode === 'ONLINE_LOBBY' ? (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-sm w-full">
          <h2 className="text-2xl font-black mb-6 text-slate-900">ONLINE LOBBY</h2>
          <div className="space-y-4 mb-8">
            <input 
              type="text" 
              placeholder="Your Name" 
              value={playerName} 
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 focus:border-blue-500 outline-none transition-all text-slate-800"
            />
            <input 
              type="text" 
              placeholder="Room ID" 
              value={roomId} 
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 focus:border-blue-500 outline-none transition-all text-slate-800"
            />
            <button onClick={joinOnlineRoom} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold">JOIN / CREATE ROOM</button>
          </div>

          {onlinePlayers.length > 0 && (
            <div className="text-left mb-6">
              <p className="text-sm font-bold text-slate-500 mb-2">PLAYERS IN ROOM ({onlinePlayers.length}/4)</p>
              <div className="space-y-2">
                {onlinePlayers.map((p, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full", `bg-${p.color}-500`)} />
                      <span className="font-bold text-slate-700">{p.name}</span>
                    </div>
                    {p.id === socketRef.current?.id && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase">You</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {onlinePlayers.length >= 2 ? (
            onlinePlayers[0].id === socketRef.current?.id ? (
              <button onClick={startOnlineGame} className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-green-200 active:scale-95 transition-all">START GAME</button>
            ) : (
              <div className="bg-slate-100 p-4 rounded-2xl text-slate-500 font-bold animate-pulse">WAITING FOR HOST TO START...</div>
            )
          ) : (
            <div className="bg-slate-100 p-4 rounded-2xl text-slate-500 font-bold">WAITING FOR MORE PLAYERS...</div>
          )}
          
          <button onClick={() => setMode('MENU')} className="mt-4 text-slate-400 font-bold flex items-center gap-2 mx-auto"><ArrowLeft className="w-4 h-4" /> Back to Menu</button>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
          {/* Top Bar */}
          <div className="w-full max-w-[600px] flex justify-between items-center px-4">
            <button onClick={() => {
              if (mode === 'ONLINE_GAME') socketRef.current?.disconnect();
              setMode('MENU');
            }} className="bg-blue-500 p-2 rounded-lg shadow-md"><ArrowLeft className="w-6 h-6 text-white" /></button>
            <div className="bg-blue-900/80 border-2 border-yellow-500 rounded-xl px-8 py-1 flex items-center gap-4 shadow-lg">
              <span className="text-yellow-400 font-black italic text-xl">{mode === 'ONLINE_GAME' ? 'Online' : 'Local'}</span>
              <div className="bg-black/40 px-4 py-1 rounded-lg text-white font-bold text-sm">{roomId || 'PASS & PLAY'}</div>
            </div>
            <div className="w-10" />
          </div>

          <div className="relative">
            {/* Player Avatars */}
            <div className="absolute -top-20 -left-10">
              <PlayerAvatar 
                player={mode === 'ONLINE_GAME' ? (onlinePlayers.find(p => p.color === 'green') || players[2]) : players[2]} 
                isActive={turn === 'green'} 
                diceValue={diceValue} 
                isRolling={isRolling} 
                onRoll={rollDice} 
              />
            </div>
            <div className="absolute -top-20 -right-10">
              <PlayerAvatar 
                player={mode === 'ONLINE_GAME' ? (onlinePlayers.find(p => p.color === 'yellow') || players[1]) : players[1]} 
                isActive={turn === 'yellow'} 
                diceValue={diceValue} 
                isRolling={isRolling} 
                onRoll={rollDice} 
              />
            </div>
            <div className="absolute -bottom-20 -left-10">
              <PlayerAvatar 
                player={mode === 'ONLINE_GAME' ? (onlinePlayers.find(p => p.color === 'red') || players[0]) : players[0]} 
                isActive={turn === 'red'} 
                diceValue={diceValue} 
                isRolling={isRolling} 
                onRoll={rollDice} 
              />
            </div>
            <div className="absolute -bottom-20 -right-10">
              <PlayerAvatar 
                player={mode === 'ONLINE_GAME' ? (onlinePlayers.find(p => p.color === 'blue') || players[3]) : players[3]} 
                isActive={turn === 'blue'} 
                diceValue={diceValue} 
                isRolling={isRolling} 
                onRoll={rollDice} 
              />
            </div>

            <div className="ludo-container">
              {/* Name Plates */}
              <div className="player-plate top-0 left-0 -translate-y-full">
                {mode === 'ONLINE_GAME' ? (onlinePlayers.find(p => p.color === 'red')?.name || 'Waiting...') : 'Player 1'}
              </div>
              <div className="player-plate top-0 right-0 -translate-y-full">
                {mode === 'ONLINE_GAME' ? (onlinePlayers.find(p => p.color === 'yellow')?.name || 'Waiting...') : 'Player 3'}
              </div>
              
              <div className="ludo-board">
                {renderGrid()}
              </div>
            </div>
          </div>

          {mode === 'ONLINE_GAME' && myColor && (
            <div className="mt-4 bg-white/10 backdrop-blur-sm px-6 py-2 rounded-full border border-white/20">
              <p className="text-white font-bold">You are playing as <span className={cn("uppercase", `text-${myColor}-400`)}>{myColor}</span></p>
            </div>
          )}
        </div>
      )}

      {/* Winner Modal */}
      <AnimatePresence>
        {winner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-3xl p-10 text-center max-w-sm w-full">
              <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-6" />
              <h2 className="text-3xl font-black mb-2 uppercase">{winner} WINS!</h2>
              <button onClick={() => { setWinner(null); setMode('MENU'); }} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold mt-8">PLAY AGAIN</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
