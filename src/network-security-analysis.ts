import type {BrowserEvent, BrowserReport} from "./browser-diagnostics";

/**
 * Passive, deterministic analysis of an already sanitized browser report.
 * No packet capture, probing, tracking, external calls, or background activity.
 * HTTP errors and browser timing are observations, not proof of an intrusion.
 */
export type ReviewLevel = "warning" | "notice" | "info";
export type ReviewEvent = {
  at: number;
  host: string;
  kind: string;
  status: number | null;
  durationMs: number | null;
  level: ReviewLevel;
  category: "http" | "connectivity" | "rendering" | "download" | "activity";
  explanation: string;
};
export type ReviewHost = {
  host: string;
  requestsStarted: number;
  responses: number;
  httpErrors: number;
  transportErrors: number;
  stalls: number;
  slowResponses: number;
  medianMs: number | null;
  p95Ms: number | null;
};
export type ReviewBucket = {minute: number; events: number; warnings: number};
export type NetworkSecurityReview = {
  totalEvents: number;
  firstAt: number | null;
  lastAt: number | null;
  warningCount: number;
  notices: number;
  responseCount: number;
  httpErrorCount: number;
  transportErrorCount: number;
  requestStallCount: number;
  downloadIssueCount: number;
  renderIssueCount: number;
  hostCount: number;
  medianResponseMs: number | null;
  p95ResponseMs: number | null;
  captureLimited: boolean;
  hosts: ReviewHost[];
  timeline: ReviewEvent[];
  buckets: ReviewBucket[];
  limitations: string[];
};

const isResponse = (e: BrowserEvent) => e.kind === "fetch-response" || e.kind === "xhr-response";
const isTransportError = (e: BrowserEvent) => e.kind === "fetch-error" || e.kind === "xhr-error";
const isStall = (e: BrowserEvent) => ["fetch-stall","xhr-stall","stream-gap","download-stall"].includes(e.kind);
const isDownloadIssue = (e: BrowserEvent) => ["download-failed","download-stall"].includes(e.kind);
const isRenderIssue = (e: BrowserEvent) => ["javascript-error","unhandled-rejection","resource-error","long-task"].includes(e.kind);
const validMetric = (n: number | undefined) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1e9;
const percentile = (values: number[], p: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const index = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return Math.round(sorted[index]);
};
function describe(e: BrowserEvent): Pick<ReviewEvent,"level"|"category"|"explanation"> {
  const status = e.status ?? 0;
  if (isResponse(e) && status === 429) return {level:"notice",category:"http",explanation:"HTTP 429: server reported rate limiting; not a network outage."};
  if (isResponse(e) && (status === 401 || status === 403)) return {level:"notice",category:"http",explanation:"Authentication or access response; not evidence of an attack."};
  if (isResponse(e) && status >= 500) return {level:"warning",category:"http",explanation:"Server returned a 5xx response. Compare repeated observations."};
  if (isResponse(e) && status >= 400) return {level:"notice",category:"http",explanation:"HTTP 4xx application-level response."};
  if (isTransportError(e)) return {level:"warning",category:"connectivity",explanation:"Browser reported transport failure; DNS, TLS, VPN, and server causes remain possible."};
  if (isStall(e)) return {level:"warning",category:e.kind.startsWith("download")?"download":"connectivity",explanation:"Observed request/stream/download stall; no cause established."};
  if (e.kind === "download-failed") return {level:"warning",category:"download",explanation:"Browser reported a failed or interrupted download."};
  if (e.kind === "stream-error" || e.kind === "body-read-error") return {level:"warning",category:"connectivity",explanation:"Response stream or body consumption failed."};
  if (isRenderIssue(e)) return {level:"notice",category:"rendering",explanation:"Page rendering, resource, or JavaScript issue; may be unrelated to the network."};
  if (isResponse(e) && validMetric(e.durationMs) && e.durationMs! >= 2500) return {level:"notice",category:"http",explanation:"Response took at least 2.5 seconds."};
  return {level:"info",category:isResponse(e)?"http":"activity",explanation:"Observed browser activity."};
}

export function buildNetworkSecurityReview(report: BrowserReport): NetworkSecurityReview {
  const events = [...report.events].sort((a,b) => a.at-b.at);
  const hostMap = new Map<string, ReviewHost & {durations:number[]}>();
  const buckets = new Map<number, ReviewBucket>();
  const timeline: ReviewEvent[] = [];
  const allResponses: number[] = [];
  let warnings=0, notices=0, responseCount=0, httpErrors=0;
  let transportErrors=0, stalls=0, downloadIssues=0, renderIssues=0;
  for (const e of events) {
    const host = e.host || "unknown";
    let h = hostMap.get(host);
    if (!h) {
      h = {host,requestsStarted:0,responses:0,httpErrors:0,transportErrors:0,stalls:0,slowResponses:0,medianMs:null,p95Ms:null,durations:[]};
      hostMap.set(host,h);
    }
    const info=describe(e);
    if (info.level==="warning") warnings++;
    if (info.level==="notice") notices++;
    const started=e.kind==="fetch-start"||e.kind==="xhr-start";
    if (started) h.requestsStarted++;
    if (isResponse(e)) {
      responseCount++;
      h.responses++;
      if ((e.status??0)>=400) {httpErrors++;h.httpErrors++;}
      if (validMetric(e.durationMs)) {
        allResponses.push(e.durationMs!);h.durations.push(e.durationMs!);
        if (e.durationMs!>=2500) h.slowResponses++;
      }
    }
    if (isTransportError(e)) {transportErrors++;h.transportErrors++;}
    if (isStall(e)) {stalls++;h.stalls++;}
    if (isDownloadIssue(e)) downloadIssues++;
    if (isRenderIssue(e)) renderIssues++;
    const item: ReviewEvent={
      at:e.at,host,kind:e.kind,status:validMetric(e.status)?e.status!:null,
      durationMs:validMetric(e.durationMs)?e.durationMs!:null,...info
    };
    timeline.push(item);
    const minute=Math.floor(e.at/60000)*60000;
    let b=buckets.get(minute);
    if (!b) {b={minute,events:0,warnings:0};buckets.set(minute,b);}
    b.events++;
    if (info.level==="warning") b.warnings++;
  }
  const hosts=Array.from(hostMap.values()).map(({durations,...h})=>({
    ...h,medianMs:percentile(durations,.5),p95Ms:percentile(durations,.95)
  })).sort((a,b)=>(b.transportErrors+b.httpErrors+b.stalls)-(a.transportErrors+a.httpErrors+a.stalls)||b.responses-a.responses||a.host.localeCompare(b.host));
  return {
    totalEvents:events.length,
    firstAt:events.length?events[0].at:null,lastAt:events.length?events[events.length-1].at:null,
    warningCount:warnings,notices,responseCount,httpErrorCount:httpErrors,
    transportErrorCount:transportErrors,requestStallCount:stalls,
    downloadIssueCount:downloadIssues,renderIssueCount:renderIssues,
    hostCount:hosts.length,medianResponseMs:percentile(allResponses,.5),
    p95ResponseMs:percentile(allResponses,.95),
    captureLimited:Boolean(report.quality?.droppedEvents||report.quality?.eventCapReached),
    hosts,timeline,buckets:Array.from(buckets.values()).sort((a,b)=>a.minute-b.minute),
    limitations:[
      "Only the explicitly activated browser tab and separately authorized downloads are visible.",
      "HTTP status, rendering errors, and timings do not establish malware, intrusion, or VPN causality.",
      "The browser report is a bounded sampling buffer, not exhaustive network packet capture.",
      "VPN tunnel signals and HTTP probes cannot establish per-request VPN paths or ICMP packet loss."
    ]
  };
}

/** Separate sharing-oriented report: only domain and coarse event metadata; never URL paths or request IDs. */
export function buildSecurityReviewExport(review:NetworkSecurityReview) {
  return {
    schema:"openguin-passive-security-review-v2",generatedAt:new Date().toISOString(),
    summary:{
      totalEvents:review.totalEvents,firstAt:review.firstAt,lastAt:review.lastAt,
      warningCount:review.warningCount,notices:review.notices,responseCount:review.responseCount,
      httpErrorCount:review.httpErrorCount,transportErrorCount:review.transportErrorCount,
      requestStallCount:review.requestStallCount,downloadIssueCount:review.downloadIssueCount,
      renderIssueCount:review.renderIssueCount,hostCount:review.hostCount,
      medianResponseMs:review.medianResponseMs,p95ResponseMs:review.p95ResponseMs,
      captureLimited:review.captureLimited
    },
    hosts:review.hosts,
    minuteBuckets:review.buckets,
    events:review.timeline,
    limits:review.limitations,
    privacy:{
      localAnalysis:true,automaticUpload:false,
      omitted:["URLs","query strings","request identifiers","page text","prompts and answers","headers","cookies","tokens","request and response bodies","download filenames"]
    }
  };
}
function csvCell(value:unknown):string{
  const s=value==null?"":String(value);
  const escaped=/^[\s]*[=+\-@]/.test(s)?"'"+s:s;
  return /[",\r\n]/.test(escaped)?'"'+escaped.replace(/"/g,'""')+'"':escaped;
}
export function securityReviewCsv(review:NetworkSecurityReview):string {
  const keys=["at","host","kind","category","level","status","durationMs","explanation"] as const;
  const rows=[keys.join(",")];
  for(const e of review.timeline) rows.push(keys.map(k=>csvCell(e[k])).join(","));
  return "\uFEFF"+rows.join("\r\n")+"\r\n";
}
