/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// export default {
// 	async fetch(request, env, ctx): Promise<Response> {
// 		return new Response('Hello World!');
// 	},
// } satisfies ExportedHandler<Env>;

import { configureAppServer } from "@friendsofshopware/app-server/framework/hono";
import { CloudflareShopRepository } from "@friendsofshopware/app-server/service/cloudflare-workers";
import { Hono } from "hono";
import type {
  AppServer,
  Context,
  ShopInterface,
} from "@friendsofshopware/app-server";
import { createNotificationResponse } from "@friendsofshopware/app-server/helper/app-actions";
import Mustache from 'mustache';
import test from './index.html';

const app = new Hono();

declare module "hono" {
  interface ContextVariableMap {
    app: AppServer;
    shop: ShopInterface;
    context: Context;
  }
}

configureAppServer(app, {
	appName: 'BasicExampleApp',
	appSecret: 'MySecret',
	shopRepository: (ctx) => {
	  return new CloudflareShopRepository(ctx.env.shopStorage);
	}
});

app.post('/app/action-button/product', async ctx => {
  console.log(`Got request from Shop ${ctx.get('shop').getShopId()}`)
  return createNotificationResponse('success', 'YEAA');
});

app.post('/app/event/order-placed', async ctx => {
	const response = ctx.get('context').payload;
	const order = response.data.payload.order;
	const orderCustomer = order.orderCustomer;

	const result = await checkSanctions(orderCustomer);

	if (result.hit) {
		await ctx.get('context').httpClient.post('/notification', {
			status: 'warning',
			message: `The customer ${orderCustomer.firstName} ${orderCustomer.lastName} associated with this order ${order.orderNumber} appears on a sanctions list.`,
		});

		await ctx.env.MY_DB.prepare('INSERT INTO reports VALUES (?1, ?2, ?3, ?4)').bind(order.id, response.source.shopId, `${orderCustomer.firstName} ${orderCustomer.lastName}`, Date.now()).run();
	}

	return new Response(response.data.payload.order);
});

app.post('/app/order/check-sanction', async ctx => {
	const response = ctx.get('context').payload;

	const orderResponse = await ctx.get('context').httpClient.post('/search/order', {
		ids: response.data.ids
	});

	const order = orderResponse.body.data[0];
	const result = await checkSanctions(order.orderCustomer);

	if (result.hit) {
		await ctx.get('context').httpClient.post('/notification', {
			status: 'warning',
			message: `The customer ${order.orderCustomer.firstName} ${order.orderCustomer.lastName} associated with this order ${order.orderNumber} appears on a sanctions list.`,
		});

		await ctx.env.MY_DB.prepare('INSERT INTO reports VALUES (?1, ?2, ?3, ?4)').bind(order.id, response.source.shopId, `${order.orderCustomer.firstName} ${order.orderCustomer.lastName}`, Date.now()).run();
	}

	return new Response(result);
});

async function checkSanctions(orderCustomer) {
	const response = await fetch('https://sanctions.shyim.workers.dev', {
		method: 'POST',
		headers: {
		  "Content-Type": 'application/json',
		},

		body: JSON.stringify([{
			type: 'Person',
			data: {
				name: `${orderCustomer.firstName} ${orderCustomer.lastName}`
			}
		}]),
	});

	const result = await response.json();

	return result;
}

app.get('/', async ctx => {
	const data = await ctx.env.MY_DB.prepare('SELECT * FROM reports').run();

	return new Response(
		Mustache.render(
			test,
			{
				title: 'Sanction list',
				list: data.results
			}
		)
		,
		{
			headers: {
				"Content-Type": "text/html"
			}
		}
	);
});

export default app;
