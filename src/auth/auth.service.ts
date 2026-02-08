import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  async handleGithubLogin(user: any) {
    // member upsert + github access token 저장 로직 추후 추가 예정
    return { accessToken: user.accessToken };
  }
}
