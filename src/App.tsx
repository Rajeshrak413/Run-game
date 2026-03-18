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

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!isMobile) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-24 h-24 bg-red-500 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-red-500/20">
          <Dice5 className="w-14 h-14 text-white" />
        </div>
        <h1 className="text-3xl font-black text-white mb-4 tracking-tight">MOBILE ONLY</h1>
        <p className="text-slate-400 max-w-xs leading-relaxed">
          Ludo Royale is optimized for mobile devices. Please open this link on your smartphone to play.
        </p>
        <div className="mt-10 p-4 bg-slate-800 rounded-2xl border border-slate-700">
          <img 
            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(window.location.href)}`} 
            alt="QR Code" 
            className="w-32 h-32 rounded-lg"
          />
          <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest font-bold">Scan to play on mobile</p>
        </div>
      </div>
    );
  }

  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('Player');
  const [players, setPlayers] = useState<Player[]>([
    { id: '1', name: 'Player553', color: 'red', isBot: false, coins: 1000, avatar: 'https://picsum.photos/seed/p1/100' },
    { id: '2', name: 'Nnewanga', color: 'yellow', isBot: true, coins: 11000, avatar: 'https://picsum.photos/seed/p2/100' },
    { id: '3', name: 'Bot 1', color: 'green', isBot: true, coins: 500, avatar: 'https://picsum.photos/seed/p3/100' },
    { id: '4', name: 'Bot 2', color: 'blue', isBot: true, coins: 750, avatar: 'https://picsum.photos/seed/p4/100' },
  ]);
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
    setIsRolling(true);
    setCanRoll(false);

    setTimeout(() => {
      const newValue = Math.floor(Math.random() * 6) + 1;
      setDiceValue(newValue);
      setIsRolling(false);
      
      const possibleMoves = pieces.filter(p => p.color === turn && canMove(p, newValue));
      if (possibleMoves.length === 0) {
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
    let newPos = piece.position === -1 ? 0 : piece.position + diceValue;

    if (newPos === 58) {
      newPieces[pieceIndex] = { ...piece, position: newPos, isFinished: true };
      if (newPieces.filter(p => p.color === color && p.isFinished).length === 4) setWinner(color);
    } else {
      newPieces[pieceIndex] = { ...piece, position: newPos };
      // Capture logic would go here
    }

    setPieces(newPieces);
    if (diceValue !== 6) nextTurn(); else setCanRoll(true);
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
          <button onClick={() => { setMode('OFFLINE'); initPieces(); }} className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-red-200 active:scale-95 transition-all">PLAY NOW</button>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
          {/* Top Bar */}
          <div className="w-full max-w-[600px] flex justify-between items-center px-4">
            <button onClick={() => setMode('MENU')} className="bg-blue-500 p-2 rounded-lg shadow-md"><ArrowLeft className="w-6 h-6 text-white" /></button>
            <div className="bg-blue-900/80 border-2 border-yellow-500 rounded-xl px-8 py-1 flex items-center gap-4 shadow-lg">
              <span className="text-yellow-400 font-black italic text-xl">Quick</span>
              <div className="bg-black/40 px-4 py-1 rounded-lg text-white font-bold text-sm">1000</div>
            </div>
            <div className="w-10" />
          </div>

          <div className="relative">
            {/* Player Avatars */}
            <div className="absolute -top-20 -left-10"><PlayerAvatar player={players[2]} isActive={turn === 'green'} diceValue={diceValue} isRolling={isRolling} onRoll={rollDice} /></div>
            <div className="absolute -top-20 -right-10"><PlayerAvatar player={players[1]} isActive={turn === 'yellow'} diceValue={diceValue} isRolling={isRolling} onRoll={rollDice} /></div>
            <div className="absolute -bottom-20 -left-10"><PlayerAvatar player={players[0]} isActive={turn === 'red'} diceValue={diceValue} isRolling={isRolling} onRoll={rollDice} /></div>
            <div className="absolute -bottom-20 -right-10"><PlayerAvatar player={players[3]} isActive={turn === 'blue'} diceValue={diceValue} isRolling={isRolling} onRoll={rollDice} /></div>

            <div className="ludo-container">
              {/* Name Plates */}
              <div className="player-plate top-0 left-0 -translate-y-full">Player553</div>
              <div className="player-plate top-0 right-0 -translate-y-full">Nnewanga</div>
              
              <div className="ludo-board">
                {renderGrid()}
              </div>
            </div>
          </div>
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
