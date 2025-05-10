import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService
    ) {}

    async register(
        RegisterDto: RegisterDto
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
        
        try {
            const user = await this.usersService.create({
                username,
                email,
                passwordHash,
                fullName
            })

            return user;
        }catch( error ) {
            if(error instanceof Prisma.PrismaClientUnknownRequestError) {
                throw new ConflictException("Username or Email already registered.");
            }
            throw new InternalServerErrorException('Could not register User.');
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

    async login(user: Omit<User, 'passwordHash'>) {
        const payload = { username: user.username, sub: user.id };
        return {
            access_token: this.jwtService.sign(payload),
            user
        };
    }
}
