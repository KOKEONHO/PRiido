import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RegisterRepositoryDto {
  @IsString()
  githubRepoId!: string;

  @IsString()
  fullName!: string; // owner/repo

  @IsOptional()
  @IsString()
  htmlUrl?: string;

  @IsBoolean()
  private!: boolean;
}
