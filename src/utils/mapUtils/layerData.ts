import { fetchGetLayerTree } from '@/service/api';

/**
 * 将后端返回的节点属性替换为前端使用的字段
 */
function replaceProperties(node: Map.BaseTreeNode): Map.LayerData {
  const { layerName, tableName, ...rest } = node as any;
  return {
    ...(rest as any),
    name: tableName,
    name_cn: layerName,
    children: (node.children || []).map(child => replaceProperties(child as any))
  } as Map.LayerData;
}

/**
 * 初始化图层树数据
 */
export async function initData(): Promise<Map.LayerData> {
  try {
    const data = await fetchGetLayerTree();
    return replaceProperties(data as any);
  } catch (error) {
    console.error('获取图层树数据失败:', error);
    return {
      id: 'root',
      name: 'root',
      name_cn: '根节点',
      category: 'static',
      usage: null,
      children: []
    } as unknown as Map.LayerData;
  }
}

/**
 * 提取树中每个可作为图层的节点（包含叶子与带子节点但有 usage 的节点）
 */
export function extractNodes(tree: Map.LayerData[]): Map.LayerData[] {
  const result: Map.LayerData[] = [];

  function traverse(node: Map.LayerData) {
    if ((node as any).usage !== null) {
      result.push({ ...(node as any) });
    }
    if ((node as any).children && (node as any).children.length > 0) {
      (node as any).children.forEach((child: Map.LayerData) => traverse(child));
    }
  }

  tree.forEach(root => traverse(root));
  return result;
}

/**
 * 转换为 Antd Tree 需要的数据结构
 */
export function convertToTreeData(layers: Map.LayerData[]): import('ant-design-vue').TreeProps['treeData'] {
  return layers.map((layer: any) => ({
    key: layer.id,
    title: layer.name_cn,
    children: layer.children ? convertToTreeData(layer.children) : undefined,
    isLayer: layer.usage !== null,
    category: layer.category
  })) as any;
}



