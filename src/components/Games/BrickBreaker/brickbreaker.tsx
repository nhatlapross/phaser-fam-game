"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";

interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
}

interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  destroyed: boolean;
}

interface PowerUp {
  x: number;
  y: number;
  type: "widen" | "slow" | "life";
  color: string;
}

interface BrickBreakerProps {
  onScoreUpdate?: (score: number) => void;
  onGameOver?: (finalScore: number) => void;
  onRestart?: () => void;
}

// Responsive canvas size
const CANVAS_WIDTH = 300;
const CANVAS_HEIGHT = 420;
const PADDLE_WIDTH = 60;
const PADDLE_HEIGHT = 8;
const BALL_RADIUS = 5;
const BRICK_ROWS = 6;
const BRICK_COLS = 8;
const BRICK_PADDING = 3;
const BASE_BALL_SPEED = 3;
const PADDLE_SPEED = 6;
const POWERUP_SIZE = 12;
const POWERUP_SPEED = 2;
const POWERUP_CHANCE = 0.12;

const BRICK_COLORS = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57", "#ff9ff3"];

const BrickBreaker: React.FC<BrickBreakerProps> = ({ onScoreUpdate, onGameOver, onRestart }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const gameOverCalledRef = useRef(false);

  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover">("menu");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);

  const ballRef = useRef<Ball>({
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT - 50,
    dx: BASE_BALL_SPEED,
    dy: -BASE_BALL_SPEED,
    radius: BALL_RADIUS,
  });

  const paddleRef = useRef<Paddle>({
    x: CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2,
    y: CANVAS_HEIGHT - 20,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
  });

  const bricksRef = useRef<Brick[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const keysRef = useRef<Set<string>>(new Set());
  const paddleWidthTimerRef = useRef<number>(0);
  const touchStartXRef = useRef<number | null>(null);

  // Calculate brick dimensions based on canvas
  const BRICK_WIDTH = Math.floor((CANVAS_WIDTH - BRICK_PADDING * (BRICK_COLS + 1)) / BRICK_COLS);
  const BRICK_HEIGHT = 12;

  const initializeBricks = useCallback(() => {
    const bricks: Brick[] = [];
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        // Random gaps for variety
        if (Math.random() < 0.1) continue;
        
        bricks.push({
          x: BRICK_PADDING + col * (BRICK_WIDTH + BRICK_PADDING),
          y: 40 + row * (BRICK_HEIGHT + BRICK_PADDING),
          width: BRICK_WIDTH,
          height: BRICK_HEIGHT,
          color: BRICK_COLORS[row % BRICK_COLORS.length],
          destroyed: false,
        });
      }
    }
    bricksRef.current = bricks;
  }, [BRICK_WIDTH]);

  const resetBall = useCallback(() => {
    const speed = BASE_BALL_SPEED + (level - 1) * 0.3;
    ballRef.current = {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - 50,
      dx: speed * (Math.random() > 0.5 ? 1 : -1),
      dy: -speed,
      radius: BALL_RADIUS,
    };
  }, [level]);

  const startGame = useCallback(() => {
    setGameState("playing");
    setScore(0);
    setLives(3);
    setLevel(1);
    initializeBricks();
    resetBall();
    paddleRef.current.x = CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2;
    paddleRef.current.width = PADDLE_WIDTH;
    powerUpsRef.current = [];
    gameOverCalledRef.current = false;
  }, [initializeBricks, resetBall]);

  const nextLevel = useCallback(() => {
    setLevel(prev => prev + 1);
    initializeBricks();
    resetBall();
    paddleRef.current.x = CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2;
    powerUpsRef.current = [];
  }, [initializeBricks, resetBall]);

  // Score callback
  useEffect(() => {
    if (onScoreUpdate && score > 0) {
      onScoreUpdate(score);
    }
  }, [score, onScoreUpdate]);

  // Game over callback
  useEffect(() => {
    if (gameState === "gameover" && !gameOverCalledRef.current) {
      gameOverCalledRef.current = true;
      if (onGameOver) {
        onGameOver(score);
      }
    }
  }, [gameState, score, onGameOver]);


  // Game loop
  const gameLoop = useCallback(() => {
    if (gameState !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ball = ballRef.current;
    const paddle = paddleRef.current;
    const bricks = bricksRef.current;
    const powerUps = powerUpsRef.current;

    // Check paddle width timer
    if (paddleWidthTimerRef.current && Date.now() > paddleWidthTimerRef.current) {
      paddle.width = PADDLE_WIDTH;
      paddleWidthTimerRef.current = 0;
    }

    // Clear canvas
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Move paddle with keys
    if (keysRef.current.has("ArrowLeft") || keysRef.current.has("a")) {
      paddle.x = Math.max(0, paddle.x - PADDLE_SPEED);
    }
    if (keysRef.current.has("ArrowRight") || keysRef.current.has("d")) {
      paddle.x = Math.min(CANVAS_WIDTH - paddle.width, paddle.x + PADDLE_SPEED);
    }

    // Move ball
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall collision
    if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= CANVAS_WIDTH) {
      ball.dx = -ball.dx;
    }
    if (ball.y - ball.radius <= 0) {
      ball.dy = -ball.dy;
    }

    // Paddle collision
    if (
      ball.y + ball.radius >= paddle.y &&
      ball.y - ball.radius <= paddle.y + paddle.height &&
      ball.x >= paddle.x &&
      ball.x <= paddle.x + paddle.width
    ) {
      ball.dy = -Math.abs(ball.dy);
      // Angle based on hit position
      const hitPos = (ball.x - paddle.x) / paddle.width;
      const speed = BASE_BALL_SPEED + (level - 1) * 0.3;
      ball.dx = speed * (hitPos - 0.5) * 2.5;
    }

    // Brick collision
    bricks.forEach(brick => {
      if (brick.destroyed) return;
      
      if (
        ball.x + ball.radius > brick.x &&
        ball.x - ball.radius < brick.x + brick.width &&
        ball.y + ball.radius > brick.y &&
        ball.y - ball.radius < brick.y + brick.height
      ) {
        brick.destroyed = true;
        ball.dy = -ball.dy;
        setScore(prev => prev + 10);

        // Spawn power-up
        if (Math.random() < POWERUP_CHANCE) {
          const types: Array<"widen" | "slow" | "life"> = ["widen", "slow", "life"];
          const colors = ["#00ff00", "#00ffff", "#ff00ff"];
          const idx = Math.floor(Math.random() * types.length);
          powerUps.push({
            x: brick.x + brick.width / 2 - POWERUP_SIZE / 2,
            y: brick.y,
            type: types[idx],
            color: colors[idx],
          });
        }
      }
    });

    // Ball out of bounds
    if (ball.y > CANVAS_HEIGHT) {
      setLives(prev => {
        const newLives = prev - 1;
        if (newLives <= 0) {
          setGameState("gameover");
        } else {
          resetBall();
        }
        return newLives;
      });
    }

    // Check level complete
    const remaining = bricks.filter(b => !b.destroyed).length;
    if (remaining === 0) {
      setScore(prev => prev + level * 100);
      nextLevel();
    }

    // Update power-ups
    for (let i = powerUps.length - 1; i >= 0; i--) {
      const pu = powerUps[i];
      pu.y += POWERUP_SPEED;

      // Collect power-up
      if (
        pu.x < paddle.x + paddle.width &&
        pu.x + POWERUP_SIZE > paddle.x &&
        pu.y + POWERUP_SIZE > paddle.y &&
        pu.y < paddle.y + paddle.height
      ) {
        if (pu.type === "widen") {
          paddle.width = PADDLE_WIDTH * 1.5;
          paddleWidthTimerRef.current = Date.now() + 8000;
        } else if (pu.type === "slow") {
          ball.dx *= 0.7;
          ball.dy *= 0.7;
        } else if (pu.type === "life") {
          setLives(prev => prev + 1);
        }
        setScore(prev => prev + 50);
        powerUps.splice(i, 1);
        continue;
      }

      // Remove if off screen
      if (pu.y > CANVAS_HEIGHT) {
        powerUps.splice(i, 1);
      }
    }

    // Draw paddle
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);

    // Draw ball
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Draw bricks
    bricks.forEach(brick => {
      if (!brick.destroyed) {
        ctx.fillStyle = brick.color;
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
      }
    });

    // Draw power-ups
    powerUps.forEach(pu => {
      ctx.fillStyle = pu.color;
      ctx.fillRect(pu.x, pu.y, POWERUP_SIZE, POWERUP_SIZE);
      ctx.fillStyle = "#000";
      ctx.font = "8px PixelFont";
      ctx.textAlign = "center";
      const symbol = pu.type === "widen" ? "W" : pu.type === "slow" ? "S" : "♥";
      ctx.fillText(symbol, pu.x + POWERUP_SIZE / 2, pu.y + POWERUP_SIZE / 2 + 3);
    });

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, level, resetBall, nextLevel]);


  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Game loop effect
  useEffect(() => {
    if (gameState === "playing") {
      animationRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState, gameLoop]);

  // Touch controls for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const touchX = e.touches[0].clientX - rect.left;
    const scaleX = CANVAS_WIDTH / rect.width;
    
    paddleRef.current.x = Math.max(
      0,
      Math.min(CANVAS_WIDTH - paddleRef.current.width, touchX * scaleX - paddleRef.current.width / 2)
    );
  };

  const restartGame = useCallback(() => {
    gameOverCalledRef.current = false;
    startGame();
    if (onRestart) onRestart();
  }, [startGame, onRestart]);

  // Menu screen
  if (gameState === "menu") {
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
          🧱 Brick Breaker
        </h2>
        <p style={{
          fontSize: "11px",
          fontFamily: "PixelFont",
          color: "#ccc",
          textAlign: "center",
          maxWidth: "280px",
        }}>
          Break all bricks! Use ← → keys or touch to move paddle.
        </p>
        <div style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          backgroundColor: "#1a1a2e",
          border: "3px solid #5D4037",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <button
            onClick={startGame}
            style={{
              padding: "16px 32px",
              backgroundColor: "#7BC043",
              color: "white",
              borderRadius: "8px",
              border: "2px solid #5D9B3A",
              cursor: "pointer",
              fontFamily: "PixelFont",
              fontSize: "16px",
            }}
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

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
        width: CANVAS_WIDTH,
        padding: "6px 12px",
        backgroundColor: "#3E2723",
        borderRadius: "8px",
        border: "2px solid #5D4037",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "9px", color: "#FFD700", fontFamily: "PixelFont" }}>SCORE</div>
          <div style={{ fontSize: "14px", fontFamily: "PixelFont" }}>{score}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "9px", color: "#FFD700", fontFamily: "PixelFont" }}>LEVEL</div>
          <div style={{ fontSize: "14px", fontFamily: "PixelFont" }}>{level}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "9px", color: "#FFD700", fontFamily: "PixelFont" }}>LIVES</div>
          <div style={{ fontSize: "14px", fontFamily: "PixelFont", color: lives <= 1 ? "#ff5252" : "white" }}>
            {"♥".repeat(lives)}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          style={{
            border: "3px solid #5D4037",
            borderRadius: "8px",
            touchAction: "none",
          }}
        />

        {/* Game Over Overlay */}
        {gameState === "gameover" && (
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
            <div style={{ fontSize: "20px", fontFamily: "PixelFont", color: "#FFD700" }}>
              Game Over!
            </div>
            <div style={{ fontSize: "14px", fontFamily: "PixelFont" }}>
              Level: {level} | Score: {score}
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
          </div>
        )}
      </div>

      {/* Mobile Controls */}
      <div style={{
        display: "flex",
        gap: "8px",
        width: CANVAS_WIDTH,
      }}>
        <button
          onTouchStart={() => keysRef.current.add("ArrowLeft")}
          onTouchEnd={() => keysRef.current.delete("ArrowLeft")}
          onMouseDown={() => keysRef.current.add("ArrowLeft")}
          onMouseUp={() => keysRef.current.delete("ArrowLeft")}
          onMouseLeave={() => keysRef.current.delete("ArrowLeft")}
          style={btnStyle}
        >
          ← Left
        </button>
        <button
          onTouchStart={() => keysRef.current.add("ArrowRight")}
          onTouchEnd={() => keysRef.current.delete("ArrowRight")}
          onMouseDown={() => keysRef.current.add("ArrowRight")}
          onMouseUp={() => keysRef.current.delete("ArrowRight")}
          onMouseLeave={() => keysRef.current.delete("ArrowRight")}
          style={btnStyle}
        >
          Right →
        </button>
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  flex: 1,
  padding: "14px",
  backgroundColor: "#3E2723",
  color: "white",
  borderRadius: "8px",
  border: "2px solid #5D4037",
  cursor: "pointer",
  fontFamily: "PixelFont",
  fontSize: "12px",
  touchAction: "manipulation",
};

export default BrickBreaker;
