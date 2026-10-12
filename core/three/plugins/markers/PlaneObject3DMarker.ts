import * as THREE from 'three';
import { Object3DMarker } from './Object3DMarker';
import type { Object3DTransform } from './Object3DMarker';
import type { TourMarker } from '#view360/types/tour';

export interface PlaneObject3DTransform extends Omit<Object3DTransform, 'scaleZ'> {
  scaleX?: number;
  scaleY?: number;
}

/** 2D surface in 3D space: supports XYZ rotation but only X/Y resizing. */
export abstract class PlaneObject3DMarker<
  TMarker extends TourMarker & PlaneObject3DTransform,
> extends Object3DMarker<TMarker> {
  protected override getScale(marker: TMarker): THREE.Vector3 {
    return new THREE.Vector3(
      this.normalizeScale(marker.scaleX),
      this.normalizeScale(marker.scaleY),
      1,
    );
  }
}
