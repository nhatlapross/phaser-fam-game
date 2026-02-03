"use client";
import React, { useState, useCallback, useEffect, useRef } from "react";

interface Cell {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacentMines: number;
}

interface Difficulty {
  name: string;
  gridSize: number;
  mineCount: number;
  cellSize: number;
}

const DIFFICULTIES: Record<string, Difficulty> = {
  easy: { name: "Easy", gridSize: 8, mineCount: 10, cellSize: 32 },
  medium: { name: "Medium", gridSize: 10, mineCount: 15, cellSize: 28 },
  hard: { name: "Hard", gridSize: 12, mineCount: 25, cellSize: 24 },
};

interface MinesweeperProps {
  onScoreUpdate?: (score: number) => void;
  onGameOver?: (finalScore: number) => void;
  onRestart?: () => void;
}

const Minesweeper: React.FC<MinesweeperProps> = ({ onScoreUpdate, onGameOver, onRestart }) => {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [gameState, setGameState] = useState<"menu" | "playing" | "won" | "lost">("menu");
  const [flagCount, setFlagCount] = useState(0);
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(0);
  const [firstClick, setFirstClick] = useState(true);
  
  const gameOverCalledRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize empty grid
  const initGrid = useCallback((size: number) => {
    const newGrid: Cell[][] = [];
    for (let y = 0; y < size; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < size; x++) {
        row.push({
          isMine: false,
          isRevealed: false,
          isFlagged: false,
          adjacentMines: 0,
        });
      }
      newGrid.push(row);
    }
    return newGrid;
  }, []);

  // Place mines avoiding first click position
  const placeMines = useCallback((grid: Cell[][], safeX: number, safeY: number, mineCount: number) => {
    const size = grid.length;
    const newGrid = grid.map(row => row.map(cell => ({ ...cell })));
    let minesPlaced = 0;

    while (minesPlaced < mineCount) {
      const x = Math.floor(Math.random() * size);
      const y = Math.floor(Math.random() * size);

      // Don't place mine on first click or adjacent cells
      const isSafe = Math.abs(x - safeX) <= 1 && Math.abs(y - safeY) <= 1;
      
      if (!newGrid[y][x].isMine && !isSafe) {
        newGrid[y][x].isMine = true;
        minesPlaced++;
      }
    }

    // Calculate adjacent mines
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!newGrid[y][x].isMine) {
          let count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && ny < size && nx >= 0 && nx < size) {
                if (newGrid[ny][nx].isMine) count++;
              }
            }
          }
          newGrid[y][x].adjacentMines = count;
        }
      }
    }

    return newGrid;
  }, []);

  // Reveal cell and cascade if empty
  const revealCell = useCallback((grid: Cell[][], x: number, y: number): Cell[][] => {
    const size = grid.length;
    if (x < 0 || x >= size || y < 0 || y >= size) return grid;
    
    const cell = grid[y][x];
    if (cell.isRevealed || cell.isFlagged) return grid;

    const newGrid = grid.map(row => row.map(c => ({ ...c })));
    newGrid[y][x].isRevealed = true;

    // Cascade reveal for empty cells
    if (cell.adjacentMines === 0 && !cell.isMine) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy !== 0 || dx !== 0) {
            const result = revealCell(newGrid, x + dx, y + dy);
            for (let i = 0; i < size; i++) {
              for (let j = 0; j < size; j++) {
                newGrid[i][j] = result[i][j];
              }
            }
          }
        }
      }
    }

    return newGrid;
  }, []);

  // Check win condition
  const checkWin = useCallback((grid: Cell[][]): boolean => {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const cell = grid[y][x];
        if (!cell.isMine && !cell.isRevealed) return false;
      }
    }
    return true;
  }, []);

  // Start game with selected difficulty
  const startGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    setGrid(initGrid(diff.gridSize));
    setGameState("playing");
    setFlagCount(0);
    setScore(0);
    setTime(0);
    setFirstClick(true);
    gameOverCalledRef.current = false;
  }, [initGrid]);

  // Timer
  useEffect(() => {
    if (gameState === "playing" && !firstClick) {
      timerRef.current = setInterval(() => {
        setTime(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, firstClick]);

  // Game over callback
  useEffect(() => {
    if ((gameState === "won" || gameState === "lost") && !gameOverCalledRef.current) {
      gameOverCalledRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (onGameOver) onGameOver(score);
    }
  }, [gameState, score, onGameOver]);

  // Score callback
  useEffect(() => {
    if (onScoreUpdate && score > 0) onScoreUpdate(score);
  }, [score, onScoreUpdate]);


  // Handle cell click
  const handleClick = useCallback((x: number, y: number) => {
    if (gameState !== "playing" || !difficulty) return;

    let currentGrid = grid;

    // First click - place mines
    if (firstClick) {
      currentGrid = placeMines(grid, x, y, difficulty.mineCount);
      setFirstClick(false);
    }

    const cell = currentGrid[y][x];
    if (cell.isFlagged) return;

    if (cell.isMine) {
      // Game over - reveal all mines
      const lostGrid = currentGrid.map(row => 
        row.map(c => c.isMine ? { ...c, isRevealed: true } : c)
      );
      setGrid(lostGrid);
      setGameState("lost");
      return;
    }

    const newGrid = revealCell(currentGrid, x, y);
    setGrid(newGrid);

    // Count revealed cells for score
    const revealedCount = newGrid.flat().filter(c => c.isRevealed && !c.isMine).length;
    const diffMultiplier = difficulty.gridSize === 8 ? 1 : difficulty.gridSize === 10 ? 1.5 : 2;
    const newScore = Math.floor(revealedCount * 10 * diffMultiplier + Math.max(0, (300 - time) * 2));
    setScore(newScore);

    if (checkWin(newGrid)) {
      // Bonus for winning
      const finalScore = Math.floor(newScore + 500 * diffMultiplier + Math.max(0, (300 - time) * 5));
      setScore(finalScore);
      setGameState("won");
    }
  }, [grid, gameState, firstClick, placeMines, revealCell, checkWin, time, difficulty]);

  // Handle right click (flag)
  const handleRightClick = useCallback((e: React.MouseEvent, x: number, y: number) => {
    e.preventDefault();
    if (gameState !== "playing") return;

    const cell = grid[y][x];
    if (cell.isRevealed) return;

    const newGrid = grid.map(row => row.map(c => ({ ...c })));
    newGrid[y][x].isFlagged = !cell.isFlagged;
    setGrid(newGrid);
    setFlagCount(prev => cell.isFlagged ? prev - 1 : prev + 1);
  }, [grid, gameState]);

  // Long press for flag on mobile
  const longPressRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleTouchStart = useCallback((x: number, y: number) => {
    longPressRef.current = setTimeout(() => {
      if (gameState !== "playing") return;
      const cell = grid[y][x];
      if (cell.isRevealed) return;

      const newGrid = grid.map(row => row.map(c => ({ ...c })));
      newGrid[y][x].isFlagged = !cell.isFlagged;
      setGrid(newGrid);
      setFlagCount(prev => cell.isFlagged ? prev - 1 : prev + 1);
    }, 500);
  }, [grid, gameState]);

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const restartGame = useCallback(() => {
    if (difficulty) {
      setGrid(initGrid(difficulty.gridSize));
      setGameState("playing");
    } else {
      setGameState("menu");
    }
    setFlagCount(0);
    setScore(0);
    setTime(0);
    setFirstClick(true);
    gameOverCalledRef.current = false;
    if (onRestart) onRestart();
  }, [initGrid, onRestart, difficulty]);

  const backToMenu = useCallback(() => {
    setDifficulty(null);
    setGameState("menu");
    setFlagCount(0);
    setScore(0);
    setTime(0);
    setFirstClick(true);
    gameOverCalledRef.current = false;
    if (onRestart) onRestart(); // Reset score submission state
  }, [onRestart]);

  // Get cell display
  const getCellContent = (cell: Cell) => {
    if (cell.isFlagged) return "🚩";
    if (!cell.isRevealed) return "";
    if (cell.isMine) return "💣";
    if (cell.adjacentMines === 0) return "";
    return cell.adjacentMines.toString();
  };

  const getCellColor = (cell: Cell) => {
    if (!cell.isRevealed) return "#4a5568";
    if (cell.isMine) return "#e53e3e";
    const colors = ["", "#3182ce", "#38a169", "#e53e3e", "#805ad5", "#d69e2e", "#00bcd4", "#000", "#718096"];
    return colors[cell.adjacentMines] || "#fff";
  };

  // Menu screen - difficulty selection
  if (gameState === "menu" || !difficulty) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        color: "white",
        padding: "16px",
        gap: "16px",
      }}>
        <h2 style={{
          fontSize: "20px",
          fontFamily: "PixelFont",
          color: "#FFD700",
        }}>
          💣 Minesweeper
        </h2>
        <p style={{
          fontSize: "11px",
          fontFamily: "PixelFont",
          color: "#ccc",
          textAlign: "center",
        }}>
          Select difficulty
        </p>
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          width: "100%",
          maxWidth: "280px",
        }}>
          {Object.entries(DIFFICULTIES).map(([key, diff]) => (
            <button
              key={key}
              onClick={() => startGame(diff)}
              style={{
                padding: "14px 20px",
                backgroundColor: "#3E2723",
                color: "white",
                borderRadius: "10px",
                border: "2px solid #5D4037",
                cursor: "pointer",
                fontFamily: "PixelFont",
                fontSize: "14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ color: "#FFD700" }}>{diff.name}</span>
              <span style={{ fontSize: "11px", color: "#aaa" }}>
                {diff.gridSize}×{diff.gridSize} • {diff.mineCount} 💣
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const boardSize = difficulty.gridSize * difficulty.cellSize;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      color: "white",
      padding: "8px",
      gap: "8px",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        width: boardSize,
        padding: "8px 12px",
        backgroundColor: "#3E2723",
        borderRadius: "8px",
        border: "2px solid #5D4037",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#FFD700", fontFamily: "PixelFont" }}>💣</div>
          <div style={{ fontSize: "16px", fontFamily: "PixelFont" }}>{difficulty.mineCount - flagCount}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#FFD700", fontFamily: "PixelFont" }}>SCORE</div>
          <div style={{ fontSize: "16px", fontFamily: "PixelFont" }}>{score}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#FFD700", fontFamily: "PixelFont" }}>⏱️</div>
          <div style={{ fontSize: "16px", fontFamily: "PixelFont" }}>{time}s</div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${difficulty.gridSize}, ${difficulty.cellSize}px)`,
            gap: "2px",
            backgroundColor: "#2d3748",
            padding: "4px",
            borderRadius: "8px",
            border: "3px solid #5D4037",
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {grid.map((row, y) =>
            row.map((cell, x) => (
              <div
                key={`${x}-${y}`}
                onClick={() => handleClick(x, y)}
                onContextMenu={(e) => handleRightClick(e, x, y)}
                onTouchStart={() => handleTouchStart(x, y)}
                onTouchEnd={handleTouchEnd}
                style={{
                  width: difficulty.cellSize,
                  height: difficulty.cellSize,
                  backgroundColor: cell.isRevealed ? "#1a202c" : "#4a5568",
                  border: cell.isRevealed ? "1px solid #2d3748" : "2px outset #718096",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: difficulty.cellSize > 26 ? "14px" : "12px",
                  fontFamily: "PixelFont",
                  fontWeight: "bold",
                  color: getCellColor(cell),
                  userSelect: "none",
                }}
              >
                {getCellContent(cell)}
              </div>
            ))
          )}
        </div>

        {/* Win/Lose Overlay */}
        {(gameState === "won" || gameState === "lost") && (
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(62, 39, 35, 0.95)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "8px",
            gap: "12px",
          }}>
            <div style={{ fontSize: "32px" }}>
              {gameState === "won" ? "🎉" : "💥"}
            </div>
            <div style={{
              fontSize: "20px",
              fontFamily: "PixelFont",
              color: gameState === "won" ? "#4CAF50" : "#ff5252",
            }}>
              {gameState === "won" ? "You Win!" : "Game Over!"}
            </div>
            <div style={{ fontSize: "14px", fontFamily: "PixelFont" }}>
              Score: {score}
            </div>
            <button
              onClick={restartGame}
              style={{
                padding: "12px 24px",
                backgroundColor: "#7BC043",
                color: "white",
                borderRadius: "8px",
                border: "2px solid #5D9B3A",
                cursor: "pointer",
                fontFamily: "PixelFont",
                fontSize: "14px",
              }}
            >
              Play Again
            </button>
            <button
              onClick={backToMenu}
              style={{
                padding: "10px 20px",
                backgroundColor: "#5D4037",
                color: "white",
                borderRadius: "8px",
                border: "2px solid #3E2723",
                cursor: "pointer",
                fontFamily: "PixelFont",
                fontSize: "12px",
              }}
            >
              Change Difficulty
            </button>
          </div>
        )}
      </div>

      {/* Instructions */}
      <p style={{
        fontSize: "9px",
        fontFamily: "PixelFont",
        color: "#888",
        textAlign: "center",
      }}>
        Click to reveal • Right-click or long-press to flag
      </p>
    </div>
  );
};

export default Minesweeper;
