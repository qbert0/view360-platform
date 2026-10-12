import { tourService } from '../services/tourService';

export default defineEventHandler(() => {
  return {
    service: 'tour-catalog',
    items: tourService.listTours(),
  };
});
