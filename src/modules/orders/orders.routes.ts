import { Router } from 'express';
import type { OrdersController } from './orders.controller.js';

export function ordersRoutes(controller: OrdersController): Router {
  return Router().post('/', controller.placeOrder).post('/:orderId/cancel', controller.cancelOrder);
}
