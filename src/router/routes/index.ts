import type { CustomRoute, ElegantConstRoute, ElegantRoute } from '@elegant-router/types';
import { layouts, views } from '../elegant/imports';
import { generatedRoutes } from '../elegant/routes';
import { transformElegantRoutesToVueRoutes } from '../elegant/transform';

/**
 * custom routes
 *
 * @link https://github.com/soybeanjs/elegant-router?tab=readme-ov-file#custom-route
 *
 * 说明：这里的自定义路由名称、路径等不在 `@elegant-router/types` 自动生成的 RouteKey 联合类型中，
 * 为避免类型报错，使用 `as any` 放宽类型检查，仅在此处关闭严格校验。
 */
const customRoutes: CustomRoute[] = [
  {
    // 后台数据管理独立菜单
    name: 'admin-data-manage',
    path: '/admin/data-manage',
    component: 'layout.base$view.admin-data-manage',
    meta: {
      // 直接使用标题文案，而不走 i18n Key，避免与自动生成的 I18nRouteKey 冲突
      title: '数据管理',
      icon: 'mdi:database-cog',
      roles: ['ROLE_ADMIN'],
      order: 10
    }
  },
  {
    // 地理分析：作为一级菜单替代「系统功能」
    name: 'geo-tools',
    path: '/geo-tools',
    component: 'layout.base$view.function_geo-tools',
    meta: {
      // 这里沿用自动生成的 i18n key，避免与 I18nRouteKey 类型不一致
      title: 'function_geo-tools',
      i18nKey: 'route.function_geo-tools',
      icon: 'mdi:earth',
      order: 6
    }
  }
] as any;

/** create routes when the auth route mode is static */
export function createStaticRoutes() {
  const constantRoutes: ElegantRoute[] = [];

  const authRoutes: ElegantRoute[] = [];

  [...customRoutes, ...generatedRoutes].forEach(item => {
    if (item.meta?.constant) {
      constantRoutes.push(item);
    } else {
      authRoutes.push(item);
    }
  });

  return {
    constantRoutes,
    authRoutes
  };
}

/**
 * Get auth vue routes
 *
 * @param routes Elegant routes
 */
export function getAuthVueRoutes(routes: ElegantConstRoute[]) {
  return transformElegantRoutesToVueRoutes(routes, layouts, views);
}
