"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface Ball {
  x: number
  y: number
  dx: number
  dy: number
  radius: number
}

interface Paddle {
  x: number
  y: number
  width: number
  height: number
  originalWidth: number
}

interface Brick {
  x: number
  y: number
  width: number
  height: number
  color: string
  destroyed: boolean
}

interface PowerUp {
  x: number
  y: number
  width: number
  height: number
  type: "widen" | "extraBall" | "slowBall" | "extraLife"
  color: string
  dy: number
}

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const PADDLE_WIDTH = 100
const PADDLE_HEIGHT = 10
const BALL_RADIUS = 8
const BRICK_ROWS = 8
const BRICK_COLS = 12
const BRICK_WIDTH = 60
const BRICK_HEIGHT = 20
const BRICK_PADDING = 5
const BASE_BALL_SPEED = 3
const BALL_SPEED_INCREMENT = 0.5
const PADDLE_SPEED = 8
const POWERUP_SIZE = 20
const POWERUP_SPEED = 3
const POWERUP_CHANCE = 0.15 // 15% chance per brick

const BRICK_COLORS = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57", "#ff9ff3"]

const POWERUP_TYPES = [
  { type: "widen" as const, color: "#00ff00", symbol: "W" },
  { type: "extraBall" as const, color: "#ffff00", symbol: "B" },
  { type: "slowBall" as const, color: "#00ffff", symbol: "S" },
  { type: "extraLife" as const, color: "#ff00ff", symbol: "L" },
]

export default function BrickBreakerGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  const [gameState, setGameState] = useState<"menu" | "playing" | "gameOver" | "victory">("menu")
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)

  const getCurrentBallSpeed = useCallback(() => {
    return BASE_BALL_SPEED + (level - 1) * BALL_SPEED_INCREMENT
  }, [level])

  const ballRef = useRef<Ball>({
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT - 50,
    dx: BASE_BALL_SPEED * (Math.random() > 0.5 ? 1 : -1),
    dy: -BASE_BALL_SPEED,
    radius: BALL_RADIUS,
  })

  const paddleRef = useRef<Paddle>({
    x: CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2,
    y: CANVAS_HEIGHT - 30,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    originalWidth: PADDLE_WIDTH,
  })

  const bricksRef = useRef<Brick[]>([])
  const powerUpsRef = useRef<PowerUp[]>([])
  const effectTimersRef = useRef<{ [key: string]: number }>({})
  const keysRef = useRef<Set<string>>(new Set())

  const initializeBricks = useCallback(() => {
    const bricks: Brick[] = []
    const startX = (CANVAS_WIDTH - (BRICK_COLS * (BRICK_WIDTH + BRICK_PADDING) - BRICK_PADDING)) / 2

    for (let row = 0; row < BRICK_ROWS; row++) {
      if (Math.random() < 0.2) continue

      for (let col = 0; col < BRICK_COLS; col++) {
        if (Math.random() < 0.15) continue

        bricks.push({
          x: startX + col * (BRICK_WIDTH + BRICK_PADDING),
          y: 50 + row * (BRICK_HEIGHT + BRICK_PADDING),
          width: BRICK_WIDTH,
          height: BRICK_HEIGHT,
          color: BRICK_COLORS[Math.floor(Math.random() * BRICK_COLORS.length)],
          destroyed: false,
        })
      }
    }
    bricksRef.current = bricks
  }, [])

  const resetBall = useCallback(() => {
    const currentSpeed = getCurrentBallSpeed()
    ballRef.current = {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - 50,
      dx: currentSpeed * (Math.random() > 0.5 ? 1 : -1),
      dy: -currentSpeed,
      radius: BALL_RADIUS,
    }
  }, [getCurrentBallSpeed])

  const createPowerUp = useCallback((x: number, y: number) => {
    if (Math.random() < POWERUP_CHANCE) {
      const powerUpType = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)]
      powerUpsRef.current.push({
        x: x + BRICK_WIDTH / 2 - POWERUP_SIZE / 2,
        y: y + BRICK_HEIGHT,
        width: POWERUP_SIZE,
        height: POWERUP_SIZE,
        type: powerUpType.type,
        color: powerUpType.color,
        dy: POWERUP_SPEED,
      })
    }
  }, [])

  const applyPowerUp = useCallback((powerUp: PowerUp) => {
    switch (powerUp.type) {
      case "widen":
        paddleRef.current.width = paddleRef.current.originalWidth * 1.5
        effectTimersRef.current.widen = Date.now() + 10000 // 10 seconds
        setScore((prev) => prev + 50)
        break
      case "extraBall":
        setScore((prev) => prev + 100)
        break
      case "slowBall":
        ballRef.current.dx *= 0.7
        ballRef.current.dy *= 0.7
        effectTimersRef.current.slowBall = Date.now() + 8000 // 8 seconds
        setScore((prev) => prev + 30)
        break
      case "extraLife":
        setLives((prev) => prev + 1)
        setScore((prev) => prev + 200)
        break
    }
  }, [])

  const startGame = useCallback(() => {
    setGameState("playing")
    setScore(0)
    setLives(3)
    setLevel(1)
    initializeBricks()
    resetBall()
    paddleRef.current.x = CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2
    paddleRef.current.width = PADDLE_WIDTH
    powerUpsRef.current = []
    effectTimersRef.current = {}
  }, [initializeBricks, resetBall])

  const nextLevel = useCallback(() => {
    setLevel((prev) => prev + 1)
    initializeBricks()
    resetBall()
    paddleRef.current.x = CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2
    paddleRef.current.width = PADDLE_WIDTH
    powerUpsRef.current = []
    effectTimersRef.current = {}
  }, [initializeBricks, resetBall])

  const checkCollision = useCallback((rect1: any, rect2: any) => {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    )
  }, [])

  const playSound = useCallback((frequency: number, duration: number) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = frequency
      oscillator.type = "square"

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + duration)
    } catch (e) {
      console.log("Sound effect played")
    }
  }, [])

  const gameLoop = useCallback(() => {
    if (gameState !== "playing") return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const ball = ballRef.current
    const paddle = paddleRef.current
    const bricks = bricksRef.current
    const powerUps = powerUpsRef.current
    const currentBallSpeed = getCurrentBallSpeed()

    const now = Date.now()
    if (effectTimersRef.current.widen && now > effectTimersRef.current.widen) {
      paddle.width = paddle.originalWidth
      delete effectTimersRef.current.widen
    }
    if (effectTimersRef.current.slowBall && now > effectTimersRef.current.slowBall) {
      const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy)
      const normalizedSpeed = currentBallSpeed
      ball.dx = (ball.dx / speed) * normalizedSpeed
      ball.dy = (ball.dy / speed) * normalizedSpeed
      delete effectTimersRef.current.slowBall
    }

    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    if (keysRef.current.has("ArrowLeft") || keysRef.current.has("a") || keysRef.current.has("A")) {
      paddle.x = Math.max(0, paddle.x - PADDLE_SPEED)
    }
    if (keysRef.current.has("ArrowRight") || keysRef.current.has("d") || keysRef.current.has("D")) {
      paddle.x = Math.min(CANVAS_WIDTH - paddle.width, paddle.x + PADDLE_SPEED)
    }

    ball.x += ball.dx
    ball.y += ball.dy

    if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= CANVAS_WIDTH) {
      ball.dx = -ball.dx
      playSound(220, 0.1)
    }
    if (ball.y - ball.radius <= 0) {
      ball.dy = -ball.dy
      playSound(220, 0.1)
    }

    if (
      checkCollision(
        { x: ball.x - ball.radius, y: ball.y - ball.radius, width: ball.radius * 2, height: ball.radius * 2 },
        paddle,
      )
    ) {
      ball.dy = -Math.abs(ball.dy)
      const hitPos = (ball.x - paddle.x) / paddle.width
      ball.dx = currentBallSpeed * (hitPos - 0.5) * 2
      playSound(330, 0.1)
    }

    bricks.forEach((brick, index) => {
      if (
        !brick.destroyed &&
        checkCollision(
          { x: ball.x - ball.radius, y: ball.y - ball.radius, width: ball.radius * 2, height: ball.radius * 2 },
          brick,
        )
      ) {
        brick.destroyed = true
        ball.dy = -ball.dy
        setScore((prev) => prev + 10)
        playSound(440, 0.15)
        createPowerUp(brick.x, brick.y)
      }
    })

    if (ball.y > CANVAS_HEIGHT) {
      setLives((prev) => {
        const newLives = prev - 1
        if (newLives <= 0) {
          setGameState("gameOver")
        } else {
          resetBall()
        }
        return newLives
      })
    }

    const remainingBricks = bricks.filter((brick) => !brick.destroyed).length
    if (remainingBricks === 0) {
      setScore((prev) => prev + level * 100)
      nextLevel()
    }

    ctx.fillStyle = "#fff"
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height)

    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2)
    ctx.fillStyle = "#fff"
    ctx.fill()

    bricks.forEach((brick) => {
      if (!brick.destroyed) {
        ctx.fillStyle = brick.color
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height)
        ctx.strokeStyle = "#fff"
        ctx.lineWidth = 1
        ctx.strokeRect(brick.x, brick.y, brick.width, brick.height)
      }
    })

    for (let i = powerUps.length - 1; i >= 0; i--) {
      const powerUp = powerUps[i]
      powerUp.y += powerUp.dy

      if (checkCollision(powerUp, paddle)) {
        applyPowerUp(powerUp)
        powerUps.splice(i, 1)
        playSound(660, 0.2)
        continue
      }

      if (powerUp.y > CANVAS_HEIGHT) {
        powerUps.splice(i, 1)
      }
    }

    powerUps.forEach((powerUp) => {
      ctx.fillStyle = powerUp.color
      ctx.fillRect(powerUp.x, powerUp.y, powerUp.width, powerUp.height)
      ctx.strokeStyle = "#fff"
      ctx.lineWidth = 2
      ctx.strokeRect(powerUp.x, powerUp.y, powerUp.width, powerUp.height)

      ctx.fillStyle = "#000"
      ctx.font = "14px monospace"
      ctx.textAlign = "center"
      const symbol = POWERUP_TYPES.find((p) => p.type === powerUp.type)?.symbol || "?"
      ctx.fillText(symbol, powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2 + 5)
    })

    ctx.fillStyle = "#fff"
    ctx.font = "20px monospace"
    ctx.textAlign = "left"
    ctx.fillText(`Score: ${score}`, 20, 30)
    ctx.fillText(`Lives: ${lives}`, CANVAS_WIDTH - 120, 30)
    ctx.fillText(`Level: ${level}`, CANVAS_WIDTH / 2 - 40, 30)

    let yOffset = 60
    if (effectTimersRef.current.widen) {
      ctx.fillStyle = "#00ff00"
      ctx.font = "14px monospace"
      ctx.fillText("WIDE PADDLE", 20, yOffset)
      yOffset += 20
    }
    if (effectTimersRef.current.slowBall) {
      ctx.fillStyle = "#00ffff"
      ctx.font = "14px monospace"
      ctx.fillText("SLOW BALL", 20, yOffset)
    }

    animationRef.current = requestAnimationFrame(gameLoop)
  }, [
    gameState,
    score,
    lives,
    level,
    checkCollision,
    playSound,
    resetBall,
    createPowerUp,
    applyPowerUp,
    getCurrentBallSpeed,
    nextLevel,
  ])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key)
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [])

  useEffect(() => {
    if (gameState === "playing") {
      animationRef.current = requestAnimationFrame(gameLoop)
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [gameState, gameLoop])

  return (
    <div className="flex flex-col items-center gap-4">
      <Card className="p-6 bg-gray-900 border-gray-700">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold text-white mb-2 font-mono">BRICK BREAKER</h1>
          <p className="text-gray-300 text-sm">Use ← → or A/D keys to move paddle</p>
          <p className="text-gray-400 text-xs mt-1">
            Power-ups: W=Wide Paddle, B=Extra Ball, S=Slow Ball, L=Extra Life
          </p>
          <p className="text-gray-400 text-xs mt-1">Ball speed increases with each level!</p>
        </div>

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="border border-gray-600 bg-black"
          style={{ imageRendering: "pixelated" }}
        />

        <div className="mt-4 text-center">
          {gameState === "menu" && (
            <div>
              <p className="text-white mb-4">Break all the bricks to advance levels!</p>
              <Button onClick={startGame} className="bg-blue-600 hover:bg-blue-700">
                Start Game
              </Button>
            </div>
          )}

          {gameState === "gameOver" && (
            <div>
              <p className="text-red-400 text-xl mb-2">Game Over!</p>
              <p className="text-white mb-2">Level Reached: {level}</p>
              <p className="text-white mb-4">Final Score: {score}</p>
              <Button onClick={startGame} className="bg-blue-600 hover:bg-blue-700">
                Play Again
              </Button>
            </div>
          )}

          {gameState === "victory" && (
            <div>
              <p className="text-green-400 text-xl mb-2">Victory!</p>
              <p className="text-white mb-2">Level Reached: {level}</p>
              <p className="text-white mb-4">Final Score: {score}</p>
              <Button onClick={startGame} className="bg-blue-600 hover:bg-blue-700">
                Play Again
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
