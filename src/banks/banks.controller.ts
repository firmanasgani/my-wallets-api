import { Controller, Get } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { BanksService } from './banks.service';


@AuthGuard(JwtAuthGuard)
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
