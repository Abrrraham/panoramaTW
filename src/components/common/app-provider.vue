<script setup lang="ts">
import { createTextVNode, defineComponent, onMounted, onUnmounted } from 'vue';
import { App } from 'ant-design-vue';

defineOptions({
  name: 'AppProvider'
});

const ContextHolder = defineComponent({
  name: 'ContextHolder',
  setup() {
    const { message, modal, notification } = App.useApp();

    function register() {
      window.$message = message;
      window.$modal = modal;
      window.$notification = notification;
    }

    register();

    return () => createTextVNode();
  }
});

// 全局禁用浏览器默认右键菜单，仅保留系统自定义右键逻辑
function preventNativeContextMenu(e: MouseEvent) {
  e.preventDefault();
}

onMounted(() => {
  window.addEventListener('contextmenu', preventNativeContextMenu, { capture: true });
});

onUnmounted(() => {
  window.removeEventListener('contextmenu', preventNativeContextMenu, { capture: true } as any);
});
</script>

<template>
  <App class="h-full">
    <ContextHolder />
    <slot></slot>
  </App>
</template>

<style scoped></style>
