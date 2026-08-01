export interface JwtPayload {
  sub: string;
  username: string;
  email?: string;
  type?: 'access' | 'refresh';
  jti?: string;
}
