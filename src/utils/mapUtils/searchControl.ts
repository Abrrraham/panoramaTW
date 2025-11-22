import mapboxgl from 'mapbox-gl';
import { MapboxSearchBox } from '@mapbox/search-js-web';

/**
 * 初始化右上角搜索控件，支持坐标直达与地图上自定义坐标覆盖层
 */
export function setupSearchControl(map: mapboxgl.Map) {
  try {
    const searchBox = new MapboxSearchBox();
    (searchBox as any).accessToken = mapboxgl.accessToken;
    (searchBox as any).options = {
      language: 'zh-Hans',
      limit: 10,
      proximity: map.getCenter()
    };
    (searchBox as any).placeholder = '输入地名/地址/POI,或经度,纬度';

    try {
      (searchBox as any).mapboxgl = mapboxgl;
      (searchBox as any).marker = { color: '#007cbf' };
      (searchBox as any).bindMap?.(map);
      (searchBox as any).componentOptions = { allowReverse: true, flipCoordinates: false, flyTo: false };
    } catch (bindErr) {
      console.warn('搜索控件绑定地图失败，但不影响基本搜索:', bindErr);
    }

    map.addControl(searchBox as any, 'top-right');

    // 画布覆盖：坐标标注浮层
    let searchOverlayEl: HTMLElement | null = null;
    let searchOverlayCenter: mapboxgl.LngLatLike | null = null;

    const updateSearchOverlay = () => {
      if (!searchOverlayEl || !searchOverlayCenter) return;
      const p = map.project(searchOverlayCenter as any);
      searchOverlayEl.style.left = '0px';
      searchOverlayEl.style.top = '0px';
      searchOverlayEl.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    };

    const removeSearchOverlay = () => {
      if (searchOverlayEl) {
        searchOverlayEl.remove();
        searchOverlayEl = null;
        searchOverlayCenter = null;
        map.off('move', updateSearchOverlay);
        map.off('zoom', updateSearchOverlay);
        map.off('resize', updateSearchOverlay);
      }
    };

    const ensureOverlay = (center: [number, number]) => {
      searchOverlayCenter = new mapboxgl.LngLat(center[0], center[1]);
      if (!searchOverlayEl) {
        searchOverlayEl = document.createElement('div');
        searchOverlayEl.style.position = 'absolute';
        searchOverlayEl.style.zIndex = '1700';
        searchOverlayEl.style.pointerEvents = 'none';
        searchOverlayEl.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:auto;">
            <div style="width:14px;height:14px;border-radius:50%;background:#007cbf;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.3)"></div>
            <div style="position:relative;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:8px 28px 8px 10px;box-shadow:0 4px 12px rgba(0,0,0,.15);font-size:13px;line-height:1.4;white-space:nowrap;color:#111;min-width:140px;">
              <button data-role="close" title="关闭" style="position:absolute;top:4px;right:4px;width:18px;height:18px;border:none;background:transparent;color:#666;cursor:pointer;font-size:16px;line-height:18px;padding:0;">×</button>
              经度: <b data-role="lng"></b><br/>
              纬度: <b data-role="lat"></b>
            </div>
          </div>`;
        const host = document.getElementById('map-view');
        host?.appendChild(searchOverlayEl);
        map.on('move', updateSearchOverlay);
        map.on('zoom', updateSearchOverlay);
        map.on('resize', updateSearchOverlay);
        const closeBtn = searchOverlayEl.querySelector('[data-role="close"]') as HTMLElement | null;
        closeBtn?.addEventListener('click', (ev: MouseEvent) => { ev.stopPropagation(); removeSearchOverlay(); });
      }
      const lngEl = searchOverlayEl!.querySelector('[data-role="lng"]') as HTMLElement;
      const latEl = searchOverlayEl!.querySelector('[data-role="lat"]') as HTMLElement;
      lngEl.textContent = center[0].toFixed(6);
      latEl.textContent = center[1].toFixed(6);
      updateSearchOverlay();
    };

    const handleCoordJump = (lon: number, lat: number) => {
      if (Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90) {
        const center: [number, number] = [lon, lat];
        map.flyTo({ center, zoom: 5 });
        ensureOverlay(center);
      }
    };

    const inputEl = (searchBox as any).input as HTMLInputElement | undefined;
    inputEl?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const val = inputEl.value || '';
      const match = val.match(/^\s*(-?\d+(?:\.\d+)?)\s*[ ,\t]+\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (match) {
        const lon = parseFloat(match[1]);
        const lat = parseFloat(match[2]);
        handleCoordJump(lon, lat);
      }
    });

    (searchBox as any).addEventListener('retrieve', (ev: any) => {
      const detail = ev?.detail;
      const feature = detail?.features?.[0] || detail?.feature || detail;
      const bbox = feature?.properties?.bbox || feature?.bbox;
      const coords = feature?.geometry?.coordinates || feature?.properties?.coordinates;
      if (bbox && Array.isArray(bbox) && bbox.length === 4) {
        const bounds = new mapboxgl.LngLatBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
        map.fitBounds(bounds, { padding: 40, maxZoom: 16 });
        const c = bounds.getCenter();
        ensureOverlay([c.lng, c.lat]);
      } else if (Array.isArray(coords) && coords.length >= 2) {
        const center: [number, number] = [Number(coords[0]), Number(coords[1])];
        map.flyTo({ center, zoom: 13 });
        ensureOverlay(center);
      }
    });

    // 控件容器位置与下拉层级
    setTimeout(() => {
      const topRight = document.querySelector('#map-view .mapboxgl-ctrl-top-right') as HTMLElement | null;
      if (topRight) {
        topRight.style.zIndex = '1500';
        topRight.style.position = 'absolute';
        topRight.style.top = '10px';
        topRight.style.right = 'calc(20% + 50px)';
        topRight.style.left = 'auto';
        topRight.style.display = 'flex';
        topRight.style.alignItems = 'center';
        topRight.style.height = 'auto';
      }
      const searchEl = document.querySelector('#map-view .mapbox-search-box') as HTMLElement | null;
      if (searchEl) {
        searchEl.style.width = '300px';
        searchEl.style.maxWidth = '300px';
        searchEl.style.position = 'relative';
        searchEl.style.right = 'auto';
        searchEl.style.top = 'auto';
        searchEl.style.left = '0';
        searchEl.style.zIndex = '1500';

        const setDropdownZIndex = () => {
          const dropdownSelectors = [
            '.mapbox-search-listbox', '.mapbox-search-suggestions', '.mapbox-search-results', '.mapbox-search-box-results', '[role="listbox"]',
            '[data-testid="suggestions"]', '[data-testid="results"]', '.suggestions', '.mapbox-search-listbox-container', '.mapbox-search-results-list',
            '.dropdown', '.dropdown-menu', '.autocomplete', '.autocomplete-suggestions', '.search-suggestions', '.search-results',
            '[class*="mapbox"][class*="search"]', '[class*="suggestion"]', '[class*="result"]'
          ];
          dropdownSelectors.forEach(selector => {
            try { searchEl.querySelectorAll(selector).forEach((el: any) => { el.style.zIndex = '1600'; el.style.position = 'relative'; }); } catch {}
          });
          dropdownSelectors.forEach(selector => {
            try {
              document.querySelectorAll(selector).forEach((el: any) => {
                const rect = searchEl.getBoundingClientRect();
                const elRect = el.getBoundingClientRect();
                if (Math.abs(elRect.left - rect.left) < 100 && elRect.top >= rect.bottom - 50) {
                  el.style.zIndex = '1600';
                  el.style.position = 'absolute';
                }
              });
            } catch {}
          });
          const bodyDropdowns = document.querySelectorAll('div[style*="position"], div[class*="dropdown"], div[class*="suggestion"], div[class*="result"]');
          bodyDropdowns.forEach((el: any) => {
            try {
              const rect = searchEl.getBoundingClientRect();
              const elRect = el.getBoundingClientRect();
              if (elRect.top >= rect.bottom - 20 && Math.abs(elRect.left - rect.left) < 150 && elRect.width > 100) {
                el.style.zIndex = '1600';
              }
            } catch {}
          });
        };
        setDropdownZIndex();
        const searchObserver = new MutationObserver(setDropdownZIndex);
        searchObserver.observe(searchEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
        const bodyObserver = new MutationObserver(() => setTimeout(setDropdownZIndex, 10));
        bodyObserver.observe(document.body, { childList: true, subtree: true });
        const searchInput = searchEl.querySelector('input');
        if (searchInput) {
          searchInput.addEventListener('focus', () => setTimeout(setDropdownZIndex, 100));
          searchInput.addEventListener('input', () => setTimeout(setDropdownZIndex, 200));
        }
        const intervalCheck = setInterval(setDropdownZIndex, 1000);
        const cleanup = () => { searchObserver.disconnect(); bodyObserver.disconnect(); clearInterval(intervalCheck); };
        window.addEventListener('beforeunload', cleanup);
      }
    }, 150);
  } catch (e) {
    console.error('添加搜索框失败:', e);
  }
}



