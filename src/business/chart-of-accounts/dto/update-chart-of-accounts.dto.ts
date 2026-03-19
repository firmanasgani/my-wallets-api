import { PartialType } from "@nestjs/mapped-types";
import { CreateChartOfAccountDto } from "./create-chart-of-accounts.dto";

export class UpdateChartOfAccountsDto extends PartialType(CreateChartOfAccountDto) {}