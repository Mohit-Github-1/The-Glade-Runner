import { TILE, TileType, Point, MovingWall, Collectible, Checkpoint, Griever } from './types';

export class PRNG {
  private s: number;

  constructor(seedString: string) {
    this.s = this.hashString(seedString);
  }

  private hashString(str: string): number {
    let hash = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      hash = Math.imul(hash ^ str.charCodeAt(i), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }
    return hash >>> 0;
  }

  public next(): number {
    this.s |= 0;
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  public rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  public choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

export interface MazeData {
  width: number;
  height: number;
  grid: TileType[][];
  tileSize: number;
  spawnPoint: Point; // world coords
  exitGate: Point; // grid coords
  exitGateWorld: Point;
  movingWalls: MovingWall[];
  collectibles: Collectible[];
  checkpoints: Checkpoint[];
  grievers: Griever[];
  seed: string;
}

export function generateMaze(
  size: number,
  seed: string,
  grieverCount: number,
  movingWallCount: number,
  tileSize: number = 64
): MazeData {
  // Ensure size is odd for proper wall/corridor grid
  if (size % 2 === 0) size++;

  const prng = new PRNG(seed);
  const grid: TileType[][] = [];

  // Initialize all to WALL
  for (let y = 0; y < size; y++) {
    grid[y] = [];
    for (let x = 0; x < size; x++) {
      grid[y][x] = TILE.WALL;
    }
  }

  // 1. Recursive backtracker DFS
  const stack: Point[] = [];
  const startCell: Point = { x: 1, y: 1 };
  grid[startCell.y][startCell.x] = TILE.EMPTY;
  stack.push(startCell);

  const directions = [
    { dx: 0, dy: -2 },
    { dx: 0, dy: 2 },
    { dx: -2, dy: 0 },
    { dx: 2, dy: 0 },
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: { x: number; y: number; wallX: number; wallY: number }[] = [];

    // Shuffle directions
    const shuffledDirs = [...directions].sort(() => prng.next() - 0.5);

    for (const dir of shuffledDirs) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;

      if (nx > 0 && nx < size - 1 && ny > 0 && ny < size - 1) {
        if (grid[ny][nx] === TILE.WALL) {
          neighbors.push({
            x: nx,
            y: ny,
            wallX: current.x + dir.dx / 2,
            wallY: current.y + dir.dy / 2,
          });
        }
      }
    }

    if (neighbors.length > 0) {
      const chosen = neighbors[0];
      grid[chosen.wallY][chosen.wallX] = TILE.EMPTY;
      grid[chosen.y][chosen.x] = TILE.EMPTY;
      stack.push({ x: chosen.x, y: chosen.y });
    } else {
      stack.pop();
    }
  }

  // 2. Clear Central Glade (Sanctuary where player starts)
  const gladeRadius = 3; // 7x7 area
  const centerX = Math.floor(size / 2);
  const centerY = Math.floor(size / 2);

  for (let dy = -gladeRadius; dy <= gladeRadius; dy++) {
    for (let dx = -gladeRadius; dx <= gladeRadius; dx++) {
      const gx = centerX + dx;
      const gy = centerY + dy;
      if (gx > 0 && gx < size - 1 && gy > 0 && gy < size - 1) {
        grid[gy][gx] = TILE.GLADE_FLOOR;
      }
    }
  }

  // Ensure openings from Glade into maze corridors
  const gladeOpenings = [
    { x: centerX, y: centerY - gladeRadius - 1 },
    { x: centerX, y: centerY + gladeRadius + 1 },
    { x: centerX - gladeRadius - 1, y: centerY },
    { x: centerX + gladeRadius + 1, y: centerY },
  ];
  gladeOpenings.forEach(op => {
    if (op.x > 0 && op.x < size - 1 && op.y > 0 && op.y < size - 1) {
      grid[op.y][op.x] = TILE.EMPTY;
    }
  });

  // 3. Remove extra walls to create loops and alternate routes (Maze Runner feel)
  const loopWallRemovals = Math.floor(size * 1.8);
  for (let i = 0; i < loopWallRemovals; i++) {
    const rx = prng.rangeInt(2, size - 3);
    const ry = prng.rangeInt(2, size - 3);
    // Don't disturb outer boundary or glade interior
    if (Math.abs(rx - centerX) <= gladeRadius && Math.abs(ry - centerY) <= gladeRadius) continue;

    if (grid[ry][rx] === TILE.WALL) {
      // If horizontal wall between two vertical corridors
      const top = grid[ry - 1]?.[rx];
      const bottom = grid[ry + 1]?.[rx];
      const left = grid[ry]?.[rx - 1];
      const right = grid[ry]?.[rx + 1];

      if ((top === TILE.EMPTY && bottom === TILE.EMPTY) || (left === TILE.EMPTY && right === TILE.EMPTY)) {
        grid[ry][rx] = TILE.EMPTY;
      }
    }
  }

  // 4. Create Ivy Alcoves (Hiding spots in dead-ends or side walls)
  const ivyCount = Math.floor(size * 0.4);
  let placedIvy = 0;
  for (let attempts = 0; attempts < 300 && placedIvy < ivyCount; attempts++) {
    const ix = prng.rangeInt(2, size - 3);
    const iy = prng.rangeInt(2, size - 3);
    if (grid[iy][ix] === TILE.EMPTY) {
      // Count wall neighbors
      let wallNeighbors = 0;
      if (grid[iy - 1][ix] === TILE.WALL) wallNeighbors++;
      if (grid[iy + 1][ix] === TILE.WALL) wallNeighbors++;
      if (grid[iy][ix - 1] === TILE.WALL) wallNeighbors++;
      if (grid[iy][ix + 1] === TILE.WALL) wallNeighbors++;

      if (wallNeighbors >= 2) {
        grid[iy][ix] = TILE.IVY_ALCOVE;
        placedIvy++;
      }
    }
  }

  // 5. Moving Wall sections (Mechanical sliding blocks)
  const movingWalls: MovingWall[] = [];
  let placedMoving = 0;
  for (let attempts = 0; attempts < 400 && placedMoving < movingWallCount; attempts++) {
    const mx = prng.rangeInt(4, size - 5);
    const my = prng.rangeInt(4, size - 5);
    // Avoid Glade
    if (Math.abs(mx - centerX) <= gladeRadius + 2 && Math.abs(my - centerY) <= gladeRadius + 2) continue;

    if (grid[my][mx] === TILE.EMPTY) {
      // Chokepoint check (flanked by walls)
      const isVertChoke = grid[my][mx - 1] === TILE.WALL && grid[my][mx + 1] === TILE.WALL;
      const isHorizChoke = grid[my - 1][mx] === TILE.WALL && grid[my + 1][mx] === TILE.WALL;

      if (isVertChoke || isHorizChoke) {
        grid[my][mx] = TILE.MOVING_WALL;
        const period = prng.range(14, 22);
        const openTime = period * 0.55;
        movingWalls.push({
          x: mx,
          y: my,
          isOpen: prng.next() > 0.5,
          timer: prng.range(0, period),
          cyclePeriod: period,
          openDuration: openTime,
          transitionProgress: 0,
          state: 'CLOSED',
        });
        placedMoving++;
      }
    }
  }

  // 6. Perimeter Exit Gate
  // Place on outer top/bottom/left/right border
  const exitGate: Point = { x: Math.floor(size / 2), y: 1 };
  grid[exitGate.y][exitGate.x] = TILE.EXIT_GATE;
  // Clear corridor down from exit
  grid[exitGate.y + 1][exitGate.x] = TILE.EMPTY;
  grid[exitGate.y + 2][exitGate.x] = TILE.EMPTY;

  const exitGateWorld: Point = {
    x: (exitGate.x + 0.5) * tileSize,
    y: (exitGate.y + 0.5) * tileSize,
  };

  // 7. Checkpoints (Glowing runic pedestals)
  const checkpoints: Checkpoint[] = [];
  const checkpointPositions = [
    { x: Math.floor(size * 0.25), y: Math.floor(size * 0.25) },
    { x: Math.floor(size * 0.75), y: Math.floor(size * 0.25) },
    { x: Math.floor(size * 0.25), y: Math.floor(size * 0.75) },
    { x: Math.floor(size * 0.75), y: Math.floor(size * 0.75) },
  ];

  checkpointPositions.forEach((pos, idx) => {
    // Find closest open cell
    const cell = findNearestOpenCell(grid, pos.x, pos.y, size);
    if (cell) {
      grid[cell.y][cell.x] = TILE.CHECKPOINT;
      checkpoints.push({
        id: `cp_${idx}`,
        x: cell.x,
        y: cell.y,
        worldX: (cell.x + 0.5) * tileSize,
        worldY: (cell.y + 0.5) * tileSize,
        activated: false,
      });
    }
  });

  // 8. Collectibles: 3 Ancient Keys + Battery Packs + Water Canteens
  const collectibles: Collectible[] = [];

  // Keys placed in 3 distinct quadrants far from center
  const keyQuadrantTargets = [
    { x: 3, y: 3 },
    { x: size - 4, y: 4 },
    { x: size - 4, y: size - 4 },
  ];

  keyQuadrantTargets.forEach((tgt, idx) => {
    const keyCell = findFurthestOpenCell(grid, tgt.x, tgt.y, size, prng);
    collectibles.push({
      id: `key_${idx + 1}`,
      type: 'KEY',
      x: (keyCell.x + 0.5) * tileSize,
      y: (keyCell.y + 0.5) * tileSize,
      collected: false,
      bobOffset: prng.range(0, Math.PI * 2),
    });
  });

  // Battery packs
  const batteryCount = Math.floor(size * 0.2);
  for (let i = 0; i < batteryCount; i++) {
    const cell = getRandomOpenCell(grid, size, centerX, centerY, gladeRadius, prng);
    collectibles.push({
      id: `bat_${i}`,
      type: 'BATTERY',
      x: (cell.x + 0.5) * tileSize,
      y: (cell.y + 0.5) * tileSize,
      collected: false,
      bobOffset: prng.range(0, Math.PI * 2),
    });
  }

  // Water canteens
  const waterCount = Math.floor(size * 0.16);
  for (let i = 0; i < waterCount; i++) {
    const cell = getRandomOpenCell(grid, size, centerX, centerY, gladeRadius, prng);
    collectibles.push({
      id: `water_${i}`,
      type: 'WATER',
      x: (cell.x + 0.5) * tileSize,
      y: (cell.y + 0.5) * tileSize,
      collected: false,
      bobOffset: prng.range(0, Math.PI * 2),
    });
  }

  // 9. Grievers (Mechanical bio-monsters)
  const grievers: Griever[] = [];
  for (let i = 0; i < grieverCount; i++) {
    // Spawn Grievers outside Glade
    const cell = getRandomOpenCell(grid, size, centerX, centerY, gladeRadius + 5, prng);
    const gx = (cell.x + 0.5) * tileSize;
    const gy = (cell.y + 0.5) * tileSize;
    grievers.push({
      id: `griever_${i + 1}`,
      x: gx,
      y: gy,
      vx: 0,
      vy: 0,
      speed: 105,
      radius: 20,
      angle: prng.range(0, Math.PI * 2),
      state: 'PATROL',
      targetX: gx,
      targetY: gy,
      path: [],
      pathUpdateTimer: prng.range(0, 0.5),
      patrolWaitTimer: 0,
      alertLevel: 0,
      legCycle: prng.range(0, Math.PI * 2),
      growlTimer: prng.range(3, 8),
    });
  }

  const spawnPoint: Point = {
    x: (centerX + 0.5) * tileSize,
    y: (centerY + 0.5) * tileSize,
  };

  return {
    width: size,
    height: size,
    grid,
    tileSize,
    spawnPoint,
    exitGate,
    exitGateWorld,
    movingWalls,
    collectibles,
    checkpoints,
    grievers,
    seed,
  };
}

function findNearestOpenCell(grid: TileType[][], targetX: number, targetY: number, size: number): Point {
  for (let r = 0; r < 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = targetX + dx;
        const y = targetY + dy;
        if (x > 0 && x < size - 1 && y > 0 && y < size - 1) {
          if (grid[y][x] === TILE.EMPTY || grid[y][x] === TILE.GLADE_FLOOR) {
            return { x, y };
          }
        }
      }
    }
  }
  return { x: 1, y: 1 };
}

function findFurthestOpenCell(grid: TileType[][], targetX: number, targetY: number, size: number, prng: PRNG): Point {
  const candidates: Point[] = [];
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const x = targetX + dx;
      const y = targetY + dy;
      if (x > 1 && x < size - 2 && y > 1 && y < size - 2) {
        if (grid[y][x] === TILE.EMPTY) {
          candidates.push({ x, y });
        }
      }
    }
  }
  return candidates.length > 0 ? prng.choice(candidates) : { x: targetX, y: targetY };
}

function getRandomOpenCell(
  grid: TileType[][],
  size: number,
  centerX: number,
  centerY: number,
  minDistFromCenter: number,
  prng: PRNG
): Point {
  for (let attempts = 0; attempts < 500; attempts++) {
    const x = prng.rangeInt(2, size - 3);
    const y = prng.rangeInt(2, size - 3);
    const dist = Math.hypot(x - centerX, y - centerY);
    if (dist >= minDistFromCenter && (grid[y][x] === TILE.EMPTY || grid[y][x] === TILE.IVY_ALCOVE)) {
      return { x, y };
    }
  }
  return { x: 2, y: 2 };
}

/**
 * Fast BFS grid pathfinding for Grievers
 */
export function findPathBFS(
  grid: TileType[][],
  start: Point, // grid coords
  target: Point, // grid coords
  movingWalls: MovingWall[],
  maxDepth: number = 70
): Point[] {
  if (start.x === target.x && start.y === target.y) return [];

  const sizeY = grid.length;
  const sizeX = grid[0].length;
  const visited: boolean[][] = Array.from({ length: sizeY }, () => new Array(sizeX).fill(false));
  const parent: (Point | null)[][] = Array.from({ length: sizeY }, () => new Array(sizeX).fill(null));

  const queue: Point[] = [start];
  visited[start.y][start.x] = true;

  // Active closed moving walls lookup
  const closedMovingWalls = new Set<string>();
  movingWalls.forEach(mw => {
    if (mw.state === 'CLOSED' || mw.transitionProgress < 0.5) {
      closedMovingWalls.add(`${mw.x},${mw.y}`);
    }
  });

  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ];

  let found = false;
  let steps = 0;

  while (queue.length > 0 && steps < maxDepth * 30) {
    const curr = queue.shift()!;
    steps++;

    if (curr.x === target.x && curr.y === target.y) {
      found = true;
      break;
    }

    for (const d of dirs) {
      const nx = curr.x + d.dx;
      const ny = curr.y + d.dy;

      if (nx >= 0 && nx < sizeX && ny >= 0 && ny < sizeY && !visited[ny][nx]) {
        const tile = grid[ny][nx];
        const isWall = tile === TILE.WALL;
        const isClosedGate = closedMovingWalls.has(`${nx},${ny}`);

        if (!isWall && !isClosedGate) {
          visited[ny][nx] = true;
          parent[ny][nx] = curr;
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  if (!found) return [];

  // Reconstruct path
  const path: Point[] = [];
  let curr: Point | null = target;
  while (curr && !(curr.x === start.x && curr.y === start.y)) {
    path.push(curr);
    curr = parent[curr.y][curr.x];
  }
  path.reverse();
  return path;
}

/**
 * Line of sight raycasting between two world positions
 */
export function hasLineOfSight(
  grid: TileType[][],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tileSize: number,
  movingWalls: MovingWall[]
): boolean {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const steps = Math.max(Math.ceil(Math.hypot(dx, dy) / (tileSize * 0.4)), 1);

  const closedWalls = new Set<string>();
  movingWalls.forEach(mw => {
    if (mw.state === 'CLOSED' || mw.transitionProgress < 0.5) {
      closedWalls.add(`${mw.x},${mw.y}`);
    }
  });

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    const gx = Math.floor(px / tileSize);
    const gy = Math.floor(py / tileSize);

    if (gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[0].length) {
      return false;
    }

    const tile = grid[gy][gx];
    if (tile === TILE.WALL || closedWalls.has(`${gx},${gy}`)) {
      return false;
    }
  }

  return true;
}

/**
 * Circle vs grid wall collision check and response
 * Returns the corrected position and whether a collision occurred
 */
export function resolveWallCollision(
  x: number,
  y: number,
  radius: number,
  grid: TileType[][],
  tileSize: number,
  movingWalls: MovingWall[]
): { x: number; y: number; collided: boolean } {
  let newX = x;
  let newY = y;
  let collided = false;

  const closedWalls = new Set<string>();
  movingWalls.forEach(mw => {
    if (mw.state === 'CLOSED' || mw.transitionProgress < 0.4) {
      closedWalls.add(`${mw.x},${mw.y}`);
    }
  });

  // Surrounding tile bounding box
  const minTileX = Math.floor((newX - radius) / tileSize);
  const maxTileX = Math.floor((newX + radius) / tileSize);
  const minTileY = Math.floor((newY - radius) / tileSize);
  const maxTileY = Math.floor((newY + radius) / tileSize);

  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length) continue;

      const tile = grid[ty][tx];
      const isSolid = tile === TILE.WALL || closedWalls.has(`${tx},${ty}`);

      if (isSolid) {
        // Find closest point on tile AABB to circle center
        const tileLeft = tx * tileSize;
        const tileTop = ty * tileSize;
        const tileRight = tileLeft + tileSize;
        const tileBottom = tileTop + tileSize;

        const closestX = Math.max(tileLeft, Math.min(newX, tileRight));
        const closestY = Math.max(tileTop, Math.min(newY, tileBottom));

        const distX = newX - closestX;
        const distY = newY - closestY;
        const distanceSq = distX * distX + distY * distY;

        if (distanceSq < radius * radius && distanceSq > 0.0001) {
          const distance = Math.sqrt(distanceSq);
          const overlap = radius - distance;
          newX += (distX / distance) * overlap;
          newY += (distY / distance) * overlap;
          collided = true;
        }
      }
    }
  }

  return { x: newX, y: newY, collided };
}
