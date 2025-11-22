import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { defineStore } from 'pinia';
import { useLoading } from '@sa/hooks';
import { SetupStoreId } from '@/enum';
import { useRouterPush } from '@/hooks/common/router';
import { localStg } from '@/utils/storage';
import { $t } from '@/locales';
import { useRouteStore } from '../route';
import { useTabStore } from '../tab';
import { clearAuthStorage, getToken } from './shared';
import { fetchGetUserInfo, fetchLogin } from '@/service/api/auth';

export const useAuthStore = defineStore(SetupStoreId.Auth, () => {
  const route = useRoute();
  const routeStore = useRouteStore();
  const tabStore = useTabStore();
  const { toLogin, redirectFromLogin } = useRouterPush(false);
  const { loading: loginLoading, startLoading, endLoading } = useLoading();

  const token = ref(getToken());

  const userInfo: Api.Auth.UserInfo = reactive({
    userId: '',
    userName: '',
    roles: [],
    buttons: []
  });

  const adminModeEnabled = ref(false);

  /** is super role in static route */
  const isStaticSuper = computed(() => {
    const { VITE_AUTH_ROUTE_MODE, VITE_STATIC_SUPER_ROLE } = import.meta.env;

    return VITE_AUTH_ROUTE_MODE === 'static' && userInfo.roles.includes(VITE_STATIC_SUPER_ROLE);
  });

  /** Is login */
  const isLogin = computed(() => Boolean(token.value));

  /** Reset auth store */
  async function resetStore() {
    const authStore = useAuthStore();

    clearAuthStorage();

    authStore.$reset();

    if (!route.meta.constant) {
      await toLogin();
    }

    tabStore.cacheTabs();
    routeStore.resetStore();
  }

  /**
   * Login
   */
  async function login(userName: string, password: string, redirect = true) {
    startLoading();

    let error = false;
    let loginToken: Api.Auth.LoginToken | null = null;
    try {
      const res = await fetchLogin({ userName, password });
      loginToken = { token: res.token, refreshToken: res.refreshToken || '' } as any;
      // 同步缓存用户名（使用原生 localStorage，避免 Local 键名类型约束）
      try { window.localStorage.setItem('login_user_name', userName); } catch {}
      // 立即设置一次用户信息，确保头部立刻展示用户名与管理员标识
      const preInfo = await fetchGetUserInfo(userName);
      Object.assign(userInfo, preInfo as any);
    } catch {
      error = true;
    }

    if (!error && loginToken) {
      const pass = await loginByToken(loginToken);
      if (pass) {
        await redirectFromLogin(redirect);
        window.$notification?.success({
          message: $t('page.login.common.loginSuccess'),
          description: $t('page.login.common.welcomeBack', { userName: userInfo.userName })
        });
      }
    } else {
      resetStore();
    }

    endLoading();
  }

  async function loginByToken(loginToken: Api.Auth.LoginToken) {
    localStg.set('token', loginToken.token);
    localStg.set('refreshToken', loginToken.refreshToken);

    const pass = await getUserInfo();
    if (pass) {
      token.value = loginToken.token;
      return true;
    }
    return false;
  }

  // 移除未使用的 extractUserNameFromToken，避免 TS6133

  async function getUserInfo() {
    try {
      const nameInStg = window.localStorage.getItem('login_user_name') || '';
      const info = await fetchGetUserInfo(nameInStg);
      Object.assign(userInfo, info as any);
      return true;
    } catch {
      return false;
    }
  }

  async function initUserInfo() {
    const hasToken = getToken();
    if (hasToken) {
      const pass = await getUserInfo();
      if (!pass) {
        resetStore();
      }
    }
  }

  function toggleAdminMode(enable?: boolean) {
    if (typeof enable === 'boolean') {
      adminModeEnabled.value = enable;
    } else {
      adminModeEnabled.value = !adminModeEnabled.value;
    }
  }

  return {
    token,
    userInfo,
    isStaticSuper,
    isLogin,
    loginLoading,
    adminModeEnabled,
    toggleAdminMode,
    resetStore,
    login,
    initUserInfo
  };
});
