import type { BrowserEvent, BrowserReport } from "./browser-diagnostics";
import type { OneClickResult } from "./network-one-click";

/** Compares two user-provided observations only when their timestamps overlap. */
export type CorrelationFinding = {
  code:string; priority:"high"|"medium"|"low"; title:string;
  why:string; nextStep:string;
};
export type CorrelationReport = {
  timing:"aligned"|"outdated"|"browser-only"|"no-events";
  comparedBrowserEvents:number;
  summary:string;
  findings:CorrelationFinding[];
};
const WINDOW_MS = 10*60_000;
const sourceKinds = new Set(["fetch-error","xhr-error","fetch-stall","xhr-stall"]);
const errored = (e:BrowserEvent) => sourceKinds.has(e.kind);
const isFileCode = (e:BrowserEvent)=>e.kind==="download-failed"&&/^(FILE|USER)_/.test(e.errorType||"");
const isNetworkCode = (e:BrowserEvent)=>e.kind==="download-failed"&&/^NETWORK_/.test(e.errorType||"");
const isServerCode = (e:BrowserEvent)=>e.kind==="download-failed"&&/^SERVER_/.test(e.errorType||"");

export function correlateBrowserWithOneClick(browser:BrowserReport, desktop:OneClickResult|null):CorrelationReport {
  if (!browser.events.length) return {
    timing:"no-events",comparedBrowserEvents:0,summary:"浏览器报告未包含事件；需要先在目标网页启用扩展并复现故障。",findings:[]
  };
  const testAt=desktop?Date.parse(desktop.at):NaN;
  const comparable=desktop&&Number.isFinite(testAt)?
    browser.events.filter(e=>Math.abs(e.at-testAt)<=WINDOW_MS):[];
  const aligned=!!desktop&&comparable.length>0;
  const timing:CorrelationReport["timing"]=!desktop?"browser-only":aligned?"aligned":"outdated";
  const events=aligned?comparable:browser.events;
  const findings:CorrelationFinding[]=[];
  const add=(code:CorrelationFinding["code"],priority:CorrelationFinding["priority"],
    title:string,why:string,nextStep:string)=>{
      findings.push({code,priority,title,why,nextStep});
    };
  // Browser-local evidence may be classified even when no desktop sample exists.
  const downloadFile=events.filter(isFileCode);
  if(downloadFile.length) add("file-download","high","下载失败更像本地文件/用户操作问题",
    downloadFile.length+" 次下载出现 FILE_ 或 USER_ 类错误；这些不是网络超时证据。",
    "在浏览器下载页面核对磁盘空间、目标文件夹权限和安全检查，先排除本地保存问题。");
  const downloadNetwork=events.filter(isNetworkCode);
  const downloadServer=events.filter(isServerCode);
  if(downloadServer.length) add("server-download","medium","下载来源或响应状态需要检查",
    downloadServer.length+" 次下载出现 SERVER_ 类错误，不足以证明本机网络有问题。",
    "单独检查文件来源服务器和响应状态，再与其他站点下载对照。");
  if(downloadNetwork.length) add("network-download","medium","下载链路可能异常",
    downloadNetwork.length+" 次下载出现 NETWORK_ 类错误，属于浏览器报告的传输症状。",
    "复测相同来源；若其他来源正常，排查目标服务器或路径，而非直接归因 VPN。");

  const reject=events.filter(e=>(e.kind==="fetch-response"||e.kind==="xhr-response")
    &&[401,403,429].includes(e.status??0));
  if(reject.length) add("browser-access","medium","目标网页报告 HTTP 拒绝或限流",
    reject.length+" 条 HTTP 401、403 或 429 响应表明远端已返回响应，而不是纯 DNS 超时。",
    "检查登录或访问状态。HTTP 429 应等待服务允许重试，不要持续快速请求。");
  const pageErrors=events.filter(e=>e.kind==="javascript-error"||e.kind==="unhandled-rejection");
  const renderStalls=events.filter(e=>e.kind==="long-task"||e.kind==="resource-error");
  const streams=events.filter(e=>e.kind==="stream-gap"||e.kind==="stream-error");
  const transport=events.filter(errored);
  if(aligned && desktop){
    if(transport.length && (desktop.verdict==="network-failure"||desktop.verdict==="connection-problem")) {
      add("consistent-connectivity","high","桌面和浏览器均检测到连接异常",
        "同期浏览器有 "+transport.length+" 条请求错误/等待异常，桌面诊断也发现 DNS 或 HTTPS 问题。",
        "优先排查本机网络、DNS、代理及 VPN 路径。二者同现只是关联，不代表已确定根因。");
    }
    if((pageErrors.length||renderStalls.length)&&desktop.verdict==="no-clear-problem"){
      add("page-render","high","桌面网络采样正常，但网页存在运行或渲染异常",
        "同期捕获 "+pageErrors.length+" 条脚本异常、"+renderStalls.length+" 条长任务或资源问题；桌面测试站点未见明确故障。",
        "先比较无其他浏览器扩展的配置、页面 Console 与资源加载，避免把所有卡顿归因于 VPN。");
    }
    if(streams.length && desktop.checked.httpsResponded>0){
      add("application-stream","medium","网页响应流异常与基本 HTTPS 可达性应分开排查",
        "同期出现 "+streams.length+" 条流停顿/错误，桌面采样至少有一个 HTTPS 端点响应。",
        "确认目标页面请求是否已得到 HTTP 响应，分开排查应用输出流、网络中间设备和浏览器脚本。");
    }
  } else if(transport.length) {
    add("browser-requests","medium","浏览器有请求延迟或错误线索",
      transport.length+" 条 Fetch/XHR 请求异常；缺少同期桌面采样，不能判断是否共享同一网络故障。",
      "在问题出现的同一时间运行桌面一键检测，结合 HTTPS/DNS 结果再定位。");
  }
  if(!aligned && (pageErrors.length||renderStalls.length)){
    add("page-only","low","页面资源、脚本或长任务异常",
      pageErrors.length+" 条脚本异常、"+renderStalls.length+" 条资源/主线程异常；不能据此判定网络故障。",
      "检查 Console、资源加载与浏览器配置；在复现问题时进行桌面网络对照。");
  }
  if(!aligned&&streams.length) add("stream-only","medium","浏览器检测到响应流停顿",
    streams.length+" 条流停顿/错误；缺少同期网络测量。",
    "复现时再运行桌面一键检测，区分基本可达性与响应流阶段的问题。");
  if(!findings.length) add("no-specific-symptom","low","本次可对照事件尚未给出明确故障线索",
    "浏览器监测窗口内没有触发当前规则的异常事件。",
    "如网页仍有问题，在复现时检查扩展是否正在监测目标标签页。");
  const sortPriority={high:3,medium:2,low:1};
  findings.sort((a,b)=>sortPriority[b.priority]-sortPriority[a.priority]);
  const summary=timing==="aligned"?
    "已比对一键检测前后 10 分钟内的 "+comparable.length+" 条网页事件；其他历史事件不参与同期归因。":
    timing==="outdated"?
    "浏览器事件与最近一键检测相差超过 10 分钟。以下仅分析浏览器线索，不作跨时段因果推断。":
    "尚无桌面一键检测结果。先列出浏览器自身的症状，完成同期网络测试后可进一步关联。";
  return {timing,comparedBrowserEvents:aligned?comparable.length:0,summary,findings};
}
