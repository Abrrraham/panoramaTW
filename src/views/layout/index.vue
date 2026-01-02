<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { Icon } from '@iconify/vue';
import html2canvas from 'html2canvas';
import JsPDF from 'jspdf';
import MapFrame from './components/MapFrame.vue';

// 路由
const router = useRouter();

// 页面设置
const pageSettings = reactive({
  size: 'A4',
  orientation: 'portrait' as 'portrait' | 'landscape',
  width: 794, // A4宽度(像素)
  height: 1123 // A4高度(像素)
});

// 纸张尺寸（96dpi）
const PAGE_SIZES_PX: Record<string, { width: number; height: number }> = {
  A4: { width: 794, height: 1123 }, // 8.27 × 11.69 in
  A3: { width: 1123, height: 1587 }, // 11.69 × 16.54 in
  A2: { width: 1587, height: 2245 }, // 16.54 × 23.39 in
  Letter: { width: 816, height: 1056 } // 8.5 × 11 in
};

// 切换纸张大小时，更新画布像素尺寸（保持 portrait 为基准）
watch(
  () => pageSettings.size,
  newSize => {
    if (newSize === 'custom') return;
    const preset = PAGE_SIZES_PX[newSize] || PAGE_SIZES_PX.A4;
    pageSettings.width = preset.width;
    pageSettings.height = preset.height;
  }
);

// 如果从主图传来bbox参数，自动插入一个地图框并标注范围说明
const route = useRoute();
const searchQS = new URLSearchParams(location.search);
const bboxRef = ref<{ minx: number; miny: number; maxx: number; maxy: number } | null>(null);
const readBBoxFromRoute = () => {
  const minx = Number((route.query.minx as string) ?? searchQS.get('minx'));
  const miny = Number((route.query.miny as string) ?? searchQS.get('miny'));
  const maxx = Number((route.query.maxx as string) ?? searchQS.get('maxx'));
  const maxy = Number((route.query.maxy as string) ?? searchQS.get('maxy'));
  const ok = [minx, miny, maxx, maxy].every(v => Number.isFinite(v));
  bboxRef.value = ok ? { minx, miny, maxx, maxy } : null;
};
readBBoxFromRoute();
const hasBBox = computed(() => Boolean(bboxRef.value));

// 打印/画布 DPI（CSS 像素）
const PRINT_DPI = 96;
// 后端或路由提供的真实比例尺分母（1:denominator）
const scaleDenominator = ref<number | null>(null);
function readScaleFromRouteOrSession() {
  const qsScale = Number((route.query.scale as string) ?? searchQS.get('scale'));
  if (Number.isFinite(qsScale) && qsScale > 0) {
    scaleDenominator.value = qsScale;
    return;
  }
  const ss = Number(sessionStorage.getItem('layout_scale_denominator') || '');
  if (Number.isFinite(ss) && ss > 0) {
    scaleDenominator.value = ss;
  }
}
readScaleFromRouteOrSession();

// 面板输入绑定：比例尺分母(1:N)
const scaleDenominatorValue = computed<number | null>({
  get() {
    return scaleDenominator.value ?? null;
  },
  set(val) {
    const v = Number(val);
    if (Number.isFinite(v) && v > 0) {
      scaleDenominator.value = v;
      try {
        sessionStorage.setItem('layout_scale_denominator', String(v));
      } catch {}
    } else {
      scaleDenominator.value = null;
      try {
        sessionStorage.removeItem('layout_scale_denominator');
      } catch {}
    }
  }
});

// 为 AInputNumber 提供 string|number，避免传递 null
const scaleInputValue = computed<string | number>(() => {
  return scaleDenominatorValue.value === null ? '' : scaleDenominatorValue.value;
});
function onScaleInputChange(val: any) {
  if (val === '' || val === null || val === undefined) {
    scaleDenominatorValue.value = null;
    return;
  }
  const n = Number(val);
  scaleDenominatorValue.value = Number.isFinite(n) && n > 0 ? n : null;
}

// 预留：如需使用外部静态底图，可在此实现（当前未使用以避免 noUnusedLocals 报错）

// 注意：不要在 layoutElements 定义前写入，它会导致“Cannot access before initialization”

// 布局元素接口
interface LayoutElement {
  id: string;
  type: 'map' | 'legend' | 'scalebar' | 'north' | 'text';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fontSize?: number;
  color?: string;
}

// 布局元素数组
const layoutElements = ref<LayoutElement[]>([]);
const selectedElement = ref<LayoutElement | null>(null);
const canvasRef = ref<HTMLElement>();
// 图例项：来源于主地图勾选的图层标题
const legendItems = ref<{ key: string; title: string }[]>([]);
const legendColors = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#14b8a6'];

const selectElement = (element: LayoutElement) => {
  selectedElement.value = element;
};

const deselectElement = () => {
  selectedElement.value = null;
};

// 根据比例或 bbox+地图框估算：每像素对应的真实米数
function metersPerPixelForLayout(): number | null {
  if (scaleDenominator.value && scaleDenominator.value > 0) {
    return (0.0254 / PRINT_DPI) * scaleDenominator.value;
  }
  if (bboxRef.value) {
    const b = bboxRef.value;
    const mapEl = layoutElements.value.find(el => el.type === 'map');
    if (!mapEl || mapEl.width <= 0) return null;
    const centerLat = (b.miny + b.maxy) / 2;
    const metersPerDegreeLon = 111320 * Math.cos((centerLat * Math.PI) / 180);
    const widthMeters = Math.max(1e-6, Math.abs(b.maxx - b.minx)) * metersPerDegreeLon;
    return widthMeters / mapEl.width;
  }
  return null;
}

// 选取“1/2/5×10^n”中不超过 total 的最大值
function pickNiceDistance(totalMeters: number): number {
  if (totalMeters <= 0 || !Number.isFinite(totalMeters)) return 0;
  const exponent = Math.floor(Math.log10(totalMeters));
  const base = 10 ** exponent;
  const candidates = [1, 2, 5].map(m => m * base).filter(c => c <= totalMeters);
  if (candidates.length) return candidates[candidates.length - 1];
  const fallback = [0.5 * base, 0.2 * base].filter(c => c <= totalMeters);
  return fallback.length ? fallback[0] : totalMeters;
}

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '';
  if (meters >= 1000) {
    const km = meters / 1000;
    const val = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
    return `${val} km`;
  }
  return `${Math.round(meters)} m`;
}

function getScaleBarInnerWidthPx(element: LayoutElement): number {
  const mpp = metersPerPixelForLayout();
  if (!mpp) return element.width;
  const totalMeters = mpp * element.width;
  const niceTotal = pickNiceDistance(totalMeters);
  const px = niceTotal / mpp;
  return Math.min(px, element.width);
}

function getScaleBarLabels(element: LayoutElement): { mid: string; end: string } {
  const mpp = metersPerPixelForLayout();
  if (!mpp) return { mid: '', end: '' };
  const totalMeters = mpp * element.width;
  const niceTotal = pickNiceDistance(totalMeters);
  return {
    mid: formatDistance(niceTotal / 2),
    end: formatDistance(niceTotal)
  };
}

// MapFrame 组件引用集合（按元素 id 存放）
const mapFrameRefs = new Map<string, any>();
function setMapFrameRef(id: string, el: any) {
  if (el) {
    mapFrameRefs.set(id, el);
  } else {
    mapFrameRefs.delete(id);
  }
}

// 导出前：将所有 MapFrame 转换为快照覆盖，避免 html2canvas 无法捕获 WebGL
async function prepareMapSnapshots() {
  const tasks: Promise<any>[] = [];
  mapFrameRefs.forEach(cmp => {
    if (cmp && typeof cmp.snapshot === 'function') {
      tasks.push(cmp.snapshot());
    }
  });
  if (tasks.length) {
    await Promise.allSettled(tasks);
  }
}

// 导出后：恢复 MapFrame 的实时渲染
function restoreMapSnapshots() {
  mapFrameRefs.forEach(cmp => {
    if (cmp && typeof cmp.restore === 'function') {
      cmp.restore();
    }
  });
}

// 如果有 bbox，在挂载后注入元素，避免临时性 TDZ 错误
onMounted(() => {
  // 尝试从 sessionStorage 恢复图例信息（来源于主地图的勾选列表）
  try {
    const keys = JSON.parse(sessionStorage.getItem('layout_checked_keys') || '[]') as string[];
    const layerTree = JSON.parse(sessionStorage.getItem('layout_layer_tree') || '[]') as {
      key: string;
      title: string;
    }[];
    const setKeys = new Set(keys || []);
    legendItems.value = layerTree.filter(it => setKeys.has(String(it.key)));
  } catch (e) {
    console.warn('加载图例数据失败', e);
    legendItems.value = [];
  }

  if (hasBBox.value) {
    const b = bboxRef.value!;
    const mapEl: LayoutElement = {
      id: `map_auto_${Date.now()}`,
      type: 'map',
      name: '地图框',
      x: 60,
      y: 80,
      width: pageSettings.width - 120,
      height: pageSettings.height - 220
    };
    layoutElements.value.push(mapEl);
    layoutElements.value.push({
      id: `text_bbox_${Date.now()}`,
      type: 'text',
      name: '范围说明',
      x: 60,
      y: pageSettings.height - 120,
      width: pageSettings.width - 120,
      height: 40,
      content: `范围: ${b.minx.toFixed(5)}, ${b.miny.toFixed(5)}  —  ${b.maxx.toFixed(5)}, ${b.maxy.toFixed(5)}`,
      fontSize: 12,
      color: '#111111'
    });
  }
});

// 当路由参数变化时，更新 bbox 文本、比例，并强制静态图刷新
watch(
  () => route.fullPath,
  () => {
    readBBoxFromRoute();
    readScaleFromRouteOrSession();
    const b = bboxRef.value;
    const text = layoutElements.value.find(el => el.type === 'text' && el.name === '范围说明');
    if (b && text) {
      text.content = `范围: ${b.minx.toFixed(5)}, ${b.miny.toFixed(5)}  —  ${b.maxx.toFixed(5)}, ${b.maxy.toFixed(5)}`;
    }
  }
);

// 模板相关
const selectedTemplate = ref('');

// 拖拽相关
const isDragging = ref(false);
const isResizing = ref(false);
const dragStartPos = ref({ x: 0, y: 0, elementX: 0, elementY: 0, elementW: 0, elementH: 0 });
const resizeDirection = ref('');

// 调整步进与最小尺寸（更顺滑、直觉）
const RESIZE_STEP = 1; // 1px 精细步进
const RESIZE_SENS = 0.1; // 缩放灵敏度（越小越慢）
const MIN_WIDTH = 120;
const MIN_HEIGHT = 80;

function toStepped(value: number) {
  return Math.round(value / RESIZE_STEP) * RESIZE_STEP;
}

// 画布样式
const canvasStyle = computed(() => {
  const width = pageSettings.orientation === 'portrait' ? pageSettings.width : pageSettings.height;
  const height = pageSettings.orientation === 'portrait' ? pageSettings.height : pageSettings.width;

  return {
    width: `${width}px`,
    height: `${height}px`,
    minHeight: `${height}px`
  };
});

// 获取元素图标
const getElementIcon = (type: string) => {
  const icons = {
    map: 'material-symbols:map-outline',
    legend: 'material-symbols:format-list-bulleted',
    scalebar: 'material-symbols:straighten',
    north: 'material-symbols:navigation-outline',
    text: 'material-symbols:text-fields'
  };
  return icons[type as keyof typeof icons] || 'material-symbols:help-outline';
};

// 获取元素样式
const getElementStyle = (element: LayoutElement) => {
  return {
    left: `${element.x}px`,
    top: `${element.y}px`,
    width: `${element.width}px`,
    height: `${element.height}px`
  };
};

// 生成唯一ID
const generateId = () => {
  return `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// 添加地图框
const addMapFrame = () => {
  const newElement: LayoutElement = {
    id: generateId(),
    type: 'map',
    name: '地图框',
    x: 50,
    y: 50,
    width: 400,
    height: 300
  };
  layoutElements.value.push(newElement);
  selectElement(newElement);
};

// 添加图例
const addLegend = () => {
  const newElement: LayoutElement = {
    id: generateId(),
    type: 'legend',
    name: '图例',
    x: 500,
    y: 50,
    width: 150,
    height: 200
  };
  layoutElements.value.push(newElement);
  selectElement(newElement);
};

// 添加比例尺
const addScaleBar = () => {
  const newElement: LayoutElement = {
    id: generateId(),
    type: 'scalebar',
    name: '比例尺',
    x: 50,
    y: 400,
    width: 120,
    height: 40
  };
  layoutElements.value.push(newElement);
  selectElement(newElement);
};

// 添加指北针
const addNorthArrow = () => {
  const newElement: LayoutElement = {
    id: generateId(),
    type: 'north',
    name: '指北针',
    x: 600,
    y: 300,
    width: 60,
    height: 80
  };
  layoutElements.value.push(newElement);
  selectElement(newElement);
};

// 添加文本框
const addTextBox = () => {
  const newElement: LayoutElement = {
    id: generateId(),
    type: 'text',
    name: '文本框',
    x: 200,
    y: 400,
    width: 200,
    height: 50,
    content: '输入文本内容',
    fontSize: 14,
    color: '#000000'
  };
  layoutElements.value.push(newElement);
  selectElement(newElement);
};

// 移除元素
const removeElement = (elementId: string) => {
  layoutElements.value = layoutElements.value.filter(el => el.id !== elementId);
  if (selectedElement.value?.id === elementId) {
    selectedElement.value = null;
  }
};

// 更新元素位置
const updateElementPosition = () => {
  // 位置已通过v-model自动更新
};

// 更新元素大小
const updateElementSize = () => {
  // 大小已通过v-model自动更新
};

// 更新元素内容
const updateElementContent = () => {
  // 内容已通过v-model自动更新
};

// 更新元素样式
const updateElementStyle = () => {
  // 样式已通过v-model自动更新
};

// 开始拖拽
const startDrag = (event: MouseEvent, element: LayoutElement) => {
  isDragging.value = true;
  dragStartPos.value = {
    x: event.clientX,
    y: event.clientY,
    elementX: element.x,
    elementY: element.y,
    elementW: element.width,
    elementH: element.height
  };
  selectElement(element);
};

// 开始调整大小
const startResize = (event: MouseEvent, element: LayoutElement, direction: string) => {
  isResizing.value = true;
  resizeDirection.value = direction;
  dragStartPos.value = {
    x: event.clientX,
    y: event.clientY,
    elementX: element.x,
    elementY: element.y,
    elementW: element.width,
    elementH: element.height
  };
  selectElement(element);
};

// 鼠标移动处理
const handleMouseMove = (event: MouseEvent) => {
  if (!selectedElement.value) return;

  const deltaX = event.clientX - dragStartPos.value.x;
  const deltaY = event.clientY - dragStartPos.value.y;

  if (isDragging.value) {
    selectedElement.value.x = dragStartPos.value.elementX + deltaX;
    selectedElement.value.y = dragStartPos.value.elementY + deltaY;
  } else if (isResizing.value) {
    const dir = resizeDirection.value;
    const s = dragStartPos.value;
    const el = selectedElement.value;
    const effectiveDX = toStepped(deltaX * RESIZE_SENS);
    const effectiveDY = toStepped(deltaY * RESIZE_SENS);

    // 基于起始状态计算目标矩形，确保锚点为相对边/角
    let newX = s.elementX;
    let newY = s.elementY;
    let newW = s.elementW;
    let newH = s.elementH;

    // 水平方向
    if (dir.includes('e')) {
      // 右边拉伸：宽度增大
      newW = s.elementW + effectiveDX;
    }
    if (dir.includes('w')) {
      // 左边拉伸：宽度减小，x 右移
      newW = s.elementW - effectiveDX;
      newX = s.elementX + effectiveDX;
    }
    // 垂直方向
    if (dir.includes('s')) {
      // 下边拉伸：高度增大
      newH = s.elementH + effectiveDY;
    }
    if (dir.includes('n')) {
      // 上边拉伸：高度减小，y 下移
      newH = s.elementH - effectiveDY;
      newY = s.elementY + effectiveDY;
    }

    // 约束最小宽高，并在左/上拉伸时修正位置避免漂移
    if (newW < MIN_WIDTH) {
      if (dir.includes('w')) {
        // 可应用的最小偏移量
        const applied = s.elementW - MIN_WIDTH;
        newX = s.elementX + applied;
      }
      newW = MIN_WIDTH;
    }
    if (newH < MIN_HEIGHT) {
      if (dir.includes('n')) {
        const applied = s.elementH - MIN_HEIGHT;
        newY = s.elementY + applied;
      }
      newH = MIN_HEIGHT;
    }

    el.x = newX;
    el.y = newY;
    el.width = newW;
    el.height = newH;
  }
};

// 鼠标释放处理
const handleMouseUp = () => {
  isDragging.value = false;
  isResizing.value = false;
  resizeDirection.value = '';
};

// 导出为PNG
const exportAsPNG = async () => {
  if (!canvasRef.value) return;

  try {
    await prepareMapSnapshots();
    const canvas = await html2canvas(canvasRef.value, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true
    });

    const link = document.createElement('a');
    link.download = `layout_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();

    message.success('PNG导出成功！');
  } catch (error) {
    console.error('PNG导出失败:', error);
    message.error('PNG导出失败，请重试');
  } finally {
    restoreMapSnapshots();
  }
};

// 导出为PDF
const exportAsPDF = async () => {
  if (!canvasRef.value) return;

  try {
    await prepareMapSnapshots();
    const canvas = await html2canvas(canvasRef.value, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true
    });

    const imgData = canvas.toDataURL('image/png');
    const pdfW = pageSettings.orientation === 'portrait' ? pageSettings.width : pageSettings.height;
    const pdfH = pageSettings.orientation === 'portrait' ? pageSettings.height : pageSettings.width;
    const pdf = new JsPDF({ orientation: pageSettings.orientation, unit: 'px', format: [pdfW, pdfH] });

    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    pdf.save(`layout_${Date.now()}.pdf`);

    message.success('PDF导出成功！');
  } catch (error) {
    console.error('PDF导出失败:', error);
    message.error('PDF导出失败，请重试');
  } finally {
    restoreMapSnapshots();
  }
};

// 预定义模板
const layoutTemplates = {
  standard: [
    {
      id: 'map_1',
      type: 'map' as const,
      name: '地图框',
      x: 50,
      y: 80,
      width: 500,
      height: 400
    },
    {
      id: 'legend_1',
      type: 'legend' as const,
      name: '图例',
      x: 580,
      y: 80,
      width: 150,
      height: 200
    },
    {
      id: 'scalebar_1',
      type: 'scalebar' as const,
      name: '比例尺',
      x: 50,
      y: 500,
      width: 120,
      height: 40
    },
    {
      id: 'north_1',
      type: 'north' as const,
      name: '指北针',
      x: 650,
      y: 300,
      width: 60,
      height: 80
    },
    {
      id: 'title_1',
      type: 'text' as const,
      name: '标题',
      x: 200,
      y: 30,
      width: 300,
      height: 40,
      content: '地图标题',
      fontSize: 24,
      color: '#000000'
    }
  ],
  detailed: [
    {
      id: 'map_1',
      type: 'map' as const,
      name: '主地图',
      x: 50,
      y: 100,
      width: 400,
      height: 350
    },
    {
      id: 'map_2',
      type: 'map' as const,
      name: '概览图',
      x: 480,
      y: 100,
      width: 200,
      height: 150
    },
    {
      id: 'legend_1',
      type: 'legend' as const,
      name: '图例',
      x: 480,
      y: 270,
      width: 200,
      height: 180
    },
    {
      id: 'scalebar_1',
      type: 'scalebar' as const,
      name: '比例尺',
      x: 50,
      y: 470,
      width: 120,
      height: 40
    },
    {
      id: 'north_1',
      type: 'north' as const,
      name: '指北针',
      x: 620,
      y: 470,
      width: 60,
      height: 80
    },
    {
      id: 'title_1',
      type: 'text' as const,
      name: '主标题',
      x: 200,
      y: 30,
      width: 300,
      height: 40,
      content: '详细地图布局',
      fontSize: 24,
      color: '#000000'
    },
    {
      id: 'subtitle_1',
      type: 'text' as const,
      name: '副标题',
      x: 200,
      y: 70,
      width: 300,
      height: 25,
      content: '比例尺 1:10000',
      fontSize: 14,
      color: '#666666'
    }
  ],
  simple: [
    {
      id: 'map_1',
      type: 'map' as const,
      name: '地图框',
      x: 100,
      y: 100,
      width: 600,
      height: 450
    },
    {
      id: 'title_1',
      type: 'text' as const,
      name: '标题',
      x: 250,
      y: 40,
      width: 300,
      height: 40,
      content: '简洁地图',
      fontSize: 28,
      color: '#000000'
    }
  ]
};

// 应用模板
const applyTemplate = (templateName: string) => {
  if (!templateName || !layoutTemplates[templateName as keyof typeof layoutTemplates]) {
    return;
  }

  const template = layoutTemplates[templateName as keyof typeof layoutTemplates];
  layoutElements.value = template.map(element => ({
    ...element,
    id: generateId() // 生成新的唯一ID
  }));

  selectedElement.value = null;
  const templateLabels: Record<string, string> = {
    standard: '\u6807\u51C6',
    detailed: '\u8BE6\u7EC6',
    simple: '\u7B80\u6D01'
  };
  const templateLabel = templateLabels[templateName] ?? templateName;
  message.success(`\u5DF2\u5E94\u7528${templateLabel}\u6A21\u677F`);
};

// 保存为模板
const saveAsTemplate = () => {
  if (layoutElements.value.length === 0) {
    message.warning('当前布局为空，无法保存为模板');
    return;
  }

  // 这里可以实现保存到本地存储或服务器
  const templateData = JSON.stringify(layoutElements.value, null, 2);
  console.log('保存的模板数据:', templateData);

  // 创建下载链接
  const blob = new Blob([templateData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `layout_template_${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);

  message.success('模板已保存并下载');
};

// 返回主界面
const goBack = () => {
  router.push('/main');
};

// 组件挂载
onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});

// 组件卸载
onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <div class="layout-view relative h-full w-full overflow-hidden bg-gray-900">
    <!-- 布局视图工具栏 -->
    <div
      class="layout-toolbar h-12 flex items-center gap-4 border-b border-gray-800 bg-gray-900 px-4 text-gray-100 shadow-sm"
    >
      <!-- 页面设置 -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-200 font-medium">页面设置:</span>
        <ASelect v-model:value="pageSettings.size" class="w-32" size="small">
          <ASelectOption value="A4">A4</ASelectOption>
          <ASelectOption value="A3">A3</ASelectOption>
          <ASelectOption value="A2">A2</ASelectOption>
          <ASelectOption value="Letter">Letter</ASelectOption>
          <ASelectOption value="custom">自定义</ASelectOption>
        </ASelect>

        <ASelect v-model:value="pageSettings.orientation" class="w-24" size="small">
          <ASelectOption value="portrait">竖向</ASelectOption>
          <ASelectOption value="landscape">横向</ASelectOption>
        </ASelect>
      </div>

      <ADivider type="vertical" />

      <!-- 布局元素工具 -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-200 font-medium">插入:</span>
        <ATooltip title="添加地图框">
          <AButton size="small" @click="addMapFrame">
            <template #icon>
              <Icon icon="material-symbols:map-outline" />
            </template>
          </AButton>
        </ATooltip>

        <ATooltip title="添加图例">
          <AButton size="small" @click="addLegend">
            <template #icon>
              <Icon icon="material-symbols:format-list-bulleted" />
            </template>
          </AButton>
        </ATooltip>

        <ATooltip title="添加比例尺">
          <AButton size="small" @click="addScaleBar">
            <template #icon>
              <Icon icon="material-symbols:straighten" />
            </template>
          </AButton>
        </ATooltip>

        <ATooltip title="添加指北针">
          <AButton size="small" @click="addNorthArrow">
            <template #icon>
              <Icon icon="material-symbols:navigation-outline" />
            </template>
          </AButton>
        </ATooltip>

        <ATooltip title="添加文本">
          <AButton size="small" @click="addTextBox">
            <template #icon>
              <Icon icon="material-symbols:text-fields" />
            </template>
          </AButton>
        </ATooltip>
      </div>

      <ADivider type="vertical" />

      <!-- 模板功能 -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-200 font-medium">模板:</span>
        <ASelect
          v-model:value="selectedTemplate"
          class="w-32"
          size="small"
          @change="value => applyTemplate(value as string)"
        >
          <ASelectOption value="">自定义</ASelectOption>
          <ASelectOption value="standard">标准地图</ASelectOption>
          <ASelectOption value="detailed">详细地图</ASelectOption>
          <ASelectOption value="simple">简洁地图</ASelectOption>
        </ASelect>

        <ATooltip title="保存当前布局为模板">
          <AButton size="small" @click="saveAsTemplate">
            <template #icon>
              <Icon icon="material-symbols:save-outline" />
            </template>
          </AButton>
        </ATooltip>
      </div>

      <ADivider type="vertical" />

      <!-- 导出功能 -->
      <div class="flex items-center gap-2">
        <ATooltip title="导出为PNG">
          <AButton type="primary" size="small" class="export-btn" @click="exportAsPNG">
            <template #icon>
              <Icon icon="material-symbols:download" />
            </template>
            PNG
          </AButton>
        </ATooltip>

        <ATooltip title="导出为PDF">
          <AButton type="primary" size="small" class="export-btn" @click="exportAsPDF">
            <template #icon>
              <Icon icon="material-symbols:picture-as-pdf" />
            </template>
            PDF
          </AButton>
        </ATooltip>
      </div>

      <div class="flex-1"></div>

      <!-- 关闭按钮 -->
      <AButton class="close-btn" @click="goBack">
        <template #icon>
          <Icon icon="material-symbols:close" />
        </template>
        关闭布局视图
      </AButton>
    </div>

    <!-- 主要布局区域 -->
    <div class="layout-main h-[calc(100%-3rem)] flex">
      <!-- 左侧属性面板 -->
      <div class="layout-properties w-80 overflow-y-auto border-r border-gray-800 bg-gray-900 text-gray-100">
        <div class="p-4">
          <h3 class="mb-4 text-lg text-gray-200 font-medium">布局元素</h3>

          <!-- 布局元素列表 -->
          <div class="space-y-2">
            <div
              v-for="element in layoutElements"
              :key="element.id"
              class="cursor-pointer border rounded p-3 transition-colors"
              :class="[
                selectedElement?.id === element.id
                  ? 'border-blue-400 bg-blue-900/30'
                  : 'border-gray-700 hover:border-gray-600'
              ]"
              @click="selectElement(element)"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon :icon="getElementIcon(element.type)" class="text-gray-300" />
                  <span class="text-sm text-gray-200 font-medium">{{ element.name }}</span>
                </div>
                <AButton size="small" danger @click.stop="removeElement(element.id)">
                  <Icon icon="material-symbols:delete-outline" />
                </AButton>
              </div>
            </div>
          </div>

          <!-- 选中元素的属性编辑 -->
          <div v-if="selectedElement" class="mt-6">
            <h4 class="text-md mb-3 text-gray-200 font-medium">属性设置</h4>

            <!-- 位置和大小 -->
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="text-xs text-gray-400">X坐标</label>
                  <AInputNumber
                    v-model:value="selectedElement.x"
                    size="small"
                    class="w-full"
                    @change="updateElementPosition"
                  />
                </div>
                <div>
                  <label class="text-xs text-gray-400">Y坐标</label>
                  <AInputNumber
                    v-model:value="selectedElement.y"
                    size="small"
                    class="w-full"
                    @change="updateElementPosition"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="text-xs text-gray-400">宽度</label>
                  <AInputNumber
                    v-model:value="selectedElement.width"
                    size="small"
                    class="w-full"
                    @change="updateElementSize"
                  />
                </div>
                <div>
                  <label class="text-xs text-gray-400">高度</label>
                  <AInputNumber
                    v-model:value="selectedElement.height"
                    size="small"
                    class="w-full"
                    @change="updateElementSize"
                  />
                </div>
              </div>

              <!-- 比例尺元素特殊属性 -->
              <div v-if="selectedElement.type === 'scalebar'" class="mt-2">
                <label class="text-xs text-gray-400">比例尺分母 (1:N)</label>
                <AInputNumber
                  :value="scaleInputValue"
                  size="small"
                  class="w-full"
                  :min="10"
                  :step="10"
                  @update:value="onScaleInputChange"
                />
                <div class="mt-1 text-xs text-gray-500">未设置时将根据框选范围与地图框估算</div>
              </div>

              <!-- 文本元素特殊属性 -->
              <div v-if="selectedElement.type === 'text'">
                <label class="text-xs text-gray-400">文本内容</label>
                <ATextarea
                  v-model:value="selectedElement.content"
                  size="small"
                  :rows="3"
                  @change="updateElementContent"
                />

                <div class="grid grid-cols-2 mt-2 gap-2">
                  <div>
                    <label class="text-xs text-gray-400">字体大小</label>
                    <AInputNumber
                      v-model:value="selectedElement.fontSize"
                      size="small"
                      class="w-full"
                      :min="8"
                      :max="72"
                      @change="updateElementStyle"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-gray-400">字体颜色</label>
                    <input
                      v-model="selectedElement.color"
                      type="color"
                      class="h-8 w-full border rounded"
                      @change="updateElementStyle"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 中间画布区域 -->
      <div class="layout-canvas flex-1 overflow-auto p-8">
        <div class="flex justify-center">
          <!-- 页面画布 -->
          <div
            ref="canvasRef"
            class="page-canvas relative bg-white shadow-lg"
            :class="[pageSettings.orientation === 'portrait' ? 'canvas-portrait' : 'canvas-landscape']"
            :style="canvasStyle"
            @click="deselectElement"
          >
            <!-- 布局元素渲染 -->
            <div
              v-for="element in layoutElements"
              :key="element.id"
              class="layout-element absolute cursor-move select-none"
              :class="[selectedElement?.id === element.id ? 'selected' : '']"
              :style="getElementStyle(element)"
              @click.stop="selectElement(element)"
              @mousedown="startDrag($event, element)"
            >
              <!-- 地图框 -->
              <div
                v-if="element.type === 'map'"
                class="map-frame h-full flex items-center justify-center overflow-hidden border-2 border-gray-400 border-dashed bg-gray-50"
              >
                <template v-if="hasBBox">
                  <MapFrame
                    :ref="(el: any) => setMapFrameRef(element.id, el)"
                    :bbox="bboxRef!"
                    :width="element.width"
                    :height="element.height"
                  />
                </template>
                <template v-else>
                  <div class="text-center text-gray-600">
                    <Icon icon="material-symbols:map-outline" class="mb-2 text-4xl" />
                    <div class="text-sm">地图视图</div>
                    <div class="text-xs text-gray-500">{{ element.width }} × {{ element.height }}</div>
                  </div>
                </template>
              </div>

              <!-- 图例 -->
              <div
                v-else-if="element.type === 'legend'"
                class="legend-frame h-full border border-gray-300 bg-white p-2"
              >
                <div class="mb-2 text-sm font-bold">图例</div>
                <div v-if="legendItems.length" class="space-y-1">
                  <div v-for="(item, idx) in legendItems" :key="item.key" class="flex items-center gap-2">
                    <div class="h-3 w-4" :style="{ backgroundColor: legendColors[idx % legendColors.length] }"></div>
                    <span class="text-xs">{{ item.title }}</span>
                  </div>
                </div>
                <div v-else class="text-xs text-gray-500">未选中任何图层</div>
              </div>

              <!-- 比例尺 -->
              <div v-else-if="element.type === 'scalebar'" class="scalebar-frame h-full flex items-center">
                <div class="scale-bar w-full">
                  <div class="flex" :style="{ width: getScaleBarInnerWidthPx(element) + 'px' }">
                    <div class="h-4 flex-1 border-b border-l border-t border-black bg-white"></div>
                    <div class="h-4 flex-1 border-b border-t border-black bg-black"></div>
                    <div class="h-4 flex-1 border-b border-t border-black bg-white"></div>
                    <div class="h-4 flex-1 border-b border-r border-t border-black bg-black"></div>
                  </div>
                  <div
                    class="mt-1 flex justify-between text-xs"
                    :style="{ width: getScaleBarInnerWidthPx(element) + 'px' }"
                  >
                    <span>0</span>
                    <span>{{ getScaleBarLabels(element).mid }}</span>
                    <span>{{ getScaleBarLabels(element).end }}</span>
                  </div>
                </div>
              </div>

              <!-- 指北针 -->
              <div v-else-if="element.type === 'north'" class="north-arrow h-full flex items-center justify-center">
                <div class="text-center">
                  <Icon icon="material-symbols:navigation-outline" class="rotate-0 transform text-3xl text-black" />
                  <div class="mt-1 text-xs text-black">N</div>
                </div>
              </div>

              <!-- 文本框 -->
              <div v-else-if="element.type === 'text'" class="text-element h-full overflow-hidden">
                <div
                  :style="{
                    fontSize: element.fontSize + 'px',
                    color: element.color,
                    lineHeight: '1.2'
                  }"
                >
                  {{ element.content }}
                </div>
              </div>

              <!-- 选中状态的调整句柄 -->
              <div v-if="selectedElement?.id === element.id" class="resize-handles">
                <div class="handle handle-nw" @mousedown.stop="startResize($event, element, 'nw')"></div>
                <div class="handle handle-ne" @mousedown.stop="startResize($event, element, 'ne')"></div>
                <div class="handle handle-sw" @mousedown.stop="startResize($event, element, 'sw')"></div>
                <div class="handle handle-se" @mousedown.stop="startResize($event, element, 'se')"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-btn {
  height: 36px;
  padding: 0 14px;
  line-height: 1;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.close-btn {
  height: 36px;
  padding: 0 14px;
  line-height: 1;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.layout-element {
  border: 1px solid transparent;
  transition: border-color 0.2s;
}

.layout-element:hover {
  border-color: #d1d5db;
}

.layout-element.selected {
  border-color: #3b82f6;
  border-width: 2px;
}

.resize-handles {
  position: absolute;
  inset: -4px;
  pointer-events: none;
}

.handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #3b82f6;
  border: 1px solid #ffffff;
  border-radius: 50%;
  pointer-events: all;
  cursor: grab;
}

.handle:active {
  cursor: grabbing;
}

.handle-nw {
  top: 0;
  left: 0;
  cursor: nw-resize;
}

.handle-ne {
  top: 0;
  right: 0;
  cursor: ne-resize;
}

.handle-sw {
  bottom: 0;
  left: 0;
  cursor: sw-resize;
}

.handle-se {
  bottom: 0;
  right: 0;
  cursor: se-resize;
}

.canvas-portrait {
  width: 794px;
  min-height: 1123px;
}

.canvas-landscape {
  width: 1123px;
  min-height: 794px;
}

.page-canvas {
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}
</style>
