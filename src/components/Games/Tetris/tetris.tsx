"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";

type TetrominoType = "I" | "J" | "L" | "O" | "S" | "T" | "Z";

interface Tetromino {
  shape: number[][];
  color: string;
  type: TetrominoType;
}

const TETROMINOES: Record<TetrominoType, Tetromino> = {
  I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: "#06B6D4", type: "I" },
  J: { shape: [[1,0,0],[1,1,1],[0,0,0]], color: "#3B82F6", type: "J" },
  L: { shape: [[0,0,1],[1,1,1],[0,0,0]], color: "#F97316", type: "L" },
  O: { shape: [[1,1],[1,1]], color: "#EAB308", type: "O" },
  S: { shape: [[0,1,1],[1,1,0],[0,0,0]], color: "#22C55E", type: "S" },
  T: { shape: [[0,1,0],[1,1,1],[0,0,0]], color: "#8B5CF6", type: "T" },
  Z: { shape: [[1,1,0],[0,1,1],[0,0,0]], color: "#EF4444", type: "Z" },
};

const ROWS = 20;
const COLS = 10;
const TICK_RATE_MS = 500;

const createEmptyBoard = () => Array.from(Array(ROWS), () => Array(COLS).fill(0));

const randomTetromino = (): Tetromino => {
  const types: TetrominoType[] = ["I", "J", "L", "O", "S", "T", "Z"];
  const type = types[Math.floor(Math.random() * types.length)];
  return { ...TETROMINOES[type] };
};

const rotateTetromino = (matrix: number[][]): number[][] => {
  const N = matrix.length;
  const result = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      result[j][N - 1 - i] = matrix[i][j];
    }
  }
  return result;
};

const getInitialPosition = (type: TetrominoType) => ({
  x: Math.floor(COLS / 2) - 1,
  y: type === "I" ? -1 : 0,
});

interface TetrisProps {
  onScoreUpdate?: (score: number) => void;
  onGameOver?: (finalScore: number) => void;
  onRestart?: () => void;
}

const Tetris: React.FC<TetrisProps> = ({ onScoreUpdate, onGameOver, onRestart }) => {
  const isMounted = useRef(false);
  const [initialized, setInitialized] = useState(false);
  const [board, setBoard] = useState<(string | number)[][]>([]);
  const [currentTetromino, setCurrentTetromino] = useState<Tetromino | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [level, setLevel] = useState(1);
  const [tickRate, setTickRate] = useState(TICK_RATE_MS);
  const [nextTetromino, setNextTetromino] = useState<Tetromino | null>(null);
  const [linesCleared, setLinesCleared] = useState(0);

  // Responsive cell size - maximize board size on mobile
  const [cellSize, setCellSize] = useState(20);

  useEffect(() => {
    const updateCellSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Calculate max cell size based on available space
      // Board is 10 cols wide, need padding (16px each side) and border (6px)
      const maxWidthBasedSize = Math.floor((width - 40) / COLS);
      
      // Board is 20 rows tall, need space for header (~70px), controls (~60px), padding
      const maxHeightBasedSize = Math.floor((height - 180) / ROWS);
      
      // Use the smaller of the two, with min/max limits
      let size = Math.min(maxWidthBasedSize, maxHeightBasedSize);
      size = Math.max(16, Math.min(size, 28)); // Min 16, max 28
      
      setCellSize(size);
    };
    updateCellSize();
    window.addEventListener('resize', updateCellSize);
    return () => window.removeEventListener('resize', updateCellSize);
  }, []);

  useEffect(() => {
    if (!isMounted.current) {
      setBoard(createEmptyBoard());
      const first = randomTetromino();
      const second = randomTetromino();
      setCurrentTetromino(first);
      setNextTetromino(second);
      setPosition(getInitialPosition(first.type));
      setInitialized(true);
      isMounted.current = true;
    }
  }, []);

  // Track if onGameOver has been called to prevent duplicate calls
  const gameOverCalledRef = useRef(false);

  useEffect(() => {
    if (onScoreUpdate && score > 0) onScoreUpdate(score);
  }, [score, onScoreUpdate]);

  useEffect(() => {
    if (gameOver && onGameOver && !gameOverCalledRef.current) {
      gameOverCalledRef.current = true;
      onGameOver(score);
    }
  }, [gameOver, score, onGameOver]);

  const isPositionValid = useCallback((tetromino: number[][], pos: { x: number; y: number }): boolean => {
    if (!initialized) return false;
    for (let y = 0; y < tetromino.length; y++) {
      for (let x = 0; x < tetromino[y].length; x++) {
        if (tetromino[y][x] !== 0) {
          const newX = pos.x + x;
          const newY = pos.y + y;
          if (newX < 0 || newX >= COLS || newY >= ROWS) return false;
          if (newY >= 0 && board[newY][newX] !== 0) return false;
        }
      }
    }
    return true;
  }, [board, initialized]);

  const renderBoard = useCallback(() => {
    if (!initialized || !currentTetromino) return board;
    const newBoard = board.map(row => [...row]);
    for (let y = 0; y < currentTetromino.shape.length; y++) {
      for (let x = 0; x < currentTetromino.shape[y].length; x++) {
        if (currentTetromino.shape[y][x] !== 0) {
          const boardY = position.y + y;
          const boardX = position.x + x;
          if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
            newBoard[boardY][boardX] = currentTetromino.color;
          }
        }
      }
    }
    return newBoard;
  }, [board, currentTetromino, position, initialized]);

  const placeTetromino = useCallback(() => {
    if (!initialized || !currentTetromino || !nextTetromino) return;
    const newBoard = board.map(row => [...row]);

    let isGameOverFlag = false;
    for (let y = 0; y < currentTetromino.shape.length; y++) {
      for (let x = 0; x < currentTetromino.shape[y].length; x++) {
        if (currentTetromino.shape[y][x] !== 0 && position.y + y < 0) {
          isGameOverFlag = true;
          break;
        }
      }
      if (isGameOverFlag) break;
    }

    if (isGameOverFlag) { setGameOver(true); return; }

    for (let y = 0; y < currentTetromino.shape.length; y++) {
      for (let x = 0; x < currentTetromino.shape[y].length; x++) {
        if (currentTetromino.shape[y][x] !== 0) {
          const boardY = position.y + y;
          const boardX = position.x + x;
          if (boardY >= 0 && boardY < ROWS) {
            newBoard[boardY][boardX] = currentTetromino.color;
          }
        }
      }
    }

    let completedRows = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (newBoard[y].every(cell => cell !== 0)) {
        newBoard.splice(y, 1);
        newBoard.unshift(Array(COLS).fill(0));
        completedRows++;
        y++;
      }
    }

    if (completedRows > 0) {
      const points = [0, 40, 100, 300, 1200][completedRows] * level;
      setScore(prev => prev + points);
      setLinesCleared(prev => prev + completedRows);
      const newLevel = Math.floor((linesCleared + completedRows) / 10) + 1;
      if (newLevel > level) {
        setLevel(newLevel);
        setTickRate(TICK_RATE_MS / (1 + (newLevel - 1) * 0.1));
      }
    }

    setBoard(newBoard);
    const nextTet = nextTetromino;
    const initialPos = getInitialPosition(nextTet.type);
    setCurrentTetromino(nextTet);
    setNextTetromino(randomTetromino());
    setPosition(initialPos);

    if (!isPositionValid(nextTet.shape, initialPos)) setGameOver(true);
  }, [board, currentTetromino, nextTetromino, position, level, linesCleared, isPositionValid, initialized]);

  const moveDown = useCallback(() => {
    if (!initialized || gameOver || isPaused || !currentTetromino) return;
    const newPos = { ...position, y: position.y + 1 };
    if (isPositionValid(currentTetromino.shape, newPos)) setPosition(newPos);
    else placeTetromino();
  }, [position, currentTetromino, isPositionValid, placeTetromino, gameOver, isPaused, initialized]);

  const moveHorizontal = useCallback((dir: number) => {
    if (!initialized || gameOver || isPaused || !currentTetromino) return;
    const newPos = { ...position, x: position.x + dir };
    if (isPositionValid(currentTetromino.shape, newPos)) setPosition(newPos);
  }, [position, currentTetromino, isPositionValid, gameOver, isPaused, initialized]);

  const rotate = useCallback(() => {
    if (!initialized || gameOver || isPaused || !currentTetromino) return;
    const rotated = rotateTetromino(currentTetromino.shape);
    if (isPositionValid(rotated, position)) {
      setCurrentTetromino({ ...currentTetromino, shape: rotated });
    } else {
      for (const kick of [-1, 1, -2, 2]) {
        const newPos = { ...position, x: position.x + kick };
        if (isPositionValid(rotated, newPos)) {
          setCurrentTetromino({ ...currentTetromino, shape: rotated });
          setPosition(newPos);
          break;
        }
      }
    }
  }, [position, currentTetromino, isPositionValid, gameOver, isPaused, initialized]);

  const hardDrop = useCallback(() => {
    if (!initialized || gameOver || isPaused || !currentTetromino) return;
    let newY = position.y;
    while (isPositionValid(currentTetromino.shape, { ...position, y: newY + 1 })) newY++;
    setPosition({ ...position, y: newY });
    placeTetromino();
  }, [position, currentTetromino, isPositionValid, placeTetromino, gameOver, isPaused, initialized]);

  const restartGame = useCallback(() => {
    setBoard(createEmptyBoard());
    const first = randomTetromino();
    const second = randomTetromino();
    setCurrentTetromino(first);
    setNextTetromino(second);
    setPosition(getInitialPosition(first.type));
    setScore(0);
    setLinesCleared(0);
    setGameOver(false);
    setIsPaused(false);
    setLevel(1);
    setTickRate(TICK_RATE_MS);
    gameOverCalledRef.current = false; // Reset the flag for new game
    if (onRestart) onRestart(); // Notify parent component
  }, [onRestart]);

  useEffect(() => {
    if (!initialized) return;
    const handleKey = (e: KeyboardEvent) => {
      if (gameOver) return;
      switch (e.key) {
        case "ArrowLeft": e.preventDefault(); moveHorizontal(-1); break;
        case "ArrowRight": e.preventDefault(); moveHorizontal(1); break;
        case "ArrowDown": e.preventDefault(); moveDown(); break;
        case "ArrowUp": e.preventDefault(); rotate(); break;
        case " ": e.preventDefault(); hardDrop(); break;
        case "p": case "P": e.preventDefault(); setIsPaused(!isPaused); break;
        case "r": case "R": e.preventDefault(); restartGame(); break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [moveHorizontal, moveDown, rotate, hardDrop, gameOver, isPaused, restartGame, initialized]);

  useEffect(() => {
    if (!initialized || gameOver || isPaused) return;
    const loop = setInterval(moveDown, tickRate);
    return () => clearInterval(loop);
  }, [moveDown, tickRate, gameOver, isPaused, initialized]);

  const renderNextTetromino = useCallback(() => {
    if (!initialized || !nextTetromino) return Array.from({ length: 4 }, () => Array(4).fill(0));
    const grid = Array.from({ length: 4 }, () => Array(4).fill(0));
    const offsetX = nextTetromino.type === "O" ? 1 : 0.5;
    const offsetY = nextTetromino.type === "I" ? 1 : nextTetromino.type === "O" ? 1 : 0.5;
    for (let y = 0; y < nextTetromino.shape.length; y++) {
      for (let x = 0; x < nextTetromino.shape[y].length; x++) {
        if (nextTetromino.shape[y][x] !== 0) {
          const px = Math.floor(x + offsetX);
          const py = Math.floor(y + offsetY);
          if (py >= 0 && py < 4 && px >= 0 && px < 4) grid[py][px] = nextTetromino.color;
        }
      }
    }
    return grid;
  }, [nextTetromino, initialized]);

  if (!initialized) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: 'white' }}>
        <p style={{ fontFamily: 'PixelFont, Arial, sans-serif' }}>Loading...</p>
      </div>
    );
  }

  const boardData = renderBoard();
  const nextData = renderNextTetromino();
  const nextCellSize = Math.floor(cellSize * 0.8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'white', padding: '4px', width: '100%' }}>
      {/* Header with score and next piece */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center',
        alignItems: 'stretch',
        width: `${COLS * cellSize + 6}px`,
        marginBottom: '6px',
        gap: '8px',
      }}>
        {/* Score & Level */}
        <div style={{ 
          background: '#3E2723', 
          padding: '8px 16px', 
          borderRadius: '8px', 
          border: '2px solid #5D4037',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          flex: 1,
        }}>
          {/* Score */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ color: '#FFD700', fontSize: '10px', fontFamily: 'PixelFont, Arial, sans-serif' }}>SCORE</span>
            <span style={{ fontSize: '16px', fontWeight: 'bold', fontFamily: 'PixelFont, Arial, sans-serif' }}>{score}</span>
          </div>
          {/* Level */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ color: '#FFD700', fontSize: '10px', fontFamily: 'PixelFont, Arial, sans-serif' }}>LEVEL</span>
            <span style={{ fontSize: '16px', fontWeight: 'bold', fontFamily: 'PixelFont, Arial, sans-serif' }}>{level}</span>
          </div>
        </div>

        {/* Next piece */}
        <div style={{ 
          background: '#3E2723', 
          padding: '8px', 
          borderRadius: '8px', 
          border: '2px solid #5D4037',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
        }}>
          <div style={{ color: '#FFD700', fontSize: '10px', fontFamily: 'PixelFont, Arial, sans-serif' }}>NEXT</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(4, ${nextCellSize}px)`,
            gridTemplateRows: `repeat(4, ${nextCellSize}px)`,
            background: '#1a1a2e',
            borderRadius: '4px',
          }}>
            {nextData.map((row, y) =>
              row.map((cell, x) => (
                <div
                  key={`next-${y}-${x}`}
                  style={{
                    width: nextCellSize,
                    height: nextCellSize,
                    backgroundColor: cell !== 0 ? String(cell) : 'transparent',
                    border: '1px solid #333',
                    boxSizing: 'border-box',
                  }}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Game Board */}
      <div style={{ position: 'relative' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${ROWS}, ${cellSize}px)`,
          backgroundColor: '#1a1a2e',
          border: '3px solid #5D4037',
          borderRadius: '8px',
        }}>
          {boardData.map((row, y) =>
            row.map((cell, x) => (
              <div
                key={`${y}-${x}`}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: cell !== 0 ? String(cell) : 'transparent',
                  border: '1px solid #333',
                  boxSizing: 'border-box',
                }}
              />
            ))
          )}
        </div>

        {/* Game Over */}
        {gameOver && (
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(62, 39, 35, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            border: '3px solid #5D4037',
          }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', color: '#FFD700', fontFamily: 'PixelFont, Arial, sans-serif' }}>
              Game Over!
            </div>
            <div style={{ fontSize: '16px', marginBottom: '16px', fontFamily: 'PixelFont, Arial, sans-serif' }}>
              Score: {score}
            </div>
            <button
              onClick={restartGame}
              style={{
                padding: '10px 24px',
                backgroundColor: '#7BC043',
                color: 'white',
                borderRadius: '8px',
                border: '2px solid #5D9B3A',
                cursor: 'pointer',
                fontFamily: 'PixelFont, Arial, sans-serif',
                fontSize: '14px',
              }}
            >
              Play Again
            </button>
          </div>
        )}

        {/* Paused */}
        {isPaused && !gameOver && (
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(62, 39, 35, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            border: '3px solid #5D4037',
          }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFD700', fontFamily: 'PixelFont, Arial, sans-serif' }}>
              ⏸️ Paused
            </div>
          </div>
        )}
      </div>

      {/* Mobile Controls */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(5, 1fr)', 
        gap: '4px', 
        marginTop: '8px',
        width: `${COLS * cellSize + 6}px`,
      }}>
        {[
          { label: '←', action: () => moveHorizontal(-1) },
          { label: '→', action: () => moveHorizontal(1) },
          { label: '↻', action: rotate },
          { label: '↓', action: moveDown },
          { label: isPaused ? '▶' : '⏸', action: () => setIsPaused(!isPaused) },
        ].map((btn, i) => (
          <button
            key={i}
            onClick={btn.action}
            disabled={gameOver && i !== 4}
            style={{
              padding: '12px 4px',
              backgroundColor: '#3E2723',
              color: 'white',
              borderRadius: '8px',
              border: '2px solid #5D4037',
              cursor: 'pointer',
              fontFamily: 'PixelFont, Arial, sans-serif',
              fontSize: '16px',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              userSelect: 'none',
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Tetris;
