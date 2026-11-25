import { Controller, Get, Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { CatalogController } from './catalog.controller.js';
import { GameController } from './game.controller.js';
import { SocialController } from './social.controller.js';
import { AdminController } from './admin.controller.js';
import { DbService } from './db.service.js';
import { JwtAuthGuard } from './auth.guard.js';
import { WsGateway } from './ws.gateway.js';

@Controller('api')
class HealthController {
  constructor(private readonly db: DbService) {}

  @Get('health')
  async health() {
    const pg = await this.db.queryOne('SELECT 1 AS ok');
    return { status: 'ok', postgres: pg?.ok === 1, timestamp: new Date().toISOString() };
  }
}

@Module({
  controllers: [
    HealthController,
    AuthController,
    CatalogController,
    GameController,
    SocialController,
    AdminController,
  ],
  providers: [DbService, JwtAuthGuard, WsGateway],
})
export class AppModule {}
