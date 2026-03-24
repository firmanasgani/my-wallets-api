import { PartialType } from '@nestjs/mapped-types';
import { CreateSuggestionRuleDto } from './create-suggestion-rule.dto';

export class UpdateSuggestionRuleDto extends PartialType(CreateSuggestionRuleDto) {}
