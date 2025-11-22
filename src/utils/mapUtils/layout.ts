/**
 * 保障地图容器尺寸与可见性，处理初始高度与窗口变化
 */
export function ensureMapContainerSize(map: any) {
  try {
    const host = document.getElementById('map-container') as HTMLElement | null;
    const view = document.getElementById('map-view') as HTMLElement | null;
    if (view && view.clientHeight < 200) {
      if (host) host.style.height = '100vh';
      view.style.minHeight = '400px';
    }
    const adjustContainerHeight = () => {
      const h = document.getElementById('map-container') as HTMLElement | null;
      const v = document.getElementById('map-view') as HTMLElement | null;
      if (!h || !v) return;
      const top = h.getBoundingClientRect().top;
      const height = Math.max(300, window.innerHeight - top);
      h.style.height = height + 'px';
      v.style.height = height + 'px';
      v.style.width = '100%';
      map.resize();
    };
    adjustContainerHeight();
    window.addEventListener('resize', adjustContainerHeight);
    const el = view as HTMLElement;
    const ensureResize = () => {
      if (el && el.clientWidth > 0 && el.clientHeight > 0) { map.resize(); return true; }
      return false;
    };
    ensureResize();
    const ro = new ResizeObserver(() => map.resize());
    if (el) ro.observe(el);
    const t = setInterval(() => { if (ensureResize()) clearInterval(t); }, 200);
    return () => {
      window.removeEventListener('resize', adjustContainerHeight);
      try { ro.disconnect(); } catch {}
      clearInterval(t);
    };
  } catch {}
  return () => {};
}












