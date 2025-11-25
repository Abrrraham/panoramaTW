<script setup lang="ts">
import { Modal } from 'ant-design-vue';
import { useAuthStore } from '@/store/modules/auth';
import { $t } from '@/locales';

defineOptions({
  name: 'UserAvatar'
});

const authStore = useAuthStore();

// 已移除未使用的 loginOrRegister，避免 TS6133

function logout() {
  Modal.confirm({
    title: $t('common.tip'),
    content: $t('common.logoutConfirm'),
    okText: $t('common.confirm'),
    cancelText: $t('common.cancel'),
    onOk: () => {
      authStore.resetStore();
    }
  });
}
</script>

<template>
  <!-- 隐藏登录按钮，直接展示用户下拉（未登录时显示占位用户名） -->
  <ADropdown placement="bottomRight" trigger="click">
    <ButtonIcon>
      <SvgIcon icon="ph:user-circle" class="text-icon-large" />
      <span class="text-16px font-medium">{{ authStore.userInfo.userName || 'Guest' }}</span>
    </ButtonIcon>
    <template #overlay>
      <AMenu>
        <AMenuItem @click="logout">
          <div class="flex-center gap-8px">
            <SvgIcon icon="ph:sign-out" class="text-icon" />
            {{ $t('common.logout') }}
          </div>
        </AMenuItem>
      </AMenu>
    </template>
  </ADropdown>
</template>

<style scoped></style>
