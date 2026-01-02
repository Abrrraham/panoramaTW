import { dataRequest } from '../request';
import { getAuthorization } from '../request/shared';

type AdminResult = { status: string; message?: any; data?: any; code?: string };

function asMultipart(data: FormData) {
  return {
    data,
    headers: {
      // 覆盖默认 application/json，交给浏览器自动生成 multipart 边界
      'Content-Type': undefined as unknown as string
    },
    transformRequest: [
      (d: any, headers: any) => {
        if (headers && headers['Content-Type']) {
          delete headers['Content-Type'];
        }
        return d;
      }
    ]
  };
}

function logUploadAuth(endpoint: string) {
  if (!import.meta.env.DEV) {
    return;
  }
  const auth = getAuthorization();
  if (!auth) {
    console.error(`[upload] Missing Authorization for ${endpoint}. Please re-login.`);
    return;
  }
  const masked = auth.length > 20 ? `${auth.slice(0, 16)}...` : auth;
  console.debug(`[upload] Authorization ready for ${endpoint}: ${masked}`);
}

export function createVectorLayer(data: FormData) {
  logUploadAuth('/admin/vector/layer');
  return dataRequest<AdminResult>({
    url: '/admin/vector/layer',
    method: 'post',
    ...asMultipart(data)
  });
}

export function createVectorLayerShp(data: FormData) {
  logUploadAuth('/admin/vector/layer/shp');
  return dataRequest<AdminResult>({
    url: '/admin/vector/layer/shp',
    method: 'post',
    ...asMultipart(data)
  });
}

export function createRasterLayer(data: FormData) {
  logUploadAuth('/admin/raster/layer');
  return dataRequest<AdminResult>({
    url: '/admin/raster/layer',
    method: 'post',
    ...asMultipart(data)
  });
}

export function createTiles3DLayer(data: FormData) {
  logUploadAuth('/admin/3d/layer');
  return dataRequest<AdminResult>({
    url: '/admin/3d/layer',
    method: 'post',
    ...asMultipart(data)
  });
}

export function deleteLayer(id: string, type: 'vector' | 'raster' | '3d') {
  return dataRequest<AdminResult>({
    url: `/admin/${type}/layer/${id}`,
    method: 'delete'
  });
}
