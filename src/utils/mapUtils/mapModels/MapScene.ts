/* eslint-disable no-underscore-dangle */

import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
import { reactive } from 'vue';
import type { Feature } from 'geojson';
import MapNode from './MapNode';
export interface ViewState {
  center?: [number, number];
  pitch?: number;
  bearing?: number;
  zoom?: number;
}

export default class MapScene {
  nodes: MapNode[] = [];
  deckOverlay = new DeckOverlay({
    interleaved: true,
    layers: [],
    getCursor: () => 'inherit' // deck鼠标指针继承自mapbox
  });
  viewState: ViewState = {
    center: [121.58183804471179, 3.5163677796196424],
    pitch: 0,
    bearing: 0,
    zoom: 8
  };
  _nodeStatus = reactive<Record<string, boolean>>({});
  nodeStatus: Record<string, boolean> | null = null; // 代理对象，用于监听nodeStatus变化
  map: mapboxgl.Map;

  constructor(_map: mapboxgl.Map) {
    this.map = _map;
    this.map.addControl(this.deckOverlay);
  }

  loadFromData(_dataList: Map.LayerData[]) {
    _dataList.forEach(data => {
      const node = MapNode.createFromData(data, this);
      this._nodeStatus[data.id] = false;
      this.addNode(node);
    });
    // this.nodeStatus = new Proxy(this._nodeStatus, {
    //   set: (target, key, value) => {
    //     const keyStr = key as string;
    //     if (target[keyStr] !== value) {
    //       if (value) {
    //         this._loadNode(keyStr); // 仅在此处控制node加载
    //       } else {
    //         this._removeNode(keyStr);
    //       }
    //     }
    //     target[keyStr] = value;
    //     return true;
    //   }
    // });
  }

  addNode(node: MapNode) {
    this.nodes.push(node);
    return this.nodes.indexOf(node);
  }

  addTempNode(id: string, name: string, feature: Feature) {
    const node = MapNode.createTempFromFeature(id, name, feature, this);
    this.nodes.push(node);
    return this.nodes.indexOf(node);
  }

  addTempNodeFromCollection(id: string, name: string, featureCollection: any) {
    const node = MapNode.createTempFromFeatureCollection(id, name, featureCollection, this);
    this.nodes.push(node);
    return this.nodes.indexOf(node);
  }

  removeAllNodes() {
    this.nodes.forEach(node => {
      node.removeAll();
    });
  }

  setStatus(updateSet: Record<string, boolean>) {
    // eslint-disable-next-line guard-for-in
    for (const id in updateSet) {
      this.nodeStatus![id] = updateSet[id];
    }
  }

  // // 不再暴露接口
  // private _loadNode(id: string) {
  //   const node = this.findNodeById(id);
  //   if (node !== undefined) {
  //     node.loadAll();
  //     if (!this.activeNodes.includes(id)) {
  //       this.activeNodes.push(id);
  //     }
  //     // node.flyToThis();
  //   }
  // }

  loadNode(id: string): boolean {
    const node = this.findNodeById(id);
    if (node !== undefined && !node.active) {
      node.loadAll();
      // node.flyToThis();
      return true;
    }
    return false;
  }

  loadNodeByName(name: string): string | null {
    const node = this.findNodeByName(name);
    if (node !== undefined && !node.active) {
      node.loadAll();
      // node.flyToThis();
      return node.id;
    }
    return null;
  }

  // private _removeNode(id: string) {
  //   const node = this.findNodeById(id);
  //   if (node !== undefined) {
  //     node.removeAll();
  //   }
  // }

  removeNode(id: string): boolean {
    const node = this.findNodeById(id);
    if (node !== undefined) {
      // 先移除所有图层和源
      node.removeAll();
      // 从nodes数组中完全移除该节点
      const index = this.nodes.findIndex(n => n.id === id);
      if (index !== -1) {
        this.nodes.splice(index, 1);
        console.log(`已完全移除节点: ${id}`);
        return true;
      }
    }
    return false;
  }

  openNode(id: string) {
    const node = this.findNodeById(id);
    if (node !== undefined && node.active) {
      node.openAll();
    }
  }

  closeNode(id: string) {
    const node = this.findNodeById(id);
    if (node !== undefined && node.active) {
      node.closeAll();
    }
  }

  moveNode(id: string, beforeId: string | null) {
    const node = this.findNodeById(id);
    if (node !== undefined && node.active) {
      if (beforeId !== null) {
        const beforeNode = this.findNodeById(beforeId) ?? null;
        node.moveBeforeNode(beforeNode);
      } else {
        node.moveBeforeNode(null);
      }
    }
  }

  findNodeById(id: string): MapNode | undefined {
    return this.nodes.find(node => node.id === id);
  }

  findNodeByName(name: string): MapNode | undefined {
    return this.nodes.find(node => node.name === name);
  }

  isNodeActive(id: string): boolean {
    const node = this.findNodeById(id);
    return node ? node.active : false;
  }

  flyToThis() {
    this.map.easeTo(this.viewState);
  }

  /**
   * 查询指定图层的要素属性
   *
   * @param nodeId 节点ID
   * @param filter 可选的过滤条件
   * @returns 要素数组
   */
  /* eslint-disable complexity, max-depth, no-continue, @typescript-eslint/no-unused-vars */
  queryLayerFeatures(nodeId: string, filter?: any[]): any[] {
    const node = this.findNodeById(nodeId);
    if (!node) {
      console.warn(`图层 ${nodeId} 未找到`);
      return [];
    }

    if (!node.active) {
      console.warn(`图层 ${nodeId} 未激活`);
      return [];
    }

    try {
      let features: any[] = [];

      // 对于矢量图层，尝试查询源要素
      if (node.type === 0 || node.type === 1 || node.type === 2) {
        // POINT, LINE, POLYGON
        try {
          // 尝试不同的sourceLayer名称
          const sourceLayerNames = ['default', 'data', node.name, undefined];

          for (const sourceLayer of sourceLayerNames) {
            try {
              features = this.map.querySourceFeatures(nodeId, {
                sourceLayer: sourceLayer || undefined,
                filter
              });

              if (features && features.length > 0) {
                console.log(`通过sourceLayer "${sourceLayer}" 查询到 ${features.length} 个要素`);
                break;
              }
            } catch (e) {
              // 继续尝试下一个sourceLayer
              continue;
            }
          }
        } catch (error) {
          console.warn(`querySourceFeatures 失败:`, error);
        }
      }

      // 如果源查询没有结果，尝试查询渲染的要素
      if (!features || features.length === 0) {
        try {
          const layerIds = node.layers
            .map(layer => layer.id)
            .filter(id => {
              // 确保图层存在
              return this.map.getLayer(id);
            });

          if (layerIds.length > 0) {
            features = this.map.queryRenderedFeatures({
              layers: layerIds,
              filter
            });

            if (features && features.length > 0) {
              console.log(`通过queryRenderedFeatures查询到 ${features.length} 个要素`);
            }
          }
        } catch (error) {
          console.warn(`queryRenderedFeatures 失败:`, error);
        }
      }

      // 对于GeoJSON数据，直接从节点获取
      if ((!features || features.length === 0) && node.geojsonData) {
        console.log(`从GeoJSON数据获取要素`);
        features = [node.geojsonData];
      }

      console.log(`图层 ${nodeId} 最终查询到 ${features.length} 个要素`);
      return features || [];
    } catch (error) {
      console.error(`查询图层 ${nodeId} 要素失败:`, error);
      return [];
    }
  }
  /* eslint-enable complexity, max-depth, no-continue, @typescript-eslint/no-unused-vars */

  get terrainId(): string | null {
    const terrain = this.map.getTerrain();
    if (terrain === null || terrain === undefined) return null;
    return terrain.source;
  }

  set terrainId(id: string | null) {
    if (id === null) {
      this.map.setTerrain(null);
    } else {
      if (!this.map.getSource(id)) {
        console.log(`source ${id} not exists`);
        return;
      }
      this.map.setTerrain({ source: id, exaggeration: 1.0 });
    }
  }
}
