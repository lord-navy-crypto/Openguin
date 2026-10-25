// Pure, deterministic browser telemetry interpretation. No network access or persistence.
// Browser-injected events are untrusted evidence; never treat them as verified causes.
export const BROWSER_REPORT_SOURCE = "openguin-network-watch" as const;

export type BrowserEvent = {
  at: number;
  kind: string;
  host: string;
  status?: number;
  durationMs?: number;
  gapMs?: number;
  errorType?: string;
  progressPercent?: number;
  readyState?: string;
  bodyChildCount?: number;
};
export type BrowserReport = {
  source: typeof BROWSER_REPORT_SOURCE;
  formatVersion: 1;
  generatedAt: string;
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
  "resource-error", "slow-resource", "javascript-error", "unhandled-rejection",
  "long-task", "download-start", "download-progress", "download-complete",
  "download-failed", "download-stall"
]);
const RE_HOST = /^[a-z0-9.-]{1,120}$/i;
const RE_ERROR = /^[A-Za-z][A-Za-z0-9_-]{0,59}$/;
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
    const at = bounded(entry.at);
    if (at === undefined || at < 1_000_000_000_000) continue;
    const event: BrowserEvent = { at, kind: entry.kind, host: entry.host.toLowerCase() };
    for (const field of ["durationMs", "gapMs", "status", "progressPercent", "bodyChildCount"] as const) {
      const numeric = bounded(entry[field]);
      if (numeric !== undefined) event[field] = numeric;
    }
    if (typeof entry.errorType === "string" && RE_ERROR.test(entry.errorType)) event.errorType = entry.errorType;
    if (typeof entry.readyState === "string" && ["loading", "interactive", "complete"].includes(entry.readyState)) {
      event.readyState = entry.readyState;
    }
    events.push(event);
  }
  return { source: BROWSER_REPORT_SOURCE, formatVersion: 1, generatedAt: input.generatedAt, events: events.sort((a,b) => a.at-b.at) };
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
      id: "transport", label: "请求传输失败", severity: "high",
      evidence: "页面捕获到 Fetch/XHR 网络错误，不能仅据此确定是 VPN 问题。",
      nextStep: "结合桌面端 DNS、HTTPS 结果区分解析失败、路由/TLS 问题和服务本身异常。",
      match: e => e.kind === "fetch-error" || e.kind === "xhr-error"
    },
    {
      id: "stream", label: "响应流停顿或出错", severity: "medium",
      evidence: "响应流读取期间出现较长的无数据间隔或读流异常。",
      nextStep: "如果请求已返回 HTTP 200，但答案迟迟不显示，可检查响应流与页面脚本错误，重复测试判断是否偶发。",
      match: e => e.kind === "stream-gap" || e.kind === "stream-error"
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
