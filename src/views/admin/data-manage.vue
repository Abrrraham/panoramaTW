<template>
  <div class="h-full flex gap-4">
    <ACard class="w-1/3 h-full" title="图层目录">
      <ATree
        :tree-data="treeData"
        default-expand-all
        block-node
        :loading="loadingTree"
        @select="handleSelect"
      />
      <AButton class="mt-4 w-full" @click="refreshTree" :loading="loadingTree">
        刷新
      </AButton>
    </ACard>
    <ACard class="flex-1 h-full" :title="selectedNode?.title || '新增图层'">
      <AForm layout="vertical" :model="form" @submit.prevent="handleSubmit">
        <AFormItem label="父节点ID" required>
          <AInput v-model:value="form.parentId" placeholder="输入父节点 ID" />
        </AFormItem>
        <AFormItem label="类型">
          <ARadioGroup v-model:value="form.kind">
            <ARadio value="vector">矢量</ARadio>
            <ARadio value="raster">栅格</ARadio>
            <ARadio value="3d">3D Tiles</ARadio>
          </ARadioGroup>
        </AFormItem>
        <AFormItem label="图层名称" required>
          <AInput v-model:value="form.layerName" />
        </AFormItem>
        <AFormItem label="表名 / 文件名" required>
          <AInput v-model:value="form.tableName" />
        </AFormItem>
        <AFormItem label="SRID" v-if="form.kind === 'vector'">
          <AInput v-model:value="form.usage.srid" />
        </AFormItem>
        <AFormItem label="几何类型" v-if="form.kind === 'vector'">
          <ASelect
            v-model:value="form.usage.type"
            :options="geometryOptions"
            style="width: 200px"
          />
        </AFormItem>
        <AFormItem label="显示字段" v-if="form.kind === 'vector'">
          <AInput v-model:value="form.usage.visualizationField" placeholder="逗号分隔" />
        </AFormItem>
        <AFormItem label="详细字段" v-if="form.kind === 'vector'">
          <AInput v-model:value="form.usage.detailField" placeholder="逗号分隔" />
        </AFormItem>
        <AFormItem label="数据文件">
          <AUpload
            :file-list="fileList"
            :before-upload="beforeUpload"
            :max-count="1"
            @remove="handleRemove"
          >
            <AButton>选择文件</AButton>
          </AUpload>
        </AFormItem>
        <ASpace>
          <AButton type="primary" html-type="submit" :loading="submitting">
            保存
          </AButton>
          <AButton danger @click="handleDelete" :disabled="!selectedNode" :loading="deleting">
            删除所选图层
          </AButton>
        </ASpace>
      </AForm>
    </ACard>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { UploadProps } from 'ant-design-vue';
import {
  createVectorLayer,
  deleteVectorLayer,
  createRasterLayer,
  deleteRasterLayer,
  create3dLayer,
  delete3dLayer
} from '@/service/api/admin';
import { convertToTreeData, initData } from '@/utils/mapUtils/layerData';

const treeData = ref<any[]>([]);
const selectedNode = ref<any | null>(null);
const loadingTree = ref(false);
const submitting = ref(false);
const deleting = ref(false);
const fileList = ref<UploadProps['fileList']>([]);

const geometryOptions = [
  { value: 'point', label: '点' },
  { value: 'line', label: '线' },
  { value: 'polygon', label: '面' }
];

const form = reactive({
  parentId: '',
  kind: 'vector',
  layerName: '',
  tableName: '',
  usage: {
    srid: '4326',
    type: 'point',
    visualizationField: 'name',
    detailField: 'name'
  }
});

const beforeUpload: UploadProps['beforeUpload'] = file => {
  fileList.value = [file];
  return false;
};
const handleRemove: UploadProps['onRemove'] = () => {
  fileList.value = [];
  return true;
};

function buildFormData() {
  const fd = new FormData();
  fd.append(
    'info',
    JSON.stringify({
      parent_id: form.parentId,
      tableName: form.tableName,
      layerName: form.layerName,
      usage: form.usage
    })
  );
  const raw = fileList.value[0]?.originFileObj as File | undefined;
  if (raw) {
    fd.append('file', raw);
  }
  return fd;
}

async function refreshTree() {
  loadingTree.value = true;
  try {
    const data = await initData();
    const tree = convertToTreeData(data.children || []);
    treeData.value = tree;
  } finally {
    loadingTree.value = false;
  }
}

function handleSelect(_: any, info: any) {
  const raw = info.node?.dataRef ?? info.node;
  selectedNode.value = raw;
  form.parentId = raw?.key as string;
}

async function handleSubmit() {
  submitting.value = true;
  try {
    const fd = buildFormData();
    if (form.kind === 'vector') {
      await createVectorLayer(fd);
    } else if (form.kind === 'raster') {
      await createRasterLayer(fd);
    } else {
      await create3dLayer(fd);
    }
    window.$message?.success('保存成功');
    fileList.value = [];
    await refreshTree();
  } finally {
    submitting.value = false;
  }
}

async function handleDelete() {
  if (!selectedNode.value) return;
  deleting.value = true;
  try {
    const id = selectedNode.value.key as string;
    const type = selectedNode.value.category;
    if (type === 'vector') {
      await deleteVectorLayer(id);
    } else if (type === 'raster') {
      await deleteRasterLayer(id);
    } else if (type === '3DTile' || type === '3d' || type === '3DTiles') {
      await delete3dLayer(id);
    } else {
      window.$message?.warning('该节点不可删除');
      return;
    }
    window.$message?.success('已删除');
    selectedNode.value = null;
    await refreshTree();
  } finally {
    deleting.value = false;
  }
}

onMounted(refreshTree);
</script>

<style scoped>
.h-full {
  height: 100%;
}
</style>
