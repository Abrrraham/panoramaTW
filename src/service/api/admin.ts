import { dataRequest } from '../request';

type AdminResult = { status: string; message?: string };

export function createVectorLayer(data: FormData) {
  return dataRequest<AdminResult>({
    url: '/admin/vector/layer',
    method: 'post',
    data
  });
}

export function createVectorLayerShp(data: FormData) {
  return dataRequest<AdminResult>({
    url: '/admin/vector/layer/shp',
    method: 'post',
    data
  });
}

export function deleteVectorLayer(id: string) {
  return dataRequest<AdminResult>({
    url: `/admin/vector/layer/${id}`,
    method: 'delete'
  });
}

export function createRasterLayer(data: FormData) {
  return dataRequest<AdminResult>({
    url: '/admin/raster/layer',
    method: 'post',
    data
  });
}

export function deleteRasterLayer(id: string) {
  return dataRequest<AdminResult>({
    url: `/admin/raster/layer/${id}`,
    method: 'delete'
  });
}

export function create3dLayer(data: FormData) {
  return dataRequest<AdminResult>({
    url: '/admin/3d/layer',
    method: 'post',
    data
  });
}

export function delete3dLayer(id: string) {
  return dataRequest<AdminResult>({
    url: `/admin/3d/layer/${id}`,
    method: 'delete'
  });
}
