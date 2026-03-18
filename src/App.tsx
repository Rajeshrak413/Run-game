/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Play, RotateCcw, Trophy, Volume2, VolumeX } from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Constants ---
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const PLAYER_SIZE = 40;
const OBSTACLE_WIDTH = 50;
const OBSTACLE_HEIGHT = 50;
const INITIAL_SPEED = 5;
const SPEED_INCREMENT = 0.001;
const JUMP_FORCE = -15;
const GRAVITY = 0.8;

// --- Types ---
type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'ROCK' | 'BUSH' | 'HEART';
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  
  // Game variables (refs to avoid re-renders)
  const playerY = useRef(CANVAS_HEIGHT - PLAYER_SIZE - 20);
  const playerVelocityY = useRef(0);
  const isJumping = useRef(false);
  const obstacles = useRef<Obstacle[]>([]);
  const speed = useRef(INITIAL_SPEED);
  const frameId = useRef<number>(0);
  const lastObstacleTime = useRef(0);
  const distance = useRef(0);

  // Audio Context (lazy init)
  const audioCtx = useRef<AudioContext | null>(null);
  const musicOsc = useRef<OscillatorNode | null>(null);

  const initAudio = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playJumpSound = () => {
    if (isMuted || !audioCtx.current) return;
    const osc = audioCtx.current.createOscillator();
    const gain = audioCtx.current.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.current.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.current.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, audioCtx.current.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.current.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.current.destination);
    osc.start();
    osc.stop(audioCtx.current.currentTime + 0.1);
  };

  const playGameOverSound = () => {
    if (isMuted || !audioCtx.current) return;
    const osc = audioCtx.current.createOscillator();
    const gain = audioCtx.current.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, audioCtx.current.currentTime);
    osc.frequency.linearRampToValueAtTime(50, audioCtx.current.currentTime + 0.5);
    gain.gain.setValueAtTime(0.1, audioCtx.current.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.current.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.current.destination);
    osc.start();
    osc.stop(audioCtx.current.currentTime + 0.5);
  };

  const startMusic = () => {
    if (isMuted || !audioCtx.current) return;
    if (musicOsc.current) musicOsc.current.stop();
    
    const osc = audioCtx.current.createOscillator();
    const gain = audioCtx.current.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(261.63, audioCtx.current.currentTime); // C4
    
    gain.gain.setValueAtTime(0.05, audioCtx.current.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.current.destination);
    osc.start();
    musicOsc.current = osc;
  };

  const stopMusic = () => {
    if (musicOsc.current) {
      musicOsc.current.stop();
      musicOsc.current = null;
    }
  };

  const startGame = () => {
    initAudio();
    setGameState('PLAYING');
    setScore(0);
    distance.current = 0;
    speed.current = INITIAL_SPEED;
    playerY.current = CANVAS_HEIGHT - PLAYER_SIZE - 20;
    playerVelocityY.current = 0;
    isJumping.current = false;
    obstacles.current = [];
    lastObstacleTime.current = Date.now();
    startMusic();
  };

  const handleGameOver = () => {
    setGameState('GAMEOVER');
    stopMusic();
    playGameOverSound();
    if (score > highScore) {
      setHighScore(score);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  };

  const jump = () => {
    if (!isJumping.current && gameState === 'PLAYING') {
      playerVelocityY.current = JUMP_FORCE;
      isJumping.current = true;
      playJumpSound();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        jump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const update = () => {
      // Update player
      playerVelocityY.current += GRAVITY;
      playerY.current += playerVelocityY.current;

      const groundY = CANVAS_HEIGHT - PLAYER_SIZE - 20;
      if (playerY.current > groundY) {
        playerY.current = groundY;
        playerVelocityY.current = 0;
        isJumping.current = false;
      }

      // Update speed
      speed.current += SPEED_INCREMENT;
      distance.current += speed.current;
      setScore(Math.floor(distance.current / 100));

      // Spawn obstacles
      const now = Date.now();
      if (now - lastObstacleTime.current > 2000 / (speed.current / 5)) {
        const type = Math.random() > 0.8 ? 'HEART' : (Math.random() > 0.5 ? 'ROCK' : 'BUSH');
        obstacles.current.push({
          x: CANVAS_WIDTH,
          y: type === 'HEART' ? groundY - 80 : groundY,
          width: OBSTACLE_WIDTH,
          height: OBSTACLE_HEIGHT,
          type
        });
        lastObstacleTime.current = now;
      }

      // Update obstacles
      obstacles.current.forEach((obs, index) => {
        obs.x -= speed.current;

        // Collision detection
        const playerBox = {
          x: 50,
          y: playerY.current,
          width: PLAYER_SIZE,
          height: PLAYER_SIZE
        };

        const obsBox = {
          x: obs.x + 10,
          y: obs.y + 10,
          width: obs.width - 20,
          height: obs.height - 20
        };

        if (
          playerBox.x < obsBox.x + obsBox.width &&
          playerBox.x + playerBox.width > obsBox.x &&
          playerBox.y < obsBox.y + obsBox.height &&
          playerBox.y + playerBox.height > obsBox.y
        ) {
          if (obs.type === 'HEART') {
            distance.current += 500; // Bonus
            obstacles.current.splice(index, 1);
          } else {
            handleGameOver();
          }
        }

        if (obs.x + obs.width < 0) {
          obstacles.current.splice(index, 1);
        }
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // --- Background (Sky/Environment) ---
      const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      skyGrad.addColorStop(0, '#87CEEB'); // Sky Blue
      skyGrad.addColorStop(0.6, '#E0F6FF');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // --- Distant City/Trees (Parallax) ---
      ctx.fillStyle = '#2F4F4F';
      for (let i = 0; i < 3; i++) {
        const x = (i * 200 - (distance.current * 0.1) % 600);
        ctx.fillRect(x, CANVAS_HEIGHT - 150, 60, 130);
        ctx.fillRect(x + 80, CANVAS_HEIGHT - 120, 40, 100);
      }

      // --- Road (Asphalt) ---
      ctx.fillStyle = '#333'; // Asphalt color
      ctx.fillRect(0, CANVAS_HEIGHT - 100, CANVAS_WIDTH, 100);

      // Road Lines (Moving)
      ctx.strokeStyle = '#FFF';
      ctx.setLineDash([30, 30]);
      ctx.lineDashOffset = (distance.current % 60);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_HEIGHT - 50);
      ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - 50);
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash

      // Road Edge
      ctx.fillStyle = '#555';
      ctx.fillRect(0, CANVAS_HEIGHT - 100, CANVAS_WIDTH, 5);

      // --- Player (The Runner) ---
      // We'll draw a more human-like silhouette with simple animation
      const runCycle = (distance.current % 100) / 100;
      const legOffset = Math.sin(runCycle * Math.PI * 2) * 15;
      
      ctx.save();
      ctx.translate(50 + PLAYER_SIZE / 2, playerY.current + PLAYER_SIZE / 2);
      
      // Body/Torso
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.ellipse(0, -5, 10, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.beginPath();
      ctx.arc(0, -28, 7, 0, Math.PI * 2);
      ctx.fill();

      // Legs
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#111';
      
      // Leg 1
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(legOffset, 30);
      ctx.stroke();
      
      // Leg 2
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(-legOffset, 30);
      ctx.stroke();

      // Arms
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(-legOffset * 0.8, -5);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(legOffset * 0.8, -5);
      ctx.stroke();

      ctx.restore();

      // --- Obstacles (Realistic) ---
      obstacles.current.forEach(obs => {
        if (obs.type === 'HEART') {
          // Keep the heart but make it glow more
          ctx.fillStyle = '#ff4d6d';
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#ff4d6d';
          const x = obs.x + obs.width / 2;
          const y = obs.y + obs.height / 2;
          ctx.beginPath();
          ctx.moveTo(x, y + 10);
          ctx.bezierCurveTo(x - 20, y - 20, x - 20, y - 40, x, y - 20);
          ctx.bezierCurveTo(x + 20, y - 40, x + 20, y - 20, x, y + 10);
          ctx.fill();
        } else if (obs.type === 'ROCK') {
          // Traffic Cone
          ctx.fillStyle = '#FF4500'; // Orange
          ctx.beginPath();
          ctx.moveTo(obs.x + 10, obs.y + obs.height);
          ctx.lineTo(obs.x + obs.width - 10, obs.y + obs.height);
          ctx.lineTo(obs.x + obs.width / 2, obs.y);
          ctx.closePath();
          ctx.fill();
          // Stripe
          ctx.fillStyle = '#FFF';
          ctx.fillRect(obs.x + 18, obs.y + 20, 14, 10);
        } else {
          // Barrier
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(obs.x, obs.y + 10, obs.width, 10);
          ctx.fillRect(obs.x + 5, obs.y + 10, 5, 40);
          ctx.fillRect(obs.x + obs.width - 10, obs.y + 10, 5, 40);
        }
        ctx.shadowBlur = 0;
      });
    };

    const loop = () => {
      update();
      draw();
      frameId.current = requestAnimationFrame(loop);
    };

    frameId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId.current);
  }, [gameState]);

  return (
    <div className="relative w-full h-screen flex items-center justify-center bg-black font-sans overflow-hidden">
      <div className="relative shadow-2xl border-4 border-white/10 rounded-3xl overflow-hidden bg-slate-900" 
           style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
        
        <canvas 
          ref={canvasRef} 
          width={CANVAS_WIDTH} 
          height={CANVAS_HEIGHT}
          onClick={jump}
          className="cursor-pointer"
        />

        {gameState === 'PLAYING' && (
          <div className="absolute top-6 left-0 right-0 px-6 flex justify-between items-start pointer-events-none">
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-widest text-white/50 font-display">Score</span>
              <span className="text-3xl font-bold font-display">{score}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs uppercase tracking-widest text-white/50 font-display">Best</span>
              <span className="text-xl font-bold font-display text-pink-500">{highScore}</span>
            </div>
          </div>
        )}

        <AnimatePresence>
          {gameState === 'START' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center"
            >
              <motion.div 
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="mb-8"
              >
                <Heart className="w-20 h-20 text-pink-500 fill-pink-500" />
              </motion.div>
              <h1 className="text-4xl font-black font-display mb-2 tracking-tighter">ETERNAL CHASE</h1>
              <p className="text-slate-400 text-sm mb-12 max-w-[240px]">
                Run through the obstacles to reach your true love. How far will you go?
              </p>
              <button 
                onClick={startGame}
                className="group relative flex items-center gap-3 bg-pink-600 hover:bg-pink-500 text-white px-10 py-4 rounded-full font-bold text-lg transition-all active:scale-95 shadow-[0_0_30px_rgba(233,69,96,0.3)]"
              >
                <Play className="w-5 h-5 fill-current" />
                START RUNNING
              </button>
            </motion.div>
          )}

          {gameState === 'GAMEOVER' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
            >
              <Trophy className="w-16 h-16 text-yellow-500 mb-4" />
              <h2 className="text-3xl font-black font-display mb-1 tracking-tighter">GAME OVER</h2>
              <p className="text-slate-400 text-sm mb-8">Love is a long journey...</p>
              
              <div className="grid grid-cols-2 gap-8 mb-12 w-full max-w-[280px]">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-white/40">Distance</span>
                  <span className="text-2xl font-bold font-display">{score}m</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest text-white/40">Best</span>
                  <span className="text-2xl font-bold font-display text-pink-500">{highScore}m</span>
                </div>
              </div>

              <button 
                onClick={startGame}
                className="flex items-center gap-3 bg-white text-slate-950 px-10 py-4 rounded-full font-bold text-lg hover:bg-slate-200 transition-all active:scale-95"
              >
                <RotateCcw className="w-5 h-5" />
                TRY AGAIN
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {gameState === 'PLAYING' && score < 5 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-20 left-0 right-0 flex justify-center pointer-events-none"
          >
            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full text-[10px] uppercase tracking-widest font-bold border border-white/10">
              Tap or Space to Jump
            </div>
          </motion.div>
        )}

        <button 
          onClick={() => setIsMuted(!isMuted)}
          className="absolute bottom-6 right-6 p-3 bg-white/5 hover:bg-white/10 rounded-full backdrop-blur-md border border-white/10 transition-colors"
        >
          {isMuted ? <VolumeX className="w-5 h-5 text-white/50" /> : <Volume2 className="w-5 h-5 text-white" />}
        </button>
      </div>

      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-pink-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
