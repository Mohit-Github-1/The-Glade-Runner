import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Key as KeyIcon,
  Battery,
  Droplets,
  Compass,
  Map as MapIcon,
  Download,
  Copy,
  Check,
  ChevronRight,
  Shield,
  Zap,
} from 'lucide-react';

import {
  GameState,
  Difficulty,
  DIFFICULTY_SETTINGS,
  TILE,
  Player,
  Camera,
  Particle,
  GameStats,
} from './game/types';
import {
  generateMaze,
  MazeData,
  findPathBFS,
  hasLineOfSight,
  resolveWallCollision,
} from './game/maze';
import { sound } from './game/audio';
import { GameRenderer } from './game/renderer';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullMapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // High level UI states
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');
  const [seedInput, setSeedInput] = useState<string>('GLADE-' + Math.floor(1000 + Math.random() * 9000));
  const [activeSeed, setActiveSeed] = useState<string>('');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showFullMap, setShowFullMap] = useState<boolean>(false);
  const [copiedSeed, setCopiedSeed] = useState<boolean>(false);

  // HUD live states (updated on frame throttled)
  const [hudHealth, setHudHealth] = useState<number>(100);
  const [hudStamina, setHudStamina] = useState<number>(100);
  const [hudBattery, setHudBattery] = useState<number>(100);
  const [hudFlashlight, setHudFlashlight] = useState<boolean>(false);
  const [hudKeys, setHudKeys] = useState<number>(0);
  const [hudTotalKeys, setHudTotalKeys] = useState<number>(3);
  const [hudTimeRemaining, setHudTimeRemaining] = useState<number>(480);
  const [hudTimeElapsed, setHudTimeElapsed] = useState<number>(0);
  const [hudIsHiding, setHudIsHiding] = useState<boolean>(false);
  const [hasCheckpoint, setHasCheckpoint] = useState<boolean>(false);

  // Final summary stats
  const [finalStats, setFinalStats] = useState<GameStats>({
    timeElapsed: 0,
    stepsWalked: 0,
    keysCollected: 0,
    damageTaken: 0,
    checkpointsActivated: 0,
    grieversEvaded: 0,
  });

  // Mobile virtual joystick & touch states
  const [touchActive, setTouchActive] = useState<boolean>(false);
  const [joystickPos, setJoystickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [touchVector, setTouchVector] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [touchSprint, setTouchSprint] = useState<boolean>(false);

  // Game internal mutable engine refs (avoids React re-renders in 60FPS loop)
  const engineRef = useRef<{
    maze: MazeData | null;
    player: Player;
    camera: Camera;
    explored: boolean[][];
    particles: Particle[];
    renderer: GameRenderer;
    keysDown: Set<string>;
    mousePos: { x: number; y: number };
    screenShake: { x: number; y: number; duration: number; intensity: number };
    gameTime: number;
    lastTime: number;
    activeCheckpoint: { x: number; y: number } | null;
    stats: GameStats;
    timeLimit: number;
    difficultyConfig: typeof DIFFICULTY_SETTINGS['NORMAL'];
  }>({
    maze: null,
    player: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 16,
      angle: 0,
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      battery: 100,
      maxBattery: 100,
      flashlightOn: false,
      keys: 0,
      totalKeysRequired: 3,
      isSprinting: false,
      isHiding: false,
      invulnerableTime: 0,
      stepsTaken: 0,
      footstepTimer: 0,
    },
    camera: { x: 0, y: 0, scale: 1.0, targetX: 0, targetY: 0 },
    explored: [],
    particles: [],
    renderer: new GameRenderer(),
    keysDown: new Set<string>(),
    mousePos: { x: 0, y: 0 },
    screenShake: { x: 0, y: 0, duration: 0, intensity: 0 },
    gameTime: 0,
    lastTime: 0,
    activeCheckpoint: null,
    stats: {
      timeElapsed: 0,
      stepsWalked: 0,
      keysCollected: 0,
      damageTaken: 0,
      checkpointsActivated: 0,
      grieversEvaded: 0,
    },
    timeLimit: 480,
    difficultyConfig: DIFFICULTY_SETTINGS.NORMAL,
  });

  // Touch joystick touch identifier tracking
  const joystickTouchIdRef = useRef<number | null>(null);
  const joystickCenterRef = useRef<{ x: number; y: number }>({ x: 80, y: 80 });

  // Start or restart a game
  const startGame = useCallback((selectedDiff: Difficulty, customSeed?: string) => {
    sound.init();
    sound.resume();

    const diffCfg = DIFFICULTY_SETTINGS[selectedDiff];
    const seed = customSeed || seedInput.trim() || ('GLADE-' + Math.floor(1000 + Math.random() * 9000));
    setActiveSeed(seed);

    const maze = generateMaze(diffCfg.mazeSize, seed, diffCfg.grieverCount, diffCfg.movingWallCount, 64);

    // Explored fog matrix
    const explored: boolean[][] = Array.from({ length: maze.height }, () =>
      new Array(maze.width).fill(false)
    );

    // Initial player state
    const player: Player = {
      x: maze.spawnPoint.x,
      y: maze.spawnPoint.y,
      vx: 0,
      vy: 0,
      radius: 16,
      angle: 0,
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      battery: 100,
      maxBattery: 100,
      flashlightOn: false,
      keys: 0,
      totalKeysRequired: 3,
      isSprinting: false,
      isHiding: false,
      invulnerableTime: 0,
      stepsTaken: 0,
      footstepTimer: 0,
    };

    // Pre-explore Glade sanctuary
    const gladeRad = 4;
    const centerGX = Math.floor(maze.width / 2);
    const centerGY = Math.floor(maze.height / 2);
    for (let dy = -gladeRad; dy <= gladeRad; dy++) {
      for (let dx = -gladeRad; dx <= gladeRad; dx++) {
        const gx = centerGX + dx;
        const gy = centerGY + dy;
        if (gx >= 0 && gx < maze.width && gy >= 0 && gy < maze.height) {
          explored[gy][gx] = true;
        }
      }
    }

    engineRef.current.maze = maze;
    engineRef.current.player = player;
    engineRef.current.camera = {
      x: player.x,
      y: player.y,
      scale: window.innerWidth < 768 ? 0.85 : 1.0,
      targetX: player.x,
      targetY: player.y,
    };
    engineRef.current.explored = explored;
    engineRef.current.particles = [];
    engineRef.current.gameTime = 0;
    engineRef.current.lastTime = performance.now();
    engineRef.current.activeCheckpoint = null;
    engineRef.current.timeLimit = diffCfg.timeLimitSeconds;
    engineRef.current.difficultyConfig = diffCfg;
    engineRef.current.stats = {
      timeElapsed: 0,
      stepsWalked: 0,
      keysCollected: 0,
      damageTaken: 0,
      checkpointsActivated: 0,
      grieversEvaded: 0,
    };

    setHudHealth(100);
    setHudStamina(100);
    setHudBattery(100);
    setHudFlashlight(false);
    setHudKeys(0);
    setHudTotalKeys(3);
    setHudTimeRemaining(diffCfg.timeLimitSeconds);
    setHudTimeElapsed(0);
    setHudIsHiding(false);
    setHasCheckpoint(false);
    setShowFullMap(false);
    setGameState('PLAYING');
  }, [seedInput]);

  // Respawn at Checkpoint
  const respawnAtCheckpoint = useCallback(() => {
    const eng = engineRef.current;
    if (!eng.maze) return;

    let targetX = eng.maze.spawnPoint.x;
    let targetY = eng.maze.spawnPoint.y;

    if (eng.activeCheckpoint) {
      targetX = eng.activeCheckpoint.x;
      targetY = eng.activeCheckpoint.y;
    }

    eng.player.x = targetX;
    eng.player.y = targetY;
    eng.player.vx = 0;
    eng.player.vy = 0;
    eng.player.health = 100;
    eng.player.stamina = 100;
    eng.player.invulnerableTime = 2.0;

    // Push Grievers away from spawn / checkpoint
    eng.maze.grievers.forEach(g => {
      const dist = Math.hypot(g.x - targetX, g.y - targetY);
      if (dist < 350) {
        g.state = 'PATROL';
        g.x += 400;
        g.y += 400;
      }
    });

    setHudHealth(100);
    setHudStamina(100);
    setGameState('PLAYING');
  }, []);

  // Keyboard input listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      sound.resume();
      const code = e.code;
      engineRef.current.keysDown.add(code);

      // Flashlight toggle (F)
      if (code === 'KeyF') {
        const p = engineRef.current.player;
        if (p.battery > 0) {
          p.flashlightOn = !p.flashlightOn;
          sound.playFlashlightToggle(p.flashlightOn);
          setHudFlashlight(p.flashlightOn);
        }
      }

      // Map toggle (KeyM)
      if (code === 'KeyM') {
        setShowFullMap(prev => !prev);
      }

      // Pause toggle (Escape)
      if (code === 'Escape') {
        setGameState(prev => {
          if (prev === 'PLAYING') return 'PAUSED';
          if (prev === 'PAUSED') return 'PLAYING';
          return prev;
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      engineRef.current.keysDown.delete(e.code);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        engineRef.current.camera.scale = window.innerWidth < 768 ? 0.85 : 1.0;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Main 60 FPS Game Loop
  useEffect(() => {
    let animId: number;

    const loop = (currentTime: number) => {
      animId = requestAnimationFrame(loop);

      const eng = engineRef.current;
      if (!eng.maze || gameState !== 'PLAYING') {
        eng.lastTime = currentTime;
        return;
      }

      // Delta time capped at 0.1s to avoid physics tunneling
      let dt = (currentTime - eng.lastTime) / 1000;
      if (dt > 0.1) dt = 0.1;
      eng.lastTime = currentTime;
      eng.gameTime += dt;

      const maze = eng.maze;
      const player = eng.player;
      const camera = eng.camera;
      const keys = eng.keysDown;
      const diffCfg = eng.difficultyConfig;

      // 1. Time Countdown & Stats
      eng.stats.timeElapsed += dt;
      const remaining = Math.max(0, eng.timeLimit - eng.stats.timeElapsed);

      // Check time out
      if (remaining <= 0 && player.health > 0) {
        player.health = 0;
        sound.playHurt();
        setFinalStats({ ...eng.stats });
        setGameState('GAME_OVER');
      }

      // 2. Player Movement Input
      let moveX = 0;
      let moveY = 0;

      if (keys.has('KeyW') || keys.has('ArrowUp')) moveY -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) moveY += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) moveX -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) moveX += 1;

      // Add mobile touch vector
      if (touchVector.x !== 0 || touchVector.y !== 0) {
        moveX += touchVector.x;
        moveY += touchVector.y;
      }

      const inputLen = Math.hypot(moveX, moveY);
      if (inputLen > 1) {
        moveX /= inputLen;
        moveY /= inputLen;
      }

      // Sprinting determination
      const isSprintingKey = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchSprint;
      const canSprint = isSprintingKey && player.stamina > 2 && inputLen > 0.1;
      player.isSprinting = canSprint;

      // Stamina update
      if (player.isSprinting) {
        player.stamina = Math.max(0, player.stamina - diffCfg.staminaDrainRate * 100 * dt);
      } else {
        const regenRate = inputLen > 0.1 ? 16 : 26; // Faster recovery when idle
        player.stamina = Math.min(player.maxStamina, player.stamina + regenRate * dt);
      }

      // Base move speed (px per sec)
      const currentSpeed = player.isSprinting ? 245 : 145;
      const targetVx = moveX * currentSpeed;
      const targetVy = moveY * currentSpeed;

      // Smooth acceleration
      player.vx += (targetVx - player.vx) * Math.min(1, 16 * dt);
      player.vy += (targetVy - player.vy) * Math.min(1, 16 * dt);

      // Desired position
      const desiredX = player.x + player.vx * dt;
      const desiredY = player.y + player.vy * dt;

      // Collision response with continuous sliding
      const collisionResult = resolveWallCollision(
        desiredX,
        desiredY,
        player.radius,
        maze.grid,
        maze.tileSize,
        maze.movingWalls
      );

      player.x = collisionResult.x;
      player.y = collisionResult.y;

      // Update orientation angle towards movement or mouse
      if (inputLen > 0.05) {
        player.angle = Math.atan2(player.vy, player.vx);
        player.stepsTaken += Math.hypot(player.vx, player.vy) * dt;
        eng.stats.stepsWalked = Math.floor(player.stepsTaken / 32);

        // Procedural footstep audio
        player.footstepTimer += dt;
        const footstepInterval = player.isSprinting ? 0.24 : 0.38;
        if (player.footstepTimer >= footstepInterval) {
          player.footstepTimer = 0;
          sound.playFootstep(player.isSprinting);

          // Emit dust particle
          eng.particles.push({
            x: player.x - Math.cos(player.angle) * 10,
            y: player.y - Math.sin(player.angle) * 10,
            vx: (Math.random() - 0.5) * 15,
            vy: (Math.random() - 0.5) * 15,
            life: 0.35,
            maxLife: 0.35,
            size: 2.5,
            color: '#78716c',
            alpha: 0.4,
            type: 'DUST',
          });
        }
      }

      // 3. Flashlight Battery Drain and Auto-Recharge
      if (player.flashlightOn) {
        player.battery = Math.max(0, player.battery - diffCfg.batteryDrainRate * 100 * dt);
        if (player.battery <= 0) {
          player.flashlightOn = false;
          sound.playFlashlightToggle(false);
          setHudFlashlight(false);
        }
      } else {
        // Slow trickle recharge when flashlight is off
        player.battery = Math.min(player.maxBattery, player.battery + 2.5 * dt);
      }

      // 4. Check Current Tile for Hiding Spots (Ivy Alcoves)
      const currentGridX = Math.floor(player.x / maze.tileSize);
      const currentGridY = Math.floor(player.y / maze.tileSize);
      const currentTile = maze.grid[currentGridY]?.[currentGridX];

      player.isHiding = currentTile === TILE.IVY_ALCOVE;

      // 5. Update Explored Fog of War
      const revealRadius = player.flashlightOn ? 5 : 3;
      for (let dy = -revealRadius; dy <= revealRadius; dy++) {
        for (let dx = -revealRadius; dx <= revealRadius; dx++) {
          const gx = currentGridX + dx;
          const gy = currentGridY + dy;
          if (gx >= 0 && gx < maze.width && gy >= 0 && gy < maze.height) {
            if (Math.hypot(dx, dy) <= revealRadius + 0.5) {
              eng.explored[gy][gx] = true;
            }
          }
        }
      }

      // 6. Check Checkpoints
      maze.checkpoints.forEach(cp => {
        if (!cp.activated) {
          const dist = Math.hypot(player.x - cp.worldX, player.y - cp.worldY);
          if (dist < 32) {
            cp.activated = true;
            eng.activeCheckpoint = { x: cp.worldX, y: cp.worldY };
            eng.stats.checkpointsActivated++;
            setHasCheckpoint(true);
            sound.playCheckpointActivated();
          }
        }
      });

      // 7. Check Collectibles (Keys, Battery, Water)
      maze.collectibles.forEach(col => {
        if (!col.collected) {
          const dist = Math.hypot(player.x - col.x, player.y - col.y);
          if (dist < 26) {
            col.collected = true;
            if (col.type === 'KEY') {
              player.keys++;
              eng.stats.keysCollected++;
              sound.playKeyPickup();
              setHudKeys(player.keys);
            } else if (col.type === 'BATTERY') {
              player.battery = Math.min(player.maxBattery, player.battery + 45);
              sound.playBatteryPickup();
            } else if (col.type === 'WATER') {
              player.stamina = player.maxStamina;
              player.health = Math.min(player.maxHealth, player.health + 25);
              sound.playWaterPickup();
            }
          }
        }
      });

      // 8. Exit Gate Check (Victory condition)
      const distToExit = Math.hypot(player.x - maze.exitGateWorld.x, player.y - maze.exitGateWorld.y);
      if (distToExit < 40) {
        if (player.keys >= player.totalKeysRequired) {
          sound.playGateUnlock();
          setFinalStats({ ...eng.stats });
          setGameState('VICTORY');
        }
      }

      // 9. Moving Walls Lifecycle & Transitions
      maze.movingWalls.forEach(mw => {
        mw.timer += dt;
        if (mw.timer >= mw.cyclePeriod) {
          mw.timer = 0;
        }

        // State machine: OPENING -> OPEN -> CLOSING -> CLOSED
        const closeStart = mw.openDuration;
        const closeEnd = mw.openDuration + 1.2;
        const openStart = mw.cyclePeriod - 1.2;

        if (mw.timer < closeStart) {
          mw.state = 'OPEN';
          mw.transitionProgress = 1.0;
        } else if (mw.timer >= closeStart && mw.timer < closeEnd) {
          mw.state = 'CLOSING';
          const p = (mw.timer - closeStart) / 1.2;
          mw.transitionProgress = 1.0 - p;
          if (mw.timer - closeStart < dt * 1.5) {
            sound.playWallMove();
            eng.screenShake = { x: 0, y: 0, duration: 0.5, intensity: 4 };
          }
        } else if (mw.timer >= closeEnd && mw.timer < openStart) {
          mw.state = 'CLOSED';
          mw.transitionProgress = 0.0;
        } else {
          mw.state = 'OPENING';
          const p = (mw.timer - openStart) / 1.2;
          mw.transitionProgress = p;
          if (mw.timer - openStart < dt * 1.5) {
            sound.playWallMove();
            eng.screenShake = { x: 0, y: 0, duration: 0.4, intensity: 3 };
          }
        }
      });

      // 10. Grievers AI & Behavior
      maze.grievers.forEach(gr => {
        gr.growlTimer -= dt;
        if (gr.growlTimer <= 0) {
          gr.growlTimer = 4 + Math.random() * 6;
          const dist = Math.hypot(gr.x - player.x, gr.y - player.y);
          if (dist < 450) {
            sound.playGrieverClick();
          }
        }

        // Perception checks
        const distToPlayer = Math.hypot(gr.x - player.x, gr.y - player.y);
        const hasLOS = hasLineOfSight(maze.grid, gr.x, gr.y, player.x, player.y, maze.tileSize, maze.movingWalls);

        // Sound detection radius: Sprinting = 320px, Walking = 130px
        const soundRadius = player.isSprinting ? 320 : 130;
        const heardPlayer = distToPlayer < soundRadius && inputLen > 0.1 && !player.isHiding;
        const sawPlayer = hasLOS && distToPlayer < 240 && !player.isHiding;

        // Flashlight detection: if shining directly onto griever
        let flashlightSpotted = false;
        if (player.flashlightOn && hasLOS && distToPlayer < 400 && !player.isHiding) {
          const angleToGriever = Math.atan2(gr.y - player.y, gr.x - player.x);
          let angleDiff = Math.abs(player.angle - angleToGriever);
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          if (Math.abs(angleDiff) < 0.6) {
            flashlightSpotted = true;
          }
        }

        // State transitions
        if ((sawPlayer || heardPlayer || flashlightSpotted) && !player.isHiding) {
          if (gr.state !== 'CHASE') {
            sound.playGrieverScreech(1.1);
            eng.stats.grieversEvaded++;
          }
          gr.state = 'CHASE';
          gr.targetX = player.x;
          gr.targetY = player.y;
          gr.speed = 135; // Fast chase speed
        } else if (player.isHiding && gr.state === 'CHASE') {
          // Player broke line of sight in ivy alcove!
          gr.state = 'PATROL';
          gr.speed = 80;
        }

        // Pathfinding updates (throttled to save CPU)
        gr.pathUpdateTimer -= dt;
        if (gr.pathUpdateTimer <= 0) {
          gr.pathUpdateTimer = gr.state === 'CHASE' ? 0.35 : 0.9;

          const startGX = Math.floor(gr.x / maze.tileSize);
          const startGY = Math.floor(gr.y / maze.tileSize);
          let targetGX = Math.floor(gr.targetX / maze.tileSize);
          let targetGY = Math.floor(gr.targetY / maze.tileSize);

          if (gr.state === 'PATROL') {
            // Pick a random corridor neighbor when waypoint reached
            if (gr.path.length === 0) {
              const rx = Math.max(1, Math.min(maze.width - 2, startGX + Math.floor((Math.random() - 0.5) * 8)));
              const ry = Math.max(1, Math.min(maze.height - 2, startGY + Math.floor((Math.random() - 0.5) * 8)));
              targetGX = rx;
              targetGY = ry;
            }
          }

          gr.path = findPathBFS(
            maze.grid,
            { x: startGX, y: startGY },
            { x: targetGX, y: targetGY },
            maze.movingWalls,
            50
          );
        }

        // Follow path waypoints
        if (gr.path.length > 0) {
          const nextWaypoint = gr.path[0];
          const wpWorldX = (nextWaypoint.x + 0.5) * maze.tileSize;
          const wpWorldY = (nextWaypoint.y + 0.5) * maze.tileSize;

          const dx = wpWorldX - gr.x;
          const dy = wpWorldY - gr.y;
          const distToWp = Math.hypot(dx, dy);

          if (distToWp < 14) {
            gr.path.shift();
          } else {
            gr.vx = (dx / distToWp) * gr.speed;
            gr.vy = (dy / distToWp) * gr.speed;
            gr.angle = Math.atan2(gr.vy, gr.vx);
          }
        } else {
          gr.vx *= 0.8;
          gr.vy *= 0.8;
        }

        // Move griever
        gr.x += gr.vx * dt;
        gr.y += gr.vy * dt;
        gr.legCycle += Math.hypot(gr.vx, gr.vy) * dt * 0.12;

        // Collision with walls
        const grCol = resolveWallCollision(gr.x, gr.y, gr.radius, maze.grid, maze.tileSize, maze.movingWalls);
        gr.x = grCol.x;
        gr.y = grCol.y;

        // Damage player on touch
        if (distToPlayer < player.radius + gr.radius && player.invulnerableTime <= 0) {
          player.health = Math.max(0, player.health - 30);
          player.invulnerableTime = 1.3;
          eng.stats.damageTaken += 30;
          sound.playHurt();
          eng.screenShake = { x: 0, y: 0, duration: 0.45, intensity: 8 };

          // Knockback
          const knockAngle = Math.atan2(player.y - gr.y, player.x - gr.x);
          player.vx += Math.cos(knockAngle) * 280;
          player.vy += Math.sin(knockAngle) * 280;

          if (player.health <= 0) {
            setFinalStats({ ...eng.stats });
            setGameState('GAME_OVER');
          }
        }
      });

      // Invulnerability timer
      if (player.invulnerableTime > 0) {
        player.invulnerableTime = Math.max(0, player.invulnerableTime - dt);
      }

      // 11. Camera Smooth Follow (Lerp)
      camera.targetX = player.x;
      camera.targetY = player.y;
      camera.x += (camera.targetX - camera.x) * Math.min(1, 10 * dt);
      camera.y += (camera.targetY - camera.y) * Math.min(1, 10 * dt);

      // 12. Screen Shake decay
      if (eng.screenShake.duration > 0) {
        eng.screenShake.duration -= dt;
        eng.screenShake.x = (Math.random() - 0.5) * eng.screenShake.intensity * 2;
        eng.screenShake.y = (Math.random() - 0.5) * eng.screenShake.intensity * 2;
      } else {
        eng.screenShake.x = 0;
        eng.screenShake.y = 0;
      }

      // 13. Particle Lifecycle
      for (let i = eng.particles.length - 1; i >= 0; i--) {
        const p = eng.particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha = Math.max(0, p.life / p.maxLife);
        if (p.life <= 0) {
          eng.particles.splice(i, 1);
        }
      }

      // Ambient dust motes
      if (eng.particles.length < 35 && Math.random() < 0.25) {
        eng.particles.push({
          x: player.x + (Math.random() - 0.5) * 450,
          y: player.y + (Math.random() - 0.5) * 450,
          vx: (Math.random() - 0.5) * 12,
          vy: (Math.random() - 0.5) * 12,
          life: 2.5 + Math.random() * 2,
          maxLife: 4.5,
          size: 1.5,
          color: '#e2e8f0',
          alpha: 0.35,
          type: 'EMBER',
        });
      }

      // 14. Render Frame
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          eng.renderer.render(
            ctx,
            canvas.width,
            canvas.height,
            maze,
            player,
            camera,
            eng.explored,
            eng.particles,
            eng.gameTime,
            eng.screenShake
          );
        }
      }

      // Render Minimap
      const miniCanvas = minimapCanvasRef.current;
      if (miniCanvas) {
        const mctx = miniCanvas.getContext('2d');
        if (mctx) {
          eng.renderer.renderMinimap(
            mctx,
            miniCanvas.width,
            miniCanvas.height,
            maze,
            player,
            eng.explored,
            false
          );
        }
      }

      // Render Fullscreen Map if open
      if (showFullMap) {
        const fullCanvas = fullMapCanvasRef.current;
        if (fullCanvas) {
          const fctx = fullCanvas.getContext('2d');
          if (fctx) {
            eng.renderer.renderMinimap(
              fctx,
              fullCanvas.width,
              fullCanvas.height,
              maze,
              player,
              eng.explored,
              true
            );
          }
        }
      }

      // 15. Throttle React HUD state updates (~15 FPS)
      if (Math.floor(currentTime / 66) !== Math.floor((currentTime - dt * 1000) / 66)) {
        setHudHealth(Math.round(player.health));
        setHudStamina(Math.round(player.stamina));
        setHudBattery(Math.round(player.battery));
        setHudTimeRemaining(Math.round(remaining));
        setHudTimeElapsed(Math.round(eng.stats.timeElapsed));
        setHudIsHiding(player.isHiding);
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [gameState, showFullMap, touchVector, touchSprint]);

  // Touch Joystick handlers
  const handleJoystickTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    sound.resume();
    const touch = e.changedTouches[0];
    joystickTouchIdRef.current = touch.identifier;
    const rect = e.currentTarget.getBoundingClientRect();
    joystickCenterRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    setTouchActive(true);
  };

  const handleJoystickTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!touchActive || joystickTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchIdRef.current) {
        const dx = touch.clientX - joystickCenterRef.current.x;
        const dy = touch.clientY - joystickCenterRef.current.y;
        const maxDist = 48;
        const dist = Math.hypot(dx, dy);
        const clampedDist = Math.min(dist, maxDist);
        const angle = Math.atan2(dy, dx);

        const knobX = Math.cos(angle) * clampedDist;
        const knobY = Math.sin(angle) * clampedDist;

        setJoystickPos({ x: knobX, y: knobY });
        setTouchVector({
          x: clampedDist > 6 ? knobX / maxDist : 0,
          y: clampedDist > 6 ? knobY / maxDist : 0,
        });
        break;
      }
    }
  };

  const handleJoystickTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchIdRef.current) {
        joystickTouchIdRef.current = null;
        setTouchActive(false);
        setJoystickPos({ x: 0, y: 0 });
        setTouchVector({ x: 0, y: 0 });
        break;
      }
    }
  };

  // Standalone HTML Exporter
  const handleExportStandaloneHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>The Glade Runner - Maze Escape (Standalone)</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body, html { width:100%; height:100%; overflow:hidden; background:#0c0a09; font-family:sans-serif; touch-action:none; color:#f5f5f4; }
#gameCanvas { position:absolute; top:0; left:0; width:100%; height:100%; display:block; }
#hud { position:absolute; top:12px; left:12px; right:12px; display:flex; justify-content:space-between; pointer-events:none; font-size:13px; font-weight:600; text-shadow:0 1px 3px rgba(0,0,0,0.8); }
.bar-wrap { background:rgba(0,0,0,0.6); padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); }
.bar { height:8px; border-radius:4px; margin-top:3px; }
#hpBar { width:100px; background:#ef4444; }
#stamBar { width:100px; background:#f59e0b; }
#batBar { width:100px; background:#06b6d4; }
#controlsHelp { position:absolute; bottom:12px; left:12px; background:rgba(0,0,0,0.7); padding:8px 12px; border-radius:8px; font-size:12px; pointer-events:none; }
#menuOverlay { position:absolute; inset:0; background:rgba(12,10,9,0.92); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:50; }
.btn { background:#292524; color:#fff; border:1px solid #78716c; padding:10px 24px; border-radius:8px; font-size:15px; font-weight:700; cursor:pointer; margin:6px; transition:0.2s; }
.btn:hover { background:#44403c; }
</style>
</head>
<body>
<canvas id="gameCanvas"></canvas>
<div id="hud">
  <div class="bar-wrap">
    <div>HEALTH <div id="hpBar" class="bar"></div></div>
    <div style="margin-top:6px;">STAMINA <div id="stamBar" class="bar"></div></div>
    <div style="margin-top:6px;">BATTERY (F) <div id="batBar" class="bar"></div></div>
  </div>
  <div class="bar-wrap" style="text-align:right;">
    <div>KEYS: <span id="keyText" style="color:#fbbf24;">0 / 3</span></div>
    <div style="margin-top:6px;">TIME: <span id="timeText">08:00</span></div>
    <div style="margin-top:6px; font-size:11px; color:#a8a29e;">SEED: <span id="seedText"></span></div>
  </div>
</div>
<div id="controlsHelp">WASD: Move | Shift: Sprint | F: Flashlight | M: Map | Esc: Pause</div>
<div id="menuOverlay">
  <h1 style="font-size:32px; letter-spacing:2px; margin-bottom:8px;">THE GLADE RUNNER</h1>
  <p style="color:#a8a29e; max-width:400px; text-align:center; margin-bottom:24px; font-size:14px;">Escape the shifting stone labyrinth. Collect 3 Ancient Keys to unlock the Perimeter Gate. Evade mechanical Grievers or hide in Ivy Alcoves.</p>
  <button id="startBtn" class="btn">START ESCAPE</button>
</div>
<script>
// Synthesized Audio & Canvas Engine in pure Vanilla JS
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

let audioCtx = null;
function playBeep(freq, type, dur) {
  try {
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
  } catch(e) {}
}

const size = 55, tileSize = 64;
let grid = [], player = { x: (size*tileSize)/2, y: (size*tileSize)/2, vx:0, vy:0, angle:0, hp:100, stam:100, bat:100, flash:false, keys:0 };
let keysDown = {};
window.addEventListener('keydown', e => {
  keysDown[e.code] = true;
  if(e.code === 'KeyF') { player.flash = !player.flash; playBeep(player.flash ? 800 : 400, 'triangle', 0.05); }
});
window.addEventListener('keyup', e => { keysDown[e.code] = false; });

// Maze generation DFS
for(let y=0; y<size; y++){ grid[y] = []; for(let x=0; x<size; x++) grid[y][x] = 1; }
let stack = [{x:1, y:1}]; grid[1][1] = 0;
while(stack.length > 0){
  let cur = stack[stack.length-1];
  let neighbors = [];
  [[0,-2],[0,2],[-2,0],[2,0]].sort(()=>Math.random()-0.5).forEach(([dx,dy])=>{
    let nx = cur.x+dx, ny = cur.y+dy;
    if(nx>0 && nx<size-1 && ny>0 && ny<size-1 && grid[ny][nx]===1) neighbors.push({x:nx, y:ny, wx:cur.x+dx/2, wy:cur.y+dy/2});
  });
  if(neighbors.length > 0){
    let chosen = neighbors[0];
    grid[chosen.wy][chosen.wx] = 0; grid[chosen.y][chosen.x] = 0;
    stack.push({x:chosen.x, y:chosen.y});
  } else stack.pop();
}
// Clear Glade Center
let c = Math.floor(size/2);
for(let dy=-3; dy<=3; dy++) for(let dx=-3; dx<=3; dx++) grid[c+dy][c+dx] = 0;
// Loops
for(let i=0; i<size*1.5; i++){
  let rx = 2+Math.floor(Math.random()*(size-4)), ry = 2+Math.floor(Math.random()*(size-4));
  if(grid[ry][rx]===1) grid[ry][rx] = 0;
}
grid[1][c] = 5; // Exit Gate

let keyList = [
  {x: 4*tileSize, y: 4*tileSize, collected:false},
  {x: (size-4)*tileSize, y: 4*tileSize, collected:false},
  {x: (size-4)*tileSize, y: (size-4)*tileSize, collected:false}
];
let grievers = [
  {x: (c-10)*tileSize, y: (c-10)*tileSize, vx:0, vy:0, angle:0},
  {x: (c+10)*tileSize, y: (c+10)*tileSize, vx:0, vy:0, angle:0}
];

let isPlaying = false;
document.getElementById('startBtn').onclick = () => {
  document.getElementById('menuOverlay').style.display = 'none';
  isPlaying = true;
};
document.getElementById('seedText').innerText = 'GLADE-' + Math.floor(1000+Math.random()*9000);

let lastT = performance.now();
function gameLoop(now){
  requestAnimationFrame(gameLoop);
  let dt = Math.min((now - lastT)/1000, 0.1); lastT = now;
  if(!isPlaying) return;

  // Move
  let mx = 0, my = 0;
  if(keysDown['KeyW'] || keysDown['ArrowUp']) my -= 1;
  if(keysDown['KeyS'] || keysDown['ArrowDown']) my += 1;
  if(keysDown['KeyA'] || keysDown['ArrowLeft']) mx -= 1;
  if(keysDown['KeyD'] || keysDown['ArrowRight']) mx += 1;
  let len = Math.hypot(mx, my);
  if(len > 0) { mx/=len; my/=len; player.angle = Math.atan2(my, mx); }

  let isSprinting = (keysDown['ShiftLeft'] || keysDown['ShiftRight']) && player.stam > 0 && len > 0;
  if(isSprinting) player.stam = Math.max(0, player.stam - 30*dt);
  else player.stam = Math.min(100, player.stam + 20*dt);

  let spd = isSprinting ? 220 : 140;
  let nx = player.x + mx*spd*dt, ny = player.y + my*spd*dt;

  // Simple circle collision
  let gx = Math.floor(nx/tileSize), gy = Math.floor(ny/tileSize);
  if(grid[gy] && grid[gy][gx] === 0) { player.x = nx; player.y = ny; }

  // Keys
  keyList.forEach(k => {
    if(!k.collected && Math.hypot(player.x - k.x, player.y - k.y) < 30) {
      k.collected = true; player.keys++; playBeep(880, 'triangle', 0.2);
      document.getElementById('keyText').innerText = player.keys + ' / 3';
    }
  });

  // Battery
  if(player.flash) player.bat = Math.max(0, player.bat - 15*dt);
  else player.bat = Math.min(100, player.bat + 3*dt);

  // HUD
  document.getElementById('hpBar').style.width = player.hp + 'px';
  document.getElementById('stamBar').style.width = player.stam + 'px';
  document.getElementById('batBar').style.width = player.bat + 'px';

  // Render
  ctx.fillStyle = '#0c0a09'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.translate(canvas.width/2 - player.x, canvas.height/2 - player.y);

  // Draw maze
  for(let y=0; y<size; y++){
    for(let x=0; x<size; x++){
      if(grid[y][x] === 1) {
        ctx.fillStyle = '#1c1917'; ctx.fillRect(x*tileSize, y*tileSize, tileSize, tileSize);
        ctx.strokeStyle = '#292524'; ctx.strokeRect(x*tileSize, y*tileSize, tileSize, tileSize);
      } else if(grid[y][x] === 5) {
        ctx.fillStyle = '#f59e0b'; ctx.fillRect(x*tileSize, y*tileSize, tileSize, tileSize);
      }
    }
  }

  // Draw Keys
  keyList.forEach(k => {
    if(!k.collected) {
      ctx.fillStyle = '#fbbf24'; ctx.beginPath();
      ctx.arc(k.x, k.y, 8, 0, Math.PI*2); ctx.fill();
    }
  });

  // Draw Player
  ctx.fillStyle = '#38bdf8'; ctx.beginPath();
  ctx.arc(player.x, player.y, 16, 0, Math.PI*2); ctx.fill();

  ctx.restore();

  // Dark Fog & Light
  ctx.save();
  let grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 10, canvas.width/2, canvas.height/2, player.flash ? 320 : 160);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.8, 'rgba(12,10,9,0.92)');
  grad.addColorStop(1, 'rgba(12,10,9,1)');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.restore();
}
requestAnimationFrame(gameLoop);
</script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TheGladeRunner_MazeEscape.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy seed to clipboard
  const handleCopySeed = () => {
    if (activeSeed) {
      navigator.clipboard.writeText(activeSeed);
      setCopiedSeed(true);
      setTimeout(() => setCopiedSeed(false), 2000);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full h-full bg-stone-950 text-stone-100 overflow-hidden font-sans select-none">
      {/* 1. Main Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair z-0"
      />

      {/* 2. Top Bar HUD (Clean, domain-native, no pill enclosure slop) */}
      {gameState === 'PLAYING' && (
        <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-8 px-5 py-3 pointer-events-none">
          {/* Zone 1: Status Meters (Health, Stamina, Battery) */}
          <div className="flex items-center gap-6 pointer-events-auto">
            {/* Health Meter */}
            <div className="flex flex-col gap-1 min-w-[110px]">
              <div className="flex items-center justify-between text-xs text-stone-300 font-mono">
                <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
                  <Shield className="w-3.5 h-3.5" /> HP
                </span>
                <span className="tabular-nums font-bold">{hudHealth}%</span>
              </div>
              <div className="w-full h-2 bg-stone-900 border border-stone-800 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-rose-500 transition-all duration-150"
                  style={{ width: `${Math.max(0, Math.min(100, hudHealth))}%` }}
                />
              </div>
            </div>

            {/* Stamina Meter */}
            <div className="flex flex-col gap-1 min-w-[110px]">
              <div className="flex items-center justify-between text-xs text-stone-300 font-mono">
                <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                  <Zap className="w-3.5 h-3.5" /> STAMINA
                </span>
                <span className="tabular-nums font-bold">{hudStamina}%</span>
              </div>
              <div className="w-full h-2 bg-stone-900 border border-stone-800 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-100"
                  style={{ width: `${Math.max(0, Math.min(100, hudStamina))}%` }}
                />
              </div>
            </div>

            {/* Battery Meter */}
            <div className="flex flex-col gap-1 min-w-[110px]">
              <div className="flex items-center justify-between text-xs text-stone-300 font-mono">
                <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                  <Battery className="w-3.5 h-3.5" /> BATTERY [F]
                </span>
                <span className="tabular-nums font-bold">{hudBattery}%</span>
              </div>
              <div className="w-full h-2 bg-stone-900 border border-stone-800 rounded-sm overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 ${
                    hudFlashlight ? 'bg-cyan-400 animate-pulse' : 'bg-cyan-600'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, hudBattery))}%` }}
                />
              </div>
            </div>

            {/* Ivy Alcove Indicator */}
            {hudIsHiding && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-semibold rounded-md animate-pulse">
                <span>CONCEALED IN IVY</span>
              </div>
            )}
          </div>

          {/* Zone 2: Timer & Seed info */}
          <div className="hidden md:flex items-center gap-3 text-xs text-stone-400 font-mono pointer-events-auto">
            <span>ESCAPE TIMER</span>
            <span
              className={`text-base font-bold tabular-nums ${
                hudTimeRemaining < 60 ? 'text-rose-400 animate-pulse' : 'text-stone-100'
              }`}
            >
              {formatTimer(hudTimeRemaining)}
            </span>
            <span aria-hidden="true" className="text-stone-600">·</span>
            <button
              onClick={handleCopySeed}
              className="flex items-center gap-1.5 hover:text-stone-200 transition-colors cursor-pointer"
              title="Click to copy maze seed"
            >
              <span>SEED {activeSeed}</span>
              {copiedSeed ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Zone 3: Keys, Tactical Map & Controls */}
          <div className="flex items-center gap-4 pointer-events-auto">
            {/* Keys Socket */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-900/90 border border-stone-800 rounded-md">
              <KeyIcon className="w-4 h-4 text-amber-400" />
              <div className="flex items-center gap-1.5">
                {[...Array(hudTotalKeys)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full border transition-all ${
                      i < hudKeys
                        ? 'bg-amber-400 border-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                        : 'bg-stone-800 border-stone-700'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs font-mono font-bold text-amber-300 ml-1">
                {hudKeys}/{hudTotalKeys}
              </span>
            </div>

            {/* Map Button */}
            <button
              onClick={() => setShowFullMap(prev => !prev)}
              className="p-2 bg-stone-900/90 border border-stone-800 hover:border-stone-700 text-stone-300 hover:text-stone-100 rounded-md transition-colors cursor-pointer"
              title="Toggle Tactical Map (M)"
            >
              <MapIcon className="w-4 h-4" />
            </button>

            {/* Mute Button */}
            <button
              onClick={() => setIsMuted(sound.toggleMute())}
              className="p-2 bg-stone-900/90 border border-stone-800 hover:border-stone-700 text-stone-300 hover:text-stone-100 rounded-md transition-colors cursor-pointer"
              title="Toggle Audio"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Pause Button */}
            <button
              onClick={() => setGameState('PAUSED')}
              className="p-2 bg-stone-900/90 border border-stone-800 hover:border-stone-700 text-stone-300 hover:text-stone-100 rounded-md transition-colors cursor-pointer"
              title="Pause Game (Esc)"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </header>
      )}

      {/* 3. Bottom Corner Radar Minimap */}
      {gameState === 'PLAYING' && !showFullMap && (
        <div className="absolute bottom-5 right-5 z-20 hidden sm:flex flex-col items-end gap-1.5">
          <div className="relative border border-stone-800 bg-stone-950/90 rounded-md overflow-hidden shadow-2xl">
            <canvas
              ref={minimapCanvasRef}
              width={160}
              height={160}
              className="block cursor-pointer"
              onClick={() => setShowFullMap(true)}
            />
          </div>
          <span className="text-[11px] font-mono text-stone-500">RADAR [M] FOR FULL MAP</span>
        </div>
      )}

      {/* 4. Controls Tip Footer (Desktop) */}
      {gameState === 'PLAYING' && (
        <div className="absolute bottom-4 left-5 z-20 hidden md:flex items-center gap-4 text-xs font-mono text-stone-500 pointer-events-none">
          <span>WASD / ARROWS: MOVE</span>
          <span aria-hidden="true">·</span>
          <span>SHIFT: SPRINT</span>
          <span aria-hidden="true">·</span>
          <span>F: FLASHLIGHT</span>
          <span aria-hidden="true">·</span>
          <span>M: MAP</span>
          <span aria-hidden="true">·</span>
          <span>ESC: PAUSE</span>
        </div>
      )}

      {/* 5. Mobile Touch Controls (Virtual Joystick & Action Buttons) */}
      {gameState === 'PLAYING' && (
        <div className="absolute inset-x-0 bottom-0 top-16 z-30 pointer-events-none md:hidden flex justify-between items-end p-6">
          {/* Virtual Joystick Zone */}
          <div
            className="w-36 h-36 rounded-full bg-stone-900/40 border border-stone-800/80 backdrop-blur-xs flex items-center justify-center pointer-events-auto touch-none relative"
            onTouchStart={handleJoystickTouchStart}
            onTouchMove={handleJoystickTouchMove}
            onTouchEnd={handleJoystickTouchEnd}
            onTouchCancel={handleJoystickTouchEnd}
          >
            <div
              className="w-14 h-14 rounded-full bg-stone-700/80 border border-stone-500 shadow-md transition-transform"
              style={{
                transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`,
              }}
            />
          </div>

          {/* Touch Action Buttons */}
          <div className="flex flex-col gap-3 pointer-events-auto">
            {/* Sprint Button (Hold to sprint) */}
            <button
              onTouchStart={() => setTouchSprint(true)}
              onTouchEnd={() => setTouchSprint(false)}
              className={`w-14 h-14 rounded-full border flex items-center justify-center font-bold text-xs ${
                touchSprint
                  ? 'bg-amber-500 border-amber-300 text-stone-950 shadow-[0_0_12px_rgba(245,158,11,0.6)]'
                  : 'bg-stone-900/80 border-stone-700 text-stone-300'
              }`}
            >
              RUN
            </button>

            {/* Flashlight Toggle */}
            <button
              onClick={() => {
                const p = engineRef.current.player;
                if (p.battery > 0) {
                  p.flashlightOn = !p.flashlightOn;
                  sound.playFlashlightToggle(p.flashlightOn);
                  setHudFlashlight(p.flashlightOn);
                }
              }}
              className={`w-14 h-14 rounded-full border flex items-center justify-center ${
                hudFlashlight
                  ? 'bg-cyan-500 border-cyan-300 text-stone-950 shadow-[0_0_12px_rgba(6,182,212,0.6)]'
                  : 'bg-stone-900/80 border-stone-700 text-stone-300'
              }`}
            >
              <Zap className="w-5 h-5" />
            </button>

            {/* Map Button */}
            <button
              onClick={() => setShowFullMap(prev => !prev)}
              className="w-14 h-14 rounded-full bg-stone-900/80 border border-stone-700 flex items-center justify-center text-stone-300"
            >
              <MapIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 6. Fullscreen Tactical Map Modal */}
      {showFullMap && gameState === 'PLAYING' && (
        <div className="absolute inset-0 z-40 bg-stone-950/95 flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-2xl flex items-center justify-between pb-3 border-b border-stone-800">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-stone-100 tracking-wide font-mono">TACTICAL MAZE MAP</h2>
            </div>
            <button
              onClick={() => setShowFullMap(false)}
              className="px-3 py-1.5 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-md transition-colors cursor-pointer"
            >
              CLOSE [ESC / M]
            </button>
          </div>

          <div className="relative my-4 border border-stone-800 rounded-lg overflow-hidden bg-stone-900 shadow-2xl">
            <canvas
              ref={fullMapCanvasRef}
              width={Math.min(window.innerWidth - 60, 560)}
              height={Math.min(window.innerHeight - 180, 560)}
              className="block"
            />
          </div>

          <div className="flex items-center gap-6 text-xs font-mono text-stone-400">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-sky-400" />
              <span>Player</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>Ancient Keys</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>Griever Threat</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Ivy Alcove</span>
            </div>
          </div>
        </div>
      )}

      {/* 7. TITLE MENU SCREEN */}
      {gameState === 'TITLE_MENU' && (
        <div className="absolute inset-0 z-50 bg-stone-950/95 flex flex-col items-center justify-center p-6 overflow-y-auto">
          <div className="w-full max-w-xl flex flex-col items-center text-center">
            {/* Game Badge / Kicker */}
            <span className="text-xs font-mono text-amber-400 tracking-widest uppercase mb-2">
              SURVIVAL LABYRINTH SIMULATION
            </span>

            {/* Title */}
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-stone-100 mb-4 font-mono">
              THE GLADE RUNNER
            </h1>

            <p className="text-stone-400 text-sm md:text-base max-w-lg mb-8 leading-relaxed">
              You awaken inside The Glade, surrounded by colossal shifting stone walls. Locate all 3 Ancient Keys to breach the Perimeter Gate and escape before nightfall.
            </p>

            {/* Difficulty Segmented Control */}
            <div className="w-full mb-6">
              <label className="block text-xs font-mono text-stone-400 uppercase tracking-wider mb-2 text-left">
                Select Difficulty
              </label>
              <div className="grid grid-cols-3 gap-2 p-1.5 bg-stone-900 border border-stone-800 rounded-lg">
                {(['EASY', 'NORMAL', 'HARD'] as Difficulty[]).map(diff => (
                  <button
                    key={diff}
                    onClick={() => setDifficulty(diff)}
                    className={`py-2 px-3 text-xs font-bold font-mono rounded-md transition-all cursor-pointer ${
                      difficulty === diff
                        ? 'bg-stone-800 text-stone-100 border border-stone-700 shadow-sm'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {DIFFICULTY_SETTINGS[diff].label}
                    <span className="block text-[10px] font-normal text-stone-500 mt-0.5">
                      {DIFFICULTY_SETTINGS[diff].mazeSize}x{DIFFICULTY_SETTINGS[diff].mazeSize} · {DIFFICULTY_SETTINGS[diff].grieverCount} Grievers
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Maze Seed Input */}
            <div className="w-full mb-8 text-left">
              <label className="block text-xs font-mono text-stone-400 uppercase tracking-wider mb-2">
                Maze Seed (Replay or Share)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={seedInput}
                  onChange={e => setSeedInput(e.target.value)}
                  placeholder="Enter seed phrase..."
                  className="flex-1 bg-stone-900 border border-stone-800 focus:border-stone-600 rounded-lg px-4 py-2 text-sm font-mono text-stone-100 outline-none"
                />
                <button
                  onClick={() => setSeedInput('GLADE-' + Math.floor(1000 + Math.random() * 9000))}
                  className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-mono rounded-lg transition-colors cursor-pointer"
                >
                  RANDOM
                </button>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="w-full flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => startGame(difficulty)}
                className="flex-1 py-3 px-6 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold font-mono text-sm tracking-wider rounded-lg shadow-lg hover:shadow-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>ENTER THE MAZE</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleExportStandaloneHtml}
                className="py-3 px-5 bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 text-stone-300 font-mono text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                title="Download single self-contained HTML file"
              >
                <Download className="w-4 h-4" />
                <span>DOWNLOAD HTML</span>
              </button>
            </div>

            {/* Survival Guide Rules */}
            <div className="w-full mt-10 pt-6 border-t border-stone-900 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              <div className="p-3 bg-stone-900/40 border border-stone-900 rounded-lg">
                <h3 className="text-xs font-bold font-mono text-stone-300 mb-1">01. GRIEVERS PATROL</h3>
                <p className="text-[12px] text-stone-500 leading-relaxed">
                  Mechanical predators track sound and light. Sprinting makes noise. Break line of sight inside Ivy Alcoves to hide.
                </p>
              </div>
              <div className="p-3 bg-stone-900/40 border border-stone-900 rounded-lg">
                <h3 className="text-xs font-bold font-mono text-stone-300 mb-1">02. MOVING WALLS</h3>
                <p className="text-[12px] text-stone-500 leading-relaxed">
                  Sections of the maze open and shut periodically. Listen for ground tremors and warning rumbles.
                </p>
              </div>
              <div className="p-3 bg-stone-900/40 border border-stone-900 rounded-lg">
                <h3 className="text-xs font-bold font-mono text-stone-300 mb-1">03. 3 ANCIENT KEYS</h3>
                <p className="text-[12px] text-stone-500 leading-relaxed">
                  Scattered in distant sectors. Recover all 3 keys to disengage the massive Perimeter Gate lock.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. PAUSE MENU MODAL */}
      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 z-50 bg-stone-950/90 flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-sm bg-stone-900 border border-stone-800 rounded-xl p-6 flex flex-col items-center text-center shadow-2xl">
            <h2 className="text-2xl font-bold font-mono text-stone-100 mb-2">RUN PAUSED</h2>
            <p className="text-xs text-stone-400 mb-6 font-mono">
              Seed: {activeSeed} · Time: {formatTimer(hudTimeRemaining)}
            </p>

            <div className="w-full flex flex-col gap-3">
              <button
                onClick={() => setGameState('PLAYING')}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold font-mono text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                <span>RESUME</span>
              </button>

              <button
                onClick={() => startGame(difficulty, activeSeed)}
                className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold font-mono text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>RETRY SAME SEED</span>
              </button>

              <button
                onClick={() => setIsMuted(sound.toggleMute())}
                className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                <span>{isMuted ? 'UNMUTE AUDIO' : 'MUTE AUDIO'}</span>
              </button>

              <button
                onClick={() => setGameState('TITLE_MENU')}
                className="w-full py-2.5 bg-transparent hover:bg-stone-800 text-stone-400 hover:text-stone-200 font-mono text-xs rounded-lg transition-colors cursor-pointer"
              >
                RETURN TO TITLE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. VICTORY SCREEN */}
      {gameState === 'VICTORY' && (
        <div className="absolute inset-0 z-50 bg-stone-950/95 flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-lg bg-stone-900 border border-stone-800 rounded-xl p-8 flex flex-col items-center text-center shadow-2xl">
            <span className="text-xs font-mono text-emerald-400 tracking-widest uppercase mb-2">
              PERIMETER GATE UNLOCKED
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold font-mono text-stone-100 mb-3">
              YOU ESCAPED THE MAZE
            </h2>
            <p className="text-stone-400 text-sm mb-6">
              You braved the shifting stone walls and outsmarted the Grievers to reach freedom.
            </p>

            {/* Run Stats Grid */}
            <div className="w-full grid grid-cols-2 gap-3 mb-6 font-mono text-left">
              <div className="p-3 bg-stone-950/60 border border-stone-800 rounded-lg">
                <span className="text-[11px] text-stone-500 block">TIME ELAPSED</span>
                <span className="text-lg font-bold text-amber-400 tabular-nums">
                  {formatTimer(finalStats.timeElapsed)}
                </span>
              </div>
              <div className="p-3 bg-stone-950/60 border border-stone-800 rounded-lg">
                <span className="text-[11px] text-stone-500 block">STEPS WALKED</span>
                <span className="text-lg font-bold text-stone-200 tabular-nums">
                  {finalStats.stepsWalked.toLocaleString()}
                </span>
              </div>
              <div className="p-3 bg-stone-950/60 border border-stone-800 rounded-lg">
                <span className="text-[11px] text-stone-500 block">DAMAGE TAKEN</span>
                <span className="text-lg font-bold text-rose-400 tabular-nums">
                  {finalStats.damageTaken} HP
                </span>
              </div>
              <div className="p-3 bg-stone-950/60 border border-stone-800 rounded-lg">
                <span className="text-[11px] text-stone-500 block">DIFFICULTY & SEED</span>
                <span className="text-xs font-bold text-stone-300 truncate block">
                  {difficulty} · {activeSeed}
                </span>
              </div>
            </div>

            <div className="w-full flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => startGame(difficulty)}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold font-mono text-xs rounded-lg transition-colors cursor-pointer"
              >
                PLAY AGAIN
              </button>
              <button
                onClick={handleCopySeed}
                className="py-3 px-5 bg-stone-800 hover:bg-stone-700 text-stone-200 font-mono text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {copiedSeed ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>COPY SEED</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. GAME OVER SCREEN */}
      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 z-50 bg-stone-950/95 flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-lg bg-stone-900 border border-rose-950/60 rounded-xl p-8 flex flex-col items-center text-center shadow-2xl">
            <span className="text-xs font-mono text-rose-500 tracking-widest uppercase mb-2">
              RUN TERMINATED
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold font-mono text-stone-100 mb-3">
              THE MAZE CONSUMED YOU
            </h2>
            <p className="text-stone-400 text-sm mb-6">
              {hudTimeRemaining <= 0
                ? 'Night has fallen over The Glade. The doors have permanently sealed.'
                : 'A mechanical Griever intercepted you in the dark corridors.'}
            </p>

            {/* Run Stats */}
            <div className="w-full grid grid-cols-2 gap-3 mb-6 font-mono text-left">
              <div className="p-3 bg-stone-950/60 border border-stone-800 rounded-lg">
                <span className="text-[11px] text-stone-500 block">TIME SURVIVED</span>
                <span className="text-lg font-bold text-stone-200 tabular-nums">
                  {formatTimer(finalStats.timeElapsed)}
                </span>
              </div>
              <div className="p-3 bg-stone-950/60 border border-stone-800 rounded-lg">
                <span className="text-[11px] text-stone-500 block">KEYS SECURED</span>
                <span className="text-lg font-bold text-amber-400 tabular-nums">
                  {finalStats.keysCollected} / 3
                </span>
              </div>
            </div>

            <div className="w-full flex flex-col sm:flex-row gap-3">
              {hasCheckpoint && (
                <button
                  onClick={respawnAtCheckpoint}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-stone-100 font-bold font-mono text-xs rounded-lg transition-colors cursor-pointer"
                >
                  RESPAWN AT CHECKPOINT
                </button>
              )}
              <button
                onClick={() => startGame(difficulty, activeSeed)}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-stone-100 font-bold font-mono text-xs rounded-lg transition-colors cursor-pointer"
              >
                RETRY MAZE
              </button>
              <button
                onClick={() => setGameState('TITLE_MENU')}
                className="py-3 px-5 bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono text-xs rounded-lg transition-colors cursor-pointer"
              >
                TITLE MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
