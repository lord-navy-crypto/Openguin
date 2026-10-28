import test from "node:test";
import assert from "node:assert/strict";
import {inspectCsp,inspectSecurityTxt,inspectDnsZone,inspectUrl,inspectRobotsTxt}
  from "../.network-test/defensive-mini-tools.mjs";
const codes=r=>r.findings.map(x=>x.code);
test("CSP audit reviews script allowance, duplicate directives and missing restrictions",()=>{
  const a=inspectCsp("default-src 'self'; script-src 'unsafe-inline' *; script-src 'self'");
  assert(codes(a).includes("duplicate"));
  assert(codes(a).includes("unsafe-inline"));
  assert(codes(a).includes("wildcard-script"));
  assert(codes(a).includes("object-src"));
  assert.equal(a.privacy.networkRequestsMade,false);
  const safe=inspectCsp("default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  assert(!codes(safe).includes("unsafe-inline"));
});
test("security.txt RFC 9116 requires Contact and Expires without exporting addresses",()=>{
  const now=Date.parse("2026-10-28T00:00:00Z");
  const missing=inspectSecurityTxt("Policy: https://site.example/policy",now);
  assert(codes(missing).includes("contact"));
  assert(codes(missing).includes("expires-count"));
  const good=inspectSecurityTxt("Contact: mailto:security@example.com\nExpires: 2027-10-28T00:00:00Z\nCanonical: https://example.com/.well-known/security.txt\nPolicy: https://example.com/policy",now);
  assert(!codes(good).includes("contact"));
  assert(!codes(good).includes("expires-count"));
  assert(!JSON.stringify(good).includes("security@example.com"));
  const expired=inspectSecurityTxt("Contact: https://site.example/contact\nExpires: 2022-01-01T00:00:00Z",now);
  assert(codes(expired).includes("expires-stale"));
});
test("security.txt rejects insecure canonical links without copying private target",()=>{
  const r=inspectSecurityTxt("Contact: mailto:private@example.com\nExpires: 2027-01-01T00:00:00Z\nCanonical: http://private.example/path",Date.parse("2026-01-01T00:00:00Z"));
  assert(codes(r).includes("canonical"));
  assert(!JSON.stringify(r).includes("private.example"));
});
test("DNS checks are static, distinguish SPF duplicate and do not export TXT values",()=>{
  const r=inspectDnsZone([
    'example.com. 3600 IN TXT "v=spf1 +all include:private.example"',
    'example.com. 3600 IN TXT "v=spf1 -all"',
    '_dmarc.example.com. 3600 IN TXT "v=DMARC1; p=none"'
  ].join("\n"));
  assert(codes(r).includes("spf-multiple"));
  assert(codes(r).includes("spf-permissive"));
  assert(codes(r).includes("dmarc-monitor"));
  assert.equal(r.statistics.recognizedRecords,3);
  assert(!JSON.stringify(r).includes("private.example"));
});
test("URL checker never exports credentials, queries, fragments or requested paths",()=>{
  const r=inspectUrl("http://password-user:password-secret@xn--e1afmkfd.example/private/path?api_key=SECRET#private-fragment");
  assert(codes(r).includes("credentials"));
  assert(codes(r).includes("http"));
  assert(codes(r).includes("query"));
  assert(codes(r).includes("idn"));
  for(const banned of ["password-user","password-secret","private/path","SECRET","private-fragment"])
    assert(!JSON.stringify(r).includes(banned));
  const invalid=inspectUrl("not a url");
  assert.equal(invalid.statistics.valid,false);
});
test("robots checker highlights that robots rules are not authentication",()=>{
  const r=inspectRobotsTxt("User-agent: *\nDisallow: /private/account/secret-data\nSitemap: https://site.example/sitemap.xml");
  assert(codes(r).includes("privacy"));
  assert.equal(r.statistics.disallowRules,1);
  assert(!JSON.stringify(r).includes("/private/account/secret-data"));
  assert(!JSON.stringify(r).includes("sitemap.xml"));
});
test("every mini tool is bounded and never reports online scanning",()=>{
  const handlers=[inspectCsp,inspectSecurityTxt,inspectDnsZone,inspectUrl,inspectRobotsTxt];
  for(const fn of handlers){
    assert.throws(()=>fn("a".repeat(33000)),/输入过大/);
    const r=fn("");
    assert.equal(r.privacy.networkRequestsMade,false);
    assert.equal(r.privacy.rawInputIncluded,false);
    assert(Array.isArray(r.findings));
  }
});
