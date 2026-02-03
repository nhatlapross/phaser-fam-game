"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";

interface SnakeProps {
  onScoreUpdate?: (score: number) => void;
  onGameOver?: (finalScore: number) => void;
  onRestart?: () => void;
}

const GRID_WIDTH = 20;
const GRID_HEIGHT = 28; // taller grid
const CELL_SIZE = 15;
const INITIAL_SPEED = 200; // slower start
const SPEED_INCREMENT = 3; // smaller increment
const MIN_SPEED = 100; // slower max speed

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Position = { x: number; y: number };

const Snake: React.FC<SnakeProps> = ({ onScoreUpdate, onGameOver, onRestart }) => {
  const [snake, setSnake] = useState<Position[]>([{ x: 10, y: 10 }]);
  const [food, setFood] = useState<Position>({ x: 15, y: 10 });
  const [direction, setDirection] = useState<Direction>('RIGHT');
  const [gameState, setGameState] = useState<'playing' | 'paused' | 'gameover'>('playing');
  const [score, setScore] = useState(0);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  
  const directionRef = useRef<Direction>('RIGHT');
  const gameOverCalledRef = useRef(false);

  // Generate random food position
  const generateFood = useCallback((currentSnake: Position[]): Position => {
    let newFood: Position;
    do {
      newFood = {
        x: Math.floor(Math.random() * GRID_WIDTH),
        y: Math.floor(Math.random() * GRID_HEIGHT),
      };
    } while (currentSnake.some(seg => seg.x === newFood.x && seg.y === newFood.y));
    return newFood;
  }, []);

  // Move snake
  const moveSnake = useCallback(() => {
    if (gameState !== 'playing') return;

    setSnake(prevSnake => {
      const head = prevSnake[0];
      const dir = directionRef.current;
      
      let newHead: Position;
      switch (dir) {
        case 'UP':
          newHead = { x: head.x, y: head.y - 1 };
          break;
        case 'DOWN':
          newHead = { x: head.x, y: head.y + 1 };
          break;
        case 'LEFT':
          newHead = { x: head.x - 1, y: head.y };
          break;
        case 'RIGHT':
          newHead = { x: head.x + 1, y: head.y };
          break;
      }

      // Check wall collision
      if (newHead.x < 0 || newHead.x >= GRID_WIDTH || newHead.y < 0 || newHead.y >= GRID_HEIGHT) {
        setGameState('gameover');
        return prevSnake;
      }

      // Check self collision
      if (prevSnake.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
        setGameState('gameover');
        return prevSnake;
      }

      const newSnake = [newHead, ...prevSnake];

      // Check food collision
      if (newHead.x === food.x && newHead.y === food.y) {
        const newScore = score + 10;
        setScore(newScore);
        setFood(generateFood(newSnake));
        // Increase speed
        setSpeed(prev => Math.max(MIN_SPEED, prev - SPEED_INCREMENT));
        return newSnake; // Don't remove tail (snake grows)
      }

      newSnake.pop(); // Remove tail
      return newSnake;
    });
  }, [gameState, food, score, generateFood]);

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return;
    const interval = setInterval(moveSnake, speed);
    return () => clearInterval(interval);
  }, [moveSnake, speed, gameState]);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'gameover') return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (directionRef.current !== 'DOWN') {
            directionRef.current = 'UP';
            setDirection('UP');
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (directionRef.current !== 'UP') {
            directionRef.current = 'DOWN';
            setDirection('DOWN');
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (directionRef.current !== 'RIGHT') {
            directionRef.current = 'LEFT';
            setDirection('LEFT');
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (directionRef.current !== 'LEFT') {
            directionRef.current = 'RIGHT';
            setDirection('RIGHT');
          }
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          setGameState(prev => prev === 'playing' ? 'paused' : 'playing');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  // Score update callback
  useEffect(() => {
    if (onScoreUpdate && score > 0) {
      onScoreUpdate(score);
    }
  }, [score, onScoreUpdate]);

  // Game over callback
  useEffect(() => {
    if (gameState === 'gameover' && !gameOverCalledRef.current) {
      gameOverCalledRef.current = true;
      if (onGameOver) {
        onGameOver(score);
      }
    }
  }, [gameState, score, onGameOver]);


  // Restart game
  const restartGame = useCallback(() => {
    setSnake([{ x: 10, y: 10 }]);
    setFood({ x: 15, y: 10 });
    setDirection('RIGHT');
    directionRef.current = 'RIGHT';
    setGameState('playing');
    setScore(0);
    setSpeed(INITIAL_SPEED);
    gameOverCalledRef.current = false;
    if (onRestart) onRestart();
  }, [onRestart]);

  // Mobile controls
  const handleDirection = (dir: Direction) => {
    if (gameState !== 'playing') return;
    const current = directionRef.current;
    if (
      (dir === 'UP' && current !== 'DOWN') ||
      (dir === 'DOWN' && current !== 'UP') ||
      (dir === 'LEFT' && current !== 'RIGHT') ||
      (dir === 'RIGHT' && current !== 'LEFT')
    ) {
      directionRef.current = dir;
      setDirection(dir);
    }
  };

  const boardWidth = GRID_WIDTH * CELL_SIZE;
  const boardHeight = GRID_HEIGHT * CELL_SIZE;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      color: 'white',
      padding: '8px',
      gap: '8px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        width: `${boardWidth}px`,
        padding: '8px 16px',
        backgroundColor: '#3E2723',
        borderRadius: '8px',
        border: '2px solid #5D4037',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#FFD700', fontFamily: 'PixelFont' }}>SCORE</div>
          <div style={{ fontSize: '18px', fontFamily: 'PixelFont' }}>{score}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#FFD700', fontFamily: 'PixelFont' }}>LENGTH</div>
          <div style={{ fontSize: '18px', fontFamily: 'PixelFont' }}>{snake.length}</div>
        </div>
      </div>

      {/* Game Board */}
      <div style={{ position: 'relative' }}>
        <div style={{
          width: `${boardWidth}px`,
          height: `${boardHeight}px`,
          backgroundColor: '#1a1a2e',
          border: '3px solid #5D4037',
          borderRadius: '8px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Grid lines */}
          {Array.from({ length: Math.max(GRID_WIDTH, GRID_HEIGHT) }).map((_, i) => (
            <React.Fragment key={i}>
              {i < GRID_WIDTH && (
                <div style={{
                  position: 'absolute',
                  left: `${i * CELL_SIZE}px`,
                  top: 0,
                  width: '1px',
                  height: '100%',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                }} />
              )}
              {i < GRID_HEIGHT && (
                <div style={{
                  position: 'absolute',
                  top: `${i * CELL_SIZE}px`,
                  left: 0,
                  height: '1px',
                  width: '100%',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                }} />
              )}
            </React.Fragment>
          ))}

          {/* Snake */}
          {snake.map((segment, index) => (
            <div
              key={index}
              style={{
                position: 'absolute',
                left: `${segment.x * CELL_SIZE}px`,
                top: `${segment.y * CELL_SIZE}px`,
                width: `${CELL_SIZE - 1}px`,
                height: `${CELL_SIZE - 1}px`,
                backgroundColor: index === 0 ? '#4CAF50' : '#8BC34A',
                borderRadius: index === 0 ? '4px' : '2px',
              }}
            />
          ))}

          {/* Food */}
          <div style={{
            position: 'absolute',
            left: `${food.x * CELL_SIZE}px`,
            top: `${food.y * CELL_SIZE}px`,
            width: `${CELL_SIZE - 1}px`,
            height: `${CELL_SIZE - 1}px`,
            backgroundColor: '#FF5722',
            borderRadius: '50%',
          }} />
        </div>

        {/* Game Over Overlay */}
        {gameState === 'gameover' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(62, 39, 35, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            gap: '12px',
          }}>
            <div style={{ fontSize: '20px', fontFamily: 'PixelFont', color: '#FFD700' }}>
              Game Over!
            </div>
            <div style={{ fontSize: '16px', fontFamily: 'PixelFont' }}>
              Score: {score}
            </div>
            <button
              onClick={restartGame}
              style={{
                padding: '12px 24px',
                backgroundColor: '#7BC043',
                color: 'white',
                borderRadius: '8px',
                border: '2px solid #5D9B3A',
                cursor: 'pointer',
                fontFamily: 'PixelFont',
                fontSize: '14px',
              }}
            >
              Play Again
            </button>
          </div>
        )}

        {/* Paused Overlay */}
        {gameState === 'paused' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(62, 39, 35, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
          }}>
            <div style={{ fontSize: '20px', fontFamily: 'PixelFont', color: '#FFD700' }}>
              ⏸️ Paused
            </div>
          </div>
        )}
      </div>

      {/* Mobile Controls */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(2, 1fr)',
        gap: '4px',
        width: `${boardWidth}px`,
      }}>
        <div />
        <button onClick={() => handleDirection('UP')} style={btnStyle}>↑</button>
        <div />
        <button onClick={() => handleDirection('LEFT')} style={btnStyle}>←</button>
        <button onClick={() => handleDirection('DOWN')} style={btnStyle}>↓</button>
        <button onClick={() => handleDirection('RIGHT')} style={btnStyle}>→</button>
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  padding: '12px',
  backgroundColor: '#3E2723',
  color: 'white',
  borderRadius: '8px',
  border: '2px solid #5D4037',
  cursor: 'pointer',
  fontFamily: 'PixelFont',
  fontSize: '16px',
  touchAction: 'manipulation',
};

export default Snake;
