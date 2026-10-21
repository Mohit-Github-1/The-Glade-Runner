import { Player, Griever, Collectible, Checkpoint, MovingWall, Particle, Camera, TILE, TileType } from './types';
import { MazeData } from './maze';

export class GameRenderer {
  private wallPatternCanvas: HTMLCanvasElement;
  private floorPatternCanvas: HTMLCanvasElement;
  private gladePatternCanvas: HTMLCanvasElement;

  constructor() {
    this.wallPatternCanvas = this.createWallTexture();
    this.floorPatternCanvas = this.createFloorTexture();
    this.gladePatternCanvas = this.createGladeTexture();
  }

  /**
   * Procedural mossy stone wall texture
   */
  private createWallTexture(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Base stone
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, 64, 64);

    // Stone blocks
    ctx.strokeStyle = '#0c0a09';
    ctx.lineWidth = 2;

    // Top block
    ctx.fillStyle = '#292524';
    ctx.fillRect(2, 2, 60, 28);
    ctx.strokeRect(2, 2, 60, 28);

    // Bottom blocks split
    ctx.fillStyle = '#262220';
    ctx.fillRect(2, 32, 28, 30);
    ctx.strokeRect(2, 32, 28, 30);

    ctx.fillRect(32, 32, 30, 30);
    ctx.strokeRect(32, 32, 30, 30);

    // Texture noise & cracks
    ctx.fillStyle = '#44403c';
    for (let i = 0; i < 24; i++) {
      const px = (i * 17) % 60 + 2;
      const py = (i * 23) % 60 + 2;
      ctx.fillRect(px, py, 2, 2);
    }

    // Moss overlay
    ctx.fillStyle = 'rgba(22, 101, 52, 0.45)';
    ctx.beginPath();
    ctx.arc(14, 20, 8, 0, Math.PI * 2);
    ctx.arc(48, 48, 10, 0, Math.PI * 2);
    ctx.arc(28, 34, 6, 0, Math.PI * 2);
    ctx.fill();

    return canvas;
  }

  /**
   * Procedural dirt / flagstone floor texture
   */
  private createFloorTexture(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Dark damp dirt
    ctx.fillStyle = '#0f0e0d';
    ctx.fillRect(0, 0, 64, 64);

    // Subtle stone slabs
    ctx.fillStyle = '#141210';
    ctx.fillRect(4, 4, 26, 26);
    ctx.fillRect(34, 34, 26, 26);

    // Fine dirt pebbles
    ctx.fillStyle = '#292524';
    for (let i = 0; i < 18; i++) {
      const px = (i * 13) % 60 + 2;
      const py = (i * 29) % 60 + 2;
      ctx.fillRect(px, py, 1.5, 1.5);
    }

    return canvas;
  }

  /**
   * Procedural lush grass sanctuary floor for The Glade
   */
  private createGladeTexture(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Rich dark mossy turf
    ctx.fillStyle = '#052e16';
    ctx.fillRect(0, 0, 64, 64);

    ctx.fillStyle = '#14532d';
    ctx.fillRect(6, 6, 24, 24);
    ctx.fillRect(34, 32, 24, 24);

    // Grass blades
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const gx = (i * 11) % 56 + 4;
      const gy = (i * 19) % 56 + 4;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + 2, gy - 4);
      ctx.stroke();
    }

    return canvas;
  }

  /**
   * Main render pass
   */
  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    maze: MazeData,
    player: Player,
    camera: Camera,
    explored: boolean[][],
    particles: Particle[],
    gameTime: number,
    screenShake: { x: number; y: number }
  ) {
    ctx.save();
    // Fill background with abyss black
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    // Apply Camera transform and screen shake
    ctx.translate(width / 2 + screenShake.x, height / 2 + screenShake.y);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.x, -camera.y);

    const ts = maze.tileSize;

    // Viewport frustum culling bounds in tile indices
    const halfViewW = (width / 2 / camera.scale) + ts * 2;
    const halfViewH = (height / 2 / camera.scale) + ts * 2;

    const minTX = Math.max(0, Math.floor((camera.x - halfViewW) / ts));
    const maxTX = Math.min(maze.width - 1, Math.ceil((camera.x + halfViewW) / ts));
    const minTY = Math.max(0, Math.floor((camera.y - halfViewH) / ts));
    const maxTY = Math.min(maze.height - 1, Math.ceil((camera.y + halfViewH) / ts));

    // 1. Draw Maze Tiles (Floor & Walls)
    for (let ty = minTY; ty <= maxTY; ty++) {
      for (let tx = minTX; tx <= maxTX; tx++) {
        const tile = maze.grid[ty][tx];
        const worldX = tx * ts;
        const worldY = ty * ts;
        const isExplored = explored[ty]?.[tx];

        // Draw Floor first
        if (tile === TILE.GLADE_FLOOR) {
          ctx.drawImage(this.gladePatternCanvas, worldX, worldY, ts, ts);
        } else {
          ctx.drawImage(this.floorPatternCanvas, worldX, worldY, ts, ts);
        }

        // Draw Walls / Special Tiles
        if (tile === TILE.WALL) {
          ctx.drawImage(this.wallPatternCanvas, worldX, worldY, ts, ts);

          // Top bevel highlight for 3D depth
          ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
          ctx.fillRect(worldX, worldY, ts, 3);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillRect(worldX, worldY + ts - 4, ts, 4);
        } else if (tile === TILE.IVY_ALCOVE) {
          // Ivy alcove leaves on floor & moss walls
          ctx.fillStyle = 'rgba(13, 148, 136, 0.15)';
          ctx.fillRect(worldX, worldY, ts, ts);

          // Ivy vines
          ctx.fillStyle = '#166534';
          ctx.beginPath();
          ctx.arc(worldX + ts * 0.3, worldY + ts * 0.3, 10, 0, Math.PI * 2);
          ctx.arc(worldX + ts * 0.7, worldY + ts * 0.4, 12, 0, Math.PI * 2);
          ctx.arc(worldX + ts * 0.5, worldY + ts * 0.7, 14, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.arc(worldX + ts * 0.35, worldY + ts * 0.35, 6, 0, Math.PI * 2);
          ctx.arc(worldX + ts * 0.65, worldY + ts * 0.45, 7, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile === TILE.EXIT_GATE) {
          this.renderExitGate(ctx, worldX, worldY, ts, player.keys, player.totalKeysRequired, gameTime);
        }
      }
    }

    // 2. Render Checkpoints
    maze.checkpoints.forEach(cp => {
      this.renderCheckpoint(ctx, cp, ts, gameTime);
    });

    // 3. Render Moving Walls
    maze.movingWalls.forEach(mw => {
      this.renderMovingWall(ctx, mw, ts);
    });

    // 4. Render Collectibles
    maze.collectibles.forEach(col => {
      if (!col.collected) {
        this.renderCollectible(ctx, col, gameTime);
      }
    });

    // 5. Render Grievers
    maze.grievers.forEach(griever => {
      this.renderGriever(ctx, griever, gameTime);
    });

    // 6. Render Particles
    this.renderParticles(ctx, particles);

    // 7. Render Player
    this.renderPlayer(ctx, player, gameTime);

    // 8. Render Dynamic Lighting & Fog of War
    ctx.restore(); // Return to screen space for clean composite lighting mask
    this.renderLightingAndFog(ctx, width, height, player, camera, explored, maze, gameTime);
  }

  /**
   * Render the massive Perimeter Exit Gate
   */
  private renderExitGate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    ts: number,
    currentKeys: number,
    neededKeys: number,
    gameTime: number
  ) {
    ctx.save();
    const isUnlocked = currentKeys >= neededKeys;

    // Gate frame
    ctx.fillStyle = '#1e1b18';
    ctx.fillRect(x, y, ts, ts);

    // Iron portcullis bars
    ctx.strokeStyle = isUnlocked ? '#f59e0b' : '#78716c';
    ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      const bx = x + (i + 1) * (ts / 5);
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.lineTo(bx, y + ts);
      ctx.stroke();
    }

    // Horizontal bars
    ctx.beginPath();
    ctx.moveTo(x, y + ts * 0.3);
    ctx.lineTo(x + ts, y + ts * 0.3);
    ctx.moveTo(x, y + ts * 0.7);
    ctx.lineTo(x + ts, y + ts * 0.7);
    ctx.stroke();

    // Key sockets
    const socketY = y + ts * 0.5;
    for (let k = 0; k < neededKeys; k++) {
      const socketX = x + ts * (0.25 + k * 0.25);
      const isLit = k < currentKeys;

      ctx.beginPath();
      ctx.arc(socketX, socketY, 5, 0, Math.PI * 2);
      ctx.fillStyle = isLit ? '#fbbf24' : '#292524';
      ctx.fill();
      ctx.strokeStyle = isLit ? '#fef08a' : '#57534e';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (isLit) {
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Portal aura if unlocked
    if (isUnlocked) {
      const pulse = 0.5 + 0.5 * Math.sin(gameTime * 4);
      ctx.fillStyle = `rgba(251, 191, 36, ${0.25 + pulse * 0.2})`;
      ctx.fillRect(x, y, ts, ts);
    }

    ctx.restore();
  }

  /**
   * Render ancient Runic Checkpoint pedestal
   */
  private renderCheckpoint(ctx: CanvasRenderingContext2D, cp: Checkpoint, ts: number, gameTime: number) {
    ctx.save();
    const cx = cp.worldX;
    const cy = cp.worldY;

    // Circular stone pedestal
    ctx.fillStyle = '#262626';
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = cp.activated ? '#10b981' : '#0284c7';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Inner glowing rune
    const pulse = 0.5 + 0.5 * Math.sin(gameTime * 3);
    ctx.fillStyle = cp.activated
      ? `rgba(16, 185, 129, ${0.4 + pulse * 0.4})`
      : `rgba(2, 132, 199, ${0.2 + pulse * 0.2})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();

    // Rotating rune marks
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(gameTime * 0.8 * (cp.activated ? 1.5 : 0.5));
    ctx.strokeStyle = cp.activated ? '#34d399' : '#38bdf8';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(13, 0);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
  }

  /**
   * Render Mechanical Moving Wall section
   */
  private renderMovingWall(ctx: CanvasRenderingContext2D, mw: MovingWall, ts: number) {
    ctx.save();
    const wx = mw.x * ts;
    const wy = mw.y * ts;

    // If completely open, draw recessed floor tracks
    if (mw.state === 'OPEN') {
      ctx.fillStyle = '#171717';
      ctx.fillRect(wx, wy, ts, ts);
      // Floor metal rails
      ctx.strokeStyle = '#404040';
      ctx.lineWidth = 2;
      ctx.strokeRect(wx + 4, wy + 4, ts - 8, ts - 8);
      ctx.restore();
      return;
    }

    // Sliding wall block with transition progress
    const offset = mw.transitionProgress * ts;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wx, wy, ts, ts);
    ctx.clip();

    ctx.translate(0, -offset);

    // Mechanical blast wall
    ctx.fillStyle = '#332f2c';
    ctx.fillRect(wx, wy, ts, ts);

    // Hazard stripes
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 4;
    for (let i = -ts; i < ts * 2; i += 16) {
      ctx.beginPath();
      ctx.moveTo(wx + i, wy);
      ctx.lineTo(wx + i + 12, wy + ts);
      ctx.stroke();
    }

    // Riveted border
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 3;
    ctx.strokeRect(wx + 2, wy + 2, ts - 4, ts - 4);

    ctx.restore();
    ctx.restore();
  }

  /**
   * Render Collectibles (Keys, Batteries, Water)
   */
  private renderCollectible(ctx: CanvasRenderingContext2D, col: Collectible, gameTime: number) {
    ctx.save();
    const floatY = Math.sin(gameTime * 3 + col.bobOffset) * 4;
    const x = col.x;
    const y = col.y + floatY;

    if (col.type === 'KEY') {
      // Golden Key
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 12;

      // Key Ring
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y - 7, 7, 0, Math.PI * 2);
      ctx.stroke();

      // Key Stem
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 14);
      ctx.stroke();

      // Key teeth
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.lineTo(x + 5, y + 8);
      ctx.moveTo(x, y + 12);
      ctx.lineTo(x + 5, y + 12);
      ctx.stroke();

      // Sparkling core
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(x, y - 7, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (col.type === 'BATTERY') {
      // Cyan Battery Cell
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 10;

      ctx.fillStyle = '#0891b2';
      ctx.fillRect(x - 6, y - 9, 12, 18);

      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(x - 4, y - 7, 8, 14);

      // Positive tip
      ctx.fillStyle = '#cffafe';
      ctx.fillRect(x - 3, y - 12, 6, 3);
    } else if (col.type === 'WATER') {
      // Azure Water Canteen
      ctx.shadowColor = '#3b82f6';
      ctx.shadowBlur = 10;

      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.arc(x, y + 2, 6, 0, Math.PI * 2);
      ctx.fill();

      // Flask cap
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(x - 4, y - 12, 8, 4);
    }

    ctx.restore();
  }

  /**
   * Render Mechanical Griever monster
   */
  private renderGriever(ctx: CanvasRenderingContext2D, griever: Griever, gameTime: number) {
    ctx.save();
    ctx.translate(griever.x, griever.y);
    ctx.rotate(griever.angle);

    const isChasing = griever.state === 'CHASE';

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 4, griever.radius * 1.1, griever.radius * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Articulated Mechanical Legs (6 multi-jointed spider/scorpion legs)
    const legPhase = griever.legCycle;
    const legCount = 6;
    ctx.strokeStyle = isChasing ? '#7f1d1d' : '#292524';
    ctx.lineWidth = 3;

    for (let i = 0; i < legCount; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const legIndex = Math.floor(i / 2);
      const baseAngle = (legIndex - 1) * 0.45;
      const legWiggle = Math.sin(legPhase + i * 1.3) * 6;

      const joint1X = Math.cos(baseAngle) * 12;
      const joint1Y = (Math.sin(baseAngle) * 12 + legWiggle) * side;

      const kneeX = joint1X + Math.cos(baseAngle + 0.3) * 16;
      const kneeY = (joint1Y + 16) * side;

      const footX = kneeX + 8;
      const footY = (kneeY + 8) * side;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(joint1X, joint1Y);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();

      // Metallic joints
      ctx.fillStyle = '#57534e';
      ctx.beginPath();
      ctx.arc(kneeX, kneeY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Spiked metallic carapace body
    ctx.fillStyle = isChasing ? '#450a0a' : '#1c1917';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isChasing ? '#b91c1c' : '#44403c';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Spikes / exhaust vents on carapace
    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.lineTo(-16, -14);
    ctx.lineTo(-6, -10);
    ctx.moveTo(-10, 8);
    ctx.lineTo(-16, 14);
    ctx.lineTo(-6, 10);
    ctx.fill();

    // Glowing Optical Sensor / Eye
    const eyePulse = 0.6 + 0.4 * Math.sin(gameTime * (isChasing ? 12 : 3));
    ctx.shadowColor = isChasing ? '#ef4444' : '#f97316';
    ctx.shadowBlur = isChasing ? 16 : 8;

    ctx.fillStyle = isChasing
      ? `rgba(239, 68, 68, ${eyePulse})`
      : `rgba(249, 115, 22, ${eyePulse})`;
    ctx.beginPath();
    ctx.arc(10, 0, isChasing ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();

    // Forward threat ray cone if in chase
    if (isChasing) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(80, -28);
      ctx.lineTo(80, 28);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Render Runner Player
   */
  private renderPlayer(ctx: CanvasRenderingContext2D, player: Player, gameTime: number) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);

    // If hurt / invulnerable, flash
    if (player.invulnerableTime > 0 && Math.floor(gameTime * 20) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }

    // If hiding in ivy, dim alpha
    if (player.isHiding) {
      ctx.globalAlpha = 0.55;
    }

    // Player ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 3, player.radius, player.radius * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();

    // Runner Body (Tactical Vest / Jacket)
    ctx.fillStyle = player.isHiding ? '#14532d' : '#292524';
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = player.isHiding ? '#4ade80' : '#78716c';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Backpack
    ctx.fillStyle = '#44403c';
    ctx.fillRect(-12, -7, 7, 14);

    // Head / Hair
    ctx.fillStyle = '#d6d3d1';
    ctx.beginPath();
    ctx.arc(2, 0, 6, 0, Math.PI * 2);
    ctx.fill();

    // Flashlight fixture in right hand
    ctx.fillStyle = player.flashlightOn ? '#38bdf8' : '#57534e';
    ctx.fillRect(8, 4, 6, 4);

    // Handheld flashlight lens glow
    if (player.flashlightOn) {
      ctx.shadowColor = '#67e8f9';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.arc(14, 6, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // If hiding, render floating "HIDDEN" badge
    if (player.isHiding) {
      ctx.restore();
      ctx.save();
      ctx.translate(player.x, player.y - player.radius - 12);
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#4ade80';
      ctx.textAlign = 'center';
      ctx.fillText('HIDDEN', 0, 0);
      ctx.restore();
      return;
    }

    ctx.restore();
  }

  /**
   * Render ambient particles & dust
   */
  private renderParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
    ctx.save();
    particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  /**
   * Render Dynamic Darkness / Fog of War and Flashlight Light Cone
   */
  private renderLightingAndFog(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: Player,
    camera: Camera,
    explored: boolean[][],
    maze: MazeData,
    gameTime: number
  ) {
    // Player position in screen coordinates
    const playerScreenX = width / 2 + (player.x - camera.x) * camera.scale;
    const playerScreenY = height / 2 + (player.y - camera.y) * camera.scale;

    // Create an offscreen lighting mask or use destination-out composite
    const lightCanvas = document.createElement('canvas');
    lightCanvas.width = width;
    lightCanvas.height = height;
    const lctx = lightCanvas.getContext('2d')!;

    // 1. Fill mask with pitch black darkness
    lctx.fillStyle = 'rgba(5, 5, 5, 0.97)';
    lctx.fillRect(0, 0, width, height);

    // 2. Explored area faint visibility pass (carves subtle light where player has visited)
    lctx.save();
    lctx.globalCompositeOperation = 'destination-out';
    lctx.fillStyle = 'rgba(0, 0, 0, 0.78)'; // Leaves explored areas dimly visible (faint fog)

    const ts = maze.tileSize;
    const halfViewW = width / 2 / camera.scale + ts;
    const halfViewH = height / 2 / camera.scale + ts;
    const minTX = Math.max(0, Math.floor((camera.x - halfViewW) / ts));
    const maxTX = Math.min(maze.width - 1, Math.ceil((camera.x + halfViewW) / ts));
    const minTY = Math.max(0, Math.floor((camera.y - halfViewH) / ts));
    const maxTY = Math.min(maze.height - 1, Math.ceil((camera.y + halfViewH) / ts));

    for (let ty = minTY; ty <= maxTY; ty++) {
      for (let tx = minTX; tx <= maxTX; tx++) {
        if (explored[ty]?.[tx]) {
          const sx = width / 2 + (tx * ts - camera.x) * camera.scale;
          const sy = height / 2 + (ty * ts - camera.y) * camera.scale;
          const sw = ts * camera.scale + 1;
          const sh = ts * camera.scale + 1;
          lctx.fillRect(sx, sy, sw, sh);
        }
      }
    }
    lctx.restore();

    // 3. Clear active vision around player (Full clear via destination-out)
    lctx.save();
    lctx.globalCompositeOperation = 'destination-out';

    // Base circular field of vision around player
    const baseRadius = (player.flashlightOn ? 190 : 135) * camera.scale;
    const baseGrad = lctx.createRadialGradient(
      playerScreenX,
      playerScreenY,
      10 * camera.scale,
      playerScreenX,
      playerScreenY,
      baseRadius
    );
    baseGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    baseGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.9)');
    baseGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    lctx.fillStyle = baseGrad;
    lctx.beginPath();
    lctx.arc(playerScreenX, playerScreenY, baseRadius, 0, Math.PI * 2);
    lctx.fill();

    // 4. Directional Flashlight Cone if turned ON
    if (player.flashlightOn && player.battery > 0) {
      const flashRange = 360 * camera.scale;
      const flashAngleSpread = 0.52; // radians (~30 degrees)
      const flashGrad = lctx.createRadialGradient(
        playerScreenX,
        playerScreenY,
        20 * camera.scale,
        playerScreenX,
        playerScreenY,
        flashRange
      );
      flashGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      flashGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.95)');
      flashGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      lctx.fillStyle = flashGrad;
      lctx.beginPath();
      lctx.moveTo(playerScreenX, playerScreenY);
      lctx.arc(
        playerScreenX,
        playerScreenY,
        flashRange,
        player.angle - flashAngleSpread,
        player.angle + flashAngleSpread
      );
      lctx.closePath();
      lctx.fill();
    }

    lctx.restore();

    // 5. Draw the dark fog mask onto the main game canvas
    ctx.drawImage(lightCanvas, 0, 0);

    // 6. Flashlight subtle yellow volumetric dust beam overlay
    if (player.flashlightOn && player.battery > 0) {
      ctx.save();
      const flashRange = 360 * camera.scale;
      const flashAngleSpread = 0.52;
      const beamGrad = ctx.createRadialGradient(
        playerScreenX,
        playerScreenY,
        15 * camera.scale,
        playerScreenX,
        playerScreenY,
        flashRange
      );
      beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.14)');
      beamGrad.addColorStop(0.7, 'rgba(254, 240, 138, 0.05)');
      beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');

      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(playerScreenX, playerScreenY);
      ctx.arc(
        playerScreenX,
        playerScreenY,
        flashRange,
        player.angle - flashAngleSpread,
        player.angle + flashAngleSpread
      );
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Render Minimap / Fullscreen Tactical Map
   */
  public renderMinimap(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    maze: MazeData,
    player: Player,
    explored: boolean[][],
    isFullScreen: boolean
  ) {
    ctx.save();
    ctx.fillStyle = '#0a0908';
    ctx.fillRect(0, 0, width, height);

    const mapSize = maze.width;
    const cellSize = Math.min(width / mapSize, height / mapSize);
    const offsetX = (width - mapSize * cellSize) / 2;
    const offsetY = (height - mapSize * cellSize) / 2;

    // Render explored cells
    for (let y = 0; y < mapSize; y++) {
      for (let x = 0; x < mapSize; x++) {
        const isExplored = explored[y]?.[x];
        const tile = maze.grid[y][x];

        const cx = offsetX + x * cellSize;
        const cy = offsetY + y * cellSize;

        if (!isExplored && !isFullScreen) {
          // Unexplored in normal minimap is pitch black
          ctx.fillStyle = '#050505';
          ctx.fillRect(cx, cy, cellSize, cellSize);
          continue;
        }

        if (tile === TILE.WALL) {
          ctx.fillStyle = isExplored ? '#292524' : '#141210';
        } else if (tile === TILE.GLADE_FLOOR) {
          ctx.fillStyle = '#14532d';
        } else if (tile === TILE.IVY_ALCOVE) {
          ctx.fillStyle = '#047857';
        } else if (tile === TILE.EXIT_GATE) {
          ctx.fillStyle = '#f59e0b';
        } else {
          ctx.fillStyle = isExplored ? '#44403c' : '#171717';
        }

        ctx.fillRect(cx, cy, cellSize, cellSize);
      }
    }

    // Draw Keys on explored cells
    maze.collectibles.forEach(col => {
      if (!col.collected && col.type === 'KEY') {
        const gx = Math.floor(col.x / maze.tileSize);
        const gy = Math.floor(col.y / maze.tileSize);
        if (explored[gy]?.[gx] || isFullScreen) {
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(
            offsetX + (gx + 0.5) * cellSize,
            offsetY + (gy + 0.5) * cellSize,
            Math.max(2, cellSize * 0.7),
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
    });

    // Draw Exit Gate icon
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(
      offsetX + maze.exitGate.x * cellSize,
      offsetY + maze.exitGate.y * cellSize,
      cellSize,
      cellSize
    );

    // Draw Grievers in radar range or if fullscreen
    maze.grievers.forEach(gr => {
      const gx = Math.floor(gr.x / maze.tileSize);
      const gy = Math.floor(gr.y / maze.tileSize);
      const distToPlayer = Math.hypot(gr.x - player.x, gr.y - player.y);
      if (distToPlayer < 400 || isFullScreen) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(
          offsetX + (gr.x / maze.tileSize) * cellSize,
          offsetY + (gr.y / maze.tileSize) * cellSize,
          Math.max(2, cellSize * 0.8),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    });

    // Draw Player
    const playerGX = player.x / maze.tileSize;
    const playerGY = player.y / maze.tileSize;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(
      offsetX + playerGX * cellSize,
      offsetY + playerGY * cellSize,
      Math.max(3, cellSize * 1.2),
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Player heading triangle
    ctx.save();
    ctx.translate(offsetX + playerGX * cellSize, offsetY + playerGY * cellSize);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-3, -3);
    ctx.lineTo(-3, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }
}
