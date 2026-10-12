/**
 * server/content/autoMapGenerator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Auto-generate a MapConfig from TourScene[] when no explicit map is defined.
 *
 * Algorithm:
 *   1. Build adjacency graph from navigation markers (targetScene links)
 *   2. Detect connected components → each becomes a floor
 *   3. Layout nodes using force-directed placement within each floor
 *   4. Return a complete MapConfig ready for MapPlugin
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TourScene, NavigationMarker } from '#view360/types/tour';
import type { MapConfig, MapFloor, MapNode } from '#view360/core/three/map/IMapStrategy';

// ── Layout constants ──────────────────────────────────────────────

const CANVAS_W = 800;
const CANVAS_H = 600;
const PADDING = 80;
const MIN_DIST = 90;

/**
 * Generate a MapConfig automatically from scenes.
 * Uses navigation markers to build the connection graph.
 */
export function generateAutoMap(scenes: TourScene[]): MapConfig {
  if (scenes.length === 0) {
    return { floors: [], visible: false };
  }

  // ── Step 1: Build adjacency graph ───────────────────────────

  const sceneIds = new Set(scenes.map((s) => s.id));
  const neighbors = new Map<string, Set<string>>();

  for (const scene of scenes) {
    if (!neighbors.has(scene.id)) neighbors.set(scene.id, new Set());

    for (const marker of scene.markers ?? []) {
      if (marker.plugin === 'navigation') {
        const nav = marker as NavigationMarker;
        if (nav.targetScene && sceneIds.has(nav.targetScene)) {
          neighbors.get(scene.id)!.add(nav.targetScene);
          // Bidirectional
          if (!neighbors.has(nav.targetScene)) neighbors.set(nav.targetScene, new Set());
          neighbors.get(nav.targetScene)!.add(scene.id);
        }
      }
    }
  }

  // ── Step 2: Find connected components ───────────────────────

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const scene of scenes) {
    if (visited.has(scene.id)) continue;
    const component: string[] = [];
    const stack = [scene.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      component.push(id);
      for (const nbr of neighbors.get(id) ?? []) {
        if (!visited.has(nbr)) stack.push(nbr);
      }
    }
    components.push(component);
  }

  // ── Step 3: Create floors from components ───────────────────

  const sceneMap = new Map(scenes.map((s) => [s.id, s]));

  const floors: MapFloor[] = components.map((component, idx) => {
    const positions = layoutNodes(component, neighbors);
    const floorId = components.length === 1 ? 'main' : `floor-${idx + 1}`;
    const floorName = components.length === 1
      ? 'Tất cả'
      : `Khu vực ${idx + 1}`;

    const nodes: MapNode[] = component.map((id) => {
      const scene = sceneMap.get(id);
      const pos = positions.get(id)!;
      const nodeNeighbors = [...(neighbors.get(id) ?? [])].filter((n) =>
        component.includes(n),
      );

      // Check for exit links to other floors
      const crossFloorNeighbors = [...(neighbors.get(id) ?? [])].filter(
        (n) => !component.includes(n),
      );
      let exitTo: MapNode['exitTo'] | undefined;
      if (crossFloorNeighbors.length > 0) {
        const targetId = crossFloorNeighbors[0];
        const targetFloorIdx = components.findIndex((c) => c.includes(targetId));
        if (targetFloorIdx >= 0) {
          exitTo = {
            floorId: components.length === 1 ? 'main' : `floor-${targetFloorIdx + 1}`,
            nodeId: targetId,
          };
        }
      }

      return {
        id,
        name: scene?.title ?? id,
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        neighbors: nodeNeighbors,
        visible: scene?.showOnMap === true,
        exitTo,
      };
    });

    return {
      id: floorId,
      name: floorName,
      shortName: components.length === 1 ? undefined : `KV${idx + 1}`,
      imageUrl: '',
      imageWidth: CANVAS_W,
      imageHeight: CANVAS_H,
      nodes,
    };
  });

  return {
    floors,
    defaultFloorId: floors[0]?.id,
    position: 'bottom-left',
    width: 280,
    height: 200,
    showConnections: true,
    showCameraArrow: true,
    clickToNavigate: true,
    showFloorTabs: floors.length > 1,
    autoSwitchFloor: true,
    visible: true,
  };
}

// ── Simple force-directed layout ──────────────────────────────────

interface Vec2 { x: number; y: number }

function layoutNodes(
  nodeIds: string[],
  neighbors: Map<string, Set<string>>,
): Map<string, Vec2> {
  const n = nodeIds.length;
  if (n === 0) return new Map();
  if (n === 1) return new Map([[nodeIds[0], { x: CANVAS_W / 2, y: CANVAS_H / 2 }]]);

  // Initialize positions in a circle
  const positions = new Map<string, Vec2>();
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const initRadius = Math.min(cx, cy) - PADDING;

  nodeIds.forEach((id, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    positions.set(id, {
      x: cx + Math.cos(angle) * initRadius,
      y: cy + Math.sin(angle) * initRadius,
    });
  });

  // Simple force simulation
  const ITERATIONS = 80;
  const REPULSION = 5000;
  const ATTRACTION = 0.05;
  const DAMPING = 0.85;

  const velocities = new Map<string, Vec2>();
  for (const id of nodeIds) velocities.set(id, { x: 0, y: 0 });

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Repulsion between all pairs
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = positions.get(nodeIds[i])!;
        const b = positions.get(nodeIds[j])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) { dx = 1; dy = 1; dist = 1.41; }
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        velocities.get(nodeIds[i])!.x += fx;
        velocities.get(nodeIds[i])!.y += fy;
        velocities.get(nodeIds[j])!.x -= fx;
        velocities.get(nodeIds[j])!.y -= fy;
      }
    }

    // Attraction along edges
    for (const id of nodeIds) {
      const pos = positions.get(id)!;
      for (const nbr of neighbors.get(id) ?? []) {
        if (!positions.has(nbr)) continue;
        const nbrPos = positions.get(nbr)!;
        const dx = nbrPos.x - pos.x;
        const dy = nbrPos.y - pos.y;
        velocities.get(id)!.x += dx * ATTRACTION;
        velocities.get(id)!.y += dy * ATTRACTION;
      }
    }

    // Center gravity
    for (const id of nodeIds) {
      const pos = positions.get(id)!;
      velocities.get(id)!.x += (cx - pos.x) * 0.005;
      velocities.get(id)!.y += (cy - pos.y) * 0.005;
    }

    // Apply velocities
    for (const id of nodeIds) {
      const pos = positions.get(id)!;
      const vel = velocities.get(id)!;
      pos.x += vel.x;
      pos.y += vel.y;
      vel.x *= DAMPING;
      vel.y *= DAMPING;
      // Clamp to canvas
      pos.x = Math.max(PADDING, Math.min(CANVAS_W - PADDING, pos.x));
      pos.y = Math.max(PADDING, Math.min(CANVAS_H - PADDING, pos.y));
    }
  }

  // Ensure minimum distance between nodes
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = positions.get(nodeIds[i])!;
        const b = positions.get(nodeIds[j])!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_DIST && dist > 0) {
          const push = (MIN_DIST - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  return positions;
}
