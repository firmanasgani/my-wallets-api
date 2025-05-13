import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LogsService } from 'src/logs/logs.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { Category, CategoryType, LogActionType, Prisma } from '@prisma/client';
import { QueryCategoryDto } from './dto/query-category.dto';
import { UpdateCategoryDto } from './dto/update-catetogry.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private logsService: LogsService,
  ) {}

  async create(
    userId: string,
    createCategoryDto: CreateCategoryDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Category> {
    const { name, type, parentId, icon, color } = createCategoryDto;

    if (parentId) {
      const parentCategory = await this.prisma.category.findFirst({
        where: {
          id: parentId,

        },
      });

      if (!parentCategory)
        throw new NotFoundException(
          `Parent category with id ${parentId} not found`,
        );

      if (parentCategory.categoryType !== type) {
        throw new BadRequestException(
          `Child category Type must be ${parentCategory.categoryType}`,
        );
      }
    }

    const existingCategory = await this.prisma.category.findFirst({
      where: {
        categoryName: name,
        userId,
        parentCategoryId: parentId || null,
        categoryType: type,
      },
    });

    if (existingCategory)
      throw new BadRequestException('Category already exists');

    const category = await this.prisma.category.create({
      data: {
        categoryName: name,
        categoryType: type,
        userId,
        parentCategoryId: parentId || null,
        icon,
        color,
      },
    });

    await this.logsService.create({
      userId,
      actionType: LogActionType.CATEGORY_CREATE,
      entityType: 'Category',
      entityId: category.id,
      description: `Category ${category.categoryName} created`,
      details: { categoryId: category.id, ...createCategoryDto },
      ipAddress,
      userAgent,
    });

    return category;
  }

  async findAll(
    userId: string,
    queryDto: QueryCategoryDto,
  ): Promise<Category[] | any> {
    const {
      categoryType,
      includeGlobal = 'true',
      hierarchical = 'false',
      parentOnly,
    } = queryDto;
    const whereClause: Prisma.CategoryWhereInput = {
      OR: [
        
          { userId: userId},
        
      ],
      ...(categoryType && { categoryType: categoryType }),
    };

    if (hierarchical === 'true') {
      whereClause.parentCategoryId = null;
      if (parentOnly) {
        throw new BadRequestException(
          'Cannot use parentOnly when hierarchical is true',
        );
      }

      return this.prisma.category.findMany({
        where: whereClause,
        orderBy: { categoryName: 'asc' },
        include: {
          subCategories: {
            orderBy: { categoryName: 'asc' },
            include: {
              subCategories: {
                orderBy: { categoryName: 'asc' },
              },
            },
          },
        },
      });
    } else if (parentOnly) {
      const parentCategory = await this.prisma.category.findFirst({
        where: {
          id: parentOnly,
        },
      });

      if (!parentCategory)
        throw new NotFoundException(
          `Parent category with id ${parentOnly} not found`,
        );
      whereClause.parentCategoryId = parentOnly;

      return this.prisma.category.findMany({
        where: whereClause,
        orderBy: { categoryName: 'asc' },
      });
    }

    return this.prisma.category.findMany({
      where: whereClause,
      orderBy: [{ parentCategoryId: 'asc' }, { categoryName: 'asc' }],
      include: {
        parentCategory: {
          select: {
            categoryName: true,
            id: true,
          },
        },
      },
    });
  }

  async findOne(userId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        id,
      },
      include: {
        parentCategory: true,
        subCategories: {
          orderBy: { categoryName: 'asc' },
        },
      },
    });

    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(
    userId: string,
    categoryId: string,
    updateCategoryDto: UpdateCategoryDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Category> {
    const existingCategory = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        userId,
      },
    });

    if (!existingCategory) throw new NotFoundException('Category not found');

    const { name, type, parentId } = updateCategoryDto;

    if (parentId !== undefined) {
      if (parentId === categoryId) {
        throw new BadRequestException(
          'Parent ID cannot be same as category ID',
        );
      }

      if (parentId !== null) {
        const parentCategory = await this.prisma.category.findFirst({
          where: {
            id: parentId,
          },
        });

        if (!parentCategory)
          throw new NotFoundException('Parent category not found');
        const typeToCompare = type || existingCategory.categoryType;
        if (parentCategory.categoryType !== typeToCompare) {
          throw new BadRequestException(
            'Parent category type must be same as category type',
          );
        }
      }
    } else if (
      type &&
      parentId === undefined &&
      existingCategory.parentCategoryId
    ) {
      const parentCategory = await this.prisma.category.findUnique({
        where: { id: existingCategory.parentCategoryId },
      });

      if (parentCategory && parentCategory.categoryType !== type) {
        throw new BadRequestException(
          'Parent category type must be same as category type',
        );
      }
    }

    if (name !== undefined || parentId !== undefined || type !== undefined) {
      const nameToCheck =
        name === undefined ? existingCategory.categoryName : name;
      const parentIdToCheck =
        parentId === undefined
          ? existingCategory.parentCategoryId
          : parentId === null
            ? null
            : parentId;
      const typeToCheck =
        type === undefined ? existingCategory.categoryType : type;

      const duplicateCategory = await this.prisma.category.findFirst({
        where: {
          id: { not: categoryId },
          categoryName: nameToCheck,
          parentCategoryId: parentIdToCheck,
          categoryType: typeToCheck,
          userId,
        },
      });

      if (duplicateCategory) {
        throw new BadRequestException('Category already exists');
      }
    }

    const updatedCategory = await this.prisma.category.update({
      where: { id: categoryId },
      data: updateCategoryDto,
    });

    await this.logsService.create({
      userId,
      entityType: 'Category',
      entityId: categoryId,
      actionType: LogActionType.CATEGORY_UPDATE,
      description: 'Category updated',
      details: {
        categoryId: updatedCategory.id,
        ...updateCategoryDto,
      },
      ipAddress,
      userAgent,
    });

    return updatedCategory;
  }

  async remove(
    userId: string,
    id: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const category = await this.prisma.category.findFirst({
      where: {
        id,
      },
    });

    if (!category) throw new NotFoundException('Category not found');
    const relatedTransactionsCount = await this.prisma.transaction.count({
      where: {
        categoryId: id,
      },
    });

    if (relatedTransactionsCount > 0) {
      throw new BadRequestException('Category has related transactions');
    }

    const deletedCategory = await this.prisma.category.delete({
      where: {
        id,
      },
    });

    await this.logsService.create({
      userId,
      entityType: 'Category',
      entityId: id,
      actionType: LogActionType.CATEGORY_DELETE,
      description: 'Category deleted',
      details: {
        categoryId: deletedCategory.id,
        name: deletedCategory.categoryName,
      },
      ipAddress,
      userAgent,
    });

    return {
      message: 'Category deleted successfully',
      data: {
        id: deletedCategory.id,
        name: deletedCategory.categoryName,
      },
    };
  }
}
