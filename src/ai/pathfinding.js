// Enemy pathfinding via ROT.js A*. Lets hounds pursue around walls toward the player's
// last-known position instead of freezing when line-of-sight breaks. Caller supplies a
// `passable(x,y)` predicate (floor + in-bounds); we return the next tile to step to.
import { Path } from 'rot-js';

/** Next tile [x,y] on the shortest 4-connected path from (fx,fy) to (tx,ty), or null if
 *  already there / unreachable. Tiles are integer cell coords. */
export function pathStep(passable, fx, fy, tx, ty) {
  fx |= 0; fy |= 0; tx |= 0; ty |= 0;
  if (fx === tx && fy === ty) return null;
  // A* needs the goal itself to be passable; bail early if it isn't reachable in principle.
  if (!passable(tx, ty)) return null;
  const astar = new Path.AStar(tx, ty, passable, { topology: 4 });
  const path = [];
  astar.compute(fx, fy, (x, y) => path.push([x, y]));
  // path is [from, ..., to]; the first hop is what we want.
  return path.length >= 2 ? path[1] : null;
}
