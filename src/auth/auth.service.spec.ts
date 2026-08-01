import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService refresh tokens', () => {
  const user = {
    id: 'user-id',
    username: 'charlotte',
    isActive: true,
  };
  const usersService = {
    findById: jest.fn(),
  };
  const jwtService = new JwtService({
    secret: 'access-secret',
    signOptions: { expiresIn: '1h' },
  });
  const configService = new ConfigService({
    JWT_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_REFRESH_EXPIRES_IN: '7d',
  });
  const service = new AuthService(
    usersService as any,
    jwtService,
    {} as any,
    {} as any,
    {} as any,
    configService,
  );

  beforeEach(() => {
    usersService.findById.mockReset();
  });

  it('issues a new access token and rotates the refresh token', async () => {
    usersService.findById.mockResolvedValue(user);
    const initial = service.issueRefreshToken(user);

    const result = await service.refresh(initial.refreshToken);

    expect(result.access_token).toEqual(expect.any(String));
    expect(result.refresh.refreshToken).not.toBe(initial.refreshToken);
    expect(
      jwtService.verify(result.access_token, { secret: 'access-secret' }),
    ).toMatchObject({
      sub: user.id,
      username: user.username,
    });
  });

  it('rejects an access token at the refresh endpoint', async () => {
    const accessToken = jwtService.sign({
      sub: user.id,
      username: user.username,
    });

    await expect(service.refresh(accessToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects refresh tokens for inactive users', async () => {
    usersService.findById.mockResolvedValue({ ...user, isActive: false });
    const refreshToken = service.issueRefreshToken(user).refreshToken;

    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
