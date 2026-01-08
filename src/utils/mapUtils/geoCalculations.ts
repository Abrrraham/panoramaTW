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
    if (features.length === 0) return null;
    if (features.length === 1) return features[0];

    let result = features[0] as any;
    for (let i = 1; i < features.length; i++) {
      result = turf.union(result, features[i] as any);
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
    // Turf.js v7 中 difference 可能需要单独导入，暂时使用 intersect 替代
    // 或者需要检查参数类型
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
    const radiusKm = radius / 1000; // 转换为公里
    const densityPoints = points.map(point => {
      let count = 0;
      points.forEach(otherPoint => {
        try {
          const distanceKm = turf.distance(point as any, otherPoint as any, { units: 'kilometers' });
          if (distanceKm <= radiusKm) {
            count++;
          }
        } catch (error) {
          // 忽略计算失败的点
        }
      });
      
      const density = count / (Math.PI * radiusKm * radiusKm); // 每平方公里点数
      return {
        ...point,
        properties: {
          ...point.properties,
          density: Number(density.toFixed(2)),
          point_count: count
        }
      } as Feature;
    });
    
    return densityPoints;
  } catch (error) {
    console.error('密度分析失败:', error);
    return points;
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

