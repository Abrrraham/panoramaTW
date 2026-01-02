<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Modal, message } from 'ant-design-vue';
import type { TablePaginationConfig, UploadProps } from 'ant-design-vue';
import dayjs from 'dayjs';
import { createRasterLayer, createVectorLayer, createVectorLayerShp } from '@/service/api/admin-data';
import { deleteLayerById, fetchLayerList, patchLayer } from '@/service/api/admin-layers';
import type { LayerListItem } from '@/service/api/admin-layers';
import { convertToTreeData, initData } from '@/utils/mapUtils/layerData';

const treeData = ref<any[]>([]);
const selectedNode = ref<any | null>(null);
const loadingTree = ref(false);

const layers = ref<LayerListItem[]>([]);
const layerLoading = ref(false);
const paging = reactive({ page: 1, size: 20, total: 0 });
const statusFilter = ref<string>('');
const keyword = ref<string>('');

const submitting = ref(false);
const fileList = ref<UploadProps['fileList']>([]);

const renameModalVisible = ref(false);
const renameValue = ref('');
const renameTarget = ref<LayerListItem | null>(null);

const form = reactive({
  parentId: '',
  kind: 'vector-geojson',
  layerName: '',
  tableName: '',
  srid: '4326',
  vectorType: 'point',
  rasterMinZoom: '0',
  rasterMaxZoom: '18',
  rasterSize: '256',
  rasterTileType: 'land_gdal'
});

const kindOptions = [
  { value: 'vector-geojson', label: '矢量 GeoJSON' },
  { value: 'vector-shp', label: '矢量 SHP(zip)' },
  { value: 'raster', label: '栅格 GeoTIFF' }
];

const geometryOptions = [
  { value: 'point', label: '点' },
  { value: 'line', label: '线' },
  { value: 'polygon', label: '面' }
];

const rasterTileOptions = [
  { value: 'land_gdal', label: 'z/x/y.png' },
  { value: 'land', label: 'x-y-z.png' }
];

const statusOptions = [
  { value: '', label: '全部' },
  { value: 'READY', label: 'READY' },
  { value: 'RUNNING', label: 'RUNNING' },
  { value: 'FAILED', label: 'FAILED' },
  { value: 'DISABLED', label: 'DISABLED' }
];

const canSubmit = computed(
  () => form.layerName.trim() !== '' && form.tableName.trim() !== '' && form.parentId.trim() !== ''
);

const columns = [
  { title: '名称', key: 'layerName' },
  { title: '类型', key: 'category' },
  { title: '格式', key: 'format' },
  { title: '状态', key: 'status' },
  { title: '创建时间', key: 'createdAt' },
  { title: '操作', key: 'actions' }
];

const pagination = computed(() => ({
  current: paging.page,
  pageSize: paging.size,
  total: paging.total,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`
}));

const asLayer = (record: Record<string, any>) => record as LayerListItem;

const beforeUpload: UploadProps['beforeUpload'] = file => {
  const name = (file.name || '').toLowerCase();
  const allowGeoJson = form.kind === 'vector-geojson' && (name.endsWith('.json') || name.endsWith('.geojson'));
  const allowShp = form.kind === 'vector-shp' && name.endsWith('.zip');
  const allowTif = form.kind === 'raster' && (name.endsWith('.tif') || name.endsWith('.tiff') || name.endsWith('.zip'));
  if (!allowGeoJson && !allowShp && !allowTif) {
    message.error('文件类型不匹配');
    fileList.value = [];
    return false;
  }
  fileList.value = [file];
  if (!form.tableName) {
    const base = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;
    form.tableName = base;
  }
  if (!form.layerName) {
    form.layerName = form.tableName;
  }
  return false;
};

const handleRemove: UploadProps['onRemove'] = () => {
  fileList.value = [];
  return true;
};

function buildFormData() {
  const fd = new FormData();
  const usage: Record<string, string> = {};
  if (form.kind === 'vector-geojson' || form.kind === 'vector-shp') {
    usage.srid = form.srid || '4326';
    usage.type = form.vectorType;
    usage.visualizationField = '';
    usage.detailField = '';
  }
  if (form.kind === 'raster') {
    usage.minZoom = form.rasterMinZoom || '0';
    usage.maxZoom = form.rasterMaxZoom || '18';
    usage.size = form.rasterSize || '256';
    usage.type = form.rasterTileType || 'land_gdal';
  }

  const infoPayload = {
    parent_id: form.parentId,
    tableName: form.tableName,
    layerName: form.layerName,
    usage,
    propertyType: {}
  };

  fd.append('info', new Blob([JSON.stringify(infoPayload)], { type: 'application/json' }));
  return fd;
}

function getUploadFile(): File | Blob | null {
  const item = (fileList.value || [])[0] as any;
  const raw = item?.originFileObj ?? item;
  if (raw instanceof Blob) {
    return raw as File | Blob;
  }
  return null;
}

function buildFormDataWithFile(rawFile: File | Blob) {
  const fd = buildFormData();
  const fileName = (rawFile as any).name || 'upload.bin';
  fd.append('file', rawFile, fileName);
  return fd;
}

function resetForm(parentId = '') {
  form.parentId = parentId;
  form.kind = 'vector-geojson';
  form.layerName = '';
  form.tableName = '';
  form.srid = '4326';
  form.vectorType = 'point';
  form.rasterMinZoom = '0';
  form.rasterMaxZoom = '18';
  form.rasterSize = '256';
  form.rasterTileType = 'land_gdal';
  fileList.value = [];
}

async function refreshTree() {
  loadingTree.value = true;
  try {
    const data = await initData();
    const tree = convertToTreeData(data.children || [], data.id) ?? [];
    treeData.value = tree;
  } finally {
    loadingTree.value = false;
  }
}

async function refreshLayers() {
  layerLoading.value = true;
  try {
    const res = await fetchLayerList({
      page: paging.page,
      size: paging.size,
      status: statusFilter.value || undefined,
      keyword: keyword.value || undefined
    });
    if (res.status !== 'success' || !res.data) {
      message.error(res.message || '加载图层列表失败');
      return;
    }
    layers.value = res.data.items || [];
    paging.total = res.data.total || 0;
  } finally {
    layerLoading.value = false;
  }
}

function handleSelect(_: any, info: any) {
  const raw = info.node?.dataRef ?? info.node;
  selectedNode.value = raw;
  if (!raw) return;
  const targetParent = raw.isLayer ? raw.parentId || '' : (raw.key as string);
  resetForm(targetParent);
}

function handleTableChange(paginationInfo: TablePaginationConfig) {
  if (paginationInfo.current) {
    paging.page = paginationInfo.current;
  }
  if (paginationInfo.pageSize) {
    paging.size = paginationInfo.pageSize;
  }
  refreshLayers();
}

async function handleSubmit() {
  submitting.value = true;
  try {
    if (!canSubmit.value) {
      message.warning('请先选择父节点');
      return;
    }
    if (!fileList.value?.length) {
      message.warning('请先选择文件');
      return;
    }
    const rawFile = getUploadFile();
    if (!rawFile) {
      message.error('未读取到上传文件，请重新选择');
      return;
    }
    if (form.kind === 'raster' && Number(form.rasterMinZoom) > Number(form.rasterMaxZoom)) {
      message.warning('最小缩放级别不能大于最大缩放级别');
      return;
    }

    const fd = buildFormDataWithFile(rawFile);
    let result: any;

    if (form.kind === 'vector-geojson') {
      result = await createVectorLayer(fd);
    } else if (form.kind === 'vector-shp') {
      result = await createVectorLayerShp(fd);
    } else {
      result = await createRasterLayer(fd);
    }

    if (result?.status === 'success') {
      message.success('上传成功');
    } else if (result?.status === 'running') {
      message.success('已提交切片任务');
    } else {
      message.error(result?.message || '上传失败');
      return;
    }

    const parentId = form.parentId;
    resetForm(parentId);
    await refreshTree();
    await refreshLayers();
  } finally {
    submitting.value = false;
  }
}

async function toggleLayerStatus(layer: LayerListItem) {
  const status = layer.usage?.status || 'READY';
  const nextStatus = status === 'DISABLED' ? 'READY' : 'DISABLED';
  const res = await patchLayer(layer.id, { status: nextStatus });
  if (res.status === 'success') {
    message.success('状态已更新');
    await refreshLayers();
    await refreshTree();
  } else {
    message.error(res.message || '状态更新失败');
  }
}

function openRenameModal(layer: LayerListItem) {
  renameTarget.value = layer;
  renameValue.value = layer.layerName;
  renameModalVisible.value = true;
}

async function confirmRename() {
  if (!renameTarget.value) return;
  const name = renameValue.value.trim();
  if (!name) {
    message.warning('请输入图层名称');
    return;
  }
  const res = await patchLayer(renameTarget.value.id, { layerName: name });
  if (res.status === 'success') {
    message.success('重命名成功');
    renameModalVisible.value = false;
    await refreshLayers();
    await refreshTree();
  } else {
    message.error(res.message || '重命名失败');
  }
}

async function handleDeleteLayer(layer: LayerListItem) {
  Modal.confirm({
    title: '确认删除图层',
    content: `确认删除图层 ${layer.layerName}？`,
    async onOk() {
      const res = await deleteLayerById(layer.id);
      if (res.status === 'success') {
        message.success('删除成功');
        await refreshLayers();
        await refreshTree();
      } else {
        message.error(res.message || '删除失败');
      }
    }
  });
}

function statusColor(status?: string) {
  switch ((status || '').toUpperCase()) {
    case 'READY':
      return 'green';
    case 'RUNNING':
      return 'blue';
    case 'FAILED':
      return 'red';
    case 'DISABLED':
      return 'default';
    default:
      return 'default';
  }
}

function formatTime(value?: number) {
  if (!value) return '-';
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

onMounted(async () => {
  await refreshTree();
  await refreshLayers();
});
</script>

<template>
  <div class="h-full flex gap-4">
    <ACard class="h-full w-1/3" title="图层目录">
      <ATree :tree-data="treeData" default-expand-all block-node :loading="loadingTree" @select="handleSelect" />
      <ASpace class="mt-4">
        <AButton :loading="loadingTree" @click="refreshTree">刷新目录</AButton>
        <AButton :loading="layerLoading" @click="refreshLayers">刷新列表</AButton>
      </ASpace>
    </ACard>

    <div class="h-full flex flex-col flex-1 gap-4">
      <ACard title="上传图层">
        <AForm layout="vertical" :model="form" @submit.prevent="handleSubmit">
          <AFormItem label="父节点ID" required>
            <AInput v-model:value="form.parentId" placeholder="请选择左侧目录" disabled />
          </AFormItem>
          <AFormItem label="类型" required>
            <ASelect v-model:value="form.kind" :options="kindOptions" style="width: 240px" />
          </AFormItem>
          <AFormItem label="图层名称" required>
            <AInput v-model:value="form.layerName" />
          </AFormItem>
          <AFormItem label="表名 / 标识" required>
            <AInput v-model:value="form.tableName" />
          </AFormItem>

          <template v-if="form.kind.startsWith('vector')">
            <AFormItem label="SRID" required>
              <AInput v-model:value="form.srid" />
            </AFormItem>
            <AFormItem label="几何类型">
              <ASelect v-model:value="form.vectorType" :options="geometryOptions" style="width: 200px" />
            </AFormItem>
          </template>

          <template v-if="form.kind === 'raster'">
            <AFormItem label="最小缩放级别">
              <AInput v-model:value="form.rasterMinZoom" />
            </AFormItem>
            <AFormItem label="最大缩放级别">
              <AInput v-model:value="form.rasterMaxZoom" />
            </AFormItem>
            <AFormItem label="切片尺寸">
              <AInput v-model:value="form.rasterSize" />
            </AFormItem>
            <AFormItem label="切片命名">
              <ASelect v-model:value="form.rasterTileType" :options="rasterTileOptions" style="width: 200px" />
            </AFormItem>
          </template>

          <AFormItem label="上传文件" required>
            <AUpload :file-list="fileList" :before-upload="beforeUpload" :max-count="1" @remove="handleRemove">
              <AButton>选择文件</AButton>
            </AUpload>
          </AFormItem>

          <ASpace>
            <AButton type="primary" html-type="submit" :disabled="!canSubmit" :loading="submitting">提交</AButton>
          </ASpace>
        </AForm>
      </ACard>

      <ACard title="图层列表">
        <div class="mb-3 flex items-center gap-2">
          <ASelect v-model:value="statusFilter" :options="statusOptions" style="width: 160px" />
          <AInput v-model:value="keyword" placeholder="名称 / 表名" style="width: 200px" />
          <AButton @click="refreshLayers">查询</AButton>
        </div>
        <ATable
          :data-source="layers"
          :columns="columns"
          :pagination="pagination"
          :loading="layerLoading"
          row-key="id"
          @change="handleTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'layerName'">
              <span>{{ record.layerName }}</span>
            </template>
            <template v-else-if="column.key === 'category'">
              <span>{{ record.category }}</span>
            </template>
            <template v-else-if="column.key === 'format'">
              <span>{{ record.usage?.format || '-' }}</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <ATooltip v-if="record.usage?.status === 'FAILED'" :title="record.usage?.errorMessage || '失败原因未知'">
                <ATag :color="statusColor(record.usage?.status)">{{ record.usage?.status }}</ATag>
              </ATooltip>
              <ATag v-else :color="statusColor(record.usage?.status)">{{ record.usage?.status || 'READY' }}</ATag>
            </template>
            <template v-else-if="column.key === 'createdAt'">
              <span>{{ formatTime(record.createdAt) }}</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <ASpace>
                <AButton size="small" @click="toggleLayerStatus(asLayer(record))">
                  {{ record.usage?.status === 'DISABLED' ? '启用' : '禁用' }}
                </AButton>
                <AButton size="small" @click="openRenameModal(asLayer(record))">重命名</AButton>
                <AButton danger size="small" @click="handleDeleteLayer(asLayer(record))">删除</AButton>
              </ASpace>
            </template>
          </template>
        </ATable>
      </ACard>
    </div>
  </div>

  <AModal
    v-model:open="renameModalVisible"
    title="重命名图层"
    :mask-closable="false"
    @ok="confirmRename"
    @cancel="() => (renameModalVisible = false)"
  >
    <AInput v-model:value="renameValue" placeholder="请输入新名称" />
  </AModal>
</template>

<style scoped>
.h-full {
  height: 100%;
}
</style>
