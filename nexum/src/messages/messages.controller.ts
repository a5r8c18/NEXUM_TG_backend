import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { getCompanyId } from '../common/get-company-id';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('inbox')
  findInbox(@Req() req: Request) {
    const companyId = getCompanyId(req);
    const userId = (req as any).user?.id || '';
    return this.messagesService.findInbox(companyId, userId);
  }

  @Get('sent')
  findSent(@Req() req: Request) {
    const companyId = getCompanyId(req);
    const userId = (req as any).user?.id || '';
    return this.messagesService.findSent(companyId, userId);
  }

  @Get('unread-count')
  getUnreadCount(@Req() req: Request) {
    const companyId = getCompanyId(req);
    const userId = (req as any).user?.id || '';
    return this.messagesService.getUnreadCount(companyId, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.messagesService.findOne(id);
  }

  @Post()
  send(@Req() req: Request, @Body() body: any) {
    const companyId = getCompanyId(req);
    return this.messagesService.send(companyId, body);
  }

  @Put(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.messagesService.markAsRead(id);
  }

  @Put(':id/archive')
  archive(@Param('id') id: string) {
    return this.messagesService.archive(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.messagesService.remove(id);
  }
}
