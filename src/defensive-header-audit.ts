/**
 * Offline-only HTTP response-header configuration review.
 * No requests, scans, browser access or data persistence.
 * Treat pasted headers as untrusted; never report header values that might be secrets.
 */
export type AuditFinding = {
  id: string;
  severity: "review" | "recommendation" | "pass";
  title: string;
  reason: string;
  remedy: string;
};
export type HeaderAudit = {
  parsedHeaderCount: number;
  errors: string[];
  findings: AuditFinding[];
  reviewedAt: string;
  summary: {review: number; recommendation: number; pass: number};
};
type Headers = Map<string,string[]>;
function parse(raw:string):{headers:Headers;errors:string[]}{
  const headers:Headers=new Map(),errors:string[]=[];
  if(raw.length>24000) return {headers,errors:["Input exceeds the 24 KB review limit. Paste response headers only."]};
  for(const line of raw.split(/\r?\n/)){
    if(!line.trim() || /^HTTP\/[0-9.]+\s+[0-9]{3}/i.test(line.trim())) continue;
    if(/^\s/.test(line)){errors.push("Folded/indented header line ignored.");continue;}
    const match=/^([A-Za-z][A-Za-z0-9-]{0,70}):\s*([^\r\n]{0,2048})$/.exec(line.trimEnd());
    if(!match){errors.push("One malformed or oversized line was ignored.");continue;}
    const key=match[1].toLowerCase(),existing=headers.get(key)||[];
    if(existing.length<32) existing.push(match[2].trim());
    headers.set(key,existing);
  }
  return {headers,errors:errors.slice(0,8)};
}
export function auditHttpResponseHeaders(raw:string):HeaderAudit{
  const {headers,errors}=parse(raw);
  const has=(s:string)=>headers.has(s);
  const val=(s:string)=>(headers.get(s)||[]).join("; ");
  const findings:AuditFinding[]=[];
  const add=(id: string,severity:AuditFinding["severity"],title:string,reason:string,remedy:string)=>
    findings.push({id,severity,title,reason,remedy});
  if(headers.size===0) {
    errors.push("No valid response headers found. Paste the response headers from your own website.");
  } else {
    const hsts=val("strict-transport-security");
    if(!hsts) add("hsts","recommendation","HSTS not observed","HTTPS sites can opt into HTTPS-only browser visits.","Review HSTS after confirming your HTTPS deployment and subdomains work correctly.");
    else if(!/max-age\s*=\s*[1-9]\d+/i.test(hsts)) add("hsts","review","HSTS max-age needs review","No positive max-age directive was observed.","Use a valid positive max-age after evaluating your deployment.");
    else add("hsts","pass","HSTS configured","A positive HSTS max-age directive was observed.","Verify HTTPS compatibility and expiry separately.");
    const csp=val("content-security-policy");
    if(!csp){
      add("csp","recommendation","Enforced CSP not observed","An enforced CSP limits permitted content sources on HTML pages.","Design and test a Content-Security-Policy suited to the site. Report-Only alone does not enforce.");
      if(has("content-security-policy-report-only")) add("csp-report","pass","Report-Only policy observed","A non-enforcing CSP test policy is present.","Inspect violation reports and test before enforcement.");
    } else {
      if(/\bunsafe-inline\b|\bunsafe-eval\b/i.test(csp)) add("csp","review","CSP permits high-risk script modes","This policy contains unsafe-inline or unsafe-eval; their impact depends on directives.","Review script-src, nonces and hashes before restricting production scripts.");
      else add("csp","pass","Enforced CSP observed","A Content-Security-Policy header is present.","Verify policy behavior for your specific app.");
    }
    if(!/\bnosniff\b/i.test(val("x-content-type-options"))) add("nosniff","recommendation","MIME sniffing protection not observed","X-Content-Type-Options: nosniff was not seen.","Consider nosniff with correct Content-Type headers.");
    else add("nosniff","pass","nosniff configured","The nosniff directive was observed.","Retain correct MIME types.");
    const frame=val("x-frame-options"),ancestors=/\bframe-ancestors\b/i.test(csp);
    if(!ancestors&&!/^(DENY|SAMEORIGIN)$/i.test(frame.trim()))
      add("framing","recommendation","Framing policy not observed","For interactive pages, a framing policy can limit embedding.","Consider CSP frame-ancestors or X-Frame-Options for compatible pages.");
    else add("framing","pass","Framing policy observed","CSP frame-ancestors or X-Frame-Options was observed.","Ensure any intended embedding still works.");
    const ref=val("referrer-policy");
    if(!ref) add("referrer","recommendation","Referrer-Policy not explicit","Browser defaults vary over time and may not match site requirements.","Consider strict-origin-when-cross-origin or a suitable explicit policy.");
    else add("referrer","pass","Referrer-Policy observed","A policy header is present.","Verify the directive meets your privacy requirements.");
    if(!has("permissions-policy")) add("permissions","recommendation","Permissions-Policy not observed","Pages may restrict access to selected browser capabilities.","Set only the feature restrictions relevant to your site.");
    else add("permissions","pass","Permissions-Policy present","A Permissions-Policy header was observed.","Check directives are valid and intentional.");
    const origin=val("access-control-allow-origin"),credentials=val("access-control-allow-credentials");
    if(origin.trim()==="*" && /\btrue\b/i.test(credentials))
      add("cors","review","CORS settings need review","Wildcard origin and credentials are a potentially incompatible configuration.","Review CORS origin and credential settings for the site's actual use cases.");
    const cookies=headers.get("set-cookie")||[];
    if(cookies.length){
      const insecure=cookies.filter(x=>!/(?:^|;)\s*Secure(?:;|$)/i.test(x)).length;
      const withoutHttpOnly=cookies.filter(x=>!/(?:^|;)\s*HttpOnly(?:;|$)/i.test(x)).length;
      if(insecure) add("cookies-secure","review","Cookie Secure flag review",insecure+" Set-Cookie header(s) without Secure observed.","Review whether these cookies should be HTTPS-only.");
      if(withoutHttpOnly) add("cookies-httponly","review","Cookie HttpOnly flag review",withoutHttpOnly+" Set-Cookie header(s) without HttpOnly observed.","Set HttpOnly on cookies that do not require client JavaScript access.");
    }
  }
  const summary={review:findings.filter(f=>f.severity==="review").length,recommendation:findings.filter(f=>f.severity==="recommendation").length,pass:findings.filter(f=>f.severity==="pass").length};
  return {parsedHeaderCount:[...headers.values()].reduce((n,v)=>n+v.length,0),errors,findings,reviewedAt:new Date().toISOString(),summary};
}
export function exportHeaderAudit(audit:HeaderAudit){
  return {schema:"openguin-offline-header-audit-v1",...audit,privacy:{inputHeadersIncluded:false,cookieNamesIncluded:false,cookieValuesIncluded:false,networkRequestsMade:false}};
}
