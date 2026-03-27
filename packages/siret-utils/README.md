# siret-utils

Validate and format French business identifiers (SIRET/SIREN) using the Luhn mod-10 algorithm.

Zero dependencies. Plain ESM JavaScript.

## What are SIRET and SIREN?

- **SIREN** - 9-digit unique identifier for a French business entity.
- **SIRET** - 14-digit identifier for a specific establishment (SIREN + 5-digit NIC code).

## Functions

### `validateSiretLuhn(siret)`

Validate a 14-digit SIRET number using the Luhn checksum.

```js
import { validateSiretLuhn } from "./index.js";

validateSiretLuhn("73282932000074"); // true
validateSiretLuhn("00000000000000"); // true (checksum valid)
validateSiretLuhn("12345678901234"); // false
validateSiretLuhn("not-a-siret");    // false
```

### `formatSiret(raw)`

Format a digit string into standard SIRET display: `XXX XXX XXX XXXXX`.

```js
import { formatSiret } from "./index.js";

formatSiret("73282932000074"); // "732 829 320 00074"
formatSiret("732 829 320 00074"); // "732 829 320 00074"
```

### `formatSiren(raw)`

Format a digit string into standard SIREN display: `XXX XXX XXX`.

```js
import { formatSiren } from "./index.js";

formatSiren("732829320"); // "732 829 320"
```

### `stripSiretFormatting(formatted)`

Remove all non-digit characters from a formatted string.

```js
import { stripSiretFormatting } from "./index.js";

stripSiretFormatting("732 829 320 00074"); // "73282932000074"
```

## Known limitation

La Poste establishments (SIREN `356000000`) use a non-standard checksum rule where the sum of all digits must be a multiple of 5 instead of 10. This edge case is not handled.

## License

Open source.
