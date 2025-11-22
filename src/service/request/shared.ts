import { useAuthStore } from '@/store/modules/auth';
import { localStg } from '@/utils/storage';
import { fetchRefreshToken } from '../api';
import type { RequestInstanceState } from './type';

export function getAuthorization() {
  const token = localStg.get('token');
  // 仅当 token 为看起来像 JWT（三个段，用点分隔）时才附带
  const isJwt = typeof token === 'string' && token.split('.').length === 3;
  return isJwt ? `Bearer ${token}` : null;
}

/** refresh token */
async function handleRefreshToken() {
  const { resetStore } = useAuthStore();

  const rToken = localStg.get('refreshToken') || '';
  const newToken = await fetchRefreshToken(rToken as string);
  if (newToken && (newToken as any).token) {
    const t = (newToken as any).token as string;
    const rt = (newToken as any).refreshToken as string | undefined;
    localStg.set('token', t);
    localStg.set('refreshToken', rt || '');
    return true;
  }

  resetStore();

  return false;
}

export async function handleExpiredRequest(state: RequestInstanceState) {
  if (!state.refreshTokenFn) {
    state.refreshTokenFn = handleRefreshToken();
  }

  const success = await state.refreshTokenFn;

  setTimeout(() => {
    state.refreshTokenFn = null;
  }, 1000);

  return success;
}

export function showErrorMsg(state: RequestInstanceState, message: string) {
  if (!state.errMsgStack?.length) {
    state.errMsgStack = [];
  }

  const isExist = state.errMsgStack.includes(message);

  if (!isExist) {
    state.errMsgStack.push(message);

    window.$message?.error(message, 1.5, () => {
      state.errMsgStack = state.errMsgStack.filter(msg => msg !== message);

      setTimeout(() => {
        state.errMsgStack = [];
      }, 5000);
    });
  }
}
