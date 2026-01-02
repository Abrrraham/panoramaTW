import { dataRequest } from '../request';

type AdminResult<T = any> = { status: string; message?: any; data?: T; code?: string };

export type LayerListItem = {
  id: string;
  layerName: string;
  tableName: string;
  category: string;
  usage: Record<string, string>;
  createdAt?: number;
  updatedAt?: number;
};

export type LayerListResponse = {
  items: LayerListItem[];
  page: number;
  size: number;
  total: number;
};

export function fetchLayerList(params: {
  page?: number;
  size?: number;
  category?: string;
  status?: string;
  keyword?: string;
}) {
  return dataRequest<AdminResult<LayerListResponse>>({
    url: '/admin/layers',
    method: 'get',
    params
  });
}

export function patchLayer(id: string, payload: { layerName?: string; status?: string }) {
  return dataRequest<AdminResult>({
    url: `/admin/layers/${id}`,
    method: 'patch',
    data: payload
  });
}

export function deleteLayerById(id: string) {
  return dataRequest<AdminResult>({
    url: `/admin/layers/${id}`,
    method: 'delete'
  });
}
