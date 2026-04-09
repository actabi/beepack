# tus-js-client

> **tus.js Resumable Upload Client** — [tus/tus-js-client](https://github.com/tus/tus-js-client) | 2,558 stars | MIT license

A pure JavaScript client for the tus resumable upload protocol. Uploads resume after network interruptions.

This beepack package provides integration helpers and references the official [tus/tus-js-client](https://github.com/tus/tus-js-client) repository.

## Installation

For production use, install the official package:

```bash
# See https://github.com/tus/tus-js-client for the latest install instructions
npm install tus-js-client
```

For beepack usage:

```bash
beepack install tus-js-client
```

## Environment Variables

```bash
TUS_ENDPOINT=your-value-here
```

## Capabilities

- **Resumable Upload**
- **Chunk Upload**
- **Progress Tracking**
- **Upload Resume**
- **Parallel Uploads**

## Usage

```js
import { getSetupGuide } from "./index.js";
console.log(getSetupGuide());
```

For full API documentation and examples, visit [tus/tus-js-client](https://github.com/tus/tus-js-client).

## Links

- **Repository:** [tus/tus-js-client](https://github.com/tus/tus-js-client)
- **License:** MIT
- **Stars:** 2,558
