import { BACKEND_ERROR_CODE, createFlatRequest, createRequest } from '@sa/axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { $t } from '@/locales';
import { useAuthStore } from '@/store/modules/auth';
import { getServiceBaseURL } from '@/utils/service';
import { getAuthorization, handleExpiredRequest, showErrorMsg } from './shared';
import type { RequestInstanceState } from './type';

const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
// const { baseURL, otherBaseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);
// console.log(baseURL, otherBaseURL);

const { baseURL: envBaseURL } = getServiceBaseURL(import.meta.env, false);
const baseURL = envBaseURL || 'http://localhost:8765/api/v0';
const { otherBaseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);

// 调试信息
console.log('=== API 配置调试 ===');
console.log('isHttpProxy:', isHttpProxy);
console.log('baseURL:', baseURL);
console.log('otherBaseURL:', otherBaseURL);
console.log('otherBaseURL.data:', otherBaseURL.data);

// const defyAPI = 'app-lwFX37V0X4snwoV1SwLIVpXV';
const defyAPI = 'app-lFEpKbIBGMORGOL3Rc5U3x6k'; // 东盟

function applyAuthorizationHeader(config: InternalAxiosRequestConfig, authorization: string | null) {
  if (!authorization) {
    return;
  }
  const headers: any = config.headers ?? {};
  if (typeof headers.set === 'function') {
    headers.set('Authorization', authorization);
  } else {
    headers.Authorization = authorization;
  }
  config.headers = headers;
}

export const request = createFlatRequest<App.Service.Response, RequestInstanceState>(
  {
    baseURL,
    headers: {
      apifoxToken: 'XL299LiMEDZ0H5h3A29PxwQXdMJqWyY2'
    }
  },
  {
    async onRequest(config) {
      const Authorization = getAuthorization();
      // 登录/刷新 token 接口不附带旧的 Authorization
      const isAuthApi =
        typeof config.url === 'string' && (config.url.includes('/auth/login') || config.url.includes('/auth/refresh'));
      if (!isAuthApi) {
        applyAuthorizationHeader(config, Authorization);
      }

      return config;
    },
    isBackendSuccess(response) {
      // when the backend response code is "0000"(default), it means the request is success
      // to change this logic by yourself, you can modify the `VITE_SERVICE_SUCCESS_CODE` in `.env` file
      return String(response.data.code) === import.meta.env.VITE_SERVICE_SUCCESS_CODE;
    },
    async onBackendFail(response, instance) {
      const authStore = useAuthStore();
      const responseCode = String(response.data.code);

      function handleLogout() {
        authStore.resetStore();
      }

      function logoutAndCleanup() {
        handleLogout();
        window.removeEventListener('beforeunload', handleLogout);

        request.state.errMsgStack = request.state.errMsgStack.filter(msg => msg !== response.data.msg);
      }

      // when the backend response code is in `logoutCodes`, it means the user will be logged out and redirected to login page
      const logoutCodes = import.meta.env.VITE_SERVICE_LOGOUT_CODES?.split(',') || [];
      if (logoutCodes.includes(responseCode)) {
        handleLogout();
        return null;
      }

      // when the backend response code is in `modalLogoutCodes`, it means the user will be logged out by displaying a modal
      const modalLogoutCodes = import.meta.env.VITE_SERVICE_MODAL_LOGOUT_CODES?.split(',') || [];
      if (modalLogoutCodes.includes(responseCode) && !request.state.errMsgStack?.includes(responseCode)) {
        request.state.errMsgStack = [...(request.state.errMsgStack || []), response.data.msg];

        // prevent the user from refreshing the page
        window.addEventListener('beforeunload', handleLogout);

        window.$modal?.error({
          title: $t('common.error'),
          content: response.data.msg,
          okText: $t('common.confirm'),
          maskClosable: false,
          onOk() {
            logoutAndCleanup();
          },
          onCancel() {
            logoutAndCleanup();
          }
        });

        return null;
      }

      // when the backend response code is in `expiredTokenCodes`, it means the token is expired, and refresh token
      // the api `refreshToken` can not return error code in `expiredTokenCodes`, otherwise it will be a dead loop, should return `logoutCodes` or `modalLogoutCodes`
      const expiredTokenCodes = import.meta.env.VITE_SERVICE_EXPIRED_TOKEN_CODES?.split(',') || [];
      if (expiredTokenCodes.includes(responseCode)) {
        const success = await handleExpiredRequest(request.state);
        if (success) {
          const Authorization = getAuthorization();
          applyAuthorizationHeader(response.config, Authorization);

          return instance.request(response.config) as Promise<AxiosResponse>;
        }
      }

      return null;
    },
    transformBackendResponse(response) {
      return response.data.data;
    },
    onError(error) {
      // when the request is fail, you can show error message

      let message = error.message;
      let backendErrorCode = '';

      // get backend error message and code
      if (error.code === BACKEND_ERROR_CODE) {
        message = error.response?.data?.msg || message;
        backendErrorCode = String(error.response?.data?.code) || '';
      }

      // the error message is displayed in the modal
      const modalLogoutCodes = import.meta.env.VITE_SERVICE_MODAL_LOGOUT_CODES?.split(',') || [];
      if (modalLogoutCodes.includes(backendErrorCode)) {
        return;
      }

      // when the token is expired, refresh token and retry request, so no need to show error message
      const expiredTokenCodes = import.meta.env.VITE_SERVICE_EXPIRED_TOKEN_CODES?.split(',') || [];
      if (expiredTokenCodes.includes(backendErrorCode)) {
        return;
      }

      showErrorMsg(request.state, message);
    }
  }
);

export const demoRequest = createRequest<App.Service.DemoResponse>(
  {
    baseURL: otherBaseURL.demo
  },
  {
    async onRequest(config) {
      const Authorization = getAuthorization();
      applyAuthorizationHeader(config, Authorization);

      return config;
    },
    isBackendSuccess(response) {
      // when the backend response code is "200", it means the request is success
      // you can change this logic by yourself
      return response.data.status === '200';
    },
    async onBackendFail(_response) {
      // when the backend response code is not "200", it means the request is fail
      // for example: the token is expired, refresh token and retry request
    },
    transformBackendResponse(response) {
      return response.data.result;
    },
    onError(error) {
      // when the request is fail, you can show error message

      let message = error.message;

      // show backend error message
      if (error.code === BACKEND_ERROR_CODE) {
        message = error.response?.data?.message || message;
      }

      window.$message?.error(message);
    }
  }
);

export const dataRequest = createRequest<App.Service.DemoResponse>(
  {
    baseURL: otherBaseURL.data || 'http://localhost:8765/api/v0'
  },
  {
    async onRequest(config) {
      const Authorization = getAuthorization();
      applyAuthorizationHeader(config, Authorization);

      return config;
    },
    isBackendSuccess(response) {
      // when the backend response code is "200", it means the request is success
      // you can change this logic by yourself
      return response.status === 200;
    },
    async onBackendFail(_response) {
      // when the backend response code is not "200", it means the request is fail
      // for example: the token is expired, refresh token and retry request
    },
    transformBackendResponse(response) {
      return response.data;
    },
    onError(error) {
      // when the request is fail, you can show error message

      let message = error.message;

      // show backend error message
      if (error.code === BACKEND_ERROR_CODE) {
        message = error.response?.data?.message || message;
      }

      window.$message?.error(message);
    }
  }
);

export const dataRequestFlat = createFlatRequest<App.Service.Response, RequestInstanceState>(
  {
    baseURL: otherBaseURL.data || 'http://localhost:8765/api/v0',
    timeout: 30000
  },
  {
    async onRequest(config) {
      const Authorization = getAuthorization();
      applyAuthorizationHeader(config, Authorization);
      return config;
    },
    isBackendSuccess(response) {
      return response.status === 200;
    },
    transformBackendResponse(response) {
      return response.data;
    },
    onError(error) {
      let message = error.message;

      if (error.code === BACKEND_ERROR_CODE) {
        message = error.response?.data?.msg || message;
      }

      showErrorMsg(request.state, message);
    }
  }
);

export const difyRequest = createFlatRequest<App.Service.Response, RequestInstanceState>(
  {
    baseURL: otherBaseURL.dify,
    timeout: 30000
  },
  {
    async onRequest(config) {
      const { headers } = config;

      const Authorization = `Bearer ${defyAPI}`;
      Object.assign(headers, { Authorization, 'Content-Type': 'application/json' });

      return config;
    },
    isBackendSuccess(response) {
      return response.status === 200;
    },
    transformBackendResponse(response) {
      return response.data;
    },
    onError(error) {
      // when the request is fail, you can show error message
      let message = error.message;

      // get backend error message and code
      if (error.code === BACKEND_ERROR_CODE) {
        message = error.response?.data?.msg || message;
      }

      showErrorMsg(request.state, message);
    }
  }
);

export const mapRequestHead = otherBaseURL.data || 'http://localhost:8765/api/v0';

// 调试信息
console.log('=== 地图请求头调试 ===');
console.log('mapRequestHead:', mapRequestHead);
