import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { CreateCategoryDto } from './dto/create-category.dto';
import { Request } from 'express';
import { User as UserModel } from '@prisma/client';
import { QueryCategoryDto } from './dto/query-category.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(
        @GetUser() user: UserModel,
        @Body() CreateCategoryDto: CreateCategoryDto,
        @Req() req : Request
    ) {
        const ipAddress = req.ip
        const userAgent = req.headers['user-agent']
        return this.categoriesService.create(user.id, CreateCategoryDto, ipAddress, userAgent);
    }

    @Get()
    findAll(
        @GetUser() user: UserModel,
        @Query() queryDto: QueryCategoryDto
    ) {
        return this.categoriesService.findAll(user.id, queryDto);
    }

    @Get(':id')
    findOne(@GetUser() user: UserModel, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
        return this.categoriesService.findOne(user.id, id);
    }

    @Patch(':id')
    update(
        @GetUser() user: UserModel,
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Body() updateCategoryDto: CreateCategoryDto,
        @Req() req : Request
    ) {
        const ipAddress = req.ip
        const userAgent = req.headers['user-agent']
        return this.categoriesService.update(user.id, id, updateCategoryDto, ipAddress, userAgent);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    remove(
        @GetUser() user: UserModel, 
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Req() req: Request
    ) {
        
        const ipAddress = req.ip
        const userAgent = req.headers['user-agent']
        return this.categoriesService.remove(user.id, id, ipAddress, userAgent);
    }
}
