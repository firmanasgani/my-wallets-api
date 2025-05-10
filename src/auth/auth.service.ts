import { ConflictException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { LogActionType, Prisma, User } from '@prisma/client';
import { LogsService } from 'src/logs/logs.service';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
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
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        let user: User
        try {
            user = await this.usersService.create({
                username,
                email,
                passwordHash,
                fullName
            })

            
        }catch( error ) {
            if(error instanceof Prisma.PrismaClientUnknownRequestError) {
                throw new ConflictException("Username or Email already registered.");
            }
            throw new InternalServerErrorException('Could not register User.');
        }

        try {
            await this.logsService.create({
                actionType: LogActionType.USER_REGISTER,
                entityType: 'USER',
                entityId: user.id,
                description: 'User registered',
                details: {
                    username: user.username,
                    email: user.email,
                    fullName: user.fullName
                },
                ipAddress: ipAddress ?? "",
                userAgent: userAgent ?? "",
                userId: user.id
            })
        }catch( error ) {
            Logger.log(`Failed to create log entry: ${error.message}`);
        }

        return user
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
