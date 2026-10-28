import test from "node:test";
import assert from "node:assert/strict";
import {auditSetCookies,auditDependencies,auditSecretExposure,auditFileSignature}
 from "../.network-test/defensive-auditors-v5.mjs";
const ids=(r)=>r.findings.map(x=>x.id);
test("Cookie review checks Secure, HttpOnly, SameSite and prefix rules without leaking values",()=>{
 const input=[
 "Set-Cookie: __Host-session=EXAMPLE_SUPER_SECRET_VALUE; Path=/; HttpOnly",
 "Set-Cookie: __Secure-other=ANOTHER_SECRET_VALUE; SameSite=None",
 "Set-Cookie: regular=SECRET_THREE; Secure; HttpOnly; SameSite=Lax"
 ].join("\n");
 const a=auditSetCookies(input);
 assert.equal(a.stats.valid,3);
 for(const id of ["secure","samesite","none-secure","prefix","httponly"])
  assert(ids(a).includes(id));
 const serialized=JSON.stringify(a);
 for(const secret of ["EXAMPLE_SUPER_SECRET_VALUE","ANOTHER_SECRET_VALUE","SECRET_THREE","__Host-session"])
  assert(!serialized.includes(secret));
 assert.equal(a.privacy.network,false);
});
test("Cookie review handles valid __Host- and ignores Cookie request headers",()=>{
 const a=auditSetCookies("Set-Cookie: __Host-session=REDACTED; Secure; Path=/; HttpOnly; SameSite=Strict");
 assert.equal(a.stats.prefixBad,0);
 assert.equal(a.stats.secureMissing,0);
 assert.equal(a.findings.length,0);
 assert.equal(auditSetCookies("Cookie: abc=123").stats.valid,0);
});
test("dependency manifest flags version policies without sharing package names",()=>{
 const a=auditDependencies(JSON.stringify({
   dependencies:{"private-company-library":"^1.2.3","secret-git-library":"git+https://private.example/internal"},
   devDependencies:{"local-lib":"workspace:*","another":"1.2.3"}
 }));
 assert.equal(a.stats.declaredEntries,4);
 assert(ids(a).includes("floating"));assert(ids(a).includes("remote"));
 assert(ids(a).includes("lock"));assert(ids(a).includes("workspace"));
 const json=JSON.stringify(a);
 for(const secret of ["private-company-library","private.example","secret-git-library"])
  assert(!json.includes(secret));
});
test("lockfile detects lifecycle scripts without requiring network",()=>{
 const a=auditDependencies(JSON.stringify({
   lockfileVersion:3,packages:{"":{}, "node_modules/private":{version:"1.1.1",hasInstallScript:true}}
 }));
 assert.equal(a.stats.lockfileDetected,true);
 assert(ids(a).includes("scripts"));
 assert(!ids(a).includes("lock"));
});
test("private secret scanner only returns category counts, not matched values",()=>{
 const sample=[
 "API_KEY = sk_example_not_a_real_credential_0123456789",
 "Authorization: Bearer fakeAuthNotARealTokenABCDEFGHIJK",
 "-----BEGIN PRIVATE KEY-----",
 "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890"
 ].join("\n");
 const a=auditSecretExposure(sample);
 assert(a.stats.flaggedLines>=3);
 assert(ids(a).includes("private-key"));
 assert(ids(a).includes("auth-header"));
 assert(ids(a).includes("repo-token"));
 assert(!JSON.stringify(a).includes("sk_example_not_a_real_credential"));
 assert(!JSON.stringify(a).includes("fakeAuthNotARealToken"));
 assert(!JSON.stringify(a).includes("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
});
test("file type static signature and double extension signals avoid raw paths",()=>{
 const pdf=new Uint8Array([37,80,68,70,45,49,46,55]);
 const a=auditFileSignature("private/folder/readme.pdf.exe",pdf);
 assert.equal(a.stats.signature,"pdf");
 assert(ids(a).includes("mismatch"));
 assert(ids(a).includes("double-extension"));
 assert(!JSON.stringify(a).includes("private/folder"));
 const zip=auditFileSignature("report.docx",new Uint8Array([80,75,3,4,0,0]));
 assert.equal(zip.stats.extensionMismatch,false);
 assert.equal(zip.stats.signature,"zip");
});
test("bounded inputs and unsupported formats are handled",()=>{
 assert.throws(()=>auditSetCookies("x".repeat(24001)),/大小限制/);
 assert.throws(()=>auditDependencies("x".repeat(400001)),/大小限制/);
 assert.throws(()=>auditSecretExposure("x".repeat(120001)),/大小限制/);
 assert.throws(()=>auditFileSignature("a.bin",new Uint8Array(8193)),/8 KiB/);
 assert.throws(()=>auditDependencies("{not-json"),/JSON/);
 const unknown=auditFileSignature("sample.txt",new Uint8Array([97,98,99]));
 assert(ids(unknown).includes("unknown"));
});
