// A* Pathfinding and Navigation Grid for Bahay ni Kuya

export interface Point {
  x: number;
  y: number;
}

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

export class NavGrid {
  width: number;
  height: number;
  grid: Uint8Array; // 0 = walkable, 1 = solid

  constructor(width: number, height: number, collision: number[]) {
    this.width = width;
    this.height = height;
    this.grid = new Uint8Array(collision);
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.grid[y * this.width + x] === 0;
  }

  setWalkable(x: number, y: number, walkable: boolean): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.grid[y * this.width + x] = walkable ? 0 : 1;
    }
  }

  /**
   * A* algorithm to find an orthogonal path from (startX, startY) to (goalX, goalY).
   * Returns array of tile coordinates [{x, y}, ...], or empty array if unreachable.
   */
  findPath(startX: number, startY: number, goalX: number, goalY: number): Point[] {
    const sx = Math.floor(startX);
    const sy = Math.floor(startY);
    let gx = Math.floor(goalX);
    let gy = Math.floor(goalY);

    // If goal is solid (e.g. clicked on a desk/bed), find nearest walkable neighbor
    if (!this.isWalkable(gx, gy)) {
      const neighbors = [
        { x: gx, y: gy + 1 },
        { x: gx, y: gy - 1 },
        { x: gx - 1, y: gy },
        { x: gx + 1, y: gy },
      ];
      const valid = neighbors.filter((n) => this.isWalkable(n.x, n.y));
      if (valid.length > 0) {
        gx = valid[0].x;
        gy = valid[0].y;
      } else {
        return [];
      }
    }

    if (sx === gx && sy === gy) return [{ x: sx, y: sy }];

    const openList: Node[] = [];
    const closedSet = new Uint8Array(this.width * this.height);
    const nodeMap = new Map<number, Node>();

    const startNode: Node = {
      x: sx,
      y: sy,
      g: 0,
      h: Math.abs(sx - gx) + Math.abs(sy - gy),
      f: Math.abs(sx - gx) + Math.abs(sy - gy),
      parent: null,
    };

    openList.push(startNode);
    nodeMap.set(sy * this.width + sx, startNode);

    const DIRS = [
      { dx: 0, dy: -1 }, // Up
      { dx: 0, dy: 1 },  // Down
      { dx: -1, dy: 0 }, // Left
      { dx: 1, dy: 0 },  // Right
    ];

    while (openList.length > 0) {
      // Find lowest f score
      let lowestIdx = 0;
      for (let i = 1; i < openList.length; i++) {
        if (openList[i].f < openList[lowestIdx].f) lowestIdx = i;
      }

      const current = openList.splice(lowestIdx, 1)[0];
      const currentIdx = current.y * this.width + current.x;
      closedSet[currentIdx] = 1;

      // Reached goal!
      if (current.x === gx && current.y === gy) {
        const path: Point[] = [];
        let curr: Node | null = current;
        while (curr) {
          path.push({ x: curr.x, y: curr.y });
          curr = curr.parent;
        }
        path.reverse();
        return path;
      }

      // Check 4-directional neighbors
      for (const dir of DIRS) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const nIdx = ny * this.width + nx;

        if (!this.isWalkable(nx, ny) || closedSet[nIdx] === 1) continue;

        const tentativeG = current.g + 1;
        let neighbor = nodeMap.get(nIdx);

        if (!neighbor) {
          const h = Math.abs(nx - gx) + Math.abs(ny - gy);
          neighbor = {
            x: nx,
            y: ny,
            g: tentativeG,
            h,
            f: tentativeG + h,
            parent: current,
          };
          nodeMap.set(nIdx, neighbor);
          openList.push(neighbor);
        } else if (tentativeG < neighbor.g) {
          neighbor.g = tentativeG;
          neighbor.f = tentativeG + neighbor.h;
          neighbor.parent = current;
        }
      }
    }

    return []; // No path found
  }
}
