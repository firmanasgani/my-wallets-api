import { IsBoolean, IsNotEmpty } from 'class-validator';

export class SetPayfestMethodDto {
  @IsNotEmpty()
  @IsBoolean()
  isEnabled: boolean;
}
