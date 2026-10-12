/**
 * ─────────────────────────────────────────────────────────────────
 * MapStrategyFactory — Creates the correct IMapStrategy
 *
 * Currently only Map2DStrategy is implemented.
 * Future: MapRealStrategy (Leaflet), Map3DStrategy, etc.
 * ─────────────────────────────────────────────────────────────────
 */

import type { IMapStrategy } from './IMapStrategy';
import { Map2DStrategy } from './Map2DStrategy';
import { LeafletMapStrategy } from './LeafletMapStrategy';
import type { MapConfig } from './IMapStrategy';

export class MapStrategyFactory {
  static create(config?: MapConfig): IMapStrategy {
    const hasGeoNodes = config?.floors.some(floor => floor.nodes.some(node => Number.isFinite(node.latitude) && Number.isFinite(node.longitude)));
    const hasFloorplan = config?.floors.some(floor => Boolean(floor.imageUrl?.trim()));
    // With no floorplan image, Map2DStrategy can only draw its dark fallback
    // background. Prefer the real map even before pins are configured.
    if (config?.mode === 'real' || (config?.mode !== 'floorplan' && (hasGeoNodes || !hasFloorplan))) {
      return new LeafletMapStrategy();
    }
    return new Map2DStrategy();
  }
}
