import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';

export function addBoxZoomControls(map: mapboxgl.Map) {
  const boxZoomInBtn = document.createElement('button');
  boxZoomInBtn.className = 'mapboxgl-ctrl-icon box-zoom-in-btn';
  boxZoomInBtn.title = '框选放大';
  boxZoomInBtn.textContent = '⊞';
  boxZoomInBtn.style.cssText = `
    background: white !important;
    border: none !important;
    width: 29px !important;
    height: 29px !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 16px !important;
    font-weight: bold !important;
    color: #374151 !important;
    box-sizing: border-box !important;
  `;

  const boxZoomOutBtn = document.createElement('button');
  boxZoomOutBtn.className = 'mapboxgl-ctrl-icon box-zoom-out-btn';
  boxZoomOutBtn.title = '框选缩小';
  boxZoomOutBtn.textContent = '⊟';
  boxZoomOutBtn.style.cssText = boxZoomInBtn.style.cssText;

  let isBoxZooming = false;
  let boxZoomType: 'in' | 'out' | null = null;

  const startBoxZoom = (type: 'in' | 'out') => {
    if (isBoxZooming) { exitBoxZoom(); return; }
    isBoxZooming = true;
    boxZoomType = type;
    if (type === 'in') {
      boxZoomInBtn.style.setProperty('background-color', '#007cbf', 'important');
      boxZoomInBtn.style.setProperty('color', 'white', 'important');
      boxZoomOutBtn.style.setProperty('background-color', 'white', 'important');
      boxZoomOutBtn.style.setProperty('color', '#374151', 'important');
    } else {
      boxZoomOutBtn.style.setProperty('background-color', '#007cbf', 'important');
      boxZoomOutBtn.style.setProperty('color', 'white', 'important');
      boxZoomInBtn.style.setProperty('background-color', 'white', 'important');
      boxZoomInBtn.style.setProperty('color', '#374151', 'important');
    }
    map.boxZoom.disable();
    map.getCanvasContainer().style.cursor = 'crosshair';
    const canvas = map.getCanvasContainer();
    let startPoint: [number, number] | null = null;
    let box: HTMLElement | null = null;
    const onMouseDown = (e: MouseEvent) => {
      if (!isBoxZooming) return;
      e.preventDefault(); e.stopPropagation();
      map.dragPan.disable();
      startPoint = [e.clientX, e.clientY];
      box = document.createElement('div');
      box.style.cssText = `position:absolute;border:2px dashed #007cbf;background-color:rgba(0,124,191,0.1);pointer-events:none;z-index:9999;`;
      canvas.appendChild(box);
      const onMouseMove = (e2: MouseEvent) => {
        if (!startPoint || !box) return;
        const currentPoint = [e2.clientX, e2.clientY];
        const rect = canvas.getBoundingClientRect();
        const minX = Math.min(startPoint[0], currentPoint[0]) - rect.left;
        const minY = Math.min(startPoint[1], currentPoint[1]) - rect.top;
        const maxX = Math.max(startPoint[0], currentPoint[0]) - rect.left;
        const maxY = Math.max(startPoint[1], currentPoint[1]) - rect.top;
        box.style.left = minX + 'px';
        box.style.top = minY + 'px';
        box.style.width = (maxX - minX) + 'px';
        box.style.height = (maxY - minY) + 'px';
      };
      const onMouseUp = (e3: MouseEvent) => {
        if (!startPoint || !box) return;
        const endPoint = [e3.clientX, e3.clientY];
        const rect = canvas.getBoundingClientRect();
        const sw = map.unproject([
          Math.min(startPoint[0], endPoint[0]) - rect.left,
          Math.max(startPoint[1], endPoint[1]) - rect.top
        ]);
        const ne = map.unproject([
          Math.max(startPoint[0], endPoint[0]) - rect.left,
          Math.min(startPoint[1], endPoint[1]) - rect.top
        ]);
        const bounds = new mapboxgl.LngLatBounds(sw, ne);
        if (boxZoomType === 'in') {
          map.fitBounds(bounds, { padding: 20 });
        } else if (boxZoomType === 'out') {
          const currentBounds = map.getBounds();
          const currentZoom = map.getZoom();
          if (currentBounds) {
            const selectedArea = (ne.lng - sw.lng) * (ne.lat - sw.lat);
            const currentArea = (currentBounds.getEast() - currentBounds.getWest()) * (currentBounds.getNorth() - currentBounds.getSouth());
            if (selectedArea > 0 && currentArea > 0) {
              const zoomDelta = Math.log2(selectedArea / currentArea);
              const newZoom = Math.max(0, currentZoom + zoomDelta - 1);
              map.easeTo({ zoom: newZoom, center: bounds.getCenter() });
            }
          }
        }
        canvas.removeChild(box);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        map.dragPan.enable();
        exitBoxZoom();
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
    canvas.addEventListener('mousedown', onMouseDown);
  };

  const exitBoxZoom = () => {
    isBoxZooming = false; boxZoomType = null;
    boxZoomInBtn.style.setProperty('background-color', 'white', 'important');
    boxZoomInBtn.style.setProperty('color', '#374151', 'important');
    boxZoomOutBtn.style.setProperty('background-color', 'white', 'important');
    boxZoomOutBtn.style.setProperty('color', '#374151', 'important');
    map.getCanvasContainer().style.cursor = '';
    map.dragPan.enable();
    map.boxZoom.enable();
  };

  boxZoomInBtn.addEventListener('click', () => startBoxZoom('in'));
  boxZoomOutBtn.addEventListener('click', () => startBoxZoom('out'));

  (window as any).boxZoomControls = { boxZoomInBtn, boxZoomOutBtn };
}

export function createHorizontalControlBar(map: mapboxgl.Map, draw: MapboxDraw) {
  const controlBar = document.createElement('div');
  controlBar.className = 'horizontal-control-bar';
  controlBar.style.cssText = `
    position: absolute; top: 10px; left: calc(50% - 200px); transform: translateX(-50%);
    display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.9);
    backdrop-filter: blur(10px); border-radius: 8px; padding: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1500;
  `;

  const navGroup = document.createElement('div');
  navGroup.className = 'mapboxgl-ctrl-group';
  navGroup.style.cssText = `display:flex;border-radius:6px;overflow:hidden;margin:0;`;
  const zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'mapboxgl-ctrl-icon mapboxgl-ctrl-zoom-in';
  zoomInBtn.title = '放大';
  zoomInBtn.innerHTML = '+';
  zoomInBtn.style.cssText = `background:white;border:none;width:29px;height:29px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:bold;color:#374151;`;
  zoomInBtn.addEventListener('click', () => map.zoomIn());
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'mapboxgl-ctrl-icon mapboxgl-ctrl-zoom-out';
  zoomOutBtn.title = '缩小';
  zoomOutBtn.innerHTML = '−';
  zoomOutBtn.style.cssText = zoomInBtn.style.cssText;
  zoomOutBtn.addEventListener('click', () => map.zoomOut());
  navGroup.appendChild(zoomInBtn);
  navGroup.appendChild(zoomOutBtn);
  controlBar.appendChild(navGroup);

  const divider1 = document.createElement('div');
  divider1.style.cssText = `width:1px;height:24px;background:rgba(0,0,0,0.1);margin:0 4px;`;
  controlBar.appendChild(divider1);

  const boxZoomControls = (window as any).boxZoomControls;
  if (boxZoomControls) {
    const boxZoomGroup = document.createElement('div');
    boxZoomGroup.className = 'mapboxgl-ctrl-group';
    boxZoomGroup.style.cssText = `display:flex;border-radius:6px;overflow:hidden;margin:0;`;
    boxZoomGroup.appendChild(boxZoomControls.boxZoomInBtn);
    boxZoomGroup.appendChild(boxZoomControls.boxZoomOutBtn);
    controlBar.appendChild(boxZoomGroup);
    const divider2 = document.createElement('div');
    divider2.style.cssText = divider1.style.cssText;
    controlBar.appendChild(divider2);
  }

  const drawControl = document.querySelector('.mapboxgl-ctrl-top-left .mapboxgl-ctrl-group');
  if (drawControl) {
    const drawClone = drawControl.cloneNode(true) as HTMLElement;
    drawClone.style.cssText = `display:flex;border-radius:6px;overflow:hidden;margin:0;`;
    const buttons = drawClone.querySelectorAll('button');
    const originalButtons = drawControl.querySelectorAll('button');
    let currentDrawMode: string | null = null;
    let currentDrawButton: HTMLElement | null = null;
    buttons.forEach((button, index) => {
      const originalButton = originalButtons[index];
      if (!originalButton) return;
      button.addEventListener('click', () => {
        (originalButton as HTMLElement).click();
        let buttonMode = ''; let isDrawingButton = false;
        if (button.classList.contains('mapbox-gl-draw_point')) { buttonMode = 'draw_point'; isDrawingButton = true; }
        else if (button.classList.contains('mapbox-gl-draw_line_string') || button.classList.contains('mapbox-gl-draw_line') || (button as any).title?.includes('线') || (button as any).title?.includes('line')) { buttonMode = 'draw_line_string'; isDrawingButton = true; }
        else if (button.classList.contains('mapbox-gl-draw_polygon')) { buttonMode = 'draw_polygon'; isDrawingButton = true; }
        if (isDrawingButton) {
          if (currentDrawButton === button && currentDrawMode === buttonMode) {
            currentDrawMode = null; currentDrawButton = null; button.classList.remove('active'); draw.changeMode('simple_select');
          } else {
            currentDrawMode = buttonMode; currentDrawButton = button as HTMLElement;
            buttons.forEach(btn => {
              if (btn.classList.contains('mapbox-gl-draw_point') || btn.classList.contains('mapbox-gl-draw_line_string') || btn.classList.contains('mapbox-gl-draw_line') || btn.classList.contains('mapbox-gl-draw_polygon') || (btn as any).title?.includes('线') || (btn as any).title?.includes('点') || (btn as any).title?.includes('面')) {
                btn.classList.remove('active');
              }
            });
            button.classList.add('active');
          }
        } else if (button.classList.contains('mapbox-gl-draw_trash')) {
          currentDrawMode = null; currentDrawButton = null;
          buttons.forEach(btn => {
            if (btn.classList.contains('mapbox-gl-draw_point') || btn.classList.contains('mapbox-gl-draw_line_string') || btn.classList.contains('mapbox-gl-draw_line') || btn.classList.contains('mapbox-gl-draw_polygon') || (btn as any).title?.includes('线') || (btn as any).title?.includes('点') || (btn as any).title?.includes('面')) {
              btn.classList.remove('active');
            }
          });
        }
      });
    });
    map.on('draw.create', () => {
      if (currentDrawMode && currentDrawButton) {
        setTimeout(() => {
          if (currentDrawMode) { currentDrawButton?.classList.add('active'); draw.changeMode(currentDrawMode as any); }
        }, 50);
      }
    });
    map.on('draw.update', () => {
      if (currentDrawMode === 'draw_line_string' && currentDrawButton) {
        setTimeout(() => currentDrawButton?.classList.add('active'), 10);
      }
    });
    map.on('draw.modechange', (e: any) => {
      if (e.mode === 'simple_select' && !currentDrawMode) {
        buttons.forEach(btn => {
          if (btn.classList.contains('mapbox-gl-draw_point') || btn.classList.contains('mapbox-gl-draw_line_string') || btn.classList.contains('mapbox-gl-draw_line') || btn.classList.contains('mapbox-gl-draw_polygon') || (btn as any).title?.includes('线') || (btn as any).title?.includes('点') || (btn as any).title?.includes('面')) {
            btn.classList.remove('active');
          }
        });
      }
      if (currentDrawMode && currentDrawButton) {
        buttons.forEach(btn => {
          if (btn.classList.contains('mapbox-gl-draw_point') || btn.classList.contains('mapbox-gl-draw_line_string') || btn.classList.contains('mapbox-gl-draw_line') || btn.classList.contains('mapbox-gl-draw_polygon') || (btn as any).title?.includes('线') || (btn as any).title?.includes('点') || (btn as any).title?.includes('面')) {
            btn.classList.remove('active');
          }
        });
        currentDrawButton.classList.add('active');
      }
    });
    const stateChecker = setInterval(() => {
      if (currentDrawMode && currentDrawButton && !currentDrawButton.classList.contains('active')) {
        currentDrawButton.classList.add('active');
      }
    }, 100);
    const originalRemove = drawClone.remove;
    drawClone.remove = function(this: any) { clearInterval(stateChecker); return originalRemove.call(this); };
    controlBar.appendChild(drawClone);
  }

  const mapContainer = document.getElementById('map-container');
  if (mapContainer) { mapContainer.appendChild(controlBar); }

  const originalDrawControl = document.querySelector('.mapboxgl-ctrl-top-left') as HTMLElement;
  if (originalDrawControl) originalDrawControl.style.display = 'none';

  const barCompass = new mapboxgl.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: false });
  const compassEl = barCompass.onAdd(map) as HTMLElement;
  compassEl.style.marginLeft = '6px';
  controlBar.appendChild(compassEl);
}

/**
 * 启动一次性框选，完成后回调返回 bounds（LngLatBoundsLike）
 */
export function selectBBox(
  map: mapboxgl.Map,
  onComplete: (bounds: mapboxgl.LngLatBoundsLike) => void
) {
  const canvas = map.getCanvasContainer();
  let startPoint: [number, number] | null = null;
  let box: HTMLElement | null = null;
  const onMouseDown = (e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    map.dragPan.disable();
    startPoint = [e.clientX, e.clientY];
    box = document.createElement('div');
    box.style.cssText = `position:absolute;border:2px dashed #10b981;background-color:rgba(16,185,129,0.1);pointer-events:none;z-index:9999;`;
    canvas.appendChild(box);
    const onMouseMove = (e2: MouseEvent) => {
      if (!startPoint || !box) return;
      const rect = canvas.getBoundingClientRect();
      const minX = Math.min(startPoint[0], e2.clientX) - rect.left;
      const minY = Math.min(startPoint[1], e2.clientY) - rect.top;
      const maxX = Math.max(startPoint[0], e2.clientX) - rect.left;
      const maxY = Math.max(startPoint[1], e2.clientY) - rect.top;
      box.style.left = minX + 'px';
      box.style.top = minY + 'px';
      box.style.width = (maxX - minX) + 'px';
      box.style.height = (maxY - minY) + 'px';
    };
    const onMouseUp = (e3: MouseEvent) => {
      if (!startPoint || !box) return;
      const rect = canvas.getBoundingClientRect();
      const sw = map.unproject([
        Math.min(startPoint[0], e3.clientX) - rect.left,
        Math.max(startPoint[1], e3.clientY) - rect.top
      ]);
      const ne = map.unproject([
        Math.max(startPoint[0], e3.clientX) - rect.left,
        Math.min(startPoint[1], e3.clientY) - rect.top
      ]);
      const bounds = new mapboxgl.LngLatBounds(sw, ne);
      canvas.removeChild(box);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      map.dragPan.enable();
      onComplete(bounds);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };
  canvas.addEventListener('mousedown', onMouseDown, { once: true });
}


