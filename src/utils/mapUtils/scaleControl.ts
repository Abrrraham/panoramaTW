import mapboxgl from 'mapbox-gl';

export function addScaleControl(map: mapboxgl.Map) {
  const scale = new mapboxgl.ScaleControl({ maxWidth: 100, unit: 'metric' });
  map.addControl(scale, 'bottom-right');
  return scale;
}

export function bindScaleAutoFade(map: mapboxgl.Map) {
  let scaleHideTimer: NodeJS.Timeout | null = null;
  const showScale = () => {
    const scaleControl = document.querySelector('.mapboxgl-ctrl-scale') as HTMLElement;
    if (scaleControl) {
      scaleControl.classList.remove('opacity-0');
      scaleControl.classList.add('opacity-100');
      if (scaleHideTimer) clearTimeout(scaleHideTimer);
      scaleHideTimer = setTimeout(() => {
        scaleControl.classList.remove('opacity-100');
        scaleControl.classList.add('opacity-0');
      }, 500);
    }
  };
  map.on('zoom', showScale);
  map.on('zoomstart', showScale);
  map.on('zoomend', showScale);
  setTimeout(showScale, 500);
  return () => {
    map.off('zoom', showScale);
    map.off('zoomstart', showScale);
    map.off('zoomend', showScale);
    if (scaleHideTimer) clearTimeout(scaleHideTimer);
  };
}












