<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import mapboxgl from 'mapbox-gl';
import { SimpleScrollbar } from '@sa/materials';
import type { AntTreeNodeCheckedEvent, AntTreeNodeDropEvent, TreeProps } from 'ant-design-vue/es/tree';
import { AppstoreFilled, DatabaseFilled, DeleteOutlined, TableOutlined, ZoomInOutlined, PlusOutlined } from '@ant-design/icons-vue';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type { Feature, GeoJsonProperties, Geometry } from 'geojson';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { setupSearchControl } from '@/utils/mapUtils/searchControl';
import { addScaleControl, bindScaleAutoFade } from '@/utils/mapUtils/scaleControl';
import { ensureMapContainerSize } from '@/utils/mapUtils/layout';
import { bindTileErrorOnceTip } from '@/utils/mapUtils/errorHandler';
import MapScene from '@/utils/mapUtils/mapModels/MapScene';
import { initData, extractNodes, convertToTreeData } from '@/utils/mapUtils/layerData';
import { addBoxZoomControls, createHorizontalControlBar, selectBBox } from '@/utils/mapUtils/controls';
import { zoomToLayer } from '@/utils/mapUtils/zoomToLayer';
import AttributeTableWindow from '@/components/common/AttributeTableWindow.vue';
import { explodeFeatureToPartFeatures } from '@/utils/mapUtils/featureUtils';
import ChatBox from './modules/chat-box.vue';
import type { ChatBoxExpose } from './modules/chat-box.vue';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuthStore } from '@/store/modules/auth';
import { getAuthorization } from '@/service/request/shared';
import { mapRequestHead } from '@/service/request';

mapboxgl.accessToken =
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ||
  'pk.eyJ1IjoiYWJyYWhhbW1tIiwiYSI6ImNtZDl4d2w0bTBhY20ycnF5em5oYXdqNmcifQ.x95HbEdqkB7accFJAeIKBA';

let map: mapboxgl.Map;
const draw: MapboxDraw = new MapboxDraw({
  displayControlsDefault: true
});

let scene: MapScene | null = null;

// 搜索覆盖层已移至 utils/mapUtils/searchControl.ts

// const mapContainer = ref<HTMLElement | null>(null);
const mapViewEl = ref<HTMLElement | null>(null);
const chatBoxRef = ref<ChatBoxExpose | null>(null);
const dataTree = ref<Map.LayerData[]>([]);
const treeData = ref<TreeProps['treeData']>([]);
const layerTreeData = ref<TreeProps['treeData']>([]);

const expandedKeys = ref<string[]>([]);
const checkedKeys = ref<string[]>([]);

const drawerOpen = ref(true);

const drawData = ref<Feature<Geometry, GeoJsonProperties> | null>(null);

// 路由
const router = useRouter();

// 自定义右键菜单状态
const customContextMenuVisible = ref(false);
const customContextMenuPosition = ref({ x: 0, y: 0 });
const currentContextNode = ref<any>(null);

// 图层管理右键菜单状态
const layerContextMenuVisible = ref(false);
const layerContextMenuPosition = ref({ x: 0, y: 0 });
const currentContextLayer = ref<{ key: string; title: string } | null>(null);

// 错误提示去重逻辑已迁移到 errorHandler 模块

// 属性表相关
const attributeTableVisible = ref(false);
const selectedLayerId = ref<string>('');
const selectedLayerName = ref<string>('');

// 绘制要素相关
const selectedDrawFeatures = ref<Feature[]>([]);
const drawContextMenuVisible = ref(false);
const drawContextMenuPosition = ref({ x: 0, y: 0 });
const featureNameModalVisible = ref(false);
const featureName = ref<string>('');
// 存储绘制要素的属性数据
const drawFeaturesData = ref<Map<string, any[]>>(new Map());
// 右键过程中抑制选择变化（防止右键立即覆盖左键多选）
const suppressSelectionOnContext = ref(false);
// 最近一次稳定的选择快照（仅在非右键情形下更新）
const lastStableSelected = ref<Feature[]>([]);

const showDrawer = () => {
  drawerOpen.value = true;
};

// 处理右键菜单显示
const handleRightClickMenu = (event: MouseEvent, nodeData: any) => {
  console.log('Right click detected on:', nodeData.title, event);
  event.preventDefault();
  event.stopPropagation();
  
  // 设置菜单位置
  customContextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  };
  
  // 设置当前节点和显示菜单
  currentContextNode.value = nodeData;
  customContextMenuVisible.value = true;
  
  console.log('Custom context menu shown for:', nodeData.title);
};

// 处理数据目录右键菜单点击
const handleDataMenuClick = (menuKey: string) => {
  console.log(`数据目录菜单点击: ${menuKey} - ${currentContextNode.value?.title}`);
  
  if (menuKey === 'addToLayer' && currentContextNode.value) {
    // 调用添加图层的功能
    onContextMenuClick(currentContextNode.value.key, currentContextNode.value.title);
  }
  
  // 隐藏菜单
  customContextMenuVisible.value = false;
  currentContextNode.value = null;
};

// 点击其他地方隐藏菜单
const hideCustomContextMenu = () => {
  customContextMenuVisible.value = false;
  currentContextNode.value = null;
};

// 处理图层管理右键菜单显示
const handleLayerRightClick = (event: MouseEvent, layerKey: string, layerTitle: string) => {
  console.log('Layer right click detected:', layerKey, layerTitle, event);
  event.preventDefault();
  event.stopPropagation();
  
  // 设置菜单位置
  layerContextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  };
  
  // 设置当前图层和显示菜单
  currentContextLayer.value = { key: layerKey, title: layerTitle };
  layerContextMenuVisible.value = true;
  
  console.log('Layer context menu shown for:', layerTitle);
};

// 处理图层管理右键菜单点击
const handleLayerMenuClick = (menuKey: string) => {
  console.log(`图层管理菜单点击: ${menuKey} - ${currentContextLayer.value?.title}`);
  if (menuKey === 'removeLayer' && !isAdmin.value) {
    window.$message?.error('没有权限执行此操作');
    layerContextMenuVisible.value = false;
    currentContextLayer.value = null;
    return;
  }

  if (currentContextLayer.value) {
    // 调用原有的图层菜单处理函数
    onLayerContextMenuClick(menuKey, currentContextLayer.value.key, currentContextLayer.value.title);
  }
  
  // 隐藏菜单
  layerContextMenuVisible.value = false;
  currentContextLayer.value = null;
};

// 点击其他地方隐藏图层菜单
const hideLayerContextMenu = () => {
  layerContextMenuVisible.value = false;
  currentContextLayer.value = null;
};

const onContextMenuClick = (id: string, title: string) => {
  console.log(`右键添加图层: ${id} - ${title}`);
  console.log('当前scene对象:', scene);
  console.log('当前数据树:', dataTree.value);
  console.log('当前树形数据:', treeData.value);

  // 查找节点数据以确定类型
  const findNodeInTree = (nodes: Map.LayerData[], targetId: string): Map.LayerData | null => {
    for (const node of nodes) {
      if (node.id === targetId) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const found = findNodeInTree(node.children, targetId);
        if (found) return found;
      }
    }
    return null;
  };

  const nodeData = findNodeInTree(dataTree.value, id);
  console.log(`找到节点数据:`, nodeData);

  // 如果是 static 类型的资源，直接打开文件而不是作为图层
  if (nodeData?.category === 'static') {
    const fileUrl = `http://localhost:8765/api/v0/resource/static/getStaticFileByte/${id}`;
    window.open(fileUrl, '_blank');
    window.$message?.success(`正在打开文件: ${title}`);
    return;
  }

  // 检查scene是否已初始化
  if (!scene) {
    console.error('MapScene未初始化');
    window.$message?.error('地图场景未初始化，请稍后再试');
    return;
  }

  // 检查是否已经在图层管理面板中
  const existingLayer = layerTreeData.value?.find(item => item?.key === id);
  if (existingLayer) {
    console.log(`图层 ${id} 已存在于图层管理面板中`);
    // 如果已存在，确保勾选状态
    if (!checkedKeys.value.includes(id)) {
      checkedKeys.value.push(id);
    }
    return;
  }

  // 检查节点是否存在于scene中
  const existingNode = scene.findNodeById(id);
  console.log(`在scene中查找节点 ${id}:`, existingNode);

  // 加载图层节点
  const loadSuccess = scene.loadNode(id);
  console.log(`loadNode(${id}) 结果:`, loadSuccess);
  
  if (loadSuccess) {
    console.log(`图层 ${id} 加载成功，添加到图层管理面板`);
    // 添加到图层管理面板
    layerTreeData.value = [{ title, key: id, children: [] }, ...(layerTreeData.value || [])];
    // 设置为勾选状态
    checkedKeys.value.push(id);
    window.$message?.success(`已添加图层: ${title}`);
  } else {
    console.log(`图层 ${id} 加载失败或已经加载过`);
    // 即使加载失败，也可能是因为已经加载过，尝试添加到面板
    const node = scene.findNodeById(id);
    if (node) {
      console.log(`节点 ${id} 已存在，添加到图层管理面板`);
      layerTreeData.value = [{ title, key: id, children: [] }, ...(layerTreeData.value || [])];
      checkedKeys.value.push(id);
      // 确保图层可见
      scene.openNode(id);
      window.$message?.success(`已添加图层: ${title}`);
    } else {
      console.error(`节点 ${id} 不存在于scene中`);
      console.log('scene中的所有节点:', scene.nodes.map(n => ({ id: n.id, name: n.name, active: n.active })));
      window.$message?.warning('该图层数据未就绪或不可用');
    }
  }
};

const onLoadNodesByName = (input: { id: string; name: string }[]) => {
  input.forEach(item => {
    const nodeId = scene?.loadNodeByName(item.id);
    console.log(nodeId);
    if (nodeId) {
      layerTreeData.value = [{ title: item.name, key: nodeId, children: [] }, ...(layerTreeData.value || [])];
      checkedKeys.value.push(nodeId);
    }
  });
};

const onLayerTreeDrop = (info: AntTreeNodeDropEvent) => {
  if (!scene) return;

  const data = [...(layerTreeData.value || [])];
  const dragKey = String(info.dragNode.key);
  const dropKey = String(info.node.key);

  const dragIndex = data.findIndex(item => item?.key === dragKey);
  const dropIndex = data.findIndex(item => item?.key === dropKey);

  // 先从旧位置移除
  const [removed] = data.splice(dragIndex, 1);

  // 计算插入的新位置（树已禁止 dropPosition === 0）
  let newIndex = dropIndex;
  if (info.dropPosition === -1) newIndex = dropIndex;       // 上方
  else if (info.dropPosition === 1) newIndex = dropIndex + 1; // 下方

  // 插入到新位置
  data.splice(newIndex, 0, removed);

  // 仅用"新顺序中最近的上一个有效图层节点"作为锚点
  function findPrevValidId(index: number): string | null {
    for (let i = index - 1; i >= 0; i--) {
      const k = String(data[i]?.key);
      if (scene?.findNodeById(k)) return k;
    }
    return null;
  }
  const beforeId = findPrevValidId(newIndex);

  // 确保源/锚点节点已加载并可见
  if (beforeId) {
    scene.loadNode(beforeId);
    scene.openNode(beforeId);
  }
  scene.loadNode(dragKey);
  scene.openNode(dragKey);

  // 把拖拽图层移动到 beforeId 之前；如果 beforeId = null，则移到最顶层
  scene.moveNode(dragKey, beforeId);

  // 更新面板顺序
  layerTreeData.value = [...data];

  // 全量重排：按面板从下到上依次移到顶，确保压盖顺序一致
  const forceReorderByPanel = () => {
    const items = (layerTreeData.value || [])
      .map(it => String(it?.key))
      .filter(k => !!scene?.findNodeById(k)); // 过滤分组/无效节点
    for (let i = items.length - 1; i >= 0; i--) {
      const id = items[i];
      scene?.loadNode(id);
      scene?.openNode(id);
      scene?.moveNode(id, null); // null = 移到最顶
    }
  };

  // Draw 图层（gl-draw-）如需保留显示，将其作为整体块一起移动
  const moveDrawBlock = (anchorId: string | null) => {
    const m = scene?.map;
    if (!m) return;
    const ids = (m.getStyle().layers || []).map(l => l.id).filter(id => id.startsWith('gl-draw-'));
    ids.forEach(id => {
      if (anchorId) m.moveLayer(id, anchorId);
      else m.moveLayer(id);
    });
  };

  // 延迟到样式空闲后再统一重排，避免目标层尚未挂载
  const m = scene?.map;
  if (m) {
    m.once('idle', () => {
      forceReorderByPanel();

      // 若你没有调用 draw.deleteAll() 清掉 Draw 的渲染层，则同步移动它的块位置
      const panel = layerTreeData.value || [];
      const drawGroupIdx = panel.findIndex(it => it?.key === 'draw_features');
      if (drawGroupIdx !== -1) {
        let anchor: string | null = null;
        for (let i = drawGroupIdx + 1; i < panel.length; i++) {
          const k = String(panel[i]?.key);
          if (scene?.findNodeById(k)) { anchor = k; break; }
        }
        moveDrawBlock(anchor);
      }
    });
  }
};

const onLayerCheckClick = (_: any, e: AntTreeNodeCheckedEvent) => {
  const nodeId = String(e.node.key);
  console.log(`图层管理面板勾选状态变化: ${nodeId}, 勾选: ${e.checked}`);

  if (nodeId === 'draw_features') {
    // 处理绘制要素分组的勾选
    const drawGroup = layerTreeData.value?.find(item => item?.key === 'draw_features');
    console.log('绘制要素分组勾选状态变化:', { checked: e.checked, children: drawGroup?.children });
    
    if (drawGroup?.children) {
      if (e.checked) {
        // 显示所有绘制要素
        drawGroup.children.forEach(child => {
          const childId = String(child.key);
          console.log(`处理绘制要素: ${childId}, 当前checkedKeys:`, checkedKeys.value);
          
                  // 强制添加到checkedKeys并显示图层
        if (!checkedKeys.value.includes(childId)) {
          checkedKeys.value.push(childId);
        }
        
        // 强制更新checkedKeys状态
        checkedKeys.value = [...checkedKeys.value];
          
          // 对于绘制要素，需要先确保节点已加载，然后显示
          const node = scene?.findNodeById(childId);
          console.log(`节点状态: ${childId}`, { 
            exists: !!node, 
            active: node?.active, 
            layers: node?.layers?.length 
          });
          
          if (node) {
            if (!node.active) {
              // 如果节点存在但未激活，先加载再显示
              console.log(`加载并显示节点: ${childId}`);
              scene?.loadNode(childId);
            } else {
              // 如果节点已激活，直接显示
              console.log(`直接显示节点: ${childId}`);
              scene?.openNode(childId);
            }
            
            // 确保图层可见
            setTimeout(() => {
              const updatedNode = scene?.findNodeById(childId);
              if (updatedNode?.active) {
                console.log(`确保图层可见: ${childId}`);
                scene?.openNode(childId);
              }
            }, 100);
          } else {
            console.warn(`节点不存在: ${childId}`);
          }
        });
      } else {
        // 隐藏所有绘制要素
        drawGroup.children.forEach(child => {
          const childId = String(child.key);
          // 强制从checkedKeys中移除
          checkedKeys.value = checkedKeys.value.filter(key => key !== childId);
          scene?.closeNode(childId);
          console.log(`隐藏绘制要素: ${childId}`);
        });
      }
    }
  } else {
    // 处理单个图层的勾选
    if (e.checked) {
      // 先尝试加载图层（如果还未加载），然后显示
      const loadSuccess = scene?.loadNode(nodeId);
      if (loadSuccess) {
        console.log(`图层 ${nodeId} 首次加载成功`);
      } else {
        // 如果加载失败（可能已经加载过），则直接显示
        scene?.openNode(nodeId);
        console.log(`图层 ${nodeId} 设置为可见`);
        if (!scene?.isNodeActive(nodeId)) {
          window.$message?.warning('该图层数据未就绪或不可用');
        }
      }
    } else {
      // 隐藏图层但不移除
      scene?.closeNode(nodeId);
      console.log(`图层 ${nodeId} 设置为隐藏`);
    }
  }
};

 

/// /////////// 地图绘制 ///////////////
const startDraw = () => {
  if (draw.getAll()) {
    draw.deleteAll();
    draw.changeMode('draw_line_string');
  }
};

const finishDraw = () => {
  if (draw.getAll().features.length === 0) return;
  const drawFeature = draw.getAll().features[0];
  drawData.value = drawFeature;
  chatBoxRef.value?.processDraw(drawData.value.geometry);
  draw.changeMode('simple_select');
};

const addAnalysisResults = (results: { id: string; name: string; name_cn: string; feature: Feature }[]) => {
  if (!treeData.value?.find(item => item.title === '分析结果集')) {
    treeData.value?.push({
      key: 'analysis_result',
      title: '分析结果集',
      children: [],
      isLayer: false
    });
  }
  const resultList = treeData.value?.find(item => item.title === '分析结果集')?.children;
  results.forEach(result => {
    scene?.addTempNode(result.id, result.name, result.feature);
    if (scene?.loadNode(result.id)) {
      resultList?.push({
        key: result.id,
        title: result.name_cn,
        children: [],
        isLayer: true
      });
      layerTreeData.value = [{ title: result.name_cn, key: result.id, children: [] }, ...(layerTreeData.value || [])];
      checkedKeys.value.push(result.id);
    }
  });
};

// 右键图层管理界面的菜单处理
const onLayerContextMenuClick = async (menuKey: string, layerKey: string, layerTitle: string) => {
  console.log(`图层管理右键菜单: ${menuKey} - ${layerKey} - ${layerTitle}`);

  switch (menuKey) {
    case 'viewAttributes':
      selectedLayerId.value = layerKey;
      selectedLayerName.value = layerTitle;
      attributeTableVisible.value = true;
      break;
    case 'removeLayer':
      // 从图层管理面板移除图层
      if (layerKey === 'draw_features') {
        // 移除整个绘制要素分组及其所有子节点
        const drawGroup = layerTreeData.value?.find(item => item?.key === 'draw_features');
        const childIds = (drawGroup?.children || []).map(c => String(c.key));
        // 逐个从场景与本地缓存移除
        childIds.forEach(id => {
          scene?.removeNode(id);
          drawFeaturesData.value.delete(id);
          // 从勾选中移除
          checkedKeys.value = checkedKeys.value.filter(k => k !== id);
        });
        // 移除组节点
        layerTreeData.value = (layerTreeData.value || []).filter(item => item?.key !== 'draw_features');
        // 从勾选中移除组本身
        checkedKeys.value = checkedKeys.value.filter(k => k !== 'draw_features');
        // 若当前属性表指向组或其任一子节点，关闭
        if (
          selectedLayerId.value === 'draw_features' ||
          childIds.includes(selectedLayerId.value)
        ) {
          attributeTableVisible.value = false;
          selectedLayerId.value = '';
          selectedLayerName.value = '';
        }
        window.$message?.success('已移除绘制要素分组及其所有子图层');
      } else if (layerKey.startsWith('draw_')) {
        // 绘制要素：从绘制要素分组中移除
        const drawGroup = layerTreeData.value?.find(item => item?.key === 'draw_features');
        if (drawGroup?.children) {
          drawGroup.children = drawGroup.children.filter(child => child?.key !== layerKey);
          // 如果绘制要素分组为空，移除整个分组
          if (drawGroup.children.length === 0) {
            layerTreeData.value = layerTreeData.value?.filter(item => item?.key !== 'draw_features') || [];
          }
        }
        // 从本地数据存储中移除
        drawFeaturesData.value.delete(layerKey);
        // 从场景中完全移除
        scene?.removeNode(layerKey);
        // 从勾选里移除
        checkedKeys.value = checkedKeys.value.filter(key => key !== layerKey);
        // 如果属性窗在看这个层，关闭
        if (selectedLayerId.value === layerKey) {
          attributeTableVisible.value = false;
          selectedLayerId.value = '';
          selectedLayerName.value = '';
        }
      } else {
        // 普通图层：从图层管理面板移除
        layerTreeData.value = layerTreeData.value?.filter(item => item?.key !== layerKey) || [];
        // 隐藏图层但不完全移除（保持在scene中以便重新添加）
        scene?.closeNode(layerKey);
        // 从勾选状态中移除
        checkedKeys.value = checkedKeys.value.filter(key => key !== layerKey);
        // 如果属性窗在看这个层，关闭
        if (selectedLayerId.value === layerKey) {
          attributeTableVisible.value = false;
          selectedLayerId.value = '';
          selectedLayerName.value = '';
        }
      }
      window.$message?.success(`已从图层管理中移除 ${layerTitle}`);
      break;
    case 'zoomToLayer':
      // 缩放到图层
      await zoomToLayer(scene, map, layerKey, layerTitle);
      break;
    default:
      break;
  }
};

// 处理绘制要素右键菜单（使用稳定快照以防右键覆盖多选）
const handleDrawContextMenu = (e: mapboxgl.MapMouseEvent) => {
  e.preventDefault();
  // 在菜单处理开始即抑制选择变化
  suppressSelectionOnContext.value = true;
  // 优先使用最近一次稳定快照（左键多选完成时更新）
  const stable = lastStableSelected.value;
  const current = draw.getSelected().features;
  const features = stable.length > 0 ? stable : current;
  if (features.length > 0) {
    selectedDrawFeatures.value = features;
    const mouseEvent = e.originalEvent;
    drawContextMenuPosition.value = { x: mouseEvent.clientX, y: mouseEvent.clientY };
    drawContextMenuVisible.value = true;
  }
  // 在菜单完全关闭后再解除抑制，为保险这里不自动解除
};

// 关闭右键菜单
const closeDrawContextMenu = () => {
  drawContextMenuVisible.value = false;
  // 菜单关闭后再解除抑制，并同步一次稳定快照
  suppressSelectionOnContext.value = false;
  const selected = draw.getSelected();
  lastStableSelected.value = [...selected.features];
};

// 处理添加要素到图层
const handleAddFeatureToLayer = () => {
  drawContextMenuVisible.value = false;
  featureName.value = '';
  featureNameModalVisible.value = true;
};

// 确认添加要素到图层
const confirmAddFeatureToLayer = () => {
  if (!featureName.value.trim()) {
    window.$message?.warning('请输入要素名称');
    return;
  }

  // 为所有选中的要素创建带属性的新要素（Multi* 拆分为逐部件要素）
  const featuresWithAttributes = selectedDrawFeatures.value.flatMap((originalFeature, index) => {
    const nameWithIndex = selectedDrawFeatures.value.length > 1 
      ? `${featureName.value}_${index + 1}` 
      : featureName.value;
    return explodeFeatureToPartFeatures(originalFeature, nameWithIndex);
  });

  // 创建包含多个要素的GeoJSON FeatureCollection
  const featureCollection = {
    type: 'FeatureCollection',
    features: featuresWithAttributes
  };

  // 生成唯一图层ID
  const layerId = `draw_${Date.now()}`;
  
  // 保存所有要素的属性数据到本地存储
  const allProperties = featuresWithAttributes.map(feature => feature.properties);
  drawFeaturesData.value.set(layerId, allProperties);
  
  // 添加到场景中（使用FeatureCollection）
  scene?.addTempNodeFromCollection(layerId, featureName.value, featureCollection);
  
  // 加载并显示图层
  const loadSuccess = scene?.loadNode(layerId);
  console.log(`加载绘制要素图层: ${layerId}, 成功: ${loadSuccess}`);
  
  // 即使loadNode返回false，也要添加到图层管理（可能是已经加载过了）
  if (loadSuccess || scene?.findNodeById(layerId)) {
    // 添加到绘制要素分组
    if (!layerTreeData.value?.find(item => item?.key === 'draw_features')) {
      layerTreeData.value?.unshift({
        key: 'draw_features',
        title: '绘制要素',
        children: [],
        isLayer: false
      });
    }
    
    const drawGroup = layerTreeData.value?.find(item => item?.key === 'draw_features');
    drawGroup?.children?.push({
      key: layerId,
      title: `${featureName.value} (${featuresWithAttributes.length}个要素)`,
      isLayer: true
    });
    
    checkedKeys.value.push(layerId);
    
    // 确保节点状态正确
    const node = scene?.findNodeById(layerId);
    console.log(`绘制要素节点状态: ${layerId}`, { 
      exists: !!node, 
      active: node?.active, 
      layers: node?.layers?.length,
      featureCount: featuresWithAttributes.length
    });
    
    console.log('添加绘制要素到图层:', {
      id: layerId,
      name: featureName.value,
      featureCount: featuresWithAttributes.length,
      attributes: allProperties,
      data: drawFeaturesData.value.get(layerId)
    });
  } else {
    console.error(`加载绘制要素图层失败: ${layerId}`);
  }

  window.$message?.success(`已添加 ${selectedDrawFeatures.value.length} 个要素到图层 "${featureName.value}"`);
  featureNameModalVisible.value = false;
  
  // 清除绘制的要素（可选）
  // draw.deleteAll();
  draw.deleteAll(); // 清空Draw控件自带的gl-draw-*图层显示
};

// 取消添加要素到图层
const cancelAddFeatureToLayer = () => {
  featureNameModalVisible.value = false;
  featureName.value = '';
};

// 移至 utils/mapUtils/controls.ts -> addBoxZoomControls(map)

// 移至 utils/mapUtils/controls.ts -> createHorizontalControlBar(map, draw)

// 移至 utils/mapUtils/zoomToLayer.ts -> zoomToLayer(scene, map, layerKey, layerTitle)

onMounted(async () => {
  if (mapViewEl.value || document.getElementById('map-view')) {
    // 兼容合并后 DOM 变更：兜底解析容器
    const resolveContainer = (): HTMLElement => {
      let el = mapViewEl.value as HTMLElement | null;
      if (!el) el = document.getElementById('map-view') as HTMLElement | null;
      if (!el) {
        const parent = document.getElementById('map-container');
        el = document.createElement('div');
        el.id = 'map-view';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.position = 'relative';
        parent?.prepend(el);
      }
      return el!;
    };

    const mapContainerEl = resolveContainer();

  const backendPrefix = mapRequestHead;

  map = new mapboxgl.Map({
    container: mapContainerEl,
    style: 'mapbox://styles/mapbox/standard',
    center: [115.43530389617354, 7.325620166519911],
    zoom: 3.6,
    language: 'zh-Hans',
    transformRequest: (url: string) => {
      const isBackendRequest = url.startsWith(backendPrefix) || url.includes('/api/v0/');
      if (isBackendRequest) {
        const Authorization = getAuthorization();
        if (Authorization) {
          return {
            url,
            headers: {
              Authorization
            }
          };
        }
      }

      return { url };
    }
  });

    // 比例尺控件

    // 不再添加原有的导航控件，使用水平控制栏中的控件
    map.addControl(draw, 'top-left');

    // 容器自适应
    const disposeLayout = ensureMapContainerSize(map);
    onUnmounted(() => { try { disposeLayout(); } catch {} });

    // 搜索控件
    setupSearchControl(map);

    // 添加框选功能按钮
    addBoxZoomControls(map);

    setTimeout(() => {
      // 创建水平控制栏并重新排列控件
      createHorizontalControlBar(map, draw);
      
      // 调试：检查所有控件是否存在
      console.log('检查控件存在情况:');
      console.log('比例尺控件:', document.querySelector('.mapboxgl-ctrl-scale'));
      console.log('绘制控件:', document.querySelector('.mapboxgl-ctrl-top-left'));
      console.log('框选控件:', (window as any).boxZoomControls);
      console.log('水平控制栏:', document.querySelector('.horizontal-control-bar'));

      // 比例尺样式
      const scaleControl = document.querySelector('.mapboxgl-ctrl-scale');
      if (scaleControl) {
        // 移除父容器的原有定位
        const parentControl = scaleControl.parentElement as HTMLElement;
        if (parentControl) {
          parentControl.style.position = 'absolute';
          parentControl.style.left = '50%';
          parentControl.style.transform = 'translateX(-50%)';
          parentControl.style.bottom = '80px';
          parentControl.style.right = 'auto';
        }

        scaleControl.classList.add(
          'h-7', // height
          'bg-white', // 白色背景
          'bg-opacity-50', 
          'leading-5', 
          'text-center', 
          'text-sm', 
          'font-medium', 
          'text-gray-900', 
          'transition-all', 
          'duration-50', 
          'px-2', 
          'py-1', 
          'rounded-sm', 
          'border-b-2', 
          'border-l-0', 
          'border-r-0', 
          'border-black', 
          'relative', 
          'whitespace-nowrap', 
          'overflow-hidden', 
          'text-ellipsis', 
          'min-w-0', 
          'z-20' 
        );

        // 线段样式的刻度标记
        const style = document.createElement('style');
        style.textContent = `
          .mapboxgl-ctrl-scale::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            width: 2px;
            height: 50%;
            background-color: black;
          }
          .mapboxgl-ctrl-scale::after {
            content: '';
            position: absolute;
            right: 0;
            top: 50%;
            width: 2px;
            height: 50%;
            background-color: black;
          }
        `;
        document.head.appendChild(style);

        // 导航控件图标样式
        const navIconStyle = document.createElement('style');
        navIconStyle.textContent = `
          .mapboxgl-ctrl-zoom-in .mapboxgl-ctrl-icon,
          .mapboxgl-ctrl-zoom-out .mapboxgl-ctrl-icon {
            background-image: none !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 18px !important;
            font-weight: bold !important;
            color: #374151 !important;
          }
          
          .mapboxgl-ctrl-zoom-in .mapboxgl-ctrl-icon::before {
            content: '+' !important;
          }
          
          .mapboxgl-ctrl-zoom-out .mapboxgl-ctrl-icon::before {
            content: '−' !important;
          }
          /* 保留原生罗盘箭头与旋转行为，不做覆盖 */
        `;
        document.head.appendChild(navIconStyle);
      }

      // 导航控件样式 - 右上角，避开聊天框
      const navControl = document.querySelector('.mapboxgl-ctrl-top-right') as HTMLElement;
      if (navControl) {

        const navGroup = navControl.querySelector('.mapboxgl-ctrl-group');
        if (navGroup) {
          navGroup.classList.add(
            'shadow-lg', 
            'rounded-lg', 
            'border', 
            'border-gray-200', 
            'bg-white', 
            'overflow-hidden' 
          );

          // 导航按钮添加样式和图标
          const navButtons = navGroup.querySelectorAll('button');
          navButtons.forEach((button, index) => {
            button.classList.add(
              'bg-white', 
              'hover:bg-gray-100', 
              'transition-colors', 
              'duration-200', 
              'border-0', 
              'p-1', 
              'flex', 
              'items-center', 
              'justify-center', 
              'w-8', 
              'h-8', 
              'text-lg', 
              'font-bold', 
              'text-gray-700' 
            );

          // 手动添加图标内容（仅缩放按钮）。罗盘按钮保持原生箭头与旋转行为。
          if (index === 0) {
              // 放大按钮
              button.innerHTML = '+';
              button.title = '放大';
            } else if (index === 1) {
              // 缩小按钮
              button.innerHTML = '−';
              button.title = '缩小';
          }
          });
        }
      }

      // 绘制控件样式
      const drawControl = document.querySelector('.mapboxgl-ctrl-top-left') as HTMLElement;
      if (drawControl) {
        drawControl.style.left = '360px';
        drawControl.style.top = '5px';
        const drawGroup = drawControl.querySelector('.mapboxgl-ctrl-group');
        if (drawGroup) {
          drawGroup.classList.add(
            'shadow-lg', 
            'rounded-lg', 
            'border', 
            'border-gray-200', 
            'bg-white', 
            'overflow-hidden' 
          );

          // 按钮样式
          const buttons = drawGroup.querySelectorAll('button');
          buttons.forEach(button => {
            button.classList.add(
              'bg-white', 
              'hover:bg-gray-100', 
              'transition-colors', 
              'duration-200', 
              'border-0', 
              'p-1', 
              'flex', 
              'items-center', 
              'justify-center' 
            );
          });
        }
      }
    }, 100);

    // 添加绘制控件事件监听
    map.on('draw.selectionchange', () => {
      if (suppressSelectionOnContext.value) {
        console.log('右键阶段，忽略 selectionchange');
        return;
      }
      const selected = draw.getSelected();
      selectedDrawFeatures.value = selected.features;
      lastStableSelected.value = [...selected.features];
      console.log('选中绘制要素（稳定快照已更新）:', selected.features);
    });

    // 监听地图上的右键事件
    map.on('contextmenu', handleDrawContextMenu);
    
    // 点击地图其他地方关闭右键菜单
    map.on('click', closeDrawContextMenu);
    
    // 捕获阶段拦截容器上的右键按下/抬起，防止 Draw 在右键时改写选择（保留左键多选的结果）
    const containerEl = map.getCanvasContainer();
    if (containerEl) {
      const onPointerDownCapture = (evt: PointerEvent) => {
        if (evt.button === 2) {
          suppressSelectionOnContext.value = true;
          evt.stopPropagation();
        }
      };
      const onMouseDownCapture = (evt: MouseEvent) => {
        if (evt.button === 2) {
          suppressSelectionOnContext.value = true;
          evt.stopPropagation();
        }
      };
      const onPointerUpCapture = (evt: PointerEvent) => {
        if (evt.button === 2) {
          // 阻止右键抬起触发的选择逻辑
          evt.stopPropagation();
        }
      };
      const onMouseUpCapture = (evt: MouseEvent) => {
        if (evt.button === 2) {
          evt.stopPropagation();
        }
      };
      const onContextMenuCapture = (evt: MouseEvent) => {
        // 右键菜单阶段也维持抑制标志，避免迟到的 selectionchange 覆盖
        suppressSelectionOnContext.value = true;
      };
      containerEl.addEventListener('pointerdown', onPointerDownCapture, true);
      containerEl.addEventListener('mousedown', onMouseDownCapture, true);
      containerEl.addEventListener('pointerup', onPointerUpCapture, true);
      containerEl.addEventListener('mouseup', onMouseUpCapture, true);
      containerEl.addEventListener('contextmenu', onContextMenuCapture, true);
    }

    // 比例尺控件与自动淡出
    addScaleControl(map);
    const disposeScale = bindScaleAutoFade(map);
    onUnmounted(() => { try { disposeScale(); } catch {} });

    // 资源加载错误提示（一次性）
    const disposeError = bindTileErrorOnceTip(map);
    onUnmounted(() => { try { disposeError(); } catch {} });

    // 测试API连接
    try {
      const response = await fetch('http://localhost:8765/api/v0/node/layerNode/test');
      const healthStatus = await response.text();
      console.log('API健康检查:', healthStatus);
    } catch (error) {
      console.error('API连接失败:', error);
    }

    try {
      console.log('开始初始化地图数据...');
      const rootData = await initData();
      console.log('API返回的根数据:', rootData);
      
      dataTree.value = rootData.children || [];
      console.log('设置的dataTree:', dataTree.value);
      
      treeData.value = convertToTreeData(dataTree.value);
      console.log('转换的treeData:', treeData.value);
      
      const layerList = extractNodes(dataTree.value);
      console.log('提取的可加载图层列表:', layerList);

      scene = new MapScene(map);
      scene.loadFromData(layerList);
      console.log('地图场景初始化完成:', scene);
      console.log('scene中的节点数量:', scene.nodes.length);
      console.log('scene中的节点列表:', scene.nodes.map(n => ({ id: n.id, name: n.name, type: n.type })));
    } catch (error) {
      console.error('初始化地图数据失败:', error);
      dataTree.value = [];
      treeData.value = [];
    }
  }
});

// 框选出图：一次性选择范围并跳转到布局页
const openLayoutViewWithBBox = () => {
  if (!map) return router.push('/layout');
  window.$message?.info('请在地图上拖拽选择出图范围');
  selectBBox(map, (bounds) => {
    // 保存当前地图样式（含当前后端数据图层与可见性）到 sessionStorage
    try {
      const style = map.getStyle();
      sessionStorage.setItem('layout_map_style', JSON.stringify(style));
    } catch {}
    const b = bounds as any;
    const sw = (b.getSouthWest ? b.getSouthWest() : b.sw) as any;
    const ne = (b.getNorthEast ? b.getNorthEast() : b.ne) as any;
    const params = new URLSearchParams({
      minx: String(sw.lng ?? sw[0]),
      miny: String(sw.lat ?? sw[1]),
      maxx: String(ne.lng ?? ne[0]),
      maxy: String(ne.lat ?? ne[1])
    });
    router.push(`/layout?${params.toString()}`);
  });
};


</script>

<template>
  <div id="map-container">
    <div id="map-view" ref="mapViewEl" class="absolute inset-0"></div>
    
    <!-- 布局视图按钮 -->
    <div class="absolute top-4 right-4 z-[100]">
      <ATooltip title="框选范围并打开布局视图" placement="left">
        <AButton 
          type="primary" 
          size="large"
          class="shadow-lg hover:shadow-xl transition-all duration-200"
          @click="openLayoutViewWithBBox"
        >
          <template #icon>
            <IconifyIcon icon="material-symbols:print-outline" class="text-lg" />
          </template>
          框选出图
        </AButton>
      </ATooltip>
    </div>
    <ADrawer
      :body-style="{
        height: '100%',
        background: '#1B2232',
        padding: 0,
        overflow: 'hidden'
      }"
      width="350"
      placement="left"
      :mask="false"
      :closable="false"
      :open="drawerOpen"
      :get-container="false"
    >
      <div class="h-full flex flex-col">
        <div class="h-[55%] flex flex-col">
          <div
            class="h-10 flex items-center rounded-lg from-[#0d8bc1] to-[#30b4ee] bg-gradient-to-r p-4 text-base font-bold"
          >
            <DatabaseFilled class="mr-1.5" />
            数据目录
          </div>
          <div class="flex-1 overflow-auto p-4">
            <ACard
              class="h-full border-0 card-wrapper bg-tech-1"
              :body-style="{
                height: '100%',
                'box-sizing': 'border-box',
                padding: '15px',
                overflow: 'auto'
              }"
            >
              <SimpleScrollbar>
                <ATree default-expand-all :auto-expand-parent="true" :show-line="true" :tree-data="treeData">
                  <template #title="nodeData">
                    <!-- 图层节点：支持右键菜单 -->
                    <div v-if="nodeData.isLayer" class="relative">
                      <div 
                        
                        :title="`右键查看${nodeData.category === 'static' ? '文件' : '图层'}操作：${nodeData.title}`"
                        @contextmenu.prevent="(e) => handleRightClickMenu(e, nodeData)"
                      >
                        <span class="text-white font-medium opacity-100">{{ nodeData.title }}</span>
                        <IconifyIcon 
                          v-if="nodeData.category === 'static'" 
                          icon="material-symbols:description-outline" 
                          class="ml-1 text-xs text-white opacity-100" 
                        />
                        <IconifyIcon 
                          v-else 
                          icon="material-symbols:layers-outline" 
                          class="ml-1 text-xs text-white opacity-100" 
                        />
                      </div>
                    </div>
                    
                    <!-- 目录节点：普通显示 -->
                    <span v-else class="text-white opacity-100">
                      <IconifyIcon icon="material-symbols:folder-outline" class="mr-1 text-white opacity-100" />
                      {{ nodeData.title }}
                    </span>
                  </template>
                </ATree>
              </SimpleScrollbar>
            </ACard>
          </div>
        </div>
        <div class="min-h-0 flex flex-col flex-1">
          <div
            class="h-10 flex items-center rounded-lg from-[#0d8bc1] to-[#30b4ee] bg-gradient-to-r p-4 text-base font-bold"
          >
            <AppstoreFilled class="mr-1.5" />
            图层管理
          </div>
          <div class="flex-1 overflow-auto p-4">
            <ACard
              class="h-full border-0 card-wrapper bg-tech-1"
              :body-style="{
                height: '100%',
                'box-sizing': 'border-box',
                padding: '15px',
                overflow: 'auto'
              }"
            >
              <SimpleScrollbar>
                <ATree
                  v-model:expanded-keys="expandedKeys"
                  v-model:checked-keys="checkedKeys"
                  checkable
                  default-expand-all
                  draggable
                  :tree-data="layerTreeData"
                  :allow-drop="({ dropPosition }) => dropPosition !== 0"
                  @drop="onLayerTreeDrop"
                  @check="onLayerCheckClick"
                >
                  <template #title="{ title, key }">
                    <div class="relative">
                      <div 
                        @contextmenu.prevent="(e) => handleLayerRightClick(e, key as string, title)"
                        
                      >
                        <span v-if="key === '0-0-1-0'" style="color: #1890ff">{{ title }}</span>
                        <span v-else>{{ title }}</span>
                      </div>
                    </div>
                  </template>
                </ATree>
                <AEmpty v-if="layerTreeData && layerTreeData.length === 0" class="absolute top-10 h-full w-full" />
              </SimpleScrollbar>
            </ACard>
          </div>
        </div>
      </div>
    </ADrawer>

    <div class="absolute">
      <AButton type="primary" @click="showDrawer">Open</AButton>
    </div>
    <div class="absolute right-5 h-4/5 w-1/5" style="top: 10%; z-index: 200;">
      <ChatBox
        ref="chatBoxRef"
        @on-load-nodes-by-name="onLoadNodesByName"
        @start-draw="startDraw"
        @finish-draw="finishDraw"
        @add-analysis-results="addAnalysisResults"
      />
    </div>

    <!-- 属性表组件 -->
    <AttributeTableWindow
      v-model:visible="attributeTableVisible"
      :layer-id="selectedLayerId"
      :layer-name="selectedLayerName"
      :map="map"
      :scene="scene"
      :local-data="selectedLayerId === 'draw_features'
        ? Array.from(drawFeaturesData.values()).flat()
        : (selectedLayerId.startsWith('draw_') ? drawFeaturesData.get(selectedLayerId) : undefined)"
      :z-index="2000"
      @closed="attributeTableVisible = false"
      @request-focus="() => {}"
    />

    <!-- 绘制要素右键菜单 -->
    <div
      v-if="drawContextMenuVisible"
      class="fixed bg-white rounded-lg shadow-xl border border-gray-200 z-[3000] min-w-[150px]"
      :style="{ left: `${drawContextMenuPosition.x}px`, top: `${drawContextMenuPosition.y}px` }"
    >
      <div
        class="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-gray-700"
        @click="handleAddFeatureToLayer"
      >
        <PlusOutlined class="text-gray-600" />
        <span class="text-gray-700">添加到图层</span>
      </div>
    </div>

    <!-- 数据目录自定义右键菜单 -->
    <div
      v-if="customContextMenuVisible"
      class="fixed bg-white rounded-lg shadow-xl border border-gray-200 z-[3000] min-w-[150px]"
      :style="{ left: `${customContextMenuPosition.x}px`, top: `${customContextMenuPosition.y}px` }"
      @click.stop
    >
      <div
        class="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-gray-700"
        @click="handleDataMenuClick('addToLayer')"
      >
        <IconifyIcon 
          v-if="currentContextNode?.category === 'static'" 
          icon="material-symbols:open-in-new" 
          class="text-blue-500" 
        />
        <IconifyIcon 
          v-else 
          icon="material-symbols:add-circle-outline" 
          class="text-blue-500" 
        />
        <span class="text-gray-700">
          {{ currentContextNode?.category === 'static' ? '打开文件' : '添加到图层' }}
        </span>
      </div>
    </div>

    <!-- 点击其他地方隐藏菜单的遮罩 -->
    <div
      v-if="customContextMenuVisible"
      class="fixed inset-0 z-[2999]"
      @click="hideCustomContextMenu"
    ></div>

    <!-- 图层管理自定义右键菜单 -->
    <div
      v-if="layerContextMenuVisible"
      class="fixed bg-white rounded-lg shadow-xl border border-gray-200 z-[3001] min-w-[150px]"
      :style="{ left: `${layerContextMenuPosition.x}px`, top: `${layerContextMenuPosition.y}px` }"
      @click.stop
    >
      <div
        class="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-gray-700"
        @click="handleLayerMenuClick('viewAttributes')"
      >
        <TableOutlined class="text-blue-500" />
        <span class="text-gray-700">查看属性表</span>
      </div>
      <div
        class="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-gray-700"
        @click="handleLayerMenuClick('zoomToLayer')"
      >
        <ZoomInOutlined class="text-blue-500" />
        <span class="text-gray-700">缩放到图层</span>
      </div>
      <div class="border-t border-gray-200 my-1"></div>
      <div
        v-if="isAdmin"
        class="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-red-500"
        @click="handleLayerMenuClick('removeLayer')"
      >
        <DeleteOutlined class="text-red-500" />
        <span class="text-red-500">移除图层</span>
      </div>
    </div>

    <!-- 点击其他地方隐藏图层菜单的遮罩 -->
    <div
      v-if="layerContextMenuVisible"
      class="fixed inset-0 z-[3000]"
      @click="hideLayerContextMenu"
    ></div>

    <!-- 要素命名对话框 -->
    <AModal
      v-model:open="featureNameModalVisible"
      title="添加要素到图层"
      :mask-closable="false"
      :z-index="2001"
      @ok="confirmAddFeatureToLayer"
      @cancel="cancelAddFeatureToLayer"
    >
      <div class="py-4">
        <AFormItem label="要素名称" :label-col="{ span: 5 }" :wrapper-col="{ span: 16 }">
          <AInput
            v-model:value="featureName"
            placeholder="请输入要素名称"
            @keyup.enter="confirmAddFeatureToLayer"
          />
        </AFormItem>
        <div v-if="selectedDrawFeatures.length > 0" class="mt-4 text-gray-600">
          <p>已选中 {{ selectedDrawFeatures.length }} 个要素</p>
          <ul class="mt-2 text-sm">
            <li v-for="(feature, index) in selectedDrawFeatures" :key="index">
              {{ index + 1 }}. {{ feature.geometry.type }}
              <span v-if="feature.geometry.type === 'Point'">
                ({{ feature.geometry.coordinates[0].toFixed(4) }}, {{ feature.geometry.coordinates[1].toFixed(4) }})
              </span>
            </li>
          </ul>
        </div>
      </div>
    </AModal>
  </div>
</template>

<style lang="scss">
#map-container {
  position: relative;
  width: 100%;
  height: 100%;
}

#map-view {
  position: absolute;
  inset: 0;
}

/* 隐藏 Mapbox 水印和版权信息 */
.mapboxgl-ctrl-attrib {
  display: none !important;
}

.mapboxgl-ctrl-logo {
  display: none !important;
}

/* 重置控件默认样式，让 JavaScript 控制定位 */
#map-container .mapboxgl-ctrl-bottom-right,
#map-container .mapboxgl-ctrl-top-left {
  position: absolute !important;
}

/* 绘制控件选中状态样式 */
.horizontal-control-bar .mapbox-gl-draw_ctrl-draw-btn.active {
  background-color: #007cbf !important;
  color: white !important;
}

.ant-tree {
  background: none;
  color: rgb(255, 255, 255);
}

.ant-tree-node-selected {
  background: rgb(128, 156, 182) !important;
}

/* 去掉比例尺控件两侧的边框（隐藏伪元素竖线） */
.mapboxgl-ctrl-scale::before,
.mapboxgl-ctrl-scale::after {
  display: none !important;
  content: none !important;
}

/* 搜索框下拉列表层级设置 - 全面覆盖 */
.mapbox-search-box .mapbox-search-listbox,
.mapbox-search-box .mapbox-search-suggestions,
.mapbox-search-box .mapbox-search-results,
.mapbox-search-box .mapbox-search-box-results,
.mapbox-search-box [role="listbox"],
.mapbox-search-box [data-testid="suggestions"],
.mapbox-search-box [data-testid="results"],
.mapbox-search-box .suggestions,
.mapbox-search-box .mapbox-search-listbox-container,
.mapbox-search-box .mapbox-search-results-list,
.mapbox-search-box .dropdown,
.mapbox-search-box .dropdown-menu,
.mapbox-search-box .autocomplete,
.mapbox-search-box .autocomplete-suggestions,
.mapbox-search-box .search-suggestions,
.mapbox-search-box .search-results,
/* 全局搜索相关下拉列表 */
div[class*="mapbox"][class*="search"],
div[class*="suggestion"],
div[class*="result"],
div[data-testid*="suggestion"],
div[data-testid*="result"],
div[role="listbox"],
/* 可能的动态创建的下拉列表 */
body > div[style*="position: absolute"]:not(.attr-win),
body > div[style*="position: fixed"]:not(.attr-win) {
  z-index: 1600 !important;
  position: relative !important;
}

/* 特别针对可能出现在body根级别的搜索下拉列表 */
body > div:has(.mapbox-search-listbox),
body > div:has([role="listbox"]),
body > div:has([data-testid*="suggestion"]) {
  z-index: 1600 !important;
}



/* 使用更高的特异性来覆盖内联样式 */
#map-view div[style*="position: absolute"]:not(.attr-win),
#map-view div[style*="position: fixed"]:not(.attr-win) {
  z-index: 1600 !important;
}

/* 强制调整搜索控件容器位置 - 与水平控制栏平行 */
#map-view .mapboxgl-ctrl-top-right {
  position: absolute !important;
  top: 10px !important; /* 与水平控制栏完全相同的top值 */
  right: calc(20% + 50px) !important;
  left: auto !important;
  z-index: 1500 !important;
  display: flex !important;
  align-items: center !important; /* 垂直居中对齐，与水平控制栏一致 */
  height: auto !important; /* 自动高度 */
}

/* 搜索框相对于容器定位 */
#map-view .mapbox-search-box {
  position: relative !important;
  width: 300px !important;
  max-width: 300px !important;
  left: 0 !important;
  right: auto !important;
  top: auto !important;
}
</style>
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.userInfo.roles.includes('ROLE_ADMIN'));
