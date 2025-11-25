import mapboxgl from 'mapbox-gl';
import type MapScene from '@/utils/mapUtils/mapModels/MapScene';

/* eslint-disable max-params, complexity, no-promise-executor-return, default-case */
export async function zoomToLayer(
  scene: MapScene | null | undefined,
  map: mapboxgl.Map,
  layerKey: string,
  layerTitle: string
) {
  try {
    const node = scene?.findNodeById(layerKey);
    if (!node) {
      window.$message?.warning('未找到该图层');
      return;
    }

    if (!node.active) {
      const loadSuccess = scene?.loadNode(layerKey);
      if (!loadSuccess) {
        window.$message?.warning('无法加载该图层');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const features = scene?.queryLayerFeatures(layerKey);
    if (features && features.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      let hasValidGeometry = false;
      features.forEach((feature: any) => {
        if (feature.geometry) {
          try {
            switch (feature.geometry.type) {
              case 'Point':
                bounds.extend(feature.geometry.coordinates as [number, number]);
                hasValidGeometry = true;
                break;
              case 'LineString':
                feature.geometry.coordinates.forEach((coord: [number, number]) => bounds.extend(coord));
                hasValidGeometry = true;
                break;
              case 'Polygon':
                feature.geometry.coordinates[0].forEach((coord: [number, number]) => bounds.extend(coord));
                hasValidGeometry = true;
                break;
              case 'MultiPoint':
                feature.geometry.coordinates.forEach((coord: [number, number]) => bounds.extend(coord));
                hasValidGeometry = true;
                break;
              case 'MultiLineString':
                feature.geometry.coordinates.forEach((line: [number, number][]) =>
                  line.forEach((coord: [number, number]) => bounds.extend(coord))
                );
                hasValidGeometry = true;
                break;
              case 'MultiPolygon':
                feature.geometry.coordinates.forEach((polygon: [number, number][][]) =>
                  polygon[0].forEach((coord: [number, number]) => bounds.extend(coord))
                );
                hasValidGeometry = true;
                break;
            }
          } catch (error) {
            console.warn('处理要素几何时出错:', error);
          }
        }
      });

      if (hasValidGeometry) {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        if (sw.lng !== ne.lng || sw.lat !== ne.lat) {
          map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
          window.$message?.success(`已缩放到图层 ${layerTitle}`);
          return;
        }
      }
    }

    const renderedFeatures = map.queryRenderedFeatures({ layers: (node as any).layers.map((l: any) => l.id) });
    if (renderedFeatures && renderedFeatures.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      let hasValidGeometry = false;
      renderedFeatures.forEach((feature: any) => {
        if (feature.geometry && feature.geometry.type === 'Point') {
          bounds.extend(feature.geometry.coordinates as [number, number]);
          hasValidGeometry = true;
        }
      });
      if (hasValidGeometry) {
        map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
        window.$message?.success(`已缩放到图层 ${layerTitle}`);
        return;
      }
    }

    window.$message?.info(`无法确定图层 ${layerTitle} 的范围`);
  } catch (error) {
    console.error('缩放到图层时出错:', error);
    window.$message?.error('缩放到图层失败');
  }
}
