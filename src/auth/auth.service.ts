import { ConflictException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { defaultCategoryTemplates } from 'src/common/category'
import { UsersService } from 'src/users/users.service';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { LogActionType, Prisma, User } from '@prisma/client';
import { LogsService } from 'src/logs/logs.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private prisma: PrismaService,
        private logsService: LogsService
    ) {}

    async register(
        RegisterDto: RegisterDto,
        ipAddress?: string,
        userAgent?: string
    ): Promise<Omit<User, 'passwordHash'>> {
        const { username, email, password ,fullName } = RegisterDto;

        const existingUserByEmail = await this.usersService.findByEmail(email);
        if (existingUserByEmail) {
            throw new ConflictException('Email already registered.')
        }
        const existingUserByUsername = await this.usersService.findByUsername(username);
        if (existingUserByUsername) {
            throw new ConflictException('Username already registered.')
        }
        const saltRounds = 10
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        try {
            const newUserAndCategories = await this.prisma.$transaction(async (tx) => {
                const newUser = await tx.user.create({
                    data: {
                        username,
                        email,
                        passwordHash: hashedPassword,
                        fullName: fullName || null
                    }
                })

                for (const template of defaultCategoryTemplates) {
                    const parentCategory = await tx.category.create({
                        data: {
                            categoryName: template.categoryName,
                            categoryType: template.categoryType,
                            userId: newUser.id,
                            parentCategoryId: null,
                            icon: template.icon,
                            color: template.color
                        }
                    })
                    if(template.subCategories && template.subCategories.length > 0) {
                        for(const subTemplate of template.subCategories) {
                            await tx.category.create({
                                data: {
                                    categoryName: subTemplate.categoryName,
                                    categoryType: subTemplate.categoryType,
                                    userId: newUser.id,
                                    parentCategoryId: parentCategory.id,
                                    icon: subTemplate.icon,
                                    color: subTemplate.color
                                }
                            })
                        }
                    }
                }

                return newUser
            })

            try {
                await this.logsService.create({
                    userId: newUserAndCategories.id,
                    actionType: LogActionType.USER_REGISTER,
                    entityType: 'USER',
                    entityId: newUserAndCategories.id,
                    description: `User ${newUserAndCategories.username} registered`,
                    details: { username: newUserAndCategories.username, method: 'credentials'},
                    ipAddress: ipAddress ?? "",
                    userAgent: userAgent ?? "",
                })
            } catch (error) {
                Logger.error('Failed to create log entry', {
                    errorMessage: error.message,
                    dto: {
                        userId: newUserAndCategories.id,
                        actionType: LogActionType.USER_REGISTER,
                        entityType: 'USER',
                        entityId: newUserAndCategories.id,
                        description: `User ${newUserAndCategories.username} registered`,
                        details: { username: newUserAndCategories.username, method: 'credentials'},
                        ipAddress: ipAddress ?? "",
                        userAgent: userAgent ?? "",
                    },
                    stack: error.stack,
                });
            }
            const { passwordHash, ...result } = newUserAndCategories;
            return result as Omit<User, 'passwordHash'>;
            
        }catch(error) {
            console.error("Error creating user:", error);
            throw new InternalServerErrorException('Error creating user');
        }
        
       
    }

    async validateUser(
        login: string, pass: string
    ): Promise<Omit<User, 'passwordHash'> | null> {
        let user = await this.usersService.findByEmail(login);
        if(!user) {
            user = await this.usersService.findByUsername(login);
        }

        if(user && user.passwordHash && (await bcrypt.compare(pass, user.passwordHash))) {
            const { passwordHash, ...result } = user;
            return result as Omit<User, 'passwordHash'>;
        }

        return null
    }

    async login(
        user: Omit<User, 'passwordHash'>,
        ipAddress?: string,
        userAgent?: string
    ) {
        const payload = { username: user.username, sub: user.id };
        try {
            await this.logsService.create({
                userId: user.id,
                actionType: LogActionType.USER_LOGIN,
                entityType: 'USER',
                entityId: user.id,
                description: `User ${user.username} logged in`,
                details: { username: user.username, method: 'credentials'},
                ipAddress: ipAddress ?? "",
                userAgent: userAgent ?? "",
            })
        }catch(
            error
        ) {
            console.log(`Failed to create log entry: ${error.message}`);
        }
        return {
            access_token: this.jwtService.sign(payload),
            user
        };
    }
}
