<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/modules/auth';

interface ToolAction {
  label: string;
  type: 'route' | 'external' | 'emit';
  value: string;
  extra?: string;
  roles?: string[];
}

interface ToolCard {
  title: string;
  icon: string;
  description: string;
  tags?: string[];
  actions: ToolAction[];
}

const router = useRouter();
const authStore = useAuthStore();

const currentRoles = computed(() => authStore.userInfo?.roles ?? []);

function hasRole(requireRoles?: string[]) {
  if (!requireRoles || requireRoles.length === 0) return true;
  return requireRoles.some(role => currentRoles.value.includes(role));
}

const tools: ToolCard[] = [
  {
    title: '地理概览分析',
    icon: 'mdi:earth',
    description: '梳理行政区划、边界面积、人口密度、主要城市与关键基础设施等基础数据。',
    tags: ['行政区划', '人口', '基础设施'],
    actions: [{ label: '在综合信息查看', type: 'route', value: '/main', extra: 'geoOverview' }]
  },
  {
    title: '地形地貌与气候',
    icon: 'mdi:terrain',
    description: '利用数字高程模型评估地势起伏、坡度、山河分布，以及气候类型与天气风险。',
    tags: ['DEM', '气候', '坡度'],
    actions: [{ label: '在综合信息查看', type: 'route', value: '/main', extra: 'terrainClimate' }]
  },
  {
    title: '交通与通行条件',
    icon: 'mdi:road-variant',
    description: '分析道路/铁路/航空枢纽可达性、通达时间、交通瓶颈与口岸情况。',
    tags: ['交通网络', '可达性'],
    actions: [{ label: '在综合信息查看', type: 'route', value: '/main', extra: 'transport' }]
  },
  {
    title: '资源与产业分布',
    icon: 'mdi:factory',
    description: '展示能源资源、农业产区、工业园区、港口产业带的空间分布与发展重点。',
    tags: ['能源', '产业布局'],
    actions: [{ label: '在综合信息查看', type: 'route', value: '/main', extra: 'resourceIndustry' }]
  },
  {
    title: '城市发展与土地利用',
    icon: 'mdi:city',
    description: '通过遥感影像和土地利用分类了解城市扩张、绿地比例、建设强度。',
    tags: ['土地利用', '遥感'],
    actions: [{ label: '在综合信息查看', type: 'route', value: '/main', extra: 'urbanLandUse' }]
  },
  {
    title: '安全与风险评估',
    icon: 'mdi:shield-cross',
    description: '整合地震、洪水、滑坡等自然灾害高风险区及社会事件信息，形成风险视图。',
    tags: ['灾害风险', '安全监测'],
    actions: [{ label: '在综合信息查看', type: 'route', value: '/main', extra: 'securityRisk' }]
  },
  {
    title: '人口与社会指标',
    icon: 'mdi:account-group',
    description: '展示族群、语言、宗教分布与教育、医疗设施密度，掌握社会结构与敏感点。',
    tags: ['人口', '社会指标'],
    actions: [{ label: '在综合信息查看', type: 'route', value: '/main', extra: 'populationSocial' }]
  },
  {
    title: '对外关系与边境态势',
    icon: 'mdi:border-none-variant',
    description: '关注边境接壤国、通道与争议区域，以及跨境合作项目与经贸联系。',
    tags: ['边境', '对外关系'],
    actions: [{ label: '在综合信息查看', type: 'route', value: '/main', extra: 'borderRelations' }]
  },
  {
    title: '实时 / 动态信息',
    icon: 'mdi:radar',
    description: '结合新闻、社交媒体或传感器数据，进行热点监测与舆情预警。',
    tags: ['舆情', '动态监测'],
    actions: [{ label: '在综合信息查看', type: 'route', value: '/main', extra: 'realtimeInfo' }]
  },
  {
    title: '关键设施定位',
    icon: 'mdi:map-marker-multiple',
    description: '定位中国使领馆、重要政府机构、医疗设施、国际组织等关键设施位置，便于访问规划与应急响应。',
    tags: ['使馆', '领事馆', '医院', '重要机构'],
    actions: [{ label: '在综合信息查看', type: 'route', value: '/main', extra: 'keyFacilities' }]
  },
  {
    title: '经济合作项目分布',
    icon: 'mdi:handshake',
    description: '展示一带一路项目、中资企业投资、重大合作项目的空间分布与投资规模，了解经济合作重点区域。',
    tags: ['一带一路', '投资项目', '中资企业', '合作项目'],
    actions: [{ label: '在综合信息查看', type: 'route', value: '/main', extra: 'economicProjects' }]
  },
  {
    title: '访问区域重点分析',
    icon: 'mdi:map-search',
    description: '针对访问城市和重点区域进行深度分析，包括人口密度、经济活动、文化背景等综合信息。',
    tags: ['访问城市', '重点区域', '热点', '活动区域'],
    actions: [{ label: '在综合信息查看', type: 'route', value: '/main', extra: 'visitAreas' }]
  },
  {
    title: '缓冲区分析',
    icon: 'mdi:circle-expand',
    description: '在关键设施、重要区域周围创建缓冲区，分析影响范围和服务覆盖区域，用于安全规划和应急响应。',
    tags: ['缓冲区', '影响范围', '服务范围'],
    actions: [{ label: '在地图上使用', type: 'route', value: '/main', extra: 'bufferAnalysis' }]
  },
  {
    title: '最近邻分析',
    icon: 'mdi:near-me',
    description: '查找指定位置最近的设施、边界、关键点等，快速定位最近的使馆、医院、机场等重要设施。',
    tags: ['最近邻', '查找', '定位'],
    actions: [{ label: '在地图上使用', type: 'route', value: '/main', extra: 'nearestNeighbor' }]
  },
  {
    title: '叠加分析',
    icon: 'mdi:layers-triple',
    description: '对多个图层进行叠加分析，包括交集、并集、差集等操作，识别重叠区域和共同特征。',
    tags: ['叠加', '交集', '并集'],
    actions: [{ label: '在地图上使用', type: 'route', value: '/main', extra: 'overlayAnalysis' }]
  },
  {
    title: '密度分析',
    icon: 'mdi:chart-scatter-plot',
    description: '计算点要素的密度分布，分析人口密度、设施密度、热点区域等，识别高密度聚集区。',
    tags: ['密度', '热点', '聚集'],
    actions: [{ label: '在地图上使用', type: 'route', value: '/main', extra: 'densityAnalysis' }]
  },
  {
    title: '外交访问路线规划',
    icon: 'mdi:route',
    description: '规划访问路线，显示访问城市、路线和备选路线，评估安全路线并估算各路线预计时间，避开高风险区域。',
    tags: ['访问路线', '外交', '行程规划', '安全路线'],
    actions: [{ label: '在地图上使用', type: 'route', value: '/main', extra: 'routePlanning' }]
  }
];

const GEO_OVERVIEW_DATA = {
  adminDivisions: [
    { name: '省级行政区', count: 23, note: '含直辖市与特别行政区' },
    { name: '地市级行政区', count: 108, note: '以省会/区域中心为主' },
    { name: '重点边境县', count: 36, note: '与周边国家接壤' }
  ],
  boundary: {
    area: '1,234,567 km²',
    coastline: '4,560 km',
    neighbors: ['北方 A 国', '西部 B 国', '东南 C 国']
  },
  populationDensity: {
    average: '135 人/km²',
    highest: { region: '东南沿海带', density: '510 人/km²' },
    lowest: { region: '西北高原区', density: '28 人/km²' }
  },
  majorCities: [
    { name: '首都城市', population: '1,800 万', role: '政治/金融中心' },
    { name: '港口枢纽', population: '1,200 万', role: '国际航运与制造' },
    { name: '内陆核心', population: '900 万', role: '交通与科技产业' }
  ],
  infrastructures: {
    energy: ['沿海 LNG 接收站 5 座', '主干油气管道 3 条'],
    transport: ['国家级机场 8 个', '深水港口 6 个', '高铁骨干线路 4 条'],
    communication: ['卫星地面站 12 处', '跨境光缆 3 条']
  }
};

type GeoOverview = typeof GEO_OVERVIEW_DATA;

const overviewVisible = ref(false);
const overviewLoading = ref(false);
const overviewData = ref<GeoOverview | null>(GEO_OVERVIEW_DATA);

function handleAction(action: ToolAction) {
  if (!hasRole(action.roles)) {
    window.$message?.warning('当前账号无权限访问该工具');
    return;
  }

  if (action.type === 'route') {
    const query = action.extra ? { geoAnalysis: action.extra } : undefined;
    router.push({ path: action.value, query });
  } else if (action.type === 'external') {
    window.open(action.value, '_blank');
  } else if (action.type === 'emit') {
    if (action.value === 'attribute') {
      router.push({ path: '/main', query: { openAttribute: '1' } });
    } else {
      window.$message?.info('功能开发中，敬请期待～');
    }
  }
}
</script>

<template>
  <div class="geo-tools-page">
    <div class="tool-grid">
      <ACard v-for="tool in tools" :key="tool.title" class="tool-card" :title="tool.title" :bordered="false">
        <template #extra>
          <IconifyIcon :icon="tool.icon" class="text-2xl text-primary" />
        </template>
        <p class="description">
          {{ tool.description }}
        </p>
        <div v-if="tool.tags?.length" class="tag-row">
          <ATag v-for="tag in tool.tags" :key="tag" color="blue-5">
            {{ tag }}
          </ATag>
        </div>
        <div class="actions">
          <AButton
            v-for="action in tool.actions"
            :key="action.label"
            type="primary"
            class="mr-2"
            @click="handleAction(action)"
          >
            {{ action.label }}
          </AButton>
        </div>
      </ACard>
    </div>

    <ADrawer v-model:open="overviewVisible" title="地理概览分析" width="640px" :mask-closable="false">
      <ASkeleton active :loading="overviewLoading">
        <div v-if="overviewData" class="overview-panel">
          <section>
            <h3>行政区划</h3>
            <ul>
              <li v-for="item in overviewData.adminDivisions" :key="item.name">
                <span class="label">{{ item.name }}</span>
                <span class="value">{{ item.count }}</span>
                <span class="note">{{ item.note }}</span>
              </li>
            </ul>
          </section>

          <section>
            <h3>边界与面积</h3>
            <div class="grid-2">
              <div>
                <div class="label">国土面积</div>
                <div class="value">{{ overviewData.boundary.area }}</div>
              </div>
              <div>
                <div class="label">海岸线长度</div>
                <div class="value">{{ overviewData.boundary.coastline }}</div>
              </div>
            </div>
            <div class="label mt-8px">接壤国家</div>
            <ATag v-for="country in overviewData.boundary.neighbors" :key="country" color="blue-5">
              {{ country }}
            </ATag>
          </section>

          <section>
            <h3>人口密度</h3>
            <div class="grid-3">
              <div>
                <div class="label">平均密度</div>
                <div class="value">{{ overviewData.populationDensity.average }}</div>
              </div>
              <div>
                <div class="label">最高密度</div>
                <div class="value">{{ overviewData.populationDensity.highest.density }}</div>
                <div class="note">{{ overviewData.populationDensity.highest.region }}</div>
              </div>
              <div>
                <div class="label">最低密度</div>
                <div class="value">{{ overviewData.populationDensity.lowest.density }}</div>
                <div class="note">{{ overviewData.populationDensity.lowest.region }}</div>
              </div>
            </div>
          </section>

          <section>
            <h3>主要城市</h3>
            <ul>
              <li v-for="city in overviewData.majorCities" :key="city.name">
                <span class="label">{{ city.name }}</span>
                <span class="value">{{ city.population }}</span>
                <span class="note">{{ city.role }}</span>
              </li>
            </ul>
          </section>

          <section>
            <h3>关键基础设施</h3>
            <div class="grid-3">
              <div>
                <div class="label">能源体系</div>
                <ul>
                  <li v-for="item in overviewData.infrastructures.energy" :key="item">{{ item }}</li>
                </ul>
              </div>
              <div>
                <div class="label">交通枢纽</div>
                <ul>
                  <li v-for="item in overviewData.infrastructures.transport" :key="item">{{ item }}</li>
                </ul>
              </div>
              <div>
                <div class="label">通信设施</div>
                <ul>
                  <li v-for="item in overviewData.infrastructures.communication" :key="item">{{ item }}</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </ASkeleton>
    </ADrawer>
  </div>
</template>

<style scoped>
.geo-tools-page {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.tool-card :deep(.ant-card-body) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.description {
  min-height: 48px;
  color: var(--text-color-2);
}

.tag-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.overview-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overview-panel section {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px 16px;
}

.overview-panel h3 {
  margin-bottom: 8px;
  font-size: 15px;
}

.overview-panel ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label {
  color: var(--text-color-2);
  margin-right: 8px;
}

.value {
  font-weight: 600;
  margin-right: 8px;
}

.note {
  color: var(--text-color-3);
}

.grid-2,
.grid-3 {
  display: grid;
  gap: 12px;
}

.grid-2 {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.grid-3 {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.mt-8px {
  margin-top: 8px;
}
</style>
