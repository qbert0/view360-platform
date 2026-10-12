import { catalogService } from '../services/catalogService';

export default defineEventHandler(() => {
  return {
    service: 'catalog-service',
    items: catalogService.listPlaces(),
  };
});
