<template>
  <div
    class="w-full h-full relative overflow-hidden"
    :style="{ width: width + 'px', height: height + 'px' }"
  >
    <!-- 实时地图容器 -->
    <div
      v-show="!snapshotUrl"
      ref="mapEl"
      class="w-full h-full"
    ></div>
    <!-- 导出用快照覆盖层 -->
    <img
      v-if="snapshotUrl"
      :src="snapshotUrl"
      alt="map snapshot"
      class="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface BBox {
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
}

const props = withDefaults(
  defineProps<{
    bbox: BBox;
    width: number;
    height: number;
    styleUrl?: string;
  }>(),
  {
    styleUrl: 'mapbox://styles/mapbox/standard'
  }
);

const mapEl = ref<HTMLElement>();
let map: mapboxgl.Map | null = null;
const snapshotUrl = ref<string>('');

function initMap() {
  if (!mapEl.value) return;

  // 读取 token
  const token =
    (import.meta as any).env.VITE_MAPBOX_ACCESS_TOKEN ||
    'pk.eyJ1IjoiYWJyYWhhbW1tIiwiYSI6ImNtZDl4d2w0bTBhY20ycnF5em5oYXdqNmcifQ.x95HbEdqkB7accFJAeIKBA';
  mapboxgl.accessToken = token;

  // 从 sessionStorage 读取主图样式（包含后端图层与可见性）
  let styleFromSession: any | null = null;
  try {
    const styleStr = sessionStorage.getItem('layout_map_style');
    if (styleStr) styleFromSession = JSON.parse(styleStr);
  } catch {}

  // 创建地图（启用 preserveDrawingBuffer 以便导出快照）
  map = new mapboxgl.Map({
    container: mapEl.value,
    style: styleFromSession || props.styleUrl,
    center: [(props.bbox.minx + props.bbox.maxx) / 2, (props.bbox.miny + props.bbox.maxy) / 2],
    zoom: 8,
    interactive: false,
    preserveDrawingBuffer: true,
    attributionControl: false,
    logoPosition: 'bottom-right'
  });

  map.once('load', () => {
    fitToBBox();
  });
}

function fitToBBox() {
  if (!map) return;
  const bounds = new mapboxgl.LngLatBounds(
    [props.bbox.minx, props.bbox.miny],
    [props.bbox.maxx, props.bbox.maxy]
  );
  map.fitBounds(bounds, { padding: 20, animate: false });
}

async function snapshot() {
  if (!map) return;
  await nextTick();
  try {
    // 生成地图画布快照
    const dataUrl = map.getCanvas().toDataURL('image/png');
    snapshotUrl.value = dataUrl;
  } catch (e) {
    // 若跨域或其他原因导致失败，忽略并保持地图渲染
    console.warn('MapFrame snapshot failed:', e);
  }
}

function restore() {
  snapshotUrl.value = '';
}

onMounted(() => {
  initMap();
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});

// 当 bbox 或尺寸变化时，重新适配
watch(
  () => [props.bbox.minx, props.bbox.miny, props.bbox.maxx, props.bbox.maxy, props.width, props.height],
  () => {
    restore();
    // 等待容器尺寸稳定后再适配
    setTimeout(() => fitToBBox(), 0);
  }
);

defineExpose({
  snapshot,
  restore
});
</script>

<style scoped>
</style>





