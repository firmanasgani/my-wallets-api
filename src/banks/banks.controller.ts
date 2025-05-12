import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { BanksService } from './banks.service';


@UseGuards(JwtAuthGuard)
@Controller('banks')
export class BanksController {
    constructor(
        private readonly banksService: BanksService
    ) {}

    @Get()
    findAll() {
        return this.banksService.findAll()
    }
}
