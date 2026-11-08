import type { Request, Response } from 'express';
import { idParamSchema } from '../../shared/validation.js';
import { placeOrderSchema } from './orders.schemas.js';
import type { OrdersService } from './orders.service.js';

export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  placeOrder = async (req: Request, res: Response) => {
    const command = placeOrderSchema.parse(req.body);
    const order = await this.service.placeOrder(command);
    res.status(201).location(`/orders/${order.id}`).json(order);
  };

  cancelOrder = async (req: Request, res: Response) => {
    const orderId = idParamSchema.parse(req.params.orderId);
    res.json(await this.service.cancelOrder(orderId));
  };
}
