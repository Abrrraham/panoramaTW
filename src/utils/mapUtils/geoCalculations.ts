import type { Feature, Geometry } from 'geojson';
import * as turf from '@turf/turf';
import type MapScene from './mapModels/MapScene';
import type { Map as MapboxMap } from 'mapbox-gl';

/**
 * 缓冲区分析
 * @param feature 输入要素
 * @param distance 缓冲区距离（米）
 * @returns 缓冲区面要素
 */
export function createBuffer(feature: Feature, distance: number): Feature | null {
  try {
    const bufferKm = distance / 1000; // 转换为公里
    const buffered = turf.buffer(feature as any, bufferKm, { units: 'kilometers' });
    return buffered as Feature;
  } catch (error) {
    console.error('创建缓冲区失败:', error);
    return null;
  }
}

/**
 * 距离测量
 * @param point1 点1
 * @param point2 点2
 * @returns 距离（米）
 */
export function calculateDistance(point1: Feature<Geometry>, point2: Feature<Geometry>): number {
  try {
    const distanceKm = turf.distance(point1 as any, point2 as any, { units: 'kilometers' });
    return distanceKm * 1000; // 转换为米
  } catch (error) {
    console.error('计算距离失败:', error);
    return 0;
  }
}

/**
 * 点到线距离
 * @param point 点要素
 * @param line 线要素
 * @returns 距离（米）
 */
export function pointToLineDistance(point: Feature<Geometry>, line: Feature<Geometry>): number {
  try {
    const nearestPoint = turf.nearestPointOnLine(line as any, point as any);
    const distanceKm = turf.distance(point as any, nearestPoint, { units: 'kilometers' });
    return distanceKm * 1000; // 转换为米
  } catch (error) {
    console.error('计算点到线距离失败:', error);
    return 0;
  }
}

/**
 * 最近邻分析
 * @param targetPoint 目标点
 * @param searchFeatures 搜索要素集合
 * @returns 最近的要素和距离
 */
export function findNearestNeighbor(
  targetPoint: Feature<Geometry>,
  searchFeatures: Feature[]
): { feature: Feature; distance: number } | null {
  try {
    let nearest: Feature | null = null;
    let minDistance = Infinity;

    searchFeatures.forEach(feature => {
      try {
        const distanceKm = turf.distance(targetPoint as any, feature as any, { units: 'kilometers' });
        const distanceM = distanceKm * 1000;
        if (distanceM < minDistance) {
          minDistance = distanceM;
          nearest = feature;
        }
      } catch (error) {
        console.warn('计算最近邻距离失败:', error);
      }
    });

    if (nearest) {
      return { feature: nearest, distance: minDistance };
    }
    return null;
  } catch (error) {
    console.error('最近邻分析失败:', error);
    return null;
  }
}

/**
 * 叠加分析 - 交集
 * @param feature1 要素1
 * @param feature2 要素2
 * @returns 交集要素
 */
export function intersectFeatures(feature1: Feature, feature2: Feature): Feature | null {
  try {
    // 验证要素是否有效
    if (!feature1 || !feature1.geometry || !feature2 || !feature2.geometry) {
      console.warn('交集分析：要素无效');
      return null;
    }
    
    // 确保都是多边形类型
    if (feature1.geometry.type !== 'Polygon' && feature1.geometry.type !== 'MultiPolygon') {
      console.warn('交集分析：要素1不是多边形类型:', feature1.geometry.type);
      return null;
    }
    
    if (feature2.geometry.type !== 'Polygon' && feature2.geometry.type !== 'MultiPolygon') {
      console.warn('交集分析：要素2不是多边形类型:', feature2.geometry.type);
      return null;
    }
    
    const intersected = turf.intersect(feature1 as any, feature2 as any);
    return intersected as Feature | null;
  } catch (error) {
    console.error('交集分析失败:', error);
    return null;
  }
}

/**
 * 叠加分析 - 并集
 * @param features 要素数组
 * @returns 并集要素
 */
export function unionFeatures(features: Feature[]): Feature | null {
  try {
    if (!features || features.length === 0) {
      console.warn('并集分析：要素数组为空');
      return null;
    }
    
    if (features.length === 1) {
      const feature = features[0];
      if (!feature || !feature.geometry) {
        console.warn('并集分析：单个要素无效');
        return null;
      }
      // 确保是多边形类型
      if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') {
        console.warn('并集分析：单个要素不是多边形类型:', feature.geometry.type);
        return null;
      }
      return feature;
    }

    // 过滤无效要素，只保留有效的多边形
    const validFeatures = features.filter(f => {
      if (!f || !f.geometry) return false;
      const geomType = f.geometry.type;
      return geomType === 'Polygon' || geomType === 'MultiPolygon';
    });
    
    if (validFeatures.length === 0) {
      console.warn('并集分析：没有有效的多边形要素');
      return null;
    }
    
    if (validFeatures.length === 1) {
      return validFeatures[0];
    }

    // 确保至少有两个有效的多边形要素
    if (validFeatures.length < 2) {
      console.warn('并集分析：有效要素数量不足2个');
      return validFeatures[0] || null;
    }

    // 从第一个有效要素开始
    let result = validFeatures[0] as any;
    
    // 验证第一个要素
    if (!result || !result.geometry) {
      console.warn('并集分析：第一个要素无效');
      return null;
    }
    
    const firstType = result.geometry.type;
    if (firstType !== 'Polygon' && firstType !== 'MultiPolygon') {
      console.warn('并集分析：第一个要素类型无效:', firstType);
      return null;
    }
    
    // 逐个合并要素
    for (let i = 1; i < validFeatures.length; i++) {
      try {
        const nextFeature = validFeatures[i];
        
        // 验证下一个要素
        if (!nextFeature || !nextFeature.geometry) {
          console.warn(`并集分析：跳过第${i}个无效要素`);
          continue;
        }
        
        const nextType = nextFeature.geometry.type;
        if (nextType !== 'Polygon' && nextType !== 'MultiPolygon') {
          console.warn(`并集分析：第${i}个要素类型无效:`, nextType);
          continue;
        }
        
        // 验证result仍然有效
        if (!result || !result.geometry) {
          console.warn(`并集分析：结果要素无效，使用第${i}个要素`);
          result = nextFeature;
          continue;
        }
        
        const resultType = result.geometry.type;
        if (resultType !== 'Polygon' && resultType !== 'MultiPolygon') {
          console.warn(`并集分析：结果要素类型无效:`, resultType);
          result = nextFeature;
          continue;
        }
        
        // 执行union操作（确保两个要素都是有效的多边形）
        try {
          // 双重验证：确保两个要素都是有效的多边形
          if ((result.geometry.type === 'Polygon' || result.geometry.type === 'MultiPolygon') &&
              (nextFeature.geometry.type === 'Polygon' || nextFeature.geometry.type === 'MultiPolygon')) {
            const unioned = turf.union(result, nextFeature as any);
            if (unioned && unioned.geometry && unioned.geometry.type) {
              result = unioned;
            } else {
              console.warn(`并集分析：union操作返回null（第${i}个要素），跳过该要素`);
              // union返回null，跳过该要素，继续下一个
            }
          } else {
            console.warn(`并集分析：要素类型不匹配（第${i}个要素）`);
          }
        } catch (unionError) {
          console.warn(`并集分析：union操作失败（第${i}个要素）:`, unionError);
          // 如果union失败，跳过该要素，继续处理下一个
          // 不更新result，保留之前的结果
        }
      } catch (error) {
        console.warn(`并集分析：处理第${i}个要素失败:`, error);
        // 继续处理下一个要素
        continue;
      }
    }
    
    // 验证最终结果
    if (!result || !result.geometry) {
      console.warn('并集分析：最终结果无效');
      return null;
    }
    
    return result as Feature;
  } catch (error) {
    console.error('并集分析失败:', error);
    return null;
  }
}

/**
 * 叠加分析 - 差集
 * @param feature1 被减要素
 * @param feature2 减去要素
 * @returns 差集要素
 */
export function differenceFeatures(feature1: Feature, feature2: Feature): Feature | null {
  try {
    // 验证要素是否有效
    if (!feature1 || !feature1.geometry || !feature2 || !feature2.geometry) {
      console.warn('差集分析：要素无效');
      return null;
    }
    
    // 确保都是多边形类型
    if (feature1.geometry.type !== 'Polygon' && feature1.geometry.type !== 'MultiPolygon') {
      console.warn('差集分析：要素1不是多边形类型:', feature1.geometry.type);
      return null;
    }
    
    if (feature2.geometry.type !== 'Polygon' && feature2.geometry.type !== 'MultiPolygon') {
      console.warn('差集分析：要素2不是多边形类型:', feature2.geometry.type);
      return null;
    }
    
    // Turf.js v7 中 difference 可能需要单独导入
    // @ts-ignore - 暂时忽略类型错误，运行时可能需要检查实际API
    const differenced = turf.difference(feature1 as any, feature2 as any);
    return differenced as Feature | null;
  } catch (error) {
    console.error('差集分析失败:', error);
    return null;
  }
}

/**
 * 密度分析 - 计算点密度
 * @param points 点要素集合
 * @param radius 搜索半径（米）
 * @returns 带密度值的点要素集合
 */
export function calculatePointDensity(
  points: Feature[],
  radius: number = 1000
): Feature[] {
  try {
    if (!points || points.length === 0) {
      return [];
    }
    
    const radiusKm = radius / 1000; // 转换为公里
    const densityPoints: Feature[] = [];
    
    for (const point of points) {
      // 确保要素有有效的geometry
      if (!point.geometry || !point.geometry.type) {
        console.warn('跳过无效的要素（缺少geometry）:', point);
        continue;
      }
      
      // 只处理点要素
      if (point.geometry.type !== 'Point') {
        console.warn('跳过非点要素:', point.geometry.type);
        continue;
      }
      
      let count = 0;
      for (const otherPoint of points) {
        try {
          // 确保其他点也是有效的点要素
          if (!otherPoint.geometry || otherPoint.geometry.type !== 'Point') {
            continue;
          }
          
          const distanceKm = turf.distance(point as any, otherPoint as any, { units: 'kilometers' });
          if (distanceKm <= radiusKm) {
            count++;
          }
        } catch (error) {
          // 忽略计算失败的点
          continue;
        }
      }
      
      const density = count / (Math.PI * radiusKm * radiusKm); // 每平方公里点数
      
      // 创建新的要素，确保包含所有必需的属性
      const densityFeature: Feature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: (point.geometry as any).coordinates
        },
        properties: {
          ...(point.properties || {}),
          density: Number(density.toFixed(2)),
          point_count: count
        }
      };
      
      densityPoints.push(densityFeature);
    }
    
    return densityPoints;
  } catch (error) {
    console.error('密度分析失败:', error);
    return [];
  }
}

/**
 * 从图层获取所有要素
 */
export function getAllFeaturesFromLayer(scene: MapScene | null, layerId: string): Feature[] {
  if (!scene) return [];
  try {
    const features = scene.queryLayerFeatures(layerId);
    return features || [];
  } catch (error) {
    console.error('获取图层要素失败:', error);
    return [];
  }
}

/**
 * 将计算结果添加到地图
 */
export function addCalculationResultToMap(
  scene: MapScene | null,
  map: MapboxMap | null,
  result: Feature,
  resultName: string
): string | null {
  if (!scene || !map) return null;
  
  try {
    const resultId = `calc_${Date.now()}`;
    scene.addTempNodeFromCollection(resultId, resultName, {
      type: 'FeatureCollection',
      features: [result]
    });
    
    const loadSuccess = scene.loadNode(resultId);
    if (loadSuccess) {
      scene.openNode(resultId);
      return resultId;
    }
    return null;
  } catch (error) {
    console.error('添加计算结果到地图失败:', error);
    return null;
  }
}

/**
 * 路线规划 - 计算两点间的最短路径（基于直线距离，实际应用中应使用路网）
 * @param startPoint 起点
 * @param endPoint 终点
 * @param avoidAreas 需要避开的区域（高风险区域）
 * @returns 路线要素和距离
 */
export function planRoute(
  startPoint: Feature<Geometry>,
  endPoint: Feature<Geometry>,
  avoidAreas: Feature[] = []
): { route: Feature; distance: number; estimatedTime: number } | null {
  try {
    // 检查是否需要避开某些区域
    let route: Feature;
    
    // 如果起点或终点在避开区域内，返回null
    for (const avoidArea of avoidAreas) {
      if (turf.booleanPointInPolygon(startPoint as any, avoidArea as any) ||
          turf.booleanPointInPolygon(endPoint as any, avoidArea as any)) {
        console.warn('起点或终点位于高风险区域内');
        return null;
      }
    }
    
    // 简单的直线路径（实际应用中应使用路网分析）
    const coordinates = [
      (startPoint.geometry as any).coordinates,
      (endPoint.geometry as any).coordinates
    ];
    
    route = turf.lineString(coordinates) as Feature;
    const distanceKm = turf.distance(startPoint as any, endPoint as any, { units: 'kilometers' });
    const distanceM = distanceKm * 1000;
    
    // 估算时间：假设平均速度 60 km/h（可根据实际情况调整）
    const averageSpeedKmh = 60;
    const estimatedTimeHours = distanceKm / averageSpeedKmh;
    const estimatedTimeMinutes = estimatedTimeHours * 60;
    
    return {
      route,
      distance: distanceM,
      estimatedTime: estimatedTimeMinutes
    };
  } catch (error) {
    console.error('路线规划失败:', error);
    return null;
  }
}

/**
 * 多城市访问路线规划
 * @param cities 访问城市列表（按访问顺序）
 * @param avoidAreas 需要避开的高风险区域
 * @returns 路线要素集合和总距离、总时间
 */
export function planMultiCityRoute(
  cities: Feature<Geometry>[],
  avoidAreas: Feature[] = []
): { routes: Feature[]; totalDistance: number; totalTime: number } | null {
  try {
    if (cities.length < 2) {
      console.warn('至少需要2个城市才能规划路线');
      return null;
    }
    
    const routes: Feature[] = [];
    let totalDistance = 0;
    let totalTime = 0;
    
    // 依次连接各个城市
    for (let i = 0; i < cities.length - 1; i++) {
      const start = cities[i];
      const end = cities[i + 1];
      
      const routeResult = planRoute(start, end, avoidAreas);
      if (routeResult) {
        routes.push(routeResult.route);
        totalDistance += routeResult.distance;
        totalTime += routeResult.estimatedTime;
      } else {
        console.warn(`无法规划从城市 ${i} 到城市 ${i + 1} 的路线`);
      }
    }
    
    return {
      routes,
      totalDistance,
      totalTime
    };
  } catch (error) {
    console.error('多城市路线规划失败:', error);
    return null;
  }
}

/**
 * 评估路线的安全性（检查路线是否经过高风险区域）
 * @param route 路线要素
 * @param riskAreas 高风险区域
 * @returns 安全评估结果
 */
export function evaluateRouteSafety(
  route: Feature,
  riskAreas: Feature[]
): { isSafe: boolean; riskCount: number; riskAreas: Feature[] } {
  try {
    let riskCount = 0;
    const intersectingRiskAreas: Feature[] = [];
    
    riskAreas.forEach(riskArea => {
      try {
        // 检查路线是否与高风险区域相交
        const intersects = turf.booleanIntersects(route as any, riskArea as any);
        if (intersects) {
          riskCount++;
          intersectingRiskAreas.push(riskArea);
        }
      } catch (error) {
        console.warn('评估路线安全性时出错:', error);
      }
    });
    
    return {
      isSafe: riskCount === 0,
      riskCount,
      riskAreas: intersectingRiskAreas
    };
  } catch (error) {
    console.error('评估路线安全性失败:', error);
    return {
      isSafe: false,
      riskCount: riskAreas.length,
      riskAreas: []
    };
  }
}

/**
 * 查找备选路线（通过中间点避开高风险区域）
 * @param startPoint 起点
 * @param endPoint 终点
 * @param riskAreas 高风险区域
 * @param waypoints 可选的中途点
 * @returns 备选路线
 */
export function findAlternativeRoute(
  startPoint: Feature<Geometry>,
  endPoint: Feature<Geometry>,
  riskAreas: Feature[] = [],
  waypoints: Feature<Geometry>[] = []
): Feature[] {
  try {
    const routes: Feature[] = [];
    
    // 如果没有中途点，尝试生成一个避开高风险区域的中间点
    if (waypoints.length === 0 && riskAreas.length > 0) {
      // 计算起点和终点的中点
      const midPoint = turf.midpoint(startPoint as any, endPoint as any);
      
      // 检查中点是否在高风险区域内
      let isMidPointSafe = true;
      for (const riskArea of riskAreas) {
        if (turf.booleanPointInPolygon(midPoint as any, riskArea as any)) {
          isMidPointSafe = false;
          break;
        }
      }
      
      // 如果中点安全，使用中点作为中途点
      if (isMidPointSafe) {
        waypoints = [midPoint as Feature<Geometry>];
      }
    }
    
    // 如果有中途点，分段规划路线
    if (waypoints.length > 0) {
      const allPoints = [startPoint, ...waypoints, endPoint];
      for (let i = 0; i < allPoints.length - 1; i++) {
        const segment = planRoute(allPoints[i], allPoints[i + 1], riskAreas);
        if (segment) {
          routes.push(segment.route);
        }
      }
    } else {
      // 直接规划路线
      const route = planRoute(startPoint, endPoint, riskAreas);
      if (route) {
        routes.push(route.route);
      }
    }
    
    return routes;
  } catch (error) {
    console.error('查找备选路线失败:', error);
    return [];
  }
}

/**
 * 道路网络节点（用于图算法）
 */
interface RoadNode {
  id: string;
  coordinates: [number, number];
  edges: Array<{ nodeId: string; distance: number }>;
}

/**
 * 基于道路网络的路径规划（优化版）
 * @param startPoint 起点
 * @param endPoint 终点
 * @param roadFeatures 道路要素集合
 * @param maxSearchRadius 最大搜索半径（米），用于将点投影到道路上
 * @returns 规划好的路线要素和距离
 */
export function planRouteOnRoadNetwork(
  startPoint: Feature<Geometry>,
  endPoint: Feature<Geometry>,
  roadFeatures: Feature[],
  maxSearchRadius: number = 5000 // 增加到5公里，允许用户点击的点有更大的偏差
): { route: Feature | null; distance: number; message: string } {
  try {
    if (!roadFeatures || roadFeatures.length === 0) {
      return {
        route: null,
        distance: 0,
        message: '未找到道路图层数据'
      };
    }

    console.log(`开始路径规划，道路要素数量: ${roadFeatures.length}`);

    // 0. 空间剪裁：只处理起点和终点附近一定范围内的道路（优化性能）
    const startCoords = (startPoint.geometry as any).coordinates as [number, number];
    const endCoords = (endPoint.geometry as any).coordinates as [number, number];
    
    // 验证坐标有效性
    if (!startCoords || !endCoords || startCoords.length < 2 || endCoords.length < 2) {
      return {
        route: null,
        distance: 0,
        message: '起点或终点坐标无效'
      };
    }
    
    // 计算起点和终点的边界框，扩大一定范围
    let bufferKm: number;
    try {
      const distance = turf.distance(turf.point(startCoords), turf.point(endCoords), { units: 'kilometers' });
      // 增加缓冲区范围：至少10公里，或距离的2.5倍（从1.5倍增加）
      bufferKm = Math.max(distance * 2.5, 10); // 至少10公里
    } catch (error) {
      console.warn('计算起点终点距离失败，使用默认缓冲区:', error);
      bufferKm = 10; // 默认10公里
    }
    
    // 创建缓冲区并合并搜索区域
    let searchArea: any;
    try {
      // 确保起点和终点是有效的点要素
      if (!startPoint || !startPoint.geometry || startPoint.geometry.type !== 'Point') {
        throw new Error('起点不是有效的点要素');
      }
      if (!endPoint || !endPoint.geometry || endPoint.geometry.type !== 'Point') {
        throw new Error('终点不是有效的点要素');
      }
      
      const startBuffer = turf.buffer(startPoint as any, bufferKm, { units: 'kilometers' });
      const endBuffer = turf.buffer(endPoint as any, bufferKm, { units: 'kilometers' });
      
      // 验证缓冲区是否创建成功
      if (!startBuffer || !startBuffer.geometry) {
        throw new Error('起点缓冲区创建失败');
      }
      if (!endBuffer || !endBuffer.geometry) {
        throw new Error('终点缓冲区创建失败');
      }
      
      // 尝试合并缓冲区（使用bboxPolygon确保格式正确）
      try {
        // 获取两个缓冲区的bbox并合并
        const startBbox = turf.bbox(startBuffer);
        const endBbox = turf.bbox(endBuffer);
        
        if (!startBbox || startBbox.length !== 4 || !endBbox || endBbox.length !== 4) {
          throw new Error('缓冲区bbox无效');
        }
        
        // 使用合并后的bbox创建搜索区域
        const combinedBbox: [number, number, number, number] = [
          Math.min(startBbox[0], endBbox[0]),
          Math.min(startBbox[1], endBbox[1]),
          Math.max(startBbox[2], endBbox[2]),
          Math.max(startBbox[3], endBbox[3])
        ];
        searchArea = turf.bboxPolygon(combinedBbox);
        
        // 验证searchArea是否创建成功
        if (!searchArea || !searchArea.geometry) {
          throw new Error('bboxPolygon创建失败');
        }
      } catch (unionError) {
        console.warn('合并缓冲区失败，使用bbox合并:', unionError);
        // 如果union失败，使用bbox合并
        try {
          const startBbox = turf.bbox(startBuffer);
          const endBbox = turf.bbox(endBuffer);
          if (startBbox && startBbox.length === 4 && endBbox && endBbox.length === 4) {
            const combinedBbox: [number, number, number, number] = [
              Math.min(startBbox[0], endBbox[0]),
              Math.min(startBbox[1], endBbox[1]),
              Math.max(startBbox[2], endBbox[2]),
              Math.max(startBbox[3], endBbox[3])
            ];
            searchArea = turf.bboxPolygon(combinedBbox);
          }
        } catch (bboxError) {
          console.warn('bbox合并也失败:', bboxError);
          throw bboxError;
        }
      }
    } catch (error) {
      console.warn('创建搜索区域失败，使用简化的bbox:', error);
      // 如果创建缓冲区失败，使用简化的bbox
      try {
        const pointDistance = Math.max(
          Math.abs(startCoords[0] - endCoords[0]),
          Math.abs(startCoords[1] - endCoords[1])
        );
        const margin = Math.max(pointDistance * 0.5, 0.05); // 至少0.05度（约5.5公里）
        const combinedBbox: [number, number, number, number] = [
          Math.min(startCoords[0], endCoords[0]) - margin,
          Math.min(startCoords[1], endCoords[1]) - margin,
          Math.max(startCoords[0], endCoords[0]) + margin,
          Math.max(startCoords[1], endCoords[1]) + margin
        ];
        searchArea = turf.bboxPolygon(combinedBbox);
        
        if (!searchArea || !searchArea.geometry) {
          throw new Error('bboxPolygon创建失败');
        }
      } catch (finalError) {
        console.error('创建搜索区域完全失败:', finalError);
        return {
          route: null,
          distance: 0,
          message: '无法创建搜索区域，请检查起点和终点坐标'
        };
      }
    }
    
    // 筛选在搜索区域内的道路
    const filteredRoads: Feature[] = [];
    let processedCount = 0;
    const maxProcess = Math.min(roadFeatures.length, 5000); // 限制最多处理5000个道路要素
    
    for (const road of roadFeatures) {
      if (processedCount >= maxProcess) {
        console.warn(`道路要素过多，已限制处理数量为 ${maxProcess}`);
        break;
      }
      
      try {
        // 快速检查：如果道路的边界框与搜索区域相交，则包含
        const roadBbox = turf.bbox(road);
        const roadBox = turf.bboxPolygon(roadBbox);
        if (turf.booleanIntersects(searchArea as any, roadBox as any)) {
          filteredRoads.push(road);
        }
        processedCount++;
      } catch (error) {
        // 如果检查失败，跳过该道路
        continue;
      }
    }
    
    console.log(`空间剪裁后，道路要素数量: ${filteredRoads.length}`);

    if (filteredRoads.length === 0) {
      return {
        route: null,
        distance: 0,
        message: '在起点和终点附近未找到道路，请确保点击位置靠近道路'
      };
    }
    
    // 如果剪裁后的道路太少（少于20个），扩大搜索范围
    if (filteredRoads.length < 20) {
      console.warn(`剪裁后道路要素较少 (${filteredRoads.length})，尝试扩大搜索范围`);
      const expandedBufferKm = bufferKm * 2; // 扩大2倍
      
      try {
        const expandedStartBuffer = turf.buffer(startPoint as any, expandedBufferKm, { units: 'kilometers' });
        const expandedEndBuffer = turf.buffer(endPoint as any, expandedBufferKm, { units: 'kilometers' });
        
        if (expandedStartBuffer && expandedEndBuffer && expandedStartBuffer.geometry && expandedEndBuffer.geometry) {
          const expandedStartBbox = turf.bbox(expandedStartBuffer);
          const expandedEndBbox = turf.bbox(expandedEndBuffer);
          
          if (expandedStartBbox.length === 4 && expandedEndBbox.length === 4) {
            const expandedBbox: [number, number, number, number] = [
              Math.min(expandedStartBbox[0], expandedEndBbox[0]),
              Math.min(expandedStartBbox[1], expandedEndBbox[1]),
              Math.max(expandedStartBbox[2], expandedEndBbox[2]),
              Math.max(expandedStartBbox[3], expandedEndBbox[3])
            ];
            const expandedSearchArea = turf.bboxPolygon(expandedBbox);
            
            // 重新筛选道路
            const expandedFilteredRoads: Feature[] = [];
            for (const road of roadFeatures.slice(0, Math.min(roadFeatures.length, 1000))) {
              try {
                const roadBbox = turf.bbox(road);
                if (roadBbox && roadBbox.length === 4) {
                  const roadBox = turf.bboxPolygon(roadBbox);
                  if (turf.booleanIntersects(expandedSearchArea as any, roadBox as any)) {
                    expandedFilteredRoads.push(road);
                  }
                }
              } catch (error) {
                continue;
              }
            }
            
            if (expandedFilteredRoads.length > filteredRoads.length) {
              console.log(`扩大搜索范围后，道路要素数量: ${expandedFilteredRoads.length}`);
              filteredRoads.length = 0;
              filteredRoads.push(...expandedFilteredRoads);
            }
          }
        }
      } catch (error) {
        console.warn('扩大搜索范围失败:', error);
      }
    }

    // 1. 将起点和终点投影到最近的道路上（只搜索过滤后的道路）
    const startOnRoad = projectPointToRoad(startPoint, filteredRoads, maxSearchRadius);
    const endOnRoad = projectPointToRoad(endPoint, filteredRoads, maxSearchRadius);

    if (!startOnRoad || !endOnRoad) {
      return {
        route: null,
        distance: 0,
        message: '无法将起点或终点投影到道路上，请确保点击位置靠近道路'
      };
    }

    // 2. 构建道路网络图（只使用过滤后的道路）
    console.log('开始构建道路网络...');
    const { nodes, nodeMap } = buildRoadNetwork(filteredRoads);
    console.log(`道路网络构建完成，节点数量: ${nodes.length}`);

    if (nodes.length === 0) {
      return {
        route: null,
        distance: 0,
        message: '无法构建道路网络'
      };
    }

    // 限制节点数量，如果节点太多，使用简化的方法
    if (nodes.length > 10000) {
      console.warn(`节点数量过多 (${nodes.length})，使用简化路径规划`);
      // 使用直线路径作为备选方案
      const directRoute = turf.lineString([startCoords, endCoords]) as Feature;
      const directDistance = turf.distance(startPoint as any, endPoint as any, { units: 'kilometers' }) * 1000;
      return {
        route: directRoute,
        distance: directDistance,
        message: `道路网络过于复杂，使用直线路径，距离 ${(directDistance / 1000).toFixed(2)} 公里`
      };
    }

    // 3. 将投影点添加到网络中
    const startNodeId = addPointToNetwork(startOnRoad, nodes, nodeMap);
    const endNodeId = addPointToNetwork(endOnRoad, nodes, nodeMap);

    if (!startNodeId || !endNodeId) {
      return {
        route: null,
        distance: 0,
        message: '无法将点添加到道路网络'
      };
    }

    // 4. 验证起点和终点节点是否已连接到网络
    const startNode = nodeMap.get(startNodeId);
    const endNode = nodeMap.get(endNodeId);
    
    if (startNode && startNode.edges.length === 0) {
      console.warn('起点节点未连接到任何道路节点');
    }
    
    if (endNode && endNode.edges.length === 0) {
      console.warn('终点节点未连接到任何道路节点');
    }
    
    // 4. 使用优化的 Dijkstra 算法找到最短路径
    console.log('开始路径搜索...');
    console.log(`起点节点 ${startNodeId} 的边数: ${startNode?.edges.length || 0}`);
    if (startNode && startNode.edges.length > 0) {
      console.log(`起点连接的节点: ${startNode.edges.map(e => e.nodeId).join(', ')}`);
    }
    console.log(`终点节点 ${endNodeId} 的边数: ${endNode?.edges.length || 0}`);
    if (endNode && endNode.edges.length > 0) {
      console.log(`终点连接的节点: ${endNode.edges.map(e => e.nodeId).join(', ')}`);
    }
    console.log(`道路网络总节点数: ${nodes.length}`);
    
    const path = dijkstraShortestPathOptimized(nodes, nodeMap, startNodeId, endNodeId);
    
    if (path && path.length > 0) {
      console.log(`路径搜索成功，路径包含 ${path.length} 个节点: ${path.slice(0, 5).join(' -> ')}${path.length > 5 ? ' -> ...' : ''}`);
    } else {
      console.warn('路径搜索返回null或空数组');
    }

    if (!path || path.length === 0) {
      // 尝试检查连通性：使用BFS检查起点和终点是否在同一连通分量中
      console.warn('路径搜索失败，检查起点和终点的连通性...');
      
      const visited = new Set<string>();
      const queue: string[] = [startNodeId];
      visited.add(startNodeId);
      let canReachEnd = false;
      
      // BFS搜索是否能到达终点
      let bfsIterations = 0;
      const maxBfsIterations = 10000; // 限制BFS迭代次数，避免无限循环
      
      while (queue.length > 0 && !canReachEnd && bfsIterations < maxBfsIterations) {
        bfsIterations++;
        const currentNodeId = queue.shift()!;
        const currentNode = nodeMap.get(currentNodeId);
        
        if (!currentNode) continue;
        
        for (const edge of currentNode.edges) {
          if (edge.nodeId === endNodeId) {
            canReachEnd = true;
            console.log(`BFS找到终点，迭代次数: ${bfsIterations}，访问节点数: ${visited.size}`);
            break;
          }
          
          if (!visited.has(edge.nodeId)) {
            visited.add(edge.nodeId);
            queue.push(edge.nodeId);
          }
        }
      }
      
      if (bfsIterations >= maxBfsIterations) {
        console.warn(`BFS搜索达到最大迭代次数 (${maxBfsIterations})，已访问 ${visited.size} 个节点`);
      }
      
      console.log(`连通性检查完成: canReachEnd=${canReachEnd}, 已访问节点数=${visited.size}, 起点边数=${startNode?.edges.length || 0}, 终点边数=${endNode?.edges.length || 0}`);
      
      if (!canReachEnd) {
        console.warn('起点和终点不在同一连通分量中，尝试直接连接');
        // 尝试增加连接半径，重新连接起点和终点
        console.log('尝试增加连接半径，重新连接起点和终点...');
        
        // 增加起点和终点的连接范围
        const startNodeFinal = nodeMap.get(startNodeId);
        const endNodeFinal = nodeMap.get(endNodeId);
        
        if (startNodeFinal && endNodeFinal) {
          // 尝试直接连接起点和终点（如果它们距离不太远）
          try {
            const directDistance = turf.distance(
              turf.point(startNodeFinal.coordinates),
              turf.point(endNodeFinal.coordinates),
              { units: 'kilometers' }
            ) * 1000; // 转换为米
            
            console.log(`起点和终点直线距离: ${(directDistance / 1000).toFixed(2)} 公里 (${directDistance.toFixed(2)} 米)`);
            
            // 如果距离小于20公里，直接连接（从10公里增加到20公里，允许更大的连接）
            if (directDistance < 20000) {
              if (!startNodeFinal.edges.find(e => e.nodeId === endNodeId)) {
                startNodeFinal.edges.push({ nodeId: endNodeId, distance: directDistance });
                console.log(`添加起点到终点的边，距离: ${(directDistance / 1000).toFixed(2)} 公里`);
              }
              if (!endNodeFinal.edges.find(e => e.nodeId === startNodeId)) {
                endNodeFinal.edges.push({ nodeId: startNodeId, distance: directDistance });
                console.log(`添加终点到起点的边，距离: ${(directDistance / 1000).toFixed(2)} 公里`);
              }
              
              console.log(`直接连接起点和终点完成，起点边数: ${startNodeFinal.edges.length}，终点边数: ${endNodeFinal.edges.length}`);
              
              // 重新尝试路径搜索
              console.log('重新尝试路径搜索...');
              const retryPath = dijkstraShortestPathOptimized(nodes, nodeMap, startNodeId, endNodeId);
              
              if (retryPath && retryPath.length > 0) {
                console.log(`直接连接后，路径搜索成功，路径节点数量: ${retryPath.length}`);
                // 继续使用 retryPath 构建路线
                const nodeMapForLookup = new Map(nodes.map(n => [n.id, n]));
                const routeCoordinates: [number, number][] = retryPath.map(nodeId => {
                  const node = nodeMapForLookup.get(nodeId);
                  return node ? node.coordinates : [0, 0] as [number, number];
                }).filter((coord): coord is [number, number] => coord[0] !== 0 || coord[1] !== 0);
                
                const cleanedCoordinates = cleanCoordinates(routeCoordinates);
                
                if (cleanedCoordinates.length >= 2) {
                  const route = turf.lineString(cleanedCoordinates) as Feature;
                  const totalDistance = turf.length(route, { units: 'kilometers' }) * 1000;
                  return {
                    route,
                    distance: totalDistance,
                    message: `成功规划路线（使用直接连接），总距离 ${(totalDistance / 1000).toFixed(2)} 公里`
                  };
                } else {
                  console.warn('清理后的坐标点不足，无法构建路线');
                }
              } else {
                console.warn('直接连接后，路径搜索仍然失败');
              }
            } else {
              console.warn(`起点和终点距离过远 (${(directDistance / 1000).toFixed(2)} 公里)，超过20公里限制，无法直接连接`);
            }
          } catch (error) {
            console.warn('直接连接起点和终点失败:', error);
          }
        }
      }
      
      // 返回更详细的错误信息
      return {
        route: null,
        distance: 0,
        message: `无法找到从起点到终点的路径。起点连接数: ${startNode?.edges.length || 0}，终点连接数: ${endNode?.edges.length || 0}。可能是道路网络不连通或投影点距离道路太远。请尝试在地图上更精确地点击道路位置。`
      };
    }

    console.log(`路径搜索完成，路径节点数量: ${path.length}`);

    // 5. 构建路线要素（优化：使用Map查找而不是find）
    const nodeMapForLookup = new Map(nodes.map(n => [n.id, n]));
    const routeCoordinates: [number, number][] = path.map(nodeId => {
      const node = nodeMapForLookup.get(nodeId);
      return node ? node.coordinates : [0, 0] as [number, number];
    }).filter((coord): coord is [number, number] => coord[0] !== 0 || coord[1] !== 0); // 过滤无效坐标

    // 移除重复的连续点
    const cleanedCoordinates = cleanCoordinates(routeCoordinates);

    if (cleanedCoordinates.length < 2) {
      return {
        route: null,
        distance: 0,
        message: '路径点不足'
      };
    }

    const route = turf.lineString(cleanedCoordinates) as Feature;

    // 6. 计算总距离（优化：使用turf.length）
    const totalDistance = turf.length(route, { units: 'kilometers' }) * 1000; // 转换为米

    return {
      route,
      distance: totalDistance,
      message: `成功规划路线，总距离 ${(totalDistance / 1000).toFixed(2)} 公里`
    };
  } catch (error) {
    console.error('基于道路网络的路径规划失败:', error);
    return {
      route: null,
      distance: 0,
      message: `路径规划失败: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
}

/**
 * 将点投影到最近的道路上
 */
function projectPointToRoad(
  point: Feature<Geometry>,
  roadFeatures: Feature[],
  maxRadius: number
): { coordinates: [number, number]; roadFeature: Feature } | null {
  try {
    let nearestPoint: { coordinates: [number, number]; roadFeature: Feature } | null = null;
    let minDistance = Infinity;
    let searchCount = 0;
    const maxSearchRoads = Math.min(roadFeatures.length, 1000); // 增加搜索的道路数量

    for (const road of roadFeatures) {
      if (searchCount >= maxSearchRoads) {
        console.warn(`投影点到道路：已搜索 ${maxSearchRoads} 条道路，停止进一步搜索`);
        break;
      }
      
      // 支持 LineString, MultiLineString, Polygon, MultiPolygon
      if (road.geometry.type === 'LineString' || road.geometry.type === 'MultiLineString' ||
          road.geometry.type === 'Polygon' || road.geometry.type === 'MultiPolygon') {
        
        let lineFeature: Feature<Geometry>;
        
        try {
          if (road.geometry.type === 'Polygon') {
            // 对于Polygon，使用外环作为LineString
            const polygonCoords = (road.geometry as any).coordinates;
            if (polygonCoords && polygonCoords[0]) {
              lineFeature = turf.lineString(polygonCoords[0]) as Feature<Geometry>;
            } else {
              continue;
            }
          } else if (road.geometry.type === 'MultiPolygon') {
            // 对于MultiPolygon，将其所有外环合并为MultiLineString
            const allLineCoords: number[][][] = [];
            const multiPolygonCoords = (road.geometry as any).coordinates;
            if (Array.isArray(multiPolygonCoords)) {
              multiPolygonCoords.forEach((polygonCoords: any) => {
                if (Array.isArray(polygonCoords) && polygonCoords[0]) {
                  allLineCoords.push(polygonCoords[0]); // 提取每个多边形的外环
                }
              });
            }
            if (allLineCoords.length > 0) {
              lineFeature = turf.multiLineString(allLineCoords) as Feature<Geometry>;
            } else {
              continue;
            }
          } else {
            lineFeature = road as Feature<Geometry>;
          }

          const nearest = turf.nearestPointOnLine(lineFeature as any, point as any, { units: 'meters' });
          const distance = turf.distance(point as any, nearest, { units: 'meters' });

          if (distance < minDistance && distance <= maxRadius) {
            minDistance = distance;
            nearestPoint = {
              coordinates: nearest.geometry.coordinates as [number, number],
              roadFeature: road
            };
              // 如果找到距离小于0.05公里（50米）的点，提前退出（允许更大的容差）
            if (minDistance < 50) { // 50米
              break;
            }
          }
        } catch (error) {
          // 如果某条道路的计算失败，继续处理下一条
          console.warn('计算点到道路的距离失败:', error);
          continue;
        }
      }
      searchCount++;
    }

    if (nearestPoint) {
      console.log(`成功将点投影到道路，距离: ${(minDistance / 1000).toFixed(2)} 公里 (${minDistance.toFixed(2)} 米)`);
    } else {
      console.warn(`无法在 ${(maxRadius / 1000).toFixed(2)} 公里 (${maxRadius} 米) 范围内将点投影到道路`);
    }

    return nearestPoint;
  } catch (error) {
    console.warn('投影点到道路失败:', error);
    return null;
  }
}

/**
 * 构建道路网络图（优化版：限制节点数量）
 */
function buildRoadNetwork(roadFeatures: Feature[]): {
  nodes: RoadNode[];
  nodeMap: Map<string, RoadNode>;
} {
  // 初始化空间哈希
  nodeSpatialHash = new Map<string, RoadNode[]>();
  
  const nodeMap = new Map<string, RoadNode>();
  const nodes: RoadNode[] = [];

  // 限制处理的道路要素数量
  const maxFeatures = Math.min(roadFeatures.length, 2000);
  const featuresToProcess = roadFeatures.slice(0, maxFeatures);
  
  if (roadFeatures.length > maxFeatures) {
    console.warn(`道路要素过多 (${roadFeatures.length})，限制处理数量为 ${maxFeatures}`);
  }

  // 遍历所有道路要素，提取节点
  let processedCount = 0;
  for (const road of featuresToProcess) {
    try {
      if (!road.geometry) {
        console.warn('道路要素缺少geometry');
        continue;
      }
      
      const geomType = road.geometry.type;
      
      if (geomType === 'LineString') {
        const coords = (road.geometry as any).coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          processRoadSegment(coords as [number, number][], nodeMap, nodes);
        } else {
          console.warn('LineString坐标格式无效');
        }
      } else if (geomType === 'MultiLineString') {
        const multiCoords = (road.geometry as any).coordinates;
        if (Array.isArray(multiCoords)) {
          multiCoords.forEach((coords: any, index: number) => {
            if (Array.isArray(coords) && coords.length >= 2) {
              processRoadSegment(coords as [number, number][], nodeMap, nodes);
            } else {
              console.warn(`MultiLineString第${index}条线段坐标格式无效`);
            }
          });
        }
      } else if (geomType === 'Polygon') {
        // 将多边形转换为线（使用外环）
        const coords = (road.geometry as any).coordinates;
        if (Array.isArray(coords) && coords.length > 0) {
          const outerRing = coords[0]; // 外环
          if (Array.isArray(outerRing) && outerRing.length >= 2) {
            processRoadSegment(outerRing as [number, number][], nodeMap, nodes);
          }
        }
      } else if (geomType === 'MultiPolygon') {
        // 将多边形的每个外环转换为线
        const multiCoords = (road.geometry as any).coordinates;
        if (Array.isArray(multiCoords)) {
          multiCoords.forEach((polygon: any, polyIndex: number) => {
            if (Array.isArray(polygon) && polygon.length > 0) {
              const outerRing = polygon[0]; // 外环
              if (Array.isArray(outerRing) && outerRing.length >= 2) {
                processRoadSegment(outerRing as [number, number][], nodeMap, nodes);
              }
            }
          });
        }
      }
      
      processedCount++;
      
      // 如果节点数量过多，提前停止
      if (nodes.length > 8000) {
        console.warn(`节点数量过多 (${nodes.length})，停止处理更多道路`);
        break;
      }
    } catch (error) {
      console.error('处理道路要素失败:', error, road);
      continue;
    }
  }

  console.log(`道路网络构建完成: 处理了 ${processedCount} 个道路要素，生成 ${nodes.length} 个节点`);
  return { nodes, nodeMap };
}

/**
 * 处理道路段，提取节点和边（优化版：简化节点，减少节点数量）
 */
function processRoadSegment(
  coordinates: [number, number][],
  nodeMap: Map<string, RoadNode>,
  nodes: RoadNode[]
): void {
  if (!coordinates || coordinates.length < 2) {
    console.warn('道路段坐标无效:', coordinates);
    return;
  }

  const tolerance = 0.001; // 坐标容差，用于识别相同节点（增加到约111米，允许更大的容差）
  
  // 验证坐标格式
  const validCoords: [number, number][] = [];
  for (const coord of coordinates) {
    if (Array.isArray(coord) && coord.length >= 2 && 
        typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
        !isNaN(coord[0]) && !isNaN(coord[1]) &&
        isFinite(coord[0]) && isFinite(coord[1])) {
      validCoords.push([coord[0], coord[1]]);
    } else {
      console.warn('跳过无效坐标:', coord);
    }
  }
  
  if (validCoords.length < 2) {
    console.warn('有效坐标点不足，无法处理道路段');
    return;
  }
  
  // 如果坐标点太多，进行简化（保留起点、终点和中间关键点）
  let processedCoords: [number, number][];
  if (validCoords.length > 100) {
    // 简化：只保留起点、终点和每隔一定距离的点
    processedCoords = [validCoords[0]];
    const step = Math.floor(validCoords.length / 50); // 最多保留50个点
    for (let i = step; i < validCoords.length - 1; i += step) {
      processedCoords.push(validCoords[i]);
    }
    processedCoords.push(validCoords[validCoords.length - 1]);
  } else {
    processedCoords = validCoords;
  }

  for (let i = 0; i < processedCoords.length; i++) {
    const coord = processedCoords[i];
    try {
      const nodeId = findOrCreateNode(coord, tolerance, nodeMap, nodes);

      // 连接前一个节点
      if (i > 0) {
        const prevCoord = processedCoords[i - 1];
        const prevNodeId = findOrCreateNode(prevCoord, tolerance, nodeMap, nodes);
        connectNodes(prevNodeId, nodeId, prevCoord, coord, nodeMap);
      }
    } catch (error) {
      console.warn('处理道路段节点失败:', error, coord);
      continue;
    }
  }
}

// 使用空间哈希来加速节点查找（全局变量，在buildRoadNetwork开始时清空）
let nodeSpatialHash: Map<string, RoadNode[]> | null = null;

/**
 * 查找或创建节点（优化版：使用空间哈希加速查找）
 */
function findOrCreateNode(
  coord: [number, number],
  tolerance: number,
  nodeMap: Map<string, RoadNode>,
  nodes: RoadNode[]
): string {
  if (!nodeSpatialHash) {
    nodeSpatialHash = new Map<string, RoadNode[]>();
  }
  
  // 使用空间哈希快速查找相近节点
  const gridSize = 0.01; // 约1公里
  const gridX = Math.floor(coord[0] / gridSize);
  const gridY = Math.floor(coord[1] / gridSize);
  
  const toleranceMeters = tolerance * 111000; // 转换为米
  
  // 在附近网格中查找（扩大搜索范围）
  for (let dx = -2; dx <= 2; dx++) { // 从±1扩大到±2，增加找到附近节点的概率
    for (let dy = -2; dy <= 2; dy++) {
      const key = `${gridX + dx}_${gridY + dy}`;
      const nearbyNodes = nodeSpatialHash.get(key) || [];
      for (const node of nearbyNodes) {
        try {
          const distance = turf.distance(turf.point(coord), turf.point(node.coordinates), { units: 'kilometers' });
          if (distance * 1000 < toleranceMeters) {
            return node.id;
          }
        } catch (error) {
          // 跳过计算失败的节点
          continue;
        }
      }
    }
  }

  // 创建新节点
  const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const node: RoadNode = {
    id: nodeId,
    coordinates: coord,
    edges: []
  };
  nodeMap.set(nodeId, node);
  nodes.push(node);
  
  // 添加到空间哈希
  const gridKey = `${gridX}_${gridY}`;
  if (!nodeSpatialHash.has(gridKey)) {
    nodeSpatialHash.set(gridKey, []);
  }
  nodeSpatialHash.get(gridKey)!.push(node);
  
  return nodeId;
}

/**
 * 连接两个节点
 */
function connectNodes(
  nodeId1: string,
  nodeId2: string,
  coord1: [number, number],
  coord2: [number, number],
  nodeMap: Map<string, RoadNode>
): void {
  const node1 = nodeMap.get(nodeId1);
  const node2 = nodeMap.get(nodeId2);

  if (!node1 || !node2) return;

  // 计算距离
  const distance = turf.distance(turf.point(coord1), turf.point(coord2), { units: 'kilometers' }) * 1000;

  // 添加边（如果不存在）
  if (!node1.edges.find(e => e.nodeId === nodeId2)) {
    node1.edges.push({ nodeId: nodeId2, distance });
  }
  if (!node2.edges.find(e => e.nodeId === nodeId1)) {
    node2.edges.push({ nodeId: nodeId1, distance });
  }
}

/**
 * 将点添加到网络中，并连接到附近的道路节点
 */
function addPointToNetwork(
  pointOnRoad: { coordinates: [number, number]; roadFeature: Feature },
  nodes: RoadNode[],
  nodeMap: Map<string, RoadNode>
): string | null {
  const tolerance = 0.001; // 与 processRoadSegment 中的容差保持一致（约111米）
  
  // 首先查找或创建节点
  const nodeId = findOrCreateNode(pointOnRoad.coordinates, tolerance, nodeMap, nodes);
  
  if (!nodeId) {
    return null;
  }
  
  const point = pointOnRoad.coordinates;
  const roadFeature = pointOnRoad.roadFeature;
  const connectionRadius = 500; // 连接半径：500米，允许连接到附近的道路节点
  const connectionRadiusKm = connectionRadius / 1000;
  
  // 提取投影点所在道路的坐标点
  let roadCoordinates: [number, number][] = [];
  
  try {
    if (roadFeature.geometry.type === 'LineString') {
      roadCoordinates = (roadFeature.geometry as any).coordinates;
    } else if (roadFeature.geometry.type === 'MultiLineString') {
      // 对于MultiLineString，使用所有线段
      (roadFeature.geometry as any).coordinates.forEach((line: [number, number][]) => {
        roadCoordinates.push(...line);
      });
    } else if (roadFeature.geometry.type === 'Polygon') {
      // 对于Polygon，使用外环
      roadCoordinates = (roadFeature.geometry as any).coordinates[0];
    } else if (roadFeature.geometry.type === 'MultiPolygon') {
      // 对于MultiPolygon，使用所有外环
      (roadFeature.geometry as any).coordinates.forEach((polygon: any) => {
        roadCoordinates.push(...polygon[0]);
      });
    }
  } catch (error) {
    console.warn('提取道路坐标失败:', error);
  }
  
  // 使用空间哈希查找附近的节点
  const nearbyNodeIds = new Set<string>();
  
  if (nodeSpatialHash) {
    const gridSize = 0.01; // 约1公里
    const gridX = Math.floor(point[0] / gridSize);
    const gridY = Math.floor(point[1] / gridSize);
    
    // 在附近网格中查找
    for (let dx = -3; dx <= 3; dx++) { // 进一步扩大搜索范围到±3个网格
      for (let dy = -3; dy <= 3; dy++) {
        const key = `${gridX + dx}_${gridY + dy}`;
        const nearbyNodes = nodeSpatialHash.get(key) || [];
        
        for (const node of nearbyNodes) {
          // 跳过自己
          if (node.id === nodeId) {
            continue;
          }
          
          try {
            const distance = turf.distance(
              turf.point(point),
              turf.point(node.coordinates),
              { units: 'kilometers' }
            );
            
            // 如果在连接半径内，添加到连接列表
            if (distance <= connectionRadiusKm) {
              // 优先连接道路上的节点：检查节点是否在投影点所在的道路上
              let isOnRoad = false;
              
              if (roadCoordinates.length > 0) {
                // 检查节点是否在道路坐标附近（50米内）
                for (const roadCoord of roadCoordinates) {
                  try {
                    const distToRoad = turf.distance(
                      turf.point(roadCoord),
                      turf.point(node.coordinates),
                      { units: 'kilometers' }
                    ) * 1000; // 转换为米
                    
                    if (distToRoad < 50) { // 50米内认为在道路上
                      isOnRoad = true;
                      break;
                    }
                  } catch (error) {
                    // 跳过计算失败的点
                    continue;
                  }
                }
              }
              
              // 如果节点在道路上，优先连接；否则也连接（允许更大的容差）
              if (isOnRoad || distance * 1000 <= connectionRadius) {
                nearbyNodeIds.add(node.id);
              }
            }
          } catch (error) {
            // 跳过计算失败的节点
            continue;
          }
        }
      }
    }
  }
  
  // 连接到所有附近的节点
  const currentNode = nodeMap.get(nodeId);
  if (currentNode) {
    let connectedCount = 0;
    
    for (const nearbyNodeId of nearbyNodeIds) {
      const nearbyNode = nodeMap.get(nearbyNodeId);
      if (nearbyNode) {
        // 计算距离
        try {
          const distance = turf.distance(
            turf.point(point),
            turf.point(nearbyNode.coordinates),
            { units: 'kilometers' }
          ) * 1000; // 转换为米
          
          // 双向连接
          if (!currentNode.edges.find(e => e.nodeId === nearbyNodeId)) {
            currentNode.edges.push({ nodeId: nearbyNodeId, distance });
            connectedCount++;
          }
          if (!nearbyNode.edges.find(e => e.nodeId === nodeId)) {
            nearbyNode.edges.push({ nodeId, distance });
          }
        } catch (error) {
          // 跳过计算失败的连接
          continue;
        }
      }
    }
    
    console.log(`将投影点连接到 ${connectedCount} 个附近的道路节点（共找到 ${nearbyNodeIds.size} 个候选节点）`);
    
    // 如果没有连接到任何节点，尝试更宽松的策略：从所有节点中查找最近的
    if (connectedCount === 0) {
      console.warn('投影点未连接到任何道路节点，尝试更宽松的连接策略（从所有节点中查找最近的）...');
      
      // 从所有节点中查找最近的节点（扩大搜索范围）
      const expandedConnectionRadius = 2000; // 扩大到2公里
      
      const allCandidates: Array<{
        id: string;
        node: RoadNode;
        distance: number;
      }> = [];
      
      // 遍历所有节点，查找在扩展半径内的节点
      for (const node of nodes) {
        if (node.id === nodeId) {
          continue; // 跳过自己
        }
        
        try {
          const distance = turf.distance(
            turf.point(point),
            turf.point(node.coordinates),
            { units: 'kilometers' }
          ) * 1000; // 转换为米
          
          if (distance <= expandedConnectionRadius) {
            allCandidates.push({
              id: node.id,
              node,
              distance
            });
          }
        } catch (error) {
          // 跳过计算失败的节点
          continue;
        }
      }
      
      // 排序并连接最近的10个节点（增加连接数量）
      allCandidates.sort((a, b) => a.distance - b.distance);
      const nearestNodes = allCandidates.slice(0, 10);
      
      console.log(`找到 ${allCandidates.length} 个候选节点（扩展半径 ${expandedConnectionRadius} 米），将连接最近的 ${nearestNodes.length} 个节点`);
      
      for (const item of nearestNodes) {
        if (!currentNode.edges.find(e => e.nodeId === item.id)) {
          currentNode.edges.push({ nodeId: item.id, distance: item.distance });
          connectedCount++;
        }
        if (!item.node.edges.find(e => e.nodeId === nodeId)) {
          item.node.edges.push({ nodeId, distance: item.distance });
        }
      }
      
      console.log(`使用更宽松策略后，连接到 ${connectedCount} 个节点`);
      
      // 如果仍然没有连接，尝试连接最近的单个节点（无论距离多远）
      if (connectedCount === 0 && nodes.length > 0) {
        console.warn('仍然没有连接，尝试连接最近的单个节点（无论距离）...');
        const allNodesWithDistance = nodes
          .filter(n => n.id !== nodeId)
          .map(n => {
            try {
              const dist = turf.distance(
                turf.point(point),
                turf.point(n.coordinates),
                { units: 'kilometers' }
              ) * 1000;
              return { id: n.id, node: n, distance: dist };
            } catch {
              return { id: n.id, node: n, distance: Infinity };
            }
          })
          .sort((a, b) => a.distance - b.distance);
        
        if (allNodesWithDistance.length > 0) {
          const nearest = allNodesWithDistance[0];
          if (nearest.distance < Infinity) {
            currentNode.edges.push({ nodeId: nearest.id, distance: nearest.distance });
            nearest.node.edges.push({ nodeId, distance: nearest.distance });
            connectedCount++;
            console.log(`已连接到最近的节点，距离: ${(nearest.distance / 1000).toFixed(2)} 公里`);
          }
        }
      }
    }
  }
  
  return nodeId;
}

/**
 * Dijkstra 最短路径算法（优化版：使用优先队列和A*启发式）
 */
function dijkstraShortestPathOptimized(
  nodes: RoadNode[],
  nodeMap: Map<string, RoadNode>,
  startId: string,
  endId: string
): string[] | null {
  const startTime = Date.now();
  const maxExecutionTime = 5000; // 最大执行时间5秒
  
  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const unvisited = new Set<string>();

  // 获取终点坐标用于A*启发式
  const endNode = nodeMap.get(endId);
  if (!endNode) return null;
  const endCoords = endNode.coordinates;

  // 初始化
  nodes.forEach(node => {
    distances.set(node.id, Infinity);
    previous.set(node.id, null);
    unvisited.add(node.id);
  });
  distances.set(startId, 0);

  let iterations = 0;
  const maxIterations = nodes.length * 2; // 防止无限循环

  while (unvisited.size > 0) {
    // 检查超时
    if (Date.now() - startTime > maxExecutionTime) {
      console.warn('路径搜索超时，使用简化路径');
      return null;
    }
    
    if (iterations++ > maxIterations) {
      console.warn('路径搜索迭代次数过多，终止搜索');
      return null;
    }

    // 找到未访问节点中距离最小的（使用A*启发式优化）
    let currentId: string | null = null;
    let minScore = Infinity;

    unvisited.forEach(nodeId => {
      const dist = distances.get(nodeId) || Infinity;
      if (dist === Infinity) return;
      
      // A*启发式：距离 + 到终点的直线距离
      const node = nodeMap.get(nodeId);
      if (node) {
        const heuristic = turf.distance(
          turf.point(node.coordinates),
          turf.point(endCoords),
          { units: 'kilometers' }
        ) * 1000; // 转换为米
        const score = dist + heuristic;
        if (score < minScore) {
          minScore = score;
          currentId = nodeId;
        }
      }
    });

    if (!currentId || minScore === Infinity) {
      break;
    }

    if (currentId === endId) {
      // 找到目标，重构路径
      const path: string[] = [];
      let nodeId: string | null = endId;
      const maxPathLength = nodes.length; // 防止无限循环
      let pathLength = 0;
      
      while (nodeId && pathLength < maxPathLength) {
        path.unshift(nodeId);
        pathLength++;
        
        // 获取前一个节点
        const prevNodeId = previous.get(nodeId);
        if (!prevNodeId || prevNodeId === nodeId) {
          // 如果没有前一个节点或前一个节点是自身，说明已到达起点
          break;
        }
        nodeId = prevNodeId;
        
        // 确保起点被加入（如果没有在循环中加入）
        if (nodeId === startId && path[0] !== startId) {
          path.unshift(startId);
          break;
        }
      }
      
      // 确保路径以起点开始
      if (path.length > 0 && path[0] !== startId) {
        path.unshift(startId);
      }
      
      console.log(`路径搜索完成，迭代次数: ${iterations}，路径节点数: ${path.length}`);
      if (path.length < 2) {
        console.warn('重构的路径节点数不足，路径可能无效');
        return null;
      }
      return path;
    }

    unvisited.delete(currentId);
    const current = nodeMap.get(currentId);
    if (!current || !currentId) continue;

    // 更新邻居节点的距离
    // 此时 currentId 已确保不为 null（通过上面的检查）
    const currentIdString: string = currentId;
    current.edges.forEach(edge => {
      if (unvisited.has(edge.nodeId)) {
        const currentDist = distances.get(currentIdString);
        if (currentDist !== undefined) {
          const alt = currentDist + edge.distance;
          const targetDist = distances.get(edge.nodeId) || Infinity;
          if (alt < targetDist) {
            distances.set(edge.nodeId, alt);
            previous.set(edge.nodeId, currentIdString);
          }
        }
      }
    });
  }

  return null; // 未找到路径
}

/**
 * 清理坐标数组，移除重复的连续点
 */
function cleanCoordinates(coordinates: [number, number][]): [number, number][] {
  if (coordinates.length <= 2) return coordinates;

  const cleaned: [number, number][] = [coordinates[0]];
  const tolerance = 0.00001; // 容差

  for (let i = 1; i < coordinates.length - 1; i++) {
    const prev = coordinates[i - 1];
    const curr = coordinates[i];
    const next = coordinates[i + 1];

    // 如果当前点与前一个或下一个点相同（在容差内），跳过
    const distToPrev = turf.distance(turf.point(prev), turf.point(curr), { units: 'kilometers' });
    const distToNext = turf.distance(turf.point(curr), turf.point(next), { units: 'kilometers' });

    if (distToPrev * 1000 > tolerance * 111000 && distToNext * 1000 > tolerance * 111000) {
      cleaned.push(curr);
    }
  }

  cleaned.push(coordinates[coordinates.length - 1]);
  return cleaned;
}

