import type mapboxgl from 'mapbox-gl';

export function bindTileErrorOnceTip(map: mapboxgl.Map) {
  const warnedSourceIds = new Set<string>();
  const handler = (e: any) => {
    const status = e?.error?.status;
    const sourceId = e?.sourceId as string | undefined;
    const isTileError = e?.resourceType === 'tile' || /getMVT|getRasterTile/.test(String(e?.error?.url || e?.error?.message || ''));
    if (isTileError && sourceId && (status === 404 || status === 500 || status === 0)) {
      if (!warnedSourceIds.has(sourceId)) {
        warnedSourceIds.add(sourceId);
        window.$message?.warning('该图层数据未就绪或不可用');
      }
    }
  };
  map.on('error', handler);
  return () => map.off('error', handler);
}












