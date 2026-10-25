// Pure, deterministic browser telemetry interpretation. No network access or persistence.
// Browser-injected events are untrusted evidence; never treat them as verified causes.
export const BROWSER_REPORT_SOURCE = "openguin-network-watch" as const;

export type BrowserEvent = {
  at: number;
  sourceAt?: number;
  bridgeDelayMs?: number;
  requestId?: string;
  kind: string;
  host: string;
  status?: number;
  durationMs?: number;
  gapMs?: number;
  bodyReadDurationMs?: number;
  headersToBodyReadMs?: number;
  errorType?: string;
  method?: string;
  path?: string;
  line?: number;
  bytes?: number;
  transferBytes?: number;
  domContentLoadedMs?: number;
  loadMs?: number;
  firstPaintMs?: number;
  firstContentfulPaintMs?: number;
  mutationCount?: number;
  bytesReceived?: number;
  totalBytes?: number;
  progressPercent?: number;
  readyState?: string;
  bodyChildCount?: number;
};
export type BrowserReport = {
  source: typeof BROWSER_REPORT_SOURCE;
  formatVersion: 1;
  generatedAt: string;
  quality?: {
    storedEventCount: number;
    exportedEventCount: number;
    duplicateEventsSuppressed: number;
    droppedEvents: number;
    eventCapReached: boolean;
    firstEventAt: number | null;
    lastEventAt: number | null;
    eventCounts: Record<string, number>;
  };
  events: BrowserEvent[];
};
export type DiagnosticFinding = {
  id: string;
  label: string;
  severity: "high" | "medium" | "low";
  evidence: string;
  nextStep: string;
  count: number;
};
const VALID_KINDS = new Set([
  "monitor-active", "monitor-started", "navigation", "render-summary",
  "render-stability", "fetch-start", "fetch-response", "fetch-error",
  "fetch-stall", "xhr-start", "xhr-response", "xhr-error", "xhr-stall",
  "stream-gap", "stream-gap-resolved", "stream-error", "stream-end",
  "body-read-complete", "body-read-error",
  "resource-error", "slow-resource", "javascript-error", "unhandled-rejection",
  "long-task", "download-start", "download-progress", "download-complete",
  "download-failed", "download-stall"
]);
const RE_HOST = /^[a-z0-9.-]{1,120}$/i;
const RE_ERROR = /^[A-Za-z][A-Za-z0-9_-]{0,59}$/;
const RE_METHOD = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;
const RE_REQUEST_ID = /^[a-z0-9_-]{1,64}$/i;
function sanitizedPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("\\") || value.length > 1000) return undefined;
  const path = value.split("?")[0].split("#")[0];
  return path.split("/").map(part =>
    part.includes("@") || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) ||
    /^\d{7,}$/.test(part) || /^[A-Za-z0-9_-]{24,}$/.test(part) || part.length > 64 ? ":id" : part
  ).join("/").slice(0,160);
}
const bounded = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(1e9, Math.max(0, value)) : undefined;

export function parseBrowserReport(raw: string): BrowserReport {
  if (raw.length > 300_000) throw new Error("报告太大，拒绝导入（最大 300 KB）。");
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error("JSON 格式错误：请复制浏览器扩展生成的诊断报告。"); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("报告必须是 JSON 对象。");
  const input = data as Record<string, unknown>;
  if (input.source !== BROWSER_REPORT_SOURCE || input.formatVersion !== 1) {
    throw new Error("报告格式不兼容：需要 Openguin Network Watch v1 诊断报告。");
  }
  if (typeof input.generatedAt !== "string" || !Number.isFinite(Date.parse(input.generatedAt))) {
    throw new Error("报告缺少有效生成时间。");
  }
  if (!Array.isArray(input.events) || input.events.length > 300) {
    throw new Error("事件列表无效或超过 300 条。");
  }
  const events: BrowserEvent[] = [];
  for (const item of input.events) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.kind !== "string" || !VALID_KINDS.has(entry.kind)) continue;
    if (typeof entry.host !== "string" || !RE_HOST.test(entry.host)) continue;
    const at = typeof entry.at === "number" && Number.isFinite(entry.at) ? entry.at : undefined;
    if (at === undefined || at < 1_000_000_000_000 || at > 9_000_000_000_000) continue;
    const event: BrowserEvent = { at, kind: entry.kind, host: entry.host.toLowerCase() };
    const sourceAt = typeof entry.sourceAt === "number" && Number.isFinite(entry.sourceAt) ? entry.sourceAt : undefined;
    const bridgeDelayMs = bounded(entry.bridgeDelayMs);
    if (sourceAt !== undefined && sourceAt >= 1_000_000_000_000 && sourceAt <= 9_000_000_000_000) event.sourceAt = sourceAt;
    if (bridgeDelayMs !== undefined && bridgeDelayMs <= 300_000) event.bridgeDelayMs = bridgeDelayMs;
    if (typeof entry.requestId === "string" && RE_REQUEST_ID.test(entry.requestId)) event.requestId = entry.requestId;
    if (typeof entry.method === "string" && RE_METHOD.test(entry.method)) event.method = entry.method;
    const path = sanitizedPath(entry.path);
    if (path) event.path = path;
    for (const field of [
      "durationMs", "gapMs", "bodyReadDurationMs", "headersToBodyReadMs", "status", "progressPercent", "bodyChildCount", "line",
      "bytes", "transferBytes", "domContentLoadedMs", "loadMs", "firstPaintMs",
      "firstContentfulPaintMs", "mutationCount", "bytesReceived", "totalBytes"
    ] as const) {
      const numeric = bounded(entry[field]);
      if (numeric !== undefined) event[field] = numeric;
    }
    if (typeof entry.errorType === "string" && RE_ERROR.test(entry.errorType)) event.errorType = entry.errorType;
    if (typeof entry.readyState === "string" && ["loading", "interactive", "complete"].includes(entry.readyState)) {
      event.readyState = entry.readyState;
    }
    events.push(event);
  }
  const rawQuality = input.quality && typeof input.quality === "object" && !Array.isArray(input.quality)
    ? input.quality as Record<string, unknown> : undefined;
  let quality: BrowserReport["quality"];
  if (rawQuality) {
    const eventCounts: Record<string, number> = {};
    if (rawQuality.eventCounts && typeof rawQuality.eventCounts === "object" && !Array.isArray(rawQuality.eventCounts)) {
      for (const [kind, count] of Object.entries(rawQuality.eventCounts as Record<string, unknown>)) {
        if (VALID_KINDS.has(kind) && typeof count === "number" && Number.isFinite(count)) eventCounts[kind] = Math.max(0, Math.min(1e9, Math.floor(count)));
      }
    }
    const timestamp = (value: unknown): number | null =>
      typeof value === "number" && Number.isFinite(value) && value >= 1_000_000_000_000 && value <= 9_000_000_000_000 ? value : null;
    quality = {
      storedEventCount: Math.max(0, Math.min(1e9, Math.floor(bounded(rawQuality.storedEventCount) ?? events.length))),
      exportedEventCount: Math.max(0, Math.min(1e9, Math.floor(bounded(rawQuality.exportedEventCount) ?? events.length))),
      duplicateEventsSuppressed: Math.max(0, Math.floor(bounded(rawQuality.duplicateEventsSuppressed) ?? 0)),
      droppedEvents: Math.max(0, Math.floor(bounded(rawQuality.droppedEvents) ?? 0)),
      eventCapReached: rawQuality.eventCapReached === true,
      firstEventAt: timestamp(rawQuality.firstEventAt),
      lastEventAt: timestamp(rawQuality.lastEventAt),
      eventCounts
    };
  }
  return { source: BROWSER_REPORT_SOURCE, formatVersion: 1, generatedAt: input.generatedAt, ...(quality ? { quality } : {}), events: events.sort((a,b) => a.at-b.at) };
}

export function analyzeBrowserReport(report: BrowserReport): DiagnosticFinding[] {
  const events = report.events;
  const rows: Array<Omit<DiagnosticFinding, "count"> & { match: (event: BrowserEvent)=>boolean }> = [
    {
      id: "downloads", label: "下载失败或中断", severity: "high",
      evidence: "浏览器报告下载中断，可能涉及磁盘空间、文件权限、服务器或网络。",
      nextStep: "先查看失败代码；FILE_ 开头优先检查存储/权限，NETWORK_ 开头检查连接，SERVER_ 开头检查来源服务器。",
      match: e => e.kind === "download-failed"
    },
    {
      id: "download-stall", label: "下载停滞", severity: "medium",
      evidence: "浏览器采样到连续约 60 秒没有下载字节进展。",
      nextStep: "确认并非手动暂停；对比同一文件来源在 VPN 开启/关闭时的表现，检查浏览器下载列表。",
      match: e => e.kind === "download-stall"
    },
    {
      id: "no-headers", label: "请求长时间无响应头", severity: "high",
      evidence: "Fetch/XHR 请求在 15 秒内没有完成响应阶段。",
      nextStep: "先比较 DNS 与 HTTPS 可达性；DNS 正常但请求停顿时，再比较 VPN 路由、代理及目标服务状态。",
      match: e => e.kind === "fetch-stall" || e.kind === "xhr-stall"
    },
    {
      id: "timeout", label: "请求超时", severity: "high",
      evidence: "浏览器明确报告请求以 TimeoutError 结束。超时可能来自网络、服务端、客户端超时设置或中间代理。",
      nextStep: "对照同一请求的开始、停滞和结束事件；比较相同端点的重复结果，并结合 DNS/HTTPS 与 VPN 样本判断。",
      match: e => (e.kind === "fetch-error" || e.kind === "xhr-error") && e.errorType === "TimeoutError"
    },
    {
      id: "cancelled", label: "请求被取消", severity: "low",
      evidence: "请求以 AbortError 结束。取消可能是页面导航、用户操作或应用主动取消，不等同于网络故障。",
      nextStep: "检查是否紧邻页面导航或新请求；只有非预期取消反复发生时，才继续追查页面脚本或连接问题。",
      match: e => (e.kind === "fetch-error" || e.kind === "xhr-error") && e.errorType === "AbortError"
    },
    {
      id: "transport", label: "请求传输失败", severity: "high",
      evidence: "页面捕获到 Fetch/XHR 网络错误，不能仅据此确定是 VPN 问题。",
      nextStep: "结合桌面端 DNS、HTTPS 结果区分解析失败、路由/TLS 问题和服务本身异常。",
      match: e => (e.kind === "fetch-error" || e.kind === "xhr-error") && !["AbortError","TimeoutError"].includes(e.errorType ?? "")
    },
    {
      id: "stream", label: "响应流停顿或出错", severity: "medium",
      evidence: "响应流读取期间出现较长的无数据间隔或读流异常。",
      nextStep: "如果请求已返回 HTTP 200，但答案迟迟不显示，可检查响应流与页面脚本错误，重复测试判断是否偶发。",
      match: e => e.kind === "stream-gap" || e.kind === "stream-gap-resolved" || e.kind === "stream-error"
    },
    {
      id: "slow-response", label: "网页请求响应较慢", severity: "medium",
      evidence: "Fetch/XHR 已收到响应，但响应阶段耗时达到 2.5 秒或更长。此指标不能单独区分网络、服务端或浏览器等待。",
      nextStep: "按域名和路径比较多次响应耗时；同时查看 DNS/HTTPS 与 VPN 对照结果。若只有某个 API 慢，不要直接判定整个网络变慢。",
      match: e => (e.kind === "fetch-response" || e.kind === "xhr-response") && (e.durationMs ?? 0) >= 2500
    },
    {
      id: "body-read-error", label: "响应正文读取失败", severity: "medium",
      evidence: "请求收到响应后，页面调用 text/json/arrayBuffer/blob/formData 读取正文时失败。正文内容不会被读取或保存。",
      nextStep: "查看同一 request ID 的 HTTP 状态和响应耗时；如果状态为 2xx，继续检查响应流、页面逻辑及重复出现的正文读取错误。",
      match: e => e.kind === "body-read-error"
    },
    {
      id: "slow-body-read", label: "响应正文读取较慢", severity: "low",
      evidence: "页面消费响应正文耗时达到 2.5 秒或更长。大文件、慢速消费和网络等待都可能造成此现象，不能单独判定为网络慢。",
      nextStep: "对比同一 request ID 的响应头耗时、正文读取耗时及资源大小；只有重复且跨端点一致时，再考虑网络路径问题。",
      match: e => e.kind === "body-read-complete" && (e.bodyReadDurationMs ?? 0) >= 2500
    },
    {
      id: "blocked", label: "服务端拒绝或限流", severity: "medium",
      evidence: "HTTP 401 / 403 / 429 表示服务端已响应，但请求未获得正常处理。",
      nextStep: "401/403 检查会话和访问权限；429 避免重复快速重试。这些状态不等于网络不通。",
      match: e => (e.kind === "fetch-response" || e.kind === "xhr-response") && [401,403,429].includes(e.status ?? 0)
    },
    {
      id: "server", label: "服务端返回错误", severity: "medium",
      evidence: "有 HTTP 5xx 响应，但不能判断究竟是哪一段后端服务故障。",
      nextStep: "复测并检查服务官方状态信息；同一时刻其他站点正常时，优先考虑目标服务相关原因。",
      match: e => (e.kind === "fetch-response" || e.kind === "xhr-response") && (e.status ?? 0) >= 500
    },
    {
      id: "resources", label: "页面资源加载失败", severity: "medium",
      evidence: "页面的脚本、图片或其他资源出现失败记录。",
      nextStep: "检查浏览器扩展拦截、缓存、资源所属域名的 DNS/可达性，再做重复验证。",
      match: e => e.kind === "resource-error"
    },
    {
      id: "javascript", label: "页面脚本异常", severity: "medium",
      evidence: "捕获到 JavaScript 异常或未处理的 Promise 错误。",
      nextStep: "在干净的浏览器配置下复现，并检查 Console；不能直接把脚本异常归因于网络速度。",
      match: e => e.kind === "javascript-error" || e.kind === "unhandled-rejection"
    },
    {
      id: "render", label: "页面主线程繁忙", severity: "low",
      evidence: "观察到较长的主线程任务，可能导致输入卡顿或界面不及时更新。",
      nextStep: "对比关闭额外标签页/扩展时的表现；若网络请求正常而 UI 卡住，优先排查浏览器渲染。",
      match: e => e.kind === "long-task"
    },
    {
      id: "empty-render", label: "空白页面线索", severity: "low",
      evidence: "文档标记完成，但初步观察时没有 body 子元素。这只是线索，不一定是故障。",
      nextStep: "结合导航、脚本与资源事件观察；单一 DOM 采样不足以证明网页渲染失败。",
      match: e => e.kind === "render-summary" && e.readyState === "complete" && e.bodyChildCount === 0
    }
  ];
  return rows.map(({ match, ...row }) => ({
    ...row, count: events.filter(match).length
  })).filter(row => row.count > 0).sort((a,b) => {
    const weight = { high: 3, medium: 2, low: 1 };
    return weight[b.severity]-weight[a.severity] || b.count-a.count;
  });
}

export function eventCounts(report: BrowserReport): Array<{kind:string; count:number}> {
  const counts = new Map<string,number>();
  for (const event of report.events) counts.set(event.kind,(counts.get(event.kind)||0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([kind,count])=>({kind,count}));
}

export type BrowserTelemetrySummary = {
  totalEvents: number;
  responseCount: number;
  transportErrors: number;
  requestStalls: number;
  slowResponses: number;
  medianResponseMs: number | null;
  p95ResponseMs: number | null;
  http4xx: number;
  http5xx: number;
  streamPauseEvents: number;
  maxStreamGapMs: number | null;
  bodyReadCount: number;
  bodyReadErrors: number;
  medianBodyReadMs: number | null;
  maxHeadersToBodyReadMs: number | null;
  resourceErrors: number;
  scriptErrors: number;
  longTasks: number;
  duplicateEventsSuppressed: number;
  droppedEvents: number;
  eventCapReached: boolean;
};

export function summarizeBrowserTelemetry(report: BrowserReport): BrowserTelemetrySummary {
  const events = report.events;
  const responses = events.filter(e =>
    (e.kind === "fetch-response" || e.kind === "xhr-response") &&
    typeof e.durationMs === "number"
  );
  const durations = responses.map(e => e.durationMs as number).sort((a,b)=>a-b);
  const percentile = (p:number):number|null => {
    if (!durations.length) return null;
    return durations[Math.min(durations.length-1, Math.max(0, Math.ceil(p*durations.length)-1))];
  };
  const median = ():number|null => {
    if (!durations.length) return null;
    const middle = Math.floor(durations.length/2);
    return durations.length%2 ? durations[middle] : (durations[middle-1]+durations[middle])/2;
  };
  const statuses = events.filter(e => e.kind === "fetch-response" || e.kind === "xhr-response");
  const gaps = events.filter(e => e.kind === "stream-gap" || e.kind === "stream-gap-resolved" || e.kind === "stream-error");
  const gapValues = gaps.map(e => e.gapMs).filter((n):n is number => typeof n === "number");
  const bodyReads = events.filter(e => e.kind === "body-read-complete" && typeof e.bodyReadDurationMs === "number");
  const bodyReadDurations = bodyReads.map(e => e.bodyReadDurationMs as number).sort((a,b)=>a-b);
  const bodyReadMiddle = Math.floor(bodyReadDurations.length/2);
  const medianBodyReadMs = !bodyReadDurations.length ? null :
    bodyReadDurations.length%2 ? bodyReadDurations[bodyReadMiddle] :
    (bodyReadDurations[bodyReadMiddle-1]+bodyReadDurations[bodyReadMiddle])/2;
  const headersToBodyRead = bodyReads.map(e=>e.headersToBodyReadMs).filter((n):n is number=>typeof n==="number");
  return {
    totalEvents: events.length,
    responseCount: responses.length,
    transportErrors: events.filter(e => e.kind === "fetch-error" || e.kind === "xhr-error").length,
    requestStalls: events.filter(e => e.kind === "fetch-stall" || e.kind === "xhr-stall").length,
    slowResponses: responses.filter(e => (e.durationMs ?? 0) >= 2500).length,
    medianResponseMs: median(),
    p95ResponseMs: percentile(0.95),
    http4xx: statuses.filter(e => (e.status ?? 0) >= 400 && (e.status ?? 0) < 500).length,
    http5xx: statuses.filter(e => (e.status ?? 0) >= 500 && (e.status ?? 0) < 600).length,
    streamPauseEvents: gaps.length,
    maxStreamGapMs: gapValues.length ? Math.max(...gapValues) : null,
    bodyReadCount: bodyReads.length,
    bodyReadErrors: events.filter(e=>e.kind==="body-read-error").length,
    medianBodyReadMs,
    maxHeadersToBodyReadMs: headersToBodyRead.length ? Math.max(...headersToBodyRead) : null,
    resourceErrors: events.filter(e => e.kind === "resource-error").length,
    scriptErrors: events.filter(e => e.kind === "javascript-error" || e.kind === "unhandled-rejection").length,
    longTasks: events.filter(e => e.kind === "long-task").length,
    duplicateEventsSuppressed: report.quality?.duplicateEventsSuppressed ?? 0,
    droppedEvents: report.quality?.droppedEvents ?? 0,
    eventCapReached: report.quality?.eventCapReached ?? false
  };
}


export type BrowserEndpointSummary = {
  host: string;
  path: string;
  method: string;
  requestStarts: number;
  responseCount: number;
  errorCount: number;
  stallCount: number;
  http4xx: number;
  http5xx: number;
  slowResponses: number;
  medianResponseMs: number | null;
  p95ResponseMs: number | null;
  maxResponseMs: number | null;
};

export function summarizeBrowserEndpoints(report: BrowserReport): BrowserEndpointSummary[] {
  type Mutable = {
    host:string; path:string; method:string; requestStarts:number; responseCount:number;
    errorCount:number; stallCount:number; http4xx:number; http5xx:number;
    slowResponses:number; durations:number[];
  };
  const groups = new Map<string,Mutable>();
  for (const event of report.events) {
    if (!["fetch-start","fetch-response","fetch-error","fetch-stall","xhr-start","xhr-response","xhr-error","xhr-stall"].includes(event.kind)) continue;
    const host = event.host;
    const path = event.path || "/";
    const method = event.method || "—";
    const key = [host,method,path].join("\u0000");
    let row = groups.get(key);
    if (!row) {
      row = {host,path,method,requestStarts:0,responseCount:0,errorCount:0,stallCount:0,http4xx:0,http5xx:0,slowResponses:0,durations:[]};
      groups.set(key,row);
    }
    if (event.kind === "fetch-start" || event.kind === "xhr-start") row.requestStarts++;
    if (event.kind === "fetch-error" || event.kind === "xhr-error") row.errorCount++;
    if (event.kind === "fetch-stall" || event.kind === "xhr-stall") row.stallCount++;
    if (event.kind === "fetch-response" || event.kind === "xhr-response") {
      row.responseCount++;
      if ((event.status ?? 0) >= 400 && (event.status ?? 0) < 500) row.http4xx++;
      if ((event.status ?? 0) >= 500 && (event.status ?? 0) < 600) row.http5xx++;
      if (typeof event.durationMs === "number") {
        row.durations.push(event.durationMs);
        if (event.durationMs >= 2500) row.slowResponses++;
      }
    }
  }
  const percentile = (values:number[], p:number):number|null => {
    if (!values.length) return null;
    return values[Math.min(values.length-1,Math.max(0,Math.ceil(p*values.length)-1))];
  };
  const median = (values:number[]):number|null => {
    if (!values.length) return null;
    const middle = Math.floor(values.length/2);
    return values.length%2 ? values[middle] : (values[middle-1]+values[middle])/2;
  };
  return [...groups.values()].map(row => {
    const durations = [...row.durations].sort((a,b)=>a-b);
    return {
      host:row.host,path:row.path,method:row.method,
      requestStarts:row.requestStarts,responseCount:row.responseCount,
      errorCount:row.errorCount,stallCount:row.stallCount,
      http4xx:row.http4xx,http5xx:row.http5xx,slowResponses:row.slowResponses,
      medianResponseMs:median(durations),
      p95ResponseMs:percentile(durations,0.95),
      maxResponseMs:durations.length?durations[durations.length-1]:null
    };
  }).sort((a,b) =>
    (b.errorCount*100+b.stallCount*100+b.http5xx*50+b.http4xx*10+b.slowResponses*5) -
    (a.errorCount*100+a.stallCount*100+a.http5xx*50+a.http4xx*10+a.slowResponses*5) ||
    (b.p95ResponseMs??0)-(a.p95ResponseMs??0) ||
    b.responseCount-a.responseCount
  );
}


export type BrowserRequestLifecycle = {
  requestId: string;
  host: string;
  path: string;
  method: string;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  outcome: "response" | "http-error" | "transport-error" | "timeout" | "cancelled" | "stalled" | "incomplete";
  status: number | null;
  stallEvents: number;
  streamPauseEvents: number;
  bodyReadErrors: number;
  eventCount: number;
};

export function summarizeBrowserRequests(report: BrowserReport): BrowserRequestLifecycle[] {
  type Mutable = {
    requestId:string; host:string; path:string; method:string;
    startedAt:number|null; finishedAt:number|null; durationMs:number|null;
    outcome:BrowserRequestLifecycle["outcome"]; status:number|null;
    stallEvents:number; streamPauseEvents:number; eventCount:number;
    terminalPriority:number;
  };
  const groups = new Map<string,Mutable>();
  const requestKinds = new Set([
    "fetch-start","fetch-response","fetch-error","fetch-stall",
    "xhr-start","xhr-response","xhr-error","xhr-stall",
    "stream-gap","stream-gap-resolved","stream-error","stream-end",
    "body-read-complete","body-read-error"
  ]);
  for (const event of report.events) {
    if (!event.requestId || !RE_REQUEST_ID.test(event.requestId) || !requestKinds.has(event.kind)) continue;
    let row = groups.get(event.requestId);
    if (!row) {
      row = {
        requestId:event.requestId,host:event.host,path:event.path||"/",method:event.method||"—",
        startedAt:null,finishedAt:null,durationMs:null,outcome:"incomplete",status:null,
        stallEvents:0,streamPauseEvents:0,bodyReadErrors:0,eventCount:0,terminalPriority:0
      };
      groups.set(event.requestId,row);
    }
    row.eventCount++;
    if (event.kind === "fetch-start" || event.kind === "xhr-start") {
      row.startedAt = row.startedAt === null ? event.at : Math.min(row.startedAt,event.at);
    }
    if (event.kind === "fetch-stall" || event.kind === "xhr-stall") {
      row.stallEvents++;
      if (row.terminalPriority === 0) row.outcome = "stalled";
    }
    if (event.kind === "stream-gap" || event.kind === "stream-gap-resolved" || event.kind === "stream-error") {
      row.streamPauseEvents++;
    }
    if (event.kind === "body-read-error") row.bodyReadErrors++;
    const terminal = event.kind === "fetch-response" || event.kind === "xhr-response" ||
      event.kind === "fetch-error" || event.kind === "xhr-error";
    if (terminal) {
      const isError = event.kind === "fetch-error" || event.kind === "xhr-error";
      const priority = isError ? 3 : 2;
      if (priority >= row.terminalPriority) {
        row.terminalPriority = priority;
        row.finishedAt = event.at;
        row.durationMs = typeof event.durationMs === "number" ? event.durationMs :
          (row.startedAt === null ? null : Math.max(0,event.at-row.startedAt));
        row.status = typeof event.status === "number" ? event.status : null;
        row.outcome = isError
          ? event.errorType === "TimeoutError" ? "timeout" : event.errorType === "AbortError" ? "cancelled" : "transport-error"
          : ((event.status ?? 0) >= 400 ? "http-error" : "response");
      }
    }
  }
  return [...groups.values()].map(({terminalPriority,...row})=>row).sort((a,b)=>{
    const weight:Record<BrowserRequestLifecycle["outcome"],number> = {
      "transport-error":6,"timeout":5,"http-error":4,"stalled":3,"incomplete":2,"cancelled":1,"response":0
    };
    return weight[b.outcome]-weight[a.outcome] ||
      (b.durationMs??0)-(a.durationMs??0) ||
      b.streamPauseEvents-a.streamPauseEvents;
  });
}
