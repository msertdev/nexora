import { IsString, MaxLength, MinLength } from 'class-validator';

export class ConfirmEmailVerificationDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token!: string;
}
