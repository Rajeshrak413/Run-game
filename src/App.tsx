/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  User, 
  Dice5, 
  RotateCcw, 
  Home, 
  Trophy, 
  Share2, 
  Copy, 
  Check, 
  MessageSquare, 
  Smile, 
  Home as HomeIcon, 
  ArrowLeft,
  Volume2,
  VolumeX,
  Music,
  Music2
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Constants ---
const SOUNDS = {
  DICE: 'https://assets.mixkit.co/sfx/preview/mixkit-dice-roll-on-wooden-table-2759.mp3',
  MOVE: 'https://assets.mixkit.co/sfx/preview/mixkit-interface-click-1126.mp3',
  CAPTURE: 'https://assets.mixkit.co/sfx/preview/mixkit-boxing-punch-2051.mp3',
  FINISH: 'https://assets.mixkit.co/sfx/preview/mixkit-winning-chime-2064.mp3',
  WIN: 'https://assets.mixkit.co/sfx/preview/mixkit-clapping-hands-crowd-applause-527.mp3',
  BGM: 'https://assets.mixkit.co/music/preview/mixkit-game-show-suspense-944.mp3'
};

const COLORS = ['red', 'green', 'yellow', 'blue'] as const;
type Color = typeof COLORS[number];

interface Piece {
  id: number;
  color: Color;
  position: number; // -1 for home, 0-56 for path, 57 for finish
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

// Full board path coordinates (52 cells)
const BOARD_PATH: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0]
];

const START_INDEX: Record<Color, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39
};

const HOME_STRETCH: Record<Color, [number, number][]> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]
};

const SAFE_SPOTS_COORDS: [number, number][] = [
  [6, 1], [8, 2], [1, 6], [2, 8], [8, 13], [6, 12], [13, 8], [12, 6]
];

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
      <div key={i} className={cn("w-1.5 h-1.5 rounded-full", active ? "bg-slate-800" : "bg-transparent")} />
    ));
  };

  return (
    <motion.div
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={!disabled ? onClick : undefined}
      className={cn(
        "w-10 h-10 bg-white border-2 border-slate-200 rounded-lg grid grid-cols-3 grid-rows-3 p-1.5 gap-0.5 shadow-md cursor-pointer",
        rolling && "animate-bounce",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {renderDots()}
    </motion.div>
  );
};

export default function App() {
  const [isMobile, setIsMobile] = useState(true);
  const [mode, setMode] = useState<'MENU' | 'OFFLINE_SETUP' | 'OFFLINE' | 'ONLINE_LOBBY' | 'ONLINE_GAME'>('MENU');
  const [offlinePlayerCount, setOfflinePlayerCount] = useState(2);
  const [offlinePlayerNames, setOfflinePlayerNames] = useState(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  // --- Sound Effects ---
  const playSound = useCallback((soundUrl: string) => {
    if (!soundEnabled) return;
    const audio = new Audio(soundUrl);
    audio.volume = 0.5;
    audio.play().catch(() => {});
  }, [soundEnabled]);

  // --- Music Management ---
  useEffect(() => {
    if (!bgmRef.current) {
      bgmRef.current = new Audio(SOUNDS.BGM);
      bgmRef.current.loop = true;
      bgmRef.current.volume = 0.2;
    }

    if (musicEnabled && mode !== 'MENU') {
      bgmRef.current.play().catch(() => {});
    } else {
      bgmRef.current.pause();
    }

    return () => {
      bgmRef.current?.pause();
    };
  }, [musicEnabled, mode]);
  const [copied, setCopied] = useState(false);
  const [lastRollTime, setLastRollTime] = useState(0);
  
  const socketRef = useRef<Socket | null>(null);
  const piecesRef = useRef<Piece[]>([]);
  useEffect(() => {
    piecesRef.current = pieces;
  }, [pieces]);

  const turnRef = useRef<Color>(turn);
  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);

  const diceValueRef = useRef<number>(diceValue);
  useEffect(() => {
    diceValueRef.current = diceValue;
  }, [diceValue]);

  const getPieceCoords = (piece: Piece): [number, number] | null => {
    if (piece.position === -1) return null;
    if (piece.position < 51) {
      const absIdx = (START_INDEX[piece.color] + piece.position) % 52;
      return BOARD_PATH[absIdx];
    }
    if (piece.position < 57) {
      return HOME_STRETCH[piece.color][piece.position - 51];
    }
    return [7, 7]; // Center
  };

  const isSafeSpot = (r: number, c: number) => {
    return SAFE_SPOTS_COORDS.some(([sr, sc]) => sr === r && sc === c);
  };

  const initPieces = () => {
    const initialPieces: Piece[] = [];
    COLORS.forEach(color => {
      for (let i = 0; i < 4; i++) {
        initialPieces.push({ id: i, color, position: -1, isFinished: false });
      }
    });
    setPieces(initialPieces);
  };

  const startOfflineGame = () => {
    const newPlayers: Player[] = [];
    const colorsToUse = offlinePlayerCount === 2 ? ['red', 'yellow'] : (offlinePlayerCount === 3 ? ['red', 'green', 'yellow'] : COLORS);
    
    for (let i = 0; i < offlinePlayerCount; i++) {
      newPlayers.push({
        id: (i + 1).toString(),
        name: offlinePlayerNames[i],
        color: colorsToUse[i] as Color,
        isBot: false,
        coins: 1000,
        avatar: `https://picsum.photos/seed/p${i + 1}/100`
      });
    }
    setPlayers(newPlayers);
    setTurn('red');
    setWinner(null);
    setCanRoll(true);
    setDiceValue(6);
    initPieces();
    setMode('OFFLINE');
  };

  useEffect(() => {
    initPieces();
  }, []);

  // Bot Logic
  useEffect(() => {
    if (mode === 'OFFLINE' && !winner && !isRolling && canRoll) {
      const currentPlayer = players.find(p => p.color === turn);
      if (currentPlayer?.isBot) {
        const timer = setTimeout(() => rollDice(), 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [turn, mode, winner, isRolling, canRoll]);

  useEffect(() => {
    if (mode === 'OFFLINE' && !winner && !isRolling && !canRoll) {
      const currentPlayer = players.find(p => p.color === turn);
      if (currentPlayer?.isBot) {
        const possibleMoves = pieces.filter(p => p.color === turn && canMove(p, diceValue));
        if (possibleMoves.length > 0) {
          const randomPiece = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
          const timer = setTimeout(() => movePiece(randomPiece.id, turn), 1000);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [turn, mode, winner, isRolling, canRoll, diceValue]);

  const rollDice = () => {
    if (!canRoll) return;
    if (mode === 'ONLINE_GAME' && turn !== myColor) return;
    if (Date.now() - lastRollTime < 1000) return;

    setLastRollTime(Date.now());
    setIsRolling(true);
    setCanRoll(false);
    playSound(SOUNDS.DICE);

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

  const activeColors = mode === 'OFFLINE' 
    ? (offlinePlayerCount === 2 ? ['red', 'yellow'] : (offlinePlayerCount === 3 ? ['red', 'green', 'yellow'] : COLORS))
    : COLORS;

  const nextTurn = () => {
    setTurn(prevTurn => {
      const currentActiveIndex = activeColors.indexOf(prevTurn);
      const nextActiveIndex = (currentActiveIndex + 1) % activeColors.length;
      return activeColors[nextActiveIndex] as Color;
    });
    setCanRoll(true);
  };

  const canMove = (piece: Piece, roll: number) => {
    if (piece.isFinished) return false;
    if (piece.position === -1) return roll === 6;
    if (piece.position + roll > 57) return false;
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
    setPieces(prevPieces => {
      const pieceIndex = prevPieces.findIndex(p => p.id === pieceId && p.color === color);
      if (pieceIndex === -1) return prevPieces;
      
      playSound(SOUNDS.MOVE);
      
      const piece = prevPieces[pieceIndex];
      const newPieces = [...prevPieces];
      let newPos = piece.position === -1 ? 0 : piece.position + roll;

      let captured = false;
      if (newPos === 57) {
        newPieces[pieceIndex] = { ...piece, position: newPos, isFinished: true };
        playSound(SOUNDS.FINISH);
        if (newPieces.filter(p => p.color === color && p.isFinished).length === 4) {
          setWinner(color);
          playSound(SOUNDS.WIN);
        }
      } else {
        newPieces[pieceIndex] = { ...piece, position: newPos };
        
        // Capture Logic
        if (newPos < 51) {
          const coords = getPieceCoords(newPieces[pieceIndex]);
          if (coords && !isSafeSpot(coords[0], coords[1])) {
            newPieces.forEach((p, idx) => {
              if (p.color !== color && p.position !== -1 && !p.isFinished) {
                const otherCoords = getPieceCoords(p);
                if (otherCoords && otherCoords[0] === coords[0] && otherCoords[1] === coords[1]) {
                  newPieces[idx] = { ...p, position: -1 };
                  captured = true;
                  playSound(SOUNDS.CAPTURE);
                }
              }
            });
          }
        }
      }

      if (roll === 6 || captured) {
        setCanRoll(true);
      } else {
        // We need to trigger nextTurn but we are inside setPieces
        // Using a timeout to avoid state update during render
        setTimeout(() => nextTurn(), 0);
      }
      
      return newPieces;
    });
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
          
          const possibleMoves = piecesRef.current.filter(p => p.color === action.turn && canMove(p, action.value));
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
          if (r === 0 && c === 0) {
            const player = players.find(p => p.color === 'red');
            const isActive = turn === 'red';
            cells.push(
              <div key="red-home" className={cn("home-area bg-red-600", isActive && "ring-4 ring-white ring-inset")} style={{ gridArea: '1 / 1 / 7 / 7' }}>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                  <img src={player?.avatar} className="w-16 h-16 rounded-full grayscale opacity-50" referrerPolicy="no-referrer" />
                  <span className="font-black text-white text-[10px] mt-1 uppercase tracking-widest">{player?.name}</span>
                </div>
                {pieces.filter(p => p.color === 'red' && p.position === -1).map(p => (
                  <div key={p.id} className="home-inner">
                    <div onClick={() => movePiece(p.id, 'red')} className={cn("piece bg-red-500", isActive && !canRoll && (diceValue === 6 || p.position !== -1) && "active")} />
                  </div>
                ))}
                {isActive && canRoll && (
                  <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-auto">
                    <Dice value={diceValue} rolling={isRolling} onClick={rollDice} disabled={false} />
                  </div>
                )}
              </div>
            );
          }
          continue;
        }
        if (r < 6 && c > 8) {
          if (r === 0 && c === 9) {
            const player = players.find(p => p.color === 'green');
            const isActive = turn === 'green';
            const isVisible = mode === 'ONLINE_GAME' || activeColors.includes('green');
            cells.push(
              <div key="green-home" className={cn("home-area bg-green-600", isActive && "ring-4 ring-white ring-inset", !isVisible && "opacity-10")} style={{ gridArea: '1 / 10 / 7 / 16' }}>
                {isVisible && (
                  <>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                      <img src={player?.avatar} className="w-16 h-16 rounded-full grayscale opacity-50" referrerPolicy="no-referrer" />
                      <span className="font-black text-white text-[10px] mt-1 uppercase tracking-widest">{player?.name}</span>
                    </div>
                    {pieces.filter(p => p.color === 'green' && p.position === -1).map(p => (
                      <div key={p.id} className="home-inner">
                        <div onClick={() => movePiece(p.id, 'green')} className={cn("piece bg-green-500", isActive && !canRoll && (diceValue === 6 || p.position !== -1) && "active")} />
                      </div>
                    ))}
                    {isActive && canRoll && (
                      <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-auto">
                        <Dice value={diceValue} rolling={isRolling} onClick={rollDice} disabled={false} />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          }
          continue;
        }
        if (r > 8 && c < 6) {
          if (r === 9 && c === 0) {
            const player = players.find(p => p.color === 'blue');
            const isActive = turn === 'blue';
            const isVisible = mode === 'ONLINE_GAME' || activeColors.includes('blue');
            cells.push(
              <div key="blue-home" className={cn("home-area bg-blue-600", isActive && "ring-4 ring-white ring-inset", !isVisible && "opacity-10")} style={{ gridArea: '10 / 1 / 16 / 7' }}>
                {isVisible && (
                  <>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                      <img src={player?.avatar} className="w-16 h-16 rounded-full grayscale opacity-50" referrerPolicy="no-referrer" />
                      <span className="font-black text-white text-[10px] mt-1 uppercase tracking-widest">{player?.name}</span>
                    </div>
                    {pieces.filter(p => p.color === 'blue' && p.position === -1).map(p => (
                      <div key={p.id} className="home-inner">
                        <div onClick={() => movePiece(p.id, 'blue')} className={cn("piece bg-blue-500", isActive && !canRoll && (diceValue === 6 || p.position !== -1) && "active")} />
                      </div>
                    ))}
                    {isActive && canRoll && (
                      <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-auto">
                        <Dice value={diceValue} rolling={isRolling} onClick={rollDice} disabled={false} />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          }
          continue;
        }
        if (r > 8 && c > 8) {
          if (r === 9 && c === 9) {
            const player = players.find(p => p.color === 'yellow');
            const isActive = turn === 'yellow';
            const isVisible = mode === 'ONLINE_GAME' || activeColors.includes('yellow');
            cells.push(
              <div key="yellow-home" className={cn("home-area bg-yellow-500", isActive && "ring-4 ring-white ring-inset", !isVisible && "opacity-10")} style={{ gridArea: '10 / 10 / 16 / 16' }}>
                {isVisible && (
                  <>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                      <img src={player?.avatar} className="w-16 h-16 rounded-full grayscale opacity-50" referrerPolicy="no-referrer" />
                      <span className="font-black text-white text-[10px] mt-1 uppercase tracking-widest">{player?.name}</span>
                    </div>
                    {pieces.filter(p => p.color === 'yellow' && p.position === -1).map(p => (
                      <div key={p.id} className="home-inner">
                        <div onClick={() => movePiece(p.id, 'yellow')} className={cn("piece bg-yellow-400", isActive && !canRoll && (diceValue === 6 || p.position !== -1) && "active")} />
                      </div>
                    ))}
                    {isActive && canRoll && (
                      <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-auto">
                        <Dice value={diceValue} rolling={isRolling} onClick={rollDice} disabled={false} />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          }
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
              {pieces.filter(p => p.isFinished).map(p => (
                <div key={`${p.color}-${p.id}`} className={cn("piece absolute scale-50", `bg-${p.color === 'yellow' ? 'yellow-400' : p.color + '-500'}`)} />
              ))}
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
        const isSafe = isSafeSpot(r, c);
        if (isSafe) cellClass += " safe-star";

        // Arrows
        if (r === 6 && c === 1) cellClass += " arrow rotate-180";
        if (r === 1 && c === 8) cellClass += " arrow rotate-90";
        if (r === 8 && c === 13) cellClass += " arrow rotate-0";
        if (r === 13 && c === 6) cellClass += " arrow -rotate-90";

        // Pieces on path
        const piecesOnCell = pieces.filter(p => {
          const coords = getPieceCoords(p);
          return coords && coords[0] === r && coords[1] === c && !p.isFinished;
        });

        cells.push(
          <div key={`${r}-${c}`} className={cellClass}>
            {piecesOnCell.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-0.5 p-0.5">
                {piecesOnCell.map(p => (
                  <motion.div 
                    key={`${p.color}-${p.id}`} 
                    onClick={() => movePiece(p.id, p.color)} 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={cn(
                      "piece", 
                      `bg-${p.color === 'yellow' ? 'yellow-400' : p.color + '-500'}`,
                      turn === p.color && !canRoll && canMove(p, diceValue) && "active"
                    )} 
                  />
                ))}
              </div>
            )}
          </div>
        );
      }
    }
    return cells;
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4">
      {mode === 'MENU' ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-12">
          <div className="text-center">
            <motion.div initial={{ y: -20 }} animate={{ y: 0 }} className="flex items-center justify-center mb-4">
              <Trophy className="w-16 h-16 text-yellow-500 drop-shadow-[0_0_10px_rgba(234,179,8,0.3)]" />
            </motion.div>
            <h1 className="text-7xl font-black tracking-tighter text-white uppercase italic">Ludo</h1>
            <p className="text-slate-500 font-medium tracking-widest uppercase text-xs mt-2">The Classic Reimagined</p>
          </div>

          <div className="flex flex-col gap-4 w-64">
            <button onClick={() => { playSound(SOUNDS.MOVE); setMode('OFFLINE_SETUP'); }} className="bg-white text-slate-950 py-4 rounded-full font-bold text-lg hover:bg-slate-200 transition-all hover:scale-105 active:scale-95 shadow-xl">LOCAL PLAY</button>
            <button onClick={() => { playSound(SOUNDS.MOVE); setMode('ONLINE_LOBBY'); }} className="bg-slate-800 text-white py-4 rounded-full font-bold text-lg hover:bg-slate-700 transition-all hover:scale-105 active:scale-95 border border-white/10">ONLINE MULTIPLAYER</button>
          </div>

          {/* Sound Controls */}
          <div className="flex gap-4 mt-8">
            <button 
              onClick={() => setSoundEnabled(!soundEnabled)} 
              className="p-3 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors"
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
            <button 
              onClick={() => setMusicEnabled(!musicEnabled)} 
              className="p-3 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors"
            >
              {musicEnabled ? <Music className="w-5 h-5" /> : <Music2 className="w-5 h-5" />}
            </button>
          </div>
        </motion.div>
      ) : mode === 'OFFLINE_SETUP' ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md px-6">
          <div className="mb-12 text-center">
            <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">Setup Game</h2>
            <p className="text-slate-500 text-sm mt-2">Choose your players and names</p>
          </div>

          <div className="space-y-8">
            <div className="flex justify-center gap-4">
              {[2, 3, 4].map(count => (
                <button 
                  key={count} 
                  onClick={() => { playSound(SOUNDS.MOVE); setOfflinePlayerCount(count as 2 | 3 | 4); }}
                  className={cn(
                    "w-16 h-16 rounded-2xl font-black text-xl transition-all border-2",
                    offlinePlayerCount === count 
                      ? "bg-white text-slate-950 border-white scale-110" 
                      : "bg-slate-900 text-slate-500 border-white/10 hover:border-white/30"
                  )}
                >
                  {count}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {Array.from({ length: offlinePlayerCount }).map((_, i) => (
                <div key={i} className="relative">
                  <input
                    type="text"
                    placeholder={`Player ${i + 1} Name`}
                    value={offlinePlayerNames[i]}
                    onChange={(e) => {
                      const newNames = [...offlinePlayerNames];
                      newNames[i] = e.target.value;
                      setOfflinePlayerNames(newNames);
                    }}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-6 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-white/30 transition-colors"
                  />
                  <div className={cn("absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full", 
                    i === 0 ? "bg-red-500" : i === 1 ? "bg-yellow-500" : i === 2 ? "bg-green-500" : "bg-blue-500"
                  )} />
                </div>
              ))}
            </div>

            <button 
              onClick={() => { playSound(SOUNDS.MOVE); startOfflineGame(); }}
              className="w-full bg-white text-slate-950 py-5 rounded-2xl font-black text-xl hover:bg-slate-200 transition-all active:scale-95 mt-4"
            >
              START BATTLE
            </button>
            
            <button onClick={() => { playSound(SOUNDS.MOVE); setMode('MENU'); }} className="w-full text-slate-500 font-bold py-2 hover:text-white transition-colors">BACK TO MENU</button>
          </div>
        </motion.div>
      ) : mode === 'ONLINE_LOBBY' ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md px-6">
          <div className="mb-12 text-center">
            <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">Online Lobby</h2>
            <p className="text-slate-500 text-sm mt-2">Join or create a room to play</p>
          </div>

          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="Your Name" 
              value={playerName} 
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-6 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-white/30 transition-colors"
            />
            <input 
              type="text" 
              placeholder="Room ID" 
              value={roomId} 
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-6 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-white/30 transition-colors"
            />
            <button onClick={() => { playSound(SOUNDS.MOVE); joinOnlineRoom(); }} className="w-full bg-white text-slate-950 py-5 rounded-2xl font-black text-xl hover:bg-slate-200 transition-all active:scale-95 mt-4">JOIN / CREATE ROOM</button>
          </div>

          {onlinePlayers.length > 0 && (
            <div className="mt-12">
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4">Players in Room ({onlinePlayers.length}/4)</p>
              <div className="grid grid-cols-2 gap-3">
                {onlinePlayers.map((p, i) => (
                  <div key={i} className="bg-slate-900/50 border border-white/10 p-4 rounded-xl flex items-center gap-3">
                    <div className={cn("w-3 h-3 rounded-full", `bg-${p.color}-500`)} />
                    <span className="font-bold text-white text-sm truncate">{p.name}</span>
                    {p.id === socketRef.current?.id && <span className="text-[8px] bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full font-bold uppercase ml-auto">You</span>}
                  </div>
                ))}
              </div>
              
              <div className="mt-8">
                {onlinePlayers.length >= 2 ? (
                  onlinePlayers[0].id === socketRef.current?.id ? (
                    <button onClick={() => { playSound(SOUNDS.MOVE); startOnlineGame(); }} className="w-full bg-emerald-500 text-white py-5 rounded-2xl font-black text-xl hover:bg-emerald-400 transition-all active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.3)]">START BATTLE</button>
                  ) : (
                    <div className="bg-slate-900/50 border border-white/10 p-5 rounded-2xl text-slate-500 font-bold text-center animate-pulse uppercase tracking-widest text-sm">Waiting for host...</div>
                  )
                ) : (
                  <div className="bg-slate-900/50 border border-white/10 p-5 rounded-2xl text-slate-500 font-bold text-center uppercase tracking-widest text-sm">Waiting for players...</div>
                )}
              </div>
            </div>
          )}
          
          <button onClick={() => { playSound(SOUNDS.MOVE); setMode('MENU'); }} className="w-full text-slate-500 font-bold py-8 hover:text-white transition-colors">BACK TO MENU</button>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
          <div className="relative w-full max-w-[450px]">
            <div className="ludo-container">
              <div className="ludo-board">
                {renderGrid()}
              </div>
            </div>
            
            {/* Exit Button */}
            <button 
              onClick={() => {
                playSound(SOUNDS.MOVE);
                if (mode === 'ONLINE_GAME') socketRef.current?.disconnect();
                setMode('MENU');
              }} 
              className="absolute -top-12 left-0 bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
          </div>

          {mode === 'ONLINE_GAME' && myColor && (
            <div className="bg-white/10 backdrop-blur-sm px-6 py-2 rounded-full border border-white/20">
              <p className="text-white font-bold">You are playing as <span className={cn("uppercase", `text-${myColor}-400`)}>{myColor}</span></p>
            </div>
          )}
        </div>
      )}

      {/* Winner Modal */}
      <AnimatePresence>
        {winner && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center">
              <Trophy className="w-24 h-24 text-yellow-500 mx-auto mb-6 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
              <h2 className="text-5xl font-black mb-2 uppercase tracking-tighter text-white">{winner} WINS!</h2>
              <p className="text-slate-400 font-medium mb-8">Victory is yours, champion.</p>
              <button onClick={() => { playSound(SOUNDS.MOVE); setWinner(null); setMode('MENU'); }} className="bg-white text-slate-950 px-12 py-4 rounded-full font-bold text-lg hover:bg-slate-200 transition-colors">PLAY AGAIN</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
