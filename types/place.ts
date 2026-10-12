export interface PlaceHotspot {
  id: string;
  label: string;
  yaw: number;
  pitch: number;
  note: string;
  targetSceneId?: string;
}

export interface PlaceScene {
  id: string;
  title: string;
  subtitle: string;
  panorama: string;
  thumbnail: string;
  initialYaw: number;
  initialPitch: number;
  hotspots: PlaceHotspot[];
}

export interface PlaceExperience {
  slug: string;
  title: string;
  location: string;
  summary: string;
  duration: string;
  curator: string;
  scenes: PlaceScene[];
}
