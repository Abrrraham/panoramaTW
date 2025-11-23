import { dataRequest } from '../request';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginToken {
  token: string;
  refreshToken?: string;
}

export interface UserInfo {
  userId: string;
  userName: string;
  roles: string[];
}

export function fetchLogin(payload: LoginPayload) {
  return dataRequest<LoginToken>({
    url: '/auth/login',
    method: 'post',
    data: payload
  });
}

export function fetchGetUserInfo() {
  return dataRequest<UserInfo>({
    url: '/auth/me',
    method: 'get'
  });
}

export function fetchRefreshToken(refreshToken: string) {
  return dataRequest<LoginToken>({
    url: '/auth/refresh',
    method: 'post',
    data: { refreshToken }
  });
}
