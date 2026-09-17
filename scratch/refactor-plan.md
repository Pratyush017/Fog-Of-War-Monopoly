1. Add `import { after } from "next/server";`
2. At line 53, extract synchronous calculations for `responseAction`.
3. Call `after(async () => { ... })` and put all the DB/broadcast logic inside it.
4. Return `NextResponse.json(...)` immediately.
