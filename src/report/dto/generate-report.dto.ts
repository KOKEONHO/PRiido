import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class GenerateReportDto {
  @IsString()
  @IsNotEmpty()
  repositoryId: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  prIds: string[];
}
