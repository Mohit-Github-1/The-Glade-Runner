export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';

export interface DifficultyConfig {
  label: string;
  mazeSize: number; // grid width & height (odd number)
  grieverCount: number;
  movingWallCount: number;
  timeLimitSeconds: number;
  batteryDrainRate: number; // per sec
  staminaDrainRate: number;
}

export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultyConfig> = {
  EASY: {
    label: 'Easy',
    mazeSize: 45,
    grieverCount: 2,
    movingWallCount: 4,
    timeLimitSeconds: 600,
    batteryDrainRate: 0.12,
    staminaDrainRate: 0.22,
  },
  NORMAL: {
    label: 'Normal',
    mazeSize: 65,
    grieverCount: 4,
    movingWallCount: 6,
    timeLimitSeconds: 480,
    batteryDrainRate: 0.18,
    staminaDrainRate: 0.28,
  },
  HARD: {
    label: 'Hard',
    mazeSize: 81,
    grieverCount: 7,
    movingWallCount: 10,
    timeLimitSeconds: 360,
    batteryDrainRate: 0.24,
    staminaDrainRate: 0.35,
  },
};

export const TILE = {
  EMPTY: 0,
  WALL: 1,
  MOVING_WALL: 2,
  IVY_ALCOVE: 3,
  CHECKPOINT: 4,
  EXIT_GATE: 5,
  GLADE_FLOOR: 6,
} as const;

export type TileType = typeof TILE[keyof typeof TILE];

export interface Point {
  x: number;
  y: number;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  battery: number;
  maxBattery: number;
  flashlightOn: boolean;
  keys: number;
  totalKeysRequired: number;
  isSprinting: boolean;
  isHiding: boolean;
  invulnerableTime: number; // in seconds
  stepsTaken: number;
  footstepTimer: number;
}

export interface MovingWall {
  x: number; // grid cell
  y: number; // grid cell
  isOpen: boolean;
  timer: number;
  cyclePeriod: number;
  openDuration: number;
  transitionProgress: number; // 0 (closed) to 1 (open)
  state: 'CLOSED' | 'OPENING' | 'OPEN' | 'CLOSING';
}

export interface Collectible {
  id: string;
  type: 'KEY' | 'BATTERY' | 'WATER';
  x: number; // world coordinates
  y: number;
  collected: boolean;
  bobOffset: number;
}

export interface Checkpoint {
  id: string;
  x: number; // grid x
  y: number; // grid y
  worldX: number;
  worldY: number;
  activated: boolean;
}

export interface Griever {
  id: string;
  x: number; // world x
  y: number; // world y
  vx: number;
  vy: number;
  speed: number;
  radius: number;
  angle: number;
  state: 'PATROL' | 'INVESTIGATE' | 'CHASE';
  targetX: number;
  targetY: number;
  path: Point[];
  pathUpdateTimer: number;
  patrolWaitTimer: number;
  alertLevel: number; // 0 to 1
  legCycle: number;
  growlTimer: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
  type: 'DUST' | 'SPARK' | 'EMBER' | 'RUNE';
}

export interface Camera {
  x: number;
  y: number;
  scale: number;
  targetX: number;
  targetY: number;
}

export interface GameStats {
  timeElapsed: number;
  stepsWalked: number;
  keysCollected: number;
  damageTaken: number;
  checkpointsActivated: number;
  grieversEvaded: number;
}
