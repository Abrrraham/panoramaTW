import type { Feature } from 'geojson';
import { mapRequestHead } from '@/service/request';
import PointLayer from './layerClasses/PointLayer';
import LabelLayer from './layerClasses/LabelLayer';
import LineLayer from './layerClasses/LineLayer';
import PolygonLayer from './layerClasses/PolygonLayer';
import RasterLayer from './layerClasses/RasterLayer';
import ThreeDLayer from './layerClasses/ThreeDLayer';
import CustomLayer from './layerClasses/CustomLayer';
import type MapLayer from './MapLayer';
import type MapScene from './MapScene';
import type { ViewState } from './MapScene';

const NodeType = {
  POINT: 0,
  LINE: 1,
  POLYGON: 2,
  RASTER: 3,
  THREED: 4,
  UNDERWATER: 5,
  CUSTOM: 6
};

export default class MapNode {
  scene: MapScene | null = null;
  id: string = '';
  layers: MapLayer[] = [];
  name: string | null = null;
  nameCn: string | null = null;
  type: number = NodeType.CUSTOM;
  source: string | null = null;
  labelField: string | null = null;
  viewState: ViewState | null = null;
  minZoom: number = 0;
  maxZoom: number = 18;
  tileSize: number = 256;
  isDemSource: boolean = false;
  active: boolean = false;
  geojsonData: Feature | null = null;

  static createFromData(data: Map.LayerData, _scene: MapScene): MapNode {
    const node = new MapNode();
    node.scene = _scene;
    node.id = data.id;
    node.name = data.name;
    node.nameCn = data.name_cn ?? null;

    const category = data.category;
    const usage = data.usage;
    if (usage === null) return node;
    if (category === 'raster') {
      node.source = `${mapRequestHead}/resource/raster/getRasterTile/${data.id}/{z}/{x}/{y}`;
      node.minZoom = Number.parseInt(usage.minZoom, 10);
      node.maxZoom = Number.parseInt(usage.maxZoom, 10);
      node.tileSize = Number.parseInt(usage.size, 10);

      if (usage.type === 'water') {
        node.type = NodeType.UNDERWATER;
        node.viewState = {
          center: [120.280392, 34.303044],
          zoom: 12,
          pitch: 0
        };
      } else {
        node.type = NodeType.RASTER;
        node.isDemSource = true;
      }
    } else if (category === 'vector') {
      node.labelField = usage.visualizationField || null;
      node.source = `${mapRequestHead}/resource/vector/getMVT/${data.id}/{z}/{x}/{y}`;
      if (usage.type === 'point') {
        node.type = NodeType.POINT;
      } else if (usage.type === 'line') {
        node.type = NodeType.LINE;
      } else {
        node.type = NodeType.POLYGON;
      }
    } else if (category === '3DTiles') {
      node.type = NodeType.THREED;
      node.source = `${mapRequestHead}/get3DTiles/${data.id}/tileset.json`;
      node.viewState = {
        center: [119.134, 34.876],
        zoom: 11,
        bearing: -8.81,
        pitch: 70
      };
    } else if (category === 'static') {
      // static 类型为文件资源（PDF、JSON、TXT等），设置为自定义类型
      node.type = NodeType.CUSTOM;
      node.source = `${mapRequestHead}/resource/static/getStaticFileByte/${data.id}`;
    } else {
      node.type = NodeType.CUSTOM;
    }

    node.genLayers();
    return node;
  }

  // eslint-disable-next-line max-params
  static createTempFromFeature(id: string, name: string, feature: Feature, _scene: MapScene): MapNode {
    const node = new MapNode();
    node.id = id;
    node.name = name;
    node.geojsonData = feature;
    node.scene = _scene;
    const type = feature.geometry.type;
    switch (type) {
      case 'Point': {
        node.type = NodeType.POINT;
        break;
      }
      case 'LineString': {
        node.type = NodeType.LINE;
        break;
      }
      case 'Polygon': {
        node.type = NodeType.POLYGON;
        break;
      }
      default:
        node.type = NodeType.CUSTOM;
        break;
    }

    node.genLayers();
    return node;
  }

  // eslint-disable-next-line max-params
  static createTempFromFeatureCollection(id: string, name: string, featureCollection: any, _scene: MapScene): MapNode {
    const node = new MapNode();
    node.id = id;
    node.name = name;
    node.geojsonData = featureCollection;
    node.scene = _scene;

    // 根据FeatureCollection中第一个要素的几何类型确定节点类型
    if (featureCollection.features && featureCollection.features.length > 0) {
      const firstFeature = featureCollection.features[0];
      const type = firstFeature.geometry.type;
      switch (type) {
        case 'Point': {
          node.type = NodeType.POINT;
          break;
        }
        case 'MultiPoint': {
          // MultiPoint 在渲染上与 Point 使用同一套样式
          node.type = NodeType.POINT;
          break;
        }
        case 'LineString': {
          node.type = NodeType.LINE;
          break;
        }
        case 'MultiLineString': {
          node.type = NodeType.LINE;
          break;
        }
        case 'Polygon': {
          node.type = NodeType.POLYGON;
          break;
        }
        case 'MultiPolygon': {
          node.type = NodeType.POLYGON;
          break;
        }
        default:
          node.type = NodeType.CUSTOM;
          break;
      }
    } else {
      node.type = NodeType.CUSTOM;
    }

    node.genLayers();
    return node;
  }

  // 根据节点配置生成图层实例
  genLayers() {
    switch (this.type) {
      case NodeType.POINT: {
        this.addLayer(new PointLayer(this));
        this.addLayer(new LabelLayer(this));
        break;
      }
      case NodeType.LINE: {
        this.addLayer(new LineLayer(this));
        this.addLayer(new LabelLayer(this));
        break;
      }
      case NodeType.POLYGON: {
        this.addLayer(new PolygonLayer(this));
        this.addLayer(new LineLayer(this));
        this.addLayer(new LabelLayer(this));
        break;
      }
      case NodeType.RASTER: {
        this.addLayer(new RasterLayer(this));
        break;
      }
      case NodeType.THREED: {
        this.addLayer(new ThreeDLayer(this));
        break;
      }
      case NodeType.CUSTOM: {
        this.addLayer(new CustomLayer(this));
        break;
      }
      default:
        break;
    }
  }

  loadAll() {
    // 直接尝试加载图层；若样式尚未完全就绪，由下方 try/catch 兜底避免报错
    this.active = true;
    console.log(`加载图层节点: ${this.id}, 类型: ${this.type}, 数据源: ${this.source}`);

    try {
      if (this.type === NodeType.RASTER) {
        // if (this.isDemSource === true) {
        //   this.map?.addSource(this.id!, {
        //     type: 'raster-dem',
        //     tiles: [this.source!],
        //     tileSize: this.tileSize
        //   });
        // } else {
        //   this.map?.addSource(this.id!, {
        //     type: 'raster',
        //     tiles: [this.source!],
        //     tileSize: this.tileSize
        //   });
        // }
        this.map?.addSource(this.id!, {
          type: 'raster',
          tiles: [this.source!],
          tileSize: this.tileSize
        });
        console.log(`栅格图层源已添加: ${this.id}`);
      } else if (this.type === NodeType.POINT || this.type === NodeType.LINE || this.type === NodeType.POLYGON) {
        if (this.geojsonData) {
          console.log('使用GeoJSON数据加载图层', this.geojsonData);
          this.map?.addSource(this.id!, {
            type: 'geojson',
            data: this.geojsonData
          });
        } else {
          console.log(`使用矢量瓦片加载图层: ${this.source}`);
          this.map?.addSource(this.id!, {
            type: 'vector',
            // scheme 默认为 'xyz'，此处显式指定以防后台为 TMS
            scheme: 'xyz',
            tiles: [this.source!]
          });
        }
        console.log(`矢量图层源已添加: ${this.id}`);
      }

      this.layers.forEach(layer => {
        console.log(`加载图层: ${layer.id}`);
        layer.load();
      });
      console.log(`图层节点 ${this.id} 加载完成`);
    } catch (error) {
      console.error(`加载图层节点 ${this.id} 时出错:`, error);
    }
  }

  removeAll() {
    this.active = false;
    this.layers.forEach(layer => {
      layer.remove();
    });

    if (this.map?.getSource(this.id!)) this.map.removeSource(this.id!);
  }

  openAll() {
    console.log(`显示图层节点 ${this.id} 的所有图层，图层数量: ${this.layers.length}`);
    this.layers.forEach(layer => {
      console.log(`显示图层: ${layer.id}`);
      layer.open();
    });
  }

  closeAll() {
    console.log(`隐藏图层节点 ${this.id} 的所有图层，图层数量: ${this.layers.length}`);
    this.layers.forEach(layer => {
      console.log(`隐藏图层: ${layer.id}`);
      layer.close();
    });
  }

  get map() {
    if (this.scene) {
      return this.scene.map;
    }
    return null;
  }

  get deckOverlay() {
    if (this.scene) {
      return this.scene.deckOverlay;
    }
    return null;
  }

  get isTerrain() {
    if (this.scene) {
      return this.scene.terrainId === this.id;
    }
    return null;
  }

  getLayer(i: number) {
    return this.layers[i];
  }

  addLayer(layer: MapLayer) {
    this.layers.push(layer);
    const index = this.layers.indexOf(layer);
    layer.id = this.id + index.toString();
    return index;
  }

  moveBeforeNode(beforeNode: MapNode | null) {
    // 若样式未准备好，延迟再尝试
    if (this.map && !this.map.isStyleLoaded()) {
      this.map.once('load', () => this.moveBeforeNode(beforeNode));
      return;
    }

    const moveAll = () => {
      if (beforeNode === null || beforeNode.layers.length === 0) {
        this.layers.forEach((layer: MapLayer) => {
          if (this.map?.getLayer(layer.id)) this.map.moveLayer(layer.id);
        });
      } else {
        const beforeLayerId = beforeNode.getLayer(0)?.id;
        this.layers.forEach((layer: MapLayer) => {
          if (this.map?.getLayer(layer.id)) this.map.moveLayer(layer.id, beforeLayerId);
        });
      }
    };

    // 如果 beforeNode 的第一层尚未存在，延迟重试一次
    const needRetry = beforeNode && beforeNode.layers.length > 0 && !this.map?.getLayer(beforeNode.getLayer(0).id);
    if (needRetry) {
      setTimeout(moveAll, 100);
    } else {
      moveAll();
    }
  }
}
