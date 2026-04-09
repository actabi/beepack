# paypal-checkout

Zero-dependency server-side wrapper for the [PayPal Orders API](https://developer.paypal.com/docs/api/orders/v2/). Create, capture, and retrieve checkout orders with OAuth2 authentication.

Wraps: [paypal/paypal-js](https://github.com/paypal/paypal-js) (323+ stars)

## Setup

Set the required environment variables with your PayPal REST API credentials from <https://developer.paypal.com/dashboard/>.

```bash
export PAYPAL_CLIENT_ID="your-client-id"
export PAYPAL_CLIENT_SECRET="your-client-secret"
export PAYPAL_MODE="sandbox"   # or "live" for production
```

## Functions

### `generateAccessToken()`

Obtain an OAuth2 access token. Called automatically by other functions, but available for direct use.

```js
import { generateAccessToken } from './index.js';

const token = await generateAccessToken();
console.log(token.accessToken);
```

### `createOrder({ currency, amount, description?, intent?, returnUrl?, cancelUrl? })`

Create a new PayPal checkout order.

```js
import { createOrder } from './index.js';

const order = await createOrder({
  currency: 'USD',
  amount: '29.99',
  description: 'Premium subscription',
  returnUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
});
console.log(order.id, order.status);
// Find the approval link for the buyer
const approveLink = order.links.find((l) => l.rel === 'approve');
```

### `captureOrder(orderId)`

Capture payment for an order after the buyer approves it.

```js
import { captureOrder } from './index.js';

const capture = await captureOrder('ORDER_ID');
console.log(capture.status); // 'COMPLETED'
```

### `getOrder(orderId)`

Retrieve full details of an existing order.

```js
import { getOrder } from './index.js';

const order = await getOrder('ORDER_ID');
console.log(order.status, order.purchaseUnits);
```

## Error Handling

All functions return `null` on failure and log errors to `console.error`. Each request times out after 15 seconds.

## License

MIT
