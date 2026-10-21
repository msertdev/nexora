import { IsIn } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsIn(['ADMIN', 'MEMBER'])
  role!: 'ADMIN' | 'MEMBER';
}
