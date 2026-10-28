import test from "node:test";
import assert from "node:assert/strict";
import {auditHttpResponseHeaders,exportHeaderAudit} from "../.network-test/defensive-header-audit.mjs";

test("empty input is explained rather than given an artificial security score",()=>{
  const result=auditHttpResponseHeaders("");
  assert.equal(result.parsedHeaderCount,0);
  assert.equal(result.findings.length,0);
  assert(result.errors.length>0);
});

test("standard response headers are recognized case-insensitively",()=>{
  const r=auditHttpResponseHeaders([
    "HTTP/2 200",
    "Strict-Transport-Security: max-age=31536000",
    "CONTENT-SECURITY-POLICY: default-src 'self'; frame-ancestors 'none'",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Permissions-Policy: camera=()"
  ].join("\r\n"));
  assert.equal(r.parsedHeaderCount,5);
  assert.equal(r.summary.review,0);
  assert.equal(r.summary.recommendation,0);
  assert(r.summary.pass>=5);
});

test("CSP report-only is not reported as enforced CSP",()=>{
  const r=auditHttpResponseHeaders("Content-Security-Policy-Report-Only: default-src 'self'");
  assert(r.findings.some(f=>f.id==="csp"&&f.severity==="recommendation"));
  assert(r.findings.some(f=>f.id==="csp-report"&&f.severity==="pass"));
});

test("cookie values and request secrets never enter the exported audit",()=>{
  const secret="never-export-this-cookie";
  const r=auditHttpResponseHeaders([
    "Content-Type: text/html",
    "Set-Cookie: session="+secret+"; SameSite=Lax"
  ].join("\n"));
  const safe=JSON.stringify(exportHeaderAudit(r));
  assert(!safe.includes(secret));
  assert(!safe.includes("session="));
  assert.equal(r.findings.some(f=>f.id==="cookies-secure"),true);
});

test("oversized and malformed lines are rejected or noted",()=>{
  const tooLarge=auditHttpResponseHeaders("x: "+"z".repeat(24001));
  assert.equal(tooLarge.parsedHeaderCount,0);
  assert(tooLarge.errors.length>0);
  const malformed=auditHttpResponseHeaders("token-without-colon\nContent-Type: text/html");
  assert.equal(malformed.parsedHeaderCount,1);
  assert(malformed.errors.length>0);
});

test("wildcard origin with credentials is review, not verified exploit",()=>{
  const result=auditHttpResponseHeaders("Access-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true");
  assert(result.findings.some(f=>f.id==="cors"&&f.severity==="review"));
  assert(!JSON.stringify(result).toLowerCase().includes("exploitable"));
});


test("before-and-after observations distinguish fixed advice from newly raised advice",async()=>{
  const {compareHeaderAudits}=await import("../.network-test/defensive-header-audit.mjs");
  const before=auditHttpResponseHeaders("Content-Type: text/html");
  const after=auditHttpResponseHeaders("Content-Security-Policy: default-src 'self'; frame-ancestors 'none'\nStrict-Transport-Security: max-age=31536000\nX-Content-Type-Options: nosniff\nReferrer-Policy: strict-origin-when-cross-origin\nPermissions-Policy: camera=()");
  const change=compareHeaderAudits(before,after);
  assert(change.resolved.length>=3);
  assert.equal(change.introduced.length,0);
});
