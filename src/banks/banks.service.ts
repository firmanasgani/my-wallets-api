import { Injectable } from '@nestjs/common';
import { Bank } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class BanksService {
    constructor(
        private Prisma: PrismaService
    ) {}

    async findAll(): Promise<Bank[]> {
        const banks = await this.Prisma.bank.findMany({
            orderBy: { name: 'asc' }
        })
        return banks
    }
}
