# aws-sdk-js-v3

> **AWS SDK v3 (S3 Client)** — [aws/aws-sdk-js-v3](https://github.com/aws/aws-sdk-js-v3) | 3,604 stars | Apache-2.0 license

Modularized AWS SDK for JavaScript. The @aws-sdk/client-s3 module is the standard for S3-compatible storage (AWS, MinIO, R2, etc.).

This beepack package provides integration helpers and references the official [aws/aws-sdk-js-v3](https://github.com/aws/aws-sdk-js-v3) repository.

## Installation

For production use, install the official package:

```bash
# See https://github.com/aws/aws-sdk-js-v3 for the latest install instructions
npm install aws-sdk-js-v3
```

For beepack usage:

```bash
beepack install aws-sdk-js-v3
```

## Environment Variables

```bash
AWS_ACCESS_KEY_ID=your-value-here
AWS_SECRET_ACCESS_KEY=your-value-here
AWS_REGION=your-value-here
S3_BUCKET=your-value-here
```

## Capabilities

- **S3 Upload**
- **S3 Download**
- **S3 List**
- **S3 Delete**
- **Presigned Urls**
- **Multipart Upload**

## Usage

```js
import { getSetupGuide } from "./index.js";
console.log(getSetupGuide());
```

For full API documentation and examples, visit [aws/aws-sdk-js-v3](https://github.com/aws/aws-sdk-js-v3).

## Links

- **Repository:** [aws/aws-sdk-js-v3](https://github.com/aws/aws-sdk-js-v3)
- **License:** Apache-2.0
- **Stars:** 3,604
