import test from "node:test";
import assert from "node:assert/strict";
import {checkCors,checkCache,checkSri,checkActions} from "../.network-test/defensive-lints-v6.mjs";
const codes=r=>r.findings.map(x=>x.code);
test("CORS reports wildcard + credentials as browser incompatibility",()=>{
 const a=checkCors("Access-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true");
 assert(codes(a).includes("wildcard-creds"));
 assert.equal(a.metrics.credentialed,true);
 assert.equal(a.privacy.network,false);
});
test("explicit CORS origin needs cache variation if dynamically reflected",()=>{
 const a=checkCors("Access-Control-Allow-Origin: https://private.example\nAccess-Control-Allow-Credentials: true");
 assert(codes(a).includes("vary"));
 const b=checkCors("Access-Control-Allow-Origin: https://private.example\nVary: Accept-Encoding, Origin");
 assert(!codes(b).includes("vary"));
 assert(!JSON.stringify(a).includes("private.example"));
});
test("duplicate CORS header and null origin get separate hints",()=>{
 const a=checkCors("Access-Control-Allow-Origin: null\nAccess-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true");
 assert(codes(a).includes("origin-duplicate"));
 assert(codes(a).includes("null-creds"));
});
test("cache policies distinguish private/public/no-cache/no-store",()=>{
 const raw="Set-Cookie: secret-cookie=SUPER_PRIVATE\nCache-Control: public, max-age=300\nAuthorization: Bearer secret-token";
 const a=checkCache(raw);
 assert(codes(a).includes("shared-personal"));
 assert(!JSON.stringify(a).includes("SUPER_PRIVATE"));
 assert(!JSON.stringify(a).includes("secret-token"));
 const b=checkCache("Cache-Control: no-cache");
 assert(codes(b).includes("no-cache"));
 const c=checkCache("Set-Cookie: secret=private\nCache-Control: private, no-store");
 assert(!codes(c).includes("shared-personal"));
 assert.equal(c.metrics.noStore,true);
});
test("SRI detects missing hash, invalid digest and missing crossorigin",()=>{
 const html=[
  '<script src="https://cdn.private.example/secret.js"></script>',
  '<script src="https://cdn.private.example/other.js" integrity="sha384-notarealhash"></script>',
  '<link rel="stylesheet" href="https://cdn.private.example/theme.css" integrity="sha384-'+"A".repeat(64)+'" crossorigin="anonymous">',
  '<script src="/local.js"></script>'
 ].join("\n");
 const r=checkSri(html);
 assert.equal(r.metrics.external,3);
 assert.equal(r.metrics.missing,1);
 assert.equal(r.metrics.invalid,1);
 assert.equal(r.metrics.crossoriginMissing,1);
 for(const id of ["missing","invalid","crossorigin"])assert(codes(r).includes(id));
 assert(!JSON.stringify(r).includes("cdn.private.example"));
 assert(!JSON.stringify(r).includes("secret.js"));
});
test("SRI ignores non resource tags and knows a fixed local resource",()=>{
 const r=checkSri('<link rel="icon" href="https://example.com/icon.png"><script src="/app.js"></script>');
 assert.equal(r.metrics.external,0);
 assert.equal(r.metrics.resources,1);
});
test("Actions permissions and unpinned dependencies are advisory",()=>{
 const yaml=[
  "name: Build",
  "on:",
  "  pull_request_target:",
  "permissions: write-all",
  "jobs:",
  "  build:",
  "    steps:",
  "      - uses: actions/checkout@v4",
  "      - run: curl https://example.com/setup.sh | bash",
  "      - run: echo \${{ github.event.pull_request.title }}"
 ].join("\n");
 const r=checkActions(yaml);
 for(const id of ["write-all","triggers","unpinned","remote-shell","interpolation"])assert(codes(r).includes(id));
 assert.equal(r.metrics.unpinned,1);
 assert(!JSON.stringify(r).includes("example.com"));
});
test("Actions correctly skips relative actions and recognizes full SHA",()=>{
 const yaml="permissions: read-all\nsteps:\n  - uses: ./local\n  - uses: actions/checkout@"+("a".repeat(40));
 const r=checkActions(yaml);
 assert.equal(r.metrics.unpinned,0);
 assert(!codes(r).includes("permissions"));
});
test("all checks enforce input bounds and do not echo source",()=>{
 const funcs=[checkCors,checkCache,checkSri,checkActions];
 for(const fn of funcs){
  assert.throws(()=>fn("x".repeat(60001)),/限制/);
  const r=fn("");
  assert.equal(r.privacy.rawInput,false);
  assert.equal(r.privacy.network,false);
  assert(r.schema==="openguin-lint-v6");
 }
});
